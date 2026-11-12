import { useEffect, useRef, useState, type FormEvent } from "react";
import { Empty, FormActions, FormMessage, FormSection, Page } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";
import { bumpData, useApp, useData } from "@/lib/store";
import { useGo } from "@/lib/route";
import { clampText } from "@/lib/security";
import { getActor } from "@/lib/sod";
import { FAIL_MSG, uiMessage } from "@/lib/grcSod";
import * as svc from "@/features/issues/services/issues";
import { Req } from "./IssueLayers";

/** Create (`/ws/issues/new`) and edit (`/ws/issues/:id/edit`) as a page. Same fields, validation and service calls as the dialog it replaces. The service decides who may write. */
export function IssueFormPage({ id }: { id?: string }) {
  useData(); useApp((x) => x.role);
  const L = useLayer(); const go = useGo();
  const i = id ? svc.issFind(id) : undefined;
  const init = { title: i ? String(i.title) : "", sev: i && svc.ISSUE_SEVS.includes(i.sev) ? String(i.sev) : "High", owner: i ? String(i.owner) : getActor().name, due: i ? String(i.due) : "Due 14d" };
  const [title, setTitle] = useState(init.title); const [sev, setSev] = useState(init.sev); const [owner, setOwner] = useState(init.owner); const [due, setDue] = useState(init.due);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const dirty = !busy && (title !== init.title || sev !== init.sev || owner !== init.owner || due !== init.due);
  const { allowLeave } = useUnsavedGuard(dirty, L);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  const list = "/ws/issues";
  const back = { href: id ? `${list}/${encodeURIComponent(id)}` : list, label: id ? "Issue" : "Issues" };
  if (id && !i) return <Page title="Issue not found" back={{ href: list, label: "Issues" }}><Empty icon="issues" title="No such issue">There is no issue with the ID &ldquo;{id}&rdquo;.</Empty></Page>;
  const denied = svc.whyCannotWrite();
  if (denied) return <Page title={id ? "Edit issue" : "New issue"} back={back}><Empty icon="issues" title="You cannot do this">{denied}</Empty></Page>;
  const coreWhy = id ? svc.whyCannotEditCore() : null; // after creation only admin/owner may change owner, due date or severity

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const t = clampText(title, 200);
    if (!t) { setErr("Title is required."); return; }
    const sv = svc.ISSUE_SEVS.includes(sev) ? sev : "High";
    setBusy(true);
    try {
      const input = { title: t, sev: sv, owner: clampText(owner, 80), due: clampText(due, 40) };
      if (id) { await svc.updateIssue(id, input); allowLeave(); L.toast("Changes saved"); bumpData(); go(`${list}/${encodeURIComponent(id)}`); }
      else { const r = await svc.createIssue(input) as { id?: string } | undefined; allowLeave(); L.toast("Issue created"); bumpData(); go(r?.id ? `${list}/${encodeURIComponent(r.id)}` : list); }
    } catch (x) { setBusy(false); setErr(""); L.toast(uiMessage(x) || FAIL_MSG, false); }
  };

  return (
    <Page title={id ? "Edit issue" : "New issue"} sub={id ? i?.title : "Describe the finding; add tasks and links from its page."} back={back}>
      <div className="scroll rec-scroll">
        <form className="rec-form" onSubmit={submit} noValidate>
          <FormSection n={1} title="Issue" note="What needs fixing.">
            <div className="field"><label htmlFor="is-title">Title <Req /></label><input ref={ref} className="input" id="is-title" maxLength={200} placeholder="e.g. Encrypt backups at rest" value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!err} aria-describedby={err ? "is-err" : undefined} /></div>
          </FormSection>
          <FormSection n={2} title="Ownership and timing" note="How serious it is, who fixes it and by when.">
            <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="field"><label htmlFor="is-sev">Severity</label><select className="select" id="is-sev" disabled={!!coreWhy} value={sev} onChange={(e) => setSev(e.target.value)}>{svc.ISSUE_SEVS.map((s) => <option key={s}>{s}</option>)}</select></div>
              <div className="field"><label htmlFor="is-owner">Owner</label><input className="input" id="is-owner" disabled={!!coreWhy} maxLength={80} value={owner} onChange={(e) => setOwner(e.target.value)} /></div>
            </div>
            <div className="field"><label htmlFor="is-due">Due</label><input className="input" id="is-due" disabled={!!coreWhy} maxLength={40} placeholder="e.g. Due 14d" value={due} onChange={(e) => setDue(e.target.value)} /></div>
            {coreWhy ? <p className="field help" role="note">{coreWhy}</p> : null}
          </FormSection>
          {err ? <FormMessage id="is-err">{err}</FormMessage> : null}
          <FormActions>
            <button type="button" className="btn btn-secondary" onClick={() => go(back.href)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{id ? "Save changes" : "Create issue"}</button>
          </FormActions>
        </form>
      </div>
    </Page>
  );
}
