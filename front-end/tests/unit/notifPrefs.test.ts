import { afterEach, describe, expect, it } from "vitest";
import { WS_AUDIT } from "@/lib/audit";
import { notificationsFor } from "@/lib/notifications";
import { catsFor, isOn } from "@/lib/notifPrefs";
import { SodError } from "@/lib/sod";
import { appStore, setModState } from "@/lib/store";
import { setNotifPref } from "@/services/notifPrefs";

/* Notification matrix. vitest has no DOM: rules and the bell filter only. Personas: owner = Owen Hart, analyst = Sam Lee, vendor = Grace Lin. */
const as = (role: string) => appStore.set({ role });
afterEach(() => { setModState("shell.notifPrefs", {}); as("super"); });

describe("notification matrix", () => {
  it("defaults to the bell for everything and the digest for approvals only", () => {
    expect(isOn("owner", "controls", "bell")).toBe(true);
    expect(isOn("owner", "controls", "email")).toBe(false);
    expect(isOn("owner", "approvals", "email")).toBe(true);
  });
  it("offers only the kinds the role can open", () => {
    expect(catsFor("owner").map((c) => c.id)).toEqual(["security", "approvals", "controls", "evidence", "issues", "vendors"]);
    expect(catsFor("analyst").map((c) => c.id)).toEqual(["security", "approvals", "controls", "evidence", "issues"]);
    expect(catsFor("vendor").map((c) => c.id)).toEqual(["security", "approvals"]);
  });
  it("hides a switched-off kind from the bell and audits the change", async () => {
    as("owner");
    expect(notificationsFor("owner", "ws").some((n) => n.cat === "controls")).toBe(true);
    await setNotifPref("controls", "bell", false);
    expect(notificationsFor("owner", "ws").some((n) => n.cat === "controls")).toBe(false);
    expect(notificationsFor("owner", "ws").some((n) => n.cat === "issues")).toBe(true);
    expect(WS_AUDIT.some((e) => e.action === "notifications.pref.changed" && e.target.includes("Owen Hart") && e.target.includes("Failing controls"))).toBe(true);
    await setNotifPref("controls", "bell", true);
    expect(notificationsFor("owner", "ws").some((n) => n.cat === "controls")).toBe(true);
  });
  it("keeps a person's choice to that person", async () => {
    as("owner"); await setNotifPref("issues", "bell", false);
    expect(isOn("owner", "issues", "bell")).toBe(false);
    expect(isOn("analyst", "issues", "bell")).toBe(true);
    expect(isOn("owner2", "issues", "bell")).toBe(true);
  });
  it("never lets approvals waiting for you be switched off in the bell", async () => {
    as("owner");
    await expect(setNotifPref("approvals", "bell", false)).rejects.toBeInstanceOf(SodError);
    expect(isOn("owner", "approvals", "bell")).toBe(true);
    await setNotifPref("approvals", "email", false); // the digest is optional
    expect(isOn("owner", "approvals", "email")).toBe(false);
  });
  it("refuses a kind the role does not receive, and unknown values", async () => {
    as("vendor");
    await expect(setNotifPref("controls", "bell", false)).rejects.toBeInstanceOf(SodError);
    as("owner");
    await expect(setNotifPref("nope" as never, "bell", false)).rejects.toBeInstanceOf(SodError);
    await expect(setNotifPref("controls", "sms" as never, false)).rejects.toBeInstanceOf(SodError);
    await expect(setNotifPref("controls", "bell", "no" as never)).rejects.toBeInstanceOf(SodError);
  });
  it("leaves Admin Console notices alone", async () => {
    as("owner"); await setNotifPref("controls", "bell", false);
    expect(notificationsFor("super", "admin").every((n) => !n.cat)).toBe(true);
  });
});
