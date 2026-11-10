import { Empty, Icon, Page } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { useGo } from "@/lib/route";
import { setModState, useApp, useData } from "@/lib/store";
import * as svc from "@/features/billing/services/billing-admin";
import { findCustomer } from "@/services/customers";
import { BillingDetail } from "./BillingDetail";
import { BillingList } from "./BillingList";
import { IssueInvoicesBody, PricingForm } from "./BillingModals";
import { ElevateGateBanner, useGate } from "@/components/kit/admin/ElevateGate";
import { PendingApprovals } from "@/components/kit/admin/PendingApprovals";

/** Prototype: REND.billing(m, param). `/admin/billing` = list + side panel; `/admin/billing/<customerId>` = full billing for one customer. */
export default function BillingModule({ param }: { param?: string | null }) {
  useData(); const L = useLayer(); const go = useGo(); const gate = useGate();
  const allowed = svc.billingCanManage(useApp((s) => s.role));
  if (!allowed) return <Page mod="billing"><Empty icon="alert" title="Access restricted">Your role cannot manage billing.</Empty></Page>;
  const panel = <PendingApprovals prefix="billing." title="Pending approvals" run={svc.decideFinance} withdraw={svc.withdrawFinance} />;
  if (param) {
    if (!findCustomer(param)) return <div className="page"><Empty icon="alert" title="Page not found" action={<button className="btn btn-primary" onClick={() => go("/ws/overview")}>Back to Overview</button>}>That route doesn&apos;t exist or has moved.</Empty></div>;
    return <Page mod="billing" acts={<button className="btn btn-secondary no-print" onClick={() => window.print()}><Icon name="download" />Print</button>}><ElevateGateBanner />{panel}<BillingDetail id={param} /></Page>;
  }
  return (
    <Page mod="billing" acts={<>
      <button className="btn btn-secondary" disabled={gate.locked} title={gate.title} onClick={() => { setModState("customers.onboardPending", true); go("/admin/customers"); }}><Icon name="plus" />Onboard customer</button>
      <button className="btn btn-secondary" disabled={gate.locked} title={gate.title} onClick={() => L.openModal("Pricing & plans", (close) => <PricingForm close={close} />)}><Icon name="rates" />Pricing &amp; plans</button>
      <button className="btn btn-secondary" onClick={() => L.toast("Export billing (demo)")}><Icon name="download" />Export</button>
      <button className="btn btn-primary" disabled={gate.locked} title={gate.title} onClick={() => L.openModal("Issue monthly invoices", (close) => <IssueInvoicesBody close={close} />)}><Icon name="billing" />Issue invoices</button>
    </>}>
      <ElevateGateBanner />
      {panel}
      <BillingList />
    </Page>
  );
}
