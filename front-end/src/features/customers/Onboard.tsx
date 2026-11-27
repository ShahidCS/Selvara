import { useState } from "react";
import { Icon, SelectList } from "@/components/ui";
import { LayerFoot } from "@/components/shell/LayerProvider";
import { useLayer } from "@/hooks/useLayer";
import { ELEV_REASON_MIN, sodMessage } from "@/lib/elevation";
import { useGate } from "@/components/kit/admin/ElevateGate";
import { setModState, getModState } from "@/lib/store";
import { isEmail } from "@/lib/security";
import { PLANS } from "@/services/billing";
import * as svc from "@/services/customers";

type F = "oName" | "oAdminName" | "oAdminEmail" | "oReason";
const FIELDS: F[] = ["oName", "oAdminName", "oAdminEmail", "oReason"];
const Req = () => <span aria-hidden="true" style={{ color: "var(--bad-ink)" }}> *</span>;

/** Prototype: onboardCustomer / onboardSyncModules / onboardSubmit. Opens as a modal; `go('/admin/customers')` is done by the caller when needed. */
export function OnboardForm({ close }: { close: () => void }) {
  const L = useLayer(); const gate = useGate(); const [reason, setReason] = useState("");
  const [name, setName] = useState(""); const [region, setRegion] = useState(svc.ONBOARD_REGIONS[0]); const [plan, setPlan] = useState("Professional");
  const [cur, setCur] = useState(svc.ONBOARD_CURRENCIES[0]); const [bill, setBill] = useState(svc.ONBOARD_BILLING_METHODS[0]); const [cycle, setCycle] = useState("Annual");
  const [an, setAn] = useState(""); const [ae, setAe] = useState("");
  const [mods, setMods] = useState<string[]>(PLANS.Professional.modules.slice());
  // Field-level errors: each shows under its own field, the field is marked invalid, and focus moves to the first one.
  const [errs, setErrs] = useState<Partial<Record<F, string>>>({});
  const syncMods = (p: string) => setMods((PLANS[p] || PLANS.Professional).modules.slice());
  const clear = (f: F) => { if (errs[f]) { const n = { ...errs }; delete n[f]; setErrs(n); } };
  const submit = async () => {
    const n = name.trim(), a = an.trim(), e = ae.trim();
    const miss: Partial<Record<F, string>> = {};
    if (!n) miss.oName = "Enter the company name.";
    if (!a) miss.oAdminName = "Enter the company admin's full name.";
    if (!e || !isEmail(e)) miss.oAdminEmail = "Enter a valid email address, for example admin@company.example.";
    if (reason.trim().length < ELEV_REASON_MIN) miss.oReason = `Enter a reason of at least ${ELEV_REASON_MIN} characters.`;
    setErrs(miss);
    const first = FIELDS.find((f) => miss[f]);
    if (first) { document.getElementById(first)?.focus(); return; }
    try {
      const c = await svc.onboard({ name: n, adminName: a, adminEmail: e, region, plan, currency: cur, cycle, billingMethod: bill, modules: svc.PLAN_MODULES.filter((m) => mods.includes(m)), reason });
      close(); L.toast(c.name + " onboarded, invite sent to " + c.contact.email);
      setModState("customers.sel", c.id);
      setModState("customers.recent", [c.id, ...getModState<string[]>("customers.recent", []).filter((x) => x !== c.id)].slice(0, 4));
    } catch (x) { L.toast(sodMessage(x, "Could not create the customer"), false); }
  };
  const fp = (f: F) => ({ id: f, required: true, "aria-required": true, "aria-invalid": !!errs[f], "aria-describedby": errs[f] ? f + "Err" : undefined });
  const msg = (f: F) => (errs[f] ? <span className="help" id={f + "Err"} style={{ color: "var(--bad-ink)", display: "flex", gap: 6, alignItems: "flex-start" }}><Icon name="alert" style={{ flex: "none", width: 14, height: 14, marginTop: 2 }} />{errs[f]}</span> : null);
  const cls = (f: F) => "field" + (errs[f] ? " err" : "");
  return (
    <>
      <p className="field help" style={{ marginBottom: 14 }}>Fields marked <span aria-hidden="true">*</span> are required. Creates a new tenant with a company admin. The admin receives an invite and enrols MFA at first sign-in. Region is locked at creation for data-residency.</p>
      <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className={cls("oName")}><label htmlFor="oName">Company name<Req /></label><input className="input" {...fp("oName")} placeholder="e.g. Globex Pay" data-focus maxLength={100} value={name} onChange={(x) => { setName(x.target.value); clear("oName"); }} />{msg("oName")}</div>
        <div className="field"><label htmlFor="oRegion">Region (data residency)</label><SelectList className="select" id="oRegion" value={region} onChange={(x) => setRegion(x.target.value)}>{svc.ONBOARD_REGIONS.map((r) => <option key={r}>{r}</option>)}</SelectList></div>
        <div className="field"><label htmlFor="oPlan">Plan</label><SelectList className="select" id="oPlan" value={plan} onChange={(x) => { setPlan(x.target.value); syncMods(x.target.value); }}>{svc.ONBOARD_PLANS.map((p) => <option key={p}>{p}</option>)}</SelectList></div>
        <div className="field"><label htmlFor="oCur">Billing currency</label><SelectList className="select" id="oCur" value={cur} onChange={(x) => setCur(x.target.value)}>{svc.ONBOARD_CURRENCIES.map((c) => <option key={c}>{c}</option>)}</SelectList></div>
        <div className="field"><label htmlFor="oBill">Billing method</label><SelectList className="select" id="oBill" value={bill} onChange={(x) => setBill(x.target.value)}>{svc.ONBOARD_BILLING_METHODS.map((b) => <option key={b}>{b}</option>)}</SelectList></div>
        <div className="field"><label htmlFor="oCycle">Billing cycle</label><SelectList className="select" id="oCycle" value={cycle} onChange={(x) => setCycle(x.target.value)}>{svc.ONBOARD_CYCLES.map((c) => <option key={c}>{c}</option>)}</SelectList></div>
        <div className={cls("oAdminName")} style={{ gridColumn: "1/-1" }}><label htmlFor="oAdminName">Company admin name<Req /></label><input className="input" {...fp("oAdminName")} placeholder="Full name" maxLength={100} value={an} onChange={(x) => { setAn(x.target.value); clear("oAdminName"); }} />{msg("oAdminName")}</div>
        <div className={cls("oAdminEmail")} style={{ gridColumn: "1/-1" }}><label htmlFor="oAdminEmail">Company admin email<Req /></label><input className="input" {...fp("oAdminEmail")} type="email" placeholder="admin@company.example" maxLength={254} autoComplete="off" value={ae} onChange={(x) => { setAe(x.target.value); clear("oAdminEmail"); }} />{msg("oAdminEmail")}</div>
      </div>
      <div className="field" style={{ marginTop: 12 }}><label id="oModsLbl">Modules to enable</label>
        <div id="oMods" role="group" aria-labelledby="oModsLbl" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 14px", marginTop: 4 }}>
          {svc.PLAN_MODULES.map((m, i) => (
            <label key={m} htmlFor={`om-${i}`} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: ".8125rem", padding: "3px 0", cursor: "pointer" }}>
              <input type="checkbox" id={`om-${i}`} checked={mods.includes(m)} onChange={(x) => setMods(x.target.checked ? mods.concat([m]) : mods.filter((y) => y !== m))} /><span>{m}</span>
            </label>
          ))}
        </div>
      </div>
      <div className={cls("oReason")} style={{ marginTop: 12 }}><label htmlFor="oReason">Reason for onboarding, at least {ELEV_REASON_MIN} characters (recorded in the audit log)<Req /></label><textarea className="input" {...fp("oReason")} maxLength={300} value={reason} onChange={(x) => { setReason(x.target.value); clear("oReason"); }} />{msg("oReason")}</div>
      {Object.keys(errs).length ? <p className="field help" role="alert" style={{ marginTop: 10, color: "var(--bad-ink)" }}>Check the {Object.keys(errs).length === 1 ? "highlighted field" : Object.keys(errs).length + " highlighted fields"} above.</p> : null}
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={gate.locked} title={gate.title}><Icon name="plus" />Create customer</button></LayerFoot>
    </>
  );
}
