import { describe, expect, it } from "vitest";
import { SERVER_READY, firstMod, landingPath, modAllowed } from "@/lib/rbac";

/* Decision D4 (docs/architecture/BACKEND_FOUNDATION.md section 10): in production only modules with a server API are shown. */
describe("module access in production (API mode) and in the demonstration", () => {
  it("the demonstration keeps every module the role lists", () => {
    expect(modAllowed("admin", "ws", "controls", false)).toBe(true);
    expect(modAllowed("employee", "ws", "policies", false)).toBe(true);
    expect(modAllowed("employee", "ws", "team", false)).toBe(false);
    expect(landingPath("admin", "ws", false)).toBe("/ws/overview");
    expect(landingPath("super", "admin", false)).toBe("/admin/customers");
  });

  it("production hides modules without a server API, even for roles that list every module", () => {
    expect(modAllowed("admin", "ws", "controls", true)).toBe(false);
    expect(modAllowed("admin", "ws", "overview", true)).toBe(false);
    expect(modAllowed("super", "admin", "billing", true)).toBe(false);
    expect(modAllowed("super", "admin", "customers", true)).toBe(true); // Admin Console, slice 3a
    expect(modAllowed("admin", "ws", "team", true)).toBe(true);
  });

  it("production still denies by role: a module on the server is not opened to a role that does not list it", () => {
    expect(SERVER_READY.ws).toContain("team");
    expect(modAllowed("employee", "ws", "team", true)).toBe(false);
    expect(modAllowed("viewer", "ws", "team", true)).toBe(false);
  });

  it("production lands a company admin on Team & Settings, platform staff on Customers & Usage, and a role with nothing on the server yet on its account page", () => {
    expect(landingPath("admin", "ws", true)).toBe("/ws/team");
    expect(firstMod("admin", "ws", true)).toBe("team");
    for (const r of ["employee", "owner", "analyst", "auditor", "vendor", "viewer"]) expect(landingPath(r, "ws", true)).toBe("/auth");
    expect(landingPath("super", "admin", true)).toBe("/admin/customers");
    expect(landingPath("support", "admin", true)).toBe("/admin/customers");
    expect(modAllowed("support", "admin", "elevation", true)).toBe(false); // support never elevates
    expect(modAllowed("support", "admin", "adminlog", true)).toBe(true);
  });
});
