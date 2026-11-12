import { useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui";
import { LayerFoot } from "@/hooks/useLayer";
import type { LayerApi } from "@/components/shell/LayerProvider";
import { DATA } from "@/lib/data";
import { bumpData, useData } from "@/lib/store";
import { getActor } from "@/lib/sod";
import { clampText } from "@/lib/security";
import { samePerson, uiMessage } from "@/lib/grcSod";
import * as svc from "@/features/policies/services/policies";

export const Req = () => <span style={{ color: "var(--bad-ink)" }}>*</span>;
export const Why = ({ t }: { t: string | null }) => (t ? <p className="field help" style={{ margin: "6px 0 0", display: "flex", gap: 6, alignItems: "flex-start" }} role="note"><Icon name="alert" /><span>{t}</span></p> : null);
export const VER_TONE: Record<string, string> = { Published: "ok", Approved: "ok", "In review": "warn", Draft: "neutral", Superseded: "neutral" };

/* ---- generic confirm-with-reason modal ---- */
function ReasonForm({ L, label, min, confirm, extra, run }: {
  L: LayerApi; label: string; min: number; confirm: string; extra?: (set: (k: string, v: string) => void, v: Record<string, string>) => ReactNode;
  run: (reason: string, v: Record<string, string>) => Promise<string>;
}) {
  const [reason, setReason] = useState(""); const [v, setV] = useState<Record<string, string>>({}); const [err, setErr] = useState("");
  const submit = async () => {
    const r = clampText(reason, 500);
    if (r.length < min) { setErr(`${label} must be at least ${min} characters.`); return; }
    try { const msg = await run(r, v); L.closeLayer(); L.toast(msg); bumpData(); } catch (e) { setErr(""); L.toast(uiMessage(e), false); }
  };
  return (
    <>
      <div>
        {extra ? extra((k, x) => setV((o) => ({ ...o, [k]: x })), v) : null}
        <div className="field"><label htmlFor="pol-reason">{label} <Req /></label><textarea className="input" id="pol-reason" data-focus rows={3} maxLength={500} style={{ resize: "vertical" }} value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={!!err} aria-describedby={err ? "pol-reason-err" : undefined} /></div>
        <p className="field help" id="pol-reason-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={L.closeLayer}>Cancel</button><button className="btn btn-primary" onClick={submit}>{confirm}</button></LayerFoot>
    </>
  );
}
/** The policy page re-renders from the data store, so a decision dialog only closes and confirms. */
export const reasonModal = (L: LayerApi, title: string, props: Omit<Parameters<typeof ReasonForm>[0], "L">) =>
  L.openModal(title, <ReasonForm L={L} {...props} />);

/* ---- submit for review: pick the NAMED approver ---- */
export function SubmitForm({ id, L }: { id: string; L: LayerApi }) {
  useData();
  const p = svc.findPolicy(id); const w = p ? svc.workVersion(p) : undefined;
  const opts = svc.eligibleApprovers().filter((x) => w && ![w.author, w.lastEditor, ...w.editors].some((e) => samePerson(e, x.name)));
  const [name, setName] = useState(opts[0]?.name || "");
  const submit = async () => {
    try { await svc.submitForReview(id, name); L.closeLayer(); L.toast("Submitted for review"); bumpData(); } catch (e) { L.toast(uiMessage(e), false); }
  };
  return (
    <>
      <div>
        <p style={{ margin: "0 0 8px" }}>Name the person who will approve and publish this version. Eligible: admin or owner role, and not the author or a last editor.</p>
        {opts.length ? (
          <div className="field"><label htmlFor="pol-appr">Named approver <Req /></label><select className="select" id="pol-appr" data-focus value={name} onChange={(e) => setName(e.target.value)}>{opts.map((o) => <option key={o.name} value={o.name}>{o.name} ({o.roleName})</option>)}</select></div>
        ) : <p className="field help" role="alert" style={{ color: "var(--bad-ink)" }}>No eligible approver: every admin/owner is the author or a last editor.</p>}
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={L.closeLayer}>Cancel</button><button className="btn btn-primary" disabled={!opts.length} onClick={submit}>Submit for review</button></LayerFoot>
    </>
  );
}

/* ---- reassign owner (admin only, reason logged) ---- */
export function ReassignForm({ id, L }: { id: string; L: LayerApi }) {
  const p = svc.findPolicy(id);
  const opts = svc.eligibleApprovers().filter((x) => p && !samePerson(x.name, p.owner) && !samePerson(x.name, getActor().name));
  const [name, setName] = useState(opts[0]?.name || ""); const [reason, setReason] = useState(""); const [err, setErr] = useState("");
  const submit = async () => {
    if (clampText(reason, 500).length < 10) { setErr("Give a reason of at least 10 characters."); return; }
    try { await svc.reassignOwner(id, name, clampText(reason, 500)); L.closeLayer(); L.toast("Ownership reassigned"); bumpData(); } catch (e) { L.toast(uiMessage(e), false); }
  };
  return (
    <>
      <div>
        <div className="field"><label htmlFor="pol-succ">Successor <Req /></label><select className="select" id="pol-succ" data-focus value={name} onChange={(e) => setName(e.target.value)}>{opts.map((o) => <option key={o.name} value={o.name}>{o.name} ({o.roleName})</option>)}</select></div>
        <div className="field"><label htmlFor="pol-rs">Reason (role change, leaver, restructure) <Req /></label><textarea className="input" id="pol-rs" rows={2} maxLength={500} style={{ resize: "vertical" }} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        <p className="field help">The previous owner loses edit rights immediately. Recorded in the change log and audit log.</p>
        <p className="field help" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={L.closeLayer}>Cancel</button><button className="btn btn-primary" disabled={!opts.length} onClick={submit}>Reassign</button></LayerFoot>
    </>
  );
}

/* ---- map control ---- */
function MapControlForm({ id, L }: { id: string; L: LayerApi }) {
  const ids: string[] = DATA.controls.map((c) => c.id);
  const [v, setV] = useState(ids[0] || "");
  const submit = async () => {
    if (!svc.findPolicy(id) || !ids.includes(v)) { L.closeLayer(); return; }
    try { await svc.mapControl(id, v); L.closeLayer(); bumpData(); } catch (e) { L.toast(uiMessage(e), false); }
  };
  return (
    <>
      <div className="field"><label htmlFor="pm-ctrl">Control</label><select className="select" id="pm-ctrl" data-focus value={v} onChange={(e) => setV(e.target.value)}>{ids.map((c) => <option key={c}>{c}</option>)}</select></div>
      <LayerFoot><button className="btn btn-secondary" onClick={L.closeLayer}>Cancel</button><button className="btn btn-primary" onClick={submit}>Map</button></LayerFoot>
    </>
  );
}
export const openMapControl = (L: LayerApi, id: string) => L.openModal("Map control, " + id, <MapControlForm id={id} L={L} />);
