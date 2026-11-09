import { useState } from "react";
import { Chip } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { LayerFoot } from "@/components/shell/LayerProvider";
import { wsLog } from "@/lib/audit";
import { bumpData } from "@/lib/store";
import { money } from "@/lib/format";
import { clampText } from "@/lib/security";
import * as svc from "@/services/billing";

/** Prototype: billwsPayment / billwsSavePayment. Display values only (brand, last 4, expiry, name): never a card number or CVC. */
export function PaymentForm({ close }: { close: () => void }) {
  const L = useLayer(); const p = svc.SUBSCRIPTION.payment;
  const [brand, setBrand] = useState(p.brand); const [last4, setLast4] = useState(p.last4); const [exp, setExp] = useState(p.exp); const [name, setName] = useState(p.name);
  const save = async () => {
    try {
      const r = await svc.savePayment({ brand, last4: last4.replace(/\D/g, "").slice(0, 4), exp: clampText(exp, 7), name: clampText(name, 80) });
      wsLog("billing.payment.updated", r.brand + " ···· " + r.last4, "System"); close(); L.toast("Payment method updated"); bumpData();
    } catch { L.toast("Could not update the payment method", false); }
  };
  return (
    <>
      <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="field"><label htmlFor="pm-brand">Card type</label><select className="select" id="pm-brand" value={brand} onChange={(e) => setBrand(e.target.value)}>{svc.CARD_BRANDS.map((b) => <option key={b}>{b}</option>)}</select></div>
        <div className="field"><label htmlFor="pm-last4">Last 4 digits</label><input className="input num" id="pm-last4" data-focus maxLength={4} inputMode="numeric" autoComplete="off" value={last4} onChange={(e) => setLast4(e.target.value)} /></div>
        <div className="field"><label htmlFor="pm-exp">Expiry</label><input className="input" id="pm-exp" maxLength={7} autoComplete="off" value={exp} onChange={(e) => setExp(e.target.value)} /></div>
        <div className="field"><label htmlFor="pm-name">Billed to</label><input className="input" id="pm-name" maxLength={80} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} /></div>
      </div>
      <p className="field help">Synthetic for the prototype. Do not enter a real card number.</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></LayerFoot>
    </>
  );
}

/** Prototype: billwsManagePlan / billwsDoChangePlan. */
export function PlanForm({ close }: { close: () => void }) {
  const L = useLayer(); const s = svc.SUBSCRIPTION;
  const names = Object.keys(svc.PLANS);
  const [pick, setPick] = useState(s.plan);
  const go = async () => {
    try {
      const r = await svc.changePlan(pick);
      if (!r) return;
      if (!r.changed) { close(); return; }
      wsLog("billing.plan.changed", "→ " + r.plan, "System"); close(); L.toast("Plan changed to " + r.plan); bumpData();
    } catch { L.toast("Could not change the plan", false); }
  };
  return (
    <>
      <div role="radiogroup" aria-label="Plan">
        {names.map((pn) => {
          const p = svc.PLANS[pn]; const cur = pn === s.plan;
          return (
            <label key={pn} style={{ display: "block", border: `1px solid ${cur ? "var(--accent)" : "var(--line,#e5e7eb)"}`, borderRadius: 10, padding: 12, marginBottom: 8, cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="radio" name="planpick" value={pn} checked={pick === pn} onChange={() => setPick(pn)} />
                <span style={{ fontWeight: 600 }}>{pn}</span>{cur ? <Chip cls="ok" icon="check">Current</Chip> : null}
                <span style={{ marginLeft: "auto" }} className="num">{money(p.price)}/mo</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6, paddingLeft: 24 }}>{p.seats} seats · {p.modules.length} modules included</div>
            </label>
          );
        })}
      </div>
      <p className="field help">Changing plan takes effect next billing cycle. Downgrades may require reducing seats or modules first.</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={go}>Change plan</button></LayerFoot>
    </>
  );
}
