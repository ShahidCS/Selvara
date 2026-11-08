import { useState } from "react";
import { LayerFoot, useLayer } from "@/hooks/useLayer";
import { getMe } from "@/lib/audit";
import { bumpData, getModState, setModState } from "@/lib/store";
import { clampText, safeFileName, validateUpload } from "@/lib/security";
import { uiMessage } from "@/lib/grcSod";
import * as svc from "@/services/evidence";

const Req = () => <span style={{ color: "var(--bad-ink)" }}>*</span>;
export const SEL_KEY = "evidence.sel";

/** Add / edit evidence modal (source evFormBody, evCreate/evSave, evEdit/evUpdate). */
export function EvidenceForm({ id, close }: { id?: string; close: () => void }) {
  const L = useLayer();
  const e = id ? svc.findEvidence(id) : undefined;
  const [name, setName] = useState(e ? e.name : "");
  const [type, setType] = useState(e ? e.type : svc.EVIDENCE_TYPES[0]);
  const by = e ? e.by : getMe().name; // collector is always the signed-in person; it cannot be typed or edited
  const [note, setNote] = useState(e ? e.note : "");
  const [err, setErr] = useState(false);
  const submit = async () => {
    const n = clampText(name, 160);
    if (!n) { setErr(true); return; }
    const t = svc.EVIDENCE_TYPES.includes(type) ? type : svc.EVIDENCE_TYPES[0]; // enum check
    try {
      if (id && e) {
        await svc.updateEvidence(id, { name: n, type: t, note: clampText(note, 2000) });
        close(); L.toast("Changes saved"); setModState(SEL_KEY, id); bumpData();
      } else {
        const r = await svc.createEvidence({ name: n, type: t, note: clampText(note, 2000) });
        close(); L.toast("Evidence added"); setModState(SEL_KEY, r.id); bumpData();
      }
    } catch (x) { L.toast(uiMessage(x), false); }
  };
  return (
    <>
      <div>
        <div className="field"><label htmlFor="ev-name">Name <Req /></label><input className="input" id="ev-name" data-focus maxLength={160} value={name} onChange={(x) => setName(x.target.value)} placeholder="e.g. Access review Q4 sign-off" aria-invalid={err} aria-describedby={err ? "ev-err" : undefined} /></div>
        <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div className="field"><label htmlFor="ev-type">Type</label><select className="select" id="ev-type" value={type} onChange={(x) => setType(x.target.value)}>{svc.EVIDENCE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
          <div className="field"><label htmlFor="ev-by">Collected by</label><input className="input" id="ev-by" value={by} readOnly aria-describedby="ev-by-h" /><p className="field help" id="ev-by-h">Set automatically. A reviewer other than the collector must accept the evidence.</p></div>
        </div>
        <div className="field"><label htmlFor="ev-note">Notes</label><textarea className="input" id="ev-note" rows={3} maxLength={2000} style={{ resize: "vertical" }} value={note} onChange={(x) => setNote(x.target.value)} /></div>
        <p className="field help" id="ev-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>Name is required.</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={submit}>{id ? "Save changes" : "Add evidence"}</button></LayerFoot>
    </>
  );
}

/** Step 1 of deletion (admin + reason). A second, different admin must approve before anything is removed. */
export function DeleteEvidence({ id, close }: { id: string; close: () => void }) {
  const L = useLayer();
  const e = svc.findEvidence(id);
  const [reason, setReason] = useState(""); const [err, setErr] = useState("");
  const why = e ? svc.whyCannotRequestDelete(e) : "Evidence not found.";
  const submit = async () => {
    if (clampText(reason, 500).length < 15) { setErr("Give a reason of at least 15 characters."); return; }
    try { await svc.requestDelete(id, clampText(reason, 500)); close(); L.toast("Deletion requested; a second admin must approve"); bumpData(); } catch (x) { L.toast(uiMessage(x), false); }
  };
  return (
    <>
      <div>
        <p style={{ margin: "0 0 8px" }}>{e ? <>Request deletion of <strong>{e.name}</strong> ({id}) with its attachments and history. Nothing is deleted until a second admin approves.</> : "Evidence not found."}</p>
        {why ? <p className="field help" role="note">{why}</p> : null}
        <div className="field"><label htmlFor="ev-del-r">Reason <Req /></label><textarea className="input" id="ev-del-r" data-focus rows={3} maxLength={500} style={{ resize: "vertical" }} value={reason} onChange={(x) => setReason(x.target.value)} /></div>
        <p className="field help" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-danger" disabled={!!why} onClick={submit}>Request deletion</button></LayerFoot>
    </>
  );
}

/** Reviewer decision on a pending deletion (approve = second admin) or on collected evidence (accept / reject). */
export function ReasonModal({ title, label, min, confirm, danger, close, run }: { title?: string; label: string; min: number; confirm: string; danger?: boolean; close: () => void; run: (reason: string) => Promise<string> }) {
  const L = useLayer();
  const [reason, setReason] = useState(""); const [err, setErr] = useState("");
  const submit = async () => {
    const r = clampText(reason, 500);
    if (r.length < min) { setErr(`${label} must be at least ${min} characters.`); return; }
    try { const m = await run(r); close(); L.toast(m); bumpData(); } catch (x) { L.toast(uiMessage(x), false); }
  };
  return (
    <>
      <div>
        {title ? <p style={{ margin: "0 0 8px" }}>{title}</p> : null}
        <div className="field"><label htmlFor="ev-rs">{label}{min ? <> <Req /></> : null}</label><textarea className="input" id="ev-rs" data-focus rows={3} maxLength={500} style={{ resize: "vertical" }} value={reason} onChange={(x) => setReason(x.target.value)} /></div>
        <p className="field help" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className={`btn ${danger ? "btn-danger" : "btn-primary"}`} onClick={submit}>{confirm}</button></LayerFoot>
    </>
  );
}

/** Attach file modal (source evAttach/evDoAttach). The prototype attaches a typed file name only; no file content is read or uploaded. */
export function AttachFile({ id, close }: { id: string; close: () => void }) {
  const L = useLayer();
  const [fn, setFn] = useState("");
  const [err, setErr] = useState("");
  const submit = async () => {
    const raw = fn.trim();
    if (!raw) { setErr("File name is required."); return; }
    const name = safeFileName(raw);
    // Extension allow-list (same gate a real upload would use). Names without an extension are accepted as in the prototype.
    if (name.includes(".")) { const bad = validateUpload({ name, size: 1 }); if (bad) { setErr(bad); return; } }
    const e = svc.findEvidence(id);
    if (!e) { close(); return; }
    try {
      await svc.addAttachment(id, name);
      close(); L.toast("File attached"); bumpData();
    } catch (x) { L.toast(uiMessage(x), false); }
  };
  return (
    <>
      <div>
        <div className="field"><label htmlFor="ev-fn">File name <Req /></label><input className="input" id="ev-fn" data-focus maxLength={120} placeholder="e.g. access-review-q4.pdf" value={fn} onChange={(x) => setFn(x.target.value)} aria-invalid={!!err} aria-describedby={err ? "ev-fnerr" : undefined} /></div>
        <p className="field help">Synthetic attachment for the prototype. No file is uploaded.</p>
        <p className="field help" id="ev-fnerr" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={submit}>Attach</button></LayerFoot>
    </>
  );
}

/** New version modal (source evNewVersion/evDoVersion). */
export function NewVersion({ id, close }: { id: string; close: () => void }) {
  const L = useLayer();
  const [note, setNote] = useState("");
  const [err, setErr] = useState(false);
  const submit = async () => {
    const n = clampText(note, 300);
    if (!n) { setErr(true); return; }
    if (!svc.findEvidence(id)) { close(); return; }
    try {
      const e = await svc.createVersion(id, n);
      close(); L.toast("Version v" + e.ver + " created"); bumpData();
    } catch (x) { L.toast(uiMessage(x), false); }
  };
  return (
    <>
      <div>
        <div className="field"><label htmlFor="ev-vnote">What changed <Req /></label><input className="input" id="ev-vnote" data-focus maxLength={300} placeholder="e.g. Refreshed export for Q4" value={note} onChange={(x) => setNote(x.target.value)} aria-invalid={err} aria-describedby={err ? "ev-vnerr" : undefined} /></div>
        <p className="field help" id="ev-vnerr" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>A note is required.</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={submit}>Create version</button></LayerFoot>
    </>
  );
}
