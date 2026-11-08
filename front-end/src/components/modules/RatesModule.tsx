import { useEffect, useRef, useState } from "react";
import { Empty, Icon, Page, StatusChip, Table } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { useApp, useData, useModState } from "@/lib/store";
import { pendingAdminApprovals } from "@/lib/adminApprovals";
import { sodMessage } from "@/lib/elevation";
import * as svc from "@/services/rates";
import { HeldRequestForm, RateEditForm } from "./rates/RateEdit";
import { ElevateGateBanner, useGate } from "./admin/ElevateGate";
import { PendingApprovals } from "./admin/PendingApprovals";

/** Prototype: REND.rates (Exchange Rates & Tax, Held/Applied workflow). Module state (query, region, details) survives navigation like the prototype's RATE. */
export default function RatesModule() {
  useData(); const L = useLayer(); const gate = useGate();
  const allowed = svc.ratesCanManage(useApp((s) => s.role));
  const [q, setQ] = useModState("rates.q", ""); const [region, setRegion] = useModState("rates.region", "All"); const [rules, setRules] = useModState("rates.rules", false);
  const [refreshing, setRefreshing] = useState(false); const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  if (!allowed) return <Page mod="rates"><Empty icon="alert" title="Access restricted">Your role cannot manage exchange rates and tax.</Empty></Page>;
  const T = svc.RATE_THRESHOLDS;
  const held = svc.RATE_ROWS.filter((r) => r.status === "Held").length;
  const ql = q.toLowerCase();
  const rows = svc.RATE_ROWS.filter((r) => (region === "All" || r.region === region || (region === "Americas" && r.code === "US")) && (!q || `${r.country} ${r.currency}`.toLowerCase().includes(ql)));
  const pending = new Set(pendingAdminApprovals("rates.").map((a) => a.subject));
  const decide = (r: svc.RateRow, ok: boolean) => L.openModal((ok ? "Release held rate: " : "Reject held rate: ") + r.country, (close) => <HeldRequestForm code={r.code} ok={ok} close={close} />);
  const refresh = async () => {
    setRefreshing(true);
    try { await svc.refreshRates(); } catch (e) { setRefreshing(false); L.toast(sodMessage(e, "Could not refresh the rates"), false); return; }
    timer.current = setTimeout(() => { setRefreshing(false); L.toast("Rates refreshed from primary feed"); }, 950);
  };
  return (
    <Page mod="rates">
      <ElevateGateBanner />
      <PendingApprovals prefix="rates." title="Pending approvals" run={svc.decideRates} withdraw={svc.withdrawRates} />
      <div className="card" style={{ flex: "0 0 auto" }}><div className="c-body" style={{ gap: 10 }}>
        <div style={{ display: "flex", alignItems: "start", gap: 14, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 320px", minWidth: 0 }}>
            <p style={{ margin: 0, color: "var(--ink-2)" }}>Rates refresh automatically every 12 hours while a super admin is signed in, cross-checked across two feeds. {held ? <b>{held} rate{held !== 1 ? "s are" : " is"} held for review.</b> : null} <button className="btn btn-ghost sm" style={{ height: "auto", padding: "2px 6px" }} aria-expanded={rules} aria-controls="rateRules" onClick={() => setRules(!rules)}>{rules ? "Hide details" : "Details"}</button></p>
            {rules ? (
              <div id="rateRules" className="card" style={{ boxShadow: "none", background: "var(--surface-2)", borderColor: "transparent", marginTop: 10 }}>
                <div className="c-body" style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55 }}>
                  <div className="sectitle" style={{ marginTop: 0 }}>Rate rules</div>
                  <ul style={{ margin: 0, paddingLeft: 18, maxWidth: "72ch" }}>
                    <li>Two feeds: the first is used; the second cross-checks and takes over if the first fails.</li>
                    <li>A rate is <b>held for review</b> if it moves more than {T.movePct}% from the applied rate, if the feeds disagree by more than {T.feedDisagreePct}%, or if the feed is older than {T.staleHours}h.</li>
                    <li>The rate in force on the issue date is locked into each invoice.</li>
                  </ul>
                </div>
              </div>
            ) : null}
          </div>
          <div style={{ textAlign: "right", fontSize: 12, color: "var(--muted)", minWidth: 140 }}>Last updated<br /><b style={{ color: "var(--ink)" }}>Today, 06:00 GST</b></div>
        </div>
        <div className="btngrp">
          <button className="btn btn-primary" id="refreshBtn" onClick={refresh} disabled={refreshing || gate.locked} title={gate.title} aria-busy={refreshing}>{refreshing ? <span className="spin" /> : <Icon name="refresh" />}Refresh rates</button>
          <button className="btn btn-secondary" disabled={gate.locked} title={gate.title} onClick={() => L.toast("Sample feed run (demo)")}><Icon name="rates" />Run sample feed <span className="tag" style={{ marginLeft: 4 }}>Offline demo</span></button>
        </div>
      </div></div>
      <div className="card" style={{ flex: "1 1 auto" }}>
        <div className="c-head" style={{ flexWrap: "wrap", gap: 8 }}>
          <div className="field"><input className="input" id="rateQ" aria-label="Search country or currency" placeholder="Search country or currency…" maxLength={100} style={{ width: 220, height: 32 }} value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="btngrp" id="rateRegions">{svc.REGIONS.map((r) => <button key={r} className="fchip" aria-pressed={region === r} onClick={() => setRegion(r)}>{r === "All" ? <Icon name="filter" /> : null}{r}</button>)}</div>
        </div>
        <div className="c-body flush scroll" style={{ padding: 0 }} id="ratesTable">
          {rows.length ? (
            <Table cols={[{ t: "Country" }, { t: "Currency" }, { t: "Rate / USD", r: true }, { t: "Tax" }, { t: "Effective" }, { t: "Status" }, { t: "" }]}>
              {rows.map((r) => (
                <tr key={r.code}>
                  <td className="strong">{r.country}</td><td className="num">{r.currency}</td>
                  <td className="r num">{r.rate.toLocaleString("en-US", { minimumFractionDigits: r.rate < 10 ? 4 : 2 })}</td>
                  <td>{r.tax.type} {r.tax.rate}%</td><td>{r.tax.eff}</td>
                  <td>{r.status === "Held" ? <span className="chip warn" title={r.reason}><Icon name="alert" />Held for review</span> : <StatusChip s="Applied" />}{pending.has(r.code) ? <> <span className="chip info"><Icon name="clock" />Pending approval</span></> : null}</td>
                  <td className="r" style={{ whiteSpace: "nowrap" }}>
                    {r.status === "Held" ? <>
                      <button className="btn btn-ghost sm" aria-label={`Request release of ${r.country} rate`} disabled={gate.locked || pending.has(r.code)} title={gate.title || (pending.has(r.code) ? "A request is already pending" : undefined)} onClick={() => decide(r, true)}><Icon name="check" />Release</button>
                      <button className="btn btn-ghost sm" aria-label={`Request rejection of ${r.country} rate`} disabled={gate.locked || pending.has(r.code)} title={gate.title || (pending.has(r.code) ? "A request is already pending" : undefined)} onClick={() => decide(r, false)}><Icon name="x" />Reject</button></>
                      : <button className="btn btn-ghost sm" aria-label={`Edit ${r.country}`} disabled={gate.locked || pending.has(r.code)} title={gate.title || (pending.has(r.code) ? "A request is already pending" : undefined)} onClick={() => L.openDrawer("Edit " + r.country, "Currency, exchange rate and tax", (close) => <RateEditForm code={r.code} close={close} />)}><Icon name="edit" />Edit</button>}
                  </td>
                </tr>
              ))}
            </Table>
          ) : <Empty icon="search" title="No countries match">Adjust the search or region filter.</Empty>}
        </div>
      </div>
    </Page>
  );
}
