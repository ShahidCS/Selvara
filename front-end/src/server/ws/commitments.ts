/* Server-only. Contractual commitments and the incident clock on the server (production programme group 4; inventory group 4, section 5).
   Admins and owners import a contract's key commitment, mark it reviewed and start or close the incident clock. Deliberate differences from
   the demonstration, decided for production:
   - The contract analysis is real: each commitment's numbers (hours, days, percentages) are compared with the matching standard term, and the
     result says whether the commitment is stricter than, the same as or looser than the standard. Nothing is invented. It stays a draft for
     legal review.
   - A commitment is marked reviewed (OK) by an admin or owner other than the person who imported it, with a note.
   - The incident clock belongs to the company: its summary, server start time and customer-notice deadline (the standard terms' breach
     notice, 48 hours) are stored. Closing it needs an outcome. Every incident stays in the history.
   - Everything is written to the company's own audit log, not to the platform's log.
   Standard terms are the shared reference catalogue (read-only). */
import seed from "@/data/trustSeed.json";
import { INCIDENT_NOTICE_H, isoDayOf, roleBlock } from "@/lib/rulesWs";
import type { Deps } from "../types";
import { invalid, missing, ok, refuse, str, txt, wsRoute, type WsHelpers } from "./common";
import type { Actor, WsTx } from "./store";

export interface Commitment { id: string; name: string; detail: string; status: "OK" | "Review"; by: string; byId: string; at: string; reviewedBy?: string; reviewNote?: string }
export interface Incident { id: string; summary: string; startedAt: number; started: string; startedBy: string; startedById: string; deadline: number; closedAt?: number; closedBy?: string; outcome?: string }
export const STANDARD_TERMS: { term: string; val: string }[] = seed.STANDARD_TERMS;
const manage = (role: string, what: string) => roleBlock(role, what, "admin", "owner");
const stamp = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";

/* What a clause is about, and how its strictness reads: hours and days are stricter when shorter, a percentage when higher. */
const TOPICS: { key: string; re: RegExp; term: string }[] = [
  { key: "Breach notice", re: /breach|notif|incident/i, term: "Breach notification" },
  { key: "Uptime", re: /uptime|availab|sla/i, term: "Uptime" },
  { key: "Data return / deletion", re: /return|delet|destroy/i, term: "Data return / deletion" },
  { key: "Sub-processor changes", re: /sub-?processor/i, term: "Sub-processor changes" },
];
const amount = (s: string): { n: number; unit: "h" | "d" | "%" } | null => {
  const m = /(\d+(?:\.\d+)?)\s*(%|h\b|hours?|d\b|days?|business days?)/i.exec(s); if (!m) return null;
  const n = Number(m[1]); const u = m[2].toLowerCase();
  return u === "%" ? { n, unit: "%" } : u.startsWith("h") ? { n, unit: "h" } : { n: n * 24, unit: "h" };
};
export function analyse(commitments: Commitment[]) {
  return commitments.map((c) => {
    const text = `${c.name} ${c.detail}`; const topic = TOPICS.find((x) => x.re.test(text));
    if (!topic) return { commitment: c.name, clause: "—", finding: "No matching standard term. Review it by hand." };
    const std = STANDARD_TERMS.find((x) => x.term === topic.term); const ours = amount(std?.val ?? ""); const theirs = amount(text);
    if (!ours || !theirs || ours.unit !== theirs.unit) return { commitment: c.name, clause: topic.key, finding: `No figure to compare. Our standard: ${std?.val ?? "—"}.` };
    const stricter = theirs.unit === "%" ? theirs.n > ours.n : theirs.n < ours.n;
    const same = theirs.n === ours.n;
    return { commitment: c.name, clause: topic.key, finding: same ? "Matches our standard term." : stricter ? `⚠ Stricter than our standard (${std!.val}). Check we can meet it.` : `Looser than our standard (${std!.val}).` };
  });
}

export function commitmentRoutes(h: WsHelpers) {
  const tx = <T,>(d: Deps, c: { actor: Actor }, w: (t: WsTx) => Promise<T>) => d.ws.tx(c.actor, d.now(), w);
  const active = async (t: WsTx) => (await t.list<Incident>("incident")).find((x) => !x.data.closedAt) ?? null;

  const data = wsRoute(h, "commitments", async (d, _r, c) => ok(await tx(d, c, async (t) => {
    const inc = await active(t);
    return {
      commitments: (await t.list<Commitment>("commitment")).map((x) => x.data).reverse(), terms: STANDARD_TERMS,
      incident: inc ? { active: true, started: inc.data.started, startedBy: inc.data.startedBy, summary: inc.data.summary, deadline: stamp(inc.data.deadline), overdue: t.now > inc.data.deadline } : { active: false, started: null },
      incidents: (await t.list<Incident>("incident")).map((x) => x.data).reverse().slice(0, 50).map((x) => ({ id: x.id, summary: x.summary, started: x.started, startedBy: x.startedBy, closed: x.closedAt ? stamp(x.closedAt) : "", closedBy: x.closedBy ?? "", outcome: x.outcome ?? "" })),
    };
  })));
  const create = wsRoute(h, "commitments", async (d, r, c) => {
    refuse(manage(c.actor.role, "importing a contract"));
    const name = txt(r.body.name, 160); if (!name) invalid("Contract name is required.");
    return tx(d, c, async (t) => {
      const id = `CM-${await t.next("commitment", 0)}`;
      await t.insert("commitment", id, { id, name, detail: txt(r.body.detail, 200) || "Imported contract", status: "Review", by: c.actor.name, byId: c.actor.id, at: isoDayOf(t.now) } satisfies Commitment);
      await t.audit("contract.imported", `${name} (${id})`, "Policy");
      return ok({ name, id });
    });
  });
  const review = wsRoute(h, "commitments", async (d, r, c) => {
    refuse(manage(c.actor.role, "reviewing a commitment"));
    const note = txt(r.body.note, 300); if (note.length < 10) invalid("Say what you checked (at least 10 characters).");
    return tx(d, c, async (t) => {
      const rec = (await t.get<Commitment>("commitment", str(r.path[2], 20))) ?? missing("Commitment"); const x = rec.data;
      if (x.status === "OK") invalid("This commitment is already reviewed.");
      if (x.byId === c.actor.id) refuse("Segregation of duties: you imported this commitment, so a different admin or owner must review it.");
      x.status = "OK"; x.reviewedBy = c.actor.name; x.reviewNote = note; await t.update("commitment", rec.id, x, rec.version);
      await t.audit("contract.reviewed", `${x.name}: ${note}`, "Policy");
      return ok(x);
    });
  });
  const analysis = wsRoute(h, "commitments", async (d, _r, c) => tx(d, c, async (t) => {
    const rows = analyse((await t.list<Commitment>("commitment")).map((x) => x.data));
    await t.audit("contract.analysis.run", `standard-terms comparison of ${rows.length} commitments`, "Policy");
    return ok(rows);
  }));
  const start = wsRoute(h, "commitments", async (d, r, c) => {
    refuse(manage(c.actor.role, "starting the incident clock"));
    return tx(d, c, async (t) => {
      if (await active(t)) invalid("An incident is already active.");
      const summary = txt(r.body.summary, 200) || "Incident";
      const id = `INC-${await t.next("incident", 0)}`;
      const x: Incident = { id, summary, startedAt: t.now, started: stamp(t.now), startedBy: c.actor.name, startedById: c.actor.id, deadline: t.now + INCIDENT_NOTICE_H * 3600_000 };
      await t.insert("incident", id, x);
      await t.audit("incident.started", `${id}: ${summary}; customer notice due by ${stamp(x.deadline)}`, "Policy");
      return ok({ active: true, started: x.started, startedBy: x.startedBy, deadline: stamp(x.deadline) });
    });
  });
  const close = wsRoute(h, "commitments", async (d, r, c) => {
    refuse(manage(c.actor.role, "closing the incident"));
    const outcome = txt(r.body.outcome, 500); if (outcome.length < 10) invalid("Describe the outcome (at least 10 characters).");
    return tx(d, c, async (t) => {
      const rec = (await active(t)) ?? invalid("There is no active incident.");
      const x = rec!.data; x.closedAt = t.now; x.closedBy = c.actor.name; x.outcome = outcome; await t.update("incident", rec!.id, x, rec!.version);
      await t.audit("incident.closed", `${x.id}: ${outcome}${t.now > x.deadline ? " (closed after the customer-notice deadline)" : ""}`, "Policy");
      return ok({ active: false });
    });
  });
  return {
    "GET ws/data/commitments": data, "POST ws/commitments": create, "POST ws/commitments/analysis": analysis, "POST ws/commitments/:id/review": review,
    "POST ws/incidents": start, "POST ws/incidents/close": close,
  };
}
