import { Empty, Icon, StatusChip, Table } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { sodMessage } from "@/lib/elevation";
import { money } from "@/lib/format";
import { useGo } from "@/lib/route";
import { useModState } from "@/lib/store";
import { findCustomer } from "@/services/customers";
import * as svc from "@/services/billing-admin";
import { useGate } from "../admin/ElevateGate";
import { FinanceForm } from "./BillingModals";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Prototype: billingDetail (Current / History tabs), invoiceAction, resendInvoice. `id` comes from the URL and is looked up in CUSTOMERS. */
export function BillingDetail({ id }: { id: string }) {
  const L = useLayer(); const go = useGo(); const gate = useGate(); const [tab, setTab] = useModState<string>("billing.dt", "Current");
  const c = findCustomer(id);
  if (!c) return <Empty icon="alert" title="Page not found" action={<button className="btn btn-primary" onClick={() => go("/ws/overview")}>Back to Overview</button>}>That route doesn&apos;t exist or has moved.</Empty>;
  const rate = svc.rateForCurrency(c.currency);
  const act = async (invId: string, action: svc.InvoiceAction) => {
    try {
      const r = await svc.invoiceAction(id, invId, action); // the service writes the audit entry
      L.toast(action === "Retry" ? "Payment retry queued for " + r.id : r.id + " voided");
    } catch (e) { L.toast(sodMessage(e, "That invoice action could not be completed"), false); }
  };
  const fin = (invId: string, kind: svc.FinanceKind) => L.openModal(svc.FINANCE_LABEL[kind] + " " + invId, (close) => <FinanceForm cid={id} invId={invId} kind={kind} close={close} />);
  const resend = async (invId: string) => {
    try { const r = await svc.resendInvoice(id, invId); L.toast("Invoice " + invId + " resent to " + r.email); }
    catch (e) { L.toast(sodMessage(e, "Could not resend the invoice"), false); }
  };
  const chip = c.status === "Past due" ? "Past due" : c.status === "Trial" ? "Trial" : "Active";
  return (
    <div className="card" style={{ flex: "1 1 auto" }}>
      <div className="c-head" style={{ gap: 10 }}>
        <button className="btn btn-ghost sm" onClick={() => go("/admin/billing")}><Icon name="back" />Back</button>
        <div><h3>{c.name}</h3><div className="sub">{c.plan}, {c.region}</div></div>
        <div className="r"><StatusChip s={chip} /></div>
      </div>
      <div className="c-head" style={{ padding: "0 8px", borderTop: "1px solid var(--line)" }}>
        <div className="tabs" role="tablist">{["Current", "History"].map((t) => <button key={t} className="tab" role="tab" id={`billDt-${t}`} aria-selected={tab === t} aria-controls="billDtBody" onClick={() => setTab(t)}>{t}</button>)}</div>
      </div>
      <div className="c-body scroll" id="billDtBody" role="tabpanel" aria-labelledby={`billDt-${tab}`}>
        {tab === "Current" ? (
          <>
            <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 760 }}>
              <dl className="meta-grid"><dt>Plan</dt><dd>{c.plan}</dd><dt>Billing cycle</dt><dd>{c.cycle}</dd><dt>Currency</dt><dd>{c.currency}</dd><dt>Applicable tax</dt><dd>{rate ? rate.tax.type + " " + rate.tax.rate + "%" : "-"}</dd><dt>Next invoice</dt><dd>{c.next}</dd></dl>
              <dl className="meta-grid"><dt>Billing contact</dt><dd>{c.contact.name}</dd><dt>Email</dt><dd>{c.contact.email}</dd><dt>Address</dt><dd style={{ textAlign: "right" }}>{c.address}</dd><dt>Outstanding balance</dt><dd className="num" style={{ color: c.balance ? "var(--bad-ink)" : "var(--ok-ink)", fontSize: 16 }}>{money(c.balance, c.currency)}</dd></dl>
            </div>
            {c.balance ? (
              <div className="card" style={{ boxShadow: "none", background: "var(--warn-bg)", borderColor: "transparent", marginTop: 16, maxWidth: 760 }}>
                <div className="c-body" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 10, color: "var(--warn-ink)" }}><Icon name="alert" /><span style={{ fontWeight: 500 }}>This account has an outstanding balance of {money(c.balance, c.currency)}. The latest invoice is past due.</span></div>
              </div>
            ) : null}
          </>
        ) : c.invoices.length ? (
          <Table cols={[{ t: "Invoice" }, { t: "Date" }, { t: "Amount", r: true }, { t: "Tax", r: true }, { t: "Status" }, { t: "" }]}>
            {c.invoices.map((iv: any) => (
              <tr key={iv.id}>
                <td className="strong num">{iv.id}</td><td>{iv.date}</td><td className="r num">{money(iv.amount, iv.cur)}</td><td className="r num">{money(iv.tax, iv.cur)}</td><td><StatusChip s={iv.status} /></td>
                <td className="r"><div className="btngrp no-print" style={{ justifyContent: "flex-end" }}>
                  {iv.status === "Past due" ? <>
                    <button className="btn btn-ghost sm" aria-label={`Mark ${iv.id} paid (manual override)`} disabled={gate.locked} title={gate.title} onClick={() => fin(iv.id, "markpaid")}><Icon name="check" />Mark paid</button>
                    <button className="btn btn-ghost sm" aria-label={`Retry payment for ${iv.id}`} disabled={gate.locked} title={gate.title} onClick={() => act(iv.id, "Retry")}><Icon name="refresh" />Retry</button>
                    <button className="btn btn-ghost sm" aria-label={`Write off ${iv.id}`} disabled={gate.locked} title={gate.title} onClick={() => fin(iv.id, "writeoff")}><Icon name="alert" />Write off</button></> : null}
                  {iv.status === "Paid" ? <button className="btn btn-ghost sm" aria-label={`Refund ${iv.id}`} disabled={gate.locked} title={gate.title} onClick={() => fin(iv.id, "refund")}><Icon name="back" />Refund</button> : null}
                  {iv.status !== "Void" ? <button className="btn btn-ghost sm" aria-label={`Credit ${iv.id}`} disabled={gate.locked} title={gate.title} onClick={() => fin(iv.id, "credit")}><Icon name="plus" />Credit</button> : null}
                  {iv.status !== "Void" ? <button className="btn btn-ghost sm" aria-label={`Void ${iv.id}`} disabled={gate.locked} title={gate.title} onClick={() => act(iv.id, "Void")}><Icon name="x" />Void</button> : null}
                  <button className="btn btn-ghost sm" aria-label={`Resend ${iv.id}`} disabled={gate.locked} title={gate.title} onClick={() => resend(iv.id)}><Icon name="ext" />Resend</button>
                  <button className="btn btn-ghost sm" aria-label={`Download ${iv.id} as PDF`} onClick={() => L.toast(`Downloading ${iv.id} (demo)`)}><Icon name="download" />PDF</button>
                </div></td>
              </tr>
            ))}
          </Table>
        ) : <Empty icon="billing" title="No invoices yet">This customer has not been invoiced{c.status === "Trial" ? ", currently on trial." : "."}</Empty>}
      </div>
    </div>
  );
}
