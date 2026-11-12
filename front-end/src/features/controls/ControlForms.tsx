import { useEffect, useRef, useState, type FormEvent } from "react";
import { DATA } from "@/lib/data";
import { bumpData, useApp, useData } from "@/lib/store";
import { wsLog } from "@/lib/audit";
import { getActor } from "@/lib/sod";
import { clampText } from "@/lib/security";
import { FAIL_MSG, addMonths, isoDay, uiMessage } from "@/lib/grcSod";
import { useGo } from "@/lib/route";
import { Empty, FormActions, FormMessage, FormSection, Page } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";
import * as svc from "@/features/controls/services/controls";
import { Req } from "./exceptionModals";

const LIST = "/ws/controls";
const Denied = ({ title, back, why }: { title: string; back: { href: string; label: string }; why: string }) => <Page title={title} back={back}><Empty icon="controls" title="You cannot do this">{why}</Empty></Page>;

/** `/ws/controls/new`: add a custom control. */
export function ControlFormPage() {
  useData(); useApp((s) => s.role);
  const L = useLayer(); const go = useGo();
  const owner0 = getActor().name;
  const [title, setTitle] = useState(""); const [dom, setDom] = useState(svc.CONTROL_DOMAINS[0]); const [owner, setOwner] = useState(owner0);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const dirty = !busy && (title !== "" || dom !== svc.CONTROL_DOMAINS[0] || owner !== owner0);
  const { allowLeave } = useUnsavedGuard(dirty, L);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const back = { href: LIST, label: "Controls" };
  const denied = svc.whyCannotManage();
  if (denied) return <Denied title="Add custom control" back={back} why={denied} />;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const t = clampText(title, 200);
    if (!t) { setErr("Control title is required."); return; }
    setBusy(true);
    try {
      const { id } = await svc.createControl({ title: t, domain: dom, owner: clampText(owner, 80) });
      wsLog("control.created", id + ", " + t, "Control");
      allowLeave(); L.toast("Custom control " + id + " created"); bumpData(); go(`${LIST}/${encodeURIComponent(id)}`);
    } catch (x) { setBusy(false); setErr(""); L.toast(uiMessage(x) || FAIL_MSG, false); }
  };
  return (
    <Page title="Add custom control" sub="Then map it to frameworks and attach tests from its page." back={back}>
      <div className="scroll rec-scroll"><form className="rec-form" onSubmit={submit} noValidate>
        <FormSection n={1} title="Control" note="What the control is and where it sits.">
          <div className="field"><label htmlFor="cc-title">Control title <Req /></label><input ref={ref} className="input" id="cc-title" maxLength={200} placeholder="e.g. Secrets rotated every 90 days" value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!err} aria-describedby={err ? "cc-err" : undefined} /></div>
          <div className="field"><label htmlFor="cc-dom">Domain</label><select className="select" id="cc-dom" value={dom} onChange={(e) => setDom(e.target.value)}>{svc.CONTROL_DOMAINS.map((d) => <option key={d}>{d}</option>)}</select></div>
        </FormSection>
        <FormSection n={2} title="Ownership" note="The owner attests to the control and can change its status when no test applies.">
          <div className="field"><label htmlFor="cc-owner">Owner</label><input className="input" id="cc-owner" maxLength={80} value={owner} onChange={(e) => setOwner(e.target.value)} /></div>
        </FormSection>
        {err ? <FormMessage id="cc-err">{err}</FormMessage> : null}
        <FormActions><button type="button" className="btn btn-secondary" onClick={() => go(LIST)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy}>Create control</button></FormActions>
      </form></div>
    </Page>
  );
}

/** `/ws/controls/test/new`: build a custom test. */
export function TestFormPage() {
  useData(); useApp((s) => s.role);
  const L = useLayer(); const go = useGo();
  const ctrlOpts = DATA.controls.slice(0, 40).map((c) => c.id as string);
  const [name, setName] = useState(""); const [logic, setLogic] = useState(""); const [src, setSrc] = useState("Custom"); const [ctrl, setCtrl] = useState(ctrlOpts[0] ?? "");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const dirty = !busy && (name !== "" || logic !== "" || src !== "Custom" || ctrl !== (ctrlOpts[0] ?? ""));
  const { allowLeave } = useUnsavedGuard(dirty, L);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const back = { href: LIST, label: "Controls" };
  const denied = svc.whyCannotManage();
  if (denied) return <Denied title="Build custom test" back={back} why={denied} />;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = clampText(name, 200);
    if (!n) { setErr("Test name is required."); return; }
    setBusy(true);
    try {
      const { id } = await svc.createTest({ name: n, source: clampText(src, 80), control: ctrl, logic: clampText(logic, 500) });
      wsLog("test.created", n, "Control");
      allowLeave(); L.toast("Custom test " + id + " created"); bumpData(); go(`${LIST}/test/${encodeURIComponent(id)}`);
    } catch (x) { setBusy(false); setErr(""); L.toast(uiMessage(x) || FAIL_MSG, false); }
  };
  return (
    <Page title="Build custom test" sub="An automated check that supports a control." back={back}>
      <div className="scroll rec-scroll"><form className="rec-form" onSubmit={submit} noValidate>
        <FormSection n={1} title="Test" note="What is checked and against which condition.">
          <div className="field"><label htmlFor="tc-name">Test name <Req /></label><input ref={ref} className="input" id="tc-name" maxLength={200} placeholder="e.g. Object storage buckets are private" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!err} aria-describedby={err ? "tc-err" : undefined} /></div>
          <div className="field"><label htmlFor="tc-logic">Condition each resource must meet</label><textarea className="input" id="tc-logic" rows={3} maxLength={500} style={{ resize: "vertical" }} placeholder="e.g. bucket.public = false" value={logic} onChange={(e) => setLogic(e.target.value)} /></div>
        </FormSection>
        <FormSection n={2} title="Source and control" note="Where the data comes from and which control the result supports.">
          <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field"><label htmlFor="tc-src">Source</label><input className="input" id="tc-src" maxLength={80} value={src} onChange={(e) => setSrc(e.target.value)} /></div>
            <div className="field"><label htmlFor="tc-ctrl">Supports control</label><select className="select" id="tc-ctrl" value={ctrl} onChange={(e) => setCtrl(e.target.value)}>{ctrlOpts.map((c) => <option key={c}>{c}</option>)}</select></div>
          </div>
        </FormSection>
        {err ? <FormMessage id="tc-err">{err}</FormMessage> : null}
        <FormActions><button type="button" className="btn btn-secondary" onClick={() => go(LIST)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy}>Create test</button></FormActions>
      </form></div>
    </Page>
  );
}

/** `/ws/controls/:id/exception`: request an exception or waiver. A different admin or owner decides it. */
export function ExceptionFormPage({ id }: { id: string }) {
  useData(); useApp((s) => s.role);
  const L = useLayer(); const go = useGo();
  const c = DATA.controls.find((x) => x.id === id);
  const exp0 = isoDay(addMonths(new Date(), 3));
  const [reason, setReason] = useState(""); const [comp, setComp] = useState(""); const [exp, setExp] = useState(exp0);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const dirty = !busy && (reason !== "" || comp !== "" || exp !== exp0);
  const { allowLeave } = useUnsavedGuard(dirty, L);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  if (!c) return <Page title="Control not found" back={{ href: LIST, label: "Controls" }}><Empty icon="controls" title="No such control">There is no control with the ID &ldquo;{id}&rdquo;.</Empty></Page>;
  const rec = `${LIST}/${encodeURIComponent(id)}`;
  const back = { href: rec, label: "Control" };
  const denied = svc.whyCannotRequestException();
  if (denied) return <Denied title="Request exception" back={back} why={denied} />;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (clampText(reason, 500).length < 10) { setErr("Give a reason of at least 10 characters."); return; }
    if (clampText(comp, 500).length < 20) { setErr("Describe the compensating control (at least 20 characters)."); return; }
    setBusy(true);
    try {
      await svc.requestException(id, { reason: clampText(reason, 500), compensating: clampText(comp, 500), expires: exp });
      allowLeave(); L.toast("Exception requested; a different approver must decide"); bumpData(); go(rec);
    } catch (x) { setBusy(false); setErr(""); L.toast(uiMessage(x) || FAIL_MSG, false); }
  };
  return (
    <Page title="Request exception" sub={`${c.id}, ${c.title}`} back={back}>
      <div className="scroll rec-scroll"><form className="rec-form" onSubmit={submit} noValidate>
        <FormMessage kind="note">The approver must be an admin or owner other than you and the control owner. The exception expires automatically.</FormMessage>
        <FormSection n={1} title="Why" note="The gap you are asking to accept.">
          <div className="field"><label htmlFor="cx-reason">Why is an exception needed? <Req /></label><textarea ref={ref} className="input" id="cx-reason" rows={3} maxLength={500} style={{ resize: "vertical" }} value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={!!err} aria-describedby={err ? "cx-err" : undefined} /></div>
        </FormSection>
        <FormSection n={2} title="Mitigation and expiry" note="What covers the risk meanwhile, and until when.">
          <div className="field"><label htmlFor="cx-comp">Compensating control <Req /></label><textarea className="input" id="cx-comp" rows={3} maxLength={500} style={{ resize: "vertical" }} value={comp} onChange={(e) => setComp(e.target.value)} /></div>
          <div className="field"><label htmlFor="cx-exp">Expires on (max 12 months) <Req /></label><input className="input" id="cx-exp" type="date" min={isoDay()} max={isoDay(addMonths(new Date(), 12))} value={exp} onChange={(e) => setExp(e.target.value)} /></div>
        </FormSection>
        {err ? <FormMessage id="cx-err">{err}</FormMessage> : null}
        <FormActions><button type="button" className="btn btn-secondary" onClick={() => go(rec)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy}>Request exception</button></FormActions>
      </form></div>
    </Page>
  );
}
