import { useState } from "react";
import { LayerFoot } from "@/components/shell/LayerProvider";
import { useLayer } from "@/hooks/useLayer";
import { adminLog } from "@/lib/adminAudit";
import { nowStampUTC } from "@/lib/format";
import { PLANS } from "@/services/billing";
import { PLAN_MODULES } from "@/services/customers";
import * as svc from "@/services/billing-admin";

/** Prototype: billingPricing / billingSavePricing. Inputs are numeric strings; parsePricing keeps the source's coercion and adds upper bounds. */
export function PricingForm({ close }: { close: () => void }) {
  const L = useLayer();
  const [plans, setPlans] = useState<Record<string, string>>(() => Object.fromEntries(Object.keys(PLANS).map((k) => [k, String(PLANS[k].price)])));
  const [mods, setMods] = useState<Record<string, string>>(() => Object.fromEntries(PLAN_MODULES.map((k) => [k, String(svc.MODULE_PRICING[k] || 0)])));
  const [usage, setUsage] = useState<Record<string, string>>(() => Object.fromEntries(svc.USAGE_KEYS.map(([k]) => [k, String(svc.USAGE_PRICING[k])])));
  const [err, setErr] = useState<string | null>(null);
  const row = (label: string, unit: string, id: string, val: string, set: (v: string) => void, step?: string, max?: number) => (
    <div key={id} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 9 }}>
      <label htmlFor={id} style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--ink-2)" }}>{label}</label>
      <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>{unit}</span>
      <input className="input" id={id} type="number" min={0} max={max} step={step} inputMode="decimal" value={val} onChange={(e) => set(e.target.value)} style={{ width: 132, flex: "0 0 auto" }} />
    </div>
  );
  const save = async () => {
    const v = svc.parsePricing({ plans, modules: mods, usage });
    if (typeof v === "string") { setErr(v); return; }
    try { await svc.savePricing(v); adminLog("pricing.updated", "Plan, module and usage pricing", { categories: ["Billing"] }); close(); L.toast("Pricing updated"); }
    catch { L.toast("Could not update the pricing", false); }
  };
  return (
    <>
      <div className="sectitle" style={{ marginTop: 0 }}>Plan base price (per month)</div>
      {Object.keys(PLANS).map((pn) => row(pn, "USD/mo", "pp-" + pn, plans[pn], (v) => setPlans({ ...plans, [pn]: v }), undefined, svc.MAX_PRICE))}
      <div className="hr" /><div className="sectitle">Module add-on price (per module, per month)</div>
      <p className="field help" style={{ margin: "0 0 10px" }}>Modules included in a plan are free; these prices apply when a module is enabled as an add-on.</p>
      {PLAN_MODULES.map((mod, i) => row(mod, "USD/mo", "mp-" + i, mods[mod], (v) => setMods({ ...mods, [mod]: v }), undefined, svc.MAX_PRICE))}
      <div className="hr" /><div className="sectitle">Usage overage (beyond plan limits)</div>
      {svc.USAGE_KEYS.map(([k, label]) => row(label, "USD", "up-" + k, usage[k], (v) => setUsage({ ...usage, [k]: v }), "0.01", svc.MAX_UNIT_PRICE))}
      <p className="field help" style={{ marginTop: 10 }}>Changes apply to new invoices. Existing invoices are unaffected.</p>
      {err ? <p className="field help" role="alert" style={{ color: "var(--bad-ink)" }}>{err}</p> : null}
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={save}>Save pricing</button></LayerFoot>
    </>
  );
}

/** Prototype: issueInvoices / doIssueInvoices (demo run, nothing is generated). */
export function IssueInvoicesBody({ close }: { close: () => void }) {
  const L = useLayer(); const due = svc.dueCustomers();
  const go = async () => {
    try {
      const n = await svc.issueInvoices();
      adminLog("invoices.issued", n + " customers, " + nowStampUTC().slice(0, 7), { categories: ["Billing"], basis: "Contract" }); close(); L.toast("Issued " + n + " invoices (demo)");
    } catch { L.toast("Could not issue the invoices", false); }
  };
  return (
    <>
      <p style={{ margin: "0 0 10px" }}>Generate this period&apos;s invoices for {due.length} active customer(s). Amounts use each customer&apos;s plan, currency and the applied tax rate.</p>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th scope="col">Customer</th><th scope="col">Plan</th><th scope="col">Currency</th></tr></thead>
        <tbody>{due.slice(0, 8).map((c) => <tr key={c.id}><td className="strong">{c.name}</td><td>{c.plan}</td><td>{c.currency}</td></tr>)}</tbody></table></div>
      <p className="field help" style={{ marginTop: 8 }}>Synthetic demo run. No real invoices are sent.</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={go}>Issue &amp; email</button></LayerFoot>
    </>
  );
}
