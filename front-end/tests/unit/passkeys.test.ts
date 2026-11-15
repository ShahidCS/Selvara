import { afterEach, describe, expect, it } from "vitest";
import { ADMIN_AUDIT } from "@/lib/adminAudit";
import { acct, clearRecentAuth, noticesFor, resetAcct } from "@/lib/accountSecurity";
import { resetIpGuard } from "@/lib/ipGuard";
import { completePasskey, completeSignIn, myPasskeys, reauthenticate, removePasskey, resetMembers, resetSignInState, signOut, type SignInStep } from "@/lib/session";
import { SodError } from "@/lib/sod";
import { appStore } from "@/lib/store";
import { derToRaw, toB64u, verifyAssertion } from "@/lib/webauthn";
import { firstStep, forgetSecrets } from "./signinHelper";

/* Passkeys for platform super admins. A synthetic authenticator (an ECDSA P-256 key made with WebCrypto) produces exactly what a browser returns,
   so every check the verifier makes can be exercised: type, challenge, origin, relying party, user presence and verification, signature, counter. */
const DEMO = ["selvara", "demo"].join("-");
const DANA = "dana.whitfield@demo.selvara.test";
const ORIGIN = "http://localhost"; const RP = "localhost";
const enc = new TextEncoder();
const sha = async (b: Uint8Array) => new Uint8Array(await crypto.subtle.digest("SHA-256", b as BufferSource));
function rawToDer(raw: Uint8Array): Uint8Array {
  const int = (v: Uint8Array) => { let i = 0; while (i < v.length - 1 && v[i] === 0) i++; v = v.slice(i); return v[0] & 0x80 ? Uint8Array.from([0, ...v]) : v; };
  const r = int(raw.slice(0, 32)); const s = int(raw.slice(32));
  return Uint8Array.from([0x30, r.length + s.length + 4, 0x02, r.length, ...r, 0x02, s.length, ...s]);
}
async function authenticator() {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", kp.publicKey));
  let counter = 0; const id = toB64u(crypto.getRandomValues(new Uint8Array(16)));
  return {
    id,
    register: (challenge: string, origin = ORIGIN) => ({ id, publicKey: toB64u(spki), clientDataJSON: toB64u(enc.encode(JSON.stringify({ type: "webauthn.create", challenge, origin }))) }),
    async assert(challenge: string, o: { origin?: string; rp?: string; flags?: number; counter?: number } = {}) {
      counter = o.counter ?? counter + 1;
      const ad = new Uint8Array(37); ad.set(await sha(enc.encode(o.rp ?? RP))); ad[32] = o.flags ?? 0x05;
      ad[33] = (counter >>> 24) & 255; ad[34] = (counter >>> 16) & 255; ad[35] = (counter >>> 8) & 255; ad[36] = counter & 255;
      const cd = enc.encode(JSON.stringify({ type: "webauthn.get", challenge, origin: o.origin ?? ORIGIN }));
      const data = new Uint8Array(ad.length + 32); data.set(ad); data.set(await sha(cd), ad.length);
      const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, kp.privateKey, data as BufferSource));
      return { id, authenticatorData: toB64u(ad), clientDataJSON: toB64u(cd), signature: toB64u(rawToDer(sig)) };
    },
  };
}
const passkeyStep = (st: SignInStep) => { if (st.step !== "passkey") throw new Error("expected a passkey step, got " + st.step); return st; };
afterEach(() => { signOut(false); forgetSecrets(); resetAcct(); resetSignInState(); resetIpGuard(false); resetMembers(); appStore.set({ role: "super" }); });

describe("passkeys for platform super admins", () => {
  it("the first sign-in adds a passkey, later sign-ins sign with it, and nothing is signed in before", async () => {
    const auth = await authenticator();
    const st = passkeyStep(await firstStep(DANA, DEMO));
    expect(st.register).toBe(true); expect(st.rpId).toBe(RP);
    expect(appStore.get().signedIn).toBe(false);
    await completePasskey(st.ticket, { register: auth.register(st.challenge) });
    expect(appStore.get().signedIn).toBe(true);
    expect(ADMIN_AUDIT.some((e) => e.action === "auth.passkey.added" && e.actor === "Dana Whitfield")).toBe(true);
    signOut(false);
    const again = passkeyStep(await firstStep(DANA, DEMO));
    expect(again.register).toBe(false); expect(again.allow).toEqual([auth.id]);
    await completePasskey(again.ticket, { assertion: await auth.assert(again.challenge) });
    expect(appStore.get().signedIn).toBe(true);
  });
  it("refuses a wrong origin, challenge, relying party, missing user verification, a replayed counter or another key", async () => {
    const auth = await authenticator(); const other = await authenticator();
    const st = passkeyStep(await firstStep(DANA, DEMO)); await completePasskey(st.ticket, { register: auth.register(st.challenge) }); signOut(false);
    const t = passkeyStep(await firstStep(DANA, DEMO));
    await expect(completePasskey(t.ticket, { assertion: await auth.assert(t.challenge, { origin: "https://evil.example" }) })).rejects.toThrow(/could not be verified/);
    await expect(completePasskey(t.ticket, { assertion: await auth.assert("wrong-challenge") })).rejects.toThrow(/could not be verified/);
    await expect(completePasskey(t.ticket, { assertion: await auth.assert(t.challenge, { rp: "evil.example" }) })).rejects.toThrow(/could not be verified/);
    await expect(completePasskey(t.ticket, { assertion: await auth.assert(t.challenge, { flags: 0x01 }) })).rejects.toThrow(/could not be verified/);
    expect(appStore.get().signedIn).toBe(false);
    expect(noticesFor(DANA).filter((n) => n.text.startsWith("Someone entered your correct password")).length).toBe(1);
    await completePasskey(t.ticket, { assertion: await auth.assert(t.challenge, { counter: 10 }) }); signOut(false);
    const u = passkeyStep(await firstStep(DANA, DEMO));
    await expect(completePasskey(u.ticket, { assertion: await auth.assert(u.challenge, { counter: 10 }) })).rejects.toThrow(/could not be verified/); // replayed counter
    const forged = await other.assert(u.challenge); await expect(completePasskey(u.ticket, { assertion: { ...forged, id: auth.id } })).rejects.toThrow(/could not be verified/);
  });
  it("a registration for another origin or challenge is refused", async () => {
    const auth = await authenticator();
    const st = passkeyStep(await firstStep(DANA, DEMO));
    await expect(completePasskey(st.ticket, { register: auth.register(st.challenge, "https://evil.example") })).rejects.toThrow(/could not be verified/);
    await expect(completePasskey(st.ticket, { register: auth.register("other") })).rejects.toThrow(/could not be verified/);
    expect(acct().passkeys[DANA]).toBeUndefined();
  });
  it("the last passkey of a super admin cannot be removed; removing needs the password within 5 minutes", async () => {
    const a = await authenticator();
    const st = passkeyStep(await firstStep(DANA, DEMO)); await completePasskey(st.ticket, { register: a.register(st.challenge) });
    await expect(async () => removePasskey(a.id)).rejects.toThrow(/at least one passkey/);
    acct().passkeys[DANA].push({ id: "second", publicKey: "x", signCount: 0, createdAt: Date.now(), label: "Security key" });
    clearRecentAuth();
    await expect(async () => removePasskey("second")).rejects.toBeInstanceOf(SodError);
    await reauthenticate(DEMO); removePasskey("second");
    expect(myPasskeys().map((k) => k.id)).toEqual([a.id]);
  });
  it("in the demonstration build the on-screen code is a labelled fallback", async () => {
    const st = passkeyStep(await firstStep(DANA, DEMO));
    expect(st.demoCode).toMatch(/^\d{6}$/);
    await expect(completeSignIn(st.ticket, "000000")).rejects.toThrow(/not correct/);
    await completeSignIn(st.ticket, st.demoCode!);
    expect(appStore.get().signedIn).toBe(true);
  });
  it("converts DER signatures and rejects malformed ones", async () => {
    expect(() => derToRaw(new Uint8Array([1, 2, 3]))).toThrow();
    expect(await verifyAssertion({ authenticatorData: "", clientDataJSON: "", signature: "" }, { id: "x", publicKey: "x", signCount: 0, createdAt: 0, label: "" }, { challenge: "c", origin: ORIGIN, rpId: RP })).toBeNull();
  });
});
