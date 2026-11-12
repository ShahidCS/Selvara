/* The short dialogs of an issue (add task, link, delete, closure notes). The record itself is a page (IssueDetail) and create and edit are form pages (IssueFormPage). */
import { useState } from "react";
import { LayerFoot } from "@/components/shell/LayerProvider";
import type { LayerApi } from "@/components/shell/LayerProvider";
import { DATA } from "@/lib/data";
import { bumpData } from "@/lib/store";
import { clampText } from "@/lib/security";
import { wsLog } from "@/lib/audit";
import { uiMessage } from "@/lib/grcSod";
import * as svc from "@/features/issues/services/issues";
/** Run a handler; policy (SodError) messages are shown, anything else becomes a generic toast. */
export const attempt = async (L: LayerApi, fn: () => Promise<void> | void) => { try { await fn(); } catch (e) { L.toast(uiMessage(e), false); } };

/* eslint-disable @typescript-eslint/no-explicit-any */
export const Req = () => <span style={{ color: "var(--bad-ink)" }}>*</span>;
export const errStyle = (on: boolean) => ({ color: "var(--bad-ink)", display: on ? "block" : "none" });
export const DueText = ({ due }: { due: string }) => (/Overdue/.test(due) ? <span style={{ color: "var(--bad-ink)", fontWeight: 500 }}>{due}</span> : <>{due}</>);

/* ---------------- add task ---------------- */
function AddTaskForm({ L, id }: { L: LayerApi; id: string }) {
  const [text, setText] = useState(""); const [err, setErr] = useState(false);
  const submit = () => attempt(L, async () => {
    const t = clampText(text, 300);
    if (!t) { setErr(true); return; }
    const i = svc.issFind(id); if (!i) return;
    await svc.addTask(id, t);
    wsLog("issue.task.added", i.id + ": " + t, "Control"); L.closeLayer(); L.toast("Task added"); bumpData();
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
    wsLog("issue.linked", i.id + " → " + sel, "Control"); L.closeLayer(); L.toast("Linked " + sel); bumpData();
  });
  return (
    <>
      <div className="field"><label htmlFor="il-sel">{kind === "control" ? "Control" : "Risk"}</label><select className="select" id="il-sel" data-focus value={sel} onChange={(e) => setSel(e.target.value)}>{opts.map((o) => <option key={o}>{o}</option>)}</select></div>
      <LayerFoot><button className="btn btn-secondary" onClick={L.closeLayer}>Cancel</button><button className="btn btn-primary" onClick={submit}>Link</button></LayerFoot>
    </>
  );
}
export function openLink(L: LayerApi, id: string, kind: "control" | "risk") { L.openModal("Link " + kind, <LinkForm L={L} id={id} kind={kind} />); }

/* ---------------- delete ---------------- */
export function openDelete(L: LayerApi, id: string, done: () => void) {
  const i = svc.issFind(id); if (!i) return;
  const title = String(i.title);
  const del = () => attempt(L, async () => {
    await svc.deleteIssue(id);
    L.closeLayer(); L.toast("Issue deleted"); done(); bumpData();
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
