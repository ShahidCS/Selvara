import { useState } from "react";
import { Chip, Icon, StatusChip, Switch } from "@/components/ui";
import { LayerFoot } from "@/components/shell/LayerProvider";
import { useLayer } from "@/hooks/useLayer";
import { ELEV_REASON_MIN, sodMessage } from "@/lib/elevation";
import { useGate } from "@/components/kit/admin/ElevateGate";
import { money, num } from "@/lib/format";
import { PLANS } from "@/services/billing";
import * as svc from "@/services/customers";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Usage against a plan limit. Near and over the limit are said in words with an icon, never by the bar colour alone. */
export function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit ? Math.min(100, Math.round(used / limit * 100)) : 0; const over = !!limit && used > limit; const near = !over && pct >= 85;
  const col = over ? "var(--bad-ink)" : near ? "var(--warn-ink)" : "var(--accent)";
  return (
    <div style={{ marginBottom: 11 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 12.5, marginBottom: 4 }}>
        <span style={{ color: "var(--ink-2)" }}>{label}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {over ? <Chip cls="bad" icon="alert">Over plan</Chip> : near ? <Chip cls="warn" icon="clock">Near limit</Chip> : null}
          <span className="num" style={{ color: "var(--ink-2)" }}>{num(used)} / {num(limit)}</span>
        </span>
      </div>
      <div className="bar-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={`${num(used)} of ${num(limit)}${over ? ", over plan" : near ? ", near limit" : ""}`}><span className="bar-fill" style={{ width: `${Math.max(3, pct)}%`, background: col }} /></div>
    </div>
  );
}

/** Prototype: custChangePlan / custDoChangePlan. */
export function ChangePlanForm({ id, close }: { id: string; close: () => void }) {
  const L = useLayer(); const gate = useGate(); const c = svc.custInit(svc.findCustomer(id)); const [pick, setPick] = useState<string>(c.plan); const [reason, setReason] = useState("");
  const used = Number(c.usage?.seatsUsed) || 0; const tooSmall = PLANS[pick].seats < used;
  // The same conditions that disable "Apply plan", said in words under the form (a disabled button cannot show its tooltip to keyboard or touch users).
  const why = gate.locked ? "Elevate to make changes: plan changes need an active elevated session." : tooSmall ? "" : pick === c.plan ? "Choose a different plan to apply." : reason.trim().length < ELEV_REASON_MIN ? `Enter a reason of at least ${ELEV_REASON_MIN} characters.` : "";
  const blocked = tooSmall || !!why;
  const apply = async () => {
    try {
      const r = await svc.changePlan(id, pick, reason);
      close(); L.toast(r.name + " moved to " + pick + " plan");
    } catch (x) { L.toast(sodMessage(x, "Could not change the plan"), false); }
  };
  return (
    <>
      <div role="radiogroup" aria-label="Plan" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {Object.keys(PLANS).map((pn) => {
          const p = PLANS[pn];
          return (
            <label key={pn} className="listrow" style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "11px 12px", border: `1px solid ${c.plan === pn ? "var(--accent)" : "var(--line)"}`, borderRadius: 10, cursor: "pointer" }}>
              <input type="radio" name="planpick" value={pn} checked={pick === pn} onChange={() => setPick(pn)} style={{ marginTop: 3 }} />
              <div><div style={{ fontWeight: 600 }}>{pn} · {money(p.price)}/mo</div><div style={{ fontSize: 12, color: "var(--muted)" }}>{p.seats} seats · {p.modules.length} modules · {num(p.limits.screenings)} screenings/mo</div></div>
            </label>
          );
        })}
      </div>
      <p className="field help" style={{ marginTop: 10 }}>Changing the plan updates seat and usage limits and the default module set. Add-ons already enabled are kept. A plan with fewer seats than are in use ({used}) is blocked.</p>
      {tooSmall ? <p className="field help" role="alert" style={{ color: "var(--bad-ink)" }}>{pick} includes {PLANS[pick].seats} seats but {used} are in use. Remove users before downgrading.</p> : null}
      <div className="field"><label htmlFor="planReason">Reason (at least {ELEV_REASON_MIN} characters, recorded in the audit log)</label><textarea className="input" id="planReason" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      {why ? <p className="field help" id="planWhy" style={{ margin: "8px 0 0" }}>{why}</p> : null}
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={apply} disabled={blocked} aria-describedby={why ? "planWhy" : undefined} title={gate.title || (tooSmall ? "Downgrade below seats in use is blocked" : undefined)}>Apply plan</button></LayerFoot>
    </>
  );
}

/** Prototype: custPlanTab. */
export function PlanTab({ c }: { c: any }) {
  const L = useLayer(); const gate = useGate(); svc.custInit(c); const p = svc.planOf(c);
  const toggle = async (mod: string) => {
    try { await svc.toggleModule(c.id, mod); }
    catch (x) { L.toast(sodMessage(x, "Could not change the module"), false); }
  };
  return (
    <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
      <div><div className="sectitle" style={{ marginTop: 0 }}>Plan</div>
        <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}><span style={{ fontSize: 18, fontWeight: 600 }}>{c.plan}</span><StatusChip s={c.status} /></div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>{money(p.price)}/mo base · {c.cycle} billing · {c.seatLimit} seats · {c.modules.length} modules</div>
          <button className="btn btn-secondary sm" style={{ marginTop: 10 }} disabled={gate.locked} title={gate.title} onClick={() => L.openModal("Change plan — " + c.name, (close) => <ChangePlanForm id={c.id} close={close} />)}><Icon name="edit" />Change plan</button>
        </div>
        <div className="sectitle">Usage against plan limits</div>
        <Meter label="Seats" used={c.usage.seatsUsed} limit={c.seatLimit} />
        <Meter label="Screenings / mo" used={c.usage.screenings} limit={c.limits.screenings} />
        <Meter label="Identity verifications / mo" used={c.usage.idv} limit={c.limits.idv} />
        <Meter label="Storage (GB)" used={c.usage.storageGB} limit={c.limits.storageGB} />
      </div>
      <div><div className="sectitle" style={{ marginTop: 0 }}>Module entitlements</div>
        <p className="field help" style={{ margin: "0 0 8px" }}>Choose which modules this customer can use. Modules in {c.plan} are on by default; others are chargeable add-ons.</p>
        {gate.locked ? <p className="field help" style={{ margin: "0 0 8px" }}>Elevate to make changes: switches are locked until you have an active elevated session.</p> : null}
        <div role="group" aria-label="Module entitlements" style={{ display: "flex", flexDirection: "column" }}>
          {svc.PLAN_MODULES.map((mod, i) => {
            const on = c.modules.includes(mod); const inPlan = p.modules.includes(mod);
            return (
              <div key={mod} style={{ borderBottom: "1px solid var(--line)" }}>
                <Switch id={`ent-${i}`} label={mod} checked={on} disabled={gate.locked} onChange={() => toggle(mod)} hint={inPlan ? `In ${c.plan} plan` : on ? "Add-on, chargeable" : "Available as a chargeable add-on"} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
