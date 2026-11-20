/* Production (API mode) workspace data: loads the company's records from the server into the in-memory dataset the screens already read
 * (DATA, the framework edits and the four-eyes requests), so every module keeps its full behaviour (production programme, decision D7). The
 * server decides what a person may see; this only copies it in. Writes go through wsPost/wsPatch/wsUpload, which reload the data afterwards.
 * Nothing here runs in the demonstration build. */
import { DATA, FRAMEWORK_REQS, FW_ID, refreshFrameworkCounts } from "@/lib/data";
import { fwEdits, touchFw } from "@/lib/frameworks";
import { approvals, type Approval } from "@/lib/approvals";
import { delegations } from "@/lib/delegation";
import { setAcks, setTasks } from "@/lib/me";
import { ACCESS_REQUESTS, ACCESS_REVIEWS } from "@/lib/requests";
import { API_ON, modAllowed } from "@/lib/rbac";
import { SERVER_KINDS } from "@/lib/rulesWs";
import { appStore, bumpData, createStore } from "@/lib/store";
import { ApiError, apiFetch, API_BASE } from "./http";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface WsMember { id: string; name: string; role: string }
/** The company's active members (owner and assignee pickers), and what the server says about optional services. */
export interface WsTask { id: string; title: string; policyId: string; kind: "ack" | "approve" | "publish" | "emergency" }
export const wsMeta = createStore<{ members: WsMember[]; library: any[]; filesConfigured: boolean; loaded: Record<string, boolean>; error: string; tasks: WsTask[] }>({ members: [], library: [], filesConfigured: false, loaded: {}, error: "", tasks: [] });
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
};
function setApprovals(kinds: string[], list: Approval[]) {
  approvals.set((s) => ({ list: [...list, ...s.list.filter((a) => !kinds.includes(a.kind))] }));
}

let inflight: Promise<void> | null = null;
let loadedFor = "";
/** Empties every server-backed collection (another company or role: nothing of the previous one may remain on screen). */
function clearAll() {
  DATA.frameworks = []; DATA.controls = []; DATA.tests = []; DATA.evidence = []; DATA.policies = []; DATA.people = []; DATA.access = [];
  fill(ACCESS_REQUESTS, []); fill(ACCESS_REVIEWS, []); setAcks("", {}); setTasks([]); delegations.set({ list: [] });
  approvals.set((s) => ({ list: s.list.filter((a) => !SERVER_KINDS.includes(a.kind)) }));
  wsMeta.set({ members: [], library: [], loaded: {}, tasks: [] });
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
