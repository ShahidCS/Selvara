import { SelectList } from "@/components/ui";
import { useState } from "react";
import { LayerFoot } from "@/components/shell/LayerProvider";
import { useLayer } from "@/hooks/useLayer";
import { ELEV_REASON_MIN, sodMessage } from "@/lib/elevation";
import { ReasonTicket, reasonTicketOk } from "@/components/kit/admin/ReasonTicket";
import { useGate } from "@/components/kit/admin/ElevateGate";
import * as svc from "@/features/rates/services/rates";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "01 Jul 2026" (stored and shown) to "2026-07-01" (date input), and back. Anything unparseable stays empty, so the stored value is kept. */
const toIso = (d: string) => { const m = /^(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})$/.exec(d.trim()); const i = m ? MON.indexOf(m[2]) : -1; return m && i >= 0 ? `${m[3]}-${String(i + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}` : ""; };
const fromIso = (d: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d); return m ? `${m[3]} ${MON[Number(m[2]) - 1]} ${m[1]}` : ""; };
type Fld = "eCur" | "eRate" | "eTaxType" | "eTaxRate";
/** Which field a validation message from `parseRateEdit` is about, so the error shows under that field. */
const fieldOf = (msg: string): Fld => (/currency code/i.test(msg) ? "eCur" : /exchange rate/i.test(msg) ? "eRate" : /tax type/i.test(msg) ? "eTaxType" : "eTaxRate");
const reasonHint = `Enter a reason of at least ${ELEV_REASON_MIN} characters and a ticket reference such as FIN-1234.`;

/** Prototype: rateEdit / rateSave (drawer). Blank, non-numeric or 0 numeric fields keep the old value (source); out-of-range values are rejected (added).
 *  Owner decision: saving only REQUESTS the override; a second elevated super admin must approve it before the rate changes. */
export function RateEditForm({ code, close }: { code: string; close: () => void }) {
  const L = useLayer(); const gate = useGate(); const [reason, setReason] = useState(""); const [ticket, setTicket] = useState(""); const r = svc.RATE_ROWS.find((x) => x.code === code);
  const [cur, setCur] = useState(r ? r.currency : ""); const [rate, setRate] = useState(r ? String(r.rate) : ""); const [type, setType] = useState(r ? r.tax.type : svc.TAX_TYPES[0]);
  const [tax, setTax] = useState(r ? String(r.tax.rate) : ""); const [eff, setEff] = useState(r ? toIso(r.tax.eff) : ""); const [err, setErr] = useState<{ f: Fld; m: string } | null>(null);
  if (!r) return <p className="sub">Country not found.</p>;
  const save = async () => {
    const v = svc.parseRateEdit(r, { currency: cur, rate, taxType: type, taxRate: tax, eff: fromIso(eff) });
    if (typeof v === "string") { const f = fieldOf(v); setErr({ f, m: v }); document.getElementById(f)?.focus(); return; }
    try { await svc.requestRateOverride(code, v, reason, ticket); close(); L.toast(r.country + " override sent for approval by a second super admin"); }
    catch (e) { L.toast(sodMessage(e, "Could not request the override"), false); }
  };
  const why = gate.locked ? "Elevate to make changes: this needs an active elevated session." : !reasonTicketOk(reason, ticket) ? reasonHint : "";
  const cls = (f: Fld) => "field" + (err?.f === f ? " err" : "");
  const inv = (f: Fld) => ({ "aria-invalid": err?.f === f, "aria-describedby": err?.f === f ? "eErr" : undefined });
  const msg = (f: Fld) => (err?.f === f ? <span className="help" id="eErr" role="alert" style={{ color: "var(--bad-ink)" }}>{err.m}</span> : null);
  return (
    <>
      <div className={cls("eCur")} style={{ marginBottom: 12 }}><label htmlFor="eCur">Currency</label><input className="input" id="eCur" data-focus maxLength={8} autoComplete="off" {...inv("eCur")} value={cur} onChange={(e) => { setCur(e.target.value); setErr(null); }} />{msg("eCur")}</div>
      <div className={cls("eRate")} style={{ marginBottom: 12 }}><label htmlFor="eRate">Exchange rate (per 1 USD)</label><input className="input" id="eRate" type="number" step="0.0001" min={0} inputMode="decimal" {...inv("eRate")} value={rate} onChange={(e) => { setRate(e.target.value); setErr(null); }} />{msg("eRate")}</div>
      <div className={cls("eTaxType")} style={{ marginBottom: 12 }}><label htmlFor="eTaxType">Tax type</label><SelectList className="select" id="eTaxType" {...inv("eTaxType")} value={type} onChange={(e) => { setType(e.target.value); setErr(null); }}>{svc.TAX_TYPES.map((x) => <option key={x}>{x}</option>)}</SelectList>{msg("eTaxType")}</div>
      <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className={cls("eTaxRate")}><label htmlFor="eTaxRate">Tax rate (%)</label><input className="input" id="eTaxRate" type="number" step="0.5" min={0} max={svc.MAX_TAX} inputMode="decimal" {...inv("eTaxRate")} value={tax} onChange={(e) => { setTax(e.target.value); setErr(null); }} />{msg("eTaxRate")}</div>
        <div className="field"><label htmlFor="eEff">Effective date</label><input className="input" id="eEff" type="date" value={eff} onChange={(e) => setEff(e.target.value)} /></div>
      </div>
      <p className="field help" style={{ marginTop: 12 }}>Changes apply to new invoices only. The rate in force on an invoice&apos;s issue date stays locked to that invoice. The change takes effect only after a different elevated super admin approves it.</p>
      <ReasonTicket p="e" reason={reason} setReason={setReason} ticket={ticket} setTicket={setTicket} />
      {why ? <p className="field help" id="eWhy" style={{ margin: "10px 0 0" }}>{why}</p> : null}
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={!!why} aria-describedby={why ? "eWhy" : undefined} title={gate.title}>Request override</button></LayerFoot>
    </>
  );
}

/** Release or reject a feed-held rate: also a request that needs a second elevated super admin. */
export function HeldRequestForm({ code, ok, close }: { code: string; ok: boolean; close: () => void }) {
  const L = useLayer(); const gate = useGate(); const r = svc.RATE_ROWS.find((x) => x.code === code);
  const [reason, setReason] = useState(""); const [ticket, setTicket] = useState("");
  if (!r) return <p className="sub">Country not found.</p>;
  const why = gate.locked ? "Elevate to make changes: this needs an active elevated session." : !reasonTicketOk(reason, ticket) ? reasonHint : "";
  const go = async () => {
    try { await svc.requestHeldDecision(code, ok, reason, ticket); close(); L.toast("Request sent for approval by a second super admin"); }
    catch (e) { L.toast(sodMessage(e, "Could not send the request"), false); }
  };
  return (
    <>
      <p style={{ margin: "0 0 8px" }}>{ok ? "Release" : "Reject"} the held {r.country} rate ({r.rate} {r.currency}).</p>
      {r.reason ? <p style={{ margin: "0 0 8px" }}><b>Why it is held:</b> {r.reason.replace(/\.?\s*$/, ".")}</p> : null}
      <p className="field help" style={{ margin: 0 }}>Nothing changes until a different elevated super admin approves.</p>
      <ReasonTicket p="h" reason={reason} setReason={setReason} ticket={ticket} setTicket={setTicket} />
      {why ? <p className="field help" id="hWhy" style={{ margin: "10px 0 0" }}>{why}</p> : null}
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className={"btn " + (ok ? "btn-primary" : "btn-danger")} onClick={go} disabled={!!why} aria-describedby={why ? "hWhy" : undefined} title={gate.title}>Send request</button></LayerFoot>
    </>
  );
}
