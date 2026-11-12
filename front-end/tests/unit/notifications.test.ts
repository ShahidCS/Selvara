import { describe, expect, it } from "vitest";
import { notificationsFor, markRead, readIds, restoreRead, unreadCount } from "@/lib/notifications";
import { ROLES } from "@/lib/rbac";

describe("notifications", () => {
  it("are derived from the data and only for modules the role may open", () => {
    const ids = (role: string, space: "ws" | "admin") => notificationsFor(role, space).map((n) => n.id);
    // an Employee has no Controls, Issues or Vendors module
    expect(ids("employee", "ws")).toEqual([]);
    // a Company Admin sees failing controls and overdue issues
    const admin = ids("admin", "ws");
    expect(admin.some((i) => i.startsWith("ctl:"))).toBe(true);
    expect(admin.some((i) => i.startsWith("iss:"))).toBe(true);
    // workspace roles get nothing from the platform space
    expect(ids("admin", "admin")).toEqual([]);
  });

  it("every item names a route and a tone, and never decides anything itself", () => {
    for (const r of ROLES) for (const sp of ["ws", "admin"] as const)
      for (const n of notificationsFor(r.id, sp)) {
        expect(n.path.startsWith(`/${sp}/`)).toBe(true);
        expect(["bad", "warn", "info"]).toContain(n.tone);
        expect(n.title.length).toBeGreaterThan(0);
      }
  });

  it("platform approvals are MFA reset requests", () => {
    const asSuper = notificationsFor("super", "admin");
    expect(asSuper.filter((n) => n.kind === "approval").every((n) => n.id.startsWith("mfa:"))).toBe(true);
  });

  it("read state supports mark, undo and a per-role unread count", () => {
    restoreRead([]);
    const items = notificationsFor("admin", "ws");
    expect(items.length).toBeGreaterThan(1);
    expect(unreadCount(items)).toBe(items.length);
    const before = readIds();
    markRead(items.map((n) => n.id));
    expect(unreadCount(items)).toBe(0);
    restoreRead(before);
    expect(unreadCount(items)).toBe(items.length);
  });
});
