import { useEffect, useRef, useState, type FormEvent } from "react";
import { Empty, FormActions, FormMessage, FormSection, Page } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";
import { wsLog } from "@/lib/audit";
import { bumpData, useApp } from "@/lib/store";
import { useGo } from "@/lib/route";
import { clampText } from "@/lib/security";
import { FAIL_MSG, uiMessage } from "@/lib/grcSod";
import * as svc from "@/services/audits";
import { Req } from "./AuditModals";

/** `/ws/audits/new`: start an audit. Same fields, validation and service call as the dialog it replaces. */
export function AuditFormPage() {
  useApp((s) => s.role);
  const L = useLayer(); const go = useGo();
  const [name, setName] = useState(""); const [fw, setFw] = useState(svc.AUDIT_FWS[0]); const [auditor, setAuditor] = useState(""); const [scope, setScope] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const dirty = !busy && (name !== "" || fw !== svc.AUDIT_FWS[0] || auditor !== "" || scope !== "");
  const { allowLeave } = useUnsavedGuard(dirty, L);
  const ref = useRef<HTMLInputElement>(null); useEffect(() => { ref.current?.focus(); }, []);
  const back = { href: "/ws/audits", label: "Audits" };
  const denied = svc.whyCannotManage();
  if (denied) return <Page title="New audit" back={back}><Empty icon="audits" title="You cannot do this">{denied}</Empty></Page>;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = clampText(name, 120);
    if (!n) { setErr("Audit name is required."); return; }
    setBusy(true);
    try {
      const { id } = await svc.createAudit({ name: n, fw: svc.AUDIT_FWS.includes(fw) ? fw : svc.AUDIT_FWS[0], auditor: clampText(auditor, 120), scope: clampText(scope, 500) });
      wsLog("audit.created", n, "Audit"); allowLeave(); L.toast("Audit created"); bumpData(); go("/ws/audits/" + encodeURIComponent(id));
    } catch (x) { setBusy(false); setErr(""); L.toast(uiMessage(x) || FAIL_MSG, false); }
  };
  return (
    <Page title="New audit" sub="Then add requests, share with the auditor and track findings from its page." back={back}>
      <div className="scroll rec-scroll"><form className="rec-form" onSubmit={submit} noValidate>
        <FormSection n={1} title="Audit" note="What is being audited, and against which framework.">
          <div className="field"><label htmlFor="na-name">Audit name <Req /></label><input ref={ref} className="input" id="na-name" placeholder="e.g. PCI DSS readiness" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!err} aria-describedby={err ? "na-err" : undefined} /></div>
          <div className="field"><label htmlFor="na-fw">Framework</label><select className="select" id="na-fw" value={fw} onChange={(e) => setFw(e.target.value)}>{svc.AUDIT_FWS.map((f) => <option key={f}>{f}</option>)}</select></div>
        </FormSection>
        <FormSection n={2} title="Auditor and scope" note="Who performs it and what it covers.">
          <div className="field"><label htmlFor="na-auditor">Auditor</label><input className="input" id="na-auditor" placeholder="e.g. Internal Audit" maxLength={120} value={auditor} onChange={(e) => setAuditor(e.target.value)} /></div>
          <div className="field"><label htmlFor="na-scope">Scope</label><textarea className="input" id="na-scope" rows={3} placeholder="What this audit covers" maxLength={500} style={{ resize: "vertical" }} value={scope} onChange={(e) => setScope(e.target.value)} /></div>
        </FormSection>
        {err ? <FormMessage id="na-err">{err}</FormMessage> : null}
        <FormActions><button type="button" className="btn btn-secondary" onClick={() => go("/ws/audits")}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy}>Create audit</button></FormActions>
      </form></div>
    </Page>
  );
}
