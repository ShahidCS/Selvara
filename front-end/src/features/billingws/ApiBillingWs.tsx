import { useEffect, useState } from "react";
import { DataTable, Empty, Icon, KpiStrip, KpiTile, Page, StatusChip, type DTColumn } from "@/components/ui";
import { LayerFoot } from "@/components/shell/LayerProvider";
import { apiMessage } from "@/components/kit/serverRequests";
import { useLayer } from "@/hooks/useLayer";
import { ModuleTip } from "@/components/kit/ModuleTip";
import { invoiceText, minorMoney, type InvoiceLike } from "@/lib/billingText";
import { downloadText } from "@/lib/format";
import { safeFileName } from "@/lib/security";
import { bumpData, useApp, useData } from "@/lib/store";
import { apiFetch } from "@/services/http";
import { wsMeta } from "@/services/ws";

/* Billing & Invoices in production (programme group 8a): the company's own billing account, invoices and payments as the platform's ledger
   keeps them. Company admins only (the server checks). A plan change is a request for the next period that the Selvara team accepts or
   declines. Paying: when card payment is set up, an open invoice is paid on the payment provider's own page (no card data reaches Selvara)
   and recorded only when the provider confirms it; otherwise by bank transfer with the invoice number as the reference. */
interface Inv extends InvoiceLike { id: string }
interface Data {
  account: { plan: string; cycle: string; currency: string; status: string; trialEnds: string | null; nextPeriod: string; contact: { name: string; email: string }; method: string; pendingPlan: string | null } | null;
  invoices: Inv[]; payments: { id: string; invoiceId: string; type: string; amount: number; currency: string; at: string }[];
  requests: { id: string; plan: string; at: string; by: string; answer: { accepted: boolean; by: string; reason: string } | null }[];
  plans: { name: string; monthlyUsd: number; seats: number }[]; canPay: boolean;
}

export function ApiBillingWs() {
  const v = useData(); const L = useLayer(); const company = useApp((s) => s.company?.name ?? "");
  const [d, setD] = useState<Data | null>(null); const [err, setErr] = useState("");
  const [paid] = useState(() => (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("paid") : null));
  useEffect(() => { let on = true; apiFetch<Data>("/ws/data/billingws").then((x) => { if (on) { setD(x); setErr(""); } }, (e) => { if (on) setErr(apiMessage(e, "Could not load billing")); }); return () => { on = false; }; }, [v]);
  if (err) return <Page mod="billingws"><Empty icon="alert" title="Billing is not available">{err}</Empty></Page>;
  if (!d) return <Page mod="billingws"><p style={{ color: "var(--muted)" }}>Loading…</p></Page>;
  const a = d.account; const seats = wsMeta.get().members.length; const limit = a ? d.plans.find((p) => p.name === a.plan)?.seats ?? 0 : 0;
  const open = d.invoices.filter((i) => i.status === "Open" || i.status === "Past due"); const pastDue = open.filter((i) => i.status === "Past due").length;
  const waiting = d.requests.find((r) => !r.answer);
  const pay = async (i: Inv) => {
    try { const r = await apiFetch<{ url: string }>(`/ws/billing/invoices/${encodeURIComponent(i.id)}/pay`, { method: "POST", body: "{}" }); window.location.assign(r.url); }
    catch (x) { L.toast(apiMessage(x, "Could not open the payment page"), false); }
  };
  const download = (i: Inv) => { if (!downloadText(`${safeFileName(i.id, "invoice")}.txt`, invoiceText(i, company))) L.toast("Download not available in this view", false); };
  const cols: DTColumn<Inv>[] = [
    { key: "id", header: "Invoice", nowrap: true, value: (i) => i.id, locked: true, render: (i) => <span className="strong num">{i.id}</span> },
    { key: "issued", header: "Issued", value: (i) => i.issued, render: (i) => <span className="num">{i.issued}</span> },
    { key: "period", header: "Period", value: (i) => i.from, render: (i) => <span className="num" style={{ color: "var(--muted)" }}>{i.from} to {i.to}</span> },
    { key: "due", header: "Due", value: (i) => i.due, render: (i) => <span className="num">{i.due}</span> },
    { key: "total", header: "Total", align: "end", value: (i) => i.total, render: (i) => <span className="num">{minorMoney(i.total, i.currency)}</span> },
    { key: "out", header: "Still due", align: "end", value: (i) => i.outstanding, render: (i) => <span className="num">{minorMoney(i.outstanding, i.currency)}</span> },
    { key: "status", header: "Status", value: (i) => i.status, render: (i) => <StatusChip s={i.status} /> },
    { key: "act", header: "Actions", hideHeader: true, align: "end", locked: true, render: (i) => (
      <span style={{ whiteSpace: "nowrap" }}>
        {d.canPay && i.outstanding > 0 && (i.status === "Open" || i.status === "Past due") ? <button className="btn btn-ghost sm" aria-label={`Pay invoice ${i.id}`} onClick={() => pay(i)}><Icon name="ext" />Pay</button> : null}
        <button className="btn btn-ghost sm" aria-label={`Download invoice ${i.id}`} onClick={() => download(i)}><Icon name="download" />Download</button>
      </span>) },
  ];
  return (
    <Page mod="billingws" acts={a ? <button className="btn btn-secondary" disabled={!!waiting} title={waiting ? "A plan change is already waiting for the Selvara team" : undefined} onClick={() => L.openModal("Change plan", (close) => <PlanForm d={d} close={close} />)}>Change plan</button> : undefined}>
      <div className="scroll" style={{ flex: "1 1 auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingRight: 2 }}>
          <ModuleTip mod="billingws" force={!d.invoices.length} />
          {paid ? <div className="banner info" role="status" style={{ display: "flex", gap: 8, alignItems: "center" }}><Icon name="clock" />Thank you. Invoice {paid} shows as paid once the payment provider confirms the payment, usually within a minute.</div> : null}
          {!a ? <Empty icon="billing" title="No billing account yet">The Selvara team sets up your company&apos;s billing account (plan, currency and billing contact). Invoices appear here once they are issued.</Empty> : (
            <>
              <KpiStrip label="Billing summary">
                <KpiTile label="Plan" value={a.plan} caption={`${a.cycle} billing${a.pendingPlan ? `; ${a.pendingPlan} from the next period` : ""}`} />
                <KpiTile label="Seats" value={limit ? `${seats} / ${limit}` : seats} delta={limit && seats / limit >= 0.9 ? { tone: "bad", text: "Near the limit" } : undefined} caption="Active members" />
                <KpiTile label="Next period" value={a.nextPeriod} caption={a.status === "Trial" && a.trialEnds ? `Trial until ${a.trialEnds}` : "Invoiced when it starts"} />
                <KpiTile label="Open invoices" value={open.length} delta={pastDue ? { tone: "bad", text: `${pastDue} past due` } : { tone: "good", text: "None past due" }} caption={open.length ? minorMoney(open.reduce((n, i) => n + i.outstanding, 0), a.currency) + " due" : "Nothing due"} />
              </KpiStrip>
              <div className="panels" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))", gridAutoRows: "min-content", alignItems: "stretch" }}>
                <div className="card"><div className="c-head"><h3>Subscription</h3></div><div className="c-body">
                  <dl className="meta-grid"><dt>Plan</dt><dd className="strong">{a.plan}</dd><dt>Billing cycle</dt><dd>{a.cycle}</dd><dt>Currency</dt><dd>{a.currency}</dd><dt>Status</dt><dd><StatusChip s={a.status} /></dd><dt>Billing contact</dt><dd>{a.contact.name}, {a.contact.email}</dd></dl>
                  {waiting ? <p className="field help" style={{ marginTop: 10 }}><Icon name="clock" /> {waiting.plan} asked by {waiting.by} on {waiting.at}; waiting for the Selvara team.</p> : null}
                </div></div>
                <div className="card"><div className="c-head"><h3>Paying</h3></div><div className="c-body">
                  <dl className="meta-grid"><dt>Method</dt><dd>{a.method}</dd></dl>
                  <p className="field help" style={{ marginTop: 10 }}>{d.canPay ? "Open invoices can be paid by card on the payment provider's own page (Pay). Card details never reach Selvara." : "Pay by bank transfer, using the invoice number as the reference."} To change the billing contact or address, contact the Selvara team.</p>
                </div></div>
              </div>
              <div className="card">
                <div className="c-head"><h3>Invoices</h3><span className="tag" style={{ marginLeft: "auto" }}>{d.invoices.length}</span></div>
                <div className="c-body flush scroll" style={{ padding: 0 }}>
                  {d.invoices.length ? <DataTable<Inv> id="invoices-api" label="Invoices" rows={d.invoices} rowKey={(i) => i.id} columns={cols} searchText={(i) => `${i.id} ${i.from} ${i.to}`}
                    tabs={["Open", "Past due", "Paid", "Void"].map((st) => ({ key: st, label: st, match: (i: Inv) => i.status === st }))} exportName="invoices" />
                    : <p style={{ padding: 16, color: "var(--muted)" }}>No invoices yet{a.status === "Trial" ? ": you are on a trial." : "."}</p>}
                </div>
              </div>
              {d.payments.length ? (
                <div className="card"><div className="c-head"><h3>Payments and credits</h3></div><div className="c-body flush" style={{ padding: 0 }}>
                  <div className="tbl-wrap"><table className="tbl"><thead><tr><th scope="col">Date</th><th scope="col">Invoice</th><th scope="col">Type</th><th scope="col" className="r">Amount</th></tr></thead>
                    <tbody>{d.payments.map((p) => <tr key={p.id}><td className="num">{p.at}</td><td className="num">{p.invoiceId}</td><td>{({ payment: "Payment", credit: "Credit", refund: "Refund" } as Record<string, string>)[p.type] ?? p.type}</td><td className="r num">{minorMoney(p.amount, p.currency)}</td></tr>)}</tbody></table></div>
                </div></div>
              ) : null}
              {d.requests.some((r) => r.answer) ? (
                <div className="card"><div className="c-head"><h3>Plan change requests</h3></div><div className="c-body">
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>{d.requests.filter((r) => r.answer).map((r) => <li key={r.id}>{r.plan} ({r.at}, {r.by}): {r.answer!.accepted ? "accepted, from the next period" : "declined"}; {r.answer!.reason}</li>)}</ul>
                </div></div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </Page>
  );
}

function PlanForm({ d, close }: { d: Data; close: () => void }) {
  const L = useLayer(); const cur = d.account!.plan;
  const [plan, setPlan] = useState(d.plans.find((p) => p.name !== cur)?.name ?? cur); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return; setBusy(true);
    try { await apiFetch("/ws/billing/plan-request", { method: "POST", body: JSON.stringify({ plan }) }); bumpData(); close(); L.toast("Sent to the Selvara team: it applies from your next period once accepted"); }
    catch (x) { setErr(apiMessage(x, "Could not send the request")); setBusy(false); }
  };
  return (
    <>
      <p style={{ marginTop: 0 }}>A plan change applies from your next billing period, once the Selvara team accepts it. Nothing is charged pro rata.</p>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="sectitle" style={{ marginTop: 0 }}>Plans</legend>
        {d.plans.map((p) => (
          <label key={p.name} className="listrow" style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer", marginBottom: 6 }}>
            <input type="radio" name="plan" checked={plan === p.name} onChange={() => { setPlan(p.name); setErr(""); }} style={{ accentColor: "var(--accent)" }} />
            <span style={{ flex: 1 }}><span className="strong">{p.name}</span>{p.name === cur ? " (current)" : ""}<div style={{ fontSize: 12, color: "var(--muted)" }}>Up to {p.seats} seats</div></span>
            <span className="num">{minorMoney(p.monthlyUsd, "USD")} a month</span>
          </label>
        ))}
      </fieldset>
      <p className="field help">Prices in US dollars before tax; your invoices are in your account&apos;s currency at the rate on their issue day.</p>
      <p className="field help" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" disabled={busy || plan === cur} onClick={go}>Request the change</button></LayerFoot>
    </>
  );
}
