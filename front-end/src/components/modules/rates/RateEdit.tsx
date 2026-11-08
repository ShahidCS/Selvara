import { useState } from "react";
import { LayerFoot } from "@/components/shell/LayerProvider";
import { useLayer } from "@/hooks/useLayer";
import * as svc from "@/services/rates";

/** Prototype: rateEdit / rateSave (drawer). Blank, non-numeric or 0 numeric fields keep the old value (source); out-of-range values are rejected (added). */
export function RateEditForm({ code, close }: { code: string; close: () => void }) {
  const L = useLayer(); const r = svc.RATE_ROWS.find((x) => x.code === code);
  const [cur, setCur] = useState(r ? r.currency : ""); const [rate, setRate] = useState(r ? String(r.rate) : ""); const [type, setType] = useState(r ? r.tax.type : svc.TAX_TYPES[0]);
  const [tax, setTax] = useState(r ? String(r.tax.rate) : ""); const [eff, setEff] = useState(r ? r.tax.eff : ""); const [err, setErr] = useState<string | null>(null);
  if (!r) return <p className="sub">Country not found.</p>;
  const save = async () => {
    const v = svc.parseRateEdit(r, { currency: cur, rate, taxType: type, taxRate: tax, eff });
    if (typeof v === "string") { setErr(v); return; }
    try { await svc.saveRate(code, v); close(); L.toast(r.country + " updated"); }
    catch { L.toast("Could not update the rate", false); }
  };
  return (
    <>
      <div className="field" style={{ marginBottom: 12 }}><label htmlFor="eCur">Currency</label><input className="input" id="eCur" data-focus maxLength={8} autoComplete="off" value={cur} onChange={(e) => setCur(e.target.value)} /></div>
      <div className="field" style={{ marginBottom: 12 }}><label htmlFor="eRate">Exchange rate (per 1 USD)</label><input className="input" id="eRate" type="number" step="0.0001" min={0} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
      <div className="field" style={{ marginBottom: 12 }}><label htmlFor="eTaxType">Tax type</label><select className="select" id="eTaxType" value={type} onChange={(e) => setType(e.target.value)}>{svc.TAX_TYPES.map((x) => <option key={x}>{x}</option>)}</select></div>
      <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="field"><label htmlFor="eTaxRate">Tax rate (%)</label><input className="input" id="eTaxRate" type="number" step="0.5" min={0} max={svc.MAX_TAX} inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} /></div>
        <div className="field"><label htmlFor="eEff">Effective date</label><input className="input" id="eEff" maxLength={20} autoComplete="off" value={eff} onChange={(e) => setEff(e.target.value)} /></div>
      </div>
      <p className="field help" style={{ marginTop: 12 }}>Changes apply to new invoices only. The rate in force on an invoice&apos;s issue date stays locked to that invoice.</p>
      {err ? <p className="field help" role="alert" style={{ color: "var(--bad-ink)" }}>{err}</p> : null}
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={save}>Save changes</button></LayerFoot>
    </>
  );
}
