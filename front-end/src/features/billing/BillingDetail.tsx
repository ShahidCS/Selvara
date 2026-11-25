import { Chip, Empty, Icon, StatusChip, Table } from "@/components/ui";
import { LayerFoot } from "@/components/shell/LayerProvider";
import { useLayer } from "@/hooks/useLayer";
import { sodMessage } from "@/lib/elevation";
import { money } from "@/lib/format";
import { useGo } from "@/lib/route";
import { useModState } from "@/lib/store";
import { findCustomer } from "@/services/customers";
import * as svc from "@/features/billing/services/billing-admin";
import { useGate } from "@/components/kit/admin/ElevateGate";
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
  const lock = gate.locked ? gate.title || null : null;
  const voidIt = (invId: string) => L.openModal("Void " + invId + "?", (close) => <VoidConfirm invId={invId} name={c.name} locked={gate.locked} title={gate.title} close={close} run={async () => { close(); await act(invId, "Void"); }} />);
  // One primary action per status stays in the row; the rest are in the row menu, each disabled with its reason when locked.
  const more = (ev: React.MouseEvent, iv: any) => {
    const items: [string, string, () => void, boolean][] = [];
    if (iv.status === "Past due") items.push(["Retry payment", "refresh", () => act(iv.id, "Retry"), true], ["Write off", "alert", () => fin(iv.id, "writeoff"), true]);
    if (iv.status === "Paid") items.push(["Refund", "back", () => fin(iv.id, "refund"), true]);
    if (iv.status !== "Void") items.push(["Credit", "plus", () => fin(iv.id, "credit"), true]);
    items.push(["Resend", "ext", () => resend(iv.id), true]);
    if (iv.status === "Past due") items.push(["Download PDF", "download", () => L.toast(`Downloading ${iv.id} (demo)`), false]);
    const tail: [string, string, () => void, boolean][] = iv.status !== "Void" ? [["Void invoice", "x", () => voidIt(iv.id), true]] : [];
    const btn = ([label, icon, fn, mutates]: [string, string, () => void, boolean], close: () => void) => (
      <button key={label} role="menuitem" disabled={mutates && !!lock} title={mutates && lock ? lock : undefined} onClick={() => { close(); fn(); }}><Icon name={icon} />{label}</button>
    );
    L.popover(ev, (close) => <><div className="ph">{iv.id}</div>{items.map((x) => btn(x, close))}{tail.length ? <div className="div" /> : null}{tail.map((x) => btn(x, close))}</>, { role: "menu", label: "Actions for " + iv.id });
  };
  const nw = { whiteSpace: "nowrap" } as const;
  return (
    <div className="card">
      <div className="c-head" style={{ gap: 10 }}>
        <div><h3>Billing account</h3><div className="sub">{c.plan}, {c.region}</div></div>
        <div className="r"><StatusChip s={chip} /></div>
      </div>
      <div className="c-head" style={{ padding: "0 8px", borderTop: "1px solid var(--line)" }}>
        <div className="tabs" role="tablist">{["Current", "History"].map((t) => <button key={t} className="tab" role="tab" id={`billDt-${t}`} aria-selected={tab === t} aria-controls="billDtBody" onClick={() => setTab(t)}>{t}</button>)}</div>
      </div>
      <div className="c-body scroll" id="billDtBody" role="tabpanel" aria-labelledby={`billDt-${tab}`}>
        {tab === "Current" ? (
          <>
            <div className="grid2" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))", gap: 16 }}>
              <dl className="meta-grid"><dt>Plan</dt><dd>{c.plan}</dd><dt>Billing cycle</dt><dd>{c.cycle}</dd><dt>Currency</dt><dd>{c.currency}</dd><dt>Applicable tax</dt><dd>{rate ? rate.tax.type + " " + rate.tax.rate + "%" : "-"}</dd><dt>Next invoice</dt><dd>{c.next}</dd></dl>
              <dl className="meta-grid"><dt>Billing contact</dt><dd>{c.contact.name}</dd><dt>Email</dt><dd>{c.contact.email}</dd><dt>Address</dt><dd style={{ textAlign: "right" }}>{c.address}</dd><dt>Outstanding balance</dt><dd><BalanceFigure balance={c.balance} currency={c.currency} big /></dd></dl>
            </div>
            {c.balance ? (
              <div className="card" style={{ boxShadow: "none", background: "var(--warn-bg)", borderColor: "transparent", marginTop: 16 }}>
                <div className="c-body" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 10, color: "var(--warn-ink)" }}><Icon name="alert" /><span style={{ fontWeight: 500 }}>This account has an outstanding balance of {money(c.balance, c.currency)}. The latest invoice is past due.</span></div>
              </div>
            ) : null}
          </>
        ) : c.invoices.length ? (
          <Table cols={[{ t: "Invoice" }, { t: "Date" }, { t: "Amount", r: true }, { t: "Tax", r: true }, { t: "Status" }, { t: "Actions" }]}>
            {c.invoices.map((iv: any) => (
              <tr key={iv.id}>
                <td className="strong num" style={nw}>{iv.id}</td><td style={nw}>{iv.date}</td><td className="r num" style={nw}>{money(iv.amount, iv.cur)}</td><td className="r num" style={nw}>{money(iv.tax, iv.cur)}</td><td><StatusChip s={iv.status} /></td>
                <td className="r" style={nw}><div className="btngrp no-print" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                  {iv.status === "Past due"
                    ? <button className="btn btn-secondary sm" aria-label={`Mark ${iv.id} paid (manual override)`} disabled={gate.locked} title={gate.title} onClick={() => fin(iv.id, "markpaid")}><Icon name="check" />Mark paid</button>
                    : <button className="btn btn-ghost sm" aria-label={`Download ${iv.id} as PDF`} onClick={() => L.toast(`Downloading ${iv.id} (demo)`)}><Icon name="download" />PDF</button>}
                  <button className="btn btn-ghost sm" aria-label={`More actions for ${iv.id}`} aria-haspopup="menu" onClick={(e) => more(e, iv)}><Icon name="more" /></button>
                </div></td>
              </tr>
            ))}
          </Table>
        ) : <Empty icon="billing" title="No invoices yet">This customer has not been invoiced{c.status === "Trial" ? ", currently on trial." : "."}</Empty>}
      </div>
    </div>
  );
}

/** Outstanding balance with its state in words and an icon, not colour alone. */
export function BalanceFigure({ balance, currency, big }: { balance: number; currency: string; big?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
      <span className="num" style={{ color: balance ? "var(--bad-ink)" : "var(--ink)", fontSize: big ? 16 : undefined }}>{money(balance || 0, currency)}</span>
      {balance ? <Chip cls="bad" icon="alert">Past due</Chip> : <Chip cls="ok" icon="check">Paid up</Chip>}
    </span>
  );
}

/** Voiding cancels an invoice: confirm first. The service records the audit entry. */
function VoidConfirm({ invId, name, locked, title, close, run }: { invId: string; name: string; locked: boolean; title?: string; close: () => void; run: () => void }) {
  return (
    <>
      <p style={{ margin: "0 0 8px" }}>Void <b className="num">{invId}</b> for {name}? The invoice is cancelled and can no longer be paid, credited or refunded.</p>
      <p className="field help" style={{ margin: 0 }}>It stays in the invoice history, and the void is written to the Admin Console Audit Logs.</p>
      <LayerFoot><button className="btn btn-secondary" data-focus onClick={close}>Keep invoice</button><button className="btn btn-danger" disabled={locked} title={title} onClick={run}><Icon name="x" />Void invoice</button></LayerFoot>
    </>
  );
}
