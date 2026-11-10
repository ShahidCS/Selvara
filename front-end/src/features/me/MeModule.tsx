import { Empty, Page } from "@/components/ui";
import { getMe } from "@/lib/audit";
import { toAcknowledge } from "@/lib/me";
import { modAllowed } from "@/lib/rbac";
import { useApp, useData } from "@/lib/store";
import AccountSecurity from "./AccountSecurity";
import MyRemarks from "./MyRemarks";
import MyTasks, { useTasks } from "./MyTasks";
import PublishedPolicies from "./PublishedPolicies";

/** Member workspace (board: member-workspace; docs/architecture/SPEC_BOARDS.md section 4). Deny by default: only roles with `me` in ROLE_MODS. */
export default function MeModule() {
  const role = useApp((s) => s.role);
  if (!modAllowed(role, "ws", "me")) {
    return <Page mod="me"><Empty icon="alert" title="Not available for your role">My workspace is for employees, owners and analysts. Switch role or ask a company admin.</Empty></Page>;
  }
  return <MeBody role={role} />;
}

function MeBody({ role }: { role: string }) {
  useData();
  const me = getMe();
  const { tasks } = useTasks(role);
  const open = tasks.filter((t) => !t.isDone).length;
  const toAck = toAcknowledge(me.name);
  const first = me.name.split(" ")[0];
  return (
    <Page title={`Good morning, ${first}`} sub={`You have ${open} open tasks · ${toAck} policies to acknowledge`}>
      <div className="banner info">
        <strong>Member access.</strong> You can read published policies, add remarks on policies you are invited to, and acknowledge policies. Only a policy&apos;s creator can edit it; settings and team management are for company admins.
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "stretch" }}>
        <MyTasks role={role} />
        <MyRemarks role={role} />
      </div>
      <PublishedPolicies />
      <AccountSecurity />
    </Page>
  );
}
