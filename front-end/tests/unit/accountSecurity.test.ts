import { afterEach, describe, expect, it } from "vitest";
import { ADMIN_AUDIT } from "@/lib/adminAudit";
import { WS_AUDIT } from "@/lib/audit";
import { decideApproval } from "@/lib/approvalFlow";
import { approvals } from "@/lib/approvals";
import { CHALLENGE, acct, activeSessions, clearRecentAuth, currentSession, issueChallenge, noticesFor, resetAcct, solveChallenge, verifyChallenge, welcomeText } from "@/lib/accountSecurity";
import { IP_POLICY, clientIp, ipBlockMessage, isTrusted, recordIpFailure, resetIpGuard, resetTrustedNets, trustedNets } from "@/lib/ipGuard";
import { ChallengeRequired, challengeNeeded, changePassword, completeReset, lockoutFor, reauthenticate, requestReset, resetLinkValid, resetMembers, resetSignInState, restoreSession, signIn, signOut, signOutOtherSessions } from "@/lib/session";
import { SodError } from "@/lib/sod";
import { appStore } from "@/lib/store";
import { regenerateCodes } from "@/services/me";
import { lockoutPreset, removeTrustedNet, requestTrustedNet, setLockoutPreset } from "@/services/team";
import { attempt } from "./signinHelper";

/* Login and sign-up controls (docs/security/SOD_MATRIX.md section 12). vitest has no DOM: the synthetic client address is fixed. */
const DEMO = ["selvara", "demo"].join("-");
const JORDAN = "jordan.avery@demo.selvara.test"; const CASEY = "casey.morgan@demo.selvara.test"; const PRIYA = "priya.nair@demo.selvara.test";
const NEWPW = "Copper-harbour-Violet-58";
afterEach(() => { signOut(false); resetAcct(); resetSignInState(); resetIpGuard(false); resetTrustedNets(); resetMembers(); approvals.set({ list: [] }); appStore.set({ role: "super" }); });
const trustMe = () => trustedNets().push({ id: "TN-T", net: clientIp(), label: "Test office", requestedBy: "x", status: "Active" });

describe("challenge step before blocking", () => {
  it("is needed after 3 recent failures; without an answer the attempt is refused and not counted", async () => {
    for (let i = 0; i < CHALLENGE.AFTER_FAILS; i++) await expect(attempt(JORDAN, "wrong-" + i)).rejects.toThrow(/incorrect/);
    expect(challengeNeeded(JORDAN)).toBe(true);
    await expect(signIn(JORDAN, DEMO)).rejects.toBeInstanceOf(ChallengeRequired);
    await expect(signIn(JORDAN, DEMO, { seed: "made-up", nonce: 1 })).rejects.toBeInstanceOf(ChallengeRequired);
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
    expect(WS_AUDIT.some((e) => e.action === "team.lockout.changed" && e.target.startsWith("Standard → PCI DSS v4"))).toBe(true);
    signOut(false); trustMe(); // isolate the account lock from network blocking
    for (let i = 0; i < 9; i++) await expect(attempt(PRIYA, "nope")).rejects.toThrow(/incorrect/);
    const r = await attempt(PRIYA, DEMO); expect(r.roleId).toBe("employee"); signOut(false);
    for (let i = 0; i < 10; i++) await expect(attempt(PRIYA, "nope")).rejects.toThrow(/incorrect/);
    await expect(attempt(PRIYA, DEMO)).rejects.toThrow(/Too many attempts/);
    expect(lockoutFor("employee").lockMs).toBe(30 * 60_000);
    expect(noticesFor(PRIYA).some((n) => n.text.includes("locked for 30 minutes"))).toBe(true);
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
  it("new recovery codes need the password confirmed in the last 5 minutes", async () => {
    await attempt(JORDAN, DEMO);
    expect((await regenerateCodes()).length).toBe(10); // a fresh sign-in counts
    clearRecentAuth();
    await expect(regenerateCodes()).rejects.toBeInstanceOf(SodError);
    await expect(reauthenticate("nope")).rejects.toThrow(/not correct/);
    await reauthenticate(DEMO);
    expect((await regenerateCodes()).length).toBe(10);
  });
  it("changing the password needs the current one, refuses weak or unchanged ones, ends other sessions and alerts", async () => {
    await attempt(JORDAN, DEMO);
    await expect(changePassword("nope", NEWPW)).rejects.toThrow(/not correct/);
    await expect(changePassword(DEMO, "short")).rejects.toThrow();
    await changePassword(DEMO, NEWPW);
    expect(activeSessions(JORDAN).length).toBe(1);
    expect(noticesFor(JORDAN).some((n) => n.text.startsWith("Your password was changed"))).toBe(true);
    expect(WS_AUDIT.some((e) => e.action === "auth.password.changed" && e.target === "Jordan Avery")).toBe(true);
    signOut(false);
    await expect(attempt(JORDAN, DEMO)).rejects.toThrow(/incorrect/);
    expect((await attempt(JORDAN, NEWPW)).roleId).toBe("admin");
  });
});

describe("password reset", () => {
  it("answers the same for unknown emails; the link is single use, needs the second factor, ends every session and signs nobody in", async () => {
    const ghost = requestReset("nobody@company.example");
    expect(resetLinkValid(ghost.token)).toBe(false);
    await attempt(JORDAN, DEMO); const sessions = activeSessions(JORDAN).length; expect(sessions).toBe(2); signOut(false);
    const link = requestReset(JORDAN);
    expect(resetLinkValid(link.token)).toBe(true);
    await expect(completeReset(link.token, "000000", NEWPW)).rejects.toThrow(/code is not correct/);
    await expect(completeReset(link.token, link.code, "short")).rejects.toThrow();
    await completeReset(link.token, link.code, NEWPW);
    expect(appStore.get().signedIn).toBe(false);
    expect(activeSessions(JORDAN).length).toBe(0);
    expect(resetLinkValid(link.token)).toBe(false);
    await expect(completeReset(link.token, link.code, NEWPW)).rejects.toThrow(/not valid or has expired/);
    expect(noticesFor(JORDAN).some((n) => n.text.startsWith("Your password was reset"))).toBe(true);
    expect(WS_AUDIT.some((e) => e.action === "auth.password.reset" && e.actor === "Jordan Avery")).toBe(true);
    expect((await attempt(JORDAN, NEWPW)).roleId).toBe("admin");
  });
  it("five wrong codes end the link; a link expires after 15 minutes; a new link replaces the old one", async () => {
    const a = requestReset(JORDAN);
    for (let i = 0; i < 5; i++) await expect(completeReset(a.token, "000000", NEWPW)).rejects.toThrow();
    expect(resetLinkValid(a.token)).toBe(false);
    const b = requestReset(CASEY); acct().resets.find((r) => r.token === b.token)!.expires = Date.now() - 1;
    expect(resetLinkValid(b.token)).toBe(false);
    const c1 = requestReset(PRIYA); resetIpGuard(false); const c2 = requestReset(PRIYA);
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
