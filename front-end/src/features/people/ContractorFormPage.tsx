import { useEffect, useRef, useState, type FormEvent } from "react";
import { Empty, FormActions, FormMessage, FormSection, Page } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";
import { wsLog } from "@/lib/audit";
import { bumpData, setModState, useApp } from "@/lib/store";
import { useGo } from "@/lib/route";
import { clampText } from "@/lib/security";
import * as svc from "@/services/people";

/** `/ws/people/new`: add a contractor. Same fields, validation and service call as the dialog it replaces. */
export function ContractorFormPage() {
  const role = useApp((s) => s.role);
  const L = useLayer(); const go = useGo();
  const [name, setName] = useState(""); const [job, setJob] = useState(""); const [dept, setDept] = useState("External");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const dirty = !busy && (name !== "" || job !== "" || dept !== "External");
  const { allowLeave } = useUnsavedGuard(dirty, L);
  const ref = useRef<HTMLInputElement>(null); useEffect(() => { ref.current?.focus(); }, []);
  const back = { href: "/ws/people", label: "People" };
  if (!svc.canManagePeople(role)) return <Page title="Add contractor" back={back}><Empty icon="people" title="You cannot do this">Only an admin or owner can add contractors.</Empty></Page>;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = clampText(name, 100);
    if (!n) { setErr("Name is required."); return; }
    setBusy(true);
    try {
      const r = await svc.addContractor({ name: n, role: clampText(job, 100), dept: clampText(dept, 100) });
      wsLog("contractor.added", n, "Access"); allowLeave(); L.toast("Contractor added");
      setModState("people.view", "People"); bumpData(); go(r?.id ? `/ws/people/${encodeURIComponent(r.id)}` : "/ws/people");
    } catch { setBusy(false); setErr(""); L.toast("Could not add the contractor", false); }
  };
  return (
    <Page title="Add contractor" sub="They start with an unmanaged device and no MFA; set both up from their page." back={back}>
      <div className="scroll rec-scroll"><form className="rec-form" onSubmit={submit} noValidate>
        <FormSection n={1} title="Contractor" note="Who they are and where they work.">
          <div className="field"><label htmlFor="pc-name">Full name <span style={{ color: "var(--bad-ink)" }}>*</span></label><input ref={ref} className="input" id="pc-name" maxLength={100} placeholder="e.g. Jordan Reyes" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!err} aria-describedby={err ? "pc-err" : undefined} /></div>
          <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field"><label htmlFor="pc-role">Role</label><input className="input" id="pc-role" maxLength={100} placeholder="e.g. Security consultant" value={job} onChange={(e) => setJob(e.target.value)} /></div>
            <div className="field"><label htmlFor="pc-dept">Department</label><input className="input" id="pc-dept" maxLength={100} value={dept} onChange={(e) => setDept(e.target.value)} /></div>
          </div>
        </FormSection>
        {err ? <FormMessage id="pc-err">{err}</FormMessage> : null}
        <FormActions><button type="button" className="btn btn-secondary" onClick={() => go("/ws/people")}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy}>Add contractor</button></FormActions>
      </form></div>
    </Page>
  );
}
