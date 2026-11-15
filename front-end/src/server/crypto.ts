/* Server-only crypto helpers (WebCrypto, available in Node 20 and on Vercel). */
export const b64u = (b: Uint8Array) => Buffer.from(b).toString("base64url");
export const fromB64u = (s: string) => new Uint8Array(Buffer.from(s, "base64url"));
export const randomId = (bytes = 32) => b64u(crypto.getRandomValues(new Uint8Array(bytes)));
export async function sha256Hex(s: string): Promise<string> { return Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))).toString("hex"); }
async function key(secret: string) { return crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", new TextEncoder().encode("selvara-seal:" + secret)), "AES-GCM", false, ["encrypt", "decrypt"]); }
/** Encrypts small server-side values (sign-in tickets that hold Supabase tokens) with AES-256-GCM under SERVER_SECRET. */
export async function seal(secret: string, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(secret), new TextEncoder().encode(JSON.stringify(value))));
  return b64u(iv) + "." + b64u(ct);
}
export async function unseal<T>(secret: string, sealed: string): Promise<T | null> {
  try { const [iv, ct] = sealed.split("."); return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64u(iv) }, await key(secret), fromB64u(ct)))) as T; }
  catch { return null; }
}
/** Equal-time string comparison. */
export function same(a: string, b: string): boolean { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
