import { useEffect, useRef, useState, type FormEvent } from "react";
import { Empty, FormActions, FormMessage, FormSection, Page } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";
import { getMe, wsLog } from "@/lib/audit";
import { bumpData, useApp, useData } from "@/lib/store";
import { useGo } from "@/lib/route";
import { FAIL_MSG, uiMessage } from "@/lib/grcSod";
import { DATA } from "@/lib/data";
import { REASSESS_OUTCOMES, TIER_CADENCE, TIER_WINDOW, VENDOR_TIERS, vFind, vendorCanManage } from "@/features/vendors/lib/vendors";
import * as svc from "@/features/vendors/services/vendors";
import { Req } from "./VendorModals";

/* eslint-disable @typescript-eslint/no-explicit-any */
const LIST = "/ws/vendors";
const INVALID = /required|between 0 and 100|at least 10|within 12 months|future date/;
const Denied = ({ title, back }: { title: string; back: { href: string; label: string } }) => <Page title={title} back={back}><Empty icon="vendors" title="You cannot do this">Only an admin or owner can change vendors.</Empty></Page>;
const Missing = () => <Page title="Vendor not found" back={{ href: LIST, label: "Third parties" }}><Empty icon="vendors" title="No such vendor">That vendor is not in the inventory.</Empty></Page>;
const grid2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } as const;

/** Shared submit for the vendor form pages: validation refusals show on the page, rule violations and other failures as a toast. */
function useSubmit(opts: { run: () => Promise<svc.Res<any>>; done: (r: any) => void; allowLeave: () => void; setErr: (m: string) => void; setBusy: (b: boolean) => void }) {
  const L = useLayer();
  return async (e: FormEvent) => {
    e.preventDefault(); opts.setBusy(true);
    try {
      const r = await opts.run();
      if (!r.ok) { opts.setBusy(false); if (INVALID.test(r.msg)) opts.setErr(r.msg); else { opts.setErr(""); L.toast(r.msg, false); } return; }
      opts.allowLeave(); opts.done(r);
    } catch (x) { opts.setBusy(false); opts.setErr(""); L.toast(uiMessage(x) || FAIL_MSG, false); }
  };
}

/** `/ws/vendors/new`: add a vendor to the inventory. */
export function VendorFormPage() {
  useData(); const role = useApp((s) => s.role);
  const L = useLayer(); const go = useGo();
  const [name, setName] = useState(""); const [cat, setCat] = useState(""); const [tier, setTier] = useState("Medium"); const [score, setScore] = useState("75");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const dirty = !busy && (name !== "" || cat !== "" || tier !== "Medium" || score !== "75");
  const { allowLeave } = useUnsavedGuard(dirty, L);
  const ref = useRef<HTMLInputElement>(null); useEffect(() => { ref.current?.focus(); }, []);
  const back = { href: LIST, label: "Third parties" };
  const submit = useSubmit({ run: () => svc.createVendor({ name, cat, tier, score }), allowLeave, setErr, setBusy,
    done: (r) => { wsLog("vendor.added", r.name + ", " + r.tier + " tier", "Vendor"); L.toast("Vendor added"); bumpData(); const v = DATA.vendors.find((x: any) => x.name === r.name); go(v ? `${LIST}/${encodeURIComponent(v.id)}` : LIST); } });
  if (!vendorCanManage(role)) return <Denied title="Add vendor" back={back} />;
  return (
    <Page title="Add vendor" sub="Then record certificates, findings and reassessments from its page." back={back}>
      <div className="scroll rec-scroll"><form className="rec-form" onSubmit={submit} noValidate>
        <FormSection n={1} title="Vendor" note="Who the third party is and how critical it is.">
          <div className="field"><label htmlFor="vn-name">Vendor name <Req /></label><input ref={ref} className="input" id="vn-name" maxLength={120} placeholder="e.g. Acme Cloud" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!err} aria-describedby={err ? "vn-err" : undefined} /></div>
          <div style={grid2}>
            <div className="field"><label htmlFor="vn-cat">Category</label><input className="input" id="vn-cat" maxLength={80} placeholder="e.g. Messaging" value={cat} onChange={(e) => setCat(e.target.value)} /></div>
            <div className="field"><label htmlFor="vn-tier">Tier</label><select className="select" id="vn-tier" value={tier} onChange={(e) => setTier(e.target.value)}>{VENDOR_TIERS.map((x) => <option key={x}>{x}</option>)}</select></div>
          </div>
        </FormSection>
        <FormSection n={2} title="Initial risk" note="You can reassess later; the tier sets the cadence.">
          <div className="field"><label htmlFor="vn-score">Initial risk score (0-100)</label><input className="input" id="vn-score" type="number" min={0} max={100} step="any" value={score} onChange={(e) => setScore(e.target.value)} /></div>
        </FormSection>
        {err ? <FormMessage id="vn-err">{err}</FormMessage> : null}
        <FormActions><button type="button" className="btn btn-secondary" onClick={() => go(LIST)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy}>Add vendor</button></FormActions>
      </form></div>
    </Page>
  );
}

/** `/ws/vendors/:id/reassess`: record a reassessment (score, outcome, assessor). */
export function ReassessFormPage({ id }: { id: string }) {
  useData(); const role = useApp((s) => s.role);
  const L = useLayer(); const go = useGo();
  const v = vFind(id);
  const score0 = String(v?.score ?? ""); const by0 = getMe().name;
  const [score, setScore] = useState(score0); const [out, setOut] = useState(REASSESS_OUTCOMES[0]); const [by, setBy] = useState(by0);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const dirty = !busy && (score !== score0 || out !== REASSESS_OUTCOMES[0] || by !== by0);
  const { allowLeave } = useUnsavedGuard(dirty, L);
  const ref = useRef<HTMLInputElement>(null); useEffect(() => { ref.current?.focus(); }, []);
  const rec = `${LIST}/${encodeURIComponent(id)}`; const back = { href: rec, label: "Vendor" };
  const submit = useSubmit({ run: () => svc.reassess(id, { score, outcome: out, by }), allowLeave, setErr, setBusy,
    done: (r) => { wsLog("vendor.reassessed", r.name + ", score " + r.score + ", " + r.outcome, "Vendor"); L.toast(r.name + " reassessed"); bumpData(); go(rec); } });
  if (!v) return <Missing />;
  if (!vendorCanManage(role)) return <Denied title="Reassess vendor" back={back} />;
  return (
    <Page title="Reassess vendor" sub={`${v.name}, ${v.tier} tier: ${TIER_CADENCE[v.tier]}`} back={back}>
      <div className="scroll rec-scroll"><form className="rec-form" onSubmit={submit} noValidate>
        <FormSection n={1} title="Result" note={`Sets the next review date from the tier cadence (${TIER_WINDOW[v.tier]}).`}>
          <div style={grid2}>
            <div className="field"><label htmlFor="vr-score">New risk score (0-100) <Req /></label><input ref={ref} className="input" id="vr-score" type="number" min={0} max={100} step="any" value={score} onChange={(e) => setScore(e.target.value)} aria-invalid={!!err} aria-describedby={err ? "vr-err" : undefined} /></div>
            <div className="field"><label htmlFor="vr-out">Outcome</label><select className="select" id="vr-out" value={out} onChange={(e) => setOut(e.target.value)}>{REASSESS_OUTCOMES.map((o) => <option key={o}>{o}</option>)}</select></div>
          </div>
        </FormSection>
        <FormSection n={2} title="Assessor"><div className="field"><label htmlFor="vr-by">Assessor</label><input className="input" id="vr-by" maxLength={80} value={by} onChange={(e) => setBy(e.target.value)} /></div></FormSection>
        {err ? <FormMessage id="vr-err">{err}</FormMessage> : null}
        <FormActions><button type="button" className="btn btn-secondary" onClick={() => go(rec)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy}>Record reassessment</button></FormActions>
      </form></div>
    </Page>
  );
}

/** `/ws/vendors/:id/waiver`: request a certificate waiver (reason, expiry within 12 months, approved by someone other than the requester). */
export function WaiverFormPage({ id }: { id: string }) {
  useData(); const role = useApp((s) => s.role);
  const L = useLayer(); const go = useGo();
  const v = vFind(id);
  const [type, setType] = useState(""); const [reason, setReason] = useState(""); const [exp, setExp] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const dirty = !busy && (type !== "" || reason !== "" || exp !== "");
  const { allowLeave } = useUnsavedGuard(dirty, L);
  const ref = useRef<HTMLInputElement>(null); useEffect(() => { ref.current?.focus(); }, []);
  const rec = `${LIST}/${encodeURIComponent(id)}`; const back = { href: rec, label: "Vendor" };
  const submit = useSubmit({ run: () => svc.requestWaiver(id, { type, reason, expires: exp }), allowLeave, setErr, setBusy,
    done: (r) => { wsLog("vendor.waiver.requested", r.type + " for " + r.name, "Vendor"); L.toast("Waiver requested; a different admin or owner must approve it"); bumpData(); go(rec); } });
  if (!v) return <Missing />;
  if (!vendorCanManage(role)) return <Denied title="Request waiver" back={back} />;
  return (
    <Page title="Request certificate waiver" sub={v.name} back={back}>
      <div className="scroll rec-scroll"><form className="rec-form" onSubmit={submit} noValidate>
        <FormMessage kind="note">A waiver is an exception. It needs a reason, an expiry within 12 months and approval by someone other than you.</FormMessage>
        <FormSection n={1} title="What is waived">
          <div className="field"><label htmlFor="vw-type">Certificate or attestation waived <Req /></label><input ref={ref} className="input" id="vw-type" maxLength={120} placeholder="e.g. SOC 2 Type II" value={type} onChange={(e) => { setType(e.target.value); setErr(""); }} /></div>
        </FormSection>
        <FormSection n={2} title="Reason and expiry">
          <div className="field"><label htmlFor="vw-reason">Reason <Req /></label><textarea className="input" id="vw-reason" rows={4} maxLength={300} style={{ resize: "vertical" }} value={reason} onChange={(e) => { setReason(e.target.value); setErr(""); }} /></div>
          <div className="field"><label htmlFor="vw-exp">Waiver expires <Req /></label><input className="input" id="vw-exp" type="date" value={exp} onChange={(e) => { setExp(e.target.value); setErr(""); }} aria-invalid={!!err} aria-describedby={err ? "vw-err" : undefined} /></div>
        </FormSection>
        {err ? <FormMessage id="vw-err">{err}</FormMessage> : null}
        <FormActions><button type="button" className="btn btn-secondary" onClick={() => go(rec)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy}>Request waiver</button></FormActions>
      </form></div>
    </Page>
  );
}
