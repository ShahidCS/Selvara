/* Time-based one-time passwords (RFC 6238, HMAC-SHA1, 30-second steps, 6 digits): the format every authenticator app reads. Verification accepts
   one step either side for clock drift and refuses a step that was already used (replay). In production the secret is generated, stored
   (encrypted) and checked on the server only; in the demo the browser does it. */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP = { STEP_S: 30, DIGITS: 6, WINDOW: 1, SECRET_BYTES: 20 };

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0, value = 0, out = "";
  for (const b of bytes) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s: string): Uint8Array {
  const clean = s.toUpperCase().replace(/[\s=-]/g, ""); const out: number[] = []; let bits = 0, value = 0;
  for (const ch of clean) { const i = B32.indexOf(ch); if (i < 0) throw new Error("Invalid secret"); value = (value << 5) | i; bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return new Uint8Array(out);
}
/** A new random secret (160 bits, base32), from the platform's secure random source. */
export function newSecret(): string { const b = new Uint8Array(TOTP.SECRET_BYTES); crypto.getRandomValues(b); return base32Encode(b); }
/** Shown as a QR code or a link by authenticator apps. The account label never contains the secret. */
export const otpauthUri = (secret: string, account: string, issuer = "Selvara") =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP.DIGITS}&period=${TOTP.STEP_S}`;

/** HOTP value for a counter (RFC 4226), `digits` long. */
export async function hotp(secret: Uint8Array, counter: number, digits = TOTP.DIGITS): Promise<string> {
  const msg = new Uint8Array(8); let c = counter;
  for (let i = 7; i >= 0; i--) { msg[i] = c & 255; c = Math.floor(c / 256); }
  const key = await crypto.subtle.importKey("raw", secret as BufferSource, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg as BufferSource));
  const o = h[h.length - 1] & 15;
  const bin = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}
export const stepAt = (ms: number) => Math.floor(ms / 1000 / TOTP.STEP_S);
export async function totpAt(secretB32: string, ms: number, digits = TOTP.DIGITS): Promise<string> { return hotp(base32Decode(secretB32), stepAt(ms), digits); }
/** The matching step when `code` is valid now (one step of drift either way) and newer than `lastStep`; otherwise null. */
export async function verifyTotp(secretB32: string, code: string, lastStep = -1, now = Date.now()): Promise<number | null> {
  const c = String(code ?? "").replace(/\s/g, ""); if (!/^\d{6}$/.test(c)) return null;
  const key = base32Decode(secretB32); const cur = stepAt(now);
  for (let d = -TOTP.WINDOW; d <= TOTP.WINDOW; d++) {
    const s = cur + d; if (s <= lastStep) continue;
    if ((await hotp(key, s)) === c) return s;
  }
  return null;
}
