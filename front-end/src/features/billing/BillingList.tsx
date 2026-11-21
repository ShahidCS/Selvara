/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import { Empty, Icon, KpiStrip, KpiTile, StatusChip, Table } from "@/components/ui";
import { BalanceFigure } from "./BillingDetail";
import { money } from "@/lib/format";
import { custList } from "@/lib/platform";
import { useGo } from "@/lib/route";
import { useModState } from "@/lib/store";
import { findCustomer } from "@/services/customers";
import * as svc from "@/features/billing/services/billing-admin";

const PER = 6;
/** Prototype: billRows / billTable / billSelect / billDetail (side panel, 420 ms simulated load). */
export function BillingList() {
  const go = useGo();
  const [q, setQ] = useModState("billing.q", ""); const [pageN, setPage] = useModState("billing.page", 1); const [sel, setSel] = useModState("billing.sel", "");
  const [loading, setLoading] = useState(false); const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const list = custList();
  const mrr = list.reduce((a, c) => a + (c.mrr || 0), 0);
  const active = list.filter((c) => c.status === "Active").length, pastdue = list.filter((c) => c.status === "Past due").length, trials = list.filter((c) => c.status === "Trial").length;
  const all = list.filter((c) => !q || `${c.name} ${c.id} ${c.plan}`.toLowerCase().includes(q.toLowerCase()));
  const tot = all.length, pages = Math.max(1, Math.ceil(tot / PER)), page = Math.min(pageN, pages);
  const rows = all.slice((page - 1) * PER, page * PER);
  const select = (id: string) => {
    setSel(id); if (timer.current) clearTimeout(timer.current);
    if (id) { setLoading(true); timer.current = setTimeout(() => setLoading(false), 420); } else setLoading(false);
  };
  const c = sel ? findCustomer(sel) : null;
  const pill = (x: any, paid: string) => (x.status === "Past due" ? "Past due" : x.status === "Trial" ? "Trial" : paid);
  const rate = c ? svc.rateForCurrency(c.currency) : null;
  return (
    <>
      <KpiStrip label="Billing summary">
        <KpiTile label="MRR" value={money(mrr, "USD")} caption="Monthly recurring revenue" />
        <KpiTile label="Active" value={active} caption="Paying customers" />
        <KpiTile label="Past due" value={pastdue} delta={{ tone: pastdue ? "bad" : "good", text: pastdue ? "Needs follow-up" : "None" }} caption="Latest invoice unpaid" />
        <KpiTile label="On trial" value={trials} caption="Not invoiced yet" />
      </KpiStrip>
      <div className="split" style={{ gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)" }}>
        <div className="card">
          <div className="c-head" style={{ flexWrap: "wrap", gap: 8 }}><h3>Customers</h3>
            <div className="field" style={{ marginLeft: "auto" }}><input className="input" id="billQ" aria-label="Search customers" placeholder="Search customers…" maxLength={100} style={{ width: 200, height: 32 }} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div></div>
          <div className="c-body flush scroll" style={{ padding: 0 }} id="billTable">
            {rows.length ? (
              <Table cols={[{ t: "Customer" }, { t: "Plan" }, { t: "Balance", r: true }, { t: "Last invoice" }, { t: "Payment" }]}>
                {rows.map((x) => {
                  const li = x.invoices[0];
                  return (
                    <tr key={x.id} className="clickable" role="button" tabIndex={0} aria-pressed={sel === x.id} onClick={() => select(x.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(x.id); } }}
                      style={sel === x.id ? { background: "var(--accent-weak)", boxShadow: "inset 3px 0 0 var(--accent)" } : undefined}>
                      <td className="strong">{x.name}</td><td>{x.plan}</td><td className="r num" style={{ whiteSpace: "nowrap" }}>{x.balance ? money(x.balance, x.currency) : money(0, x.currency)}</td><td style={{ whiteSpace: "nowrap" }}>{li ? li.date : "-"}</td>
                      <td style={{ whiteSpace: "nowrap" }}><StatusChip s={pill(x, "Paid")} /></td>
                    </tr>
                  );
                })}
              </Table>
            ) : <Empty icon="search" title="No customers match">No results for &quot;{q}&quot;.</Empty>}
          </div>
          {rows.length ? (
            <div className="pager" id="billPager"><span>{tot} customer{tot !== 1 ? "s" : ""}</span>
              <div className="r"><button className="btn btn-secondary sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><Icon name="chevl" />Prev</button><span>{page} / {pages}</span><button className="btn btn-secondary sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next<Icon name="chevron" /></button></div></div>
          ) : <div className="pager" id="billPager" />}
        </div>
        <div className="card">
          <div className="c-head" style={{ flexWrap: "wrap", gap: 8 }}><h3>Billing details</h3>
            <div style={{ marginLeft: "auto", minWidth: 200 }}><label className="vh" htmlFor="billSel">Invoice customer</label>
              <select className="select" id="billSel" value={sel} onChange={(e) => select(e.target.value)}><option value="">Select a customer…</option>{list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div></div>
          <div className="c-body scroll" id="billDetail" aria-live="polite">
            {!sel || !c ? <Empty icon="billing" title="No customer selected">Select a customer in the table, or choose one above, to see their plan, contact, invoices, amounts and tax.</Empty>
              : loading ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}><div className="skel" style={{ height: 22, width: "60%" }} /><div className="skel" style={{ height: 14, width: "40%" }} /><div className="skel" style={{ height: 90 }} /><div className="skel" style={{ height: 120 }} /></div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "start", gap: 10, marginBottom: 10 }}><div><div style={{ fontSize: 16, fontWeight: 600 }}>{c.name}</div><div style={{ fontSize: 12.5, color: "var(--muted)" }}>{c.address}</div></div><div style={{ marginLeft: "auto" }}><StatusChip s={pill(c, "Active")} /></div></div>
                  <dl className="meta-grid"><dt>Plan</dt><dd>{c.plan}, {c.cycle}</dd><dt>Billing contact</dt><dd>{c.contact.name}</dd><dt>Email</dt><dd>{c.contact.email}</dd><dt>Currency</dt><dd>{c.currency}{rate ? `, ${rate.tax.type} ${rate.tax.rate}%` : ""}</dd><dt>Outstanding</dt><dd><BalanceFigure balance={c.balance} currency={c.currency} /></dd></dl>
                  <div className="hr" /><div className="sectitle">Invoices</div>
                  {c.invoices.length ? (
                    <Table cols={[{ t: "Invoice" }, { t: "Amount", r: true }, { t: "Status" }]}>
                      {c.invoices.map((iv: any) => <tr key={iv.id}><td><div className="strong num" style={{ whiteSpace: "nowrap" }}>{iv.id}</div><div className="meta">{iv.date}</div></td><td className="r num" style={{ whiteSpace: "nowrap" }}>{money(iv.amount, iv.cur)}</td><td style={{ whiteSpace: "nowrap" }}><StatusChip s={iv.status} /></td></tr>)}
                    </Table>
                  ) : <p className="field help">No invoices yet for this customer{c.status === "Trial" ? " (currently on trial)." : "."}</p>}
                  <div style={{ marginTop: 14 }}><button className="btn btn-primary sm" onClick={() => go("/admin/billing/" + encodeURIComponent(c.id))}><Icon name="ext" />Open full billing</button></div>
                </>
              )}
          </div>
        </div>
      </div>
    </>
  );
}
