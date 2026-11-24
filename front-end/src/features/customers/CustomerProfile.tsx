import { Kpi, Spark, StatusChip } from "@/components/ui";
import { money } from "@/lib/format";
import { useModState } from "@/lib/store";
import * as svc from "@/services/customers";
import { Meter, PlanTab } from "./PlanTab";
import { UsersTab } from "./UsersTab";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Prototype: custProfile / custTab / custTabRender. */
export function CustomerProfile({ c }: { c: any }) {
  const [tab, setTab] = useModState<string>("customers.tab", "over"); const u = c.usage;
  const tiles: [string, string, string][] = [["Plan", c.plan, "billing"], ["Seats in use", u.seatsUsed + " / " + c.seats.split("/")[1].trim(), "people"], ["Monthly value", c.mrr ? money(c.mrr) : "Trial", "rates"]];
  const tabs: [string, string][] = [["over", "Overview"], ["plan", "Plan & modules"], ["users", `Users (${svc.usersFor(c.id).length})`], ["use", "Usage breakdown"]];
  svc.custInit(c); // plan limits for the usage breakdown
  // Each metric against its own plan limit: the units differ (screenings, GB, seats), so they never share one scale.
  const metrics: [string, number, number][] = [["Screenings / mo", u.screenings, c.limits.screenings], ["Identity verifications / mo", u.idv, c.limits.idv], ["Storage (GB)", u.storageGB, c.limits.storageGB], ["Seats used", u.seatsUsed, c.seatLimit]];
  const t = tabs.some((x) => x[0] === tab) ? tab : "over";
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <span className="avatar" style={{ width: 40, height: 40, fontSize: 15 }}>{c.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2)}</span>
        <div><div style={{ fontSize: 17, fontWeight: 600 }}>{c.name}</div><div style={{ fontSize: 12.5, color: "var(--muted)" }}>{c.id}, {c.region}, {c.contact.email}</div></div>
        <div style={{ marginLeft: "auto" }}><StatusChip s={c.status} /></div>
      </div>
      <div role="group" aria-label="Customer summary" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, margin: "10px 0 14px" }}>{tiles.map((x) => <Kpi key={x[0]} icon={x[2]} label={x[0]} value={x[1]} tone="neutral" />)}</div>
      <div className="card" style={{ boxShadow: "none" }}>
        <div className="c-head" style={{ padding: "0 8px" }}>
          <div className="tabs" role="tablist" data-tour="customers-tabs">{tabs.map(([k, l]) => <button key={k} className="tab" role="tab" id={`custTab-${k}`} aria-selected={t === k} aria-controls="custTabBody" onClick={() => setTab(k)}>{l}</button>)}</div>
        </div>
        <div className="c-body" id="custTabBody" role="tabpanel" aria-labelledby={`custTab-${t}`}>
          {t === "plan" ? <PlanTab c={c} /> : t === "users" ? <UsersTab cid={c.id} /> : t === "over" ? (
            <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div><div className="sectitle">API calls (7 months, thousands)</div><Spark data={u.apiCalls} w={300} h={56} /></div>
              <dl className="meta-grid"><dt>Billing cycle</dt><dd>{c.cycle}</dd><dt>Region</dt><dd>{c.region}</dd><dt>Billing contact</dt><dd>{c.contact.name}</dd><dt>Next invoice</dt><dd>{c.next}</dd></dl>
            </div>
          ) : (
            <div className="fields-cap">
              <div className="sectitle" style={{ marginTop: 0 }}>This month against plan limits</div>
              {metrics.map((x) => <Meter key={x[0]} label={x[0]} used={x[1]} limit={x[2]} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
