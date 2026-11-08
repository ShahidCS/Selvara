/* People & Devices API stubs. In mock mode each function performs the in-memory DATA mutation the prototype did and returns
 * what the caller needs for wsLog / toast; the caller then does wsLog / toast / bumpData.
 * The real API MUST enforce authorization, step-up / four-eyes for MFA reset and offboarding, and write the audit entry itself. */
import { DATA } from "@/lib/data";
import { modAllowed } from "@/lib/rbac";
import { apiFetch, viaApi } from "./http";

/* eslint-disable @typescript-eslint/no-explicit-any */
const post = <T,>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });

/** UI gate only. The prototype had no per-action gate beyond module access (people: super, admin, owner); deny by default otherwise. */
export const canManagePeople = (roleId: string) => modAllowed(roleId, "ws", "people");

export const findPerson = (id: string): any | undefined => DATA.people.find((x) => x.id === id);

/** Prototype: pplInit. Fills posture / accounts / employment lazily (idempotent). */
export function initPerson(p: any) {
  const comp = p.device === "Compliant";
  if (!p.posture) p.posture = { antivirus: comp ? "On" : "Missing", encryption: comp ? "On" : "Off", screenLock: comp ? "On" : "Off", passwordMgr: comp ? "In use" : "Not detected", os: comp ? "macOS 15.1" : "Windows 10 (EOL soon)" };
  if (!p.accounts) p.accounts = DATA.access.filter((a) => a.user === p.name || a.user.split(" ").slice(-1)[0] === p.name.split(" ").slice(-1)[0]).map((a) => ({ system: a.system, level: a.level }));
  if (!p.employment) p.employment = p.contractor ? "Contractor" : "Employee";
  return p;
}

/** Prototype: resetUserMfa. Returns the person's name, or null when the id is unknown. */
export function resetMfa(id: string) {
  return viaApi<{ name: string } | null>(() => {
    const u = findPerson(id); if (!u) return null;
    u.mfa = false;
    return { name: u.name as string };
  }, () => post<{ name: string } | null>(`/people/${encodeURIComponent(id)}/mfa-reset`, {}));
}

/** Prototype: pplDoOffboard (removes the person from the workforce list). */
export function offboardPerson(id: string, transferTo: string) {
  return viaApi<{ name: string } | null>(() => {
    const p = findPerson(id); if (!p) return null;
    DATA.people = DATA.people.filter((x) => x.id !== id);
    return { name: p.name as string };
  }, () => post<{ name: string } | null>(`/people/${encodeURIComponent(id)}/offboard`, { transferTo }));
}

/** Prototype: pplDoAddContractor. The source id was "PP-"+(length+1), which can collide after an offboarding; pick the next unused number instead. */
export function addContractor(input: { name: string; role: string; dept: string }) {
  return viaApi<{ id: string; name: string }>(() => {
    let n = DATA.people.length + 1;
    while (DATA.people.some((x) => x.id === "PP-" + n)) n++;
    const id = "PP-" + n;
    DATA.people.push(initPerson({ id, name: input.name, role: input.role || "Contractor", dept: input.dept || "External", device: "Unmanaged", mfa: false, contractor: true }));
    return { id, name: input.name };
  }, () => post<{ id: string; name: string }>("/people/contractors", input));
}
