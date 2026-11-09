/* Auth service (credential checks). Contract: docs/SOD_MATRIX.md section 6.
 * checkBreached: mock mode = local common/breached blocklist. Real mode = k-anonymity range lookup against OUR backend, which proxies the breach API:
 * the browser SHA-1 hashes the NFKC password, sends ONLY the first 5 hex characters, and compares the returned suffixes locally.
 * The password and its full hash never leave the browser and are never sent to a third party. The server MUST ALSO run the breach check
 * when it receives the new password (the client check is advisory UX, not a control). Nothing here stores or logs the password. */
import { isCommon, normalisePassword, POLICY } from "@/lib/credentials";
import { apiFetch, viaApi } from "./http";

export interface BreachResult { breached: boolean; checked: boolean }

async function sha1Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** Returns { breached, checked }. `checked: false` means the service was unreachable: the UI must not block on it (the server decides). */
export function checkBreached(password: string): Promise<BreachResult> {
  return viaApi<BreachResult>(
    () => ({ breached: isCommon(password), checked: true }),
    async () => {
      try {
        const h = await sha1Hex(normalisePassword(password));
        const prefix = h.slice(0, 5); const suffix = h.slice(5);
        const r = await apiFetch<{ suffixes: string[] }>(`/auth/password/breach-range/${prefix}`);
        return { breached: Array.isArray(r.suffixes) && r.suffixes.some((x) => String(x).split(":")[0].toUpperCase() === suffix), checked: true };
      } catch { return { breached: false, checked: false }; }
    });
}

/* Tenant credential settings: only the minimum length is adjustable (12-128). Breach check and MFA are locked on. In-memory in mock mode. */
export interface CredentialSettings { minLength: number; breachCheck: true; mfaRequired: true }
const state: CredentialSettings = { minLength: POLICY.minLength, breachCheck: true, mfaRequired: true };
export const getCredentialSettings = (): CredentialSettings => ({ ...state });
export function setMinLength(n: number): Promise<CredentialSettings> {
  return viaApi<CredentialSettings>(() => {
    if (!Number.isInteger(n) || n < POLICY.minLength || n > POLICY.maxLength) throw new Error("Minimum length must be between 12 and 128");
    state.minLength = n; return { ...state };
  }, () => apiFetch<CredentialSettings>("/settings/credential-policy", { method: "PUT", body: JSON.stringify({ minLength: n }) }));
}
