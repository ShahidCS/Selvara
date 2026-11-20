/* Server-only. Issues (remediation) on the server (production programme group 3; inventory group 3, section 2). Writers are admins, owners and
   analysts; owner, due date and severity change only by an admin or owner and never while a closure waits; High and Critical issues close
   only when a different person verifies the fix (four-eyes request `issue.close`: never the owner or the proposer). Deliberate differences
   from the demonstration, decided for production: the owner is a member of the company and the due date is a real date (the screens read
   "Overdue 3d" / "Due 5d" computed from it each day), links point at controls and risks that exist, every action is in the audit log
   (including task changes, root cause and links), a deleted issue stays in storage for the audit trail, and the owner is told when an issue
   is assigned to them or a closure is decided. */
import { approvalBlock } from "@/lib/rules";
import {
  ISSUE_CLOSE_TTL_H, ISSUE_SEVERITIES, ISSUE_STATES, isHighSeverity, isoDayOf, issueCoreBlock, issueDeleteBlock, issueDueText, issueWriteBlock, roleBlock,
} from "@/lib/rulesWs";
import type { Deps } from "../types";
import { approvalsView, invalid, memberRef, membersOf, missing, ok, refuse, str, sweepApprovals, txt, wsRoute, type WsHelpers } from "./common";
import type { Actor, Rec, WsTx } from "./store";

export interface Issue {
  id: string; title: string; sev: string; status: string; owner: string; ownerId: string; dueDate: string; createdBy: string; createdById: string;
  tasks: { text: string; done: boolean }[]; rootCause: string; corrective: string; linkedControls: string[]; linkedRisks: string[];
  closure?: { approvalId: string; by: string; byId: string; at: string; note: string };
  verification?: { by: string; at: string; note: string; approvalId: string; proposedBy: string };
  source?: string;
}
export const ISSUE_KINDS = ["issue.close"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const dueOf = (v: unknown, now: number): string => {
  const s = txt(v, 10); if (!s) return isoDayOf(now + 14 * 86400_000);
  if (!ISO.test(s) || Number.isNaN(Date.parse(s + "T00:00:00Z"))) invalid("Enter a valid due date.");
  return s;
};
/** The issue as the screens read it: `due` is the text every module tests for "Overdue". */
export const issueView = (x: Issue, now: number) => ({ ...x, due: issueDueText(x.dueDate, isoDayOf(now)) });
async function load(t: WsTx, id: string): Promise<Rec<Issue>> { return (await t.get<Issue>("issue", str(id, 40))) ?? missing("Issue"); }
async function pendingOf(t: WsTx, x: Issue) {
  if (!x.closure) return null; const a = await t.approval(x.closure.approvalId, ISSUE_KINDS);
  return a && a.status === "Pending" && a.expiresAt > t.now ? a : null;
}
/** Creates an issue (also used by other modules: an audit finding, an AI signal, an automation rule). */
export async function createIssueIn(t: WsTx, f: { title: string; sev: string; owner: { id: string; name: string }; dueDate: string; source?: string }) {
  const id = `R-${await t.next("issue", 60)}`;
  const x: Issue = {
    id, title: f.title, sev: f.sev, status: "Open", owner: f.owner.name, ownerId: f.owner.id, dueDate: f.dueDate, createdBy: t.actor.name, createdById: t.actor.id,
    tasks: [], rootCause: "", corrective: "", linkedControls: [], linkedRisks: [], ...(f.source ? { source: f.source } : {}),
  };
  await t.insert("issue", id, x);
  await t.audit("issue.created", `${id} (${f.sev}) by ${t.actor.name}`, "Control");
  if (f.owner.id !== t.actor.id) await t.notify(f.owner.id, `${t.actor.name} assigned you issue ${id} ${f.title.slice(0, 80)} (due ${f.dueDate}).`);
  return x;
}

export function issueRoutes(h: WsHelpers) {
  const tx = <T,>(d: Deps, c: { actor: Actor }, w: (t: WsTx) => Promise<T>) => d.ws.tx(c.actor, d.now(), w);
  const write = (fn: (d: Deps, t: WsTx, rec: Rec<Issue>, b: Record<string, unknown>, p: string[]) => Promise<unknown>) => wsRoute(h, "issues", async (d, r, c) => {
    refuse(issueWriteBlock(c.actor.role));
    return tx(d, c, async (t) => { await sweepApprovals(t, ISSUE_KINDS); const rec = await load(t, r.path[2]); const out = await fn(d, t, rec, r.body, r.path); return ok(out ?? true); });
  });

  const data = wsRoute(h, "issues", async (d, _r, c) => ok(await tx(d, c, async (t) => {
    await sweepApprovals(t, ISSUE_KINDS);
    const names = new Map((await membersOf(d, c.actor)).map((m) => [m.id, m.name]));
    return { issues: (await t.list<Issue>("issue")).map((x) => issueView(x.data, t.now)).reverse(), approvals: await approvalsView(t, ISSUE_KINDS, names) };
  })));
  const create = wsRoute(h, "issues", async (d, r, c) => {
    refuse(issueWriteBlock(c.actor.role));
    const title = txt(r.body.title, 200); if (!title) invalid("Title is required.");
    const sev = (ISSUE_SEVERITIES as readonly string[]).includes(String(r.body.sev)) ? String(r.body.sev) : "High";
    const owner = await memberRef(d, c.actor, { id: r.body.ownerId, name: r.body.owner });
    const dueDate = dueOf(r.body.due, d.now());
    return tx(d, c, async (t) => ok({ id: (await createIssueIn(t, { title, sev, owner, dueDate })).id }));
  });
  const update = wsRoute(h, "issues", async (d, r, c) => {
    refuse(issueWriteBlock(c.actor.role));
    const title = txt(r.body.title, 200); if (!title) invalid("Title is required.");
    const ms = await membersOf(d, c.actor);
    return tx(d, c, async (t) => {
      await sweepApprovals(t, ISSUE_KINDS);
      const rec = await load(t, r.path[2]); const x = rec.data;
      const sev = String(r.body.sev ?? x.sev); const dueDate = r.body.due === undefined ? x.dueDate : dueOf(r.body.due, t.now);
      const ownerId = str(r.body.ownerId ?? x.ownerId, 100); const owner = ms.find((m) => m.id === ownerId);
      const core = sev !== x.sev || ownerId !== x.ownerId || dueDate !== x.dueDate;
      if (core) {
        refuse(issueCoreBlock(c.actor.role));
        if (await pendingOf(t, x)) invalid("Withdraw the pending closure before changing owner, due date or severity.");
        if (!(ISSUE_SEVERITIES as readonly string[]).includes(sev)) invalid("Unknown severity.");
        if (!owner) invalid("Choose an active member of your company.");
      }
      if (!core && title === x.title) return ok(true);
      const was = `${x.sev}/${x.owner}/${x.dueDate}`;
      x.title = title; x.sev = sev; if (owner) { x.owner = owner.name; x.ownerId = owner.id; } x.dueDate = dueDate;
      await t.update("issue", rec.id, x, rec.version);
      await t.audit("issue.updated", `${x.id}` + (core ? ` core fields ${was} → ${x.sev}/${x.owner}/${x.dueDate} by ${c.actor.name}` : " title"), "Control");
      if (owner && owner.id !== c.actor.id && ownerId !== rec.data.ownerId) await t.notify(owner.id, `${c.actor.name} assigned you issue ${x.id} ${x.title.slice(0, 80)}.`);
      return ok(true);
    });
  });
  const status = write(async (_d, t, rec, b) => {
    const x = rec.data; const to = str(b.status, 20); const me = t.actor;
    if (!(ISSUE_STATES as readonly string[]).includes(to)) invalid("Unknown status.");
    if (to === x.status) invalid(`The issue is already ${to.toLowerCase()}.`);
    if (to === "Closed" && isHighSeverity(x.sev)) refuse("High/Critical issues are closed only after a different person verifies the fix.");
    if (x.status === "Closed") refuse(roleBlock(me.role, "reopening an issue", "admin", "owner"));
    if (await pendingOf(t, x)) invalid("A closure is awaiting verification.");
    const from = x.status; x.status = to; await t.update("issue", rec.id, x, rec.version);
    await t.audit("issue.status.changed", `${x.id}: ${from} → ${to} by ${me.name}${to === "Closed" && x.createdById === me.id ? " (closer is the creator)" : ""}`, "Control");
    return { from };
  });
  const propose = write(async (_d, t, rec, b) => {
    const x = rec.data;
    if (x.status === "Closed") invalid("Already closed.");
    if (await pendingOf(t, x)) invalid("A closure is already awaiting verification.");
    if (!isHighSeverity(x.sev)) invalid("Only High/Critical issues need verification; move the status directly.");
    const note = txt(b.note, 500); if (note.length < 10) invalid("A description of the fix of at least 10 characters is required.");
    const a = await t.request({ kind: "issue.close", title: `Verify closure of ${x.id} ${x.title}`.slice(0, 200), subject: x.id, payload: { issueId: x.id, note }, needs: 1,
      approverRoles: ["admin", "owner", "analyst"], forbid: [x.ownerId].filter(Boolean), ttlMs: ISSUE_CLOSE_TTL_H * 3600_000 });
    x.closure = { approvalId: a.id, by: t.actor.name, byId: t.actor.id, at: isoDayOf(t.now), note };
    await t.update("issue", rec.id, x, rec.version);
    await t.audit("issue.closure.proposed", `${x.id} (${x.sev}) ${a.id} by ${t.actor.name}`, "Control");
    return a.id;
  });
  const decideClosure = write(async (_d, t, rec, b) => {
    const x = rec.data; const me = t.actor; const a = await pendingOf(t, x); if (!a) invalid("No closure is awaiting verification.");
    const decision = str(b.decision, 10); if (decision !== "verify" && decision !== "reject") invalid("Choose verify or reject.");
    refuse([x.ownerId, x.closure!.byId].includes(me.id) ? "Segregation of duties: the verifier cannot be the assignee, the owner or the person who proposed the closure." : null);
    refuse(approvalBlock({ key: me.id, base: me.role }, { status: a!.status, expiresAt: a!.expiresAt, approverRoles: a!.approverRoles, requestedBy: a!.requestedBy, forbid: a!.forbid, votes: a!.votes.map((v) => v.by) }, t.now));
    const note = txt(b.note, 500); if (note.length < 10) invalid("A verification note of at least 10 characters is required.");
    if (decision === "reject") {
      await t.setApproval(a!.id, "Rejected", note); await t.audit("approval.issue.close.rejected", `${a!.title} (${a!.id}); reason: ${note}`, "Approval");
      await t.audit("issue.closure.rejected", `${x.id} ${a!.id} by ${me.name}: ${note}`, "Control");
      await t.notify(x.closure!.byId, `${me.name} rejected the closure of issue ${x.id}: ${note.slice(0, 120)}`);
      return false;
    }
    await t.vote(a!.id, note); await t.setApproval(a!.id, "Approved", note);
    await t.audit("approval.issue.close.approved", `${a!.title} (${a!.id}); reason: ${note}`, "Approval");
    const from = x.status; x.status = "Closed"; x.verification = { by: me.name, at: isoDayOf(t.now), note, approvalId: a!.id, proposedBy: x.closure!.by };
    await t.update("issue", rec.id, x, rec.version);
    await t.audit("issue.closed.verified", `${x.id} (${x.sev}): ${from} → Closed; proposed by ${x.closure!.by}, verified by ${me.name} (${a!.id})`, "Control");
    if (x.closure!.byId !== me.id) await t.notify(x.closure!.byId, `${me.name} verified the fix and closed issue ${x.id}.`);
    return true;
  });
  const withdraw = wsRoute(h, "issues", async (d, r, c) => tx(d, c, async (t) => {
    const rec = await load(t, r.path[2]); const x = rec.data; const a = await pendingOf(t, x); if (!a) invalid("No closure is awaiting verification.");
    if (a!.requestedBy !== c.actor.id) refuse("Only the person who proposed the closure can withdraw it.");
    await t.setApproval(a!.id, "Withdrawn"); await t.audit("approval.issue.close.withdrawn", `${a!.title} (${a!.id})`, "Approval");
    await t.audit("issue.closure.withdrawn", `${x.id} ${a!.id}`, "Control");
    return ok(true);
  }));
  const rca = write(async (_d, t, rec, b) => {
    const x = rec.data; x.rootCause = txt(b.rootCause, 2000); x.corrective = txt(b.corrective, 2000);
    await t.update("issue", rec.id, x, rec.version); await t.audit("issue.rca.saved", x.id, "Control"); return true;
  });
  const addTask = write(async (_d, t, rec, b) => {
    const x = rec.data; const text = txt(b.text, 300); if (!text) invalid("Describe the task.");
    if ((x.tasks ??= []).length >= 100) invalid("An issue can have at most 100 tasks.");
    x.tasks.push({ text, done: false }); await t.update("issue", rec.id, x, rec.version); await t.audit("issue.task.added", `${x.id}: ${text}`, "Control"); return true;
  });
  const toggleTask = write(async (_d, t, rec, _b, p) => {
    const x = rec.data; const n = Number(p[4]); const k = Number.isInteger(n) ? x.tasks?.[n] : undefined; if (!k) missing("Task");
    k!.done = !k!.done; await t.update("issue", rec.id, x, rec.version);
    await t.audit(k!.done ? "issue.task.done" : "issue.task.reopened", `${x.id}: ${k!.text}`, "Control"); return true;
  });
  const link = write(async (_d, t, rec, b) => {
    const x = rec.data; const kind = str(b.kind, 10); const v = str(b.value, 40);
    if (kind !== "control" && kind !== "risk") invalid("Choose a control or a risk.");
    if (!(await t.get(kind === "control" ? "control" : "risk", v))) missing(kind === "control" ? "Control" : "Risk");
    const arr = kind === "control" ? (x.linkedControls ??= []) : (x.linkedRisks ??= []);
    if (arr.includes(v)) invalid(`${v} is already linked.`);
    arr.push(v); await t.update("issue", rec.id, x, rec.version); await t.audit("issue.linked", `${x.id} → ${v}`, "Control"); return true;
  });
  const del = write(async (_d, t, rec) => {
    const x = rec.data;
    const referenced = (await t.list<{ findings?: { issue?: string }[] }>("audit")).some((a) => (a.data.findings ?? []).some((f) => f.issue === x.id));
    refuse(issueDeleteBlock({ sev: x.sev, status: x.status, referenced, role: t.actor.role }));
    const a = await pendingOf(t, x); if (a) await t.setApproval(a.id, "Withdrawn", "issue deleted");
    await t.remove("issue", rec.id, rec.version);
    await t.audit("issue.deleted", `${x.id} (${x.sev}) by ${t.actor.name}`, "Control"); return true;
  });

  return {
    "GET ws/data/issues": data, "POST ws/issues": create, "POST ws/issues/:id": update, "POST ws/issues/:id/status": status, "POST ws/issues/:id/delete": del,
    "POST ws/issues/:id/closure": propose, "POST ws/issues/:id/closure/decision": decideClosure, "POST ws/issues/:id/closure/withdraw": withdraw,
    "POST ws/issues/:id/rca": rca, "POST ws/issues/:id/tasks": addTask, "POST ws/issues/:id/tasks/:n/toggle": toggleTask, "POST ws/issues/:id/links": link,
  };
}
