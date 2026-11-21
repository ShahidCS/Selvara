import { useEffect, useRef, useState, type FormEvent } from "react";
import { Empty, FormActions, FormMessage, FormSection, Page } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";
import { bumpData, useApp, useData } from "@/lib/store";
import { useGo } from "@/lib/route";
import { clampText } from "@/lib/security";
import { FAIL_MSG, uiMessage } from "@/lib/grcSod";
import { hasRole } from "@/lib/sod";
import * as svc from "@/features/policies/services/policies";
import { FieldErr, Req } from "./PolicyLayers";

/** Create (`/ws/policies/new`) and edit (`/ws/policies/:id/edit`) as a page. Same fields, validation and service calls as the dialog it replaces;
 *  leaving with typed work asks first. The service still decides who may create or edit; this page only explains. */
export function PolicyFormPage({ id }: { id?: string }) {
  useData(); const role = useApp((s) => s.role);
  const L = useLayer(); const go = useGo();
  const p = id ? svc.findPolicy(id) : undefined;
  const w = p ? svc.workVersion(p) || svc.liveVersion(p) : undefined;
  const fresh = !!p && !svc.workVersion(p);
  const [name, setName] = useState(w ? w.name : ""); const [body, setBody] = useState(w ? w.body : ""); const [cycle, setCycle] = useState<number>(w ? w.cycle : 12);
  const [note, setNote] = useState(""); const [err, setErr] = useState(""); const [errAt, setErrAt] = useState<"name" | "note">("name"); const [busy, setBusy] = useState(false);
  const dirty = !busy && (name !== (w ? w.name : "") || body !== (w ? w.body : "") || cycle !== (w ? w.cycle : 12) || note !== "");
  const { allowLeave } = useUnsavedGuard(dirty, L);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.focus(); }, []);

  const listHref = "/ws/policies";
  const back = { href: id ? `/ws/policies/${encodeURIComponent(id)}` : listHref, label: id ? "Policy" : "Policies" };
  if (id && !p) return <Page title="Policy not found" back={{ href: listHref, label: "Policies" }}><Empty icon="policies" title="No such policy">There is no policy with the ID &ldquo;{id}&rdquo;.</Empty></Page>;
  const denied = id && p ? svc.whyCannotEdit(p) : hasRole(role, "admin", "owner") ? null : "Only an admin or owner can create policies.";
  if (denied) return <Page title={id ? "Edit policy" : "New policy"} back={back}><Empty icon="policies" title="You cannot do this">{denied}</Empty></Page>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = clampText(name, 160);
    if (!n) { setErr("Policy name is required."); setErrAt("name"); nameRef.current?.focus(); return; }
    if (fresh && clampText(note, 300).length < 10) { setErr("Give the reason for this change (at least 10 characters)."); setErrAt("note"); document.getElementById("pl-note")?.focus(); return; }
    setBusy(true);
    try {
      if (id && p) {
        const r = await svc.savePolicy(id, { name: n, body, cycle, note });
        allowLeave(); L.toast(r.fresh ? `New draft v${r.ver} created` : "Changes saved"); bumpData(); go(`/ws/policies/${encodeURIComponent(id)}`);
      } else {
        const r = await svc.createPolicy({ name: n, body, cycle });
        allowLeave(); L.toast("Policy created"); bumpData(); go(`/ws/policies/${encodeURIComponent(r.id)}`);
      }
    } catch (x) { setBusy(false); setErr(""); L.toast(uiMessage(x) || FAIL_MSG, false); }
  };

  return (
    <Page title={id ? (fresh ? "New draft version" : "Edit policy") : "New policy"} sub={id ? p?.name : "Write the policy, then name an approver from its page."} back={back}>
      <div className="scroll rec-scroll">
        <form className="rec-form" onSubmit={submit} noValidate>
          {fresh ? <FormMessage kind="note">This policy is published and immutable. Saving creates a new draft version; the published version stays visible in the history until the new one is approved and published.</FormMessage> : null}
          <FormSection n={1} title="Policy" note="What the policy is called and what it says.">
            <div className="field"><label htmlFor="pl-name">Policy name <Req /></label><input ref={nameRef} className="input" id="pl-name" maxLength={160} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Remote Working Policy" aria-invalid={!!err && errAt === "name"} aria-describedby={err && errAt === "name" ? "pl-err" : undefined} />
              {errAt === "name" ? <FieldErr id="pl-err" t={err} /> : null}</div>
            <div className="field"><label htmlFor="pl-body">Policy text</label><textarea className="input" id="pl-body" rows={10} maxLength={8000} style={{ resize: "vertical" }} value={body} onChange={(e) => setBody(e.target.value)} /></div>
          </FormSection>
          <FormSection n={2} title="Review" note="How often it is reviewed, and why it changes.">
            <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="field"><label htmlFor="pl-cycle">Review cycle</label><select className="select" id="pl-cycle" value={cycle} onChange={(e) => setCycle(Number(e.target.value))}>{svc.REVIEW_CYCLES.map((m) => <option key={m} value={m}>{m} months</option>)}</select></div>
              <div className="field"><label htmlFor="pl-note">Why this change{fresh ? <> <Req /></> : null}</label><input className="input" id="pl-note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Recorded in the change log" aria-invalid={!!err && errAt === "note"} aria-describedby={err && errAt === "note" ? "pl-err" : undefined} />
                {errAt === "note" ? <FieldErr id="pl-err" t={err} /> : null}</div>
            </div>
            <p className="field help">{id ? "You are the only person who can edit this policy." : "You will be recorded as the creator and the only person who can edit it (an admin can reassign ownership)."}</p>
          </FormSection>
          <FormActions>
            <button type="button" className="btn btn-secondary" onClick={() => go(back.href)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{id ? (fresh ? "Create draft version" : "Save changes") : "Create policy"}</button>
          </FormActions>
        </form>
      </div>
    </Page>
  );
}
