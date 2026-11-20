/* Server-only. Frameworks, Controls and Tests on the server (production programme group 1; inventory: docs/architecture/inventory/group1-*.md).
   Every rule is the shared one in src/lib/rulesWs.ts (the demonstration explains with the same functions); people are compared by user id.
   Differences from the demonstration, on purpose (listed in the PR): the requirement-side and control-side mappings are kept in step (the
   demonstration lets them drift), a framework's version is stored, a company adopts controls from the shared library instead of starting
   with synthetic ones, nothing is seeded by hashing, a manual test's result is recorded by a person, and there is no simulated ticketing. Also: frameworks start out of
   scope, only one exception request may be pending per control and its requester may withdraw it, custom control ids never take a library id. */
import {
  CONTROL_STATUSES, EXCEPTION_TTL_H, FW_KINDS, FW_MAX_LINES, TEST_RESULTS, attestBlock, decideExceptionBlock, exceptionInputBlock, exceptionStateOf, fwAddBlock,
  fwAdminBlock, fwIdFor, fwNaBlock, isoDayOf, manageControlsBlock, requestExceptionBlock, runTestsBlock, setStatusBlock, statusFromTests, textBlock,
} from "@/lib/rulesWs";
import { approvalBlock, reasonBlock } from "@/lib/rules";
import type { Deps } from "../types";
import { LIB_CONTROLS, LIB_FRAMEWORKS, LIB_REQS } from "./catalogue";
import { approvalsView, invalid, memberRef, membersOf, missing, ok, refuse, str, sweepApprovals, txt, wsRoute, type WsHelpers } from "./common";
import { WsConflict, type Rec, type WsTx } from "./store";

export interface Exception { id: string; requestedBy: string; requestedById: string; at: string; reason: string; compensating: string; expires: string; approvalId: string; expiryLogged?: boolean }
export interface Control { id: string; title: string; domain: string; owner: string; ownerId: string; status: string; map: Record<string, string[]>; custom?: boolean; library?: boolean; attestation?: { by: string; byId: string; at: string; note: string }; exceptions?: Exception[] }
export interface Test { id: string; name: string; source: string; controls: string[]; logic: string; result: string; cadence: string; last: string; items: { item: string; result: string }[]; note?: string; /** Automated (integration) tests: when the provider last answered. */ syncedAt?: number }
/** An integration's automated test (server/ws/integrations.ts): recorded only by its sync, never by hand. */
export const isAutomated = (id: string) => id.startsWith("AT-");
const AUTOMATED_STALE = 3 * 86_400_000;
export interface FwState { scope?: boolean; snooze?: boolean; na: Record<string, { reason: string; by: string; byId: string; date: string }>; mod: Record<string, { by: string; date: string }>; reqCtrl: Record<string, string[]>; audit?: string }
export interface FwCustom { name: string; short: string; kind: string; region: string; version: string; reqs: string[][] }

const EXC = ["control.exception"];
export const CONTROL_DOMAINS = ["Governance", "Identity & Access", "Operations", "Cryptography", "Network", "Logging", "Business Continuity", "Third Party", "Privacy", "AI"];
const stamp = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";

/* ---------- helpers over the records ---------- */
const fwExists = async (t: WsTx, fw: string) => LIB_FRAMEWORKS.some((f) => f.id === fw) || !!(await t.get("fw-custom", fw));
async function reqsOf(t: WsTx, fw: string): Promise<string[][] | null> {
  if (LIB_REQS[fw]) return LIB_REQS[fw].r;
  const c = await t.get<FwCustom>("fw-custom", fw); return c ? c.data.reqs : null;
}
async function fwState(t: WsTx, fw: string): Promise<Rec<FwState> | { id: string; data: FwState; version: 0 }> {
  return (await t.get<FwState>("fw", fw)) ?? { id: fw, data: { na: {}, mod: {}, reqCtrl: {} }, version: 0 };
}
async function saveFw(t: WsTx, s: { id: string; data: FwState; version: number }) {
  if (s.version === 0) await t.insert("fw", s.id, s.data); else await t.update("fw", s.id, s.data, s.version);
}
async function control(t: WsTx, id: string) { return (await t.get<Control>("control", id)) ?? missing("Control"); }
/** Re-derives the status of these controls from their linked tests (automatic; audited when it changes). */
export async function followTests(t: WsTx, ids: string[]) {
  const tests = (await t.list<Test>("test")).map((x) => x.data);
  for (const id of new Set(ids)) {
    const c = await t.get<Control>("control", id); if (!c) continue;
    const next = statusFromTests(tests.filter((x) => x.controls.includes(id)).map((x) => x.result));
    if (next && next !== c.data.status) {
      const from = c.data.status; c.data.status = next; await t.update("control", id, c.data, c.version);
      await t.audit("control.status.followed-tests", `${id}: ${from} → ${next} (automated tests)`);
    }
  }
}
/** Adds or removes a control on a requirement, on both sides: the framework's requirement map (readiness) and the control's mappings. */
async function setMapping(t: WsTx, fw: string, req: string, ctrlId: string, on: boolean, by: string) {
  const s = await fwState(t, fw); const list = s.data.reqCtrl[req] ?? [];
  const has = list.includes(ctrlId);
  if (on && !has) s.data.reqCtrl[req] = [...list, ctrlId];
  if (!on && has) { s.data.reqCtrl[req] = list.filter((x) => x !== ctrlId); if (!s.data.reqCtrl[req].length) delete s.data.reqCtrl[req]; }
  s.data.mod[req] = { by, date: isoDayOf(t.now) };
  await saveFw(t, s);
  const c = await t.get<Control>("control", ctrlId); if (!c) return;
  const refs = c.data.map[fw] ?? [];
  if (on && !refs.includes(req)) c.data.map[fw] = [...refs, req];
  else if (!on && refs.includes(req)) { c.data.map[fw] = refs.filter((x) => x !== req); if (!c.data.map[fw].length) delete c.data.map[fw]; }
  else return;
  await t.update("control", ctrlId, c.data, c.version);
}
async function newControlId(t: WsTx, domain: string) {
  const pre = (domain.match(/[A-Z]/g) || ["C"]).slice(0, 3).join("");
  for (let i = 0; i < 1000; i++) { const id = `${pre}-${await t.next(`control-${pre.toLowerCase()}`, 0)}`; if (!LIB_CONTROLS.some((l) => l.id === id) && !(await t.get("control", id))) return id; } // library ids stay free for adoption
  throw new WsConflict("Could not find a free control id. Try again.");
}

/* ---------- reads ---------- */
async function controlsData(d: Deps, t: WsTx) {
  await sweepApprovals(t, EXC);
  const today = isoDayOf(t.now); const aps = await t.approvals(EXC);
  for (const c of await t.list<Control>("control")) { // an approved exception that ran out is recorded once
    let changed = false;
    for (const x of c.data.exceptions ?? []) {
      const a = aps.find((y) => y.id === x.approvalId);
      if (!x.expiryLogged && a?.status === "Approved" && exceptionStateOf(a.status, x.expires, today) === "Expired") { x.expiryLogged = true; changed = true; await t.audit("control.exception.expired", `${c.id} ${x.id} expired ${x.expires}`); }
    }
    if (changed) await t.update("control", c.id, c.data, c.version);
  }
  // an automated Pass not refreshed for 3 days needs data again (no scheduler: syncs run when an admin opens Integrations)
  const stale: string[] = [];
  for (const x of await t.list<Test>("test")) {
    if (isAutomated(x.id) && x.data.result === "Pass" && x.data.syncedAt && t.now - x.data.syncedAt > AUTOMATED_STALE) {
      Object.assign(x.data, { result: "Needs data", items: [], note: "Not refreshed for 3 days: an admin opens Integrations to sync it." }); await t.update("test", x.id, x.data, x.version);
      await t.audit("test.result.recorded", `${x.id} ${x.data.name}: Needs data by System: not refreshed for 3 days`, "Control", true); stale.push(...x.data.controls);
    }
  }
  if (stale.length) await followTests(t, stale);
  const members = await membersOf(d, t.actor); const names = new Map(members.map((m) => [m.id, m.name]));
  // automated tests name employees' accounts as evidence: only admins (who see them in Integrations anyway) get those names
  const tests = (await t.list<Test>("test")).map((x) => x.data).map((x) => (isAutomated(x.id) && t.actor.role !== "admin" && x.items.length ? { ...x, items: [{ item: `${x.items.length} item${x.items.length === 1 ? "" : "s"} (an admin sees them in Integrations)`, result: x.result }] } : x));
  return { controls: (await t.list<Control>("control")).map((x) => x.data), tests, approvals: await approvalsView(t, EXC, names), members, library: LIB_CONTROLS };
}
async function frameworksData(t: WsTx) {
  const state: Record<string, FwState> = {}; for (const s of await t.list<FwState>("fw")) state[s.id] = s.data;
  return { library: LIB_FRAMEWORKS, state, custom: (await t.list<FwCustom>("fw-custom")).map((x) => ({ id: x.id, ...x.data })) };
}

export function assuranceRoutes(h: WsHelpers) {
  const tx = <T,>(d: Deps, c: { actor: import("./store").Actor }, w: (t: WsTx) => Promise<T>) => d.ws.tx(c.actor, d.now(), w);

  /* ----- frameworks ----- */
  const fwData = wsRoute(h, "frameworks", async (d, _r, c) => ok(await tx(d, c, frameworksData)));
  const fwFlag = wsRoute(h, "frameworks", async (d, r, c) => {
    const fw = str(r.path[2], 80); const what = r.path[3]; const on = r.body.on === true;
    if (what !== "scope" && what !== "snooze") return missing("Setting");
    refuse(fwAdminBlock(c.actor.role));
    return tx(d, c, async (t) => {
      if (!(await fwExists(t, fw))) missing("Framework");
      const s = await fwState(t, fw);
      if (what === "scope") s.data.scope = on; else s.data.snooze = on;
      await saveFw(t, s);
      await t.audit(what === "scope" ? (on ? "framework.scope.in" : "framework.scope.out") : on ? "framework.snoozed" : "framework.resumed", fw);
      return ok();
    });
  });
  const fwAdd = wsRoute(h, "frameworks", async (d, r, c) => {
    refuse(fwAdminBlock(c.actor.role));
    const short = txt(r.body.short, 40); const name = txt(r.body.name, 120) || short; const version = txt(r.body.version, 40);
    const kind = (FW_KINDS as readonly string[]).includes(str(r.body.kind, 20)) ? str(r.body.kind, 20) : "Standard"; const region = txt(r.body.region, 60) || "Global";
    const template = str(r.body.template, 40) || null;
    const raw = Array.isArray(r.body.lines) ? r.body.lines : String(r.body.lines ?? "").split("\n");
    const lines = raw.map((x: unknown) => txt(x, 200)).filter(Boolean);
    if (lines.length > FW_MAX_LINES) invalid(`At most ${FW_MAX_LINES} requirements.`);
    const id = fwIdFor(short, template && /^[a-z0-9-]{2,40}$/.test(template) ? template : null);
    return tx(d, c, async (t) => {
      const bad = fwAddBlock({ short, exists: await fwExists(t, id), lines }); if (bad) invalid(bad);
      await t.insert("fw-custom", id, { name, short, kind, region, version, reqs: lines.map((l: string, i: number) => [`R${i + 1}`, l, "", ""]) } satisfies FwCustom);
      await t.audit("framework.added", name);
      return ok({ id });
    });
  });
  const fwMap = wsRoute(h, "frameworks", async (d, r, c) => {
    const fw = str(r.path[2], 80); const req = str(r.path[4], 80); const ctrl = str(r.body.control, 40); const on = r.body.on !== false;
    refuse(fwAdminBlock(c.actor.role));
    if (!ctrl) invalid("Choose a control first.");
    return tx(d, c, async (t) => {
      const reqs = await reqsOf(t, fw); if (!reqs) missing("Framework");
      if (!reqs!.some((x) => x[0] === req)) missing("Requirement");
      await control(t, ctrl);
      await setMapping(t, fw, req, ctrl, on, c.actor.name);
      await t.audit(on ? "framework.req.map" : "framework.req.unmap", `${fw} ${req} ${on ? "←" : "✕"} ${ctrl}`);
      return ok();
    });
  });
  const fwNa = wsRoute(h, "frameworks", async (d, r, c) => {
    const fw = str(r.path[2], 80); const req = str(r.path[4], 80); const on = r.body.on !== false; const reason = txt(r.body.reason, 500);
    refuse(fwAdminBlock(c.actor.role));
    if (on) { const bad = fwNaBlock(reason); if (bad) invalid(bad); }
    return tx(d, c, async (t) => {
      const reqs = await reqsOf(t, fw); if (!reqs) missing("Framework");
      if (!reqs!.some((x) => x[0] === req)) missing("Requirement");
      const s = await fwState(t, fw);
      if (on) s.data.na[req] = { reason, by: c.actor.name, byId: c.actor.id, date: isoDayOf(t.now) };
      else if (s.data.na[req]) delete s.data.na[req]; else return ok();
      await saveFw(t, s);
      await t.audit(on ? "framework.req.na" : "framework.req.applicable", `${fw} ${req}`);
      return ok();
    });
  });

  /* ----- controls ----- */
  const ctrlData = wsRoute(h, "controls", async (d, _r, c) => ok(await tx(d, c, (t) => controlsData(d, t))));
  const ctrlCreate = wsRoute(h, "controls", async (d, r, c) => {
    refuse(manageControlsBlock(c.actor.role));
    const title = txt(r.body.title, 200); if (!title) invalid("Control title is required.");
    const domain = CONTROL_DOMAINS.includes(str(r.body.domain, 40)) ? str(r.body.domain, 40) : CONTROL_DOMAINS[0];
    const owner = await memberRef(d, c.actor, { id: r.body.ownerId, name: r.body.owner });
    return tx(d, c, async (t) => {
      const id = await newControlId(t, domain);
      await t.insert("control", id, { id, title, domain, owner: owner.name, ownerId: owner.id, status: "Needs evidence", map: {}, custom: true } satisfies Control);
      await t.audit("control.created", `${id}, ${title}`);
      return ok({ id });
    });
  });
  /** Adopts controls from the shared library: the company's own copy, owned by a member, with the library's framework mappings. */
  const ctrlAdopt = wsRoute(h, "controls", async (d, r, c) => {
    refuse(manageControlsBlock(c.actor.role));
    const ids = (Array.isArray(r.body.ids) ? r.body.ids : []).map((x: unknown) => str(x, 40)).slice(0, 200) as string[];
    const picks = LIB_CONTROLS.filter((l) => ids.includes(l.id)); if (!picks.length) invalid("Choose at least one control from the library.");
    const owner = await memberRef(d, c.actor, { id: r.body.ownerId });
    return tx(d, c, async (t) => {
      const added: string[] = [];
      for (const l of picks) {
        if (await t.get("control", l.id)) continue; // already adopted
        await t.insert("control", l.id, { id: l.id, title: l.title, domain: l.domain, owner: owner.name, ownerId: owner.id, status: "Needs evidence", map: structuredClone(l.map), library: true } satisfies Control);
        for (const [fw, refs] of Object.entries(l.map)) { // the library's mappings that name a catalogue requirement count towards readiness
          const known = new Set((LIB_REQS[fw]?.r ?? []).map((x) => x[0]));
          for (const ref of refs) if (known.has(ref)) { const s = await fwState(t, fw); if (!(s.data.reqCtrl[ref] ?? []).includes(l.id)) { s.data.reqCtrl[ref] = [...(s.data.reqCtrl[ref] ?? []), l.id]; await saveFw(t, s); } }
        }
        added.push(l.id);
      }
      if (added.length) await t.audit("control.adopted", `${added.length} from the library: ${added.join(", ")}; owner ${owner.name}`);
      return ok({ added });
    });
  });
  const ctrlAction = wsRoute(h, "controls", async (d, r, c) => {
    const id = str(r.path[2], 40); const action = r.path[3]; const me = c.actor;
    return tx(d, c, async (t) => {
      const rec = await control(t, id); const x = rec.data; const isOwner = x.ownerId === me.id;
      if (action === "attestation") {
        refuse(attestBlock(me.role, isOwner, x.owner));
        const note = txt(r.body.note, 500); const bad = textBlock(note, 1, "A statement"); if (bad) invalid(bad);
        x.attestation = { by: me.name, byId: me.id, at: isoDayOf(t.now), note };
        await t.update("control", id, x, rec.version); await t.audit("control.attested", `${id} by ${me.name}`);
        return ok(x.attestation);
      }
      if (action === "status") {
        const linked = (await t.list<Test>("test")).filter((y) => y.data.controls.includes(id)).length;
        refuse(setStatusBlock(me.role, isOwner, x.owner, linked));
        const status = str(r.body.status, 30); if (!(CONTROL_STATUSES as readonly string[]).includes(status)) invalid("Unknown status.");
        const reason = txt(r.body.reason, 500); const bad = textBlock(reason, 10); if (bad) invalid(bad);
        const from = x.status; x.status = status;
        await t.update("control", id, x, rec.version); await t.audit("control.status.changed", `${id}: ${from} → ${status} by ${me.name}: ${reason}`);
        return ok(true);
      }
      if (action === "exceptions") {
        refuse(requestExceptionBlock(me.role));
        const input = { reason: txt(r.body.reason, 500), compensating: txt(r.body.compensating, 500), expires: str(r.body.expires, 10) };
        const bad = exceptionInputBlock(input, t.now); if (bad) invalid(bad);
        const aps = await t.approvals(EXC);
        if ((x.exceptions ?? []).some((e) => exceptionStateOf(aps.find((a) => a.id === e.approvalId)?.status, e.expires, isoDayOf(t.now)) === "Pending")) invalid("An exception request for this control is already pending.");
        const a = await t.request({ kind: "control.exception", title: `Exception for ${id} ${x.title}`, subject: id, payload: { controlId: id, expires: input.expires }, needs: 1, approverRoles: ["admin", "owner"], forbid: [x.ownerId], ttlMs: EXCEPTION_TTL_H * 3600_000 });
        (x.exceptions ??= []).push({ id: `EX-${await t.next("exception", 0)}`, requestedBy: me.name, requestedById: me.id, at: isoDayOf(t.now), ...input, approvalId: a.id });
        await t.update("control", id, x, rec.version); await t.audit("control.exception.requested", `${id} ${a.id} until ${input.expires} by ${me.name}`);
        return ok(a.id);
      }
      if (action === "mappings") {
        refuse(manageControlsBlock(me.role));
        const fw = str(r.body.fw, 80); const ref = txt(r.body.ref, 40); if (!ref) invalid("Requirement code is required.");
        if (!(await fwExists(t, fw))) missing("Framework");
        if ((x.map[fw] ?? []).includes(ref)) return ok(x.map);
        x.map[fw] = [...(x.map[fw] ?? []), ref];
        await t.update("control", id, x, rec.version);
        const reqs = await reqsOf(t, fw);
        if (reqs?.some((q) => q[0] === ref)) await setMapping(t, fw, ref, id, true, me.name); // a catalogue requirement: it counts towards readiness too
        await t.audit("control.mapping.added", `${id} → ${fw} ${ref}`);
        return ok((await control(t, id)).data.map);
      }
      if (action === "evidence-request") {
        refuse(runTestsBlock(me.role));
        await t.notify(x.ownerId, `${me.name} asked for evidence for control ${id} (${x.title}).`);
        await t.audit("control.evidence.requested", `${id} from ${x.owner} by ${me.name}`);
        return ok();
      }
      if (action === "owner") {
        refuse(manageControlsBlock(me.role));
        const o = await memberRef(d, me, { id: r.body.ownerId }, false);
        if (o.id === x.ownerId) return ok();
        const from = x.owner; x.owner = o.name; x.ownerId = o.id;
        await t.update("control", id, x, rec.version); await t.audit("control.owner.changed", `${id}: ${from} → ${o.name}`);
        return ok();
      }
      return missing("Action");
    });
  });
  const exceptionDecide = wsRoute(h, "controls", async (d, r, c) => {
    const id = str(r.path[2], 40); const exId = str(r.path[4], 60); const decision = str(r.body.decision, 10); const me = c.actor;
    if (!["approve", "reject", "withdraw"].includes(decision)) invalid("Choose approve, reject or withdraw.");
    return tx(d, c, async (t) => {
      const rec = await control(t, id); const x = (rec.data.exceptions ?? []).find((e) => e.id === exId) ?? missing("Exception");
      const a = (await t.approval(x.approvalId, EXC)) ?? missing("Request");
      if (decision === "withdraw") {
        if (a.requestedBy !== me.id) refuse("Only the requester can withdraw a request.");
        if (a.status !== "Pending") refuse(`Request is ${a.status.toLowerCase()}.`);
        await t.setApproval(a.id, "Withdrawn"); await t.audit("approval.control.exception.withdrawn", `${a.title} (${a.id})`, "Approval");
        await t.audit("control.exception.withdrawn", `${id} ${x.id} by ${me.name}`);
        return ok(true);
      }
      const state = exceptionStateOf(a.status === "Pending" && a.expiresAt <= t.now ? "Expired" : a.status, x.expires, isoDayOf(t.now));
      refuse(decideExceptionBlock(state, me.role, me.id === x.requestedById || me.id === rec.data.ownerId),
        approvalBlock({ key: me.id, base: me.role }, { status: a.status, expiresAt: a.expiresAt, approverRoles: a.approverRoles, requestedBy: a.requestedBy, forbid: a.forbid, votes: a.votes.map((v) => v.by) }, t.now));
      const reason = txt(r.body.reason, 300); const bad = reasonBlock(reason); if (bad) invalid(bad);
      if (decision === "approve") { await t.vote(a.id, reason); await t.setApproval(a.id, "Approved", reason); await t.audit("approval.control.exception.approved", `${a.title} (${a.id}); reason: ${reason}`, "Approval"); }
      else { await t.setApproval(a.id, "Rejected", reason); await t.audit("approval.control.exception.rejected", `${a.title} (${a.id}); reason: ${reason}`, "Approval"); }
      await t.audit(`control.exception.${decision === "approve" ? "approved" : "rejected"}`, `${id} ${x.id} by ${me.name} (requester ${x.requestedBy}), expires ${x.expires}`);
      return ok(true);
    });
  });

  /* ----- tests ----- */
  const testCreate = wsRoute(h, "controls", async (d, r, c) => {
    refuse(manageControlsBlock(c.actor.role));
    const name = txt(r.body.name, 200); if (!name) invalid("Test name is required.");
    const ctrl = str(r.body.control, 40);
    return tx(d, c, async (t) => {
      if (ctrl) await control(t, ctrl);
      const id = `TST-${String(await t.next("test", 6)).padStart(2, "0")}`;
      await t.insert("test", id, { id, name, source: txt(r.body.source, 80) || "Custom", controls: ctrl ? [ctrl] : [], logic: txt(r.body.logic, 500) || "Custom condition", result: "Needs data", cadence: "On demand", last: "Not yet run", items: [] } satisfies Test);
      await t.audit("test.created", name);
      return ok({ id });
    });
  });
  const testAction = wsRoute(h, "controls", async (d, r, c) => {
    const id = str(r.path[2], 40); const action = r.path[3];
    return tx(d, c, async (t) => {
      const rec = (await t.get<Test>("test", id)) ?? missing("Test");
      if (action === "run") {
        refuse(runTestsBlock(c.actor.role));
        rec.data.last = stamp(t.now); await t.update("test", id, rec.data, rec.version); await t.audit("test.run", rec.data.name);
        await followTests(t, rec.data.controls); return ok(true);
      }
      if (action === "result") { // a manual test: a person records what they found
        refuse(runTestsBlock(c.actor.role));
        if (isAutomated(id)) refuse("This test is recorded by its integration. Sync it in Integrations instead.");
        const result = str(r.body.result, 20); if (!(TEST_RESULTS as readonly string[]).includes(result)) invalid("Choose Pass, Fail or Needs data.");
        const note = txt(r.body.note, 500); const bad = textBlock(note, 10, "A note on what was checked"); if (bad) invalid(bad);
        rec.data.result = result; rec.data.note = note; rec.data.last = stamp(t.now);
        await t.update("test", id, rec.data, rec.version); await t.audit("test.result.recorded", `${id} ${rec.data.name}: ${result} by ${c.actor.name}: ${note}`);
        await followTests(t, rec.data.controls); return ok(true);
      }
      if (action === "deactivate") {
        refuse(manageControlsBlock(c.actor.role));
        if (isAutomated(id)) refuse("This test belongs to an integration. Disconnect the integration, or unlink the test from controls in Integrations.");
        await t.remove("test", id, rec.version); await t.audit("test.deactivated", id);
        await followTests(t, rec.data.controls); return ok(true);
      }
      return missing("Action");
    });
  });
  const testSync = wsRoute(h, "controls", async (d, _r, c) => {
    refuse(runTestsBlock(c.actor.role));
    return tx(d, c, async (t) => {
      const all = (await t.list<Test>("test")).filter((x) => !isAutomated(x.id)); // an automated test's time is its last sync, never re-stamped
      for (const x of all) { x.data.last = stamp(t.now); await t.update("test", x.id, x.data, x.version); }
      await t.audit("tests.synced", `${all.length} tests`);
      await followTests(t, all.flatMap((x) => x.data.controls)); return ok(true);
    });
  });

  return {
    "GET ws/data/frameworks": fwData, "POST ws/frameworks": fwAdd, "POST ws/frameworks/:id/:what": fwFlag,
    "POST ws/frameworks/:id/requirements/:req/map": fwMap, "POST ws/frameworks/:id/requirements/:req/na": fwNa,
    "GET ws/data/controls": ctrlData, "POST ws/controls": ctrlCreate, "POST ws/controls/adopt": ctrlAdopt, "POST ws/controls/:id/:action": ctrlAction,
    "POST ws/controls/:id/exceptions/:exId": exceptionDecide,
    "POST ws/tests": testCreate, "POST ws/tests/sync": testSync, "POST ws/tests/:id/:action": testAction,
  };
}
