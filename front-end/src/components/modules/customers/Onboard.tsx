import { useState } from "react";
import { Icon } from "@/components/ui";
import { LayerFoot } from "@/components/shell/LayerProvider";
import { useLayer } from "@/hooks/useLayer";
import { ELEV_REASON_MIN, sodMessage } from "@/lib/elevation";
import { useGate } from "@/components/kit/admin/ElevateGate";
import { setModState, getModState } from "@/lib/store";
import { isEmail } from "@/lib/security";
import { PLANS } from "@/services/billing";
import * as svc from "@/services/customers";

/** Prototype: onboardCustomer / onboardSyncModules / onboardSubmit. Opens as a modal; `go('/admin/customers')` is done by the caller when needed. */
export function OnboardForm({ close }: { close: () => void }) {
  const L = useLayer(); const gate = useGate(); const [reason, setReason] = useState("");
  const [name, setName] = useState(""); const [region, setRegion] = useState(svc.ONBOARD_REGIONS[0]); const [plan, setPlan] = useState("Professional");
  const [cur, setCur] = useState(svc.ONBOARD_CURRENCIES[0]); const [bill, setBill] = useState(svc.ONBOARD_BILLING_METHODS[0]); const [cycle, setCycle] = useState("Annual");
  const [an, setAn] = useState(""); const [ae, setAe] = useState("");
  const [mods, setMods] = useState<string[]>(PLANS.Professional.modules.slice());
  const [err, setErr] = useState<string | null>(null);
  const syncMods = (p: string) => setMods((PLANS[p] || PLANS.Professional).modules.slice());
  const submit = async () => {
    const n = name.trim(), a = an.trim(), e = ae.trim();
    const miss: string[] = []; if (!n) miss.push("company name"); if (!a) miss.push("admin name"); if (!e || !isEmail(e)) miss.push("a valid admin email");
    if (reason.trim().length < ELEV_REASON_MIN) miss.push("a reason of at least " + ELEV_REASON_MIN + " characters");
    if (miss.length) { setErr("Please provide " + miss.join(", ") + "."); return; }
    try {
      const c = await svc.onboard({ name: n, adminName: a, adminEmail: e, region, plan, currency: cur, cycle, billingMethod: bill, modules: svc.PLAN_MODULES.filter((m) => mods.includes(m)), reason });
      close(); L.toast(c.name + " onboarded, invite sent to " + c.contact.email);
      setModState("customers.sel", c.id);
      setModState("customers.recent", [c.id, ...getModState<string[]>("customers.recent", []).filter((x) => x !== c.id)].slice(0, 4));
    } catch (x) { L.toast(sodMessage(x, "Could not create the customer"), false); }
  };
  return (
    <>
      <p className="field help" style={{ marginBottom: 14 }}>Creates a new tenant with a company admin. The admin receives an invite and enrols MFA at first sign-in. Region is locked at creation for data-residency.</p>
      <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="field"><label htmlFor="oName">Company name</label><input className="input" id="oName" placeholder="e.g. Globex Pay" data-focus maxLength={100} value={name} onChange={(x) => setName(x.target.value)} /></div>
        <div className="field"><label htmlFor="oRegion">Region (data residency)</label><select className="select" id="oRegion" value={region} onChange={(x) => setRegion(x.target.value)}>{svc.ONBOARD_REGIONS.map((r) => <option key={r}>{r}</option>)}</select></div>
        <div className="field"><label htmlFor="oPlan">Plan</label><select className="select" id="oPlan" value={plan} onChange={(x) => { setPlan(x.target.value); syncMods(x.target.value); }}>{svc.ONBOARD_PLANS.map((p) => <option key={p}>{p}</option>)}</select></div>
        <div className="field"><label htmlFor="oCur">Billing currency</label><select className="select" id="oCur" value={cur} onChange={(x) => setCur(x.target.value)}>{svc.ONBOARD_CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="field"><label htmlFor="oBill">Billing method</label><select className="select" id="oBill" value={bill} onChange={(x) => setBill(x.target.value)}>{svc.ONBOARD_BILLING_METHODS.map((b) => <option key={b}>{b}</option>)}</select></div>
        <div className="field"><label htmlFor="oCycle">Billing cycle</label><select className="select" id="oCycle" value={cycle} onChange={(x) => setCycle(x.target.value)}>{svc.ONBOARD_CYCLES.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="field" style={{ gridColumn: "1/-1" }}><label htmlFor="oAdminName">Company admin name</label><input className="input" id="oAdminName" placeholder="Full name" maxLength={100} value={an} onChange={(x) => setAn(x.target.value)} /></div>
        <div className="field" style={{ gridColumn: "1/-1" }}><label htmlFor="oAdminEmail">Company admin email</label><input className="input" id="oAdminEmail" type="email" placeholder="admin@company.example" maxLength={254} autoComplete="off" value={ae} onChange={(x) => setAe(x.target.value)} /></div>
      </div>
      <div className="field" style={{ marginTop: 12 }}><label id="oModsLbl">Modules to enable</label>
        <div id="oMods" role="group" aria-labelledby="oModsLbl" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 14px", marginTop: 4 }}>
          {svc.PLAN_MODULES.map((m, i) => (
            <label key={m} htmlFor={`om-${i}`} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, padding: "3px 0", cursor: "pointer" }}>
              <input type="checkbox" id={`om-${i}`} checked={mods.includes(m)} onChange={(x) => setMods(x.target.checked ? mods.concat([m]) : mods.filter((y) => y !== m))} /><span>{m}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="field" style={{ marginTop: 12 }}><label htmlFor="oReason">Reason for onboarding (recorded in the audit log)</label><textarea className="input" id="oReason" maxLength={300} value={reason} onChange={(x) => setReason(x.target.value)} /></div>
      {err ? <div id="onbErr" className="errmsg" role="alert" style={{ marginTop: 10, display: "flex" }}><Icon name="alert" />{err}</div> : null}
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={gate.locked} title={gate.title}><Icon name="plus" />Create customer</button></LayerFoot>
    </>
  );
}
