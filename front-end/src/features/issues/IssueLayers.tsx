/* Issue drawer and its modals (source issDrawer, issAddTask, issLink, issCreate/issEdit, issDelete). */
import { useCallback, useState } from "react";
import { Icon, StatusChip } from "@/components/ui";
import { LayerFoot, useLayer } from "@/components/shell/LayerProvider";
import type { LayerApi } from "@/components/shell/LayerProvider";
import { DATA } from "@/lib/data";
import { bumpData, useApp, useData } from "@/lib/store";
import { clampText } from "@/lib/security";
import { wsLog } from "@/lib/audit";
import { getActor } from "@/lib/sod";
import { iAm, uiMessage } from "@/lib/grcSod";
import * as svc from "@/features/issues/services/issues";
import { attempt as attempt0 } from "./util";
/** Run a handler; policy (SodError) messages are shown, anything else becomes a generic toast. */
const attempt = async (L: LayerApi, fn: () => Promise<void> | void) => { try { await fn(); } catch (e) { L.toast(uiMessage(e), false); } };
void attempt0;

/* eslint-disable @typescript-eslint/no-explicit-any */
const Req = () => <span style={{ color: "var(--bad-ink)" }}>*</span>;
const errStyle = (on: boolean) => ({ color: "var(--bad-ink)", display: on ? "block" : "none" });
export const DueText = ({ due }: { due: string }) => (/Overdue/.test(due) ? <span style={{ color: "var(--bad-ink)", fontWeight: 500 }}>{due}</span> : <>{due}</>);

/* ---------------- drawer ---------------- */
function IssueDrawerBody({ id }: { id: string }) {
  useData(); useApp((s) => s.role);
  const L = useLayer();
  const i = svc.issFind(id);
  const [rc, setRc] = useState(() => String(i?.rootCause ?? "")); const [ca, setCa] = useState(() => String(i?.corrective ?? ""));
  if (!i) return null;
  svc.issInit(i);
  const doneTasks = i.tasks.filter((t: any) => t.done).length;

  const high = svc.isHighSev(i.sev);
  const writeWhy = svc.whyCannotWrite();
  const pend = svc.pendingClosure(i);
  const verifyWhy = pend ? svc.whyCannotVerify(i) : null;
  const proposeWhy = svc.whyCannotProposeClose(i);
  const setStatus = (s: string) => attempt(L, async () => {
    const r = await svc.setIssueStatus(id, s); if (!r) return;
    L.closeLayer(); L.toast(i.id + " moved to " + s); bumpData();
  });
  const saveRca = () => attempt(L, async () => {
    await svc.saveRca(id, clampText(rc, 2000), clampText(ca, 2000));
    wsLog("issue.rca.saved", i.id, "Control"); L.toast("Root cause saved");
  });
  const toggle = (ti: number) => attempt(L, async () => { await svc.toggleTask(id, ti); bumpData(); });

  return (
    <>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{i.title}</div>
      <dl className="meta-grid"><dt>Severity</dt><dd><StatusChip s={i.sev} /></dd><dt>Owner</dt><dd>{i.owner}</dd><dt>Due</dt><dd>{i.due}</dd><dt>Status</dt><dd><StatusChip s={i.status} /></dd>
        {i.verification ? <><dt>Verified closure</dt><dd>{i.verification.by} on {i.verification.at}: {i.verification.note} (proposed by {i.verification.proposedBy})</dd></> : null}</dl>
      <div className="hr" /><div className="sectitle">Move status</div>
      <div className="btngrp">{svc.ISSUE_STATUSES.map((s) => {
        const toClosed = s === "Closed" && high && i.status !== "Closed";
        const why = i.status === s ? null : toClosed ? proposeWhy : pend ? "A closure is awaiting verification." : writeWhy;
        return <button key={s} className={`btn ${i.status === s ? "btn-primary" : "btn-secondary"} sm`} disabled={i.status === s || !!why} title={why || undefined} onClick={() => (toClosed ? openProposeClosure(L, id) : setStatus(s))}>{toClosed ? "Propose closure" : s}</button>;
      })}</div>
      {high && i.status !== "Closed" ? <p className="field help" style={{ margin: "6px 0 0" }}>Closing a {i.sev} issue needs a verifier who is not the assignee, the owner or the person proposing, with a verification note.</p> : null}
      {pend ? (
        <div className="card" style={{ boxShadow: "none", background: "var(--surface-2)", marginTop: 10 }} role="alert"><div className="c-body" style={{ padding: 11 }}>
          <div style={{ fontWeight: 600 }}><Icon name="clock" /> Closure awaiting verification</div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", margin: "3px 0 8px" }}>Proposed by {pend.requestedBy}: {i.closure?.note}</div>
          <div className="btngrp">
            <button className="btn btn-primary sm" disabled={!!verifyWhy} title={verifyWhy || undefined} onClick={() => openDecideClosure(L, id, "verify")}><Icon name="check" />Verify and close</button>
            <button className="btn btn-secondary sm" disabled={!!verifyWhy} title={verifyWhy || undefined} onClick={() => openDecideClosure(L, id, "reject")}><Icon name="x" />Reject</button>
            {iAm(pend.requestedBy) ? <button className="btn btn-ghost sm" onClick={() => attempt(L, async () => { await svc.withdrawClosure(id); L.toast("Closure withdrawn"); bumpData(); })}><Icon name="back" />Withdraw</button> : null}
          </div>
          {verifyWhy ? <p className="field help" style={{ margin: "6px 0 0" }}>{verifyWhy}</p> : null}
        </div></div>
      ) : null}
      {writeWhy ? <p className="field help" style={{ margin: "6px 0 0" }}>{writeWhy}</p> : null}
      <div className="hr" /><div className="sectitle">Root cause &amp; corrective action</div>
      <div className="field"><label htmlFor={`rc-${id}`}>Root cause</label><textarea className="input" id={`rc-${id}`} rows={2} maxLength={2000} style={{ resize: "vertical" }} placeholder="Why did this happen?" value={rc} onChange={(e) => setRc(e.target.value)} /></div>
      <div className="field"><label htmlFor={`ca-${id}`}>Corrective action</label><textarea className="input" id={`ca-${id}`} rows={2} maxLength={2000} style={{ resize: "vertical" }} placeholder="What will prevent recurrence?" value={ca} onChange={(e) => setCa(e.target.value)} /></div>
      <button className="btn btn-secondary sm" disabled={!!writeWhy} title={writeWhy || undefined} onClick={saveRca}><Icon name="check" />Save root cause</button>
      <div className="hr" /><div className="sectitle">Tasks ({doneTasks}/{i.tasks.length})</div>
      {i.tasks.length ? i.tasks.map((t: any, ti: number) => (
        <label key={ti} className="listrow" style={{ border: "1px solid var(--line)", borderRadius: 8, marginBottom: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, padding: "8px 10px" }}>
          <input type="checkbox" checked={!!t.done} disabled={!!writeWhy} onChange={() => toggle(ti)} />
          <span style={t.done ? { textDecoration: "line-through", color: "var(--muted)" } : undefined}>{t.text}</span>
        </label>
      )) : <p className="field help">No tasks yet.</p>}
      <button className="btn btn-ghost sm" disabled={!!writeWhy} title={writeWhy || undefined} onClick={() => openAddTask(L, id)}><Icon name="plus" />Add task</button>
      <div className="hr" /><div className="sectitle">Linked controls &amp; risks</div>
      <div className="btngrp" style={{ marginBottom: 8 }}>
        {i.linkedControls.map((c: string) => <span key={"c" + c} className="tag num">{c}</span>)}{i.linkedRisks.map((r: string) => <span key={"r" + r} className="tag num">{r}</span>)}
      </div>
      <div className="btngrp">
        <button className="btn btn-ghost sm" disabled={!!writeWhy} title={writeWhy || undefined} onClick={() => openLink(L, id, "control")}><Icon name="controls" />Link control</button>
        <button className="btn btn-ghost sm" disabled={!!writeWhy} title={writeWhy || undefined} onClick={() => openLink(L, id, "risk")}><Icon name="risk" />Link risk</button>
      </div>
    </>
  );
}
export function openIssueDrawer(L: LayerApi, id: string) {
  const i = svc.issFind(id);
  if (!i) return;
  svc.issInit(i);
  L.openDrawer("Issue " + i.id, undefined, <IssueDrawerBody key={id} id={id} />,
    <>
      <button className="btn btn-ghost" disabled={!!svc.whyCannotWrite()} title={svc.whyCannotWrite() || undefined} onClick={() => openIssueForm(L, id)}><Icon name="team" />Edit</button>
      <button className="btn btn-ghost" disabled={!!svc.whyCannotDelete(i)} title={svc.whyCannotDelete(i) || undefined} onClick={() => openDelete(L, id)}><Icon name="x" />Delete</button>
    </>);
}
/** Open the issue drawer from any module: `const openIssue = useIssueDrawer(); openIssue("R-014")`. Unknown ids are ignored. */
export function useIssueDrawer() {
  const L = useLayer();
  return useCallback((id: string) => openIssueDrawer(L, id), [L]);
}

/* ---------------- add task ---------------- */
function AddTaskForm({ L, id }: { L: LayerApi; id: string }) {
  const [text, setText] = useState(""); const [err, setErr] = useState(false);
  const submit = () => attempt(L, async () => {
    const t = clampText(text, 300);
    if (!t) { setErr(true); return; }
    const i = svc.issFind(id); if (!i) return;
    await svc.addTask(id, t);
    wsLog("issue.task.added", i.id + ": " + t, "Control"); L.closeLayer(); openIssueDrawer(L, id); bumpData();
  });
  return (
    <>
      <div>
        <div className="field"><label htmlFor="it-text">Task <Req /></label><input className="input" id="it-text" data-focus placeholder="e.g. Patch edge service" maxLength={300} value={text} onChange={(e) => setText(e.target.value)} aria-invalid={err} aria-describedby={err ? "it-err" : undefined} /></div>
        <p className="field help" id="it-err" role={err ? "alert" : undefined} style={errStyle(err)}>Task is required.</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={L.closeLayer}>Cancel</button><button className="btn btn-primary" onClick={submit}>Add</button></LayerFoot>
    </>
  );
}
export function openAddTask(L: LayerApi, id: string) { L.openModal("Add task", <AddTaskForm L={L} id={id} />); }

/* ---------------- link control / risk ---------------- */
function LinkForm({ L, id, kind }: { L: LayerApi; id: string; kind: "control" | "risk" }) {
  const opts: string[] = (kind === "control" ? DATA.controls : DATA.risks).map((x: any) => String(x.id));
  const [sel, setSel] = useState(opts[0] ?? "");
  const submit = () => attempt(L, async () => {
    const i = svc.issFind(id); if (!i || !opts.includes(sel)) return; // value must be one of the offered ids
    await svc.linkIssue(id, kind, sel);
    wsLog("issue.linked", i.id + " → " + sel, "Control"); L.closeLayer(); openIssueDrawer(L, id); bumpData();
  });
  return (
    <>
      <div className="field"><label htmlFor="il-sel">{kind === "control" ? "Control" : "Risk"}</label><select className="select" id="il-sel" data-focus value={sel} onChange={(e) => setSel(e.target.value)}>{opts.map((o) => <option key={o}>{o}</option>)}</select></div>
      <LayerFoot><button className="btn btn-secondary" onClick={L.closeLayer}>Cancel</button><button className="btn btn-primary" onClick={submit}>Link</button></LayerFoot>
    </>
  );
}
export function openLink(L: LayerApi, id: string, kind: "control" | "risk") { L.openModal("Link " + kind, <LinkForm L={L} id={id} kind={kind} />); }

/* ---------------- create / edit ---------------- */
function IssueForm({ L, id }: { L: LayerApi; id: string | null }) {
  const i = id ? svc.issFind(id) : null;
  const [title, setTitle] = useState(i ? String(i.title) : "");
  const [sev, setSev] = useState(i && svc.ISSUE_SEVS.includes(i.sev) ? i.sev : "High");
  const [owner, setOwner] = useState(i ? String(i.owner) : getActor().name);
  useApp((x) => x.role);
  const coreWhy = id ? svc.whyCannotEditCore() : null; // after creation only admin/owner may change owner, due date or severity
  const [due, setDue] = useState(i ? String(i.due) : "Due 14d");
  const [err, setErr] = useState(false);
  const submit = () => attempt(L, async () => {
    const t = clampText(title, 200);
    if (!t) { setErr(true); return; }
    const sv = svc.ISSUE_SEVS.includes(sev) ? sev : "High";
    if (id) {
      if (!svc.issFind(id)) return;
      await svc.updateIssue(id, { title: t, sev: sv, owner: clampText(owner, 80), due: clampText(due, 40) });
      L.closeLayer(); L.toast("Changes saved"); bumpData();
    } else {
      await svc.createIssue({ title: t, sev: sv, owner: clampText(owner, 80), due: clampText(due, 40) });
      L.closeLayer(); L.toast("Issue created"); bumpData();
    }
  });
  return (
    <>
      <div>
        <div className="field"><label htmlFor="is-title">Title <Req /></label><input className="input" id="is-title" data-focus maxLength={200} placeholder="e.g. Encrypt backups at rest" value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={err} aria-describedby={err ? "is-err" : undefined} /></div>
        <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div className="field"><label htmlFor="is-sev">Severity</label><select className="select" id="is-sev" disabled={!!coreWhy} value={sev} onChange={(e) => setSev(e.target.value)}>{svc.ISSUE_SEVS.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div className="field"><label htmlFor="is-owner">Owner</label><input className="input" id="is-owner" disabled={!!coreWhy} maxLength={80} value={owner} onChange={(e) => setOwner(e.target.value)} /></div>
        </div>
        <div className="field"><label htmlFor="is-due">Due</label><input className="input" id="is-due" disabled={!!coreWhy} maxLength={40} placeholder="e.g. Due 14d" value={due} onChange={(e) => setDue(e.target.value)} /></div>
        {coreWhy ? <p className="field help" role="note">{coreWhy}</p> : null}
        <p className="field help" id="is-err" role={err ? "alert" : undefined} style={errStyle(err)}>Title is required.</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={L.closeLayer}>Cancel</button><button className="btn btn-primary" onClick={submit}>{id ? "Save changes" : "Create issue"}</button></LayerFoot>
    </>
  );
}
export function openIssueForm(L: LayerApi, id: string | null) {
  if (id && !svc.issFind(id)) return;
  L.openModal(id ? "Edit issue" : "New issue", <IssueForm L={L} id={id} />);
}

/* ---------------- delete ---------------- */
export function openDelete(L: LayerApi, id: string) {
  const i = svc.issFind(id); if (!i) return;
  const title = String(i.title);
  const del = () => attempt(L, async () => {
    await svc.deleteIssue(id);
    L.closeLayer(); L.toast("Issue deleted"); bumpData();
  });
  L.openModal("Delete issue?", <p style={{ margin: 0 }}>Delete <strong>{title}</strong> ({id})? This cannot be undone in the demo.</p>,
    <><button className="btn btn-secondary" onClick={L.closeLayer}>Cancel</button><button className="btn btn-danger" onClick={del}>Delete</button></>);
}

/* ---------------- closure of High/Critical: propose, then a different person verifies ---------------- */
function NoteForm({ L, confirm, label, help, run }: { L: LayerApi; confirm: string; label: string; help: string; run: (note: string) => Promise<string> }) {
  const [note, setNote] = useState(""); const [err, setErr] = useState("");
  const submit = () => attempt(L, async () => {
    const n = clampText(note, 500);
    if (n.length < 10) { setErr("Enter at least 10 characters."); return; }
    const m = await run(n); L.closeLayer(); L.toast(m); bumpData();
  });
  return (
    <>
      <div>
        <p style={{ margin: "0 0 8px" }}>{help}</p>
        <div className="field"><label htmlFor="ic-note">{label} <Req /></label><textarea className="input" id="ic-note" data-focus rows={3} maxLength={500} style={{ resize: "vertical" }} value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={!!err} /></div>
        <p className="field help" role="alert" style={errStyle(!!err)}>{err}</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={L.closeLayer}>Cancel</button><button className="btn btn-primary" onClick={submit}>{confirm}</button></LayerFoot>
    </>
  );
}
export const openProposeClosure = (L: LayerApi, id: string) => L.openModal("Propose closure, " + id,
  <NoteForm L={L} confirm="Send for verification" label="What was done to fix it" help="A different person (not the assignee or owner) must verify the fix before this issue closes." run={async (n) => { await svc.proposeClosure(id, n); return "Closure sent for verification"; }} />);
export const openDecideClosure = (L: LayerApi, id: string, d: "verify" | "reject") => L.openModal(d === "verify" ? "Verify and close, " + id : "Reject closure, " + id,
  <NoteForm L={L} confirm={d === "verify" ? "Verify and close" : "Reject"} label="Verification note" help={d === "verify" ? "State what you checked to confirm the fix works." : "Say what is still missing."} run={async (n) => { const ok = await svc.decideClosure(id, d, n); return ok ? "Verified: issue closed" : "Closure rejected"; }} />);
