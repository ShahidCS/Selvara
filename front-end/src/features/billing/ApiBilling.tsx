import { Fragment, useCallback, useEffect, useState } from "react";
import { Chip, DataTable, Empty, Icon, KpiStrip, KpiTile, Page, StatusChip, type DTColumn, type DTRowAction } from "@/components/ui";
import { LayerFoot } from "@/components/shell/LayerProvider";
import { ReasonTicket, reasonTicketOk } from "@/components/kit/admin/ReasonTicket";
import { ELEVATE_TEXT, ServerElevationBanner, useServerElevation } from "@/components/kit/admin/ServerElevation";
import { apiMessage, RequestsTable, utcMin } from "@/components/kit/serverRequests";
import { useLayer } from "@/hooks/useLayer";
import { invoiceText, minorMoney } from "@/lib/billingText";
import { downloadText } from "@/lib/format";
import { useGo } from "@/lib/route";
import { safeFileName } from "@/lib/security";
import { bumpData, useData, useModState } from "@/lib/store";
import * as platform from "@/services/platform";
import * as api from "./services/api";

/* Billing in production (programme group 8a): the platform's own ledger. Accounts (plan, cycle, currency, tax country, contact, method),
   invoices the server issues with the rate and tax in force locked in, and every payment, credit, refund, write-off and void as a ledger
   entry. Support reads; an elevated super admin acts; above USD 1,000, every write-off and every price change a second super admin approves
   under Requests. Card payments, when a payment provider is configured, are made on the provider's own page and recorded only when the
   provider confirms them. Nothing here computes an amount: the server does. */
const VIEWS: [string, string][] = [["accounts", "Accounts"], ["invoices", "Invoices"], ["ledger", "Ledger"], ["plans", "Plan requests"], ["prices", "Price list"], ["requests", "Requests"]];
const KIND_LABEL: Record<api.FinanceKind, string> = { credit: "Credit", refund: "Refund", markpaid: "Mark paid", writeoff: "Write off", void: "Void" };
const ENTRY_LABEL: Record<string, string> = { payment: "Payment", markpaid: "Marked paid", credit: "Credit", refund: "Refund", writeoff: "Write-off", void: "Void", unmatched: "Received, not applied" };
const today = () => new Date().toISOString().slice(0, 10);

export function ApiBilling({ param }: { param?: string | null }) {
  const v = useData(); const s = useServerElevation(); const L = useLayer();
  const [b, setB] = useState<api.Billing | null>(null); const [err, setErr] = useState("");
  const [view, setView] = useModState<string>("billing.api.view", "accounts");
  useEffect(() => { let on = true; api.billing().then((x) => { if (on) { setB(x); setErr(""); } }, (e) => { if (on) setErr(apiMessage(e, "Could not load billing")); }); return () => { on = false; }; }, [v]);
  const lock = s.locked ? (s.canElevate ? ELEVATE_TEXT : "Support accounts read only") : undefined;
  const acts = b ? <>
    <button className="btn btn-secondary" disabled={!!lock} title={lock} onClick={() => L.openModal("Set up a billing account", (close) => <AccountForm b={b} close={close} />)}><Icon name="plus" />Set up account</button>
    <button className="btn btn-primary" data-tour="billing-issue" disabled={!!lock} title={lock} onClick={() => L.openModal("Issue invoices", (close) => <IssueForm b={b} close={close} />)}><Icon name="billing" />Issue invoices</button>
  </> : undefined;
  if (param) {
    const acc = b?.accounts.find((a) => a.tenantId === param);
    return (
      <Page mod="billing" title={acc?.company} back={{ href: "/admin/billing", label: "Billing" }}>
        <ServerElevationBanner s={s} />
        {err ? <p role="alert" style={{ color: "var(--bad-ink)" }}>{err}</p> : !b ? <p style={{ color: "var(--muted)" }}>Loading…</p>
          : !acc ? <Empty icon="billing" title="No billing account">This company has no billing account yet.</Empty> : <AccountDetail b={b} acc={acc} lock={lock} />}
      </Page>
    );
  }
  const open = b ? b.invoices.filter((i) => i.status === "Open" || i.status === "Past due") : [];
  const pastDue = open.filter((i) => i.status === "Past due").length;
  return (
    <Page mod="billing" sub="The platform's billing ledger: accounts, invoices, payments and credits." acts={acts}>
      <ServerElevationBanner s={s} />
      {b ? (
        <KpiStrip label="Billing summary">
          <KpiTile label="Billing accounts" value={b.accounts.length} caption={`${b.companies.filter((c) => !c.hasAccount && c.status !== "Closed").length} companies without one`} />
          <KpiTile label="Open invoices" value={open.length} delta={pastDue ? { tone: "bad", text: `${pastDue} past due` } : { tone: "good", text: "None past due" }} caption="Still to be paid" />
          <KpiTile label="Plan requests" value={b.planRequests.length} delta={b.planRequests.length ? { tone: "watch", text: "Waiting for you" } : { tone: "flat", text: "None" }} caption="From company admins" />
          <KpiTile label="Card payments" value={b.payments ? (b.payments.mode === "live" ? "Live" : "Test mode") : "Off"} caption={b.payments ? "Through the payment provider" : "Bank transfer only"} />
        </KpiStrip>
      ) : null}
      <div className="card" data-tour="billing-table" style={{ marginTop: 12 }}>
        <div className="c-head"><div className="seg" role="tablist" aria-label="Billing views" data-tour="billing-views">{VIEWS.map((x) => <button key={x[0]} role="tab" aria-selected={view === x[0]} onClick={() => setView(x[0])}>{x[1]}</button>)}</div></div>
        <div className="c-body scroll">
          {err ? <p role="alert" style={{ color: "var(--bad-ink)" }}>{err}</p> : !b ? <p style={{ color: "var(--muted)" }}>Loading…</p>
            : view === "invoices" ? <Invoices b={b} rows={b.invoices} lock={lock} />
            : view === "ledger" ? <Ledger b={b} rows={b.entries} />
            : view === "plans" ? <PlanRequests b={b} lock={lock} />
            : view === "prices" ? <Prices b={b} lock={lock} />
            : view === "requests" ? <BillingRequests />
            : <Accounts b={b} lock={lock} />}
        </div>
      </div>
    </Page>
  );
}

function Accounts({ b, lock }: { b: api.Billing; lock?: string }) {
  const go = useGo(); const L = useLayer();
  const cols: DTColumn<api.Account>[] = [
    { key: "company", header: "Company", value: (a) => a.company, locked: true, render: (a) => <><span className="strong">{a.company}</span><div style={{ fontSize: 12, color: "var(--muted)" }}>{a.ref}</div></> },
    { key: "plan", header: "Plan", value: (a) => a.plan, render: (a) => <>{a.plan}{a.pendingPlan ? <div style={{ fontSize: 12, color: "var(--muted)" }}>{`${a.pendingPlan.plan} from the next period`}</div> : null}</> },
    { key: "cycle", header: "Cycle", value: (a) => a.cycle, render: (a) => a.cycle },
    { key: "currency", header: "Currency", value: (a) => a.currency, render: (a) => <span className="num">{a.currency}</span> },
    { key: "next", header: "Next period", value: (a) => a.nextPeriod, render: (a) => <span className="num">{a.nextPeriod}</span> },
    { key: "balance", header: "Balance", align: "end", value: (a) => a.balance, render: (a) => <span className="num">{minorMoney(a.balance, a.currency)}</span> },
    { key: "status", header: "Status", value: (a) => (a.pastDue ? "Past due" : a.status), render: (a) => <StatusChip s={a.pastDue ? "Past due" : a.status} /> },
    { key: "method", header: "Method", value: (a) => a.method, defaultHidden: true, render: (a) => a.method },
  ];
  if (!b.accounts.length) return <Empty icon="billing" title="No billing accounts yet">Set up a billing account for a company: its plan, cycle, currency, tax country and billing contact. Invoices are then issued from it.</Empty>;
  return <DataTable<api.Account> id="billing-accounts-api" label="Billing accounts" rows={b.accounts} rowKey={(a) => a.tenantId} columns={cols} searchText={(a) => `${a.company} ${a.ref} ${a.plan}`}
    onOpen={(a) => go(`/admin/billing/${encodeURIComponent(a.tenantId)}`)}
    rowActions={(a) => [{ label: "Open", run: () => go(`/admin/billing/${encodeURIComponent(a.tenantId)}`) }, { label: "Change account", whyNot: lock ?? null, run: () => L.openModal(`Billing account of ${a.company}`, (close) => <AccountForm b={b} acc={a} close={close} />) }]}
    filters={[{ key: "status", label: "Status", options: ["Active", "Trial", "Past due"], get: (a) => (a.pastDue ? "Past due" : a.status) }, { key: "plan", label: "Plan", options: Object.keys(b.prices.plans), get: (a) => a.plan }]} exportName="billing-accounts" />;
}

function AccountDetail({ b, acc, lock }: { b: api.Billing; acc: api.Account; lock?: string }) {
  const L = useLayer();
  const [tab, setTab] = useModState<string>("billing.api.dt", "Invoices");
  const inv = b.invoices.filter((i) => i.tenantId === acc.tenantId); const ids = new Set(inv.map((i) => i.id));
  return (
    <div className="card">
      <div className="c-head" style={{ gap: 10 }}>
        <div><h3>{acc.company}</h3><div className="sub">{acc.ref}, {acc.plan}, {acc.cycle.toLowerCase()}</div></div>
        <div className="r" style={{ display: "flex", gap: 8, alignItems: "center" }}><StatusChip s={acc.pastDue ? "Past due" : acc.status} />
          <button className="btn btn-secondary sm" disabled={!!lock} title={lock} onClick={() => L.openModal(`Billing account of ${acc.company}`, (close) => <AccountForm b={b} acc={acc} close={close} />)}><Icon name="edit" />Change account</button></div>
      </div>
      <div className="c-body scroll">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))", gap: 16 }}>
          <dl className="meta-grid"><dt>Plan</dt><dd>{acc.plan}{acc.pendingPlan ? ` (${acc.pendingPlan.plan} from the next period)` : ""}</dd><dt>Billing cycle</dt><dd>{acc.cycle}</dd><dt>Currency</dt><dd>{acc.currency}</dd><dt>Tax country</dt><dd>{acc.country}</dd><dt>Next period starts</dt><dd className="num">{acc.nextPeriod}</dd>{acc.trialEnds ? <><dt>Trial ends</dt><dd className="num">{acc.trialEnds}</dd></> : null}</dl>
          <dl className="meta-grid"><dt>Billing contact</dt><dd>{acc.contact.name}</dd><dt>Email</dt><dd>{acc.contact.email}</dd><dt>Address</dt><dd>{acc.address || "—"}</dd><dt>Method</dt><dd>{acc.method}</dd><dt>Balance</dt><dd><span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><span className="num" style={{ color: acc.balance ? "var(--bad-ink)" : "var(--ink)" }}>{minorMoney(acc.balance, acc.currency)}</span>{acc.pastDue ? <Chip cls="bad" icon="alert">Past due</Chip> : acc.balance ? <Chip cls="warn" icon="clock">Due</Chip> : <Chip cls="ok" icon="check">Paid up</Chip>}</span></dd></dl>
        </div>
        {acc.pastDue ? <div className="banner warn" role="status" style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}><Icon name="alert" />{acc.pastDue} invoice{acc.pastDue > 1 ? "s are" : " is"} past due.</div> : null}
        <div className="tabs" role="tablist" style={{ marginTop: 14 }}>{["Invoices", "Ledger"].map((t) => <button key={t} className="tab" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>)}</div>
        <div role="tabpanel" style={{ marginTop: 8 }}>
          {tab === "Invoices" ? <Invoices b={b} rows={inv} lock={lock} /> : <Ledger b={b} rows={b.entries.filter((e) => ids.has(e.invoiceId))} />}
        </div>
      </div>
    </div>
  );
}

function Invoices({ b, rows, lock }: { b: api.Billing; rows: api.Invoice[]; lock?: string }) {
  const L = useLayer();
  const fin = (i: api.Invoice, k: api.FinanceKind) => L.openModal(`${KIND_LABEL[k]} ${i.id}`, (close) => <FinanceForm b={b} inv={i} kind={k} close={close} />);
  const link = async (i: api.Invoice) => {
    try { const r = await api.paymentLink(i.id); bumpData(); L.openModal(`Payment link for ${i.id}`, () => <PayLink url={r.url} email={b.accounts.find((a) => a.tenantId === i.tenantId)?.contact.email ?? ""} />); }
    catch (x) { L.toast(apiMessage(x, "Could not create the payment link"), false); }
  };
  const download = (i: api.Invoice) => { if (!downloadText(`${safeFileName(i.id, "invoice")}.txt`, invoiceText(i, i.company))) L.toast("Download not available in this view", false); };
  const open = (i: api.Invoice) => i.status === "Open" || i.status === "Past due";
  const actions = (i: api.Invoice): DTRowAction<api.Invoice>[] => [
    { label: "Download", run: download },
    { label: "Send by email", whyNot: lock ?? (!b.mail ? "Email is not set up for the platform yet" : null), run: async (x: api.Invoice) => { try { await api.emailInvoice(x.id); L.toast(`${x.id} emailed to the billing contact`); } catch (e) { L.toast(apiMessage(e, "Could not send the invoice"), false); } } },
    { label: "Credit", whyNot: lock ?? (!open(i) ? "Only an open invoice can be credited" : null), run: () => fin(i, "credit") },
    { label: "Refund", whyNot: lock ?? (i.paid - i.refunded <= 0 ? "Nothing has been paid" : null), run: () => fin(i, "refund") },
    { label: "Mark paid", whyNot: lock ?? (!open(i) || !i.outstanding ? "Nothing is due" : null), run: () => fin(i, "markpaid") },
    { label: "Write off", whyNot: lock ?? (!open(i) || !i.outstanding ? "Nothing is due" : null), run: () => fin(i, "writeoff") },
    { label: "Void", whyNot: lock ?? (!open(i) ? "Only an open invoice can be voided" : i.paid > 0 ? "Payments were made: refund them instead" : null), run: () => fin(i, "void") },
    ...(b.payments ? [{ label: "Payment link", whyNot: lock ?? (!open(i) || !i.outstanding ? "Nothing is due" : null), run: link }] : []),
  ];
  const cols: DTColumn<api.Invoice>[] = [
    { key: "id", header: "Invoice", nowrap: true, value: (i) => i.id, locked: true, render: (i) => <span className="strong num">{i.id}</span> },
    { key: "company", header: "Company", value: (i) => i.company, render: (i) => i.company },
    { key: "period", header: "Period", value: (i) => i.from, render: (i) => <span className="num" style={{ color: "var(--muted)" }}>{i.from} to {i.to}</span> },
    { key: "issued", header: "Issued", value: (i) => i.issued, defaultHidden: true, render: (i) => <span className="num">{i.issued}</span> },
    { key: "due", header: "Due", value: (i) => i.due, render: (i) => <span className="num">{i.due}</span> },
    { key: "total", header: "Total", align: "end", value: (i) => i.total, render: (i) => <span className="num">{minorMoney(i.total, i.currency)}</span> },
    { key: "tax", header: "Tax", align: "end", value: (i) => i.tax, defaultHidden: true, render: (i) => <span className="num">{`${i.taxType} ${i.taxRate} %: ${minorMoney(i.tax, i.currency)}`}</span> },
    { key: "out", header: "Still due", align: "end", value: (i) => i.outstanding, render: (i) => <span className="num">{minorMoney(i.outstanding, i.currency)}</span> },
    { key: "status", header: "Status", value: (i) => i.status, render: (i) => <StatusChip s={i.status} /> },
  ];
  if (!rows.length) return <Empty icon="billing" title="No invoices yet">Invoices appear once they are issued from the billing accounts (Issue invoices).</Empty>;
  return <DataTable<api.Invoice> id="billing-invoices-api" label="Invoices" rows={rows} rowKey={(i) => i.id} columns={cols} searchText={(i) => `${i.id} ${i.company} ${i.ref}`} rowActions={actions}
    tabs={["Open", "Past due", "Paid", "Void", "Written off"].map((st) => ({ key: st, label: st, match: (i: api.Invoice) => i.status === st }))} exportName="invoices" />;
}

function Ledger({ b, rows }: { b: api.Billing; rows: api.Entry[] }) {
  const inv = new Map(b.invoices.map((i) => [i.id, i]));
  const cols: DTColumn<api.Entry>[] = [
    { key: "at", header: "When", value: (e) => e.at, render: (e) => <span className="num">{utcMin(e.at)}</span> },
    { key: "inv", header: "Invoice", value: (e) => e.invoiceId, locked: true, render: (e) => <span className="strong num">{e.invoiceId}</span> },
    { key: "company", header: "Company", value: (e) => inv.get(e.invoiceId)?.company ?? "", render: (e) => inv.get(e.invoiceId)?.company ?? "" },
    { key: "type", header: "Entry", value: (e) => e.type, render: (e) => <>{e.type === "unmatched" ? <Chip cls="warn" icon="alert">Received, not applied</Chip> : <Chip cls={e.type === "payment" || e.type === "markpaid" ? "ok" : e.type === "writeoff" || e.type === "void" ? "bad" : "info"} icon={e.type === "payment" || e.type === "markpaid" ? "check" : "dot"}>{ENTRY_LABEL[e.type] ?? e.type}</Chip>}{e.review ? <div style={{ fontSize: 12, color: "var(--warn-ink)", marginTop: 4 }}>{`Needs review: ${e.review}`}</div> : null}</> },
    { key: "amount", header: "Amount", align: "end", value: (e) => e.amount, render: (e) => <span className="num">{minorMoney(e.amount, e.currency)}</span> },
    { key: "by", header: "By", value: (e) => e.by, render: (e) => <span style={{ fontSize: 12.5 }}>{e.by}</span> },
    { key: "reason", header: "Reason", value: (e) => e.reason, defaultHidden: true, render: (e) => <span style={{ fontSize: 12.5 }}>{e.reason}{e.ticket ? ` (${e.ticket})` : ""}</span> },
  ];
  if (!rows.length) return <Empty icon="log" title="No ledger entries yet">Payments, credits, refunds, write-offs and voids are recorded here, each with who, why and the ticket.</Empty>;
  return <DataTable<api.Entry> id="billing-ledger-api" label="Ledger" rows={rows} rowKey={(e) => e.id} columns={cols} searchText={(e) => `${e.invoiceId} ${e.by} ${e.reason} ${e.ticket}`}
    tabs={[{ key: "review", label: "Needs review", match: (e: api.Entry) => !!e.review }]}
    filters={[{ key: "type", label: "Entry", options: Object.keys(ENTRY_LABEL), labels: ENTRY_LABEL, get: (e) => e.type }]} exportName="billing-ledger" />;
}

function PlanRequests({ b, lock }: { b: api.Billing; lock?: string }) {
  const L = useLayer();
  if (!b.planRequests.length) return <Empty icon="check" title="No plan requests">When a company admin asks for another plan, it appears here. Accepted changes apply from the company&apos;s next invoice.</Empty>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {b.planRequests.map((r) => {
        const acc = b.accounts.find((a) => a.tenantId === r.tenantId);
        return (
          <div key={r.id} className="listrow" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 280px" }}><span className="strong">{acc?.company ?? r.company ?? "Company"}</span>: {acc?.plan ?? "?"} → <b>{r.plan}</b><div style={{ fontSize: 12, color: "var(--muted)" }}>Asked by {r.byName ?? "a company admin"}, {utcMin(r.at)}</div></div>
            <div className="btngrp">
              <button className="btn btn-ghost sm" disabled={!!lock} title={lock} aria-label={`Accept plan change to ${r.plan} for ${acc?.company ?? ""}`} onClick={() => L.openModal(`Accept ${r.plan} for ${acc?.company ?? ""}`, (close) => <PlanDecide id={r.id} accept close={close} />)}><Icon name="check" />Accept</button>
              <button className="btn btn-ghost sm" disabled={!!lock} title={lock} aria-label={`Decline plan change to ${r.plan} for ${acc?.company ?? ""}`} onClick={() => L.openModal(`Decline ${r.plan} for ${acc?.company ?? ""}`, (close) => <PlanDecide id={r.id} accept={false} close={close} />)}><Icon name="x" />Decline</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
function PlanDecide({ id, accept, close }: { id: string; accept: boolean; close: () => void }) {
  const L = useLayer(); const [reason, setReason] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return; setBusy(true);
    try { await api.decidePlan(id, accept, reason); bumpData(); close(); L.toast(accept ? "Accepted: it applies from the next invoice" : "Declined"); } catch (x) { setErr(apiMessage(x, "Could not record the decision")); setBusy(false); }
  };
  return (
    <>
      <p style={{ marginTop: 0 }}>{accept ? "The new plan applies from the company's next billing period; nothing is charged pro rata." : "The company keeps its plan. Its admins see your reason."}</p>
      <div className="field"><label htmlFor="pd-reason">Reason (at least 10 characters)</label><textarea className="input" id="pd-reason" data-focus rows={3} maxLength={300} value={reason} onChange={(e) => { setReason(e.target.value); setErr(""); }} aria-describedby="pd-err" /></div>
      <p className="field help" id="pd-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={go}>{accept ? "Accept" : "Decline"}</button></LayerFoot>
    </>
  );
}

function Prices({ b, lock }: { b: api.Billing; lock?: string }) {
  const L = useLayer();
  return (
    <div className="fields-cap" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p className="field help" style={{ margin: 0 }}>Monthly prices in US dollars; an invoice converts them with the rate in force on its issue day and adds the tax of the account&apos;s country. Version {b.prices.version}{b.prices.at ? `, changed ${utcMin(b.prices.at)} (${b.prices.by})` : " (reference catalogue)"}.</p>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th scope="col">Plan</th><th scope="col" className="r">Per month</th><th scope="col" className="r">Seats</th></tr></thead>
        <tbody>{Object.entries(b.prices.plans).map(([k, p]) => <tr key={k}><td className="strong">{k}</td><td className="r num">{minorMoney(p.monthly, "USD")}</td><td className="r num">{p.seats}</td></tr>)}</tbody></table></div>
      <div><button className="btn btn-secondary" disabled={!!lock} title={lock} onClick={() => L.openModal("Change the price list", (close) => <PriceForm b={b} close={close} />)}><Icon name="edit" />Change the price list</button></div>
      <p className="field help" style={{ margin: 0 }}>A change is a request a second platform super admin approves. It applies to invoices issued afterwards; issued invoices never change.</p>
    </div>
  );
}
function PriceForm({ b, close }: { b: api.Billing; close: () => void }) {
  const L = useLayer();
  const [rows, setRows] = useState(() => Object.entries(b.prices.plans).map(([name, p]) => ({ name, monthly: String(p.monthly / 100), seats: String(p.seats) })));
  const [reason, setReason] = useState(""); const [ticket, setTicket] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const set = (i: number, k: "name" | "monthly" | "seats", v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const go = async () => {
    if (busy) return; if (!reasonTicketOk(reason, ticket)) { setErr("Give a reason of at least 15 characters and a ticket such as FIN-1234."); return; }
    setBusy(true);
    try { await api.changePrices(Object.fromEntries(rows.filter((r) => r.name.trim()).map((r) => [r.name.trim(), { monthly: Number(r.monthly), seats: Number(r.seats) }])), reason, ticket); bumpData(); close(); L.toast("Sent for approval by a second super admin"); }
    catch (x) { setErr(apiMessage(x, "Could not send the change")); setBusy(false); }
  };
  return (
    <>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th scope="col">Plan</th><th scope="col">USD per month</th><th scope="col">Seats</th><th scope="col"><span className="vh">Remove</span></th></tr></thead><tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td><input className="input" aria-label={`Plan ${i + 1} name`} maxLength={40} value={r.name} onChange={(e) => set(i, "name", e.target.value)} /></td>
            <td><input className="input num" aria-label={`${r.name || `Plan ${i + 1}`} price per month`} type="number" min={0} max={1000000} step="0.01" inputMode="decimal" value={r.monthly} onChange={(e) => set(i, "monthly", e.target.value)} style={{ width: 130 }} /></td>
            <td><input className="input num" aria-label={`${r.name || `Plan ${i + 1}`} seats`} type="number" min={1} max={100000} inputMode="numeric" value={r.seats} onChange={(e) => set(i, "seats", e.target.value)} style={{ width: 100 }} /></td>
            <td><button className="btn btn-ghost sm" aria-label={`Remove ${r.name || `plan ${i + 1}`}`} disabled={rows.length < 2} onClick={() => setRows(rows.filter((_, j) => j !== i))}><Icon name="x" /></button></td>
          </tr>
        ))}
      </tbody></table></div>
      <button className="btn btn-ghost sm" disabled={rows.length >= 10} onClick={() => setRows([...rows, { name: "", monthly: "0", seats: "1" }])}><Icon name="plus" />Add a plan</button>
      <ReasonTicket p="pf" reason={reason} setReason={(x) => { setReason(x); setErr(""); }} ticket={ticket} setTicket={(x) => { setTicket(x); setErr(""); }} />
      <p className="field help" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={go}>Send for approval</button></LayerFoot>
    </>
  );
}

function AccountForm({ b, acc, close }: { b: api.Billing; acc?: api.Account; close: () => void }) {
  const L = useLayer();
  const [rates, setRates] = useState<api.RateRow[]>([]);
  useEffect(() => { let on = true; api.ratesList().then((r) => { if (on) setRates(r.rates); }, () => undefined); return () => { on = false; }; }, []);
  const choices = b.companies.filter((c) => !c.hasAccount && c.status !== "Closed");
  const [f, setF] = useState<api.AccountForm>(() => ({
    tenantId: acc?.tenantId ?? choices[0]?.id ?? "", plan: acc?.plan ?? Object.keys(b.prices.plans)[0] ?? "", cycle: acc?.cycle ?? "Monthly", currency: acc?.currency ?? "USD", country: acc?.country ?? "US",
    method: acc?.method ?? b.methods[0] ?? "", contactName: acc?.contact.name ?? "", contactEmail: acc?.contact.email ?? "", address: acc?.address ?? "", trialDays: 0, reason: "", ticket: "",
  }));
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const set = <K extends keyof api.AccountForm>(k: K, val: api.AccountForm[K]) => { setF({ ...f, [k]: val }); setErr(""); };
  const currencies = Array.from(new Set(rates.map((r) => r.currency))).sort();
  const go = async () => {
    if (busy) return; if (!reasonTicketOk(f.reason, f.ticket)) { setErr("Give a reason of at least 15 characters and a ticket such as FIN-1234."); return; }
    setBusy(true);
    try { await api.saveAccount(f); bumpData(); close(); L.toast(acc ? "Account changed: it applies from the next invoice" : "Billing account set up"); } catch (x) { setErr(apiMessage(x, "Could not save the account")); setBusy(false); }
  };
  if (!acc && !choices.length) return <><p style={{ marginTop: 0 }}>Every active company already has a billing account.</p><LayerFoot><button className="btn btn-secondary" onClick={close}>Close</button></LayerFoot></>;
  const sel = (id: string, label: string, val: string, opts: [string, string][], on: (v: string) => void, disabled = false) => (
    <div className="field"><label htmlFor={id}>{label}</label><select className="select" id={id} value={val} disabled={disabled} onChange={(e) => on(e.target.value)}>{opts.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
  );
  return (
    <>
      {acc ? <p style={{ marginTop: 0 }}>{acc.company} ({acc.ref}). Changes apply from the next invoice; issued invoices never change.</p>
        : sel("ba-co", "Company", f.tenantId, choices.map((c) => [c.id, `${c.name} (${c.ref})`]), (x) => set("tenantId", x))}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {sel("ba-plan", "Plan", f.plan, Object.entries(b.prices.plans).map(([k, p]) => [k, `${k} (${minorMoney(p.monthly, "USD")} a month)`]), (x) => set("plan", x))}
        {sel("ba-cycle", "Billing cycle", f.cycle, [["Monthly", "Monthly"], ["Quarterly", "Quarterly"], ["Annual", "Annual"]], (x) => set("cycle", x))}
        {sel("ba-country", "Tax country", f.country, (rates.length ? rates : [{ code: f.country, country: f.country, taxType: "", taxRate: 0 } as api.RateRow]).map((r) => [r.code, r.taxType ? `${r.country} (${r.taxType} ${r.taxRate} %)` : r.country]), (x) => set("country", x))}
        {sel("ba-cur", "Currency", f.currency, (currencies.length ? currencies : [f.currency]).map((c) => [c, c]), (x) => set("currency", x))}
      </div>
      {sel("ba-method", "Payment method", f.method, b.methods.map((m) => [m, m]), (x) => set("method", x))}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="field"><label htmlFor="ba-cn">Billing contact</label><input className="input" id="ba-cn" maxLength={80} autoComplete="off" value={f.contactName} onChange={(e) => set("contactName", e.target.value)} /></div>
        <div className="field"><label htmlFor="ba-ce">Contact email</label><input className="input" id="ba-ce" type="email" maxLength={254} autoComplete="off" value={f.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} /></div>
      </div>
      <div className="field"><label htmlFor="ba-addr">Billing address</label><textarea className="input" id="ba-addr" rows={2} maxLength={300} value={f.address} onChange={(e) => set("address", e.target.value)} /></div>
      {!acc ? <div className="field"><label htmlFor="ba-trial">Trial days (0 to 90; invoicing starts after the trial)</label><input className="input num" id="ba-trial" type="number" min={0} max={90} value={f.trialDays} onChange={(e) => set("trialDays", Number(e.target.value))} style={{ width: 120 }} /></div> : null}
      <ReasonTicket p="ba" reason={f.reason} setReason={(x) => set("reason", x)} ticket={f.ticket} setTicket={(x) => set("ticket", x)} />
      <p className="field help" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={go}>{acc ? "Save changes" : "Set up account"}</button></LayerFoot>
    </>
  );
}

function IssueForm({ b, close }: { b: api.Billing; close: () => void }) {
  const L = useLayer(); const [upTo, setUpTo] = useState(today()); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [out, setOut] = useState<{ issued: string[]; skipped: string[]; emailed: number; mail: boolean } | null>(null);
  const due = b.accounts.filter((a) => a.nextPeriod <= upTo && !(a.status === "Trial" && a.trialEnds && a.trialEnds > upTo));
  const go = async () => {
    if (busy) return; setBusy(true);
    try { const r = await api.issue(upTo); setOut(r); bumpData(); L.toast(`${r.issued.length} invoice${r.issued.length === 1 ? "" : "s"} issued`); } catch (x) { setErr(apiMessage(x, "Could not issue the invoices")); }
    setBusy(false);
  };
  if (out) return (
    <>
      <p style={{ marginTop: 0 }}>{out.issued.length ? `Issued: ${out.issued.join(", ")}.` : "No invoice was due."}</p>
      {out.skipped.length ? <><div className="sectitle">Not issued</div><ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{out.skipped.map((x) => <li key={x}>{x}</li>)}</ul></> : null}
      <p className="field help">{out.mail ? `${out.emailed} of ${out.issued.length} emailed to the billing contacts. Any not emailed can be sent again from the Invoices list.` : "Email is not set up for the platform yet, so nothing was emailed: send the invoices from the Invoices list (Download) or with a payment link."}</p>
      <LayerFoot><button className="btn btn-primary" onClick={close}>Done</button></LayerFoot>
    </>
  );
  return (
    <>
      <p style={{ marginTop: 0 }}>Issues each account&apos;s invoices for the periods that start on or before this day, with today&apos;s applied exchange rate and the tax of its country locked in. Accounts on trial start after their trial.</p>
      <div className="field"><label htmlFor="iss-upto">Invoice periods starting up to</label><input className="input num" id="iss-upto" type="date" value={upTo} onChange={(e) => { setUpTo(e.target.value); setErr(""); }} style={{ width: 180 }} /></div>
      <p className="field help">{due.length ? `Due: ${due.map((a) => a.company).join(", ")}.` : "No account has a period starting by then."}</p>
      <p className="field help" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" disabled={busy || !due.length} onClick={go}>Issue invoices</button></LayerFoot>
    </>
  );
}

function FinanceForm({ b, inv, kind, close }: { b: api.Billing; inv: api.Invoice; kind: api.FinanceKind; close: () => void }) {
  const L = useLayer();
  const full = kind === "markpaid" || kind === "writeoff"; const max = kind === "refund" ? inv.paid - inv.refunded : inv.outstanding;
  const [amount, setAmount] = useState(full ? String(inv.outstanding / 100) : ""); const [reason, setReason] = useState(""); const [ticket, setTicket] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  // as the server counts it: what one person already applied alone on this invoice adds to the threshold
  const alone = b.entries.filter((e) => e.invoiceId === inv.id && !e.approvalId && e.by !== "Payment provider" && ["credit", "refund", "markpaid", "void"].includes(e.type)).reduce((n, e) => n + e.amount, 0) / 100;
  const usd = ((Number(kind === "void" ? inv.total / 100 : amount) || 0) + alone) / (inv.rate.perUsd || 1);
  const second = kind === "writeoff" || usd > b.thresholdUsd;
  const go = async () => {
    if (busy) return; if (!reasonTicketOk(reason, ticket)) { setErr("Give a reason of at least 15 characters and a ticket such as FIN-1234."); return; }
    setBusy(true);
    try { const r = await api.finance(inv.id, kind, amount, reason, ticket); bumpData(); close(); L.toast(api.isPending(r) ? "Sent for approval by a second super admin" : `${KIND_LABEL[kind]} recorded on ${inv.id}`); }
    catch (x) { setErr(apiMessage(x, "Could not record it")); setBusy(false); }
  };
  return (
    <>
      <dl className="meta-grid lstart" style={{ marginTop: 0 }}>
        {([["Invoice", `${inv.id}, ${inv.company}`], ["Total", minorMoney(inv.total, inv.currency)], ["Still due", minorMoney(inv.outstanding, inv.currency)], ["Paid, not refunded", minorMoney(inv.paid - inv.refunded, inv.currency)]] as [string, string][]).map(([k, x]) => <Fragment key={k}><dt>{k}</dt><dd className="num">{x}</dd></Fragment>)}
      </dl>
      {kind === "void" ? <p>Voiding cancels the whole invoice ({minorMoney(inv.total, inv.currency)}). It stays in the ledger.</p>
        : <div className="field"><label htmlFor="fin-amt">Amount ({inv.currency}){full ? ", the full amount still due" : `, at most ${minorMoney(max, inv.currency)}`}</label>
          <input className="input num" id="fin-amt" data-focus type="number" min={0.01} step="0.01" inputMode="decimal" readOnly={full} value={amount} onChange={(e) => { setAmount(e.target.value); setErr(""); }} style={{ width: 180 }} /></div>}
      {kind === "refund" && inv.providerPaid ? <p className="field help">Card payments are refunded through the payment provider; the rest is a ledger entry you pay back by bank transfer.</p> : null}
      <ReasonTicket p="fin" reason={reason} setReason={(x) => { setReason(x); setErr(""); }} ticket={ticket} setTicket={(x) => { setTicket(x); setErr(""); }} />
      <p className="field help" style={{ display: "flex", gap: 6, alignItems: "center" }}><Icon name={second ? "clock" : "check"} />{second ? `A second platform super admin approves this (${kind === "writeoff" ? "every write-off" : `above USD ${b.thresholdUsd.toLocaleString("en-US")}${alone ? ", counting what was already applied alone on this invoice" : ""}`}). The server makes the final check.` : `You can apply this yourself (USD ${b.thresholdUsd.toLocaleString("en-US")} or less).`}</p>
      <p className="field help" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className={"btn " + (kind === "void" || kind === "writeoff" ? "btn-danger" : "btn-primary")} disabled={busy} onClick={go}>{second ? "Send for approval" : KIND_LABEL[kind]}</button></LayerFoot>
    </>
  );
}

function PayLink({ url, email }: { url: string; email: string }) {
  const L = useLayer();
  const copy = async () => { try { await navigator.clipboard.writeText(url); L.toast("Link copied"); } catch { L.toast("Select the link and copy it", false); } };
  return (
    <>
      <p style={{ marginTop: 0 }}>Send this link to the billing contact{email ? ` (${email})` : ""}. The payment is made on the provider&apos;s page and recorded here only when the provider confirms it.</p>
      <div className="field"><label htmlFor="pl-url">Payment link</label><input className="input num" id="pl-url" data-focus readOnly value={url} onFocus={(e) => e.currentTarget.select()} /></div>
      <LayerFoot><button className="btn btn-primary" onClick={copy}><Icon name="copy" />Copy link</button></LayerFoot>
    </>
  );
}

function BillingRequests() {
  const load = useCallback(async () => (await platform.listPlatformRequests()).filter((a) => a.kind.startsWith("billing.")), []);
  return <RequestsTable id="billing-requests-api" load={load} decide={platform.decidePlatformRequest}
    note="Credits, refunds, manual payments and voids above USD 1,000, every write-off and every price-list change need a second platform super admin, each in an elevated session. Nobody approves their own request. A request expires after 24 hours." />;
}
