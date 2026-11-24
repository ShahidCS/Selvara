import { useCallback, useEffect, useState } from "react";
import { Chip, DataTable, Icon, KpiStrip, KpiTile, Page, StatusChip, type DTColumn } from "@/components/ui";
import { LayerFoot } from "@/components/shell/LayerProvider";
import { ReasonTicket, reasonTicketOk } from "@/components/kit/admin/ReasonTicket";
import { ELEVATE_TEXT, ServerElevationBanner, useServerElevation } from "@/components/kit/admin/ServerElevation";
import { apiMessage, RequestsTable, utcMin } from "@/components/kit/serverRequests";
import { useLayer } from "@/hooks/useLayer";
import { bumpData, useData, useModState } from "@/lib/store";
import { apiFetch } from "@/services/http";
import * as platform from "@/services/platform";

/* Exchange Rates & Tax in production (programme group 8a). Rates come from two public feeds (the European Central Bank and open.er-api.com),
   cross-checked by the server: a rate that moved more than 3 %, where the feeds disagree by more than 1 %, or whose feed is older than
   48 hours is held for a person. Releasing a held rate and every override of a rate or tax is a request a second super admin approves;
   rejecting a held rate keeps the rate in force (safe direction). The reference catalogue is shown until the first refresh and is never
   used for an invoice. Tax rates are reference values for finance review. */
interface Rate { code: string; country: string; currency: string; region: string; rate: number; taxType: string; taxRate: number; taxEffective: string; status: "Reference" | "Applied" | "Held"; source: string; at: number;
  candidate?: { rate: number; ecb: number | null; er: number | null; at: number; reason: string }; previous?: { rate: number; until: number } }
interface Data { rates: Rate[]; lastRefresh: { at: number; by: string; errors: string[] } | null; rules: { moveMax: number; disagreeMax: number; staleHours: number } }
const post = <T,>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
const fmt = (r: number) => (r ? r.toLocaleString("en-US", { minimumFractionDigits: r < 10 ? 4 : 2, maximumFractionDigits: 6 }) : "—");
const TAX_TYPES = ["VAT", "GST", "GST/HST", "Sales tax", "WHT", "None"];

export function ApiRates() {
  const v = useData(); const s = useServerElevation(); const L = useLayer();
  const [d, setD] = useState<Data | null>(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [view, setView] = useModState<string>("rates.api.view", "rates");
  useEffect(() => { let on = true; apiFetch<Data>("/admin/rates").then((x) => { if (on) { setD(x); setErr(""); } }, (e) => { if (on) setErr(apiMessage(e, "Could not load the rates")); }); return () => { on = false; }; }, [v]);
  const lock = s.locked ? (s.canElevate ? ELEVATE_TEXT : "Support accounts read only") : undefined;
  const refresh = async () => {
    if (busy) return; setBusy(true);
    try { const r = await post<{ applied: number; held: number; errors: string[] }>("/admin/rates/refresh", {}); bumpData(); L.toast(`${r.applied} applied, ${r.held} held for review${r.errors.length ? `. ${r.errors.join(" ")}` : ""}`, !r.errors.length); }
    catch (x) { L.toast(apiMessage(x, "Could not read the feeds"), false); }
    setBusy(false);
  };
  const held = d?.rates.filter((r) => r.status === "Held") ?? []; const reference = d?.rates.filter((r) => r.status === "Reference").length ?? 0;
  const cols: DTColumn<Rate>[] = [
    { key: "country", header: "Country", value: (r) => r.country, locked: true, render: (r) => <span className="strong">{r.country}</span> },
    { key: "currency", header: "Currency", value: (r) => r.currency, render: (r) => <span className="num">{r.currency}</span> },
    { key: "rate", header: "Rate / USD", align: "end", value: (r) => r.rate, render: (r) => <span className="num">{fmt(r.rate)}</span> },
    { key: "updated", header: "Last updated", value: (r) => r.at || 0, render: (r) => <span className="num" style={{ whiteSpace: "nowrap" }}>{r.at ? utcMin(r.at) : "Never"}</span> },
    { key: "cand", header: "Proposed", align: "end", emptyWhen: (r) => !r.candidate, value: (r) => r.candidate?.rate ?? 0, render: (r) => (r.candidate ? <span className="num" title={`ECB ${r.candidate.ecb ?? "—"}, open.er-api.com ${r.candidate.er ?? "—"}`}>{fmt(r.candidate.rate)}</span> : "") },
    { key: "tax", header: "Tax", value: (r) => `${r.taxType} ${r.taxRate}%`, render: (r) => `${r.taxType} ${r.taxRate} %` },
    { key: "eff", header: "Tax from", value: (r) => r.taxEffective, defaultHidden: true, render: (r) => <span className="num">{r.taxEffective}</span> },
    { key: "status", header: "Status", value: (r) => r.status, render: (r) => (r.status === "Held" ? <Chip cls="warn" icon="alert">Held for review</Chip> : r.status === "Reference" ? <Chip cls="neutral" icon="dot">Reference only</Chip> : <StatusChip s="Applied" />) },
    { key: "source", header: "Source", value: (r) => r.source, defaultHidden: true, render: (r) => <span style={{ fontSize: 12.5 }}>{r.source}{r.at ? `, ${utcMin(r.at)}` : ""}</span> },
    { key: "why", header: "Why held", emptyWhen: (r) => !r.candidate?.reason, value: (r) => r.candidate?.reason ?? "", render: (r) => <span style={{ fontSize: 12.5 }}>{r.candidate?.reason ?? ""}</span> },
  ];
  return (
    <Page mod="rates" sub="Exchange rates and tax used when invoices are issued." acts={!s.loaded || s.canElevate ? <button className="btn btn-primary" data-tour="rates-refresh" onClick={refresh} disabled={busy || !!lock} title={lock} aria-busy={busy}>{busy ? <span className="spin" /> : <Icon name="refresh" />}Refresh rates</button> : undefined}>
      <ServerElevationBanner s={s} />
      {d ? (
        <KpiStrip label="Rates summary">
          <KpiTile label="Countries" value={d.rates.length} caption="With a currency and tax rule" />
          <KpiTile label="Held for review" value={held.length} delta={{ tone: held.length ? "watch" : "good", text: held.length ? "Needs a decision" : "None held" }} caption={`Moved over ${d.rules.moveMax} %, feeds disagree over ${d.rules.disagreeMax} % or older than ${d.rules.staleHours} h`} />
          <KpiTile label="Reference only" value={reference} delta={{ tone: reference ? "watch" : "good", text: reference ? "Refresh before invoicing" : "All from feeds" }} caption="Never used for an invoice" />
          <KpiTile label="Last refresh" value={d.lastRefresh ? utcMin(d.lastRefresh.at).slice(11) : "Never"} caption={d.lastRefresh ? `${utcMin(d.lastRefresh.at).slice(0, 10)}, by ${d.lastRefresh.by}${d.lastRefresh.errors.length ? `; ${d.lastRefresh.errors.join(" ")}` : ""}` : "Refresh to read the feeds"} />
        </KpiStrip>
      ) : null}
      <div className="card" data-tour="rates-table" style={{ marginTop: 12 }}>
        <div className="c-head"><div className="seg" role="tablist" aria-label="Rates views">{[["rates", "Rates and tax"], ["requests", "Requests"]].map((x) => <button key={x[0]} role="tab" aria-selected={view === x[0]} onClick={() => setView(x[0])}>{x[1]}</button>)}</div></div>
        <div className="c-body flush scroll" style={{ padding: view === "rates" ? 0 : undefined }}>
          {err ? <p role="alert" style={{ padding: 12, color: "var(--bad-ink)" }}>{err}</p> : !d ? <p style={{ padding: 12, color: "var(--muted)" }}>Loading…</p>
            : view === "requests" ? <div style={{ padding: 16 }}><RatesRequests /></div>
            : <DataTable<Rate> id="rates-api" label="Exchange rates and tax" rows={d.rates} rowKey={(r) => r.code} columns={cols} searchText={(r) => `${r.country} ${r.currency} ${r.code}`}
              rowActions={s.loaded && !s.canElevate ? undefined : (r) => r.status === "Held" ? [
                { label: "Release (needs approval)", whyNot: lock ?? null, run: () => L.openModal(`Release the held rate: ${r.country}`, (close) => <HeldForm r={r} release close={close} />) },
                { label: "Reject, keep the rate in force", whyNot: lock ?? null, run: () => L.openModal(`Reject the held rate: ${r.country}`, (close) => <HeldForm r={r} release={false} close={close} />) },
              ] : r.currency === "USD" && r.code === "US" ? [] : [{ label: "Override (needs approval)", whyNot: lock ?? null, run: () => L.openDrawer(`Override ${r.country}`, "Currency, exchange rate and tax", (close) => <OverrideForm r={r} close={close} />) }]}
              tabs={[{ key: "Held", label: "Held", match: (r: Rate) => r.status === "Held" }, { key: "Applied", label: "Applied", match: (r: Rate) => r.status === "Applied" }, { key: "Reference", label: "Reference only", match: (r: Rate) => r.status === "Reference" }]}
              filters={[{ key: "region", label: "Region", options: Array.from(new Set(d.rates.map((r) => r.region).filter(Boolean))).sort(), get: (r) => r.region }]} exportName="rates" />}
        </div>
      </div>
      <p className="field help" style={{ marginTop: 8 }}>The rate in force on an invoice&apos;s issue day is locked into that invoice. Tax rates are reference values: finance confirms them before use.</p>
    </Page>
  );
}

function HeldForm({ r, release, close }: { r: Rate; release: boolean; close: () => void }) {
  const L = useLayer(); const [reason, setReason] = useState(""); const [ticket, setTicket] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return; if (!reasonTicketOk(reason, ticket)) { setErr("Give a reason of at least 15 characters and a ticket such as FIN-1234."); return; }
    setBusy(true);
    try { await post(`/admin/rates/${encodeURIComponent(r.code)}/${release ? "release" : "reject"}`, { reason, ticket }); bumpData(); close(); L.toast(release ? "Sent for approval by a second super admin" : "Rejected: the rate in force stays"); }
    catch (x) { setErr(apiMessage(x, "Could not record it")); setBusy(false); }
  };
  return (
    <>
      <dl className="meta-grid lstart" style={{ marginTop: 0 }}><dt>In force</dt><dd className="num">{fmt(r.rate)} {r.currency} per USD</dd><dt>Proposed</dt><dd className="num">{fmt(r.candidate?.rate ?? 0)}</dd><dt>European Central Bank</dt><dd className="num">{r.candidate?.ecb ? fmt(r.candidate.ecb) : "—"}</dd><dt>open.er-api.com</dt><dd className="num">{r.candidate?.er ? fmt(r.candidate.er) : "—"}</dd><dt>Why held</dt><dd>{r.candidate?.reason}</dd></dl>
      <p className="field help">{release ? "A second platform super admin approves the release; until then the rate in force stays." : "The proposed value is discarded and the rate in force stays. The next refresh checks again."}</p>
      <ReasonTicket p="hr" reason={reason} setReason={(x) => { setReason(x); setErr(""); }} ticket={ticket} setTicket={(x) => { setTicket(x); setErr(""); }} />
      <p className="field help" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={go}>{release ? "Send for approval" : "Reject"}</button></LayerFoot>
    </>
  );
}

function OverrideForm({ r, close }: { r: Rate; close: () => void }) {
  const L = useLayer();
  const [f, setF] = useState({ currency: r.currency, rate: String(r.rate || ""), taxType: TAX_TYPES.includes(r.taxType) ? r.taxType : "VAT", taxRate: String(r.taxRate), taxEffective: r.taxEffective || new Date().toISOString().slice(0, 10) });
  const [reason, setReason] = useState(""); const [ticket, setTicket] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, x: string) => { setF({ ...f, [k]: x }); setErr(""); };
  const go = async () => {
    if (busy) return; if (!reasonTicketOk(reason, ticket)) { setErr("Give a reason of at least 15 characters and a ticket such as FIN-1234."); return; }
    setBusy(true);
    try { await post(`/admin/rates/${encodeURIComponent(r.code)}/override`, { ...f, rate: Number(f.rate), taxRate: Number(f.taxRate), reason, ticket }); bumpData(); close(); L.toast("Sent for approval by a second super admin"); }
    catch (x) { setErr(apiMessage(x, "Could not send the override")); setBusy(false); }
  };
  return (
    <>
      <p className="field help" style={{ marginTop: 0 }}>An override replaces the feed value until the next refresh changes it. A second platform super admin approves it.</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="field"><label htmlFor="ov-cur">Currency</label><input className="input num" id="ov-cur" data-focus maxLength={3} value={f.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} /></div>
        <div className="field"><label htmlFor="ov-rate">Rate per 1 USD</label><input className="input num" id="ov-rate" type="number" min={0} step="0.000001" inputMode="decimal" value={f.rate} onChange={(e) => set("rate", e.target.value)} /></div>
        <div className="field"><label htmlFor="ov-tt">Tax type</label><select className="select" id="ov-tt" value={f.taxType} onChange={(e) => set("taxType", e.target.value)}>{TAX_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div className="field"><label htmlFor="ov-tr">Tax rate (%)</label><input className="input num" id="ov-tr" type="number" min={0} max={100} step="0.01" inputMode="decimal" value={f.taxRate} onChange={(e) => set("taxRate", e.target.value)} /></div>
      </div>
      <div className="field"><label htmlFor="ov-eff">Tax rate applies from</label><input className="input num" id="ov-eff" type="date" value={f.taxEffective} onChange={(e) => set("taxEffective", e.target.value)} style={{ width: 180 }} /></div>
      <ReasonTicket p="ov" reason={reason} setReason={(x) => { setReason(x); setErr(""); }} ticket={ticket} setTicket={(x) => { setTicket(x); setErr(""); }} />
      <p className="field help" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={go}>Send for approval</button></LayerFoot>
    </>
  );
}

function RatesRequests() {
  const load = useCallback(async () => (await platform.listPlatformRequests()).filter((a) => a.kind.startsWith("rates.")), []);
  return <RequestsTable id="rates-requests-api" load={load} decide={platform.decidePlatformRequest}
    note="Releasing a held rate and every override need a second platform super admin, each in an elevated session. Nobody approves their own request. A request expires after 24 hours." />;
}
