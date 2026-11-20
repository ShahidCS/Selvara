/* Server-only. My Work and Overview on the server (production programme group 3; inventory group 3, sections 3 and 4).
   My Work: what is really assigned to the signed-in person (issues they own, risk treatment actions given to them, risks they own that need
   attention) and the decisions waiting for them (policies they are the named approver of, issue closures, risk approvals, Board evidence,
   imports, external report distribution, access requests), each with where to open it. A vendor request from My Work is stored for the
   Vendors module (group 4) with length limits. Overview: every role with the Overview sees the company's posture figures, but only the detail
   of modules it may open. The posture of a module the person cannot open comes as figures only (scores and statuses without titles, owners
   or text), so a person never sees a risk, issue or control they could not open. */
import { approvalBlock } from "@/lib/rules";
import { isoDayOf, issueDueText, roleBlock } from "@/lib/rulesWs";
import type { Deps } from "../types";
import type { Control, FwCustom, FwState } from "./assurance";
import { LIB_FRAMEWORKS } from "./catalogue";
import { invalid, modAllowed, ok, refuse, txt, wsRoute, type WsHelpers } from "./common";
import type { Issue } from "./issues";
import type { Policy } from "./policies";
import type { Risk } from "./risk";
import type { AccessRequest } from "./access";
import type { Actor, WsTx } from "./store";

export interface VendorRequest { id: string; name: string; cat: string; reason: string; requester: string; requesterId: string; data: boolean; crit: string; at: string; status: "Pending" | "Approved" | "Rejected" }
interface WorkItem { t: string; m: string; sev: "High" | "Medium" | "Low"; path: string; decision?: boolean }
const CRITS = ["Critical", "Medium", "Low"];

async function work(t: WsTx, me: Actor) {
  const today = isoDayOf(t.now); const week = isoDayOf(t.now + 7 * 86400_000); const role = me.role;
  const issues = (await t.list<Issue>("issue")).map((x) => x.data).filter((i) => i.ownerId === me.id && i.status !== "Closed")
    .map((i) => ({ id: i.id, title: i.title, sev: i.sev, status: i.status, dueDate: i.dueDate, due: issueDueText(i.dueDate, today) }));
  const risks = (await t.list<Risk>("risk")).map((x) => x.data);
  const actions = risks.filter((r) => r.status !== "Closed").flatMap((r) => (r.actions ?? []).filter((a) => a.ownerId === me.id && !a.done && !a.cancelled)
    .map((a) => ({ riskId: r.id, risk: modAllowed(role, "risk") ? r.title : "", text: a.text, due: a.due })));
  const reviews: WorkItem[] = [];
  const canRisk = modAllowed(role, "risk");
  if (canRisk) for (const r of risks) {
    if (r.review === "Submitted" && r.status !== "Closed" && role === "admin" && r.lastEditedById !== me.id && r.submittedById !== me.id) reviews.push({ t: `Approve risk ${r.id} ${r.title}`, m: `Risk review, submitted by ${r.submittedBy ?? "a colleague"}`, sev: "Medium", path: "/ws/risk", decision: true });
    if (r.ownerId === me.id && r.review === "Changes requested") reviews.push({ t: `Update risk ${r.id} ${r.title}`, m: "Changes were requested", sev: "Medium", path: "/ws/risk" });
    if (r.ownerId === me.id && r.acceptance && r.acceptance.until < today) reviews.push({ t: `Review risk ${r.id}: acceptance expired`, m: `Accepted until ${r.acceptance.until}`, sev: "High", path: "/ws/risk" });
  }
  const aps = await t.approvals(["risk.board-evidence", "risk.import", "issue.close", "report.distribution"]);
  const may = (a: (typeof aps)[number]) => a.status === "Pending" && a.expiresAt > t.now
    && !approvalBlock({ key: me.id, base: role }, { status: a.status, expiresAt: a.expiresAt, approverRoles: a.approverRoles, requestedBy: a.requestedBy, forbid: a.forbid, votes: a.votes.map((v) => v.by) }, t.now);
  for (const a of aps.filter(may)) {
    if (a.kind === "issue.close" && modAllowed(role, "issues")) reviews.push({ t: a.title, m: `Closure proposed by ${a.requestedByName}`, sev: "High", path: `/ws/issues/${String(a.payload.issueId ?? a.subject ?? "")}`, decision: true });
    if (a.kind.startsWith("risk.") && canRisk) reviews.push({ t: a.title, m: `Requested by ${a.requestedByName}`, sev: a.kind === "risk.import" ? "Medium" : "High", path: "/ws/risk", decision: true });
    if (a.kind === "report.distribution" && modAllowed(role, "reports")) reviews.push({ t: a.title, m: `Requested by ${a.requestedByName}`, sev: "Medium", path: "/ws/reports", decision: true });
  }
  if (modAllowed(role, "policies")) for (const p of (await t.list<Policy>("policy")).map((x) => x.data)) {
    const w = (p.versions ?? []).find((v) => v.status === "In review");
    if (w && w.approverId === me.id) reviews.push({ t: `Approve ${p.id} ${w.name}`, m: `Policy review, version ${w.ver}`, sev: "Medium", path: `/ws/policies/${p.id}`, decision: true });
  }
  if (modAllowed(role, "access") && ["admin", "owner"].includes(role)) {
    const n = (await t.list<AccessRequest>("access-request")).filter((x) => x.data.status === "Pending" && x.data.stage === "" && x.data.requesterId !== me.id && x.data.userId !== me.id).length;
    if (n) reviews.push({ t: `Decide ${n} access request${n === 1 ? "" : "s"}`, m: "Access requests waiting", sev: "Low", path: "/ws/access", decision: true });
  }
  const overdue = issues.filter((i) => i.dueDate < today).length + actions.filter((a) => a.due && a.due < today).length;
  const dueWeek = issues.filter((i) => i.dueDate >= today && i.dueDate <= week).length + actions.filter((a) => a.due && a.due >= today && a.due <= week).length;
  return { issues, actions, reviews, kpis: { assigned: issues.length + actions.length, overdue, dueWeek, approvals: reviews.filter((x) => x.decision).length } };
}

/** Posture for the Overview: full detail of the modules the role may open is loaded by those modules; the others come as figures only. */
async function overview(t: WsTx, role: string) {
  const out: Record<string, unknown> = {};
  if (!modAllowed(role, "risk")) out.risks = (await t.list<Risk>("risk")).map((x, n) => ({ id: `#${n + 1}`, title: "", owner: "", status: x.data.status, review: x.data.review, treat: x.data.treat, l: x.data.l, i: x.data.i, cl: x.data.cl, ci: x.data.ci, rl: x.data.rl, ri: x.data.ri }));
  if (!modAllowed(role, "issues")) out.issues = (await t.list<Issue>("issue")).map((x, n) => ({ id: `#${n + 1}`, title: "", owner: "", sev: x.data.sev, status: x.data.status, due: issueDueText(x.data.dueDate, isoDayOf(t.now)) }));
  if (!modAllowed(role, "frameworks")) {
    const state: Record<string, FwState> = {}; for (const s of await t.list<FwState>("fw")) state[s.id] = s.data;
    // only what readiness needs: scope, which requirements are not applicable (no reasons or names) and which controls they map to
    const figures: Record<string, unknown> = {};
    for (const [id, s] of Object.entries(state)) figures[id] = { scope: s.scope, snooze: s.snooze, na: Object.fromEntries(Object.keys(s.na ?? {}).map((k) => [k, {}])), mod: {}, reqCtrl: s.reqCtrl ?? {} };
    out.frameworks = { library: LIB_FRAMEWORKS, state: figures, custom: (await t.list<FwCustom>("fw-custom")).map((x) => ({ id: x.id, name: x.data.name, short: x.data.short, kind: x.data.kind, region: x.data.region, version: x.data.version, reqs: x.data.reqs.map((q) => [q[0], "", ...q.slice(2)]) })) };
  }
  if (!modAllowed(role, "controls")) out.controls = (await t.list<Control>("control")).map((x) => ({ id: x.data.id, title: "", owner: "", domain: x.data.domain, status: x.data.status, map: x.data.map }));
  return out;
}

export function insightRoutes(h: WsHelpers) {
  const tx = <T,>(d: Deps, c: { actor: Actor }, w: (t: WsTx) => Promise<T>) => d.ws.tx(c.actor, d.now(), w);
  const workData = wsRoute(h, "work", async (d, _r, c) => ok(await tx(d, c, (t) => work(t, c.actor))));
  const overviewData = wsRoute(h, "overview", async (d, _r, c) => ok(await tx(d, c, (t) => overview(t, c.actor.role))));
  const vendorRequest = wsRoute(h, "work", async (d, r, c) => {
    const name = txt(r.body.name, 120); const reason = txt(r.body.reason, 500);
    if (!name || !reason) invalid("Vendor name and purpose are required.");
    const crit = CRITS.includes(String(r.body.crit)) ? String(r.body.crit) : "Medium";
    return tx(d, c, async (t) => {
      const open = (await t.list<VendorRequest>("vendor-request")).filter((x) => x.data.status === "Pending");
      if (open.some((x) => x.data.name.toLowerCase() === name.toLowerCase())) invalid("A request for this vendor is already waiting.");
      if (open.filter((x) => x.data.requesterId === c.actor.id).length >= 20) invalid("You have 20 vendor requests waiting. Wait for procurement to decide them.");
      const id = `VR-${String(await t.next("vendor-request", 0)).padStart(2, "0")}`;
      await t.insert("vendor-request", id, { id, name, cat: txt(r.body.cat, 60) || "General", reason, requester: c.actor.name, requesterId: c.actor.id, data: r.body.data === true, crit, at: isoDayOf(t.now), status: "Pending" } satisfies VendorRequest);
      await t.audit("vendor.requested", `${name} (${crit} tier)`, "Vendor");
      return ok({ id });
    });
  });
  /** The board pack export, recorded in the company's log (the pack is built in the browser from what the person may see). */
  const boardPack = wsRoute(h, "overview", async (d, _r, c) => {
    refuse(roleBlock(c.actor.role, "exporting the board pack", "admin", "owner", "analyst", "auditor", "employee"));
    await tx(d, c, (t) => t.audit("overview.boardpack.exported", "Board & executive pack", "System"));
    return ok();
  });
  return { "GET ws/data/work": workData, "GET ws/data/overview": overviewData, "POST ws/vendor-requests": vendorRequest, "POST ws/overview/board-pack": boardPack };
}
