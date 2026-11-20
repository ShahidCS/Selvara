import { useSyncExternalStore } from "react";
import { API_ON } from "@/lib/rbac";
import { EVIDENCE_FILE_MAX, EVIDENCE_FILE_TYPES } from "@/lib/rulesWs";
import { UPLOAD_DEFAULT } from "@/lib/security";
import { wsMeta } from "@/services/ws";
import { useState } from "react";
import { LayerFoot, useLayer } from "@/hooks/useLayer";
import { bumpData } from "@/lib/store";
import { clampText, safeFileName, validateUpload } from "@/lib/security";
import { uiMessage } from "@/lib/grcSod";
import * as svc from "@/features/evidence/services/evidence";

export const Req = () => <span style={{ color: "var(--bad-ink)" }}>*</span>;

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
  if (API_ON) return <UploadFile id={id} close={close} />;
  return <AttachName id={id} close={close} />;
}
/** Production: a real file, checked here for type and size and again on the server (content too), stored privately for the company. */
function UploadFile({ id, close }: { id: string; close: () => void }) {
  const L = useLayer(); const configured = useSyncExternalStore(wsMeta.subscribe, () => wsMeta.get().filesConfigured, () => false);
  const [file, setFile] = useState<File | null>(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const rule = { ...UPLOAD_DEFAULT, maxBytes: EVIDENCE_FILE_MAX, exts: Object.keys(EVIDENCE_FILE_TYPES) };
  const submit = async () => {
    if (busy) return; if (!file) { setErr("Choose a file."); return; }
    const bad = validateUpload({ name: file.name, size: file.size }, rule); if (bad) { setErr(bad); return; }
    setBusy(true);
    try { await svc.uploadAttachment(id, file); close(); L.toast("File attached"); } catch (x) { setErr(uiMessage(x)); setBusy(false); }
  };
  if (!configured) return <><p style={{ margin: 0 }}>File storage is not configured yet. The platform owner creates the private evidence bucket first (SUPABASE.md section 4d).</p><LayerFoot><button className="btn btn-secondary" onClick={close}>Close</button></LayerFoot></>;
  return (
    <>
      <div>
        <div className="field"><label htmlFor="ev-file">File <Req /></label><input className="input" id="ev-file" data-focus type="file" accept={rule.exts.map((x) => "." + x).join(",")} onChange={(x) => { setFile(x.target.files?.[0] ?? null); setErr(""); }} aria-invalid={!!err} aria-describedby="ev-filehelp ev-fnerr" /></div>
        <p className="field help" id="ev-filehelp">{rule.exts.join(", ")}; up to {EVIDENCE_FILE_MAX / 1024 / 1024} MB. Stored privately for your company; the file&apos;s content is checked.</p>
        <p className="field help" id="ev-fnerr" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={submit}>{busy ? "Uploading…" : "Upload"}</button></LayerFoot>
    </>
  );
}
function AttachName({ id, close }: { id: string; close: () => void }) {
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
