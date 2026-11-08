/* Issue drawer and its modals (source issDrawer, issAddTask, issLink, issCreate/issEdit, issDelete). */
import { useCallback, useState } from "react";
import { Icon, StatusChip } from "@/components/ui";
import { LayerFoot, useLayer } from "@/components/shell/LayerProvider";
import type { LayerApi } from "@/components/shell/LayerProvider";
import { DATA } from "@/lib/data";
import { bumpData, useData } from "@/lib/store";
import { wsLog } from "@/lib/audit";
import { clampText } from "@/lib/security";
import * as svc from "@/services/issues";
import { attempt } from "./util";

/* eslint-disable @typescript-eslint/no-explicit-any */
const Req = () => <span style={{ color: "var(--bad-ink)" }}>*</span>;
const errStyle = (on: boolean) => ({ color: "var(--bad-ink)", display: on ? "block" : "none" });
export const DueText = ({ due }: { due: string }) => (/Overdue/.test(due) ? <span style={{ color: "var(--bad-ink)", fontWeight: 500 }}>{due}</span> : <>{due}</>);

/* ---------------- drawer ---------------- */
function IssueDrawerBody({ id }: { id: string }) {
  useData();
  const L = useLayer();
  const i = svc.issFind(id);
  const [rc, setRc] = useState(() => String(i?.rootCause ?? "")); const [ca, setCa] = useState(() => String(i?.corrective ?? ""));
  if (!i) return null;
  svc.issInit(i);
  const doneTasks = i.tasks.filter((t: any) => t.done).length;

  const setStatus = (s: string) => attempt(L, async () => {
    const r = await svc.setIssueStatus(id, s); if (!r) return;
    wsLog("issue.status.changed", i.id + ": " + r.from + " → " + s, "Control"); L.closeLayer(); L.toast(i.id + " moved to " + s); bumpData();
  });
  const saveRca = () => attempt(L, async () => {
    await svc.saveRca(id, clampText(rc, 2000), clampText(ca, 2000));
    wsLog("issue.rca.saved", i.id, "Control"); L.toast("Root cause saved");
  });
  const toggle = (ti: number) => attempt(L, async () => { await svc.toggleTask(id, ti); bumpData(); });

  return (
    <>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{i.title}</div>
      <dl className="meta-grid"><dt>Severity</dt><dd><StatusChip s={i.sev} /></dd><dt>Owner</dt><dd>{i.owner}</dd><dt>Due</dt><dd>{i.due}</dd><dt>Status</dt><dd><StatusChip s={i.status} /></dd></dl>
      <div className="hr" /><div className="sectitle">Move status</div>
      <div className="btngrp">{svc.ISSUE_STATUSES.map((s) => <button key={s} className={`btn ${i.status === s ? "btn-primary" : "btn-secondary"} sm`} disabled={i.status === s} onClick={() => setStatus(s)}>{s}</button>)}</div>
      <div className="hr" /><div className="sectitle">Root cause &amp; corrective action</div>
      <div className="field"><label htmlFor={`rc-${id}`}>Root cause</label><textarea className="input" id={`rc-${id}`} rows={2} maxLength={2000} style={{ resize: "vertical" }} placeholder="Why did this happen?" value={rc} onChange={(e) => setRc(e.target.value)} /></div>
      <div className="field"><label htmlFor={`ca-${id}`}>Corrective action</label><textarea className="input" id={`ca-${id}`} rows={2} maxLength={2000} style={{ resize: "vertical" }} placeholder="What will prevent recurrence?" value={ca} onChange={(e) => setCa(e.target.value)} /></div>
      <button className="btn btn-secondary sm" onClick={saveRca}><Icon name="check" />Save root cause</button>
      <div className="hr" /><div className="sectitle">Tasks ({doneTasks}/{i.tasks.length})</div>
      {i.tasks.length ? i.tasks.map((t: any, ti: number) => (
        <label key={ti} className="listrow" style={{ border: "1px solid var(--line)", borderRadius: 8, marginBottom: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, padding: "8px 10px" }}>
          <input type="checkbox" checked={!!t.done} onChange={() => toggle(ti)} />
          <span style={t.done ? { textDecoration: "line-through", color: "var(--muted)" } : undefined}>{t.text}</span>
        </label>
      )) : <p className="field help">No tasks yet.</p>}
      <button className="btn btn-ghost sm" onClick={() => openAddTask(L, id)}><Icon name="plus" />Add task</button>
      <div className="hr" /><div className="sectitle">Linked controls &amp; risks</div>
      <div className="btngrp" style={{ marginBottom: 8 }}>
        {i.linkedControls.map((c: string) => <span key={"c" + c} className="tag num">{c}</span>)}{i.linkedRisks.map((r: string) => <span key={"r" + r} className="tag num">{r}</span>)}
      </div>
      <div className="btngrp">
        <button className="btn btn-ghost sm" onClick={() => openLink(L, id, "control")}><Icon name="controls" />Link control</button>
        <button className="btn btn-ghost sm" onClick={() => openLink(L, id, "risk")}><Icon name="risk" />Link risk</button>
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
      <button className="btn btn-ghost" onClick={() => openIssueForm(L, id)}><Icon name="team" />Edit</button>
      <button className="btn btn-ghost" onClick={() => openDelete(L, id)}><Icon name="x" />Delete</button>
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
  const [owner, setOwner] = useState(i ? String(i.owner) : "J. Avery");
  const [due, setDue] = useState(i ? String(i.due) : "Due 14d");
  const [err, setErr] = useState(false);
  const submit = () => attempt(L, async () => {
    const t = clampText(title, 200);
    if (!t) { setErr(true); return; }
    const sv = svc.ISSUE_SEVS.includes(sev) ? sev : "High";
    if (id) {
      if (!svc.issFind(id)) return;
      await svc.updateIssue(id, { title: t, sev: sv, owner: clampText(owner, 80), due: clampText(due, 40) });
      wsLog("issue.updated", t, "Control"); L.closeLayer(); L.toast("Changes saved"); bumpData();
    } else {
      await svc.createIssue({ title: t, sev: sv, owner: clampText(owner, 80), due: clampText(due, 40) });
      wsLog("issue.created", t, "Control"); L.closeLayer(); L.toast("Issue created"); bumpData();
    }
  });
  return (
    <>
      <div>
        <div className="field"><label htmlFor="is-title">Title <Req /></label><input className="input" id="is-title" data-focus maxLength={200} placeholder="e.g. Encrypt backups at rest" value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={err} aria-describedby={err ? "is-err" : undefined} /></div>
        <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div className="field"><label htmlFor="is-sev">Severity</label><select className="select" id="is-sev" value={sev} onChange={(e) => setSev(e.target.value)}>{svc.ISSUE_SEVS.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div className="field"><label htmlFor="is-owner">Owner</label><input className="input" id="is-owner" maxLength={80} value={owner} onChange={(e) => setOwner(e.target.value)} /></div>
        </div>
        <div className="field"><label htmlFor="is-due">Due</label><input className="input" id="is-due" maxLength={40} placeholder="e.g. Due 14d" value={due} onChange={(e) => setDue(e.target.value)} /></div>
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
    wsLog("issue.deleted", title, "Control"); L.closeLayer(); L.toast("Issue deleted"); bumpData();
  });
  L.openModal("Delete issue?", <p style={{ margin: 0 }}>Delete <strong>{title}</strong> ({id})? This cannot be undone in the demo.</p>,
    <><button className="btn btn-secondary" onClick={L.closeLayer}>Cancel</button><button className="btn btn-danger" onClick={del}>Delete</button></>);
}
