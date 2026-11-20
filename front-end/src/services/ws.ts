/* Production (API mode) workspace data: loads the company's records from the server into the in-memory dataset the screens already read
 * (DATA, the framework edits and the four-eyes requests), so every module keeps its full behaviour (production programme, decision D7). The
 * server decides what a person may see; this only copies it in. Writes go through wsPost/wsPatch/wsUpload, which reload the data afterwards.
 * Nothing here runs in the demonstration build. */
import { DATA, FRAMEWORK_REQS, FW_ID, refreshFrameworkCounts } from "@/lib/data";
import { WS_AUDIT } from "@/lib/audit";
import { fwEdits, touchFw } from "@/lib/frameworks";
import { approvals, type Approval } from "@/lib/approvals";
import { delegations } from "@/lib/delegation";
import { setAcks, setTasks } from "@/lib/me";
import { ACCESS_REQUESTS, ACCESS_REVIEWS, VENDOR_REQS } from "@/lib/requests";
import { RISK_ENT, RISK_PARTIES, RISK_SNAPSHOTS } from "@/lib/risk";
import { ANSWER_LIB, INCIDENT, KB_DOCS, SCHED_PACKS, STANDARD_TERMS, TRUST, TRUST_FAQ, TRUST_SUBPROC, TRUST_UPDATES } from "@/lib/trustData";
import { API_ON, modAllowed } from "@/lib/rbac";
import { SERVER_KINDS } from "@/lib/rulesWs";
import { appStore, bumpData, createStore } from "@/lib/store";
import { ApiError, apiFetch, API_BASE } from "./http";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface WsMember { id: string; name: string; role: string }
/** The company's active members (owner and assignee pickers), and what the server says about optional services. */
export interface WsTask { id: string; title: string; policyId: string; kind: "ack" | "approve" | "publish" | "emergency" }
/** Group 4 data the screens read beside DATA: the vendor's contacts and questionnaires, what was sent to a Vendor-role member, the Trust
 *  Center's public page and the incident history. */
export interface WsVendorQ { id: string; vendorId: string; vendor: string; contact: string; contactId: string; customer: string; questions: { q: string; required: boolean }[]; answers: string[]; status: string; sentBy: string; at: string; submittedAt?: string; note?: string }
export interface WsTrustPublic { company: string; chatbot: boolean; faq: { q: string; a: string }[]; subprocessors: { name: string; purpose: string; region: string }[]; updates: { at: string; title: string }[];
  controls: [string, string][]; account: { company: string; nda: string; access: string[] } | null; myRequests: { resource: string; status: string; at: string }[]; subscribed: boolean }
/** Group 5: auditors who can be given access, and the company audit log's verification and evidence packages. */
export interface WsAuditLog { firstBad: number | null; verifiedAt: string | null; verifiedBy?: string; packages: { id: string; at: string; by: string; entries: number; sha: string }[] }
export const g4Meta = createStore<{ contacts: { id: string; name: string }[]; vendorQs: WsVendorQ[]; assigned: WsVendorQ[]; trustPublic: WsTrustPublic | null; incidents: any[]; subscribers: number;
  auditors: { id: string; name: string }[]; auditlog: WsAuditLog }>({ contacts: [], vendorQs: [], assigned: [], trustPublic: null, incidents: [], subscribers: 0, auditors: [], auditlog: { firstBad: null, verifiedAt: null, packages: [] } });
/** My Work as the server computes it for the signed-in person. */
export interface WsWork {
  issues: { id: string; title: string; sev: string; status: string; dueDate: string; due: string }[];
  actions: { riskId: string; risk: string; text: string; due: string }[];
  reviews: { t: string; m: string; sev: string; path: string }[];
  kpis: { assigned: number; overdue: number; dueWeek: number; approvals: number };
}
export const wsMeta = createStore<{ members: WsMember[]; library: any[]; filesConfigured: boolean; loaded: Record<string, boolean>; error: string; tasks: WsTask[]; work: WsWork | null }>({ members: [], library: [], filesConfigured: false, loaded: {}, error: "", tasks: [], work: null });
const fill = (arr: any[], items: any[]) => { arr.length = 0; arr.push(...items); };
const setDelegations = (list: any[]) => delegations.set({ list: list.map((x) => ({ ...x, fromRoleId: "", toRoleId: "" })) });

/** The modules whose data lives on the server, in the order they are loaded. Each group of the programme adds its own. */
const LOADERS: Record<string, (b: any) => void> = {
  frameworks(b) {
    const state: Record<string, any> = b.state || {};
    const custom: any[] = b.custom || [];
    for (const c of custom) FRAMEWORK_REQS[c.id] = { g: [["", "General"]], r: c.reqs };
    const reqCount = (id: string) => FRAMEWORK_REQS[id]?.r.length ?? 0;
    DATA.frameworks = [...b.library, ...custom.map((c) => ({ id: c.id, name: c.name, kind: c.kind, region: c.region, version: c.version, custom: true }))]
      .map((f) => ({ ...f, pct: 0, gaps: 0, controls: reqCount(f.id), audit: state[f.id]?.audit || "Not scheduled" }));
    for (const f of DATA.frameworks) FW_ID[f.id] = f.name;
    const E = fwEdits.get();
    E.SCOPE = {}; E.SNOOZE = {}; E.NA = {}; E.MOD = {}; E.REQ_CTRL = {};
    for (const f of DATA.frameworks) { // a company starts with every framework out of scope; nothing is ever seeded by hashing
      const s = state[f.id] || {};
      E.SCOPE[f.id] = s.scope === true; E.SNOOZE[f.id] = !!s.snooze; E.NA[f.id] = s.na || {}; E.MOD[f.id] = s.mod || {}; E.REQ_CTRL[f.id] = s.reqCtrl || {};
    }
    touchFw();
  },
  controls(b) {
    DATA.controls = b.controls; DATA.tests = b.tests;
    wsMeta.set({ library: b.library || [] });
    setApprovals(["control.exception"], b.approvals);
  },
  policies(b) {
    DATA.policies = b.policies; setAcks(appStore.get().who || "", b.acks || {});
    setApprovals(["policy.emergency"], b.approvals); setDelegations(b.delegations || []);
  },
  /** My workspace: published policies (also for roles without the Policies module), acknowledgements, delegations, tasks. */
  me(b) {
    if (!modAllowed(appStore.get().role, "ws", "policies")) DATA.policies = b.published;
    setAcks(appStore.get().who || "", b.acks || {}); setDelegations(b.delegations || []); wsMeta.set({ tasks: b.tasks || [] }); setTasks(b.tasks || []);
  },
  people(b) { DATA.people = b.people; setApprovals(["mfa-reset-member", "offboard"], b.approvals); },
  access(b) { DATA.access = b.grants; fill(ACCESS_REQUESTS, b.requests); fill(ACCESS_REVIEWS, b.reviews); setApprovals(["access-request"], b.approvals); },
  evidence(b) {
    DATA.evidence = b.evidence;
    wsMeta.set({ filesConfigured: !!b.filesConfigured });
    setApprovals(["evidence.delete"], b.approvals);
  },
  /** The risk register, its interested parties and snapshots; enterprise roll-ups are not kept in production yet. */
  risk(b) {
    DATA.risks = b.risks; fill(RISK_PARTIES, b.parties); fill(RISK_SNAPSHOTS, b.snapshots); fill(RISK_ENT, []);
    setApprovals(["risk.board-evidence", "risk.import"], b.approvals);
  },
  issues(b) { DATA.issues = b.issues; setApprovals(["issue.close"], b.approvals); },
  reports(b) { DATA.reports = b.reports.map((x: any) => ({ ...x })); fill(SCHED_PACKS, b.schedules); setApprovals(["report.distribution"], b.approvals); },
  work(b) { wsMeta.set({ work: b }); },
  vendors(b) { DATA.vendors = b.vendors; fill(VENDOR_REQS, b.requests); setApprovals(["vendor.request.critical", "vendor.gate", "vendor.tier", "vendor.waiver"], b.approvals); g4Meta.set({ contacts: b.contacts, vendorQs: b.questionnaires }); },
  questionnaires(b) {
    DATA.questionnaires = b.questionnaires; fill(ANSWER_LIB, b.answers); fill(KB_DOCS, b.docs); setApprovals(["q.send"], b.approvals);
    g4Meta.set({ assigned: b.assigned }); if (b.filesConfigured) wsMeta.set({ filesConfigured: true });
  },
  trust(b) {
    DATA.trust = b.resources; const p = b.public; g4Meta.set({ trustPublic: p, subscribers: b.subscribers ?? 0 });
    fill(TRUST_FAQ, p.faq); fill(TRUST_SUBPROC, p.subprocessors); fill(TRUST_UPDATES, p.updates);
    TRUST.accounts = b.accounts ?? []; TRUST.requests = b.requests ?? []; TRUST.decisions = b.decisions ?? []; TRUST.blocked = b.blocked ?? []; TRUST.chats = b.chats ?? [];
    TRUST.chatbot = b.chatbot ?? p.chatbot; TRUST.activity = b.activity ?? []; TRUST.modeHist = b.modeHist ?? [];
    if (b.approvals) setApprovals(["trust.publish"], b.approvals);
    if (b.filesConfigured) wsMeta.set({ filesConfigured: true });
  },
  commitments(b) {
    DATA.commitments = b.commitments; fill(STANDARD_TERMS, b.terms);
    for (const k of Object.keys(INCIDENT)) delete (INCIDENT as any)[k];
    Object.assign(INCIDENT, b.incident); g4Meta.set({ incidents: b.incidents });
  },
  audits(b) { DATA.audits = b.audits; DATA.auditStages = b.stages; g4Meta.set({ auditors: b.auditors }); },
  /** The company's real audit log (newest 500), its verification and the evidence packages. */
  auditlog(b) {
    fill(WS_AUDIT, (b.entries as any[]).slice().reverse());
    const v = b.verification; // the last verification (verifying recomputes the whole chain, so it runs only when asked)
    g4Meta.set({ auditlog: { firstBad: v?.firstBad ?? null, verifiedAt: v?.at ?? null, verifiedBy: v?.by, packages: b.packages ?? [] } });
  },
  /** Posture figures of the modules the person cannot open (scores and statuses only, no titles or owners). Loaded last: it never replaces
   *  what a module the person can open has loaded. */
  overview(b) {
    if (b.frameworks) LOADERS.frameworks(b.frameworks);
    if (b.controls) DATA.controls = b.controls;
    if (b.risks) DATA.risks = b.risks;
    if (b.issues) DATA.issues = b.issues;
    if (b.vendors) DATA.vendors = b.vendors;
    if (b.audits) DATA.audits = b.audits;
  },

};
function setApprovals(kinds: string[], list: Approval[]) {
  approvals.set((s) => ({ list: [...list, ...s.list.filter((a) => !kinds.includes(a.kind))] }));
}

let inflight: Promise<void> | null = null;
let loadedFor = "";
/** Empties every server-backed collection (another company or role: nothing of the previous one may remain on screen). */
function clearAll() {
  DATA.frameworks = []; DATA.controls = []; DATA.tests = []; DATA.evidence = []; DATA.policies = []; DATA.people = []; DATA.access = [];
  DATA.risks = []; DATA.issues = []; DATA.reports = []; DATA.audits = []; fill(WS_AUDIT, []); DATA.vendors = []; DATA.questionnaires = []; DATA.trust = []; DATA.commitments = [];
  fill(ANSWER_LIB, []); fill(KB_DOCS, []); fill(TRUST_FAQ, []); fill(TRUST_SUBPROC, []); fill(TRUST_UPDATES, []); fill(STANDARD_TERMS, []);
  TRUST.accounts = []; TRUST.requests = []; TRUST.decisions = []; TRUST.blocked = []; TRUST.chats = []; TRUST.activity = []; TRUST.modeHist = [];
  g4Meta.set({ contacts: [], vendorQs: [], assigned: [], trustPublic: null, incidents: [], subscribers: 0, auditors: [], auditlog: { firstBad: null, verifiedAt: null, packages: [] } });
  fill(ACCESS_REQUESTS, []); fill(ACCESS_REVIEWS, []); setAcks("", {}); setTasks([]); delegations.set({ list: [] });
  fill(RISK_PARTIES, []); fill(RISK_SNAPSHOTS, []); fill(RISK_ENT, []); fill(SCHED_PACKS, []); fill(VENDOR_REQS, []);
  approvals.set((s) => ({ list: s.list.filter((a) => !SERVER_KINDS.includes(a.kind)) }));
  wsMeta.set({ members: [], library: [], loaded: {}, tasks: [], work: null });
}
/** Loads every server module the person's role may open. Safe to call often: concurrent calls share one load. */
export function loadWorkspace(): Promise<void> {
  if (!API_ON || !API_BASE) return Promise.resolve();
  if (inflight) return inflight;
  inflight = (async () => {
    const role = appStore.get().role; const key = `${appStore.get().company?.ref ?? ""}|${role}`;
    if (key !== loadedFor) { clearAll(); loadedFor = key; }
    try {
      const members = await apiFetch<WsMember[]>("/ws/members").catch(() => [] as WsMember[]);
      const loaded: Record<string, boolean> = {};
      for (const mod of Object.keys(LOADERS)) {
        if (!modAllowed(role, "ws", mod)) continue;
        LOADERS[mod](await apiFetch<any>(`/ws/data/${mod}`)); loaded[mod] = true;
      }
      refreshFrameworkCounts();
      wsMeta.set({ members, loaded, error: "" });
    } catch (e) {
      wsMeta.set({ error: e instanceof ApiError && e.status > 0 && e.status < 500 ? e.message : "Could not load your workspace. Reload the page to try again." });
    } finally { inflight = null; bumpData(); }
    // the company or role changed while loading: load again for the current one (the first result is replaced)
    if (`${appStore.get().company?.ref ?? ""}|${appStore.get().role}` !== key) await loadWorkspace();
  })();
  return inflight;
}

/** Sensitive changes (MFA resets, offboarding) need the password confirmed in the last few minutes: the prompt (components/kit/StepUp.tsx)
 *  asks once, then the change is sent again. */
export const STEP_UP = "Confirm your password first.";
export const stepUp = createStore<{ answer: ((ok: boolean) => void) | null }>({ answer: null });
const askPassword = () => new Promise<boolean>((resolve) => stepUp.set({ answer: (ok) => { stepUp.set({ answer: null }); resolve(ok); } }));
const send = async <T,>(path: string, init: RequestInit): Promise<T> => {
  let out: T;
  try { out = await apiFetch<T>(path, init); }
  catch (e) {
    if (!(e instanceof ApiError && e.status === 403 && e.message === STEP_UP) || !(await askPassword())) throw e;
    out = await apiFetch<T>(path, init);
  }
  await loadWorkspace(); return out;
};
/** A change on the server, then a reload of the workspace data so every screen shows the result. */
export const wsPost = <T,>(path: string, body: unknown = {}) => send<T>(path, { method: "POST", body: JSON.stringify(body) });
export const wsPatch = <T,>(path: string, body: unknown) => send<T>(path, { method: "PATCH", body: JSON.stringify(body) });
/** Uploads a file's bytes (the server checks type, size and content). */
export async function wsUpload<T>(path: string, file: File): Promise<T> {
  const res = await fetch(`${API_BASE}${path}${path.includes("?") ? "&" : "?"}name=${encodeURIComponent(file.name)}`, {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/octet-stream", Accept: "application/json" }, body: file,
  });
  if (!res.ok) { let m = `${res.status} ${res.statusText}`; try { const j = await res.json(); if (j && typeof j.error === "string") m = j.error; } catch { /* no JSON */ } throw new ApiError(res.status, m); }
  const out = (res.status === 204 ? undefined : await res.json()) as T; await loadWorkspace(); return out;
}
