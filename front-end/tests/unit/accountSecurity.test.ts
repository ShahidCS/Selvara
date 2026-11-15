import { afterEach, describe, expect, it } from "vitest";
import { ADMIN_AUDIT } from "@/lib/adminAudit";
import { WS_AUDIT } from "@/lib/audit";
import { decideApproval } from "@/lib/approvalFlow";
import { approvals } from "@/lib/approvals";
import { CHALLENGE, SESSION_MS, acct, activeSessions, clearRecentAuth, currentSession, issueChallenge, noticesFor, resetAcct, solveChallenge, verifyChallenge, welcomeText } from "@/lib/accountSecurity";
import { IP_POLICY, clientIp, ipBlockMessage, isTrusted, recordIpFailure, resetIpGuard, resetTrustedNets, trustedNets } from "@/lib/ipGuard";
import { ChallengeRequired, challengeNeeded, changePassword, completeReset, completeSignIn, joinRequests, lockoutFor, reauthenticate, regenerateRecoveryCodes, requestReset, requestToJoin, resetLinkValid, resetMembers, resetSignInState, restoreSession, signIn, signOut, signOutOtherSessions } from "@/lib/session";
import { decideJoin } from "@/services/joinRequests";
import { totpAt } from "@/lib/totp";
import { SodError } from "@/lib/sod";
import { appStore } from "@/lib/store";
import { lockoutPreset, removeTrustedNet, requestTrustedNet, setLockoutPreset } from "@/services/team";
import { SECRETS, attempt, codeFor, firstStep, forgetSecrets, realAccount } from "./signinHelper";

/* Login and sign-up controls (docs/security/SOD_MATRIX.md section 12). vitest has no DOM: the synthetic client address is fixed. */
const DEMO = ["selvara", "demo"].join("-");
const JORDAN = "jordan.avery@demo.selvara.test"; const CASEY = "casey.morgan@demo.selvara.test"; const PRIYA = "priya.nair@demo.selvara.test";
const NEWPW = "Copper-harbour-Violet-58"; const PW = "Lantern-orbit-Quince-71";
const ALEX = "alex.kim@company.example"; const RAE = "rae.fox@company.example";
afterEach(() => { signOut(false); forgetSecrets(); resetAcct(); resetSignInState(); resetIpGuard(false); resetTrustedNets(); resetMembers(); approvals.set({ list: [] }); appStore.set({ role: "super" }); });
const trustMe = () => trustedNets().push({ id: "TN-T", net: clientIp(), label: "Test office", requestedBy: "x", status: "Active" });

describe("challenge step before blocking", () => {
  it("is needed after 3 recent failures; without an answer the attempt is refused and not counted", async () => {
    for (let i = 0; i < CHALLENGE.AFTER_FAILS; i++) await expect(attempt(JORDAN, "wrong-" + i)).rejects.toThrow(/incorrect/);
    expect(challengeNeeded(JORDAN)).toBe(true);
    await expect(signIn(JORDAN, DEMO)).rejects.toBeInstanceOf(ChallengeRequired);
    await expect(signIn(JORDAN, DEMO, { seed: "made-up", nonce: 1 })).rejects.toBeInstanceOf(ChallengeRequired);
    expect(appStore.get().signedIn).toBe(false);
    const r = await attempt(JORDAN, DEMO);
    expect(r.roleId).toBe("admin");
  });
  it("an answer works once and only for its seed", async () => {
    const c = issueChallenge(); const nonce = await solveChallenge(c.seed, c.digits);
    expect(await verifyChallenge({ seed: c.seed, nonce })).toBe(true);
    expect(await verifyChallenge({ seed: c.seed, nonce })).toBe(false);
  });
  it("is always needed from hosting, VPN or proxy addresses, and never from a trusted office network", () => {
    expect(challengeNeeded(JORDAN, "192.0.2.10")).toBe(true);
    trustMe(); for (let i = 0; i < 5; i++) recordIpFailure(clientIp());
    expect(challengeNeeded(JORDAN)).toBe(false);
  });
});

describe("address reputation and trusted networks", () => {
  it("blocks a hosting address after half the failures", () => {
    for (let i = 0; i < IP_POLICY.THRESHOLD / 2; i++) recordIpFailure("192.0.2.10");
    expect(ipBlockMessage("192.0.2.10")).not.toBeNull();
  });
  it("a trusted network is never blocked, but the account still locks", async () => {
    trustMe();
    for (let i = 0; i < IP_POLICY.THRESHOLD + 2; i++) recordIpFailure(clientIp());
    expect(ipBlockMessage(clientIp())).toBeNull();
    for (let i = 0; i < 5; i++) await expect(attempt(CASEY, "nope")).rejects.toThrow(/incorrect/);
    await expect(attempt(CASEY, DEMO)).rejects.toThrow(/Too many attempts/);
  });
  it("adding one needs a different company admin; removing is immediate; bad values are refused", async () => {
    appStore.set({ role: "owner" }); await expect(requestTrustedNet("203.0.113.0/24", "Head office")).rejects.toBeInstanceOf(SodError);
    appStore.set({ role: "admin" });
    await expect(requestTrustedNet("203.0.113.0/16", "Head office")).rejects.toBeInstanceOf(SodError);
    await expect(requestTrustedNet("203.0.113.5/24", "Head office")).rejects.toBeInstanceOf(SodError);
    const n = await requestTrustedNet("203.0.113.0/24", "Head office");
    expect(isTrusted("203.0.113.50")).toBe(false);
    expect(() => decideApproval(n.approvalId!, true, "Our registered office range")).toThrow(SodError); // own request
    appStore.set({ role: "admin2" }); decideApproval(n.approvalId!, true, "Our registered office range");
    expect(isTrusted("203.0.113.50")).toBe(true); expect(isTrusted("203.0.114.50")).toBe(false);
    expect(WS_AUDIT.some((e) => e.action === "team.network.trusted" && e.target.includes("Casey Morgan"))).toBe(true);
    await removeTrustedNet(n.id);
    expect(isTrusted("203.0.113.50")).toBe(false);
  });
});

describe("account lockout preset", () => {
  it("only a company admin changes it, audited; PCI DSS needs 10 failures and locks for 30 minutes", async () => {
    appStore.set({ role: "owner" }); await expect(setLockoutPreset("pci")).rejects.toBeInstanceOf(SodError);
    appStore.set({ role: "admin" }); await expect(setLockoutPreset("lenient")).rejects.toBeInstanceOf(SodError);
    await setLockoutPreset("pci"); expect(lockoutPreset()).toBe("pci");
    expect(WS_AUDIT.some((e) => e.action === "team.lockout.changed" && e.target.startsWith("Standard (5 failed attempts lock the account for 5 minutes) → PCI DSS v4"))).toBe(true);
    signOut(false); trustMe(); // isolate the account lock from network blocking
    for (let i = 0; i < 9; i++) await expect(attempt(PRIYA, "nope")).rejects.toThrow(/incorrect/);
    const r = await attempt(PRIYA, DEMO); expect(r.roleId).toBe("employee"); signOut(false);
    for (let i = 0; i < 10; i++) await expect(attempt(PRIYA, "nope")).rejects.toThrow(/incorrect/);
    await expect(attempt(PRIYA, DEMO)).rejects.toThrow(/Too many attempts/);
    expect(lockoutFor("employee").lockMs).toBe(30 * 60_000);
    expect(noticesFor(PRIYA).some((n) => n.text.includes("locked for 30 minutes"))).toBe(true);
  });
  it("a custom lockout is bounded, admin only and audited", async () => {
    appStore.set({ role: "admin" });
    await expect(setLockoutPreset("custom")).rejects.toBeInstanceOf(SodError);
    await expect(setLockoutPreset("custom", { attempts: 2, minutes: 30 })).rejects.toBeInstanceOf(SodError);
    await expect(setLockoutPreset("custom", { attempts: 5, minutes: 90 })).rejects.toBeInstanceOf(SodError);
    await expect(setLockoutPreset("custom", { attempts: 5.5, minutes: 30 })).rejects.toBeInstanceOf(SodError);
    await setLockoutPreset("custom", { attempts: 4, minutes: 45 });
    expect(lockoutFor("employee")).toEqual(expect.objectContaining({ attempts: 4, lockMs: 45 * 60_000 }));
    expect(WS_AUDIT.some((e) => e.action === "team.lockout.changed" && e.target.endsWith("Custom (4 failed attempts lock the account for 45 minutes)"))).toBe(true);
    signOut(false); trustMe();
    for (let i = 0; i < 4; i++) await expect(attempt(PRIYA, "nope")).rejects.toThrow(/incorrect/);
    await expect(attempt(PRIYA, DEMO)).rejects.toThrow(/Too many attempts/);
  });
  it("platform accounts are always strict", () => { expect(lockoutFor("super")).toEqual(expect.objectContaining({ attempts: 5, lockMs: 30 * 60_000 })); });
});

describe("last sign-in and alerts", () => {
  it("reports the previous sign-in and failed attempts since, and alerts the owner after several failures", async () => {
    trustMe();
    const first = await attempt(JORDAN, DEMO); expect(first.previous).toBeNull(); signOut(false);
    for (let i = 0; i < 3; i++) await expect(attempt(JORDAN, "nope")).rejects.toThrow();
    const r = await attempt(JORDAN, DEMO);
    expect(r.previous).not.toBeNull(); expect(r.failedSince).toBe(3);
    expect(welcomeText({ previous: r.previous, failedSince: 3 })).toMatch(/Last sign-in .* UTC from .*3 failed sign-in attempts since then/);
    expect(noticesFor(JORDAN).some((n) => n.text.startsWith("Signed in after 3 failed attempts"))).toBe(true);
  });
  it("tells the owner when attempts on their account come from a blocked address", async () => {
    for (let i = 0; i < IP_POLICY.THRESHOLD; i++) recordIpFailure(clientIp());
    await expect(attempt(CASEY, DEMO)).rejects.toThrow(/from your network/);
    expect(noticesFor(CASEY).some((n) => n.text.includes("now blocked"))).toBe(true);
  });
});

describe("sessions and re-authentication", () => {
  it("lists sessions and signs out the others; a session ended elsewhere signs out on load", async () => {
    await attempt(JORDAN, DEMO);
    expect(activeSessions(JORDAN).length).toBe(2); // this one and a synthetic older one
    expect(signOutOtherSessions()).toBe(1);
    expect(activeSessions(JORDAN).map((s) => s.id)).toEqual([currentSession()!.id]);
    currentSession()!.revokedAt = Date.now(); // as if another session reset the password
    restoreSession(); expect(appStore.get().signedIn).toBe(false);
  });
  it("new recovery codes need the password confirmed in the last 5 minutes (real accounts only)", async () => {
    await realAccount("Alex Kim", ALEX, PW);
    await attempt(ALEX, PW);
    expect((await regenerateRecoveryCodes()).length).toBe(10); // a fresh sign-in counts
    clearRecentAuth();
    await expect(regenerateRecoveryCodes()).rejects.toBeInstanceOf(SodError);
    await expect(reauthenticate("nope")).rejects.toThrow(/not correct/);
    await reauthenticate(PW);
    const codes = await regenerateRecoveryCodes();
    expect(codes.length).toBe(10);
    expect(JSON.stringify(acct())).not.toContain(codes[0]); // only salted hashes are kept
    signOut(false); await attempt(JORDAN, DEMO);
    await expect(regenerateRecoveryCodes()).rejects.toThrow(/Demo accounts have no recovery codes/);
  });
  it("changing the password needs the current one, refuses weak or unchanged ones, ends other sessions and alerts; demo accounts cannot", async () => {
    await attempt(JORDAN, DEMO);
    await expect(changePassword(DEMO, NEWPW)).rejects.toThrow(/Demo accounts are shared/);
    signOut(false);
    await realAccount("Alex Kim", ALEX, PW);
    await attempt(ALEX, PW); await attempt(ALEX, PW); // two sessions in this browser record
    await expect(changePassword("nope", NEWPW)).rejects.toThrow(/not correct/);
    await expect(changePassword(PW, "short")).rejects.toThrow();
    await expect(changePassword(PW, PW)).rejects.toThrow(/not using now/);
    await changePassword(PW, NEWPW);
    expect(activeSessions(ALEX).length).toBe(1);
    expect(noticesFor(ALEX).some((n) => n.text.startsWith("Your password was changed"))).toBe(true);
    expect(WS_AUDIT.some((e) => e.action === "auth.password.changed" && e.target === "Alex Kim")).toBe(true);
    signOut(false);
    await expect(attempt(ALEX, PW)).rejects.toThrow(/incorrect/);
    expect((await attempt(ALEX, NEWPW)).person).toBe("Alex Kim");
  });
});

describe("password reset", () => {
  it("answers the same for unknown and demo emails; the link is single use, needs the second factor, ends every session and signs nobody in", async () => {
    expect(resetLinkValid(requestReset("nobody@company.example").token)).toBe(false);
    expect(resetLinkValid(requestReset(JORDAN).token)).toBe(false); // demo accounts cannot be reset
    await realAccount("Alex Kim", ALEX, PW);
    await attempt(ALEX, PW); signOut(false);
    const link = requestReset(ALEX);
    expect(resetLinkValid(link.token)).toBe(true);
    await expect(completeReset(link.token, "000000", NEWPW)).rejects.toThrow(/code is not correct/);
    await expect(completeReset(link.token, await codeFor(ALEX), "short")).rejects.toThrow();
    await completeReset(link.token, await codeFor(ALEX), NEWPW);
    expect(appStore.get().signedIn).toBe(false);
    expect(activeSessions(ALEX).length).toBe(0);
    expect(resetLinkValid(link.token)).toBe(false);
    await expect(completeReset(link.token, await codeFor(ALEX), NEWPW)).rejects.toThrow(/not valid or has expired/);
    expect(noticesFor(ALEX).some((n) => n.text.startsWith("Your password was reset"))).toBe(true);
    expect(WS_AUDIT.some((e) => e.action === "auth.password.reset" && e.actor === "Alex Kim")).toBe(true);
    expect((await attempt(ALEX, NEWPW)).person).toBe("Alex Kim");
  });
  it("accepts a recovery code instead of the authenticator, once", async () => {
    const r = await realAccount("Alex Kim", ALEX, PW);
    const a = requestReset(ALEX); await completeReset(a.token, r.recoveryCodes![0], NEWPW);
    resetIpGuard(false);
    const b = requestReset(ALEX); await expect(completeReset(b.token, r.recoveryCodes![0], PW)).rejects.toThrow(/code is not correct/);
  });
  it("five wrong codes end the link; a link expires after 15 minutes; a new link replaces the old one", async () => {
    await realAccount("Alex Kim", ALEX, PW); await realAccount("Rae Fox", RAE, PW);
    const a = requestReset(ALEX);
    for (let i = 0; i < 5; i++) await expect(completeReset(a.token, "000000", NEWPW)).rejects.toThrow();
    expect(resetLinkValid(a.token)).toBe(false);
    const b = requestReset(RAE); acct().resets.find((r) => r.token === b.token)!.expires = Date.now() - 1;
    expect(resetLinkValid(b.token)).toBe(false);
    resetIpGuard(false);
    const c1 = requestReset(ALEX); const c2 = requestReset(ALEX);
    expect(resetLinkValid(c1.token)).toBe(false); expect(resetLinkValid(c2.token)).toBe(true);
  });
  it("is limited per address, and never locks the account", async () => {
    for (let i = 0; i < 3; i++) requestReset(JORDAN);
    expect(() => requestReset(CASEY)).toThrow(/Too many reset requests/);
    expect((await attempt(JORDAN, DEMO)).roleId).toBe("admin");
  });
  it("audit entries for platform sign-ins go to the admin log", async () => {
    await attempt("dana.whitfield@demo.selvara.test", DEMO);
    expect(ADMIN_AUDIT.some((e) => e.action === "auth.signed_in" && e.object === "Dana Whitfield")).toBe(true);
  });
});

describe("two-step verification", () => {
  it("a real account adds an authenticator at its first sign-in, gets 10 recovery codes once, then needs a code every time", async () => {
    await requestToJoin({ name: "Alex Kim", email: ALEX, password: PW });
    appStore.set({ role: "admin" }); await decideJoin(joinRequests()[0].id, "approve", "Joined the team this week"); signOut(false);
    const st = await firstStep(ALEX, PW);
    expect(st.step).toBe("enroll");
    expect(appStore.get().signedIn).toBe(false); // nothing is signed in before the second step
    if (st.step !== "enroll") return;
    expect(st.uri).toContain("otpauth://totp/Selvara:");
    await expect(completeSignIn(st.ticket, "000000")).rejects.toThrow(/not correct/);
    SECRETS.set(ALEX, st.secret);
    const r = await completeSignIn(st.ticket, await codeFor(ALEX));
    expect(r.recoveryCodes!.length).toBe(10); expect(appStore.get().signedIn).toBe(true);
    signOut(false);
    const again = await firstStep(ALEX, PW);
    expect(again).toEqual(expect.objectContaining({ step: "mfa", method: "totp" }));
  });
  it("a correct password followed by a wrong code alerts the owner once, counts as a failure, and five wrong codes end the attempt", async () => {
    await realAccount("Alex Kim", ALEX, PW);
    trustMe(); // isolate from network blocking
    const st = await firstStep(ALEX, PW);
    for (let i = 0; i < 4; i++) await expect(completeSignIn(st.ticket, "000000")).rejects.toThrow(/not correct/);
    expect(noticesFor(ALEX).filter((n) => n.text.startsWith("Someone entered your correct password")).length).toBe(1);
    await expect(completeSignIn(st.ticket, "000000")).rejects.toThrow(/Too many attempts|Too many wrong codes/);
    await expect(completeSignIn(st.ticket, await codeFor(ALEX))).rejects.toThrow(/expired/);
  });
  it("a code cannot be used twice, and a recovery code works once", async () => {
    const r = await realAccount("Alex Kim", ALEX, PW);
    const st = await firstStep(ALEX, PW);
    const stale = await totpAt(SECRETS.get(ALEX)!, Date.now() - 300_000);
    await expect(completeSignIn(st.ticket, stale)).rejects.toThrow(/not correct/);
    const ok = await completeSignIn(st.ticket, r.recoveryCodes![1], { recovery: true });
    expect(ok.recoveryLeft).toBe(9);
    expect(noticesFor(ALEX).some((n) => n.text.startsWith("A recovery code was used"))).toBe(true);
    signOut(false);
    const st2 = await firstStep(ALEX, PW);
    await expect(completeSignIn(st2.ticket, r.recoveryCodes![1], { recovery: true })).rejects.toThrow(/not correct/);
  });
  it("demo accounts are limited: the code is shown, the session lasts one hour", async () => {
    const st = await firstStep(JORDAN, DEMO);
    expect(st).toEqual(expect.objectContaining({ step: "mfa", method: "demo" }));
    if (st.step !== "mfa" || st.method !== "demo") return;
    await completeSignIn(st.ticket, st.demoCode);
    const s = currentSession()!; expect(s.demo).toBe(true); expect(s.expiresAt! - s.startedAt).toBe(SESSION_MS.demo);
    s.expiresAt = Date.now() - 1; restoreSession();
    expect(appStore.get().signedIn).toBe(false);
  });
});
