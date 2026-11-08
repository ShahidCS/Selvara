import { useState } from "react";
import { LayerFoot, useLayer } from "@/hooks/useLayer";
import { getMe, wsLog } from "@/lib/audit";
import { bumpData, getModState, setModState } from "@/lib/store";
import { clampText, safeFileName, validateUpload } from "@/lib/security";
import * as svc from "@/services/evidence";

const Req = () => <span style={{ color: "var(--bad-ink)" }}>*</span>;
const FAIL = "Something went wrong. Please try again.";
export const SEL_KEY = "evidence.sel";

/** Add / edit evidence modal (source evFormBody, evCreate/evSave, evEdit/evUpdate). */
export function EvidenceForm({ id, close }: { id?: string; close: () => void }) {
  const L = useLayer();
  const e = id ? svc.findEvidence(id) : undefined;
  const [name, setName] = useState(e ? e.name : "");
  const [type, setType] = useState(e ? e.type : svc.EVIDENCE_TYPES[0]);
  const [by, setBy] = useState(e ? e.by : "J. Avery");
  const [note, setNote] = useState(e ? e.note : "");
  const [err, setErr] = useState(false);
  const submit = async () => {
    const n = clampText(name, 160);
    if (!n) { setErr(true); return; }
    const t = svc.EVIDENCE_TYPES.includes(type) ? type : svc.EVIDENCE_TYPES[0]; // enum check
    try {
      if (id && e) {
        await svc.updateEvidence(id, { name: n, type: t, by: clampText(by, 80), note: clampText(note, 2000) });
        wsLog("evidence.updated", n, "Control");
        close(); L.toast("Changes saved"); setModState(SEL_KEY, id); bumpData();
      } else {
        const r = await svc.createEvidence({ name: n, type: t, by: clampText(by, 80), note: clampText(note, 2000), actor: getMe().name });
        wsLog("evidence.created", n, "Control");
        close(); L.toast("Evidence added"); setModState(SEL_KEY, r.id); bumpData();
      }
    } catch { L.toast(FAIL, false); }
  };
  return (
    <>
      <div>
        <div className="field"><label htmlFor="ev-name">Name <Req /></label><input className="input" id="ev-name" data-focus maxLength={160} value={name} onChange={(x) => setName(x.target.value)} placeholder="e.g. Access review Q4 sign-off" aria-invalid={err} aria-describedby={err ? "ev-err" : undefined} /></div>
        <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div className="field"><label htmlFor="ev-type">Type</label><select className="select" id="ev-type" value={type} onChange={(x) => setType(x.target.value)}>{svc.EVIDENCE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
          <div className="field"><label htmlFor="ev-by">Collected by</label><input className="input" id="ev-by" maxLength={80} value={by} onChange={(x) => setBy(x.target.value)} /></div>
        </div>
        <div className="field"><label htmlFor="ev-note">Notes</label><textarea className="input" id="ev-note" rows={3} maxLength={2000} style={{ resize: "vertical" }} value={note} onChange={(x) => setNote(x.target.value)} /></div>
        <p className="field help" id="ev-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>Name is required.</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={submit}>{id ? "Save changes" : "Add evidence"}</button></LayerFoot>
    </>
  );
}

/** Delete confirmation (source evDelete/evDoDelete). */
export function DeleteEvidence({ id, close }: { id: string; close: () => void }) {
  const L = useLayer();
  const e = svc.findEvidence(id);
  const del = async () => {
    if (!e) { close(); return; }
    try {
      await svc.deleteEvidence(id);
      if (getModState<string | null>(SEL_KEY, null) === id) setModState(SEL_KEY, null); // source: if(EVSEL===id)EVSEL=null
      wsLog("evidence.deleted", e.name, "Control");
      close(); L.toast("Evidence deleted"); bumpData();
    } catch { L.toast(FAIL, false); }
  };
  return (
    <>
      <p style={{ margin: 0 }}>{e ? <>Delete <strong>{e.name}</strong> ({id}) and its attachments and history? This cannot be undone in the demo.</> : "Evidence not found."}</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-danger" onClick={del}>Delete</button></LayerFoot>
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
      wsLog("evidence.attachment.added", name + " → " + e.name, "Control");
      close(); L.toast("File attached"); bumpData();
    } catch { L.toast(FAIL, false); }
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
      const e = await svc.createVersion(id, n, getMe().name);
      wsLog("evidence.version.created", e.name + " v" + e.ver, "Control");
      close(); L.toast("Version v" + e.ver + " created"); bumpData();
    } catch { L.toast(FAIL, false); }
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
