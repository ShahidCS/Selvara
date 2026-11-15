/* Demo sign-in (DEMO ONLY: there is no backend). Seeded synthetic accounts, one per persona, plus people who asked to join and were approved by a
   company admin. Passwords are compared as SHA-256 hashes; no password is stored in plain text. This is NOT an authentication control: the real
   API must authenticate on the server (hashing with a slow KDF such as Argon2id, rate limits, MFA, session management) and never trust the client.
   Demo account emails and the shared demo password are documented in README.md only, not shown in the product. */
import { ROLES, roleOf, setSessionPerson } from "./rbac";
import { clampText, isEmail, secureHex } from "./security";
import { checkPassword, THROTTLED_MSG } from "./credentials";
import { appStore, bumpData, persist } from "./store";
import { wsLog } from "./audit";
import { adminLog } from "./adminAudit";
import { elevationActive, endElevation } from "./elevation";

/** Sign-in events go to the audit log of the space the person works in. */
function logAuth(action: string) {
  const r = roleOf(appStore.get().role);
  if (r.spaces.includes("ws")) wsLog(action, r.person, "Access"); else adminLog(action, r.person, { categories: ["Account"] });
}

export const DEMO_DOMAIN = "demo.selvara.test";
/** "Jordan Avery" -> "jordan.avery@demo.selvara.test". */
export const demoEmail = (person: string) => person.toLowerCase().replace(/[^a-z ]/g, "").trim().split(/\s+/).join(".") + "@" + DEMO_DOMAIN;
export interface DemoAccount { email: string; roleId: string; person: string; roleName: string }
export const DEMO_ACCOUNTS: DemoAccount[] = ROLES.map((r) => ({ email: demoEmail(r.person), roleId: r.id, person: r.person, roleName: r.name }));
/** SHA-256 of "selvara-demo-account:" + the shared demo password. */
const DEMO_HASH = "c41d1a8e807d77066e922a9f54a0bd6abca4807b003cfff3bd159f165ed81368";
/** Role a person who joins through a request receives. Anything more is a separate, approved role change. */
export const JOIN_ROLE = "employee";
export const JOIN = { REASON_MIN: 10, MAX_FAILS: 5, LOCK_MS: 5 * 60_000 };
export const SIGNIN_FAILED = "Email or password is incorrect.";

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}
const norm = (email: string) => String(email ?? "").trim().toLowerCase();

/* ---------- people who asked to join ---------- */
export type JoinStatus = "Pending" | "Active" | "Rejected";
export interface JoinRequest { id: string; name: string; email: string; salt: string; hash: string; status: JoinStatus; requestedAt: number; decidedBy?: string; decidedAt?: number; reason?: string }
const KEY = "selvara.demo.members";
let MEMBERS: JoinRequest[] | null = null;
function members(): JoinRequest[] {
  if (MEMBERS) return MEMBERS;
  MEMBERS = [];
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (Array.isArray(list)) MEMBERS = list.filter((m) => m && typeof m.email === "string" && typeof m.hash === "string" && typeof m.name === "string").slice(0, 200);
  } catch { /* unreadable: start empty */ }
  return MEMBERS;
}
export function saveJoinRequests() { try { localStorage.setItem(KEY, JSON.stringify(members())); } catch { /* storage unavailable: kept in memory */ } bumpData(); }
export const joinRequests = (): JoinRequest[] => members();
/** Test helper: forget every join request (memory and storage). */
export function resetMembers() { MEMBERS = []; try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

export interface JoinInput { name: string; email: string; password: string }
/** Ask to join as an Employee. The answer never says whether the email is already known (no account enumeration); a duplicate is ignored. */
export async function requestToJoin(input: JoinInput): Promise<void> {
  const name = clampText(input.name, 80); const email = norm(input.email);
  if (name.length < 2) throw new Error("Enter your full name.");
  if (!isEmail(email)) throw new Error("Enter a valid work email address.");
  const pw = checkPassword(String(input.password ?? ""), { email, name });
  if (!pw.ok) throw new Error(pw.errors[0] || "Choose a stronger password.");
  if (email.endsWith("@" + DEMO_DOMAIN) || members().some((m) => m.email === email && m.status !== "Rejected")) return;
  const salt = secureHex(16);
  members().push({ id: "JR-" + secureHex(4).toUpperCase(), name, email, salt, hash: await sha256(salt + ":" + String(input.password)), status: "Pending", requestedAt: Date.now() });
  saveJoinRequests();
}

/* ---------- sign in and out ---------- */
const fails = new Map<string, { n: number; until: number }>();
function fail(email: string): never {
  const f = fails.get(email) || { n: 0, until: 0 }; f.n += 1;
  if (f.n >= JOIN.MAX_FAILS) { f.until = Date.now() + JOIN.LOCK_MS; f.n = 0; }
  fails.set(email, f);
  throw new Error(SIGNIN_FAILED);
}
function start(roleId: string, who: string | null) {
  setSessionPerson(who ? { roleId, person: who } : null);
  appStore.set({ role: roleId, who, signedIn: true, groupsOpen: {} }); persist();
  logAuth("auth.signed_in");
}
/** Signs in with email and password. Errors are generic, except for a proven password on a request that is not approved. Five failures lock that email for five minutes. */
export async function signIn(emailIn: string, password: string): Promise<{ roleId: string; person: string }> {
  const email = norm(emailIn);
  const f = fails.get(email); if (f && f.until > Date.now()) throw new Error(THROTTLED_MSG);
  const demo = DEMO_ACCOUNTS.find((a) => a.email === email);
  if (demo) {
    if ((await sha256("selvara-demo-account:" + String(password ?? ""))) !== DEMO_HASH) fail(email);
    fails.delete(email); start(demo.roleId, null);
    return { roleId: demo.roleId, person: demo.person };
  }
  const m = members().find((x) => x.email === email && x.status !== "Rejected") || members().find((x) => x.email === email);
  if (!m || (await sha256(m.salt + ":" + String(password ?? ""))) !== m.hash) fail(email);
  fails.delete(email);
  if (m.status === "Pending") throw new Error("Your request to join is waiting for a company admin to approve it.");
  if (m.status === "Rejected") throw new Error("Your request to join was not approved. Ask a company admin.");
  start(JOIN_ROLE, m.name);
  return { roleId: JOIN_ROLE, person: m.name };
}
export function signOut(audit = true) {
  if (elevationActive()) endElevation("ended", "on sign-out"); // privileged access never outlives the session
  if (audit && appStore.get().signedIn) logAuth("auth.signed_out");
  setSessionPerson(null);
  appStore.set({ signedIn: false, who: null, groupsOpen: {} }); persist();
}
/** Re-applies the signed-in person after a page load (called once the persisted state is read). A `who` that is no longer an active member signs out. */
export function restoreSession() {
  const s = appStore.get();
  if (!s.signedIn) { setSessionPerson(null); return; }
  if (s.who) {
    const ok = members().some((m) => m.name === s.who && m.status === "Active");
    if (!ok || s.role !== JOIN_ROLE) { signOut(false); return; }
    setSessionPerson({ roleId: JOIN_ROLE, person: s.who });
  } else setSessionPerson(null);
}
/** Name shown for the signed-in person. */
export const currentPerson = () => roleOf(appStore.get().role).person;
