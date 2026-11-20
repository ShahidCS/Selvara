import { useEffect } from "react";
import { API_ON } from "@/lib/rbac";
import { ApiCustomers } from "./ApiCustomers";
import { Empty, Icon, Page } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { useApp, useData, useModState, getModState, setModState } from "@/lib/store";
import { customersCanManage, findCustomer } from "@/services/customers";
import { CustomerProfile } from "./CustomerProfile";
import { CustomerSearch } from "./CustomerSearch";
import { ElevateGateBanner, useGate } from "@/components/kit/admin/ElevateGate";
import { OnboardForm } from "./Onboard";

/** Prototype: REND.customers + custBody/custPick/custClear. Also used by Billing's "Onboard customer" via the `customers.onboardPending` flag. */
function DemoCustomersModule() {
  useData(); const L = useLayer(); const gate = useGate();
  const allowed = customersCanManage(useApp((s) => s.role));
  const [selId, setSel] = useModState<string | null>("customers.sel", null);
  const [recent, setRecent] = useModState<string[]>("customers.recent", []);
  const openOnboard = () => L.openModal("Onboard a customer", (close) => <OnboardForm close={close} />);
  useEffect(() => {
    if (allowed && getModState("customers.onboardPending", false)) { setModState("customers.onboardPending", false); if (gate.locked) return; L.openModal("Onboard a customer", (close) => <OnboardForm close={close} />); }
  }, [allowed, L, gate.locked]);
  if (!allowed) return <Page mod="customers"><Empty icon="alert" title="Access restricted">Your role cannot manage customers.</Empty></Page>;
  const c = selId ? findCustomer(selId) : null;
  const pick = (id: string) => { setSel(id); setRecent([id, ...recent.filter((x) => x !== id)].slice(0, 4)); };
  const recents = recent.map((id) => findCustomer(id)).filter(Boolean);
  return (
    <Page mod="customers" acts={<>{c ? <button className="btn btn-secondary" onClick={() => setSel(null)}><Icon name="x" />Clear</button> : null}<button className="btn btn-primary" onClick={openOnboard} disabled={gate.locked} title={gate.title}><Icon name="plus" />Onboard customer</button></>}>
      <ElevateGateBanner />
      <div className="card" style={{ flex: "1 1 auto" }}>
        <div className="c-body" id="custBody" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <CustomerSearch key={c ? c.id : "none"} onPick={pick} />
          {c ? <CustomerProfile c={c} /> : (
            <>
              <Empty icon="customers" title="Search for a customer to view usage">Nothing is shown until you select a customer. Start typing a name, customer ID or billing email above.</Empty>
              {recents.length ? <div><div className="sectitle">Recently viewed</div><div className="btngrp">{recents.map((r) => <button key={r.id} className="fchip" onClick={() => pick(r.id)}><Icon name="customers" />{r.name}</button>)}</div></div> : null}
            </>
          )}
        </div>
      </div>
    </Page>
  );
}

/** Production (API mode) shows the server's data (slice 3a, decision D4); the demonstration keeps its own screen. */
export default function CustomersModule() { return API_ON ? <ApiCustomers /> : <DemoCustomersModule />; }
