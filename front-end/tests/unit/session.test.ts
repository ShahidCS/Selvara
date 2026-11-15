import { afterEach, describe, expect, it } from "vitest";
import { WS_AUDIT } from "@/lib/audit";
import { getActor, SodError } from "@/lib/sod";
import { attempt, forgetSecrets } from "./signinHelper";
import { resetSignInState } from "@/lib/session";
import { appStore } from "@/lib/store";
import { resetAcct } from "@/lib/accountSecurity";
import { resetIpGuard } from "@/lib/ipGuard";
import { DEMO_ACCOUNTS, JOIN_ROLE, SIGNIN_FAILED, demoEmail, joinRequests, requestToJoin, resetMembers, restoreSession, signOut } from "@/lib/session";
import { decideJoin, pendingJoins } from "@/services/joinRequests";

/* Demo sign-in (DEMO ONLY). The shared demo password is documented in README.md; the code holds only its hash. vitest has no DOM. */
const DEMO = ["selvara", "demo"].join("-");
const strong = "Lantern-orbit-Quince-71";
afterEach(() => { forgetSecrets(); resetAcct(); resetSignInState(); signOut(false); resetMembers(); resetIpGuard(false); appStore.set({ role: "super" }); });

describe("demo accounts", () => {
  it("has one synthetic account per persona on a reserved test domain", () => {
    expect(DEMO_ACCOUNTS.find((a) => a.roleId === "admin")!.email).toBe("jordan.avery@demo.selvara.test");
    expect(new Set(DEMO_ACCOUNTS.map((a) => a.email)).size).toBe(DEMO_ACCOUNTS.length);
    expect(demoEmail("Sam Lee")).not.toBe(demoEmail("Sam Hayes"));
  });
  it("signs in with the demo password, case-insensitive email, and audits it", async () => {
    const r = await attempt("  Jordan.Avery@DEMO.selvara.test ", DEMO);
    expect(r.roleId).toBe("admin");
    expect(appStore.get().signedIn).toBe(true); expect(getActor().name).toBe("Jordan Avery");
    expect(WS_AUDIT.some((e) => e.action === "auth.signed_in" && e.target === "Jordan Avery")).toBe(true);
  });
  it("gives the same message for a wrong password and an unknown email", async () => {
    await expect(attempt("jordan.avery@demo.selvara.test", "wrong-password")).rejects.toThrow(SIGNIN_FAILED);
    await expect(attempt("nobody@demo.selvara.test", DEMO)).rejects.toThrow(SIGNIN_FAILED);
    expect(appStore.get().signedIn).toBe(false);
  });
  it("locks an email for a while after five failures, even with the right password", async () => {
    for (let i = 0; i < 5; i++) await expect(attempt("casey.morgan@demo.selvara.test", "nope")).rejects.toThrow();
    await expect(attempt("casey.morgan@demo.selvara.test", DEMO)).rejects.toThrow(/Too many attempts/);
  });
});

describe("request to join", () => {
  it("refuses weak input and never reveals whether an email is known", async () => {
    await expect(requestToJoin({ name: "A", email: "alex.kim@company.example", password: strong })).rejects.toThrow(/full name/);
    await expect(requestToJoin({ name: "Alex Kim", email: "not-an-email", password: strong })).rejects.toThrow(/valid work email/);
    await expect(requestToJoin({ name: "Alex Kim", email: "alex.kim@company.example", password: "password1" })).rejects.toThrow();
    await requestToJoin({ name: "Alex Kim", email: "alex.kim@company.example", password: strong });
    await requestToJoin({ name: "Alex Kim", email: "Alex.Kim@company.example", password: strong }); // duplicate: same answer, ignored
    await requestToJoin({ name: "Jordan", email: "jordan.avery@demo.selvara.test", password: strong }); // demo account: ignored
    expect(joinRequests().length).toBe(1);
    expect(JSON.stringify(joinRequests())).not.toContain(strong); // only a salted hash is kept
  });
  it("cannot sign in until a company admin approves; then signs in as an Employee under their own name", async () => {
    await requestToJoin({ name: "Alex Kim", email: "alex.kim@company.example", password: strong });
    await expect(attempt("alex.kim@company.example", strong)).rejects.toThrow(/waiting for a company admin/);
    await expect(attempt("alex.kim@company.example", "Wrong-password-123")).rejects.toThrow(SIGNIN_FAILED);
    const id = pendingJoins()[0].id;
    await attempt("owen.hart@demo.selvara.test", DEMO);
    await expect(decideJoin(id, "approve", "Joined the risk team")).rejects.toBeInstanceOf(SodError); // owner is not a company admin
    signOut(); await attempt("jordan.avery@demo.selvara.test", DEMO);
    await expect(decideJoin(id, "approve", "short")).rejects.toBeInstanceOf(SodError);
    await decideJoin(id, "approve", "Joined the risk team this week");
    expect(WS_AUDIT.some((e) => e.action === "team.join.approved" && e.target.includes("Alex Kim"))).toBe(true);
    await expect(decideJoin(id, "reject", "Changed my mind on it")).rejects.toThrow(/already been decided/);
    signOut();
    const r = await attempt("alex.kim@company.example", strong);
    expect(r.roleId).toBe(JOIN_ROLE);
    expect(getActor().name).toBe("Alex Kim"); expect(getActor().base).toBe("employee");
    signOut(); expect(getActor().name).not.toBe("Alex Kim"); // the persona is restored
  });
  it("a rejected person cannot sign in", async () => {
    await requestToJoin({ name: "Rae Fox", email: "rae.fox@company.example", password: strong });
    await attempt("jordan.avery@demo.selvara.test", DEMO);
    await decideJoin(pendingJoins()[0].id, "reject", "Not part of this company");
    signOut();
    await expect(attempt("rae.fox@company.example", strong)).rejects.toThrow(/not approved/);
  });
  it("a stored session for someone who is no longer an active member is signed out on load", () => {
    appStore.set({ signedIn: true, role: JOIN_ROLE, who: "Ghost Person" });
    restoreSession();
    expect(appStore.get().signedIn).toBe(false);
  });
});

describe("sign-out and elevation", () => {
  it("ends an active elevation when the super admin signs out", async () => {
    const { startElevation, elevationActive } = await import("@/lib/elevation");
    await attempt("dana.whitfield@demo.selvara.test", DEMO);
    startElevation("super", "Investigating a customer billing ticket", 15, "OPS-123");
    expect(elevationActive()).toBe(true);
    signOut();
    await attempt("dana.whitfield@demo.selvara.test", DEMO);
    expect(elevationActive()).toBe(false);
  });
});
