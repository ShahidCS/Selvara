import { useEffect, useRef, useState, type FormEvent } from "react";
import { Empty, FormActions, FormMessage, FormSection, Page } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";
import { sodMessage } from "@/lib/approvalFlow";
import { bumpData, useApp } from "@/lib/store";
import { useGo } from "@/lib/route";
import { isEmail } from "@/lib/security";
import { SOD } from "@/lib/sod";
import * as svc from "@/services/team";

const SRC_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/; // prototype regex, kept; isEmail adds length caps
const back = { href: "/ws/team", label: "Team & Rules" };
/** Least-privileged role first, so a privileged invitation is a deliberate choice. */
const DEFAULT_ROLE = svc.USER_ROLES.includes("Employee") ? "Employee" : svc.USER_ROLES[svc.USER_ROLES.length - 1];

/** `/ws/team/invite`: invite a member. A privileged role needs a second admin before the invitation is sent. */
export function InviteFormPage() {
  const role0 = useApp((s) => s.role);
  const L = useLayer(); const go = useGo();
  const [email, setEmail] = useState(""); const [role, setRole] = useState(DEFAULT_ROLE); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const dirty = !busy && (email !== "" || role !== DEFAULT_ROLE);
  const { allowLeave } = useUnsavedGuard(dirty, L);
  const ref = useRef<HTMLInputElement>(null); useEffect(() => { ref.current?.focus(); }, []);
  if (!svc.teamCanManage(role0)) return <Page title="Invite member" back={back}><Empty icon="team" title="You cannot do this">Only an admin or owner can invite members.</Empty></Page>;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const em = email.trim();
    if (!SRC_EMAIL.test(em) || !isEmail(em)) { setErr("Enter a valid email address."); ref.current?.focus(); return; }
    setBusy(true);
    try {
      const r = await svc.inviteMember({ email: em, role });
      allowLeave(); L.toast(r.pending ? "Invitation for " + r.email + " sent for second admin approval" : "Invitation sent to " + r.email + ", link expires in " + SOD.INVITE_TTL_H + " h"); bumpData(); go("/ws/team");
    } catch (x) { setBusy(false); setErr(""); L.toast(sodMessage(x, "Could not send the invitation"), false); }
  };
  return (
    <Page title="Invite member" sub={`The invitation link expires in ${SOD.INVITE_TTL_H} hours.`} back={back}>
      <div className="scroll rec-scroll"><form className="rec-form" onSubmit={submit} noValidate>
        <FormSection n={1} title="Who" note="Their work email address.">
          <div className="field"><label htmlFor="ti-email">Work email <span style={{ color: "var(--bad-ink)" }}>*</span></label><input ref={ref} className="input" id="ti-email" type="email" maxLength={254} autoComplete="off" spellCheck={false} placeholder="name@company.example" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!err} aria-describedby={err ? "ti-err" : undefined} /></div>
        </FormSection>
        <FormSection n={2} title="Role" note="What they can reach once they accept.">
          <div className="field"><label htmlFor="ti-role">Role</label><select className="select" id="ti-role" value={role} onChange={(e) => setRole(e.target.value)}>{svc.USER_ROLES.map((r) => <option key={r}>{r}</option>)}</select></div>
          {svc.isPrivilegedRole(role) ? <p className="field help" role="status">A privileged role needs approval from a second admin before the invitation is sent.</p> : null}
        </FormSection>
        {err ? <FormMessage id="ti-err">{err}</FormMessage> : null}
        <FormActions><button type="button" className="btn btn-secondary" onClick={() => go("/ws/team")}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy}>Send invitation</button></FormActions>
      </form></div>
    </Page>
  );
}
