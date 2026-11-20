/* Server-only. Reports on the server (production programme group 3; inventory group 3, section 5): the catalogue of report packs, generated on
   demand from the company's own records (draft, for review before distribution), and distribution schedules. A schedule to people inside the
   company saves at once; any recipient outside it (not a known internal group and not an address on the company's own email domains) needs a
   different admin's approval (four-eyes request `report.distribution`) before the schedule exists. Deliberate differences from the
   demonstration, decided for production: generation produces the real pack (CSV or text) from the records, not a placeholder; the pack name and
   frequency are checked; replacing or removing a schedule that sends outside the company needs a reason and is audited; schedules have ids;
   public mail providers never count as the company's domain. Delivery is off until email is configured (programme group 8): "Next" says so. */
import { approvalBlock, reasonBlock } from "@/lib/rules";
import { REPORT_CATALOGUE, REPORT_DIST_TTL_H, REPORT_FREQS, externalRecipientsOf, isoDayOf, issueDueText, reportRoleBlock } from "@/lib/rulesWs";
import type { Deps } from "../types";
import type { Control } from "./assurance";
import type { Issue } from "./issues";
import type { AccessReview } from "./access";
import type { Grant } from "./people";
import type { Risk } from "./risk";
import { approvalsView, invalid, membersOf, missing, ok, refuse, str, sweepApprovals, txt, wsRoute, type WsHelpers } from "./common";
import type { Actor, WsTx } from "./store";

export interface Schedule { id: string; name: string; freq: string; detail: string; recip: string; next: string; external: boolean; approvedBy?: string; approvalId?: string; by: string; byId: string; at: number }
export const REPORT_KINDS = ["report.distribution"];
const PUBLIC_MAIL = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "zoho.com", "mail.com"]);
const NOT_SENT = "Not sent until email is set up";
const cell = (v: unknown) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = (head: string[], rows: unknown[][]) => [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");

/** The company's own email domains (from its members' addresses; public mail providers excluded). */
async function ownDomains(d: Deps, a: Actor) {
  const ms = await d.dir.members(a.tenantId, a.id, "Active");
  return new Set(ms.map((m) => m.email.split("@")[1]?.toLowerCase()).filter((x): x is string => !!x && !PUBLIC_MAIL.has(x)));
}
/** One report pack, built from the company's records. */
async function generate(t: WsTx, name: string): Promise<{ fileName: string; type: string; content: string }> {
  const stamp = new Date(t.now).toISOString().slice(0, 16).replace("T", " ") + " UTC"; const today = isoDayOf(t.now);
  const head = `${name} (DRAFT)\nGenerated ${stamp} by ${t.actor.name}\nRequires review and approval before distribution.\n`;
  const risks = async () => (await t.list<Risk>("risk")).map((x) => x.data);
  const controls = async () => (await t.list<Control>("control")).map((x) => x.data);
  if (name === "Risk register export") {
    const rows = (await risks()).map((r) => [r.id, r.title, r.cat, r.owner, r.l * r.i, (r.cl || r.l) * (r.ci || r.i), r.rl * r.ri, r.treat, r.status, r.review, r.acceptance?.by ?? "", r.acceptance?.until ?? "", r.reviewed]);
    return { fileName: "risk-register-export.csv", type: "text/csv", content: csv(["Risk ID", "Title", "Category", "Owner", "Inherent", "Current", "Residual", "Treatment", "Status", "Review", "Accepted by", "Accepted until", "Reviewed"], rows) };
  }
  if (name === "ISO 27001 Statement of Applicability") {
    const rows = (await controls()).filter((c) => Object.keys(c.map ?? {}).some((k) => /27001/.test(k)))
      .map((c) => [Object.entries(c.map).filter(([k]) => /27001/.test(k)).flatMap(([, v]) => v).join(" "), c.id, c.title, "Applicable", c.status, c.owner]);
    return { fileName: "iso-27001-statement-of-applicability.csv", type: "text/csv", content: csv(["ISO 27001 reference", "Control", "Title", "Applicability", "Status", "Owner"], rows) };
  }
  if (name === "Access recertification pack") {
    const reviews = (await t.list<AccessReview>("access-review")).map((x) => x.data);
    const grants = (await t.list<Grant>("grant")).map((x) => x.data);
    const rows = reviews.flatMap((rv) => rv.accounts.map((a) => [rv.id, rv.name, rv.status, a.user, a.system, a.level, a.decision || "Not decided", a.decidedBy ?? ""]));
    const active = grants.filter((g) => g.status === "Active").map((g) => ["", "Current access (no review)", "", g.user, g.system, g.level, "", ""]);
    return { fileName: "access-recertification-pack.csv", type: "text/csv", content: csv(["Review", "Name", "Review status", "Person", "System", "Level", "Decision", "Decided by"], [...rows, ...active]) };
  }
  if (name === "Vendor risk summary") {
    const vendors = (await t.list<{ name?: string; tier?: string; status?: string; nextReview?: string; score?: number; gate?: string; findings?: { status: string }[] }>("vendor")).map((x) => x.data);
    return { fileName: "vendor-risk-summary.csv", type: "text/csv", content: csv(["Vendor", "Tier", "Risk score", "Status", "Procurement gate", "Next review", "Open findings"],
      vendors.map((v) => [v.name, v.tier, v.score, v.status, v.gate, v.nextReview, (v.findings ?? []).filter((f) => f.status !== "Closed").length])) };
  }
  // Executive security posture
  const cs = await controls(); const rs = await risks(); const is = (await t.list<Issue>("issue")).map((x) => x.data);
  const open = rs.filter((r) => r.status !== "Accepted" && r.status !== "Closed");
  const above = open.filter((r) => (r.cl || r.l) * (r.ci || r.i) >= 11);
  const openIs = is.filter((i) => i.status !== "Closed");
  const overdue = openIs.filter((i) => /Overdue/.test(issueDueText(i.dueDate, today)));
  const lines = [
    head, "Controls", `  ${cs.length} adopted: ${cs.filter((c) => c.status === "Pass").length} passing, ${cs.filter((c) => c.status === "Fail").length} failing, ${cs.filter((c) => c.status === "Needs evidence").length} need evidence.`,
    "Risks", `  ${open.length} open, ${above.length} above appetite (current score 11 or more), ${rs.filter((r) => r.status === "Accepted").length} accepted, ${rs.filter((r) => r.review === "Submitted").length} awaiting approval.`,
    ...above.slice(0, 10).map((r) => `  - ${r.id} ${r.title} (current ${(r.cl || r.l) * (r.ci || r.i)}, owner ${r.owner}, ${r.treat})`),
    "Issues", `  ${openIs.length} open, ${overdue.length} overdue, ${openIs.filter((i) => i.sev === "High" || i.sev === "Critical").length} high or critical.`,
    ...overdue.slice(0, 10).map((i) => `  - ${i.id} ${i.title} (${i.sev}, owner ${i.owner}, due ${i.dueDate})`),
  ];
  return { fileName: "executive-security-posture.txt", type: "text/plain", content: lines.join("\n") + "\n" };
}

export function reportRoutes(h: WsHelpers) {
  const tx = <T,>(d: Deps, c: { actor: Actor }, w: (t: WsTx) => Promise<T>) => d.ws.tx(c.actor, d.now(), w);
  const data = wsRoute(h, "reports", async (d, _r, c) => ok(await tx(d, c, async (t) => {
    await sweepApprovals(t, REPORT_KINDS);
    const names = new Map((await membersOf(d, c.actor)).map((m) => [m.id, m.name]));
    return { reports: REPORT_CATALOGUE, schedules: (await t.list<Schedule>("report-schedule")).map((x) => x.data).reverse(), approvals: await approvalsView(t, REPORT_KINDS, names) };
  })));
  const gen = wsRoute(h, "reports", async (d, r, c) => {
    refuse(reportRoleBlock(c.actor.role));
    const name = txt(r.body.name, 120); if (!REPORT_CATALOGUE.some((x) => x.name === name)) invalid("Choose a report from the list.");
    return tx(d, c, async (t) => { const out = await generate(t, name); await t.audit("report.generated", name, "System"); return ok(out); });
  });
  const schedule = wsRoute(h, "reports", async (d, r, c) => {
    refuse(reportRoleBlock(c.actor.role));
    const name = txt(r.body.name, 120); if (!REPORT_CATALOGUE.some((x) => x.name === name)) invalid("Choose a report pack from the list.");
    const freq = str(r.body.freq, 20); if (!(REPORT_FREQS as readonly string[]).includes(freq)) invalid("Choose a frequency.");
    const detail = freq === "On demand" ? "" : txt(r.body.detail, 120); if (freq === "Custom" && !detail) invalid("Describe the custom schedule.");
    const recip = txt(r.body.recip, 300) || "—"; const why = txt(r.body.reason, 300);
    const ext = externalRecipientsOf(recip, await ownDomains(d, c.actor));
    return tx(d, c, async (t) => {
      await sweepApprovals(t, REPORT_KINDS);
      const existing = (await t.list<Schedule>("report-schedule")).find((x) => x.data.name === name);
      if (!ext.length) {
        if (existing?.data.external) { const bad = reasonBlock(why); if (bad) invalid("This pack is sent outside the company today. " + bad.replace("Give", "give")); }
        const rec: Schedule = { id: existing?.id ?? `SP-${await t.next("report-schedule", 0)}`, name, freq, detail, recip, next: freq === "On demand" ? "—" : NOT_SENT, external: false, by: c.actor.name, byId: c.actor.id, at: t.now };
        if (existing) await t.update("report-schedule", existing.id, rec, existing.version); else await t.insert("report-schedule", rec.id, rec);
        await t.audit("report.scheduled", `${name} · ${freq}${detail ? ` (${detail})` : ""}${existing?.data.external ? `; replaces external distribution; reason: ${why}` : ""}`, "System");
        return ok({ rec, pending: false });
      }
      if ((await t.approvals(REPORT_KINDS)).some((a) => a.status === "Pending" && a.expiresAt > t.now && a.payload.name === name)) invalid("A schedule for this pack is already awaiting approval.");
      const rec = { name, freq, detail, recip };
      await t.request({ kind: "report.distribution", title: `Schedule external distribution of "${name.slice(0, 80)}" (${freq}) to ${ext.join(", ").slice(0, 120)}`, subject: name,
        payload: { name, rec, external: ext }, needs: 1, approverRoles: ["admin"], forbid: [], ttlMs: REPORT_DIST_TTL_H * 3600_000 });
      await t.audit("report.schedule_requested", `${name} · ${freq} (external: ${ext.join(", ").slice(0, 200)})`, "System");
      return ok({ rec, pending: true });
    });
  });
  const remove = wsRoute(h, "reports", async (d, r, c) => {
    refuse(reportRoleBlock(c.actor.role));
    return tx(d, c, async (t) => {
      const rec = (await t.get<Schedule>("report-schedule", str(r.path[3], 20))) ?? missing("Schedule");
      const why = txt(r.body.reason, 300);
      if (rec.data.external) { const bad = reasonBlock(why); if (bad) invalid("This pack is sent outside the company. " + bad.replace("Give", "give")); }
      await t.remove("report-schedule", rec.id, rec.version);
      await t.audit("report.unscheduled", `${rec.data.name}${why ? `; reason: ${why}` : ""}`, "System");
      return ok(rec.data);
    });
  });
  /** A decision on an external distribution (approve, reject, withdraw). Approving creates or replaces the schedule. */
  const decide = wsRoute(h, "reports", async (d, r, c) => {
    const me = c.actor; const decision = r.path[3];
    if (!["approve", "reject", "withdraw"].includes(decision)) missing("Action");
    return tx(d, c, async (t) => {
      await sweepApprovals(t, REPORT_KINDS);
      const a = (await t.approval(str(r.path[2], 60), REPORT_KINDS)) ?? missing("Request");
      if (decision === "withdraw") {
        if (a.requestedBy !== me.id) refuse("Only the requester can withdraw a request.");
        if (a.status !== "Pending") invalid(`Request is ${a.status.toLowerCase()}.`);
        await t.setApproval(a.id, "Withdrawn"); await t.audit("approval.report.distribution.withdrawn", `${a.title} (${a.id})`, "Approval");
        return ok({ status: "Withdrawn" });
      }
      refuse(approvalBlock({ key: me.id, base: me.role }, { status: a.status, expiresAt: a.expiresAt, approverRoles: a.approverRoles, requestedBy: a.requestedBy, forbid: a.forbid, votes: a.votes.map((v) => v.by) }, t.now));
      const reason = txt(r.body.reason, 300); const bad = reasonBlock(reason); if (bad) invalid(bad);
      if (decision === "reject") { await t.setApproval(a.id, "Rejected", reason); await t.audit("approval.report.distribution.rejected", `${a.title} (${a.id}); reason: ${reason}`, "Approval"); return ok({ status: "Rejected" }); }
      const p = a.payload.rec as { name?: string; freq?: string; detail?: string; recip?: string } | undefined;
      if (!p || typeof p.name !== "string" || !REPORT_CATALOGUE.some((x) => x.name === p.name) || !(REPORT_FREQS as readonly string[]).includes(String(p.freq))) invalid("Schedule request is invalid.");
      await t.vote(a.id, reason); await t.setApproval(a.id, "Approved", reason);
      await t.audit("approval.report.distribution.approved", `${a.title} (${a.id}); reason: ${reason}`, "Approval");
      const existing = (await t.list<Schedule>("report-schedule")).find((x) => x.data.name === p!.name);
      const rec: Schedule = { id: existing?.id ?? `SP-${await t.next("report-schedule", 0)}`, name: p!.name!, freq: String(p!.freq), detail: String(p!.detail ?? ""), recip: String(p!.recip ?? "—"),
        next: p!.freq === "On demand" ? "—" : NOT_SENT, external: true, approvedBy: me.name, approvalId: a.id, by: a.requestedByName, byId: a.requestedBy, at: t.now };
      if (existing) await t.update("report-schedule", existing.id, rec, existing.version); else await t.insert("report-schedule", rec.id, rec);
      await t.audit("report.scheduled", `${rec.name} · ${rec.freq}${rec.detail ? ` (${rec.detail})` : ""} (external distribution approved by ${me.name}; requested by ${a.requestedByName})`, "System");
      await t.audit("report.distribution.applied", `${a.title} (${a.id})`, "Approval");
      await t.notify(a.requestedBy, `${me.name} approved the external distribution of ${rec.name}.`);
      return ok({ status: "Approved" });
    });
  });
  return { "GET ws/data/reports": data, "POST ws/reports/generate": gen, "POST ws/reports/schedules": schedule, "POST ws/reports/schedules/:id/delete": remove, "POST ws/report-approvals/:id/:decision": decide };
}
