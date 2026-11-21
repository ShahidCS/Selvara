/* Short vendor dialogs: add certificate, flag finding, change tier. The record is a page (VendorDetail); add, reassess and waiver are form pages (VendorForms). */
import { useState } from "react";
import { API_ON } from "@/lib/rbac";
import { LayerFoot, useLayer } from "@/components/shell/LayerProvider";
import type { LayerApi } from "@/components/shell/LayerProvider";
import { bumpData } from "@/lib/store";
import { wsLog } from "@/lib/audit";
import { FINDING_SEVS, VENDOR_TIERS, vFind } from "@/features/vendors/lib/vendors";
import * as svc from "@/features/vendors/services/vendors";
import { attempt } from "@/components/kit/sodKit";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const Req = () => <span style={{ color: "var(--bad-ink)" }}>*</span>;
export const errP = (id: string, on: boolean, text: string) => <p className="field help" id={id} role="alert" style={{ color: "var(--bad-ink)", display: on ? "block" : "none" }}>{text}</p>;
export const grid = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 };
const NotFound = () => <p className="field help">Vendor not found.</p>;
const Foot = ({ L, label, onSave }: { L: LayerApi; label: string; onSave: () => void }) => (
  <LayerFoot><button className="btn btn-secondary" onClick={() => L.closeLayer()}>Cancel</button><button className="btn btn-primary" onClick={onSave}>{label}</button></LayerFoot>
);
/** Service call: validation refusals show the inline line (`onInvalid(msg)`) or a toast; rule violations (SodError) their message; other exceptions a generic toast (ASVS 7.4.1). */
function useAct() {
  const L = useLayer();
  return (p: () => Promise<svc.Res<any>>, ok: (r: any) => void, onInvalid: (msg: string) => void) => attempt(L, async () => {
    const r = await p();
    if (!r.ok) { if (/required|between 0 and 100|at least 10|within 12 months/.test(r.msg)) onInvalid(r.msg); else L.toast(r.msg, false); return; }
    ok(r);
  });
}

function CertForm({ id }: { id: string }) {
  const L = useLayer(); const act = useAct();
  const [type, setType] = useState(""); const [exp, setExp] = useState(""); const [err, setErr] = useState(false);
  const save = () => act(() => svc.addCert(id, { type, expires: exp }), (r) => { wsLog("vendor.cert.added", r.type + " for " + r.name, "Vendor"); L.closeLayer(); L.toast("Certificate added"); bumpData(); }, () => setErr(true));
  return (
    <>
      <div>
        <div className="field"><label htmlFor="vc-type">Type <Req /></label><input className="input" id="vc-type" data-focus maxLength={120} placeholder="e.g. SOC 2 Type II" value={type} onChange={(e) => setType(e.target.value)} aria-invalid={err} aria-describedby={err ? "vc-err" : undefined} />{errP("vc-err", err, "Type is required.")}</div>
        {API_ON ? <div className="field"><label htmlFor="vc-exp">Expires <Req /></label><input className="input" type="date" id="vc-exp" value={exp} onChange={(e) => setExp(e.target.value)} /></div>
          : <div className="field"><label htmlFor="vc-exp">Expires</label><input className="input" id="vc-exp" maxLength={40} placeholder="e.g. 30 Jun 2027" value={exp} onChange={(e) => setExp(e.target.value)} /></div>}
      </div>
      <Foot L={L} label="Add" onSave={save} />
    </>
  );
}
export const openAddCert = (L: LayerApi, id: string) => L.openModal("Add certificate", () => <CertForm id={id} />);

function FindingForm({ id }: { id: string }) {
  const L = useLayer(); const act = useAct();
  const [title, setTitle] = useState(""); const [sev, setSev] = useState("Medium"); const [err, setErr] = useState(false);
  const save = () => act(() => svc.addFinding(id, { title, sev }), (r) => { wsLog("vendor.finding.flagged", r.title + " (" + r.name + ")", "Vendor"); L.closeLayer(); L.toast("Finding flagged"); bumpData(); }, () => setErr(true));
  return (
    <>
      <div>
        <div className="field"><label htmlFor="vff-title">Finding <Req /></label><input className="input" id="vff-title" data-focus maxLength={300} placeholder="e.g. Incident response SLA not evidenced" value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={err} aria-describedby={err ? "vff-err" : undefined} /></div>
        <div className="field"><label htmlFor="vff-sev">Severity</label><select className="select" id="vff-sev" value={sev} onChange={(e) => setSev(e.target.value)}>{FINDING_SEVS.map((s) => <option key={s}>{s}</option>)}</select></div>
        {errP("vff-err", err, "Finding description is required.")}
      </div>
      <Foot L={L} label="Flag" onSave={save} />
    </>
  );
}
export const openAddFinding = (L: LayerApi, id: string) => L.openModal("Flag finding", () => <FindingForm id={id} />);

function TierForm({ id }: { id: string }) {
  const L = useLayer(); const act = useAct(); const v = vFind(id);
  const [t, setT] = useState(String(v?.tier ?? VENDOR_TIERS[0]));
  if (!v) return <NotFound />;
  const save = () => act(() => svc.changeTier(id, t), (r) => {
    if (r.changed) { wsLog("vendor.tier.change_requested", r.name + ": " + r.from + " → " + r.to, "Vendor"); L.toast("Tier change requested; a different admin or owner must approve it"); }
    L.closeLayer(); bumpData();
  }, () => undefined);
  return (
    <>
      <div>
        <div className="field"><label htmlFor="vt-tier">Tier</label><select className="select" id="vt-tier" data-focus value={VENDOR_TIERS.includes(t) ? t : VENDOR_TIERS[0]} onChange={(e) => setT(e.target.value)}>{VENDOR_TIERS.map((x) => <option key={x}>{x}</option>)}</select></div>
        <p className="field help">Tier drives the reassessment cadence and the depth of due diligence required. A tier change is applied only after a different admin or owner approves it.</p>
      </div>
      <Foot L={L} label="Request tier change" onSave={save} />
    </>
  );
}
export function openChangeTier(L: LayerApi, id: string) { const v = vFind(id); L.openModal(v ? "Change tier, " + v.name : "Vendor", () => <TierForm id={id} />); }
