import { useState } from "react";
import { LayerFoot } from "@/components/shell/LayerProvider";
import { useLayer } from "@/hooks/useLayer";
import { SOD } from "@/lib/sod";
import { sodMessage } from "@/lib/elevation";
import { money } from "@/lib/format";
import { ReasonTicket, reasonTicketOk } from "../admin/ReasonTicket";
import { useGate } from "../admin/ElevateGate";
import { PLANS } from "@/services/billing";
import { PLAN_MODULES, findCustomer } from "@/services/customers";
import * as svc from "@/services/billing-admin";

/** Prototype: billingPricing / billingSavePricing. Inputs are numeric strings; parsePricing keeps the source's coercion and adds upper bounds. */
export function PricingForm({ close }: { close: () => void }) {
  const L = useLayer(); const gate = useGate();
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
    try { await svc.savePricing(v); close(); L.toast("Pricing updated"); }
    catch (e) { L.toast(sodMessage(e, "Could not update the pricing"), false); }
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
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={gate.locked} title={gate.title}>Save pricing</button></LayerFoot>
    </>
  );
}

/** Prototype: issueInvoices / doIssueInvoices (demo run, nothing is generated). */
export function IssueInvoicesBody({ close }: { close: () => void }) {
  const L = useLayer(); const gate = useGate(); const due = svc.dueCustomers();
  const go = async () => {
    try {
      const n = await svc.issueInvoices();
      close(); L.toast("Issued " + n + " invoices (demo)");
    } catch (e) { L.toast(sodMessage(e, "Could not issue the invoices"), false); }
  };
  return (
    <>
      <p style={{ margin: "0 0 10px" }}>Generate this period&apos;s invoices for {due.length} active customer(s). Amounts use each customer&apos;s plan, currency and the applied tax rate.</p>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th scope="col">Customer</th><th scope="col">Plan</th><th scope="col">Currency</th></tr></thead>
        <tbody>{due.slice(0, 8).map((c) => <tr key={c.id}><td className="strong">{c.name}</td><td>{c.plan}</td><td>{c.currency}</td></tr>)}</tbody></table></div>
      <p className="field help" style={{ marginTop: 8 }}>Synthetic demo run. No real invoices are sent.</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={go} disabled={gate.locked} title={gate.title}>Issue &amp; email</button></LayerFoot>
    </>
  );
}

/** Credit / refund / write-off / manual mark paid on one invoice. At or below USD {FINANCE_DUAL_USD} (not write-offs) one elevated super admin completes it;
 *  otherwise it becomes a pending request that a different elevated super admin approves (panel on the Billing page). */
export function FinanceForm({ cid, invId, kind: k0, close }: { cid: string; invId: string; kind: svc.FinanceKind; close: () => void }) {
  const L = useLayer(); const gate = useGate();
  const c = findCustomer(cid); const iv = c ? c.invoices.find((x: { id: string }) => x.id === invId) : null;
  const total = iv ? Math.round(((Number(iv.amount) || 0) + (Number(iv.tax) || 0)) * 100) / 100 : 0;
  const [kind, setKind] = useState<svc.FinanceKind>(k0); const [amt, setAmt] = useState(k0 === "markpaid" || k0 === "writeoff" ? String(total) : "");
  const [reason, setReason] = useState(""); const [ticket, setTicket] = useState("");
  if (!c || !iv) return <p className="sub">Invoice not found.</p>;
  const cur = String(iv.cur || c.currency); const amount = Number(amt); const full = kind === "markpaid" || kind === "writeoff";
  const usd = Number.isFinite(amount) && amount > 0 ? svc.toUsd(amount, cur) : null;
  const second = svc.needsSecondApprover(kind, usd);
  const kinds = svc.FINANCE_KINDS.filter((x) => (iv.status === "Past due" ? x !== "refund" : iv.status === "Paid" ? x === "credit" || x === "refund" : x === "credit") || x === k0);
  const pick = (x: svc.FinanceKind) => { setKind(x); setAmt(x === "markpaid" || x === "writeoff" ? String(total) : ""); };
  const go = async () => {
    try { const r = await svc.financeRequest({ kind, cid, invId, amount, reason, ticket }); close(); L.toast(r.message); }
    catch (e) { L.toast(sodMessage(e, "Could not complete the request"), false); }
  };
  return (
    <>
      <p style={{ margin: "0 0 10px" }}>{iv.id}, {c.name}. Invoice total {money(total, cur)}, status {iv.status}.</p>
      <div className="field"><label htmlFor="fKind">Action</label><select className="select" id="fKind" value={kind} onChange={(e) => pick(e.target.value as svc.FinanceKind)}>{kinds.map((x) => <option key={x} value={x}>{svc.FINANCE_LABEL[x]}</option>)}</select></div>
      <div className="field" style={{ marginTop: 12 }}><label htmlFor="fAmt">Amount ({cur})</label><input className="input" id="fAmt" type="number" min={0} step="0.01" inputMode="decimal" readOnly={full} value={amt} onChange={(e) => setAmt(e.target.value)} /></div>
      <p className="field help" role="status">{second ? (kind === "writeoff" ? "Write-offs always need a second elevated super admin to approve." : usd === null ? "No applied exchange rate for " + cur + ": a second elevated super admin must approve." : `About ${money(usd, "USD")}, above USD ${SOD.FINANCE_DUAL_USD}: a second elevated super admin must approve.`) : `Within USD ${SOD.FINANCE_DUAL_USD}: completed now by you and audited with the ticket.`}</p>
      <ReasonTicket p="f" reason={reason} setReason={setReason} ticket={ticket} setTicket={setTicket} />
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={go} disabled={gate.locked || !reasonTicketOk(reason, ticket) || !(amount > 0)} title={gate.title}>{second ? "Send for approval" : "Apply"}</button></LayerFoot>
    </>
  );
}
