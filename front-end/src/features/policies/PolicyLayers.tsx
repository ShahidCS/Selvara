import { useState } from "react";
import type { ReactNode } from "react";
import { Chip, Icon, Ring, StatusChip, Table } from "@/components/ui";
import { LayerFoot } from "@/hooks/useLayer";
import type { LayerApi } from "@/components/shell/LayerProvider";
import { DATA } from "@/lib/data";
import { wsLog } from "@/lib/audit";
import { ackOf } from "@/lib/me";
import { bumpData, useApp, useData } from "@/lib/store";
import { getActor } from "@/lib/sod";
import { clampText } from "@/lib/security";
import { FAIL_MSG, isoDay, samePerson, uiMessage } from "@/lib/grcSod";
import { acknowledge } from "@/services/me";
import * as svc from "@/features/policies/services/policies";

const Req = () => <span style={{ color: "var(--bad-ink)" }}>*</span>;
const Why = ({ t }: { t: string | null }) => (t ? <p className="field help" style={{ margin: "6px 0 0" }} role="note"><Icon name="alert" /> {t}</p> : null);
const VER_TONE: Record<string, string> = { Published: "ok", Approved: "ok", "In review": "warn", Draft: "neutral", Superseded: "neutral" };

/* ---- generic confirm-with-reason modal ---- */
function ReasonForm({ L, label, min, confirm, extra, onDone, run }: {
  L: LayerApi; label: string; min: number; confirm: string; extra?: (set: (k: string, v: string) => void, v: Record<string, string>) => ReactNode;
  onDone: () => void; run: (reason: string, v: Record<string, string>) => Promise<string>;
}) {
  const [reason, setReason] = useState(""); const [v, setV] = useState<Record<string, string>>({}); const [err, setErr] = useState("");
  const submit = async () => {
    const r = clampText(reason, 500);
    if (r.length < min) { setErr(`${label} must be at least ${min} characters.`); return; }
    try { const msg = await run(r, v); L.closeLayer(); L.toast(msg); bumpData(); onDone(); } catch (e) { setErr(""); L.toast(uiMessage(e), false); }
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
const reasonModal = (L: LayerApi, id: string, title: string, props: Omit<Parameters<typeof ReasonForm>[0], "L" | "onDone">) =>
  L.openModal(title, <ReasonForm L={L} onDone={() => openPolicyDrawer(L, id)} {...props} />);

/* ---- submit for review: pick the NAMED approver ---- */
function SubmitForm({ id, L }: { id: string; L: LayerApi }) {
  useData();
  const p = svc.findPolicy(id); const w = p ? svc.workVersion(p) : undefined;
  const opts = svc.eligibleApprovers().filter((x) => w && ![w.author, w.lastEditor, ...w.editors].some((e) => samePerson(e, x.name)));
  const [name, setName] = useState(opts[0]?.name || "");
  const submit = async () => {
    try { await svc.submitForReview(id, name); L.closeLayer(); L.toast("Submitted for review"); bumpData(); openPolicyDrawer(L, id); } catch (e) { L.toast(uiMessage(e), false); }
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

/* ---- drawer ---- */
function DrawerBody({ id, L }: { id: string; L: LayerApi }) {
  useData(); useApp((s) => s.role);
  const p = svc.findPolicy(id);
  if (!p) return <p className="field help">Policy not found.</p>;
  svc.polInit(p);
  const me = getActor(); const manager = me.base === "admin" || me.base === "owner";
  const live = svc.liveVersion(p), work = svc.workVersion(p);
  const state = svc.policyState(p);
  const open = svc.openExceptions(p);
  const again = () => openPolicyDrawer(L, id);
  const run = async (fn: () => Promise<unknown>, ok: string, reopen = true) => {
    try { await fn(); L.toast(ok); bumpData(); if (reopen) again(); } catch (e) { L.toast(uiMessage(e), false); }
  };
  const remind = async () => { try { const out = await svc.remindOutstanding(id); L.toast("Reminder sent to " + out + " people"); } catch (e) { L.toast(uiMessage(e), false); } };
  const editWhy = svc.whyCannotEdit(p), submitWhy = svc.whyCannotSubmit(p), apprWhy = svc.whyCannotApprove(p), pubWhy = svc.whyCannotPublish(p), emWhy = svc.whyCannotEmergency(p);
  const a = p.acceptance; const myAck = live ? ackOf(me.name, p.id) : null;
  const btn = (label: string, icon: string, why: string | null, onClick: () => void, cls = "btn-secondary") =>
    <button className={`btn ${cls} sm`} disabled={!!why} title={why || undefined} onClick={onClick}><Icon name={icon} />{label}</button>;
  const canAckWhy = !live ? "Only a published policy can be acknowledged." : null;
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}><div style={{ fontSize: 16, fontWeight: 600 }}>{p.name}</div><div style={{ marginLeft: "auto", display: "flex", gap: 6 }}><StatusChip s={state} /></div></div>
      {open.map((x) => {
        const st = svc.exceptionState(x);
        const why = svc.whyCannotDecideException(p, x);
        return (
          <div key={x.id} className="card" style={{ boxShadow: "none", background: "var(--warn-weak, var(--surface-2))", borderColor: "var(--warn-ink, var(--line))", marginBottom: 10 }} role="alert"><div className="c-body" style={{ padding: 11 }}>
            <div style={{ fontWeight: 600 }}><Icon name="alert" /> Emergency change v{x.ver}: retrospective approval {st === "Overdue" ? "OVERDUE" : "required"} by {x.dueBy}</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", margin: "3px 0 8px" }}>Published by {x.by} on {x.at} ({x.id}). Reason: {x.reason}. A different admin/owner must approve within {svc.EMERGENCY_DAYS} business days.</div>
            <div className="btngrp">
              {btn("Approve retrospectively", "check", why, () => reasonModal(L, id, "Retrospective approval, " + x.id, { label: "Approval reason", min: 10, confirm: "Approve", run: async (r) => { await svc.decideException(id, x.id, "approve", r); return "Emergency change approved retrospectively"; } }), "btn-primary")}
              {btn("Reject", "x", why, () => reasonModal(L, id, "Reject emergency change, " + x.id, { label: "Reason", min: 10, confirm: "Reject", run: async (r) => { await svc.decideException(id, x.id, "reject", r); return "Emergency change rejected"; } }))}
            </div>
            <Why t={why} />
          </div></div>
        );
      })}
      {(p.exceptions as svc.PolicyException[]).filter((x) => x.status === "Rejected").map((x) => <p key={x.id} className="field help" style={{ color: "var(--bad-ink)" }}>Retrospective approval of v{x.ver} ({x.id}) was rejected by {x.decidedBy}. Publish a corrective revision.</p>)}
      <dl className="meta-grid">
        <dt>Published version</dt><dd>{live ? `v${live.ver}${live.emergency ? " (emergency)" : ""}, effective ${live.effective || "n/a"}` : "None yet"}</dd>
        <dt>Working version</dt><dd>{work ? <>v{work.ver} <Chip cls={VER_TONE[work.status]}>{work.status}</Chip></> : "None"}</dd>
        <dt>Owner (creator)</dt><dd>{p.owner}</dd>
        <dt>Named approver</dt><dd>{work?.approver ? `${work.approver} (${work.approverRole})` : "Not named"}</dd>
        <dt>Next review</dt><dd>{p.review}</dd>
      </dl>
      <div className="hr"></div><div className="sectitle">Workflow</div>
      {manager ? (
        <>
          <div className="btngrp">
            {btn(!work && live ? "New draft version" : "Edit", "team", editWhy, () => openPolicyForm(L, id), "btn-ghost")}
            {btn("Submit for review", "ext", submitWhy, () => L.openModal("Submit for review", <SubmitForm id={id} L={L} />))}
            {btn("Approve", "check", apprWhy, () => reasonModal(L, id, `Approve ${p.name} v${work?.ver}`, {
              label: "Approval reason", min: 10, confirm: "Approve (immutable)",
              extra: (set, v) => <div className="field"><label htmlFor="pol-eff">Effective date</label><input className="input" id="pol-eff" type="date" min={isoDay()} value={v.eff ?? isoDay()} onChange={(e) => set("eff", e.target.value)} /></div>,
              run: async (r, v) => { await svc.approveVersion(id, { reason: r, effective: v.eff || isoDay() }); return "Approved: version is now immutable"; },
            }), "btn-primary")}
            {btn("Publish", "ext", pubWhy, () => run(() => svc.publishVersion(id), "Published"), "btn-primary")}
            {btn("Request changes", "back", apprWhy, () => reasonModal(L, id, "Request changes", { label: "Remarks for the author", min: 10, confirm: "Return to draft", run: async (r) => { await svc.returnToDraft(id, r); return "Returned to draft"; } }))}
            {work?.status === "In review" ? btn("Withdraw", "back", svc.isPolicyOwner(p) ? null : "Only the policy owner can withdraw.", () => reasonModal(L, id, "Withdraw from review", { label: "Reason", min: 10, confirm: "Withdraw", run: async (r) => { await svc.returnToDraft(id, r); return "Withdrawn to draft"; } }), "btn-ghost") : null}
            {btn("Emergency publish", "alert", emWhy, () => reasonModal(L, id, "Emergency change", { label: "Emergency justification", min: 20, confirm: "Publish now (creates exception)", run: async (r) => { const x = await svc.emergencyPublish(id, r); return `Published. Retrospective approval due by ${x.dueBy}`; } }), "btn-danger")}
            {btn("Reassign owner", "team", svc.whyCannotReassign(p), () => L.openModal("Reassign owner, " + p.id, <ReassignForm id={id} L={L} />), "btn-ghost")}
          </div>
          <Why t={editWhy || (work?.status === "In review" ? apprWhy : work?.status === "Approved" ? pubWhy : submitWhy)} />
          <p className="field help" style={{ margin: "6px 0 0" }}>Only the creator edits content. Approval and publication are separate audited steps by the named approver, who is never the author or a last editor. Editing a published policy starts a new draft version; the published one stays immutable.</p>
        </>
      ) : <p className="field help" role="note">Read-only for your role. Employees read and acknowledge policies; auditors have read access.</p>}
      <div className="hr"></div><div className="sectitle">Acceptance</div>
      {live ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <Ring pct={a.required ? Math.round((a.done / a.required) * 100) : 0} size={60} color="var(--accent)" />
            <div><div style={{ fontWeight: 600 }}>{a.done} / {a.required} accepted</div><div style={{ fontSize: 12, color: "var(--muted)" }}>Workforce acknowledgement of v{live.ver} (demo figures)</div></div>
          </div>
          <div className="btngrp">
            {manager ? btn("Remind outstanding", "bell", null, () => remind(), "btn-ghost") : null}
            <button className="btn btn-primary sm" disabled={!!myAck || !!canAckWhy} title={canAckWhy || undefined} onClick={() => run(async () => { const r = await acknowledge(me.name, id); if (!r) throw new Error("x"); wsLog("policy.acknowledged", `${p.id} v${live.ver} by ${me.name}`, "Policy"); }, "Acknowledged", false)}><Icon name="check" />{myAck ? "You acknowledged v" + live.ver : "Read & acknowledge"}</button>
          </div>
        </>
      ) : <p className="field help">Acceptance tracking begins once the policy is published.</p>}
      <div className="hr"></div><div className="sectitle">Mapped controls</div>
      <div className="btngrp" style={{ marginBottom: 8 }}>
        {p.mappedControls.length ? p.mappedControls.map((c: string, i: number) => <span key={i} className="tag num">{c}</span>) : <span style={{ color: "var(--faint)", fontSize: 13 }}>None mapped</span>}
      </div>
      {manager ? <button className="btn btn-ghost sm" onClick={() => openMapControl(L, id)}><Icon name="plus" />Map control</button> : null}
      <div className="hr"></div><div className="sectitle">Version history (immutable once approved)</div>
      <Table cols={[{ t: "Version" }, { t: "State" }, { t: "Author / last editor" }, { t: "Approved by" }, { t: "Effective" }, { t: "Why" }]}>
        {p.versions.slice().reverse().map((v: svc.PolicyVersion, i: number) => (
          <tr key={i}><td className="strong num">v{v.ver}</td><td><Chip cls={VER_TONE[v.status]}>{v.status}</Chip>{v.emergency ? <> <Chip cls="bad">Emergency</Chip></> : null}</td>
            <td>{v.author}{!samePerson(v.author, v.lastEditor) ? ` / ${v.lastEditor}` : ""}</td><td>{v.approvedBy ? `${v.approvedBy} on ${v.approvedAt}` : v.approver ? `Awaiting ${v.approver}` : "—"}</td><td>{v.effective || "—"}</td><td>{v.note}</td></tr>
        ))}
      </Table>
      <div className="hr"></div><div className="sectitle">Change log</div>
      <Table cols={[{ t: "Date" }, { t: "Version" }, { t: "Who" }, { t: "What" }, { t: "Why" }]}>
        {p.changeLog.slice().reverse().map((h: { at: string; ver: string; by: string; action: string; reason: string }, i: number) => (
          <tr key={i}><td>{h.at}</td><td className="num">v{h.ver}</td><td>{h.by}</td><td>{h.action}</td><td>{h.reason}</td></tr>
        ))}
      </Table>
    </>
  );
}
export function openPolicyDrawer(L: LayerApi, id: string) {
  const p = svc.findPolicy(id);
  if (p) svc.polInit(p);
  L.openDrawer("Policy " + id, "", <DrawerBody id={id} L={L} />);
}

/* ---- reassign owner (admin only, reason logged) ---- */
function ReassignForm({ id, L }: { id: string; L: LayerApi }) {
  const p = svc.findPolicy(id);
  const opts = svc.eligibleApprovers().filter((x) => p && !samePerson(x.name, p.owner) && !samePerson(x.name, getActor().name));
  const [name, setName] = useState(opts[0]?.name || ""); const [reason, setReason] = useState(""); const [err, setErr] = useState("");
  const submit = async () => {
    if (clampText(reason, 500).length < 10) { setErr("Give a reason of at least 10 characters."); return; }
    try { await svc.reassignOwner(id, name, clampText(reason, 500)); L.closeLayer(); L.toast("Ownership reassigned"); bumpData(); openPolicyDrawer(L, id); } catch (e) { L.toast(uiMessage(e), false); }
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
    try { await svc.mapControl(id, v); L.closeLayer(); openPolicyDrawer(L, id); } catch (e) { L.toast(uiMessage(e), false); }
  };
  return (
    <>
      <div className="field"><label htmlFor="pm-ctrl">Control</label><select className="select" id="pm-ctrl" data-focus value={v} onChange={(e) => setV(e.target.value)}>{ids.map((c) => <option key={c}>{c}</option>)}</select></div>
      <LayerFoot><button className="btn btn-secondary" onClick={L.closeLayer}>Cancel</button><button className="btn btn-primary" onClick={submit}>Map</button></LayerFoot>
    </>
  );
}
export const openMapControl = (L: LayerApi, id: string) => L.openModal("Map control, " + id, <MapControlForm id={id} L={L} />);

/* ---- create / edit ---- */
function PolicyForm({ id, L }: { id?: string; L: LayerApi }) {
  const p = id ? svc.findPolicy(id) : undefined;
  const w = p ? svc.workVersion(p) || svc.liveVersion(p) : undefined;
  const fresh = !!p && !svc.workVersion(p);
  const [name, setName] = useState(w ? w.name : ""); const [body, setBody] = useState(w ? w.body : ""); const [cycle, setCycle] = useState(w ? w.cycle : 12);
  const [note, setNote] = useState(""); const [err, setErr] = useState("");
  const submit = async () => {
    const n = clampText(name, 160);
    if (!n) { setErr("Policy name is required."); return; }
    if (fresh && clampText(note, 300).length < 10) { setErr("Give the reason for this change (at least 10 characters)."); return; }
    try {
      if (id && p) { const r = await svc.savePolicy(id, { name: n, body, cycle, note }); L.closeLayer(); L.toast(r.fresh ? `New draft v${r.ver} created` : "Changes saved"); bumpData(); openPolicyDrawer(L, id); }
      else { const r = await svc.createPolicy({ name: n, body, cycle }); L.closeLayer(); L.toast("Policy created"); bumpData(); openPolicyDrawer(L, r.id); }
    } catch (e) { setErr(""); L.toast(uiMessage(e) || FAIL_MSG, false); }
  };
  return (
    <>
      <div>
        {fresh ? <p className="field help" role="note">This policy is published and immutable. Saving creates a new draft version; the published version stays visible in the history until the new one is approved and published.</p> : null}
        <div className="field"><label htmlFor="pl-name">Policy name <Req /></label><input className="input" id="pl-name" data-focus maxLength={160} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Remote Working Policy" aria-invalid={!!err} aria-describedby={err ? "pl-err" : undefined} /></div>
        <div className="field"><label htmlFor="pl-body">Policy text</label><textarea className="input" id="pl-body" rows={6} maxLength={8000} style={{ resize: "vertical" }} value={body} onChange={(e) => setBody(e.target.value)} /></div>
        <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div className="field"><label htmlFor="pl-cycle">Review cycle</label><select className="select" id="pl-cycle" value={cycle} onChange={(e) => setCycle(Number(e.target.value))}>{svc.REVIEW_CYCLES.map((m) => <option key={m} value={m}>{m} months</option>)}</select></div>
          <div className="field"><label htmlFor="pl-note">Why this change{fresh ? <> <Req /></> : null}</label><input className="input" id="pl-note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Recorded in the change log" /></div>
        </div>
        <p className="field help">{id ? "You are the only person who can edit this policy." : "You will be recorded as the creator and the only person who can edit it (an admin can reassign ownership)."}</p>
        <p className="field help" id="pl-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={L.closeLayer}>Cancel</button><button className="btn btn-primary" onClick={submit}>{id ? (fresh ? "Create draft version" : "Save changes") : "Create policy"}</button></LayerFoot>
    </>
  );
}
export const openPolicyForm = (L: LayerApi, id?: string) => L.openModal(id ? "Edit policy" : "New policy", <PolicyForm id={id} L={L} />);
