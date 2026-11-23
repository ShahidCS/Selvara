/* Server-only. Policies on the server (production programme group 2; inventory: docs/architecture/inventory/group2-*.md, section 1). The
   versioned lifecycle of the demonstration (draft, review with a named approver, approval, publication, emergency change with retrospective
   four-eyes, ownership, mapped controls, acknowledgements), with every rule from src/lib/rulesWs.ts and people compared by user id.
   Deliberate differences: the approver can be neither the owner nor the submitter; acceptance counts are real (active members, and their
   acknowledgements of the live version); reminders reach the members who have not acknowledged (in-app notices, once a day per policy);
   an emergency change on a 0.x draft records the published 1.0; "Next review" and dates are the server's (UTC). */
import {
  POLICY_CYCLES, POLICY_EMERGENCY_DAYS, addBusinessDaysIso, addMonthsIso, bumpMinor, isoDayOf, policyApproveBlock, policyApproverBlock, policyDecideExceptionBlock,
  policyEditBlock, policyEffectiveBlock, policyEmergencyBlock, policyPublishBlock, policySubmitBlock, roleBlock, textBlock,
} from "@/lib/rulesWs";
import { approvalBlock, reasonBlock } from "@/lib/rules";
import type { Deps } from "../types";
import { approvalsView, invalid, membersOf, modAllowed, missing, ok, refuse, str, sweepApprovals, txt, wsRoute, type WsHelpers } from "./common";
import { auditorScope, scopeGuard } from "./audits";
import { actsAs, delegationsOf, sweepDelegations } from "./delegation";
import type { Actor, Rec, WsTx } from "./store";

type VStatus = "Draft" | "In review" | "Approved" | "Published" | "Superseded";
export interface Version {
  ver: string; name: string; status: VStatus; body: string; note: string; cycle: number;
  author: string; authorId: string; editors: string[]; editorIds: string[]; lastEditor: string; lastEditorId: string; createdAt: string;
  approver?: string; approverId?: string; approverRole?: string; submittedAt?: string; submittedById?: string;
  approvedBy?: string; approvedById?: string; approvedOnBehalfOf?: string; approvedAt?: string; approvalReason?: string; effective?: string;
  publishedBy?: string; publishedById?: string; publishedAt?: string; supersededAt?: string; emergency?: boolean; exceptionId?: string;
}
export interface PolicyException { id: string; ver: string; by: string; byId: string; at: string; reason: string; dueBy: string; approvalId: string; status: "Pending" | "Approved" | "Rejected"; decidedBy?: string; decidedAt?: string }
export interface Policy {
  id: string; name: string; status: string; ver: string; owner: string; ownerId: string; creator: string; creatorId: string; review: string; body: string;
  versions: Version[]; changeLog: { at: string; ver: string; by: string; action: string; reason: string }[]; exceptions: PolicyException[]; mappedControls: string[]; lastRemindedAt?: number;
}
interface Ack { policyId: string; userId: string; name: string; ver: string; at: string }
const EMG = ["policy.emergency"];
const WORKING: VStatus[] = ["Draft", "In review", "Approved"];
const live = (p: Policy) => p.versions.find((v) => v.status === "Published");
const work = (p: Policy) => p.versions.find((v) => WORKING.includes(v.status));
const editorIds = (v: Version) => new Set([v.authorId, v.lastEditorId, ...v.editorIds]);
const DAY_FMT = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
function syncTop(p: Policy) {
  const l = live(p), w = work(p);
  if (l) { p.status = "Active"; p.ver = l.ver; p.name = l.name; }
  else if (w) { p.status = w.status; p.ver = w.status === "Draft" ? w.ver + " draft" : w.ver; p.name = w.name; }
}
const log = (t: WsTx, p: Policy, ver: string, action: string, reason = "") => { p.changeLog.push({ at: isoDayOf(t.now), ver, by: t.actor.name, action, reason: reason.slice(0, 500) }); };
const cycleOf = (v: unknown, fallback: number) => ((POLICY_CYCLES as readonly number[]).includes(Number(v)) ? Number(v) : fallback);
async function policy(t: WsTx, id: string) { return (await t.get<Policy>("policy", id)) ?? missing("Policy"); }
/** An admin or owner of the company, by id (or, from the demonstration's dialogs, an exact name that only one member has). */
async function adminOrOwner(d: Deps, a: Actor, v: { id?: unknown; name?: unknown }, msg: string) {
  const ms = (await membersOf(d, a)).filter((m) => ["admin", "owner"].includes(m.role));
  const id = str(v.id, 100); const name = txt(v.name, 80);
  const hits = id ? ms.filter((m) => m.id === id) : ms.filter((m) => m.name === name);
  if (hits.length !== 1) invalid(hits.length > 1 ? "Two admins or owners share this name. Ask a company admin to tell them apart." : msg);
  return hits[0];
}

/** The signed-in person acknowledges the live version (once per version, with the server's date). */
async function acknowledge(t: WsTx, p: Policy) {
  const me = t.actor; const l = live(p); if (!l) invalid("Only a published policy can be acknowledged.");
  const key = `${p.id}:${me.id}`; const prev = await t.get<Ack>("policy-ack", key);
  if (prev?.data.ver === l!.ver) return { at: DAY_FMT(prev.data.at), ver: l!.ver };
  const a: Ack = { policyId: p.id, userId: me.id, name: me.name, ver: l!.ver, at: isoDayOf(t.now) };
  if (prev) await t.update("policy-ack", key, a, prev.version); else await t.insert("policy-ack", key, a);
  await t.audit("policy.acknowledged", `${p.id} v${l!.ver} by ${me.name}`, "Policy");
  return { at: DAY_FMT(a.at), ver: a.ver };
}

/** Acting as the named approver: the approver, or their live delegate, but never the owner or the submitter of the version by delegation. */
async function viaDelegate(t: WsTx, me: Actor, p: Policy, w: Version | undefined) {
  const as = await actsAs(t, me, w?.approverId, { requestedBy: w?.submittedById, forbid: [p.ownerId] });
  return as.onBehalfOf && (me.id === p.ownerId || me.id === w?.submittedById) ? { ok: false, onBehalfOf: null } : as;
}
/** What a reader (not an admin or owner) receives: published text only, no draft or approval details. */
function forReader(p: Policy) {
  return { ...p, versions: p.versions.map((v) => (v.status === "Published" || v.status === "Superseded" ? v : { ...v, body: "", note: "", approvalReason: undefined })), lastRemindedAt: undefined };
}

export function policyRoutes(h: WsHelpers) {
  const tx = <T,>(d: Deps, c: { actor: Actor }, w: (t: WsTx) => Promise<T>) => d.ws.tx(c.actor, d.now(), w);
  const save = async (t: WsTx, r: Rec<Policy>) => { syncTop(r.data); await t.update("policy", r.id, r.data, r.version); };
  /** For an auditor, a policy outside their scope (not shared with a live engagement of theirs) does not exist: answered before any other check. */
  const hide = async (d: Deps, c: { actor: Actor }, id: string) => { if (c.actor.role === "auditor") await tx(d, c, (t) => scopeGuard(t, "policies", id, "Policy")); };

  const data = wsRoute(h, "policies", async (d, _r, c) => ok(await tx(d, c, async (t) => {
    await sweepApprovals(t, EMG); await sweepDelegations(t);
    const members = await membersOf(d, c.actor); const names = new Map(members.map((m) => [m.id, m.name]));
    const acks = (await t.list<Ack>("policy-ack")).map((x) => x.data); const manager = ["admin", "owner"].includes(c.actor.role);
    const scope = await auditorScope(t); // an auditor: only what is shared with them
    const policies = (await t.list<Policy>("policy")).filter((x) => !scope || scope.policies.has(x.id)).map((x) => {
      const l = live(x.data); const done = l ? acks.filter((a) => a.policyId === x.id && a.ver === l.ver).length : 0;
      return { ...(manager ? x.data : forReader(x.data)), acceptance: { required: l ? members.length : 0, done } };
    });
    const mine: Record<string, { at: string; ver: string }> = {};
    for (const a of acks) if (a.userId === c.actor.id) mine[a.policyId] = { at: DAY_FMT(a.at), ver: a.ver };
    return { policies, acks: mine, approvals: manager ? await approvalsView(t, EMG, names) : [], delegations: await delegationsOf(t, c.actor.id) };
  })));

  const create = wsRoute(h, "policies", async (d, r, c) => {
    refuse(roleBlock(c.actor.role, "creating a policy", "admin", "owner"));
    const name = txt(r.body.name, 160); if (!name) invalid("Policy name is required.");
    const me = c.actor;
    return tx(d, c, async (t) => {
      const id = "P-" + String(await t.next("policy", 0)).padStart(3, "0"); const day = isoDayOf(t.now);
      const v: Version = { ver: "0.1", name, status: "Draft", body: txt(r.body.body, 8000), note: "Policy created", cycle: cycleOf(r.body.cycle, 12), author: me.name, authorId: me.id, editors: [me.name], editorIds: [me.id], lastEditor: me.name, lastEditorId: me.id, createdAt: day };
      const p: Policy = { id, name, status: "Draft", ver: "0.1 draft", owner: me.name, ownerId: me.id, creator: me.name, creatorId: me.id, review: "Not started", body: "", versions: [v], changeLog: [], exceptions: [], mappedControls: [] };
      log(t, p, "0.1", "Policy created", "Creator is recorded as the policy owner");
      await t.insert("policy", id, p); await t.audit("policy.created", `${id} v0.1 by ${me.name}`, "Policy");
      return ok({ id });
    });
  });
  const edit = wsRoute(h, "policies", async (d, r, c) => { await hide(d, c, str(r.path[2], 20)); return tx(d, c, async (t) => {
    const rec = await policy(t, str(r.path[2], 20)); const p = rec.data; const me = c.actor; let w = work(p); const fresh = !w;
    refuse(policyEditBlock(me.role, p.ownerId === me.id, p.owner, w?.status ?? null));
    const name = txt(r.body.name, 160); if (!name) invalid("Policy name is required.");
    const note = fresh ? txt(r.body.note, 500) : txt(r.body.note, 300) || "Draft edited";
    if (fresh) { const bad = textBlock(note, 10, "A change reason"); if (bad) invalid(bad); }
    if (!w) {
      const l = live(p); if (!l) invalid("There is nothing to edit.");
      w = { ver: bumpMinor(l!.ver), name: l!.name, status: "Draft", body: l!.body, note, cycle: l!.cycle, author: me.name, authorId: me.id, editors: [me.name], editorIds: [me.id], lastEditor: me.name, lastEditorId: me.id, createdAt: isoDayOf(t.now) };
      p.versions.push(w);
    }
    w.name = name; w.body = txt(r.body.body, 8000); w.cycle = cycleOf(r.body.cycle, w.cycle); w.note = note;
    w.lastEditor = me.name; w.lastEditorId = me.id; if (!w.editorIds.includes(me.id)) { w.editorIds.push(me.id); w.editors.push(me.name); }
    syncTop(p); log(t, p, w.ver, fresh ? "New draft version" : "Draft edited", note);
    await save(t, rec); await t.audit(fresh ? "policy.draft.created" : "policy.draft.saved", `${p.id} v${w.ver}`, "Policy");
    return ok({ ver: w.ver, fresh });
  }); });

  const action = wsRoute(h, "policies", async (d, r, c) => {
    const id = str(r.path[2], 20); const what = r.path[3]; const me = c.actor;
    await hide(d, c, id);
    // an external auditor reviews policies; acknowledging them is for the company's own people
    if (what === "acknowledge" && me.role === "auditor") refuse("Auditors do not acknowledge policies: acknowledgement is for the company's own members.");
    // people chosen in a dialog are resolved before the unit of work
    const named = what === "submit" || what === "approver" ? await adminOrOwner(d, me, { id: r.body.approverId, name: r.body.approver }, "Choose an approver with the admin or owner role.")
      : what === "owner" ? await adminOrOwner(d, me, { id: r.body.successorId, name: r.body.successor }, "Choose a successor with the admin or owner role.") : null;
    return tx(d, c, async (t) => {
      const rec = await policy(t, id); const p = rec.data; const w = work(p);
      if (what === "submit" || what === "approver") {
        if (what === "submit") refuse(policySubmitBlock(me.role, p.ownerId === me.id, p.owner, w?.status ?? null));
        else { if (!w || w.status !== "In review") invalid("Only a version in review has an approver."); refuse(roleBlock(me.role, "naming an approver", "admin", "owner"), p.ownerId === me.id ? null : `Only the policy owner (${p.owner}) can name the approver.`); }
        const bad = policyApproverBlock(editorIds(w!).has(named!.id), named!.id === p.ownerId || named!.id === me.id); if (bad) refuse(bad);
        w!.approver = named!.name; w!.approverId = named!.id; w!.approverRole = named!.role === "admin" ? "Company Admin" : "Control, Policy and Risk Owner";
        if (what === "submit") { w!.status = "In review"; w!.submittedAt = isoDayOf(t.now); w!.submittedById = me.id; log(t, p, w!.ver, "Submitted for review", "Approver: " + named!.name); }
        else log(t, p, w!.ver, "Approver named", named!.name);
        await save(t, rec);
        await t.audit(what === "submit" ? "policy.submitted" : "policy.approver.named", what === "submit" ? `${p.id} v${w!.ver} → approver ${named!.name}` : `${p.id} v${w!.ver} → ${named!.name}`, "Policy");
        await t.notify(named!.id, `${me.name} asked you to approve policy ${p.id} ${w!.name} v${w!.ver}.`);
        return ok({ ver: w!.ver });
      }
      if (what === "return") {
        if (!w || w.status !== "In review") invalid("Only a version in review can be returned to draft.");
        const as = await viaDelegate(t, me, p, w);
        if (!as.ok) refuse(roleBlock(me.role, "returning a policy to draft", "admin", "owner"), p.ownerId === me.id ? null : "Only the named approver or the policy owner can return it to draft.");
        else if (editorIds(w!).has(me.id)) refuse("Segregation of duties: the author or a last editor cannot act as approver.");
        const reason = txt(r.body.reason, 500); const bad = textBlock(reason, 10); if (bad) invalid(bad);
        w!.status = "Draft"; delete w!.approver; delete w!.approverId; delete w!.approverRole;
        log(t, p, w!.ver, as.ok ? "Changes requested" : "Withdrawn from review", reason);
        await save(t, rec); await t.audit("policy.returned", `${p.id} v${w!.ver}: ${reason}`, "Policy");
        if (as.ok) await t.notify(p.ownerId, `${me.name} asked for changes to policy ${p.id} v${w!.ver}: ${reason}`);
        return ok(true);
      }
      if (what === "approve") {
        const as = await viaDelegate(t, me, p, w);
        refuse(policyApproveBlock({ role: me.role, workStatus: w?.status ?? null, approver: w?.approver ?? null, isEditor: !!w && editorIds(w).has(me.id), actsAsApprover: as.ok }));
        const reason = txt(r.body.reason, 500); const bad = textBlock(reason, 10, "An approval reason"); if (bad) invalid(bad);
        const eff = str(r.body.effective, 10) || isoDayOf(t.now); const effBad = policyEffectiveBlock(eff, t.now); if (effBad) invalid(effBad);
        if (w!.ver.startsWith("0.")) w!.ver = "1.0";
        Object.assign(w!, { status: "Approved", approvedBy: me.name, approvedById: me.id, approvedOnBehalfOf: as.onBehalfOf ?? undefined, approvedAt: isoDayOf(t.now), approvalReason: reason, effective: eff });
        log(t, p, w!.ver, "Approved (immutable)", as.onBehalfOf ? `${reason} (on behalf of ${as.onBehalfOf}, by delegation)` : reason);
        await save(t, rec); await t.audit("policy.approved", `${p.id} v${w!.ver} by ${me.name}${as.onBehalfOf ? ` on behalf of ${as.onBehalfOf} (delegation)` : ""}, effective ${eff}`, "Policy");
        return ok({ ver: w!.ver });
      }
      if (what === "publish") {
        const as = await viaDelegate(t, me, p, w); const today = isoDayOf(t.now);
        refuse(policyPublishBlock({ role: me.role, workStatus: w?.status ?? null, approver: w?.approver ?? null, isEditor: !!w && editorIds(w).has(me.id), actsAsApprover: as.ok, effective: w?.effective, today }));
        const prev = live(p); if (prev) { prev.status = "Superseded"; prev.supersededAt = today; }
        Object.assign(w!, { status: "Published", publishedBy: me.name, publishedById: me.id, publishedAt: today });
        p.body = w!.body; p.review = DAY_FMT(addMonthsIso(w!.effective || today, w!.cycle));
        log(t, p, w!.ver, "Published", "Effective " + (w!.effective || today) + (prev ? "; v" + prev.ver + " superseded (kept in history)" : ""));
        await save(t, rec); await t.audit("policy.published", `${p.id} v${w!.ver} by ${me.name}${as.onBehalfOf ? ` on behalf of ${as.onBehalfOf} (delegation)` : ""}` + (prev ? `, supersedes v${prev.ver}` : ""), "Policy");
        return ok({ ver: w!.ver });
      }
      if (what === "emergency") {
        refuse(policyEmergencyBlock(me.role, w?.status ?? null));
        const reason = txt(r.body.reason, 500); const bad = textBlock(reason, 20, "An emergency justification"); if (bad) invalid(bad);
        const today = isoDayOf(t.now); const due = addBusinessDaysIso(t.now, POLICY_EMERGENCY_DAYS);
        if (w!.ver.startsWith("0.")) w!.ver = "1.0"; // the exception records the version that is published
        const ap = await t.request({ kind: "policy.emergency", title: `Retrospective approval: ${p.name} v${w!.ver}`, subject: p.id, payload: { policyId: p.id, ver: w!.ver }, needs: 1,
          approverRoles: ["admin", "owner"], forbid: [...new Set([me.id, ...editorIds(w!)])].filter((x) => x !== t.actor.id), ttlMs: 365 * 86400_000 });
        const prev = live(p); if (prev) { prev.status = "Superseded"; prev.supersededAt = today; }
        const exId = "PX-" + (p.exceptions.length + 1);
        p.exceptions.push({ id: exId, ver: w!.ver, by: me.name, byId: me.id, at: today, reason, dueBy: due, approvalId: ap.id, status: "Pending" });
        Object.assign(w!, { status: "Published", emergency: true, exceptionId: exId, effective: today, publishedBy: me.name, publishedById: me.id, publishedAt: today });
        delete w!.approver; delete w!.approverId;
        p.body = w!.body; p.review = DAY_FMT(addMonthsIso(today, w!.cycle));
        log(t, p, w!.ver, "EMERGENCY publish (exception " + exId + ")", reason);
        await save(t, rec); await t.audit("policy.emergency.published", `${p.id} v${w!.ver} by ${me.name}; exception ${exId} (${ap.id}) due ${due}`, "Policy");
        return ok({ exId, dueBy: due });
      }
      if (what === "owner") {
        refuse(roleBlock(me.role, "reassigning ownership", "admin"));
        const reason = txt(r.body.reason, 500); const bad = textBlock(reason, 10); if (bad) invalid(bad);
        if (named!.id === p.ownerId) invalid("The successor is already the owner.");
        if (named!.id === me.id) refuse("Segregation of duties: an admin cannot reassign a policy to themselves.");
        if (w && w.status === "In review" && w.approverId === named!.id) invalid("The successor is the named approver of the pending version. Return it to draft first.");
        const prev = p.owner; p.owner = named!.name; p.ownerId = named!.id;
        log(t, p, p.ver, "Ownership reassigned", `${prev} → ${named!.name}: ${reason}`);
        await save(t, rec); await t.audit("policy.owner.reassigned", `${p.id}: ${prev} → ${named!.name}: ${reason}`, "Policy");
        await t.notify(named!.id, `You are now the owner of policy ${p.id} ${p.name}.`);
        return ok(true);
      }
      if (what === "controls") {
        refuse(roleBlock(me.role, "mapping controls", "admin", "owner"));
        const ctrl = str(r.body.control, 40); if (!(await t.get("control", ctrl))) invalid("Unknown control.");
        if (p.mappedControls.includes(ctrl)) return ok(p);
        p.mappedControls.push(ctrl); await save(t, rec); await t.audit("policy.control.mapped", `${p.id} v${p.ver} → ${ctrl}`, "Policy");
        return ok(p);
      }
      if (what === "remind") {
        refuse(roleBlock(me.role, "sending reminders", "admin", "owner"));
        const l = live(p); if (!l) invalid("Only a published policy has acknowledgements to remind about.");
        if (p.lastRemindedAt && t.now - p.lastRemindedAt < 86400_000) invalid("A reminder was sent in the last 24 hours.");
        const acked = new Set((await t.list<Ack>("policy-ack")).map((x) => x.data).filter((a) => a.policyId === p.id && a.ver === l!.ver).map((a) => a.userId));
        const out = (await membersOf(d, me)).filter((m) => !acked.has(m.id));
        for (const m of out) await t.notify(m.id, `Please read and acknowledge policy ${p.id} ${p.name} v${l!.ver}.`);
        p.lastRemindedAt = t.now; await save(t, rec);
        await t.audit("policy.acceptance.reminded", `${p.id} v${l!.ver}, ${out.length} outstanding`, "Policy");
        return ok(out.length);
      }
      if (what === "acknowledge") return ok(await acknowledge(t, p));
      return missing("Action");
    });
  });

  const exceptionDecide = wsRoute(h, "policies", async (d, r, c) => {
    await hide(d, c, str(r.path[2], 20));
    const decision = str(r.body.decision, 10); if (decision !== "approve" && decision !== "reject") invalid("Choose approve or reject.");
    const me = c.actor;
    return tx(d, c, async (t) => {
      const rec = await policy(t, str(r.path[2], 20)); const p = rec.data; const x = p.exceptions.find((e) => e.id === str(r.path[4], 20)) ?? missing("Exception");
      const v = p.versions.find((y) => y.ver === x.ver && y.emergency);
      const a = (await t.approval(x.approvalId, EMG)) ?? missing("Request");
      refuse(policyDecideExceptionBlock(x.status, me.role, me.id === x.byId || (!!v && editorIds(v).has(me.id))),
        approvalBlock({ key: me.id, base: me.role }, { status: a.status, expiresAt: a.expiresAt, approverRoles: a.approverRoles, requestedBy: a.requestedBy, forbid: a.forbid, votes: a.votes.map((y) => y.by) }, t.now));
      const reason = txt(r.body.reason, 300); const bad = reasonBlock(reason); if (bad) invalid(bad);
      const late = x.dueBy < isoDayOf(t.now);
      if (decision === "approve") { await t.vote(a.id, reason); await t.setApproval(a.id, "Approved", reason); }
      else await t.setApproval(a.id, "Rejected", reason);
      await t.audit(`approval.policy.emergency.${decision === "approve" ? "approved" : "rejected"}`, `${a.title} (${a.id}); reason: ${reason}`, "Approval");
      x.status = decision === "approve" ? "Approved" : "Rejected"; x.decidedBy = me.name; x.decidedAt = isoDayOf(t.now);
      log(t, p, x.ver, `Emergency exception ${x.id} ${x.status.toLowerCase()}`, reason);
      await save(t, rec); await t.audit(`policy.exception.${decision === "approve" ? "approved" : "rejected"}`, `${p.id} v${x.ver} ${x.id} by ${me.name}${late ? " (after the 5 business day deadline)" : ""}`, "Policy");
      if (decision === "reject") await t.notify(p.ownerId, `The emergency change to policy ${p.id} v${x.ver} was rejected. Publish a corrective revision.`);
      return ok(x);
    });
  });

  /* ---------- My Work (Policies and Delegation tabs): published policies, my acknowledgements, my delegations, my tasks (any role with "me") ---------- */
  const meData = wsRoute(h, "me", async (d, _r, c) => ok(await tx(d, c, async (t) => {
    await sweepDelegations(t);
    const me = c.actor; const acks = (await t.list<Ack>("policy-ack")).map((x) => x.data).filter((a) => a.userId === me.id);
    const all = (await t.list<Policy>("policy")).map((x) => x.data);
    const published = all.filter((p) => live(p)).map((p) => { const l = live(p)!; return { id: p.id, name: p.name, status: "Active", ver: l.ver, owner: p.owner, body: l.body, approvedAt: l.approvedAt ?? l.publishedAt ?? "" }; });
    const mine: Record<string, { at: string; ver: string }> = {}; for (const a of acks) mine[a.policyId] = { at: DAY_FMT(a.at), ver: a.ver };
    const tasks: { id: string; title: string; policyId: string; kind: "ack" | "approve" | "publish" | "emergency" }[] = [];
    for (const p of published) if (mine[p.id]?.ver !== p.ver) tasks.push({ id: `ack-${p.id}`, title: `Read and acknowledge ${p.name} v${p.ver}`, policyId: p.id, kind: "ack" });
    for (const p of all) {
      const w = work(p); if (!w || !modAllowed(me.role, "policies")) continue;
      if (w.status === "In review" && (await actsAs(t, me, w.approverId)).ok) tasks.push({ id: `apr-${p.id}`, title: `Approve ${w.name} v${w.ver}`, policyId: p.id, kind: "approve" });
      if (w.status === "Approved" && (await actsAs(t, me, w.approverId)).ok) tasks.push({ id: `pub-${p.id}`, title: `Publish ${w.name} v${w.ver}`, policyId: p.id, kind: "publish" });
    }
    return { published, acks: mine, tasks, delegations: await delegationsOf(t, me.id) };
  })));
  const meAck = wsRoute(h, "me", async (d, r, c) => tx(d, c, async (t) => ok(await acknowledge(t, (await policy(t, str(r.body.policyId, 20))).data))));

  return {
    "GET ws/data/me": meData, "POST ws/me/acknowledgements": meAck,
    "GET ws/data/policies": data, "POST ws/policies": create, "PATCH ws/policies/:id": edit, "POST ws/policies/:id/:what": action,
    "POST ws/policies/:id/exceptions/:exId": exceptionDecide,
  };
}
export type { Ack };
