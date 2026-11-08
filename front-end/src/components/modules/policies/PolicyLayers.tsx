import { useState } from "react";
import { Icon, Ring, StatusChip, Table } from "@/components/ui";
import { LayerFoot } from "@/hooks/useLayer";
import type { LayerApi } from "@/components/shell/LayerProvider";
import { DATA } from "@/lib/data";
import { getMe, wsLog } from "@/lib/audit";
import { bumpData, useData } from "@/lib/store";
import { clampText } from "@/lib/security";
import * as svc from "@/services/policies";

const Req = () => <span style={{ color: "var(--bad-ink)" }}>*</span>;
const FAIL = "Something went wrong. Please try again.";

/* ---- drawer (source polDrawer) ---- */
function DrawerBody({ id, L }: { id: string; L: LayerApi }) {
  useData();
  const p = svc.findPolicy(id);
  if (!p) return <p className="field help">Policy not found.</p>;
  svc.polInit(p);
  const transition = async (to: string) => {
    try {
      const { from } = await svc.transitionPolicy(id, to, getMe().name);
      wsLog("policy.status.changed", p.name + ": " + from + " → " + to, "Policy");
      L.closeLayer(); L.toast(p.name + " " + (to === "Active" ? "published" : to.toLowerCase())); bumpData();
    } catch { L.toast(FAIL, false); }
  };
  const newRev = async () => {
    try {
      await svc.startRevision(id, getMe().name);
      wsLog("policy.revision.started", p.name, "Policy");
      L.closeLayer(); L.toast("New revision started"); bumpData();
    } catch { L.toast(FAIL, false); }
  };
  const remind = async () => {
    try {
      const out = await svc.remindOutstanding(id);
      wsLog("policy.acceptance.reminded", p.name + ", " + out + " outstanding", "Policy");
      L.toast("Reminder sent to " + out + " people");
    } catch { L.toast(FAIL, false); }
  };
  const transitions = p.status === "Draft"
    ? <button className="btn btn-secondary sm" onClick={() => transition("In review")}><Icon name="ext" />Submit for review</button>
    : p.status === "In review"
      ? <><button className="btn btn-primary sm" onClick={() => transition("Active")}><Icon name="check" />Approve &amp; publish</button><button className="btn btn-secondary sm" onClick={() => transition("Draft")}><Icon name="back" />Return to draft</button></>
      : <button className="btn btn-secondary sm" onClick={newRev}><Icon name="plus" />New revision</button>;
  const a = p.acceptance;
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}><div style={{ fontSize: 16, fontWeight: 600 }}>{p.name}</div><div style={{ marginLeft: "auto" }}><StatusChip s={p.status} /></div></div>
      <dl className="meta-grid"><dt>Version</dt><dd>{p.ver}</dd><dt>Owner</dt><dd>{p.owner}</dd><dt>Next review</dt><dd>{p.review}</dd></dl>
      <div className="hr"></div><div className="sectitle">Workflow</div>
      <div className="btngrp">{transitions}<button className="btn btn-ghost sm" onClick={() => openPolicyForm(L, id)}><Icon name="team" />Edit</button></div>
      <div className="hr"></div><div className="sectitle">Approvers &amp; reviewers</div>
      <Table cols={[{ t: "Step" }, { t: "Reviewer" }, { t: "Role" }]}>
        {p.reviewers.map((r: { step: number; name: string; role: string }, i: number) => <tr key={i}><td className="num">{r.step}</td><td className="strong">{r.name}</td><td>{r.role}</td></tr>)}
      </Table>
      <div style={{ marginTop: 8 }}><button className="btn btn-ghost sm" onClick={() => openAddReviewer(L, id)}><Icon name="plus" />Add approval step</button></div>
      <div className="hr"></div><div className="sectitle">Acceptance</div>
      {a.required ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <Ring pct={Math.round((a.done / a.required) * 100)} size={60} color="var(--accent)" />
            <div><div style={{ fontWeight: 600 }}>{a.done} / {a.required} accepted</div><div style={{ fontSize: 12, color: "var(--muted)" }}>Workforce acknowledgement</div></div>
          </div>
          <button className="btn btn-ghost sm" onClick={remind}><Icon name="bell" />Remind outstanding</button>
        </>
      ) : <p className="field help">Acceptance tracking begins once the policy is published.</p>}
      <div className="hr"></div><div className="sectitle">Mapped controls</div>
      <div className="btngrp" style={{ marginBottom: 8 }}>
        {p.mappedControls.length ? p.mappedControls.map((c: string, i: number) => <span key={i} className="tag num">{c}</span>) : <span style={{ color: "var(--faint)", fontSize: 13 }}>None mapped</span>}
      </div>
      <button className="btn btn-ghost sm" onClick={() => openMapControl(L, id)}><Icon name="plus" />Map control</button>
      <div className="hr"></div><div className="sectitle">Version history</div>
      <Table cols={[{ t: "Version" }, { t: "Date" }, { t: "By" }, { t: "Note" }]}>
        {p.history.slice().reverse().map((h: { ver: string; at: string; by: string; note: string }, i: number) => <tr key={i}><td className="strong num">{h.ver}</td><td>{h.at}</td><td>{h.by}</td><td>{h.note}</td></tr>)}
      </Table>
    </>
  );
}
export function openPolicyDrawer(L: LayerApi, id: string) {
  const p = svc.findPolicy(id);
  if (p) svc.polInit(p);
  L.openDrawer("Policy " + id, "", <DrawerBody id={id} L={L} />);
}

/* ---- add approval step (source polAddReviewer/polDoAddReviewer) ---- */
function AddReviewerForm({ id, L }: { id: string; L: LayerApi }) {
  const [name, setName] = useState(""); const [role, setRole] = useState("Reviewer"); const [err, setErr] = useState(false);
  const submit = async () => {
    const n = clampText(name, 80);
    if (!n) { setErr(true); return; }
    const p = svc.findPolicy(id);
    if (!p) { L.closeLayer(); return; }
    try {
      await svc.addReviewer(id, n, clampText(role, 60));
      wsLog("policy.reviewer.added", n + " → " + p.name, "Policy");
      L.closeLayer(); openPolicyDrawer(L, id);
    } catch { L.toast(FAIL, false); }
  };
  return (
    <>
      <div>
        <div className="field"><label htmlFor="pr-name">Reviewer <Req /></label><input className="input" id="pr-name" data-focus maxLength={80} placeholder="e.g. A. Rivera" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={err} aria-describedby={err ? "pr-err" : undefined} /></div>
        <div className="field"><label htmlFor="pr-role">Role</label><input className="input" id="pr-role" maxLength={60} value={role} onChange={(e) => setRole(e.target.value)} /></div>
        <p className="field help" id="pr-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>Reviewer name is required.</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={L.closeLayer}>Cancel</button><button className="btn btn-primary" onClick={submit}>Add step</button></LayerFoot>
    </>
  );
}
export const openAddReviewer = (L: LayerApi, id: string) => L.openModal("Add approval step", <AddReviewerForm id={id} L={L} />);

/* ---- map control (source polMapControl/polDoMapControl) ---- */
function MapControlForm({ id, L }: { id: string; L: LayerApi }) {
  const ids: string[] = DATA.controls.map((c) => c.id);
  const [v, setV] = useState(ids[0] || "");
  const submit = async () => {
    const p = svc.findPolicy(id);
    if (!p || !ids.includes(v)) { L.closeLayer(); return; } // enum check against DATA (source would have pushed undefined when empty)
    try {
      await svc.mapControl(id, v);
      wsLog("policy.control.mapped", p.name + " → " + v, "Policy");
      L.closeLayer(); openPolicyDrawer(L, id);
    } catch { L.toast(FAIL, false); }
  };
  return (
    <>
      <div className="field"><label htmlFor="pm-ctrl">Control</label><select className="select" id="pm-ctrl" data-focus value={v} onChange={(e) => setV(e.target.value)}>{ids.map((c) => <option key={c}>{c}</option>)}</select></div>
      <LayerFoot><button className="btn btn-secondary" onClick={L.closeLayer}>Cancel</button><button className="btn btn-primary" onClick={submit}>Map</button></LayerFoot>
    </>
  );
}
export const openMapControl = (L: LayerApi, id: string) => L.openModal("Map control, " + id, <MapControlForm id={id} L={L} />);

/* ---- create / edit policy (source polFormBody, polCreate/polSave, polEdit/polUpdate) ---- */
function PolicyForm({ id, L }: { id?: string; L: LayerApi }) {
  const p = id ? svc.findPolicy(id) : undefined;
  const [name, setName] = useState(p ? p.name : ""); const [owner, setOwner] = useState(p ? p.owner : "J. Avery"); const [review, setReview] = useState(p ? p.review : "Not started");
  const [err, setErr] = useState(false);
  const submit = async () => {
    const n = clampText(name, 160);
    if (!n) { setErr(true); return; }
    try {
      if (id && p) {
        await svc.updatePolicy(id, { name: n, owner: clampText(owner, 80), review: clampText(review, 40) });
        wsLog("policy.updated", n, "Policy");
        L.closeLayer(); L.toast("Changes saved"); bumpData();
      } else {
        await svc.createPolicy({ name: n, owner: clampText(owner, 80), review: clampText(review, 40), actor: getMe().name });
        wsLog("policy.created", n, "Policy");
        L.closeLayer(); L.toast("Policy created"); bumpData();
      }
    } catch { L.toast(FAIL, false); }
  };
  return (
    <>
      <div>
        <div className="field"><label htmlFor="pl-name">Policy name <Req /></label><input className="input" id="pl-name" data-focus maxLength={160} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Remote Working Policy" aria-invalid={err} aria-describedby={err ? "pl-err" : undefined} /></div>
        <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div className="field"><label htmlFor="pl-owner">Owner</label><input className="input" id="pl-owner" maxLength={80} value={owner} onChange={(e) => setOwner(e.target.value)} /></div>
          <div className="field"><label htmlFor="pl-review">Next review</label><input className="input" id="pl-review" maxLength={40} value={review} onChange={(e) => setReview(e.target.value)} /></div>
        </div>
        <p className="field help" id="pl-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>Policy name is required.</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={L.closeLayer}>Cancel</button><button className="btn btn-primary" onClick={submit}>{id ? "Save changes" : "Create policy"}</button></LayerFoot>
    </>
  );
}
export const openPolicyForm = (L: LayerApi, id?: string) => L.openModal(id ? "Edit policy" : "New policy", <PolicyForm id={id} L={L} />);
