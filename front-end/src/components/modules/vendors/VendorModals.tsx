/* Vendor modals (source vendorAddCert, vendorAddFinding, vendorReassess, vendorChangeTier, vendorCreate). Modals replace the drawer, so
 * forms opened from it take `reopen` and call it after saving, like the source's `vendorDrawer(id)`. */
import { useState } from "react";
import { LayerFoot, useLayer } from "@/components/shell/LayerProvider";
import type { LayerApi } from "@/components/shell/LayerProvider";
import { bumpData } from "@/lib/store";
import { getMe, wsLog } from "@/lib/audit";
import { FINDING_SEVS, REASSESS_OUTCOMES, TIER_CADENCE, TIER_WINDOW, VENDOR_TIERS, vFind } from "@/lib/vendors";
import * as svc from "@/services/vendors";
import { attempt } from "../sodKit";

/* eslint-disable @typescript-eslint/no-explicit-any */
const Req = () => <span style={{ color: "var(--bad-ink)" }}>*</span>;
const errP = (id: string, on: boolean, text: string) => <p className="field help" id={id} role="alert" style={{ color: "var(--bad-ink)", display: on ? "block" : "none" }}>{text}</p>;
const grid = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 };
const NotFound = () => <p className="field help">Vendor not found.</p>;
const Foot = ({ L, label, onSave }: { L: LayerApi; label: string; onSave: () => void }) => (
  <LayerFoot><button className="btn btn-secondary" onClick={() => L.closeLayer()}>Cancel</button><button className="btn btn-primary" onClick={onSave}>{label}</button></LayerFoot>
);
/** Service call: validation refusals show the inline line (`onInvalid(msg)`) or a toast; rule violations (SodError) their message; other exceptions a generic toast (ASVS 7.4.1). */
function useAct() {
  const L = useLayer();
  return (p: () => Promise<svc.Res<any>>, ok: (r: any) => void, onInvalid: (msg: string) => void) => attempt(L, async () => {
    const r = await p();
    if (!r.ok) { if (/required|between 0 and 100|at least 10|within 12 months/.test(r.msg)) onInvalid(r.msg); else L.toast(r.msg); return; }
    ok(r);
  });
}

function CertForm({ id, reopen }: { id: string; reopen: () => void }) {
  const L = useLayer(); const act = useAct();
  const [type, setType] = useState(""); const [exp, setExp] = useState(""); const [err, setErr] = useState(false);
  const save = () => act(() => svc.addCert(id, { type, expires: exp }), (r) => { wsLog("vendor.cert.added", r.type + " for " + r.name, "Vendor"); L.closeLayer(); L.toast("Certificate added"); reopen(); bumpData(); }, () => setErr(true));
  return (
    <>
      <div>
        <div className="field"><label htmlFor="vc-type">Type <Req /></label><input className="input" id="vc-type" data-focus maxLength={120} placeholder="e.g. SOC 2 Type II" value={type} onChange={(e) => setType(e.target.value)} aria-invalid={err} aria-describedby={err ? "vc-err" : undefined} /></div>
        <div className="field"><label htmlFor="vc-exp">Expires</label><input className="input" id="vc-exp" maxLength={40} placeholder="e.g. 30 Jun 2027" value={exp} onChange={(e) => setExp(e.target.value)} /></div>
        {errP("vc-err", err, "Type is required.")}
      </div>
      <Foot L={L} label="Add" onSave={save} />
    </>
  );
}
export const openAddCert = (L: LayerApi, id: string, reopen: () => void) => L.openModal("Add certificate", () => <CertForm id={id} reopen={reopen} />);

function FindingForm({ id, reopen }: { id: string; reopen: () => void }) {
  const L = useLayer(); const act = useAct();
  const [title, setTitle] = useState(""); const [sev, setSev] = useState("Medium"); const [err, setErr] = useState(false);
  const save = () => act(() => svc.addFinding(id, { title, sev }), (r) => { wsLog("vendor.finding.flagged", r.title + " (" + r.name + ")", "Vendor"); L.closeLayer(); L.toast("Finding flagged"); reopen(); bumpData(); }, () => setErr(true));
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
export const openAddFinding = (L: LayerApi, id: string, reopen: () => void) => L.openModal("Flag finding", () => <FindingForm id={id} reopen={reopen} />);

function ReassessForm({ id }: { id: string }) {
  const L = useLayer(); const act = useAct(); const v = vFind(id);
  const [score, setScore] = useState(String(v?.score ?? "")); const [out, setOut] = useState(REASSESS_OUTCOMES[0]); const [by, setBy] = useState(getMe().name); const [err, setErr] = useState(false);
  if (!v) return <NotFound />;
  const save = () => act(() => svc.reassess(id, { score, outcome: out, by }), (r) => { wsLog("vendor.reassessed", r.name + ", score " + r.score + ", " + r.outcome, "Vendor"); L.closeLayer(); L.toast(r.name + " reassessed"); bumpData(); }, () => setErr(true));
  return (
    <>
      <div>
        <p style={{ margin: "0 0 8px" }}>{v.tier} tier — {TIER_CADENCE[v.tier]}.</p>
        <div className="grid2" style={grid}>
          <div className="field"><label htmlFor="vr-score">New risk score (0-100) <Req /></label><input className="input" id="vr-score" type="number" min={0} max={100} step="any" value={score} onChange={(e) => setScore(e.target.value)} aria-invalid={err} aria-describedby={err ? "vr-err" : undefined} /></div>
          <div className="field"><label htmlFor="vr-out">Outcome</label><select className="select" id="vr-out" value={out} onChange={(e) => setOut(e.target.value)}>{REASSESS_OUTCOMES.map((o) => <option key={o}>{o}</option>)}</select></div>
        </div>
        <div className="field"><label htmlFor="vr-by">Assessor</label><input className="input" id="vr-by" maxLength={80} value={by} onChange={(e) => setBy(e.target.value)} /></div>
        {errP("vr-err", err, "Enter a score between 0 and 100.")}
        <p className="field help">Sets the next review date from the vendor&apos;s tier cadence ({TIER_WINDOW[v.tier]}).</p>
      </div>
      <Foot L={L} label="Record reassessment" onSave={save} />
    </>
  );
}
export function openReassess(L: LayerApi, id: string) { const v = vFind(id); L.openModal(v ? "Reassess " + v.name : "Vendor", () => <ReassessForm id={id} />); }

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

export function VendorCreateForm() {
  const L = useLayer(); const act = useAct();
  const [name, setName] = useState(""); const [cat, setCat] = useState(""); const [tier, setTier] = useState("Medium"); const [score, setScore] = useState("75"); const [err, setErr] = useState("");
  const save = () => act(() => svc.createVendor({ name, cat, tier, score }), (r) => { wsLog("vendor.added", r.name + ", " + r.tier + " tier", "Vendor"); L.closeLayer(); L.toast("Vendor added"); bumpData(); }, (m) => setErr(m));
  return (
    <>
      <div>
        <div className="field"><label htmlFor="vn-name">Vendor name <Req /></label><input className="input" id="vn-name" data-focus maxLength={120} placeholder="e.g. Acme Cloud" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!err} aria-describedby={err ? "vn-err" : undefined} /></div>
        <div className="grid2" style={grid}>
          <div className="field"><label htmlFor="vn-cat">Category</label><input className="input" id="vn-cat" maxLength={80} placeholder="e.g. Messaging" value={cat} onChange={(e) => setCat(e.target.value)} /></div>
          <div className="field"><label htmlFor="vn-tier">Tier</label><select className="select" id="vn-tier" value={tier} onChange={(e) => setTier(e.target.value)}>{VENDOR_TIERS.map((x) => <option key={x}>{x}</option>)}</select></div>
        </div>
        <div className="field"><label htmlFor="vn-score">Initial risk score (0-100)</label><input className="input" id="vn-score" type="number" min={0} max={100} step="any" value={score} onChange={(e) => setScore(e.target.value)} /></div>
        {errP("vn-err", !!err, err)}
      </div>
      <Foot L={L} label="Add vendor" onSave={save} />
    </>
  );
}
export const openVendorCreate = (L: LayerApi) => L.openModal("Add vendor", () => <VendorCreateForm />);

/* NEW: certificate waiver request (SOD_MATRIX principle 6): reason + expiry, approved by someone other than the requester. */
function WaiverForm({ id, reopen }: { id: string; reopen: () => void }) {
  const L = useLayer(); const act = useAct(); const v = vFind(id);
  const [type, setType] = useState(""); const [reason, setReason] = useState(""); const [exp, setExp] = useState(""); const [err, setErr] = useState("");
  if (!v) return <NotFound />;
  const save = () => act(() => svc.requestWaiver(id, { type, reason, expires: exp }), (r) => { wsLog("vendor.waiver.requested", r.type + " for " + r.name, "Vendor"); L.closeLayer(); L.toast("Waiver requested; a different admin or owner must approve it"); reopen(); bumpData(); }, (m) => setErr(m));
  return (
    <>
      <div>
        <p className="field help" style={{ margin: "0 0 8px" }}>A waiver is an exception. It needs a reason, an expiry within 12 months and approval by someone other than you.</p>
        <div className="field"><label htmlFor="vw-type">Certificate or attestation waived <Req /></label><input className="input" id="vw-type" data-focus maxLength={120} placeholder="e.g. SOC 2 Type II" value={type} onChange={(e) => { setType(e.target.value); setErr(""); }} /></div>
        <div className="field"><label htmlFor="vw-reason">Reason <Req /></label><textarea className="input" id="vw-reason" rows={3} maxLength={300} style={{ resize: "vertical" }} value={reason} onChange={(e) => { setReason(e.target.value); setErr(""); }} /></div>
        <div className="field"><label htmlFor="vw-exp">Waiver expires <Req /></label><input className="input" id="vw-exp" type="date" value={exp} onChange={(e) => { setExp(e.target.value); setErr(""); }} aria-invalid={!!err} aria-describedby={err ? "vw-err" : undefined} /></div>
        {errP("vw-err", !!err, err)}
      </div>
      <Foot L={L} label="Request waiver" onSave={save} />
    </>
  );
}
export const openWaiver = (L: LayerApi, id: string, reopen: () => void) => L.openModal("Request certificate waiver", () => <WaiverForm id={id} reopen={reopen} />);
