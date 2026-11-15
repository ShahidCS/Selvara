import { afterEach, describe, expect, it } from "vitest";
import { ADMIN_AUDIT } from "@/lib/adminAudit";
import { endElevation, startElevation } from "@/lib/elevation";
import { IP_POLICY, allowJoin, clientIp, ipBlockMessage, ipRecords, recordIpFailure, recordIpSuccess, resetIpGuard } from "@/lib/ipGuard";
import { requestToJoin, resetMembers, signOut } from "@/lib/session";
import { SodError } from "@/lib/sod";
import { attempt } from "./signinHelper";
import { resetSignInState } from "@/lib/session";
import { appStore } from "@/lib/store";
import { resetAcct } from "@/lib/accountSecurity";
import { blockedAddresses, unblockAddress } from "@/services/ipBlocks";

/* Progressive blocking of a network address after repeated failed sign-ins. vitest has no DOM: the synthetic client address is fixed. */
const DEMO = ["selvara", "demo"].join("-");
const MIN = 60_000; const DAY = 86_400_000;
const ip = "198.51.100.9";
const burst = (at: number, n = IP_POLICY.THRESHOLD, who = ip) => { for (let i = 0; i < n; i++) recordIpFailure(who, at + i); };
const rec = (who = ip) => ipRecords().find((r) => r.ip === who)!;
afterEach(() => { resetAcct(); resetSignInState(); signOut(false); endElevation(); resetIpGuard(false); resetMembers(); appStore.set({ role: "super" }); });

describe("progressive blocking", () => {
  it("blocks at the threshold, not before", () => {
    const t = Date.now();
    burst(t, IP_POLICY.THRESHOLD - 1);
    expect(ipBlockMessage(ip, t + 20)).toBeNull();
    recordIpFailure(ip, t + 30);
    expect(ipBlockMessage(ip, t + 40)).toMatch(/Try again after/);
    expect(rec().until - (t + 30)).toBe(5 * MIN);
    expect(ADMIN_AUDIT.some((e) => e.action === "auth.ip.blocked" && e.object === ip && e.after === "5 minutes")).toBe(true);
  });
  it("only counts failures inside the window, and a success clears the count", () => {
    const t = Date.now();
    burst(t, IP_POLICY.THRESHOLD - 1);
    recordIpFailure(ip, t + IP_POLICY.WINDOW_MS + 10); // the earlier ones fell out of the window
    expect(ipBlockMessage(ip, t + IP_POLICY.WINDOW_MS + 20)).toBeNull();
    burst(t + IP_POLICY.WINDOW_MS + 30, IP_POLICY.THRESHOLD - 2);
    recordIpSuccess(ip);
    recordIpFailure(ip, t + IP_POLICY.WINDOW_MS + 100);
    expect(ipBlockMessage(ip, t + IP_POLICY.WINDOW_MS + 110)).toBeNull();
  });
  it("climbs 5 minutes, 30 minutes, 2 hours, 24 hours, then permanent", () => {
    let t = Date.now();
    const lengths: number[] = [];
    for (let i = 0; i < 5; i++) { burst(t); const r = rec(); lengths.push(r.until - (t + IP_POLICY.THRESHOLD - 1)); t = (r.until === Infinity ? t : r.until) + MIN; }
    expect(lengths).toEqual([5 * MIN, 30 * MIN, 120 * MIN, DAY, Infinity]);
    expect(ipBlockMessage(ip, Date.now() + 10_000 * DAY)).toMatch(/blocked after repeated failed attempts/);
  });
  it("starts again at 5 minutes after 30 days without a block", () => {
    const t = Date.now();
    burst(t); burst(t + 10 * MIN); // level 2
    expect(rec().level).toBe(2);
    const later = t + 31 * DAY;
    burst(later);
    expect(rec().level).toBe(1); expect(rec().until - (later + IP_POLICY.THRESHOLD - 1)).toBe(5 * MIN);
  });
});

describe("sign-in and sign-up under a block", () => {
  it("counts failures across different accounts, then refuses even the right password", async () => {
    const me = clientIp();
    const emails = ["jordan.avery", "casey.morgan", "owen.hart"].map((n) => `${n}@demo.selvara.test`);
    let n = 0;
    while (!ipBlockMessage(me)) { await expect(attempt(emails[n % 3], "wrong-" + n)).rejects.toThrow(); n++; }
    expect(n).toBe(IP_POLICY.THRESHOLD);
    await expect(attempt("taylor.reed@demo.selvara.test", DEMO)).rejects.toThrow(/from your network/);
    expect(appStore.get().signedIn).toBe(false);
  });
  it("attempts on a locked account still count against the network", async () => {
    const me = clientIp();
    for (let i = 0; i < IP_POLICY.THRESHOLD; i++) await expect(attempt("casey.morgan@demo.selvara.test", "nope")).rejects.toThrow();
    expect(ipBlockMessage(me)).not.toBeNull();
  });
  it("limits requests to join from one address", async () => {
    const pw = "Lantern-orbit-Quince-71";
    for (let i = 0; i < IP_POLICY.JOIN_MAX; i++) await requestToJoin({ name: "Person " + "ABC"[i], email: `p${i}@company.example`, password: pw });
    await expect(requestToJoin({ name: "Person D", email: "p9@company.example", password: pw })).rejects.toThrow(/Too many requests to join/);
    expect(allowJoin("198.51.100.200")).toBe(true); // another address is unaffected
  });
});

describe("lifting a block", () => {
  it("only an elevated super admin, with a reason; the level resets; audited", async () => {
    burst(Date.now(), IP_POLICY.THRESHOLD); burst(Date.now() + 10 * MIN); // level 2
    appStore.set({ role: "support" });
    await expect(unblockAddress(ip, "Customer confirmed it was a misconfigured script")).rejects.toBeInstanceOf(SodError);
    appStore.set({ role: "super" });
    await expect(unblockAddress(ip, "Customer confirmed it was a misconfigured script")).rejects.toBeInstanceOf(SodError); // not elevated
    startElevation("super", "Reviewing sign-in blocks for a customer", 15, "SEC-42");
    await expect(unblockAddress(ip, "too short")).rejects.toBeInstanceOf(SodError);
    await unblockAddress(ip, "Customer confirmed it was a misconfigured script");
    expect(ipBlockMessage(ip)).toBeNull(); expect(rec().level).toBe(0);
    expect(ADMIN_AUDIT.some((e) => e.action === "auth.ip.unblocked" && e.object.includes(ip) && e.object.includes("SEC-42"))).toBe(true);
    await expect(unblockAddress(ip, "Customer confirmed it was a misconfigured script")).rejects.toThrow(/not blocked/);
  });
  it("a permanent block lasts until lifted", async () => {
    resetIpGuard(true); // seeds include a permanent block
    const perm = blockedAddresses().find((r) => r.until === Infinity)!;
    expect(ipBlockMessage(perm.ip, Date.now() + 365 * DAY)).not.toBeNull();
    startElevation("super", "Reviewing sign-in blocks for a customer", 15, "SEC-43");
    await unblockAddress(perm.ip, "Address belongs to the customer's new office");
    expect(ipBlockMessage(perm.ip)).toBeNull();
  });
});
