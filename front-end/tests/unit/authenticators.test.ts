import { afterEach, describe, expect, it } from "vitest";
import { acct, resetAcct } from "@/lib/accountSecurity";
import { resetIpGuard } from "@/lib/ipGuard";
import { appsOf, confirmAddAuthenticator, removeAuthenticator, resetMembers, resetSignInState, signOut, startAddAuthenticator } from "@/lib/session";
import { attempt, codeFor, forgetSecrets, realAccount, SECRETS } from "./signinHelper";

/* Authenticator apps from Your account in the demonstration build (lib/session.ts), with the same rules as the server (server.test.ts):
   the password and a current code for every change, a recovery code for a lost app, at most two apps, the last app of a company account kept. */
const PW = "Lantern-orbit-Quince-71"; const EMAIL = "alex.kim@company.example";
afterEach(() => { forgetSecrets(); resetAcct(); resetSignInState(); signOut(false); resetMembers(); resetIpGuard(false); });

describe("authenticator apps (demo build)", () => {
  it("adds a backup app, accepts either at sign-in, refuses a third, replaces and removes with a code", async () => {
    await realAccount("Alex Kim", EMAIL, PW); await attempt(EMAIL, PW);
    expect(appsOf(acct().mfa[EMAIL]).map((a) => a.label)).toEqual(["Authenticator app"]);
    await expect(startAddAuthenticator({ password: "Wrong-password-123", code: await codeFor(EMAIL) })).rejects.toThrow(/password is not correct/);
    await expect(startAddAuthenticator({ password: PW, code: "000000" })).rejects.toThrow(/code is not correct/);
    const setup = await startAddAuthenticator({ password: PW, code: await codeFor(EMAIL), label: "Backup <phone>" });
    expect(setup.uri.startsWith("otpauth://totp/")).toBe(true); expect(setup.label).toBe("Backup phone");
    SECRETS.set("backup", setup.secret);
    await expect(confirmAddAuthenticator("123456")).rejects.toThrow(/not correct/);
    expect(await confirmAddAuthenticator(await codeFor("backup"))).toEqual({}); // codes already exist: none issued
    expect(appsOf(acct().mfa[EMAIL]).map((a) => a.label)).toEqual(["Authenticator app", "Backup phone"]);
    await expect(startAddAuthenticator({ password: PW, code: await codeFor(EMAIL) })).rejects.toThrow(/already have 2/);
    signOut(); SECRETS.set(EMAIL, setup.secret); await attempt(EMAIL, PW); // the backup app's code signs in
    const [first, backup] = appsOf(acct().mfa[EMAIL]);
    await expect(removeAuthenticator(first.id, PW, "000000")).rejects.toThrow(/not correct/);
    await removeAuthenticator(first.id, PW, await codeFor(EMAIL));
    await expect(removeAuthenticator(backup.id, PW, await codeFor(EMAIL))).rejects.toThrow(/needs an authenticator app/); // the last one stays
    const next = await startAddAuthenticator({ password: PW, code: await codeFor(EMAIL), replaces: backup.id, label: "New phone" });
    SECRETS.set("new", next.secret); await confirmAddAuthenticator(await codeFor("new"));
    expect(appsOf(acct().mfa[EMAIL]).map((a) => a.label)).toEqual(["New phone"]);
  });
  it("replaces a lost app with a recovery code, once, and issues new codes when none are left", async () => {
    const r = await realAccount("Alex Kim", EMAIL, PW); await attempt(EMAIL, PW);
    const codes = r.recoveryCodes!;
    const setup = await startAddAuthenticator({ password: PW, code: codes[0], recovery: true });
    expect(appsOf(acct().mfa[EMAIL])).toEqual([]); // every app removed first
    SECRETS.set("repl", setup.secret); await confirmAddAuthenticator(await codeFor("repl"));
    await expect(startAddAuthenticator({ password: PW, code: codes[0], recovery: true })).rejects.toThrow(/already used/);
    for (const c of codes.slice(1)) { const s = await startAddAuthenticator({ password: PW, code: c, recovery: true }); SECRETS.set("r", s.secret); const out = await confirmAddAuthenticator(await codeFor("r")); if (c === codes.at(-1)) expect(out.recoveryCodes).toHaveLength(10); }
  });
  it("demo accounts have no authenticator app", async () => {
    await attempt("jordan.avery@demo.selvara.test", ["selvara", "demo"].join("-"));
    await expect(startAddAuthenticator({ password: "x", code: "000000" })).rejects.toThrow(/Demo accounts/);
  });
});
