/* Passkeys (WebAuthn Level 2, ES256): phishing-resistant sign-in bound to this site. Platform super admins must use one (SOD_MATRIX §2). In production the
   server issues the challenge and verifies the assertion (the contract is in docs/security/CONTROLS.md); in the demo the browser does both, using the
   same checks a server makes: the type, the challenge, the origin, the relying party, user presence and verification, the signature and the counter. */

export interface StoredPasskey { id: string; publicKey: string; signCount: number; createdAt: number; label: string }
const b64u = (b: ArrayBuffer | Uint8Array) => { const u = b instanceof Uint8Array ? b : new Uint8Array(b); let s = ""; u.forEach((x) => { s += String.fromCharCode(x); }); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const fromB64u = (s: string) => { const p = s.replace(/-/g, "+").replace(/_/g, "/"); const bin = atob(p + "===".slice((p.length + 3) % 4)); return Uint8Array.from(bin, (c) => c.charCodeAt(0)); };
export const toB64u = b64u; export const fromBase64u = fromB64u;
const sha256 = async (d: Uint8Array) => new Uint8Array(await crypto.subtle.digest("SHA-256", d as BufferSource));
export function newChallenge(): string { const b = new Uint8Array(32); crypto.getRandomValues(b); return b64u(b); }

/** True when this browser can create and use passkeys. */
export const passkeysSupported = () => typeof window !== "undefined" && !!window.PublicKeyCredential && !!navigator.credentials;

/** Creates a passkey for the account (the browser asks the person to confirm with their device). Returns what the server stores: id and public key. */
export async function createPasskey(o: { email: string; name: string; challenge: string; rpId: string; exclude: string[] }): Promise<{ id: string; publicKey: string; clientDataJSON: string }> {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: fromB64u(o.challenge), rp: { name: "Selvara", id: o.rpId },
    user: { id: crypto.getRandomValues(new Uint8Array(16)), name: o.email, displayName: o.name },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }], timeout: 120_000, attestation: "none",
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
    excludeCredentials: o.exclude.map((id) => ({ type: "public-key" as const, id: fromB64u(id) })),
  } }) as PublicKeyCredential | null;
  if (!cred) throw new Error("No passkey was created.");
  const r = cred.response as AuthenticatorAttestationResponse;
  const spki = r.getPublicKey?.(); if (!spki || r.getPublicKeyAlgorithm?.() !== -7) throw new Error("This authenticator is not supported.");
  return { id: b64u(cred.rawId), publicKey: b64u(spki), clientDataJSON: b64u(r.clientDataJSON) };
}
/** Asks the browser to sign the challenge with one of the account's passkeys. */
export async function getAssertion(o: { challenge: string; rpId: string; allow: string[] }): Promise<{ id: string; authenticatorData: string; clientDataJSON: string; signature: string }> {
  const cred = await navigator.credentials.get({ publicKey: {
    challenge: fromB64u(o.challenge), rpId: o.rpId, timeout: 120_000, userVerification: "required",
    allowCredentials: o.allow.map((id) => ({ type: "public-key" as const, id: fromB64u(id) })),
  } }) as PublicKeyCredential | null;
  if (!cred) throw new Error("No passkey was used.");
  const r = cred.response as AuthenticatorAssertionResponse;
  return { id: b64u(cred.rawId), authenticatorData: b64u(r.authenticatorData), clientDataJSON: b64u(r.clientDataJSON), signature: b64u(r.signature) };
}

/** Checks the registration's client data (type, challenge, origin). Attestation is "none": the public key is trusted on first use, as for passkeys generally. */
export function checkRegistration(clientDataJSON: string, expect: { challenge: string; origin: string }): boolean {
  try { const c = JSON.parse(new TextDecoder().decode(fromB64u(clientDataJSON))); return c.type === "webauthn.create" && c.challenge === expect.challenge && c.origin === expect.origin; } catch { return false; }
}
/** DER ECDSA signature -> raw r||s (64 bytes) as WebCrypto expects. */
export function derToRaw(der: Uint8Array): Uint8Array {
  if (der[0] !== 0x30) throw new Error("bad signature");
  let i = 2; const read = () => { if (der[i++] !== 0x02) throw new Error("bad signature"); const len = der[i++]; const v = der.slice(i, i + len); i += len; return v; };
  const fix = (v: Uint8Array) => { while (v.length > 32 && v[0] === 0) v = v.slice(1); const o = new Uint8Array(32); o.set(v, 32 - v.length); return o; };
  const r = fix(read()); const s = fix(read()); const out = new Uint8Array(64); out.set(r); out.set(s, 32); return out;
}
/** Verifies an assertion against a stored passkey. Returns the new signature counter, or null when anything does not match. */
export async function verifyAssertion(a: { authenticatorData: string; clientDataJSON: string; signature: string }, key: StoredPasskey, expect: { challenge: string; origin: string; rpId: string }): Promise<number | null> {
  try {
    const cd = fromB64u(a.clientDataJSON); const c = JSON.parse(new TextDecoder().decode(cd));
    if (c.type !== "webauthn.get" || c.challenge !== expect.challenge || c.origin !== expect.origin) return null;
    const ad = fromB64u(a.authenticatorData); if (ad.length < 37) return null;
    const rpHash = await sha256(new TextEncoder().encode(expect.rpId));
    if (!rpHash.every((b, i) => b === ad[i])) return null;
    const flags = ad[32]; if (!(flags & 0x01) || !(flags & 0x04)) return null; // user present and user verified
    const count = ((ad[33] << 24) | (ad[34] << 16) | (ad[35] << 8) | ad[36]) >>> 0;
    if (count !== 0 && key.signCount !== 0 && count <= key.signCount) return null; // a cloned authenticator
    const pub = await crypto.subtle.importKey("spki", fromB64u(key.publicKey) as BufferSource, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const signed = new Uint8Array(ad.length + 32); signed.set(ad); signed.set(await sha256(cd), ad.length);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, derToRaw(fromB64u(a.signature)) as BufferSource, signed as BufferSource);
    return ok ? count : null;
  } catch { return null; }
}
