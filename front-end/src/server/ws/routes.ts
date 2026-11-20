/* Server-only. The workspace modules' routes (production programme), registered into core.ts's table. Each group adds its module here. */
import { assuranceRoutes } from "./assurance";
import { invalid, modAllowed, ok, membersOf, refuse, txt, wsRoute, type WsHelpers } from "./common";
import { evidenceRoutes } from "./evidence";

/** Export kinds the audit log accepts, and the module each belongs to. */
const EXPORTS: Record<string, string> = {
  "controls.soa.exported": "controls", "controls.matrix.exported": "controls", "control.workpaper.exported": "controls", "framework.gap.exported": "frameworks",
};
export function workspaceRoutes(h: WsHelpers) {
  /** The company's active members (id, name, role) for owner and assignee pickers; any member may see them. */
  const members = wsRoute(h, null, async (d, _r, c) => ok(await membersOf(d, c.actor)));
  /** An export the browser built from data the person may already see, recorded in the company's audit log (only known export kinds). */
  const exported = wsRoute(h, null, async (d, r, c) => {
    const action = txt(r.body.action, 60); const mod = EXPORTS[action]; if (!mod) invalid("Unknown export.");
    if (!modAllowed(c.actor.role, mod)) refuse("Not permitted.");
    await d.ws.tx(c.actor, d.now(), (t) => t.audit(action, txt(r.body.target, 200)));
    return ok();
  });
  return { "GET ws/members": members, "POST ws/exports": exported, ...assuranceRoutes(h), ...evidenceRoutes(h) };
}
