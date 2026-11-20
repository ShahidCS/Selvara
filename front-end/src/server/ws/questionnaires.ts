/* Server-only. Questionnaires on the server (production programme group 4; inventory group 4, section 3): security questionnaires customers
   send us, the answer library and the knowledge base. Admins, owners and employees work on them; sending one externally needs a reviewer who
   is an admin or owner and neither its author nor anyone who worked on it (four-eyes `q.send`); verifying a library answer publishes it to
   the Trust Center chatbot, so it is done by an admin or owner who did not write or edit it. Deliberate differences from the demonstration,
   decided for production: a questionnaire is Complete (sent) only through the review, never by answering; it is submitted for review only
   when every question is answered; the due date is a real date; library answers have ids and editing one makes it unverified again;
   knowledge-base documents are real files (the evidence store; type, size and content checked) downloaded through short-lived links. A member
   with the Vendor role sees only the questionnaires sent to them (vendors.ts). */
import { answerVerifyBlock, isoDayOf, questionnaireWorkBlock } from "@/lib/rulesWs";
import type { Deps } from "../types";
import { approvalsView, invalid, membersOf, missing, ok, refuse, str, sweepApprovals, txt, wsRoute, type WsHelpers } from "./common";
import { checkFile } from "./files";
import { pendingOf, registerFourEyes } from "./foureyes";
import type { Actor, Rec, WsTx } from "./store";
import type { VendorQuestionnaire } from "./vendors";

export interface Questionnaire { qid: string; name: string; total: number; answered: number; status: "Not started" | "In progress" | "Complete"; dueDate: string; author: string; authorId: string; editors: { id: string; name: string }[]; sentBy?: string; reviewedBy?: string }
export interface Answer { id: string; q: string; a: string; verified: boolean; uses: number; author: string; authorId: string; editedBy?: string; editedById?: string; verifiedBy?: string; verifiedById?: string }
export interface KbDoc { id: string; name: string; type: string; size: number; path: string; by: string; at: string }
export const Q_KINDS = ["q.send"];
const fmt = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : iso || "TBD");
export const qView = (q: Questionnaire, pending: { id: string; payload: Record<string, unknown> }[]) => ({
  ...q, prog: `${q.answered} / ${q.total}`, due: q.status === "Complete" ? "Submitted" : fmt(q.dueDate), editors: q.editors.map((e) => e.name),
  pendingSend: pending.find((a) => a.payload.qid === q.qid)?.id,
});
async function load(t: WsTx, id: string): Promise<Rec<Questionnaire>> { return (await t.get<Questionnaire>("questionnaire", str(id, 20))) ?? missing("Questionnaire"); }
const editor = (q: Questionnaire, a: Actor) => { if (!q.editors.some((e) => e.id === a.id)) q.editors.push({ id: a.id, name: a.name }); };

registerFourEyes("q.send", { mod: "questionnaires", apply: async (_d, t, a, by) => {
  const rec = await load(t, String(a.payload.qid)); const q = rec.data;
  if (q.status === "Complete") invalid("This questionnaire has already been sent.");
  q.status = "Complete"; q.sentBy = a.requestedByName; q.reviewedBy = by; await t.update("questionnaire", rec.id, q, rec.version);
  await t.audit("questionnaire.completed", `${q.name} (sent externally; author ${q.author}; reviewed by ${by})`, "Vendor");
} });

export function questionnaireRoutes(h: WsHelpers) {
  const tx = <T,>(d: Deps, c: { actor: Actor }, w: (t: WsTx) => Promise<T>) => d.ws.tx(c.actor, d.now(), w);
  const work = (fn: (d: Deps, t: WsTx, rec: Rec<Questionnaire>, b: Record<string, unknown>) => Promise<unknown>) => wsRoute(h, "questionnaires", async (d, r, c) => {
    refuse(questionnaireWorkBlock(c.actor.role));
    return tx(d, c, async (t) => { await sweepApprovals(t, Q_KINDS); const rec = await load(t, r.path[2]); return ok(await fn(d, t, rec, r.body)); });
  });

  const data = wsRoute(h, "questionnaires", async (d, _r, c) => ok(await tx(d, c, async (t) => {
    const assigned = (await t.list<VendorQuestionnaire>("vendor-questionnaire")).map((x) => x.data).filter((x) => x.contactId === c.actor.id).reverse();
    if (questionnaireWorkBlock(c.actor.role)) return { questionnaires: [], answers: [], docs: [], approvals: [], assigned, filesConfigured: false }; // the Vendor role: only what was sent to them
    await sweepApprovals(t, Q_KINDS);
    const names = new Map((await membersOf(d, c.actor)).map((m) => [m.id, m.name])); const pending = await pendingOf(t, Q_KINDS);
    return {
      questionnaires: (await t.list<Questionnaire>("questionnaire")).map((x) => qView(x.data, pending)).reverse(),
      answers: (await t.list<Answer>("answer")).map((x) => x.data).reverse(),
      docs: (await t.list<KbDoc>("kb-doc")).map((x) => x.data).reverse(),
      approvals: await approvalsView(t, Q_KINDS, names), assigned, filesConfigured: d.files.configured,
    };
  })));
  const create = wsRoute(h, "questionnaires", async (d, r, c) => {
    refuse(questionnaireWorkBlock(c.actor.role));
    const name = txt(r.body.name, 160); if (!name) invalid("Name is required.");
    const total = Math.trunc(Number(r.body.total)); if (!Number.isFinite(total) || total < 1 || total > 100000) invalid("Enter the number of questions (1 to 100,000).");
    const due = txt(r.body.due, 10); if (due && (!/^\d{4}-\d{2}-\d{2}$/.test(due) || Number.isNaN(Date.parse(due + "T00:00:00Z")))) invalid("Enter a valid due date.");
    return tx(d, c, async (t) => {
      const qid = `Q-${await t.next("questionnaire", 0)}`;
      await t.insert("questionnaire", qid, { qid, name, total, answered: 0, status: "Not started", dueDate: due, author: c.actor.name, authorId: c.actor.id, editors: [] } satisfies Questionnaire);
      await t.audit("questionnaire.imported", `${name} (${total} questions)`, "Vendor");
      return ok({ name, qid });
    });
  });
  const advance = work(async (_d, t, rec) => {
    const q = rec.data;
    if (q.status === "Complete") invalid("This questionnaire has already been sent.");
    if ((await pendingOf(t, Q_KINDS)).some((a) => a.payload.qid === q.qid)) invalid("This questionnaire is awaiting review and cannot be edited.");
    if (q.answered >= q.total) invalid("Every question is answered. Submit it for review.");
    q.answered = Math.min(q.total, q.answered + 10); q.status = "In progress"; editor(q, t.actor); // never Complete here: sending needs the review
    await t.update("questionnaire", rec.id, q, rec.version);
    await t.audit("questionnaire.updated", `${q.name} ${q.answered} / ${q.total}`, "Vendor");
    return { a: q.answered, b: q.total };
  });
  const send = work(async (_d, t, rec) => {
    const q = rec.data;
    if (q.status === "Complete") invalid("This questionnaire has already been sent.");
    if ((await pendingOf(t, Q_KINDS)).some((a) => a.payload.qid === q.qid)) invalid("This questionnaire is already awaiting review.");
    if (q.answered < q.total) invalid("Answer every question before submitting it for review.");
    editor(q, t.actor); await t.update("questionnaire", rec.id, q, rec.version);
    await t.request({ kind: "q.send", title: `Send questionnaire "${q.name.slice(0, 100)}" externally (${q.answered} / ${q.total})`, subject: q.qid, payload: { qid: q.qid }, needs: 1,
      approverRoles: ["admin", "owner"], forbid: [q.authorId, ...q.editors.map((e) => e.id)], ttlMs: 24 * 3600_000 });
    await t.audit("questionnaire.send_requested", `${q.name} (${q.answered} / ${q.total})`, "Vendor");
    return { name: q.name, prog: `${q.answered} / ${q.total}` };
  });
  const addAnswer = wsRoute(h, "questionnaires", async (d, r, c) => {
    refuse(questionnaireWorkBlock(c.actor.role));
    const q = txt(r.body.q, 300); const a = txt(r.body.a, 2000); if (!q || !a) invalid("Question and answer are required.");
    return tx(d, c, async (t) => {
      const id = `AL-${await t.next("answer", 0)}`;
      await t.insert("answer", id, { id, q, a, verified: false, uses: 0, author: c.actor.name, authorId: c.actor.id } satisfies Answer);
      await t.audit("answer.added", q.slice(0, 40), "Vendor");
      return ok({ q, id });
    });
  });
  const editAnswer = wsRoute(h, "questionnaires", async (d, r, c) => {
    refuse(questionnaireWorkBlock(c.actor.role));
    const q = txt(r.body.q, 300); const a = txt(r.body.a, 2000); if (!q || !a) invalid("Question and answer are required.");
    return tx(d, c, async (t) => {
      const rec = (await t.get<Answer>("answer", str(r.path[2], 20))) ?? missing("Answer"); const x = rec.data;
      const was = x.verified; x.q = q; x.a = a; x.verified = false; x.editedBy = c.actor.name; x.editedById = c.actor.id; delete x.verifiedBy; delete x.verifiedById;
      await t.update("answer", rec.id, x, rec.version);
      await t.audit("answer.edited", `${q.slice(0, 40)}${was ? " (unpublished from the chatbot until verified again)" : ""}`, "Vendor");
      return ok(x);
    });
  });
  const verify = wsRoute(h, "questionnaires", async (d, r, c) => tx(d, c, async (t) => {
    const rec = (await t.get<Answer>("answer", str(r.path[2], 20))) ?? missing("Answer"); const x = rec.data;
    refuse(answerVerifyBlock(c.actor.role, x.authorId === c.actor.id || x.editedById === c.actor.id));
    if (x.verified) invalid("This answer is already verified.");
    x.verified = true; x.verifiedBy = c.actor.name; x.verifiedById = c.actor.id; await t.update("answer", rec.id, x, rec.version);
    await t.audit("answer.verified", `${x.q.slice(0, 40)} (author ${x.author}; published to the public chatbot)`, "Vendor");
    return ok(x);
  }));
  /** A knowledge-base document: the file's bytes, checked and stored privately under the company. */
  const upload = wsRoute(h, "questionnaires", async (d, r, c) => {
    refuse(questionnaireWorkBlock(c.actor.role));
    if (!d.files.configured) invalid("File storage is not set up yet. Ask your administrator to configure it.");
    const chk = checkFile(r.body.name, r.raw ?? new Uint8Array()); if ("error" in chk) invalid(chk.error);
    const f = chk as { name: string; ext: string; type: string };
    return tx(d, c, async (t) => {
      if ((await t.list("kb-doc")).length >= 500) invalid("The knowledge base holds at most 500 documents.");
      const id = `KB-${await t.next("kb-doc", 0)}`; const path = `${c.actor.tenantId}/KB/${crypto.randomUUID()}.${f.ext}`;
      await d.files.put(path, r.raw!, f.type);
      await t.insert("kb-doc", id, { id, name: f.name, type: f.ext.toUpperCase(), size: r.raw!.length, path, by: c.actor.name, at: isoDayOf(t.now) } satisfies KbDoc);
      await t.audit("kb.document.uploaded", `${f.name} (${id})`, "Vendor");
      return ok({ id, name: f.name });
    });
  });
  const link = wsRoute(h, "questionnaires", async (d, r, c) => {
    refuse(questionnaireWorkBlock(c.actor.role));
    return tx(d, c, async (t) => {
      const doc = (await t.get<KbDoc>("kb-doc", str(r.path[2], 20))) ?? missing("Document");
      const url = await d.files.link(doc.data.path, doc.data.name, 60);
      await t.audit("kb.document.downloaded", `${doc.data.name} (${doc.id})`, "Vendor");
      return ok({ url });
    });
  });
  return {
    "GET ws/data/questionnaires": data, "POST ws/questionnaires": create, "POST ws/questionnaires/:id/advance": advance, "POST ws/questionnaires/:id/send-for-review": send,
    "POST ws/answer-library": addAnswer, "POST ws/answer-library/:id": editAnswer, "POST ws/answer-library/:id/verify": verify,
    "POST ws/kb-docs": upload, "GET ws/kb-docs/:id/link": link,
  };
}
