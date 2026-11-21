import { DataTable, Icon, KpiStrip, KpiTile, Page, StatusChip, type DTColumn } from "@/components/ui";
import { useApp, useData } from "@/lib/store";
import { useLayer } from "@/hooks/useLayer";
import { wsLog } from "@/lib/audit";
import { downloadText, money, num } from "@/lib/format";
import { safeFileName } from "@/lib/security";
import { SUBSCRIPTION, billingCanManage, findInvoice, invoiceText } from "@/services/billing";
import { useGo, useRoute } from "@/lib/route";
import { PaymentPage, PlanPage } from "./BillingFormPages";
import { API_ON } from "@/lib/rbac";
import { ApiBillingWs } from "./ApiBillingWs";

function Meter({ used, limit, label }: { used: number; limit: number; label: string }) {
  const pct = Math.min(100, Math.round(used / limit * 100)); const tone = pct >= 90 ? "var(--bad-ink)" : "var(--accent)";
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} style={{ height: 7, borderRadius: 5, background: "var(--line)", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: tone, borderRadius: 5 }} />
    </div>
  );
}

/** `/ws/billingws` is the account overview; `/plan` and `/payment` are form pages. */
export default function BillingWsModule() {
  const { param } = useRoute();
  if (API_ON) return <ApiBillingWs />;
  if (param === "plan") return <PlanPage />;
  if (param === "payment") return <PaymentPage />;
  return <BillingOverview />;
}

type Invoice = (typeof SUBSCRIPTION.invoices)[number];

function BillingOverview() {
  useData();
  const L = useLayer(); const go = useGo();
  const manage = billingCanManage(useApp((s) => s.role));
  const s = SUBSCRIPTION; const spct = Math.round(s.seatsUsed / s.seatLimit * 100);
  const openPlan = () => go("/ws/billingws/plan");
  const unpaid = s.invoices.filter((iv) => iv.status !== "Paid").length;
  const download = (id: string) => {
    const iv = findInvoice(id); if (!iv) return;
    if (!downloadText(safeFileName(iv.id, "invoice") + ".txt", invoiceText(iv, money))) { L.toast("Download not available in this view", false); return; }
    wsLog("invoice.downloaded", iv.id, "System"); L.toast("Downloading " + iv.id);
  };
  const invCols: DTColumn<Invoice>[] = [
    { key: "id", header: "Invoice", nowrap: true, value: (iv) => iv.id, locked: true, render: (iv) => <span className="strong num">{iv.id}</span> },
    { key: "date", header: "Date", value: (iv) => iv.date, sortBy: (iv) => Date.parse(iv.date) || 0, render: (iv) => iv.date },
    { key: "period", header: "Period", value: (iv) => iv.period, render: (iv) => <span style={{ color: "var(--muted)" }}>{iv.period}</span> },
    { key: "amount", header: "Amount", value: (iv) => iv.amount, align: "end", render: (iv) => <span className="num">{money(iv.amount)}</span> },
    { key: "status", header: "Status", value: (iv) => iv.status, render: (iv) => <StatusChip s={iv.status} /> },
    { key: "act", header: "Actions", hideHeader: true, align: "end", locked: true, render: (iv) => <button className="btn btn-ghost sm" aria-label={`Download invoice ${iv.id}`} onClick={() => download(iv.id)}><Icon name="download" />Download</button> },
  ];
  return (
    <Page mod="billingws" acts={manage ? <button className="btn btn-secondary" onClick={openPlan}>Manage plan</button> : undefined}>
      <div className="scroll" style={{ flex: "1 1 auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingRight: 2 }}>
          <KpiStrip label="Billing summary">
            <KpiTile label="Plan" value={s.plan} caption={s.cycle + " billing"} />
            <KpiTile label="Seats" value={s.seatsUsed + " / " + s.seatLimit} delta={spct >= 90 ? { tone: "bad", text: "Near the limit" } : { tone: "flat", text: spct + "% used" }} caption="Workspace members" />
            <KpiTile label="Next bill" value={s.nextInvoice.replace(/^\d+\s/, "")} caption={money(s.amount) + " due"} />
            <KpiTile label="Invoices" value={s.invoices.length} caption={unpaid ? `${unpaid} not paid` : "All paid"} />
          </KpiStrip>
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
                      <Meter used={u.used} limit={u.limit} label={`${u.k} used`} />
                    </div>
                  );
                })}
              </div>
              <p className="field help" style={{ marginTop: 14 }}>Overage beyond plan limits is billed at the rates in your contract. Synthetic sample for the prototype.</p>
            </div></div>
            <div className="card"><div className="c-head"><h3>Subscription</h3></div><div className="c-body">
              <dl className="meta-grid"><dt>Plan</dt><dd className="strong">{s.plan}</dd><dt>Billing cycle</dt><dd>{s.cycle}</dd><dt>Renews</dt><dd>{s.nextInvoice}</dd></dl>
              <div className="hr" /><div className="sectitle">Payment method</div>
              <dl className="meta-grid"><dt>Card</dt><dd>{s.payment.brand} ···· {s.payment.last4}</dd><dt>Expires</dt><dd>{s.payment.exp}</dd><dt>Billed to</dt><dd>{s.payment.name}</dd></dl>
              {manage ? <button className="btn btn-secondary sm" style={{ marginTop: 10 }} onClick={() => go("/ws/billingws/payment")}><Icon name="edit" />Update payment method</button> : null}
            </div></div>
          </div>
          <div className="card">
            <div className="c-head"><h3>Invoices</h3><span className="tag" style={{ marginLeft: "auto" }}>{s.invoices.length}</span></div>
            <div className="c-body flush scroll" style={{ padding: 0 }}>
              <DataTable<Invoice> id="invoices" label="Invoices" rows={s.invoices} rowKey={(iv) => iv.id} columns={invCols} searchText={(iv) => `${iv.id} ${iv.period}`}
                tabs={Array.from(new Set(s.invoices.map((iv) => iv.status))).map((st) => ({ key: st, label: st, match: (iv: Invoice) => iv.status === st }))} exportName="invoices" />
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}
