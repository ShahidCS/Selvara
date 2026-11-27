import { useEffect, useRef, useState, type FormEvent } from "react";
import { Empty, FormActions, FormSection, Icon, Page, Person, SeverityBars } from "@/components/ui";
import { DATA } from "@/lib/data";
import { useLayer } from "@/hooks/useLayer";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";
import { bumpData, useApp, useData } from "@/lib/store";
import { useGo } from "@/lib/route";
import { clampText } from "@/lib/security";
import { getActor } from "@/lib/sod";
import { FAIL_MSG, uiMessage } from "@/lib/grcSod";
import * as svc from "@/features/issues/services/issues";
import { Req } from "./IssueLayers";
import { API_ON } from "@/lib/rbac";
import { MemberSelect, myMemberId, useMembers } from "@/components/kit/MemberSelect";

const isoIn = (days: number) => new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);
/* The demonstration stores the due date as relative text ("Due 7d", "Overdue 3d"). The form shows a date picker and converts both ways, so the stored shape is unchanged. */
const relToIso = (due: string) => { const m = /^(Due|Overdue) (\d+)d$/.exec(due.trim()); return m ? isoIn(m[1] === "Overdue" ? -Number(m[2]) : Number(m[2])) : /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : ""; };
const isoToRel = (iso: string) => { const d = Math.round((Date.parse(iso) - Date.parse(isoIn(0))) / 86400_000); return d >= 0 ? `Due ${d}d` : `Overdue ${-d}d`; };

/** Create (`/ws/issues/new`) and edit (`/ws/issues/:id/edit`) as a page. Same fields, validation and service calls as the dialog it replaces. The service decides who may write. */
export function IssueFormPage({ id }: { id?: string }) {
  useData(); useApp((x) => x.role);
  const L = useLayer(); const go = useGo();
  const i = id ? svc.issFind(id) : undefined;
  const members = useMembers();
  /* production: the owner is a member (by id) and the due date a real date; the demonstration keeps typed text */
  const init = API_ON
    ? { title: i ? String(i.title) : "", sev: i && svc.ISSUE_SEVS.includes(i.sev) ? String(i.sev) : "High", owner: i ? String(i.ownerId || "") : myMemberId(members), due: i ? String(i.dueDate || "") : isoIn(14) }
    : { title: i ? String(i.title) : "", sev: i && svc.ISSUE_SEVS.includes(i.sev) ? String(i.sev) : "High", owner: i ? String(i.owner) : getActor().name, due: i ? relToIso(String(i.due)) : isoIn(14) };
  const [title, setTitle] = useState(init.title); const [sev, setSev] = useState(init.sev); const [owner, setOwner] = useState(init.owner); const [due, setDue] = useState(init.due);
  const [err, setErr] = useState(""); const [errAt, setErrAt] = useState<"title" | "due">("title"); const [busy, setBusy] = useState(false);
  const dirty = !busy && (title !== init.title || sev !== init.sev || owner !== init.owner || due !== init.due);
  const { allowLeave } = useUnsavedGuard(dirty, L);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  const list = "/ws/issues";
  const back = { href: id ? `${list}/${encodeURIComponent(id)}` : list, label: id ? "Issue" : "Issues" };
  if (id && !i) return <Page title="Issue not found" back={{ href: list, label: "Issues" }}><Empty icon="issues" title="No such issue">There is no issue with the ID &ldquo;{id}&rdquo;.</Empty></Page>;
  const denied = svc.whyCannotWrite();
  if (denied) return <Page title={id ? "Edit issue" : "New issue"} back={back}><Empty icon="issues" title="You cannot do this">{denied}</Empty></Page>;
  const ownerOpts = Array.from(new Set([init.owner, getActor().name, ...DATA.issues.map((x: { owner: string }) => String(x.owner))].filter(Boolean))).sort();
  const coreWhy = id ? svc.whyCannotEditCore() : null; // after creation only admin/owner may change owner, due date or severity

  // R28: the summary names the owner; the advisory counts what they already hold (open issues on this page's data)
  const ownerName = API_ON ? (members.find((m) => m.id === owner)?.name ?? "—") : owner || "—";
  const held = DATA.issues.filter((x: { owner: string; status: string; id: string }) => x.id !== id && x.owner === ownerName && x.status !== "Closed");
  const ownerLoad = held.length; const ownerOverdue = held.filter((x: { due: string }) => /Overdue/.test(String(x.due))).length;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const t = clampText(title, 200);
    if (!t) { setErr("Title is required."); setErrAt("title"); ref.current?.focus(); return; }
    const sv = svc.ISSUE_SEVS.includes(sev) ? sev : "High";
    setBusy(true);
    try {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) { setBusy(false); setErr("Choose a due date."); setErrAt("due"); document.getElementById("is-due")?.focus(); return; }
      const input = API_ON ? { title: t, sev: sv, owner: "", ownerId: owner || myMemberId(members), due } : { title: t, sev: sv, owner: clampText(owner, 80), due: due === init.due && i ? String(i.due) : isoToRel(due) };
      if (id) { await svc.updateIssue(id, input); allowLeave(); L.toast("Changes saved"); bumpData(); go(`${list}/${encodeURIComponent(id)}`); }
      else { const r = await svc.createIssue(input) as { id?: string } | undefined; allowLeave(); L.toast("Issue created"); bumpData(); go(r?.id ? `${list}/${encodeURIComponent(r.id)}` : list); }
    } catch (x) { setBusy(false); setErr(""); L.toast(uiMessage(x) || FAIL_MSG, false); }
  };

  return (
    <Page title={id ? "Edit issue" : "New issue"} sub={id ? i?.title : "Describe the finding; add tasks and links from its page."} back={back}>
      <div className="scroll rec-scroll">
        <div className="form-with-summary">
        <form className="rec-form" onSubmit={submit} noValidate>
          <FormSection n={1} title="Issue" note="What needs fixing.">
            <div className="field"><label htmlFor="is-title">Title <Req /></label><input ref={ref} className="input" id="is-title" maxLength={200} placeholder="e.g. Encrypt backups at rest" value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!err && errAt === "title"} aria-describedby={err && errAt === "title" ? "is-err" : undefined} />
              {err && errAt === "title" ? <p className="errmsg" id="is-err" role="alert" style={{ margin: "4px 0 0" }}><Icon name="alert" /><span>{err}</span></p> : null}</div>
          </FormSection>
          <FormSection n={2} title="Ownership and timing" note="How serious it is, who fixes it and by when.">
            <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="field"><label htmlFor="is-sev">Severity</label><select className="select" id="is-sev" disabled={!!coreWhy} value={sev} onChange={(e) => setSev(e.target.value)}>{svc.ISSUE_SEVS.map((s) => <option key={s}>{s}</option>)}</select></div>
              {API_ON ? (coreWhy ? <div className="field"><label htmlFor="is-owner">Owner</label><input className="input" id="is-owner" disabled value={String(i?.owner ?? "")} readOnly /></div>
                : <MemberSelect id="is-owner" value={owner || myMemberId(members)} onChange={setOwner} />)
                : <div className="field"><label htmlFor="is-owner">Owner</label><select className="select" id="is-owner" disabled={!!coreWhy} value={owner} onChange={(e) => setOwner(e.target.value)}>{ownerOpts.map((o) => <option key={o}>{o}</option>)}</select></div>}
            </div>
            <div className="field"><label htmlFor="is-due">Due date</label><input className="input" type="date" id="is-due" disabled={!!coreWhy} value={due} onChange={(e) => setDue(e.target.value)} aria-invalid={!!err && errAt === "due"} aria-describedby={err && errAt === "due" ? "is-err" : undefined} />
              {err && errAt === "due" ? <p className="errmsg" id="is-err" role="alert" style={{ margin: "4px 0 0" }}><Icon name="alert" /><span>{err}</span></p> : null}</div>
            {coreWhy ? <p className="field help" role="note">{coreWhy}</p> : null}
          </FormSection>
          <FormActions>
            <button type="button" className="btn btn-secondary" onClick={() => go(back.href)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{id ? "Save changes" : "Create issue"}</button>
          </FormActions>
        </form>
        {/* R28: what will be saved, and an advisory note (never blocks saving) */}
        <aside className="form-summary" aria-label="Summary">
          <div className="panel-soft">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}><span className="strong">{id || "New issue"}</span><span className="chip neutral">{id ? "Editing" : "Draft"}</span></div>
            <div style={{ fontSize: "1.0625rem", lineHeight: 1.3, color: title.trim() ? "var(--ink)" : "var(--muted)" }}>{title.trim() || "Untitled issue"}</div>
            <dl className="meta-grid lstart" style={{ margin: 0 }}>
              <dt>Severity</dt><dd><SeverityBars level={sev} /></dd>
              <dt>Owner</dt><dd><Person name={ownerName} /></dd>
              <dt>Due</dt><dd>{due || "—"}</dd>
            </dl>
          </div>
          {ownerLoad >= 3 ? <p className="advisory" role="note"><Icon name="alert" /><span>{ownerName} already owns {ownerLoad} open issues{ownerOverdue ? `, ${ownerOverdue} overdue` : ""}. You can still save.</span></p> : null}
        </aside>
        </div>
      </div>
    </Page>
  );
}
