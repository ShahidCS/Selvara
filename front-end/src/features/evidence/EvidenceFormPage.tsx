import { useEffect, useRef, useState, type FormEvent } from "react";
import { Empty, FormActions, FormMessage, FormSection, Page } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";
import { getMe } from "@/lib/audit";
import { bumpData, useApp, useData } from "@/lib/store";
import { useGo } from "@/lib/route";
import { clampText } from "@/lib/security";
import { FAIL_MSG, uiMessage } from "@/lib/grcSod";
import * as svc from "@/features/evidence/services/evidence";
import { Req } from "./EvidenceForms";

/** Add (`/ws/evidence/new`) and edit (`/ws/evidence/:id/edit`) as a page. Same fields, validation and service calls as the dialog it replaces. */
export function EvidenceFormPage({ id }: { id?: string }) {
  useData(); useApp((s) => s.role);
  const L = useLayer(); const go = useGo();
  const e = id ? svc.findEvidence(id) : undefined;
  const init = { name: e ? String(e.name) : "", type: e ? String(e.type) : svc.EVIDENCE_TYPES[0], note: e ? String(e.note ?? "") : "" };
  const [name, setName] = useState(init.name); const [type, setType] = useState(init.type); const [note, setNote] = useState(init.note);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const dirty = !busy && (name !== init.name || type !== init.type || note !== init.note);
  const { allowLeave } = useUnsavedGuard(dirty, L);
  const ref = useRef<HTMLInputElement>(null); useEffect(() => { ref.current?.focus(); }, []);
  const list = "/ws/evidence";
  const back = { href: id ? `${list}/${encodeURIComponent(id)}` : list, label: id ? "Evidence item" : "Evidence" };
  if (id && !e) return <Page title="Evidence not found" back={{ href: list, label: "Evidence" }}><Empty icon="evidence" title="No such evidence">There is no evidence with the ID &ldquo;{id}&rdquo;.</Empty></Page>;
  const denied = svc.whyCannotWrite();
  if (denied) return <Page title={id ? "Edit evidence" : "Add evidence"} back={back}><Empty icon="evidence" title="You cannot do this">{denied}</Empty></Page>;
  const by = e ? e.by : getMe().name; // collector is always the signed-in person; it cannot be typed or edited

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const n = clampText(name, 160);
    if (!n) { setErr("Name is required."); return; }
    const t = svc.EVIDENCE_TYPES.includes(type) ? type : svc.EVIDENCE_TYPES[0]; // enum check
    setBusy(true);
    try {
      if (id) { await svc.updateEvidence(id, { name: n, type: t, note: clampText(note, 2000) }); allowLeave(); L.toast("Changes saved"); bumpData(); go(`${list}/${encodeURIComponent(id)}`); }
      else { const r = await svc.createEvidence({ name: n, type: t, note: clampText(note, 2000) }); allowLeave(); L.toast("Evidence added"); bumpData(); go(`${list}/${encodeURIComponent(r.id)}`); }
    } catch (x) { setBusy(false); setErr(""); L.toast(uiMessage(x) || FAIL_MSG, false); }
  };
  return (
    <Page title={id ? "Edit evidence" : "Add evidence"} sub={id ? e?.name : "Then attach the file and request a review from its page."} back={back}>
      <div className="scroll rec-scroll"><form className="rec-form" onSubmit={submit} noValidate>
        <FormSection n={1} title="Evidence" note="What it is and what kind of record.">
          <div className="field"><label htmlFor="ev-name">Name <Req /></label><input ref={ref} className="input" id="ev-name" maxLength={160} value={name} onChange={(x) => setName(x.target.value)} placeholder="e.g. Access review Q4 sign-off" aria-invalid={!!err} aria-describedby={err ? "ev-err" : undefined} /></div>
          <div className="field"><label htmlFor="ev-type">Type</label><select className="select" id="ev-type" value={type} onChange={(x) => setType(x.target.value)}>{svc.EVIDENCE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
        </FormSection>
        <FormSection n={2} title="Collection and notes" note="Who collected it and anything a reviewer should know.">
          <div className="field"><label htmlFor="ev-by">Collected by</label><input className="input" id="ev-by" value={by} readOnly aria-describedby="ev-by-h" /><p className="field help" id="ev-by-h">Set automatically. A reviewer other than the collector must accept the evidence.</p></div>
          <div className="field"><label htmlFor="ev-note">Notes</label><textarea className="input" id="ev-note" rows={4} maxLength={2000} style={{ resize: "vertical" }} value={note} onChange={(x) => setNote(x.target.value)} /></div>
        </FormSection>
        {err ? <FormMessage id="ev-err">{err}</FormMessage> : null}
        <FormActions><button type="button" className="btn btn-secondary" onClick={() => go(back.href)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy}>{id ? "Save changes" : "Add evidence"}</button></FormActions>
      </form></div>
    </Page>
  );
}
