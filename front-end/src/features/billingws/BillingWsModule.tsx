import { Icon, Kpi, Page, StatusChip, Table } from "@/components/ui";
import { useApp, useData } from "@/lib/store";
import { useLayer } from "@/hooks/useLayer";
import { wsLog } from "@/lib/audit";
import { downloadText, money, num } from "@/lib/format";
import { safeFileName } from "@/lib/security";
import { SUBSCRIPTION, billingCanManage, findInvoice, invoiceText } from "@/services/billing";
import { PaymentForm, PlanForm } from "./BillingForms";

function Meter({ used, limit }: { used: number; limit: number }) {
  const pct = Math.min(100, Math.round(used / limit * 100)); const tone = pct >= 90 ? "var(--bad-ink)" : "var(--accent)";
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} style={{ height: 7, borderRadius: 5, background: "var(--line,#e5e7eb)", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: tone, borderRadius: 5 }} />
    </div>
  );
}

export default function BillingWsModule() {
  useData();
  const L = useLayer();
  const manage = billingCanManage(useApp((s) => s.role));
  const s = SUBSCRIPTION; const spct = Math.round(s.seatsUsed / s.seatLimit * 100);
  const openPlan = () => L.openModal("Change plan", (close) => <PlanForm close={close} />);
  const download = (id: string) => {
    const iv = findInvoice(id); if (!iv) return;
    if (!downloadText(safeFileName(iv.id, "invoice") + ".txt", invoiceText(iv, money))) { L.toast("Download not available in this view"); return; }
    wsLog("invoice.downloaded", iv.id, "System"); L.toast("Downloading " + iv.id);
  };
  return (
    <Page mod="billingws" acts={manage ? <button className="btn btn-secondary" onClick={openPlan}>Manage plan</button> : undefined}>
      <div className="scroll" style={{ flex: "1 1 auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingRight: 2 }}>
          <div className="kpis">
            <Kpi icon="billing" label="Plan" value={s.plan} tone="accent" sub={s.cycle + " billing"} />
            <Kpi icon="people" label="Seats" value={s.seatsUsed + " / " + s.seatLimit} tone={spct >= 90 ? "bad" : "good"} sub={spct + "% used"} />
            <Kpi icon="rates" label="Next bill" value={s.nextInvoice.replace(/^\d+\s/, "")} tone="info" sub={money(s.amount) + " due"} />
            <Kpi icon="reports" label="Invoices" value={s.invoices.length} tone="accent" sub="All paid" />
          </div>
          <div className="panels" style={{ gridTemplateColumns: "1.4fr 1fr", gridAutoRows: "min-content", alignItems: "stretch" }}>
            <div className="card"><div className="c-head"><h3>Usage this period</h3></div><div className="c-body">
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {s.usage.map((u) => {
                  const p = Math.min(100, Math.round(u.used / u.limit * 100));
                  return (
                    <div key={u.k}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 13, marginBottom: 6 }}>
                        <span style={{ color: "var(--ink-2)", fontWeight: 500 }}>{u.k}</span>
                        <span className="num" style={{ color: "var(--muted)", fontSize: 12.5 }}>{num(u.used)}{u.unit} / {num(u.limit)}{u.unit} · {p}%</span>
                      </div>
                      <Meter used={u.used} limit={u.limit} />
                    </div>
                  );
                })}
              </div>
              <p className="field help" style={{ marginTop: 14 }}>Overage beyond plan limits is billed at the rates in your contract. Synthetic sample for the prototype.</p>
            </div></div>
            <div className="card"><div className="c-head"><h3>Subscription</h3></div><div className="c-body">
              <dl className="meta-grid"><dt>Plan</dt><dd className="strong">{s.plan}</dd><dt>Billing cycle</dt><dd>{s.cycle}</dd><dt>Renews</dt><dd>{s.nextInvoice}</dd></dl>
              {manage ? <button className="btn btn-secondary sm" style={{ marginTop: 10 }} onClick={openPlan}><Icon name="ext" />Compare &amp; change plan</button> : null}
              <div className="hr" /><div className="sectitle">Payment method</div>
              <dl className="meta-grid"><dt>Card</dt><dd>{s.payment.brand} ···· {s.payment.last4}</dd><dt>Expires</dt><dd>{s.payment.exp}</dd><dt>Billed to</dt><dd>{s.payment.name}</dd></dl>
              {manage ? <button className="btn btn-secondary sm" style={{ marginTop: 10 }} onClick={() => L.openModal("Update payment method", (close) => <PaymentForm close={close} />)}><Icon name="edit" />Update payment method</button> : null}
            </div></div>
          </div>
          <div className="card">
            <div className="c-head"><h3>Invoices</h3><span className="tag" style={{ marginLeft: "auto" }}>{s.invoices.length}</span></div>
            <div className="c-body flush scroll" style={{ padding: 0 }}>
              <Table cols={[{ t: "Invoice" }, { t: "Date" }, { t: "Period" }, { t: "Amount", r: true }, { t: "Status" }, { t: "" }]}>
                {s.invoices.map((iv) => (
                  <tr key={iv.id}>
                    <td className="strong num">{iv.id}</td><td>{iv.date}</td><td style={{ color: "var(--muted)" }}>{iv.period}</td><td className="r num">{money(iv.amount)}</td>
                    <td><StatusChip s={iv.status} /></td>
                    <td className="r"><button className="btn btn-ghost sm" aria-label={`Download invoice ${iv.id}`} onClick={() => download(iv.id)}><Icon name="download" />Download</button></td>
                  </tr>
                ))}
              </Table>
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}
