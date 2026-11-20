/* Server-only. AI governance on the server (production programme group 6; inventory group 6, section 1). The register of the company's AI
   systems, their EU AI Act classification, impact assessment, bias tests, human oversight, guardrail, signals and archive. Admins and owners
   open the module; a system's owner (by member id) may also change it. Deliberate differences from the demonstration, decided for production:
   - Everything is written to the company's own audit log (category "AI governance"), not to the platform's log.
   - A draft EU AI Act classification is a proposal: the class, tier and guardrail in force change only when an admin or owner other than the
     drafter and the system owner confirms it. A re-run never overwrites a confirmed class in place.
   - Confirming a classification may tighten the guardrail at once (two people agreed); it never loosens it: that needs the guardrail four-eyes.
     A guardrail must match the class in force (Prohibited needs Blocked, High-risk needs Restricted or Blocked), checked again on approval.
   - Completing a review needs a confirmed class, an approved impact assessment for a high-risk system and a bias test that is not failing.
   - Returning an impact assessment needs a reason and the same people rules as approving it; approving keeps the status that was recorded.
   - Evidence is a link to a real evidence record (group 1), not a file name. Archived systems are read-only.
   - Signals become real risks and issues through the Risk and Issues modules (their own audit entries), with a real owner and due date;
     dismissing one needs a reason. In production signals come from the AI Assistant's PII blocker; other sources arrive with integrations.
   - Discovered (shadow) AI starts empty: no discovery source is connected yet. */
import { isoDayOf, roleBlock } from "@/lib/rulesWs";
import type { ApprovalRow } from "../directory";
import type { Deps } from "../types";
import { registerFourEyes, pendingOf } from "./foureyes";
import { approvalsView, invalid, memberRef, membersOf, missing, ok, refuse, str, sweepApprovals, txt, wsRoute, type WsHelpers } from "./common";
import { createIssueIn } from "./issues";
import { createRiskIn } from "./risk";
import { WsConflict, type Actor, type Rec, type WsTx } from "./store";

export const AI_TIERS = ["High", "Medium", "Low"];
export const AI_AUTONOMY = ["Suggests only", "Human-approved actions", "Human-in-the-loop", "Autonomous"];
export const AI_FRIA_STATUSES = ["Not started", "In progress", "Complete", "Not required"];
export const AI_BIAS_STATUSES = ["Passed", "Issues found", "Due", "Not applicable"];
export const AI_ANNEX_AREAS = ["Biometric identification", "Critical infrastructure", "Education & vocational training", "Employment & worker management", "Essential services (incl. creditworthiness)", "Law enforcement", "Migration & border control", "Administration of justice"];
export const AI_ROLES = ["Provider", "Deployer"];
export const GUARDRAILS = ["Controlled", "Standard", "Restricted", "Blocked"]; // least to most restrictive
const AI_APPROVAL_KINDS = ["ai.guardrail", "ai.archive"];
const TTL = 24 * 3600_000;
const CAT = "AI governance";

export interface AiSignal { id: string; at: number; sev: "Info" | "Review" | "Alert"; source: string; text: string; rec: string; status: "Open" | "Risk raised" | "Issue raised" | "Dismissed"; ref?: string; reason?: string; by?: string; count?: number; day?: string }
interface Fria { status: string; date: string; by: string; byId: string; summary: string; review: "None" | "Draft" | "Submitted" | "Changes requested" | "Approved"; submittedBy: string; submittedById: string; approvedBy: string; approvedById: string; version: number; returnReason?: string }
export interface AiSystem {
  id: string; name: string; purpose: string; tier: string; status: "In review" | "Approved" | "Archived"; owner: string; ownerId: string; basis: string;
  added: string; lastReview: string; nextReview: string; surface: string; model: string; provider: string; dataReached: string; autonomy: string; users: string; tools: string; discovered: string;
  guardrail: string; euClass: string; euRationale: string; euState: { state: "Not classified" | "Draft" | "Confirmed"; draftBy: string; draftById: string; by: string; byId: string; at: string };
  euDraft?: { cls: string; rationale: string; tier: string; guardrail: string };
  fria: Fria; friaVersions: Fria[]; bias: { status: string; last: string; result: string; by: string }; oversight: string[]; signals: AiSignal[];
  evidence?: { id: string; name: string }; registeredBy: string; registeredById: string; reviewedBy?: string; builtin?: "assistant";
}
const NO_FRIA: Fria = { status: "Not started", date: "", by: "", byId: "", summary: "", review: "None", submittedBy: "", submittedById: "", approvedBy: "", approvedById: "", version: 1 };

/** The guardrail a class needs at least. */
const minGuard = (cls: string) => (cls === "Prohibited" ? "Blocked" : cls === "High-risk" ? "Restricted" : "Controlled");
export function guardrailBlock(cls: string, g: string): string | null {
  const need = minGuard(cls);
  return GUARDRAILS.indexOf(g) < GUARDRAILS.indexOf(need) ? `A ${cls.toLowerCase()} system needs at least the ${need} guardrail.` : null;
}
/** The class the three answers lead to, the rationale and the tier and guardrail it implies. */
export function classify(q: { prohibited: boolean; high: boolean; transparency: boolean; area: string; role: string }) {
  const area = AI_ANNEX_AREAS.includes(q.area) ? q.area : AI_ANNEX_AREAS[0]; const role = AI_ROLES.includes(q.role) ? q.role : "Deployer";
  if (q.prohibited) return { cls: "Prohibited", rationale: "Uses a prohibited practice under Article 5: must not be operated.", tier: "High", guardrail: "Blocked" };
  if (q.high) return { cls: "High-risk", rationale: `High-risk under Annex III (${area}); our role: ${role}. Full Article 6 obligations apply.`, tier: "High", guardrail: "Restricted" };
  if (q.transparency) return { cls: "Limited risk", rationale: "Interacts with people or generates content; Article 50 transparency obligations apply.", tier: "Medium", guardrail: "Standard" };
  return { cls: "Minimal risk", rationale: "No prohibited practice, high-risk area or transparency trigger identified; no specific obligations.", tier: "Low", guardrail: "Controlled" };
}
/** Obligations of the class in force, each judged from what is recorded (never assumed). */
function obligations(a: AiSystem): [string, string][] {
  const fria = a.fria.review === "Approved" ? "Met" : a.fria.review === "None" ? "Missing" : "Partial";
  const bias = a.bias.status === "Passed" ? "Met" : a.bias.status === "Issues found" ? "Partial" : "Missing";
  const over = a.oversight.length >= 2 ? "Met" : a.oversight.length ? "Partial" : "Missing";
  const docs = a.evidence ? "Met" : "Missing";
  const cls = a.euState.state === "Confirmed" ? a.euClass : "Not classified";
  if (cls === "High-risk" || cls === "Prohibited") return [["Risk management system (impact assessment)", fria], ["Data governance & bias testing", bias], ["Technical documentation (evidence)", docs], ["Human oversight", over], ["Guardrail at least Restricted", GUARDRAILS.indexOf(a.guardrail) >= 2 ? "Met" : "Missing"]];
  if (cls === "Limited risk") return [["Human oversight", over], ["Record-keeping (evidence)", docs], ["Transparency to users", "Not assessed"]];
  if (cls === "Minimal risk") return [["Human oversight", over === "Missing" ? "Not assessed" : over]];
  return [["EU AI Act classification confirmed", "Missing"]];
}
const stamp = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";
/** The system as the screens read it: derived lifecycle, obligations and pending markers; the draft class beside the class in force. */
async function view(t: WsTx, a: AiSystem) {
  const pend = await pendingOf(t, AI_APPROVAL_KINDS); const p = (kind: string) => pend.find((x) => x.kind === kind && x.subject === a.id)?.id;
  return {
    ...a, _init: true, lifecycle: a.status === "Archived" ? "Retired" : a.status === "In review" ? "Validation" : "Monitoring", obligations: obligations(a),
    euDraftClass: a.euDraft?.cls, euDraftRationale: a.euDraft?.rationale, evidence: a.evidence ? `${a.evidence.id} ${a.evidence.name}` : "", evidenceId: a.evidence?.id,
    signals: a.signals.map((s) => ({ ...s, at: stamp(s.at) })), guardrailPending: p("ai.guardrail"), archivePending: p("ai.archive"),
  };
}
const manageBlock = (me: Actor, a: AiSystem) => (["admin", "owner"].includes(me.role) || a.ownerId === me.id ? null : "Not permitted: only the AI system owner, an admin or an owner can change this.");
const decideBlock = (me: Actor, what: string) => roleBlock(me.role, what, "admin", "owner");
const forbidOf = (a: AiSystem, ...ids: string[]) => [...new Set([a.ownerId, ...ids].filter(Boolean))];

/** Adds a signal to the company's built-in AI Assistant system (the PII blocker); several on one day are counted on one signal. */
export async function addAssistantSignal(t: WsTx, s: { sev: AiSignal["sev"]; source: string; text: string; rec: string }) {
  const rec = (await t.list<AiSystem>("ai-system")).find((x) => x.data.builtin === "assistant" && x.data.status !== "Archived"); if (!rec) return;
  const a = rec.data; const day = isoDayOf(t.now);
  const same = a.signals.find((x) => x.status === "Open" && x.day === day && x.source === s.source && x.text === s.text);
  if (same) { same.count = (same.count ?? 1) + 1; same.at = t.now; }
  else { a.signals.unshift({ id: `S-${await t.next("ai-signal", 0)}`, at: t.now, day, status: "Open", count: 1, ...s }); a.signals = a.signals.slice(0, 200); }
  // two requests blocked at the same moment: the other one counted it; the block and its audit entry stand
  try { await t.update("ai-system", rec.id, a, rec.version); } catch (e) { if (!(e instanceof WsConflict)) throw e; }
}
/** Registers the AI Assistant itself in the AI register when a company turns AI on (once): it is an AI system the company now uses. */
export async function ensureAssistantSystem(t: WsTx, owner: { id: string; name: string }, model: string) {
  if ((await t.list<AiSystem>("ai-system")).some((x) => x.data.builtin === "assistant" && x.data.status !== "Archived")) return; // an archived one is replaced
  const id = `AI-${String(await t.next("ai-system", 0)).padStart(2, "0")}`; const today = isoDayOf(t.now);
  const a: AiSystem = {
    id, name: "Selvara AI Assistant", purpose: "Drafts answers and summaries from records a person chooses; agents suggest changes for approval.", tier: "Medium", status: "In review", owner: owner.name, ownerId: owner.id,
    basis: "Pending assessment", added: today, lastReview: "", nextReview: "", surface: "Selvara workspace (AI Assistant)", model, provider: "Anthropic (Claude API)", dataReached: "Records a person attaches to a question; agents read their trigger's records",
    autonomy: "Suggests only", users: "Company admins", tools: "Selvara workspace (read), Selvara notices (MCP grants)", discovered: "Turned on by a company admin", guardrail: "Standard", euClass: "Not classified", euRationale: "",
    euState: { state: "Not classified", draftBy: "", draftById: "", by: "", byId: "", at: "" }, fria: { ...NO_FRIA }, friaVersions: [], bias: { status: "Due", last: "", result: "", by: "" },
    oversight: ["Every answer is a draft a person reviews before use", "Agents suggest; a person other than who ran them approves each change", "A PII blocker checks every request"], signals: [],
    registeredBy: "System", registeredById: "", builtin: "assistant",
  };
  await t.insert("ai-system", id, a); await t.audit("ai.registered", `${id} ${a.name} (registered automatically when AI was turned on)`, CAT, true);
}

registerFourEyes("ai.guardrail", { mod: "ai", apply: async (_d, t, ap, by) => {
  const rec = (await t.get<AiSystem>("ai-system", String(ap.payload.id))) ?? missing("AI system"); const a = rec!.data;
  const to = String(ap.payload.to); if (!GUARDRAILS.includes(to)) invalid("Invalid guardrail tier.");
  if (a.status === "Archived") invalid("This AI system is archived.");
  if (a.guardrail !== ap.payload.from) invalid("The guardrail changed since this was requested.");
  refuse(guardrailBlock(a.euClass, to));
  a.guardrail = to; await t.update("ai-system", rec!.id, a, rec!.version);
  await t.audit("ai.guardrail.approved", `${a.id} ${a.name}: ${String(ap.payload.from)} → ${to} (approved by ${by}; requested by ${ap.requestedByName})`, CAT);
} });
registerFourEyes("ai.archive", { mod: "ai", apply: async (_d, t, ap: ApprovalRow, by) => {
  const rec = (await t.get<AiSystem>("ai-system", String(ap.payload.id))) ?? missing("AI system"); const a = rec!.data;
  if (a.status === "Archived") invalid("Already archived.");
  a.status = "Archived"; await t.update("ai-system", rec!.id, a, rec!.version);
  await t.audit("ai.archive.approved", `${a.id} ${a.name} (approved by ${by}; requested by ${ap.requestedByName})`, CAT);
} });

export function aiRoutes(h: WsHelpers) {
  const tx = <T,>(d: Deps, c: { actor: Actor }, w: (t: WsTx) => Promise<T>) => d.ws.tx(c.actor, d.now(), w);
  const load = async (t: WsTx, id: unknown) => (await t.get<AiSystem>("ai-system", str(id, 20))) ?? missing("AI system");
  /** A change to one system by someone who may manage it; archived systems are read-only. */
  const edit = (fn: (d: Deps, t: WsTx, rec: Rec<AiSystem>, b: Record<string, unknown>, path: string[], me: Actor) => Promise<unknown>, opts: { archived?: boolean } = {}) => wsRoute(h, "ai", async (d, r, c) => tx(d, c, async (t) => {
    const rec = await load(t, r.path[3]); refuse(manageBlock(c.actor, rec.data));
    if (!opts.archived && rec.data.status === "Archived") invalid("This AI system is archived and read-only.");
    const out = await fn(d, t, rec, r.body, r.path, c.actor);
    return ok({ ok: true, ...(out as object) });
  }));
  const save = (t: WsTx, rec: Rec<AiSystem>) => t.update("ai-system", rec.id, rec.data, rec.version);

  const data = wsRoute(h, "ai", async (d, _r, c) => ok(await tx(d, c, async (t) => {
    await sweepApprovals(t, AI_APPROVAL_KINDS);
    const names = new Map((await membersOf(d, c.actor)).map((m) => [m.id, m.name]));
    const systems = []; for (const x of await t.list<AiSystem>("ai-system")) systems.push(await view(t, x.data));
    return { systems, shadow: (await t.list("ai-shadow")).map((x) => x.data), approvals: await approvalsView(t, AI_APPROVAL_KINDS, names) };
  })));
  const register = wsRoute(h, "ai", async (d, r, c) => {
    refuse(decideBlock(c.actor, "registering an AI system"));
    const name = txt(r.body.name, 120); if (!name) invalid("Give the system a name.");
    const owner = await memberRef(d, c.actor, { id: r.body.ownerId, name: r.body.owner });
    return tx(d, c, async (t) => {
      const shadowId = str(r.body.shadowId, 20); const sh = shadowId ? await t.get<{ found: string; name: string }>("ai-shadow", shadowId) : null;
      const id = `AI-${String(await t.next("ai-system", 0)).padStart(2, "0")}`; const pick = (v: unknown, list: string[], fb: string) => (list.includes(String(v)) ? String(v) : fb);
      const a: AiSystem = {
        id, name, purpose: txt(r.body.purpose, 200) || "-", tier: pick(r.body.tier, AI_TIERS, "Medium"), status: "In review", owner: owner.name, ownerId: owner.id, basis: "Pending assessment",
        added: isoDayOf(t.now), lastReview: "", nextReview: "", surface: txt(r.body.surface, 120) || "Internal service", model: txt(r.body.model, 120) || "—", provider: txt(r.body.provider, 120) || "In-house",
        dataReached: txt(r.body.data, 200) || "Internal data", autonomy: pick(r.body.autonomy, AI_AUTONOMY, AI_AUTONOMY[0]), users: txt(r.body.users, 40) || "—", tools: "", discovered: sh ? sh.data.found : "Manual registration",
        guardrail: "Controlled", euClass: "Not classified", euRationale: "", euState: { state: "Not classified", draftBy: "", draftById: "", by: "", byId: "", at: "" },
        fria: { ...NO_FRIA }, friaVersions: [], bias: { status: "Due", last: "", result: "", by: "" }, oversight: [], signals: [], registeredBy: c.actor.name, registeredById: c.actor.id,
      };
      await t.insert("ai-system", id, a); await t.audit("ai.registered", `${id} ${name}`, CAT);
      if (sh) { await t.remove("ai-shadow", sh.id, sh.version); await t.audit("ai.shadow.registered", `${sh.data.name} → ${id}`, CAT); }
      if (owner.id !== c.actor.id) await t.notify(owner.id, `${c.actor.name} made you the owner of AI system ${id} ${name.slice(0, 80)}.`);
      return ok({ ok: true, id, name });
    });
  });
  const dismissShadow = wsRoute(h, "ai", async (d, r, c) => {
    refuse(decideBlock(c.actor, "dismissing discovered AI"));
    const reason = txt(r.body.reason, 300); if (reason.length < 10) invalid("Give a reason of at least 10 characters.");
    return tx(d, c, async (t) => {
      const sh = (await t.get<{ name: string }>("ai-shadow", str(r.path[3], 20))) ?? missing("Discovered AI");
      await t.remove("ai-shadow", sh!.id, sh!.version); await t.audit("ai.shadow.dismissed", `${sh!.data.name}: ${reason}`, CAT);
      // remembered, so an integration's next sync does not bring it back
      const key = sh!.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "app";
      if (!(await t.get("ai-shadow-dismissed", key))) await t.insert("ai-shadow-dismissed", key, { name: sh!.data.name, by: c.actor.name, at: t.now, reason });
      return ok(true);
    });
  });
  const update = edit(async (_d, t, rec, b) => {
    const a = rec.data; const old = a.name;
    a.name = txt(b.name, 120) || a.name; a.purpose = txt(b.purpose, 200); a.basis = txt(b.basis, 200);
    await save(t, rec); await t.audit("ai.updated", `${a.id} ${old}${old !== a.name ? ` → ${a.name}` : ""}`, CAT);
  });
  const owner = edit(async (d, t, rec, b, _p, me) => {
    const a = rec.data; const o = await memberRef(d, me, { id: b.ownerId, name: b.owner }, false); const from = a.owner;
    if (o.id === a.ownerId) invalid("That person already owns this system.");
    a.owner = o.name; a.ownerId = o.id; await save(t, rec); await t.audit("ai.owner.assigned", `${a.id} ${a.name}: ${from} → ${o.name}`, CAT);
    if (o.id !== me.id) await t.notify(o.id, `${me.name} made you the owner of AI system ${a.id} ${a.name.slice(0, 80)}.`);
  });
  const evidence = edit(async (_d, t, rec, b) => {
    const a = rec.data; const ev = (await t.get<{ name: string }>("evidence", str(b.evidenceId, 40))) ?? invalid("Choose an evidence record from the list.");
    a.evidence = { id: ev!.id, name: ev!.data.name }; await save(t, rec); await t.audit("ai.evidence.attached", `${a.id} ${a.name}: ${ev!.id} ${ev!.data.name}`, CAT);
    return { name: a.name };
  });
  const review = edit(async (_d, t, rec, b, _p, me) => {
    const a = rec.data;
    if (a.status === "In review") {
      refuse(decideBlock(me, "completing the review (approval)"));
      if (me.id === a.registeredById || me.id === a.ownerId) refuse("Segregation of duties: you registered or own this AI system, so a different admin or owner must complete its review.");
      if (a.euState.state !== "Confirmed") invalid("Confirm the EU AI Act classification first.");
      if ((a.euClass === "High-risk" || a.tier === "High") && a.fria.review !== "Approved") invalid("A high-risk system needs an approved impact assessment first.");
      if (a.euClass === "Prohibited") invalid("A prohibited system cannot be approved for use.");
      if (a.bias.status === "Issues found") invalid("The last bias test found issues. Log a passing test first.");
      a.status = "Approved"; a.lastReview = isoDayOf(t.now); a.nextReview = isoDayOf(t.now + 365 * 86400_000); a.reviewedBy = me.name;
      await save(t, rec); await t.audit("ai.review.completed", `${a.id} ${a.name}; next review ${a.nextReview}`, CAT);
      return { name: a.name, completed: true };
    }
    const reason = txt(b.reason, 300); if (reason.length < 10) invalid("Give a reason of at least 10 characters.");
    a.status = "In review"; await save(t, rec); await t.audit("ai.review.started", `${a.id} ${a.name}: ${reason}`, CAT);
    return { name: a.name, completed: false };
  });
  const archive = edit(async (_d, t, rec, _b, _p, me) => {
    const a = rec.data;
    if ((await pendingOf(t, ["ai.archive"])).some((x) => x.subject === a.id)) invalid("Archiving is already awaiting approval.");
    await t.request({ kind: "ai.archive", title: `Archive AI system ${a.name.slice(0, 80)} (${a.id})`, subject: a.id, payload: { id: a.id }, needs: 1, approverRoles: ["admin", "owner"], forbid: forbidOf(a).filter((x) => x !== me.id), ttlMs: TTL });
    await t.audit("ai.archive.requested", `${a.id} ${a.name}`, CAT);
    return { name: a.name, pending: true };
  });
  const guardrail = edit(async (_d, t, rec, b, _p, me) => {
    const a = rec.data; const g = String(b.guardrail);
    if (!GUARDRAILS.includes(g)) invalid("Choose a guardrail tier from the list.");
    if (g === a.guardrail) invalid("That is already the guardrail tier.");
    refuse(guardrailBlock(a.euClass, g));
    if ((await pendingOf(t, ["ai.guardrail"])).some((x) => x.subject === a.id)) invalid("A guardrail change is already awaiting approval.");
    await t.request({ kind: "ai.guardrail", title: `Change guardrail of ${a.name.slice(0, 80)}: ${a.guardrail} → ${g}`, subject: a.id, payload: { id: a.id, from: a.guardrail, to: g }, needs: 1, approverRoles: ["admin", "owner"], forbid: forbidOf(a).filter((x) => x !== me.id), ttlMs: TTL });
    await t.audit("ai.guardrail.change_requested", `${a.id} ${a.name}: ${a.guardrail} → ${g}`, CAT);
    return { guardrail: g, pending: true };
  });
  const euDraft = edit(async (_d, t, rec, b, _p, me) => {
    const a = rec.data; const r = classify({ prohibited: b.prohibited === true, high: b.high === true, transparency: b.transparency === true, area: str(b.area, 80), role: str(b.role, 20) });
    a.euDraft = r; a.euState = { ...a.euState, state: "Draft", draftBy: me.name, draftById: me.id }; // the class in force (and its confirmer) stay until confirmed
    await save(t, rec); await t.audit("ai.euact.drafted", `${a.id} ${a.name}: proposed ${r.cls}`, CAT);
  });
  const euConfirm = edit(async (_d, t, rec, b, _p, me) => {
    const a = rec.data; refuse(decideBlock(me, "confirming a classification"));
    if (a.euState.state !== "Draft" || !a.euDraft) invalid("There is no draft classification to confirm.");
    if (b.cls !== undefined && String(b.cls) !== a.euDraft!.cls) invalid("The draft changed since you opened it. Reload and check it before confirming.");
    if (me.id === a.euState.draftById || me.id === a.ownerId) refuse("Segregation of duties: a different person than the drafter or the system owner must confirm this classification.");
    const r = a.euDraft!; const tighter = GUARDRAILS.indexOf(r.guardrail) > GUARDRAILS.indexOf(a.guardrail);
    const from = a.euClass; a.euClass = r.cls; a.euRationale = r.rationale; a.tier = r.tier; if (tighter) a.guardrail = r.guardrail; delete a.euDraft;
    a.euState = { state: "Confirmed", draftBy: a.euState.draftBy, draftById: a.euState.draftById, by: `${me.name} (${me.role === "owner" ? "Owner" : "Admin"})`, byId: me.id, at: isoDayOf(t.now) };
    await save(t, rec);
    await t.audit("ai.euact.confirmed", `${a.id} ${a.name}: ${from} → ${r.cls}; tier ${r.tier}${tighter ? `; guardrail tightened to ${r.guardrail}` : ""}`, CAT);
    const looser = !tighter && r.guardrail !== a.guardrail && guardrailBlock(r.cls, a.guardrail) === null;
    return { note: looser ? `The guardrail stays ${a.guardrail}; request a change if ${r.guardrail} is enough.` : "" };
  });
  const friaSave = edit(async (_d, t, rec, b, _p, me) => {
    const a = rec.data; const prev = a.fria;
    if (prev.review === "Submitted") invalid("This assessment is awaiting approval and cannot be edited.");
    const st = AI_FRIA_STATUSES.includes(String(b.status)) ? String(b.status) : "Not started";
    if (prev.review === "Approved") a.friaVersions = [...a.friaVersions, { ...prev }].slice(-20);
    a.fria = { ...NO_FRIA, status: st, date: st === "Complete" ? isoDayOf(t.now) : prev.date, by: me.name, byId: me.id, summary: txt(b.summary, 2000), review: "Draft", version: prev.review === "Approved" ? prev.version + 1 : prev.version };
    await save(t, rec); await t.audit("ai.impact_assessment.recorded", `${a.id} ${a.name} v${a.fria.version}: ${st}`, CAT);
  });
  const friaSubmit = edit(async (_d, t, rec, _b, _p, me) => {
    const a = rec.data; const f = a.fria;
    if (f.review === "Approved" || f.review === "Submitted") invalid(`This assessment is already ${f.review.toLowerCase()}.`);
    if (f.review === "None" || !f.summary) invalid("Record the assessment (with a summary of findings) first.");
    f.review = "Submitted"; f.submittedBy = me.name; f.submittedById = me.id; delete f.returnReason;
    await save(t, rec); await t.audit("ai.impact_assessment.submitted", `${a.id} ${a.name} v${f.version}`, CAT);
  });
  /** Approve or return: an admin or owner other than the submitter, the author and the system owner. */
  const friaDecide = (approve: boolean) => edit(async (_d, t, rec, b, _p, me) => {
    const a = rec.data; const f = a.fria; refuse(decideBlock(me, "reviewing an impact assessment"));
    if (f.review !== "Submitted") invalid(approve ? "Nothing is awaiting approval." : "Nothing is awaiting review.");
    if ([f.submittedById, f.byId, a.ownerId].includes(me.id)) refuse(`Segregation of duties: a different person than the submitter, the author or the system owner must ${approve ? "approve" : "review"} this impact assessment.`);
    if (approve) {
      f.review = "Approved"; f.approvedBy = me.name; f.approvedById = me.id; f.date = f.date || isoDayOf(t.now);
      await save(t, rec); await t.audit("ai.impact_assessment.approved", `${a.id} ${a.name} v${f.version} (${f.status})`, CAT);
      if (f.submittedById) await t.notify(f.submittedById, `${me.name} approved the impact assessment of ${a.id} ${a.name.slice(0, 80)}.`);
      return;
    }
    const reason = txt(b.reason, 300); if (reason.length < 10) invalid("Give a reason of at least 10 characters.");
    f.review = "Changes requested"; f.returnReason = reason;
    await save(t, rec); await t.audit("ai.impact_assessment.returned", `${a.id} ${a.name} v${f.version}: ${reason}`, CAT);
    if (f.submittedById) await t.notify(f.submittedById, `${me.name} returned the impact assessment of ${a.id} ${a.name.slice(0, 80)}: ${reason.slice(0, 160)}`);
  });
  const bias = edit(async (_d, t, rec, b, _p, me) => {
    const a = rec.data; const st = AI_BIAS_STATUSES.includes(String(b.status)) ? String(b.status) : "Due";
    a.bias = { status: st, last: st === "Passed" || st === "Issues found" ? isoDayOf(t.now) : a.bias.last, result: txt(b.notes, 2000), by: me.name };
    await save(t, rec); await t.audit("ai.bias_test.logged", `${a.id} ${a.name}: ${st}`, CAT);
  });
  const oversight = edit(async (_d, t, rec, b) => {
    const a = rec.data; a.oversight = str(b.text, 20000).split("\n").map((x) => txt(x, 300)).filter(Boolean).slice(0, 30);
    await save(t, rec); await t.audit("ai.oversight.updated", `${a.id} ${a.name}: ${a.oversight.length} measures`, CAT);
  });
  /** A signal becomes a draft risk or an issue owned by the system's owner, or is dismissed with a reason. */
  const signal = edit(async (_d, t, rec, b, path, me) => {
    const a = rec.data; const s = a.signals.find((x) => x.id === str(path[5], 20)) ?? missing("Signal");
    if (s!.status !== "Open") invalid("This signal was already triaged.");
    const owner = { id: a.ownerId || me.id, name: a.owner || me.name }; const title = `AI signal: ${s!.text.slice(0, 120)} (${a.name.slice(0, 60)})`;
    const what = path[6];
    if (what === "risk") {
      const risk = await createRiskIn(t, { title: title.slice(0, 200), desc: `${s!.text}\nRecommended: ${s!.rec}`.slice(0, 1000), cat: "AI", owner, l: 3, i: 3, rl: 2, ri: 2, source: `AI signal ${s!.id} on ${a.id}` });
      s!.status = "Risk raised"; s!.ref = risk.id;
      await t.audit("ai.signal.risk_raised", `${a.id} ${a.name}: ${s!.id} → ${risk.id}`, CAT);
    } else if (what === "issue") {
      const issue = await createIssueIn(t, { title: title.slice(0, 200), sev: s!.sev === "Info" ? "Low" : s!.sev === "Alert" ? "High" : "Medium", owner, dueDate: isoDayOf(t.now + 14 * 86400_000), source: `AI signal ${s!.id} on ${a.id}` });
      s!.status = "Issue raised"; s!.ref = issue.id;
      await t.audit("ai.signal.issue_raised", `${a.id} ${a.name}: ${s!.id} → ${issue.id}`, CAT);
    } else if (what === "dismiss") {
      const reason = txt(b.reason, 300); if (reason.length < 10) invalid("Give a reason of at least 10 characters.");
      s!.status = "Dismissed"; s!.reason = reason; s!.by = me.name;
      await t.audit("ai.signal.dismissed", `${a.id} ${a.name}: ${s!.id}: ${reason}`, CAT);
    } else missing("Action");
    await save(t, rec);
    return { ref: s!.ref ?? "" };
  });
  return {
    "GET ws/data/ai": data, "POST ws/ai/systems": register, "POST ws/ai/shadow/:id/dismiss": dismissShadow,
    "POST ws/ai/systems/:id": update, "POST ws/ai/systems/:id/owner": owner, "POST ws/ai/systems/:id/evidence": evidence, "POST ws/ai/systems/:id/review": review,
    "POST ws/ai/systems/:id/archive": archive, "POST ws/ai/systems/:id/guardrail": guardrail,
    "POST ws/ai/systems/:id/eu-classification": euDraft, "POST ws/ai/systems/:id/eu-classification/confirm": euConfirm,
    "POST ws/ai/systems/:id/impact-assessment": friaSave, "POST ws/ai/systems/:id/impact-assessment/submit": friaSubmit,
    "POST ws/ai/systems/:id/impact-assessment/approve": friaDecide(true), "POST ws/ai/systems/:id/impact-assessment/return": friaDecide(false),
    "POST ws/ai/systems/:id/bias-test": bias, "POST ws/ai/systems/:id/oversight": oversight,
    "POST ws/ai/systems/:id/signals/:sid/:action": signal,
  };
}
