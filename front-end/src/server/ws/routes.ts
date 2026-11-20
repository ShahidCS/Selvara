/* Server-only. The workspace modules' routes (production programme), registered into core.ts's table. Each group adds its module here. */
import { assuranceRoutes } from "./assurance";
import { invalid, modAllowed, ok, membersOf, refuse, txt, wsRoute, type WsHelpers } from "./common";
import { evidenceRoutes } from "./evidence";
import { accessRoutes } from "./access";
import { delegationRoutes } from "./delegation";
import { flowRoutes } from "./flow";
import { peopleRoutes } from "./people";
import { policyRoutes } from "./policies";
import { riskRoutes } from "./risk";
import { issueRoutes } from "./issues";
import { reportRoutes } from "./reports";
import { insightRoutes } from "./insight";

/** Export kinds the audit log accepts, and the module each belongs to. */
const EXPORTS: Record<string, string> = {
  "controls.soa.exported": "controls", "controls.matrix.exported": "controls", "control.workpaper.exported": "controls", "framework.gap.exported": "frameworks", "risk.register.exported": "risk",
};
export function workspaceRoutes(h: WsHelpers) {
  /** The company's active members (id, name, role) for owner and assignee pickers; any member may see them. */
  const members = wsRoute(h, null, async (d, _r, c) => (["vendor", "viewer"].includes(c.actor.role) ? ok([]) : ok(await membersOf(d, c.actor))));
  /** An export the browser built from data the person may already see, recorded in the company's audit log (only known export kinds). */
  const exported = wsRoute(h, null, async (d, r, c) => {
    const action = txt(r.body.action, 60); const mod = EXPORTS[action]; if (!mod) invalid("Unknown export.");
    if (!modAllowed(c.actor.role, mod)) refuse("Not permitted.");
    await d.ws.tx(c.actor, d.now(), async (t) => {
      // the entry's details come from the server's own records, not from the browser
      let target: string;
      if (action === "controls.soa.exported" || action === "controls.matrix.exported") target = `${(await t.list("control")).length} controls`;
      else if (action === "control.workpaper.exported") { const id = txt(r.body.target, 40); if (!(await t.get("control", id))) invalid("Control not found."); target = id; }
      else if (action === "risk.register.exported") target = `${(await t.list("risk")).length} risks`;
      else { const m = /^(.{1,160}), (\d{1,5}) gaps$/.exec(txt(r.body.target, 200)); if (!m) invalid("Unknown export."); target = `${m![1]}, ${m![2]} gaps`; }
      await t.audit(action, target);
    });
    return ok();
  });
  return { "GET ws/members": members, "POST ws/exports": exported, ...assuranceRoutes(h), ...evidenceRoutes(h), ...policyRoutes(h), ...delegationRoutes(h), ...peopleRoutes(h), ...accessRoutes(h), ...flowRoutes(h),
    ...riskRoutes(h), ...issueRoutes(h), ...reportRoutes(h), ...insightRoutes(h) };
}
