/* Server-only. Third parties on the server (production programme group 4; inventory group 4, sections 0.8, 1 and 2A). Admins and owners keep
   the vendor inventory; a request raised from My Work becomes a vendor when a person other than the requester approves it, and a Critical one
   needs a second approver (four-eyes `vendor.request.critical`); so does the onboarding gate of a Critical vendor (`vendor.gate`); a
   tier change and a certificate waiver need an approver other than the person who requested or added the vendor (`vendor.tier`,
   `vendor.waiver`). Deliberate differences from the demonstration, decided for production: nothing is fabricated (a vendor starts with no
   certificates, findings, monitoring signals or applications); the next review is a real date (overdue worked out each day); certificates
   carry a real expiry date and become Expiring or Expired by themselves, a waiver ends on its date; findings have ids and closing one needs a
   reason, as does blocking the gate or dismissing a request; vendor names are unique; a decided request is kept with its outcome and the
   requester is told; for a Critical vendor the admin or owner who starts the approval is its first approver and a second, different
   person completes it (SOD_MATRIX: "Critical needs a second approver"; the demonstration needed three people). "Send questionnaire" sends the company's vendor questionnaire to a member with the Vendor role (the vendor's contact);
   they answer it in their own workspace, and it locks when submitted until an admin or owner reopens it with a note. People are compared by
   user id. */
import { VENDOR_CRITICAL_TTL_H, VENDOR_FINDING_SEVS, VENDOR_OUTCOMES, VENDOR_TIER_LIST, VENDOR_TIER_MONTHS, addMonthsIso, certStateOf, isoDayOf, vendorManageBlock, vendorScore } from "@/lib/rulesWs";
import seed from "@/data/trustSeed.json";
import type { Deps } from "../types";
import { approvalsView, invalid, membersOf, missing, ok, refuse, str, sweepApprovals, txt, wsRoute, type WsHelpers } from "./common";
import { pendingOf, registerFourEyes } from "./foureyes";
import type { VendorRequest } from "./insight";
import type { Actor, Rec, WsTx } from "./store";

export interface Cert { id: string; type: string; expires: string; recordedBy: string; waived?: boolean; waiver?: { approvalId: string; approvedBy: string; requestedBy: string; reason: string } }
export interface Finding { id: string; title: string; sev: string; status: "Open" | "Closed"; by: string; at: string; closedBy?: string; closeReason?: string }
export interface Vendor {
  id: string; name: string; cat: string; tier: string; score: number; status: "Active" | "In review" | "Needs evidence"; gate: "Pending" | "Approved" | "Blocked"; gateReason?: string;
  nextReview: string; certs: Cert[]; findings: Finding[]; monitoring: unknown[]; apps: unknown[];
  reassessments: { at: string; by: string; recordedBy: string; score: number; outcome: string }[];
  requestedBy?: string; requestedById?: string; addedBy?: string; addedById?: string; approvedBy?: string; data?: boolean; requestId?: string;
}
export interface VendorQuestionnaire {
  id: string; vendorId: string; vendor: string; contact: string; contactId: string; customer: string; questions: { q: string; required: boolean }[]; answers: string[];
  status: "Sent" | "Submitted" | "Reopened"; sentBy: string; sentById: string; at: string; submittedAt?: string; note?: string;
}
export const VENDOR_KINDS = ["vendor.request.critical", "vendor.gate", "vendor.tier", "vendor.waiver"];
const day = (ms: number) => isoDayOf(ms);
const fmt = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
/** "Overdue 9d" or "14 Feb 2027": the text every screen reads. */
export function vendorDueText(next: string, today: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) return next || "";
  const d = Math.round((Date.parse(next + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86400_000);
  return d < 0 ? `Overdue ${-d}d` : fmt(next);
}
const forbidOf = (v: Vendor) => [v.requestedById, v.addedById].filter((x): x is string => !!x);
async function load(t: WsTx, id: string): Promise<Rec<Vendor>> { return (await t.get<Vendor>("vendor", str(id, 40))) ?? missing("Vendor"); }
const save = (t: WsTx, rec: Rec<Vendor>) => t.update("vendor", rec.id, rec.data, rec.version);
const nameTaken = async (t: WsTx, name: string) => (await t.list<Vendor>("vendor")).some((x) => x.data.name.toLowerCase() === name.toLowerCase());

/** The vendor as the screens read it: the review due text, certificate states and the pending four-eyes markers. */
export function vendorView(v: Vendor, today: string, pending: { kind: string; id: string; payload: Record<string, unknown> }[]) {
  const mine = (kind: string) => pending.find((a) => a.kind === kind && a.payload.vendorId === v.id)?.id;
  return {
    ...v, due: vendorDueText(v.nextReview, today), certs: v.certs.map((c) => ({ ...c, status: certStateOf(c, today) })),
    gatePending: mine("vendor.gate"), tierPending: mine("vendor.tier"), waiverPending: mine("vendor.waiver"),
  };
}
async function onboard(t: WsTx, r: VendorRequest, approvedBy: string): Promise<Vendor> {
  if (await nameTaken(t, r.name)) invalid(`A vendor named ${r.name} is already in the inventory.`);
  const tier = (VENDOR_TIER_LIST as readonly string[]).includes(r.crit) ? r.crit : "Medium";
  const id = `V-${String(await t.next("vendor", 0)).padStart(3, "0")}`;
  const v: Vendor = { id, name: r.name, cat: r.cat || "General", tier, score: 70, status: "Needs evidence", gate: "Pending", nextReview: addMonthsIso(day(t.now), VENDOR_TIER_MONTHS[tier]),
    certs: [], findings: [], monitoring: [], apps: [], reassessments: [], requestedBy: r.requester, requestedById: r.requesterId, approvedBy, data: r.data, requestId: r.id };
  await t.insert("vendor", id, v);
  return v;
}
const closeRequest = async (t: WsTx, rec: Rec<VendorRequest>, status: "Approved" | "Rejected", note: string) => {
  rec.data.status = status; await t.update("vendor-request", rec.id, rec.data, rec.version);
  await t.notify(rec.data.requesterId, `Your request for the vendor ${rec.data.name} was ${status === "Approved" ? "approved" : "declined"}${note ? `: ${note.slice(0, 120)}` : ""}.`);
};

registerFourEyes("vendor.request.critical", { mod: "vendors", apply: async (_d, t, a, by) => {
  const rec = (await t.get<VendorRequest>("vendor-request", String(a.payload.reqId))) ?? missing("Vendor request");
  if (rec.data.status !== "Pending") invalid("The vendor request was already decided.");
  const both = `${a.requestedByName}, ${by}`; // the person who started the approval is the first approver
  const v = await onboard(t, rec.data, both); await closeRequest(t, rec, "Approved", "");
  await t.audit("vendor.request.approved", `${v.name} → added to inventory (Critical, approved by ${both}; requested by ${rec.data.requester})`, "Vendor");
} });
registerFourEyes("vendor.gate", { mod: "vendors", apply: async (_d, t, a, by) => {
  const rec = await load(t, String(a.payload.vendorId)); const v = rec.data;
  if (v.gate !== "Pending") invalid(`The gate is ${v.gate.toLowerCase()} now; this approval no longer applies.`);
  v.gate = "Approved"; if (v.status === "Needs evidence") v.status = "Active"; await save(t, rec);
  await t.audit("vendor.gate.approved", `${v.name} (Critical, approved by ${a.requestedByName}, ${by})`, "Vendor");
} });
registerFourEyes("vendor.tier", { mod: "vendors", apply: async (_d, t, a, by) => {
  const rec = await load(t, String(a.payload.vendorId)); const v = rec.data; const to = String(a.payload.to);
  if (!(VENDOR_TIER_LIST as readonly string[]).includes(to)) invalid("Invalid tier.");
  const from = v.tier; v.tier = to; v.nextReview = addMonthsIso(day(t.now), VENDOR_TIER_MONTHS[to]); await save(t, rec);
  await t.audit("vendor.tier.changed", `${v.name}: ${from} → ${to} (approved by ${by}; requested by ${a.requestedByName})`, "Vendor");
} });
registerFourEyes("vendor.waiver", { mod: "vendors", apply: async (_d, t, a, by) => {
  const rec = await load(t, String(a.payload.vendorId)); const v = rec.data;
  const expires = String(a.payload.expires); if (expires <= day(t.now)) invalid("The waiver's end date has passed. Request it again.");
  v.certs.push({ id: `CE-${await t.next("vendor-cert", 0)}`, type: String(a.payload.type), expires, recordedBy: a.requestedByName, waived: true, waiver: { approvalId: a.id, approvedBy: by, requestedBy: a.requestedByName, reason: String(a.payload.reason) } });
  await save(t, rec);
  await t.audit("vendor.waiver.approved", `${a.payload.type} for ${v.name} until ${expires} (approved by ${by}; ref ${a.id})`, "Vendor");
} });

export function vendorRoutes(h: WsHelpers) {
  const tx = <T,>(d: Deps, c: { actor: Actor }, w: (t: WsTx) => Promise<T>) => d.ws.tx(c.actor, d.now(), w);
  const manage = (fn: (d: Deps, t: WsTx, rec: Rec<Vendor>, b: Record<string, unknown>, p: string[]) => Promise<unknown>) => wsRoute(h, "vendors", async (d, r, c) => {
    refuse(vendorManageBlock(c.actor.role));
    return tx(d, c, async (t) => { await sweepApprovals(t, VENDOR_KINDS); const rec = await load(t, r.path[2]); return ok({ ok: true, ...((await fn(d, t, rec, r.body, r.path)) as object) }); });
  });

  const data = wsRoute(h, "vendors", async (d, _r, c) => ok(await tx(d, c, async (t) => {
    await sweepApprovals(t, VENDOR_KINDS);
    const ms = await membersOf(d, c.actor); const names = new Map(ms.map((m) => [m.id, m.name]));
    const pending = await pendingOf(t, VENDOR_KINDS); const today = day(t.now); const manager = !vendorManageBlock(c.actor.role);
    return {
      vendors: (await t.list<Vendor>("vendor")).map((x) => vendorView(x.data, today, pending)),
      requests: manager ? (await t.list<VendorRequest>("vendor-request")).map((x) => x.data).filter((x) => x.status === "Pending").reverse()
        .map((x) => ({ ...x, pendingApproval: pending.find((a) => a.kind === "vendor.request.critical" && a.payload.reqId === x.id)?.id })) : [],
      questionnaires: (await t.list<VendorQuestionnaire>("vendor-questionnaire")).map((x) => x.data),
      contacts: ms.filter((m) => m.role === "vendor").map((m) => ({ id: m.id, name: m.name })),
      approvals: await approvalsView(t, VENDOR_KINDS, names),
    };
  })));
  const reqApprove = wsRoute(h, "vendors", async (d, r, c) => {
    refuse(vendorManageBlock(c.actor.role));
    return tx(d, c, async (t) => {
      await sweepApprovals(t, VENDOR_KINDS);
      const rec = (await t.get<VendorRequest>("vendor-request", str(r.path[2], 20))) ?? missing("Request"); const q = rec.data;
      if (q.status !== "Pending") invalid("This request was already decided.");
      if ((await pendingOf(t, ["vendor.request.critical"])).some((a) => a.payload.reqId === q.id)) invalid("This request is already awaiting approval");
      if (q.requesterId === c.actor.id) refuse("Segregation of duties: you cannot approve a vendor request you raised.");
      if (q.crit === "Critical") {
        await t.request({ kind: "vendor.request.critical", title: `Onboard Critical-tier vendor ${q.name.slice(0, 80)} (${q.id})`, subject: q.id, payload: { reqId: q.id, firstApprover: c.actor.name }, needs: 1,
          approverRoles: ["admin", "owner"], forbid: [q.requesterId], ttlMs: VENDOR_CRITICAL_TTL_H * 3600_000 });
        await t.audit("vendor.request.approval_requested", `${q.name} (Critical tier, first approval by ${c.actor.name}; a second approver is needed)`, "Vendor");
        return ok({ ok: true, name: q.name, pending: true });
      }
      const v = await onboard(t, q, c.actor.name); await closeRequest(t, rec, "Approved", "");
      await t.audit("vendor.request.approved", `${v.name} → added to inventory (approved by ${c.actor.name}; requested by ${q.requester})`, "Vendor");
      return ok({ ok: true, name: v.name, pending: false, id: v.id });
    });
  });
  const reqDismiss = wsRoute(h, "vendors", async (d, r, c) => {
    refuse(vendorManageBlock(c.actor.role));
    const reason = txt(r.body.reason, 300); if (reason.length < 10) invalid("Give a reason of at least 10 characters.");
    return tx(d, c, async (t) => {
      const rec = (await t.get<VendorRequest>("vendor-request", str(r.path[2], 20))) ?? missing("Request");
      if (rec.data.status !== "Pending") invalid("This request was already decided.");
      if ((await pendingOf(t, ["vendor.request.critical"])).some((a) => a.payload.reqId === rec.id)) invalid("This request is awaiting approval; withdraw the approval first");
      await closeRequest(t, rec, "Rejected", reason);
      await t.audit("vendor.request.dismissed", `${rec.data.name}; reason: ${reason}`, "Vendor");
      return ok({ ok: true, name: rec.data.name });
    });
  });
  const create = wsRoute(h, "vendors", async (d, r, c) => {
    refuse(vendorManageBlock(c.actor.role));
    const name = txt(r.body.name, 120); if (!name) invalid("Vendor name is required.");
    const sc = String(r.body.score ?? "").trim() === "" ? 75 : vendorScore(r.body.score); if (sc === null) invalid("Enter a score between 0 and 100.");
    const tier = (VENDOR_TIER_LIST as readonly string[]).includes(String(r.body.tier)) ? String(r.body.tier) : "Medium";
    return tx(d, c, async (t) => {
      if (await nameTaken(t, name)) invalid(`A vendor named ${name} is already in the inventory.`);
      const id = `V-${String(await t.next("vendor", 0)).padStart(3, "0")}`;
      await t.insert("vendor", id, { id, name, cat: txt(r.body.cat, 80) || "General", tier, score: sc!, status: "Needs evidence", gate: "Pending", nextReview: addMonthsIso(day(t.now), VENDOR_TIER_MONTHS[tier]),
        certs: [], findings: [], monitoring: [], apps: [], reassessments: [], addedBy: c.actor.name, addedById: c.actor.id } satisfies Vendor);
      await t.audit("vendor.added", `${name}, ${tier} tier`, "Vendor");
      return ok({ ok: true, name, tier, id });
    });
  });
  const gate = manage(async (_d, t, rec, b) => {
    const v = rec.data; const decision = str(b.decision, 10);
    if (decision !== "Approved" && decision !== "Blocked") invalid("Invalid decision");
    if (decision === "Blocked") {
      const reason = txt(b.reason, 300); if (reason.length < 10) invalid("Give a reason of at least 10 characters for blocking.");
      // blocking wins: a pending Critical gate approval is withdrawn so it can never override the block
      for (const a of (await pendingOf(t, ["vendor.gate"])).filter((x) => x.payload.vendorId === v.id)) {
        await t.setApproval(a.id, "Withdrawn", `gate blocked by ${t.actor.name}`); await t.audit("approval.vendor.gate.withdrawn", `${a.title} (${a.id}); gate blocked`, "Approval");
      }
      v.gate = "Blocked"; v.gateReason = reason; v.status = "In review"; await save(t, rec);
      await t.audit("vendor.gate.blocked", `${v.name}; reason: ${reason}`, "Vendor");
      return { name: v.name, pending: false };
    }
    if (v.gate === "Approved") invalid("The onboarding gate is already approved.");
    if (forbidOf(v).includes(t.actor.id)) refuse("Segregation of duties: you requested or added this vendor, so you cannot approve its onboarding gate.");
    if ((await pendingOf(t, ["vendor.gate"])).some((a) => a.payload.vendorId === v.id)) invalid("The onboarding gate is already awaiting approval");
    if (v.tier === "Critical") {
      await t.request({ kind: "vendor.gate", title: `Approve onboarding gate for Critical-tier vendor ${v.name.slice(0, 80)}`, subject: v.id, payload: { vendorId: v.id, firstApprover: t.actor.name }, needs: 1,
        approverRoles: ["admin", "owner"], forbid: forbidOf(v), ttlMs: VENDOR_CRITICAL_TTL_H * 3600_000 });
      await t.audit("vendor.gate.approval_requested", `${v.name} (Critical tier, first approval by ${t.actor.name}; a second approver is needed)`, "Vendor");
      return { name: v.name, pending: true };
    }
    v.gate = "Approved"; delete v.gateReason; if (v.status === "Needs evidence") v.status = "Active"; await save(t, rec);
    await t.audit("vendor.gate.approved", v.name, "Vendor");
    return { name: v.name, pending: false };
  });
  const cert = manage(async (_d, t, rec, b) => {
    const v = rec.data; const type = txt(b.type, 120); if (!type) invalid("Type is required.");
    const expires = txt(b.expires, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(expires) || Number.isNaN(Date.parse(expires + "T00:00:00Z"))) invalid("Enter the certificate's expiry date.");
    v.certs.push({ id: `CE-${await t.next("vendor-cert", 0)}`, type, expires, recordedBy: t.actor.name }); await save(t, rec);
    await t.audit("vendor.cert.added", `${type} for ${v.name} (expires ${expires})`, "Vendor");
    return { type, name: v.name };
  });
  const waiver = manage(async (_d, t, rec, b) => {
    const v = rec.data; const type = txt(b.type, 120); if (!type) invalid("Type is required.");
    const reason = txt(b.reason, 300); if (reason.length < 10) invalid("Give a reason of at least 10 characters.");
    const exp = txt(b.expires, 10); const today = day(t.now);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exp) || exp <= today || exp > addMonthsIso(today, 12)) invalid("Waiver expiry must be a future date within 12 months.");
    if ((await pendingOf(t, ["vendor.waiver"])).some((a) => a.payload.vendorId === v.id)) invalid("A waiver is already awaiting approval for this vendor");
    await t.request({ kind: "vendor.waiver", title: `Waive ${type} for ${v.name.slice(0, 80)} until ${exp}`, subject: v.id, payload: { vendorId: v.id, type, reason, expires: exp }, needs: 1,
      approverRoles: ["admin", "owner"], forbid: forbidOf(v), ttlMs: 24 * 3600_000 });
    await t.audit("vendor.waiver.requested", `${type} for ${v.name}`, "Vendor");
    return { type, name: v.name };
  });
  const finding = manage(async (_d, t, rec, b) => {
    const v = rec.data; const title = txt(b.title, 300); if (!title) invalid("Finding description is required.");
    const sev = (VENDOR_FINDING_SEVS as readonly string[]).includes(String(b.sev)) ? String(b.sev) : "Medium";
    v.findings.push({ id: `VF-${await t.next("vendor-finding", 100)}`, title, sev, status: "Open", by: t.actor.name, at: day(t.now) }); await save(t, rec);
    await t.audit("vendor.finding.flagged", `${title} (${v.name})`, "Vendor");
    return { title, name: v.name };
  });
  const closeFinding = manage(async (_d, t, rec, b, p) => {
    const v = rec.data; const f = v.findings.find((x) => x.id === str(p[4], 20)) ?? missing("Finding");
    if (f.status === "Closed") invalid("The finding is already closed.");
    const reason = txt(b.reason, 300); if (reason.length < 10) invalid("Describe how it was resolved (at least 10 characters).");
    f.status = "Closed"; f.closedBy = t.actor.name; f.closeReason = reason; await save(t, rec);
    await t.audit("vendor.finding.closed", `${f.title} (${v.name}); ${reason}`, "Vendor");
    return { title: f.title };
  });
  const reassess = manage(async (_d, t, rec, b) => {
    const v = rec.data; const sc = vendorScore(b.score); if (sc === null) invalid("Enter a score between 0 and 100.");
    const out = (VENDOR_OUTCOMES as readonly string[]).includes(String(b.outcome)) ? String(b.outcome) : VENDOR_OUTCOMES[0];
    v.score = sc!; v.status = out.startsWith("Escalate") ? "In review" : "Active"; v.nextReview = addMonthsIso(day(t.now), VENDOR_TIER_MONTHS[v.tier] ?? 12);
    v.reassessments.push({ at: day(t.now), by: txt(b.by, 80) || t.actor.name, recordedBy: t.actor.name, score: sc!, outcome: out }); await save(t, rec);
    await t.audit("vendor.reassessed", `${v.name}, score ${sc}, ${out}`, "Vendor");
    return { name: v.name, score: sc, outcome: out };
  });
  const tier = manage(async (_d, t, rec, b) => {
    const v = rec.data; const to = str(b.tier, 20);
    if (!(VENDOR_TIER_LIST as readonly string[]).includes(to)) invalid("Choose a tier from the list");
    if (to === v.tier) return { changed: false, pending: false, name: v.name, from: v.tier, to };
    if ((await pendingOf(t, ["vendor.tier"])).some((a) => a.payload.vendorId === v.id)) invalid("A tier change is already awaiting approval for this vendor");
    await t.request({ kind: "vendor.tier", title: `Change tier of ${v.name.slice(0, 80)}: ${v.tier} → ${to}`, subject: v.id, payload: { vendorId: v.id, from: v.tier, to }, needs: 1,
      approverRoles: ["admin", "owner"], forbid: forbidOf(v), ttlMs: 24 * 3600_000 });
    await t.audit("vendor.tier.change_requested", `${v.name}: ${v.tier} → ${to}`, "Vendor");
    return { changed: true, pending: true, name: v.name, from: v.tier, to };
  });
  /** Sends the company's vendor questionnaire to the vendor's contact (a member with the Vendor role). */
  const sendQ = manage(async (d, t, rec, b) => {
    const v = rec.data; const ms = await membersOf(d, t.actor);
    const contact = ms.find((m) => m.id === str(b.contactId, 100) && m.role === "vendor");
    if (!contact) invalid("Choose the vendor's contact. Invite them in Team & Settings with the Vendor role first.");
    const open = (await t.list<VendorQuestionnaire>("vendor-questionnaire")).find((x) => x.data.vendorId === v.id && x.data.status !== "Submitted");
    if (open) invalid("A questionnaire is already waiting for this vendor's answers.");
    const company = (await d.dir.companiesOf(t.actor.id)).find((m) => m.company.id === t.actor.tenantId)?.company.name ?? "your customer";
    const id = `VQ-${await t.next("vendor-questionnaire", 0)}`;
    await t.insert("vendor-questionnaire", id, { id, vendorId: v.id, vendor: v.name, contact: contact!.name, contactId: contact!.id, customer: company,
      questions: seed.VENDOR_Q.map((x) => ({ q: x.q, required: x.required })), answers: seed.VENDOR_Q.map(() => ""), status: "Sent", sentBy: t.actor.name, sentById: t.actor.id, at: day(t.now) } satisfies VendorQuestionnaire);
    v.status = "In review"; await save(t, rec);
    await t.audit("vendor.questionnaire.sent", `${v.name} to ${contact!.name} (${id})`, "Vendor");
    await t.notify(contact!.id, `${t.actor.name} sent you the security questionnaire for ${v.name}.`);
    return { name: v.name, id };
  });
  /** Reopens a submitted questionnaire with a note (a clarification round). */
  const reopenQ = wsRoute(h, "vendors", async (d, r, c) => {
    refuse(vendorManageBlock(c.actor.role));
    const note = txt(r.body.note, 500); if (note.length < 10) invalid("Say what needs clarifying (at least 10 characters).");
    return tx(d, c, async (t) => {
      const rec = (await t.get<VendorQuestionnaire>("vendor-questionnaire", str(r.path[2], 20))) ?? missing("Questionnaire");
      if (rec.data.status !== "Submitted") invalid("Only a submitted questionnaire can be reopened.");
      rec.data.status = "Reopened"; rec.data.note = note; await t.update("vendor-questionnaire", rec.id, rec.data, rec.version);
      await t.audit("vendor.questionnaire.reopened", `${rec.data.vendor} (${rec.id}): ${note.slice(0, 200)}`, "Vendor");
      await t.notify(rec.data.contactId, `${c.actor.name} asked for clarification on the ${rec.data.vendor} questionnaire: ${note.slice(0, 120)}`);
      return ok({ ok: true });
    });
  });

  /* ----- the vendor's own view (role Vendor, through Questionnaires) ----- */
  const mine = async (t: WsTx, id: string, me: string) => {
    const rec = (await t.get<VendorQuestionnaire>("vendor-questionnaire", str(id, 20))) ?? missing("Questionnaire");
    if (rec.data.contactId !== me) missing("Questionnaire"); // a vendor sees only what was sent to them
    return rec;
  };
  const answer = (submit: boolean) => wsRoute(h, "questionnaires", async (d, r, c) => {
    const raw = Array.isArray(r.body.answers) ? (r.body.answers as unknown[]) : null; if (!raw) invalid("Send the answers.");
    return tx(d, c, async (t) => {
      const rec = await mine(t, r.path[2], c.actor.id); const q = rec.data;
      if (q.status === "Submitted") invalid("This questionnaire was submitted. Your customer can reopen it if they need more.");
      q.answers = q.questions.map((_, i) => txt(raw![i], 4000));
      const missingN = q.questions.filter((x, i) => x.required && !q.answers[i]).length;
      if (submit) {
        if (missingN) invalid(`${missingN} required question${missingN === 1 ? "" : "s"} still need${missingN === 1 ? "s" : ""} answers`);
        q.status = "Submitted"; q.submittedAt = day(t.now);
      }
      await t.update("vendor-questionnaire", rec.id, q, rec.version);
      if (submit) { await t.audit("vendor.questionnaire.submitted", `${q.vendor} (${q.id}) by ${c.actor.name}`, "Vendor"); await t.notify(q.sentById, `${c.actor.name} submitted the security questionnaire for ${q.vendor}.`); }
      return ok(missingN);
    });
  });

  return {
    "GET ws/data/vendors": data, "POST ws/vendors": create, "POST ws/vendor-requests/:id/approve": reqApprove, "POST ws/vendor-requests/:id/dismiss": reqDismiss,
    "POST ws/vendors/:id/gate": gate, "POST ws/vendors/:id/certificates": cert, "POST ws/vendors/:id/waivers": waiver, "POST ws/vendors/:id/findings": finding,
    "POST ws/vendors/:id/findings/:fid/close": closeFinding, "POST ws/vendors/:id/reassessments": reassess, "POST ws/vendors/:id/tier": tier, "POST ws/vendors/:id/questionnaire": sendQ,
    "POST ws/vendor-questionnaires/:id/reopen": reopenQ,
    "POST ws/vendor-questionnaires/:id/answers": answer(false), "POST ws/vendor-questionnaires/:id/submit": answer(true),
  };
}
