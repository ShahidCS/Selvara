import { useEffect, useRef, useState } from "react";
import { DataTable, Empty, Icon, KpiStrip, KpiTile, Page, StatusChip, type DTColumn } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { useApp, useData, useModState } from "@/lib/store";
import { pendingAdminApprovals } from "@/lib/adminApprovals";
import { sodMessage, useElevation } from "@/lib/elevation";
import * as svc from "@/features/rates/services/rates";
import { HeldRequestForm, RateEditForm } from "./RateEdit";
import { ElevateGateBanner, useGate } from "@/components/kit/admin/ElevateGate";
import { PendingApprovals } from "@/components/kit/admin/PendingApprovals";
import { API_ON } from "@/lib/rbac";
import { ApiRates } from "./ApiRates";

/** Prototype: REND.rates (Exchange Rates & Tax, Held/Applied workflow). Module state (query, region, details) survives navigation like the prototype's RATE. */
export default function RatesModule() { return API_ON ? <ApiRates /> : <DemoRates />; }
function DemoRates() {
  useData(); const L = useLayer(); const gate = useGate(); const el = useElevation();
  const allowed = svc.ratesCanManage(useApp((s) => s.role));
  const [rules, setRules] = useModState("rates.rules", false);
  const [refreshing, setRefreshing] = useState(false); const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  if (!allowed) return <Page mod="rates"><Empty icon="alert" title="Access restricted">Your role cannot manage exchange rates and tax.</Empty></Page>;
  const T = svc.RATE_THRESHOLDS;
  const held = svc.RATE_ROWS.filter((r) => r.status === "Held").length;
  const pending = new Set(pendingAdminApprovals("rates.").map((a) => a.subject));
  const allCols: DTColumn<svc.RateRow>[] = [
    { key: "country", header: "Country", value: (r) => r.country, locked: true, render: (r) => <span className="strong">{r.country}</span> },
    { key: "currency", header: "Currency", value: (r) => r.currency, render: (r) => <span className="num">{r.currency}</span> },
    { key: "rate", header: "Rate / USD", align: "end", value: (r) => r.rate, render: (r) => <span className="num">{r.rate.toLocaleString("en-US", { minimumFractionDigits: r.rate < 10 ? 4 : 2 })}</span> },
    { key: "updated", header: "Last updated", value: (r) => r.updatedAt ?? 0, render: (r) => <span className="num" style={{ whiteSpace: "nowrap" }}>{r.updatedAt ? new Date(r.updatedAt).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "—"}</span> },
    { key: "tax", header: "Tax", value: (r) => `${r.tax.type} ${r.tax.rate}%`, render: (r) => `${r.tax.type} ${r.tax.rate}%` },
    { key: "eff", header: "Effective", value: (r) => r.tax.eff, render: (r) => <span style={{ whiteSpace: "nowrap" }}>{r.tax.eff}</span> },
    { key: "status", header: "Status", value: (r) => r.status, render: (r) => (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
        <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{r.status === "Held" ? <span className="chip warn"><Icon name="alert" />Held for review</span> : <StatusChip s="Applied" />}{pending.has(r.code) ? <span className="chip info"><Icon name="clock" />Pending approval</span> : null}</span>
        {r.status === "Held" && r.reason ? <span style={{ fontSize: 12, color: "var(--muted)", maxWidth: "36ch" }}>{r.reason}</span> : null}
      </div>
    ) },
    { key: "act", header: "Actions", hideHeader: true, locked: true, align: "end", render: (r) => {
      const why = gate.title || (pending.has(r.code) ? "A request is already pending" : undefined);
      return (
        <span style={{ whiteSpace: "nowrap" }}>
          {r.status === "Held" ? <>
            <button className="btn btn-ghost sm" aria-label={`Release ${r.country} rate, needs approval`} disabled={gate.locked || pending.has(r.code)} title={why} onClick={() => decide(r, true)}><Icon name="check" />Release</button>
            <button className="btn btn-ghost sm" aria-label={`Reject ${r.country} rate, needs approval`} disabled={gate.locked || pending.has(r.code)} title={why} onClick={() => decide(r, false)}><Icon name="x" />Reject</button></>
            : <button className="btn btn-ghost sm" aria-label={`Edit ${r.country}`} disabled={gate.locked || pending.has(r.code)} title={why} onClick={() => L.openDrawer("Edit " + r.country, "Currency, exchange rate and tax", (close) => <RateEditForm code={r.code} close={close} />)}><Icon name="edit" />Edit</button>}
        </span>
      );
    } },
  ];
  // Roles that can never elevate (support) see no action column: the page banner already says the page is read-only for them.
  const cols = el.canElevate ? allCols : allCols.filter((c) => c.key !== "act");
  const regionTest = (r: svc.RateRow, o: string) => r.region === o || (o === "Americas" && r.code === "US");
  const decide = (r: svc.RateRow, ok: boolean) => L.openModal((ok ? "Release held rate: " : "Reject held rate: ") + r.country, (close) => <HeldRequestForm code={r.code} ok={ok} close={close} />);
  const refresh = async () => {
    setRefreshing(true);
    try { await svc.refreshRates(); } catch (e) { setRefreshing(false); L.toast(sodMessage(e, "Could not refresh the rates"), false); return; }
    timer.current = setTimeout(() => { setRefreshing(false); L.toast("Rates refreshed from primary feed"); }, 950);
  };
  return (
    <Page mod="rates" acts={el.canElevate ? <>
      <button className="btn btn-secondary" disabled={gate.locked} title={gate.title} onClick={() => L.toast("Sample feed run (demo)")}><Icon name="rates" />Run sample feed <span className="tag" style={{ marginLeft: 4 }}>Offline demo</span></button>
      <button className="btn btn-primary" id="refreshBtn" data-tour="rates-refresh" onClick={refresh} disabled={refreshing || gate.locked} title={gate.title} aria-busy={refreshing}>{refreshing ? <span className="spin" /> : <Icon name="refresh" />}Refresh rates</button>
    </> : undefined}>
      <div className="scroll" style={{ flex: "1 1 auto", display: "flex", flexDirection: "column", gap: 14, paddingRight: 2 }}>
      <ElevateGateBanner />
      <PendingApprovals prefix="rates." title="Pending approvals" run={svc.decideRates} withdraw={svc.withdrawRates} />
      <KpiStrip label="Rates summary">
        <KpiTile label="Countries" value={svc.RATE_ROWS.length} delta={{ tone: "flat", text: "In scope" }} caption="With a currency and tax rule" />
        <KpiTile label="Held for review" value={held} delta={{ tone: held ? "watch" : "good", text: held ? "Needs a decision" : "None held" }} caption="Moved too far, feeds disagree or stale" />
        <KpiTile label="Pending approvals" value={pending.size} delta={{ tone: pending.size ? "watch" : "flat", text: pending.size ? "Awaiting a second person" : "None" }} caption="Release, reject or edit requests" />
        <KpiTile label="Last updated" value="06:00" delta={{ tone: "flat", text: "GST, every 12 hours" }} caption="From the primary feed" />
      </KpiStrip>
      <div className="card" data-tour="rates-table" style={{ flex: "0 0 auto", minHeight: 360 }}>
        <div className="c-body flush" style={{ padding: 0 }} id="ratesTable">
          <DataTable<svc.RateRow> id="rates" label="Exchange rates and tax" rows={svc.RATE_ROWS} rowKey={(r) => r.code} columns={cols} searchText={(r) => `${r.country} ${r.currency}`}
            filters={[{ key: "region", label: "Region", options: svc.REGIONS.filter((r) => r !== "All"), get: (r) => r.region, test: regionTest }, { key: "status", label: "Status", options: ["Applied", "Held"], get: (r) => r.status, labels: { Held: "Held for review" } }]} exportName="exchange-rates" emptyText="No countries match. Adjust the search or filters." />
        </div>
      </div>
      <details className="card" style={{ flex: "0 0 auto" }} open={rules} onToggle={(e) => setRules((e.currentTarget as HTMLDetailsElement).open)}>
        <summary className="c-head" style={{ cursor: "pointer", listStyle: "none", display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="chevron" style={{ transform: rules ? "rotate(90deg)" : undefined, transition: "transform var(--dur, 150ms)" }} />
          <h3 style={{ margin: 0 }}>How rates are refreshed and held</h3>
          <span style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--accent-ink)", textDecoration: "underline" }}>{rules ? "Hide details" : "Show details"}</span>
        </summary>
        <div className="c-body" style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55 }}>
          <p style={{ margin: "0 0 8px" }}>Rates refresh automatically every 12 hours while a super admin is signed in, cross-checked across two feeds.{held ? <> <b>{held} rate{held !== 1 ? "s are" : " is"} held for review.</b></> : null}</p>
          <ul style={{ margin: 0, paddingLeft: 18, maxWidth: "72ch" }}>
            <li>Two feeds: the first is used; the second cross-checks and takes over if the first fails.</li>
            <li>A rate is <b>held for review</b> if it moves more than {T.movePct}% from the applied rate, if the feeds disagree by more than {T.feedDisagreePct}%, or if the feed is older than {T.staleHours}h.</li>
            <li>The rate in force on the issue date is locked into each invoice.</li>
          </ul>
        </div>
      </details>
      </div>
    </Page>
  );
}
