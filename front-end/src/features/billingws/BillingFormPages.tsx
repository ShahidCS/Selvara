import { useEffect, useRef, useState, type FormEvent } from "react";
import { Chip, Empty, FormActions, FormMessage, FormSection, Page } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";
import { wsLog } from "@/lib/audit";
import { bumpData, useApp } from "@/lib/store";
import { useGo } from "@/lib/route";
import { money } from "@/lib/format";
import { clampText } from "@/lib/security";
import * as svc from "@/services/billing";

const LIST = "/ws/billingws";
const back = { href: LIST, label: "Billing & Invoices" };
const Denied = ({ title }: { title: string }) => <Page title={title} back={back}><Empty icon="billing" title="You cannot do this">Only an admin or owner can change the plan or the payment method.</Empty></Page>;

/** `/ws/billingws/plan`: compare and change the plan. It takes effect next billing cycle. */
export function PlanPage() {
  const role = useApp((s) => s.role);
  const L = useLayer(); const go = useGo(); const s = svc.SUBSCRIPTION;
  const names = Object.keys(svc.PLANS);
  const [pick, setPick] = useState(s.plan); const [busy, setBusy] = useState(false);
  const dirty = !busy && pick !== s.plan;
  const { allowLeave } = useUnsavedGuard(dirty, L);
  if (!svc.billingCanManage(role)) return <Denied title="Change plan" />;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      const r = await svc.changePlan(pick);
      allowLeave();
      if (r && r.changed) { wsLog("billing.plan.changed", "→ " + r.plan, "System"); L.toast("Plan changed to " + r.plan); bumpData(); }
      go(LIST);
    } catch { setBusy(false); L.toast("Could not change the plan", false); }
  };
  return (
    <Page title="Change plan" sub="Changing plan takes effect next billing cycle. Downgrades may require reducing seats or modules first." back={back}>
      <div className="scroll rec-scroll"><form className="rec-form" onSubmit={submit} noValidate>
        <FormSection n={1} title="Plan" note={`You are on ${s.plan}, billed ${s.cycle === "Annual" ? "annually" : s.cycle === "Monthly" ? "monthly" : s.cycle.toLowerCase()}.`}>
          <div role="radiogroup" aria-label="Plan">
            {names.map((pn) => {
              const p = svc.PLANS[pn]; const cur = pn === s.plan;
              return (
                <label key={pn} style={{ display: "block", border: `1px solid ${pick === pn ? "var(--accent)" : "var(--line)"}`, borderRadius: 10, padding: 12, marginBottom: 8, cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="radio" name="planpick" value={pn} checked={pick === pn} onChange={() => setPick(pn)} style={{ accentColor: "var(--accent)" }} />
                    <span style={{ fontWeight: 600 }}>{pn}</span>{cur ? <Chip cls="ok" icon="check">Current</Chip> : null}
                    <span style={{ marginLeft: "auto" }} className="num">{money(p.price)}/mo</span>
                  </div>
                  <div style={{ fontSize: ".75rem", color: "var(--muted)", marginTop: 6, paddingLeft: 24 }}>{p.seats} seats · {p.modules.length} modules included</div>
                </label>
              );
            })}
          </div>
        </FormSection>
        <FormActions><button type="button" className="btn btn-secondary" onClick={() => go(LIST)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy}>Change plan</button></FormActions>
      </form></div>
    </Page>
  );
}

/** `/ws/billingws/payment`: display values only (brand, last 4, expiry, name), never a card number or CVC. */
export function PaymentPage() {
  const role = useApp((s) => s.role);
  const L = useLayer(); const go = useGo(); const p = svc.SUBSCRIPTION.payment;
  const [brand, setBrand] = useState(p.brand); const [last4, setLast4] = useState(p.last4); const [exp, setExp] = useState(p.exp); const [name, setName] = useState(p.name);
  const [busy, setBusy] = useState(false); const [errs, setErrs] = useState<{ last4?: string; exp?: string }>({});
  const expRef = useRef<HTMLInputElement>(null);
  const dirty = !busy && (brand !== p.brand || last4 !== p.last4 || exp !== p.exp || name !== p.name);
  const { allowLeave } = useUnsavedGuard(dirty, L);
  const ref = useRef<HTMLInputElement>(null); useEffect(() => { ref.current?.focus(); }, []);
  if (!svc.billingCanManage(role)) return <Denied title="Update payment method" />;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const bad: { last4?: string; exp?: string } = {};
    if (!/^\d{4}$/.test(last4.trim())) bad.last4 = "Enter exactly 4 digits.";
    const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(exp.trim());
    if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) bad.exp = "Enter the expiry as MM / YY, for example 08 / 28.";
    setErrs(bad);
    if (bad.last4) { ref.current?.focus(); return; }
    if (bad.exp) { expRef.current?.focus(); return; }
    setBusy(true);
    try {
      const r = await svc.savePayment({ brand, last4: last4.replace(/\D/g, "").slice(0, 4), exp: clampText(m ? `${m[1]} / ${m[2]}` : exp, 7), name: clampText(name, 80) });
      wsLog("billing.payment.updated", r.brand + " ···· " + r.last4, "System"); allowLeave(); L.toast("Payment method updated"); bumpData(); go(LIST);
    } catch { setBusy(false); L.toast("Could not update the payment method", false); }
  };
  return (
    <Page title="Update payment method" sub="Synthetic for the prototype. Do not enter a real card number." back={back}>
      <div className="scroll rec-scroll"><form className="rec-form" onSubmit={submit} noValidate>
        <FormMessage kind="note">Only the card type, the last four digits, the expiry and the name are kept. Never enter a full card number or a security code.</FormMessage>
        <FormSection n={1} title="Card" note="How it appears on your invoices.">
          <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field"><label htmlFor="pm-brand">Card type</label><select className="select" id="pm-brand" value={brand} onChange={(e) => setBrand(e.target.value)}>{svc.CARD_BRANDS.map((b) => <option key={b}>{b}</option>)}</select></div>
            <div className="field"><label htmlFor="pm-last4">Last 4 digits</label><input ref={ref} className="input num" id="pm-last4" maxLength={4} inputMode="numeric" pattern="[0-9]{4}" placeholder="4242" autoComplete="off" value={last4} onChange={(e) => setLast4(e.target.value)} aria-invalid={!!errs.last4} aria-describedby={errs.last4 ? "pm-last4-err" : undefined} />
              {errs.last4 ? <FormMessage id="pm-last4-err">{errs.last4}</FormMessage> : null}</div>
            <div className="field"><label htmlFor="pm-exp">Expiry</label><input ref={expRef} className="input num" id="pm-exp" maxLength={7} placeholder="MM / YY" autoComplete="off" value={exp} onChange={(e) => setExp(e.target.value)} aria-invalid={!!errs.exp} aria-describedby={errs.exp ? "pm-exp-err" : undefined} />
              {errs.exp ? <FormMessage id="pm-exp-err">{errs.exp}</FormMessage> : null}</div>
            <div className="field"><label htmlFor="pm-name">Billed to</label><input className="input" id="pm-name" maxLength={80} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} /></div>
          </div>
        </FormSection>
        <FormActions><button type="button" className="btn btn-secondary" onClick={() => go(LIST)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy}>Save</button></FormActions>
      </form></div>
    </Page>
  );
}
