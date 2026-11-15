/* Team & Settings stubs. Mock mode keeps TEAM_SETTINGS in memory; the caller does wsLog / toast / bumpData.
 * The real API MUST authorize every settings change and invitation server-side (tenant admin only), send the invitation e-mail itself with a
 * single-use expiring token, and never trust the role chosen in the client. */
import seed from "@/data/teamSeed.json";
import roles from "@/data/userRoles.json";
import { DATA } from "@/lib/data";
import { BRANDS, DEFAULT_BRAND, isBrand } from "@/lib/brand";
import { CUSTOM_BOUNDS, acct, isPreset, ruleFor, saveAcct, validCustom } from "@/lib/accountSecurity";
import { saveTrustedNets, trustedNets, validNet, type TrustedNet } from "@/lib/ipGuard";
import { registerKind, settle } from "@/lib/approvalFlow";
import { approvals, requestApproval } from "@/lib/approvals";
import { wsLog } from "@/lib/audit";
import { clampText, isEmail, secureHex } from "@/lib/security";
import { assertNotSelf, assertRole, getActor, hasRole, isSamePerson, SodError, SOD } from "@/lib/sod";
import { bumpData } from "@/lib/store";
import { ADMIN_ROLE, adminCount, isPrivilegedRoleName, memberRole } from "@/lib/teamRoles";
import { eligibleApprovers } from "./mfa";
import { apiFetch, viaApi } from "./http";

export interface TeamSettings { reviewCycle: string; appetite: string; controlSla: string; critSla: string; approvers: string[]; baseline: string[]; /** Workspace brand preset id (`@/lib/brand`). */ brand: string; /** Agent track record before raising autonomy: approved suggestions needed (and the clean window), 0 = no track record required. */ agentTrackRecord: number }
export const TEAM_SETTINGS: TeamSettings = { brand: DEFAULT_BRAND, agentTrackRecord: 3, ...JSON.parse(JSON.stringify(seed.TEAM_SETTINGS)) };
export const USER_ROLES: string[] = roles.USER_ROLES;
export const REVIEW_CYCLES = ["Monthly", "Quarterly", "Annually"];
export const APPETITES = ["Low", "Moderate", "High"];
const post = <T,>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });

/** Admins only (admin, admin2). UI gate; every mutation below asserts the role again. */
export const teamCanManage = (roleId: string) => hasRole(roleId, "admin");
export const KINDS = ["team-role", "team-invite", "team-network"];
export const isPrivilegedRole = isPrivilegedRoleName;
const fmtUtc = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";

/** Settings, SLAs, review cycles: admin only, every change audited with before and after. */
export function setSetting(key: "reviewCycle" | "appetite" | "controlSla" | "critSla", value: string) {
  return viaApi<void>(() => {
    assertRole("change review cycles and SLAs", "admin");
    if (key === "reviewCycle" && !REVIEW_CYCLES.includes(value)) throw new SodError("Choose a valid review cycle.");
    if (key === "appetite" && !APPETITES.includes(value)) throw new SodError("Choose a valid appetite.");
    const before = TEAM_SETTINGS[key]; TEAM_SETTINGS[key] = clampText(value, 40);
    wsLog("team.setting.changed", `${key}: ${before} → ${TEAM_SETTINGS[key]}`, "System"); bumpData();
  }, () => post<void>("/team/settings", { [key]: value }));
}
/** Workspace colour: admin only, one of the contrast-checked presets (anything else is refused), audited with before and after. */
export function setBrand(id: string) {
  return viaApi<void>(() => {
    assertRole("change the workspace colour", "admin");
    if (!isBrand(id)) throw new SodError("Choose one of the listed colours.");
    const before = TEAM_SETTINGS.brand; TEAM_SETTINGS.brand = id;
    wsLog("team.brand.changed", `${before} → ${id}`, "System"); bumpData();
  }, () => post<void>("/team/settings", { brand: id }));
}
export const BRAND_CHOICES = BRANDS;
/** Track record an agent needs before its autonomy can be raised (docs/security/SOD_MATRIX.md section 11). 0 turns it off for small teams;
 *  the second person's approval of the raise always stays. */
export const TRACK_RECORD_CHOICES = [{ value: 3, label: "3 suggestions" }, { value: 2, label: "2 suggestions" }, { value: 0, label: "Off" }] as const;
/** Admin only, one of the listed values (anything else is refused), audited with before and after. */
export function setAgentTrackRecord(n: number) {
  return viaApi<void>(() => {
    assertRole("change the agent track record", "admin");
    if (!TRACK_RECORD_CHOICES.some((c) => c.value === n)) throw new SodError("Choose 3, 2 or Off.");
    const before = TEAM_SETTINGS.agentTrackRecord; if (before === n) return;
    TEAM_SETTINGS.agentTrackRecord = n;
    const show = (v: number) => (v ? `${v} approved suggestions` : "off");
    wsLog("team.agent_track_record.changed", `${show(before)} → ${show(n)}`, "System"); bumpData();
  }, () => post<void>("/team/settings", { agentTrackRecord: n }));
}
export function saveSettings() {
  return viaApi<void>(() => { assertRole("save settings", "admin"); }, () => post<void>("/team/settings/save", { ...TEAM_SETTINGS }));
}
export function addApprover(name: string) {
  return viaApi<void>(() => {
    assertRole("add an approver", "admin");
    const n = clampText(name, 80); if (!n) throw new SodError("Name is required.");
    TEAM_SETTINGS.approvers.push(n); wsLog("procurement.approver.added", n, "System"); bumpData();
  }, () => post<void>("/team/approvers", { name }));
}
/** Removing an approver needs an admin and is audited; the last approver cannot be removed (the gate must always have one). */
export function removeApprover(i: number) {
  return viaApi<string | null>(() => {
    assertRole("remove an approver", "admin");
    const a = TEAM_SETTINGS.approvers[i]; if (a === undefined) return null;
    if (TEAM_SETTINGS.approvers.length <= 1) throw new SodError("The last approver cannot be removed.");
    TEAM_SETTINGS.approvers.splice(i, 1); wsLog("procurement.approver.removed", a, "System"); bumpData(); return a;
  }, () => apiFetch<string | null>(`/team/approvers/${i}`, { method: "DELETE" }));
}

/* ---------- invitations (72 h) ---------- */
export interface Invitation { id: string; email: string; role: string; invitedBy: string; createdAt: number; expiresAt: number; status: "Pending" | "Expired" | "Revoked" }
export const INVITATIONS: Invitation[] = [];
/** Marks elapsed invitations Expired (audited once each). Call from the UI on a timer and before any invitation action. */
export function sweepInvites(): void {
  const now = Date.now(); let ch = false;
  INVITATIONS.forEach((v) => { if (v.status === "Pending" && v.expiresAt <= now) { v.status = "Expired"; wsLog("member.invitation.expired", `${v.email} (${v.role}); ${v.id}`, "Access"); ch = true; } });
  if (ch) bumpData();
}
const issue = (email: string, role: string, by: string): Invitation => {
  const now = Date.now();
  const v: Invitation = { id: "INV-" + secureHex(3).toUpperCase(), email, role, invitedBy: by, createdAt: now, expiresAt: now + SOD.INVITE_TTL_H * 3600_000, status: "Pending" };
  INVITATIONS.unshift(v);
  wsLog("member.invited", `${email} (${role}); ${v.id}; link expires ${fmtUtc(v.expiresAt)}`, "Access"); bumpData();
  return v;
};
registerKind("team-invite", {
  describe: (a) => `Invite ${a.payload.email} as ${a.payload.role}`,
  apply: (a) => { issue(String(a.payload.email), String(a.payload.role), a.requestedBy + " (approved by " + a.approvals.map((x) => x.by).join(", ") + ")"); },
  closed: (a) => { wsLog("member.invite." + a.status.toLowerCase(), `${a.payload.email} (${a.payload.role})${a.decidedReason ? "; reason: " + a.decidedReason : ""}`, "Access"); },
});
registerKind("team-role", {
  describe: (a) => `${a.payload.from} → ${a.payload.role}`,
  apply: (a) => {
    const p = DATA.people.find((x) => x.id === a.payload.personId); if (!p) return;
    p.wsRole = String(a.payload.role);
    wsLog("member.role.changed", `${p.name}: ${a.payload.from} → ${a.payload.role}; requested by ${a.requestedBy}, approved by ${a.approvals.map((x) => x.by).join(", ")}`, "Access"); bumpData();
  },
  closed: (a) => { wsLog("member.role." + a.status.toLowerCase(), `${a.subject} → ${a.payload.role}${a.decidedReason ? "; reason: " + a.decidedReason : ""}`, "Access"); },
});

/** Invite a member. Privileged roles (admin, owner, super*) need a second admin; others are issued now. The role must be a known role (no silent fallback). */
export function inviteMember(input: { email: string; role: string }) {
  return viaApi<{ email: string; role: string; pending: boolean; expiresAt: number }>(() => {
    settle(); sweepInvites();
    assertRole("invite members", "admin");
    const email = clampText(input.email, 254).toLowerCase();
    if (!isEmail(email)) throw new SodError("Enter a valid email address.");
    if (!USER_ROLES.includes(input.role)) throw new SodError("Choose a valid role.");
    if (INVITATIONS.some((v) => v.status === "Pending" && v.email === email) || approvals.get().list.some((a) => a.status === "Pending" && a.kind === "team-invite" && a.payload.email === email)) throw new SodError("An invitation for this email is already pending.");
    if (isPrivilegedRoleName(input.role)) {
      if (!eligibleApprovers(["admin"]).length) throw new SodError("No eligible second admin to approve a privileged invitation.");
      requestApproval({ kind: "team-invite", title: `Invite ${email} as ${input.role}`, subject: email, needs: 1, approverRoles: ["admin"], ttlHours: SOD.INVITE_TTL_H, domain: "ws", payload: { email, role: input.role } });
      wsLog("member.invite.requested", `${email} (${input.role}); second admin approval required`, "Access");
      return { email, role: input.role, pending: true, expiresAt: 0 };
    }
    const v = issue(email, input.role, "self");
    return { email, role: input.role, pending: false, expiresAt: v.expiresAt };
  }, () => post<{ email: string; role: string; pending: boolean; expiresAt: number }>("/team/invitations", input));
}
export function revokeInvitation(id: string) {
  return viaApi<void>(() => {
    assertRole("revoke an invitation", "admin");
    const v = INVITATIONS.find((x) => x.id === id); if (!v || v.status !== "Pending") throw new SodError("Invitation is not pending.");
    v.status = "Revoked"; wsLog("member.invitation.revoked", `${v.email} (${v.role}); ${v.id}`, "Access"); bumpData();
  }, () => post<void>(`/team/invitations/${encodeURIComponent(id)}/revoke`, {}));
}

/** Grant/change a member's workspace role. Nobody changes their own; the last admin cannot be demoted; granting a privileged role needs a second admin. */
export function changeMemberRole(personId: string, role: string) {
  return viaApi<{ name: string; pending: boolean }>(() => {
    settle();
    assertRole("change a member's role", "admin");
    const p = DATA.people.find((x) => x.id === personId); if (!p) throw new SodError("Person not found.");
    assertNotSelf("nobody changes their own role", p.name);
    if (!USER_ROLES.includes(role)) throw new SodError("Choose a valid role.");
    const from = memberRole(p); if (from === role) throw new SodError("That is already their role.");
    if (from === ADMIN_ROLE && role !== ADMIN_ROLE && adminCount() <= 1) throw new SodError("The last remaining admin cannot be demoted.");
    if (isPrivilegedRoleName(role)) {
      if (approvals.get().list.some((a) => a.status === "Pending" && a.kind === "team-role" && isSamePerson(a.subject, p.name))) throw new SodError("A role change is already pending for this person.");
      if (!eligibleApprovers(["admin"], p.name).length) throw new SodError("No eligible second admin (not you, not the member).");
      const ap = requestApproval({ kind: "team-role", title: `Grant ${role} to ${p.name}`, subject: p.name, needs: 1, approverRoles: ["admin"], forbid: [p.name], ttlHours: 72, domain: "ws", payload: { personId: p.id, role, from } });
      wsLog("member.role.requested", `${p.name}: ${from} → ${role}; second admin approval required (${ap.id})`, "Access");
      return { name: p.name as string, pending: true };
    }
    p.wsRole = role;
    wsLog("member.role.changed", `${p.name}: ${from} → ${role}`, "Access"); bumpData();
    return { name: p.name as string, pending: false };
  }, () => post<{ name: string; pending: boolean }>(`/team/members/${encodeURIComponent(personId)}/role`, { role }));
}

/* ---------- sign-in protection settings (docs/security/SOD_MATRIX.md section 12) ---------- */
/** Account lockout preset for this company's workspace accounts: admin only, one of the presets, audited with before and after. */
export function setLockoutPreset(v: string, custom?: { attempts: number; minutes: number }) {
  return viaApi<void>(() => {
    assertRole("change the account lockout", "admin");
    if (!isPreset(v)) throw new SodError("Choose one of the listed presets.");
    if (v === "custom" && (!custom || !validCustom(custom))) throw new SodError(`Custom lockout: ${CUSTOM_BOUNDS.attempts[0]} to ${CUSTOM_BOUNDS.attempts[1]} attempts and ${CUSTOM_BOUNDS.minutes[0]} to ${CUSTOM_BOUNDS.minutes[1]} minutes, whole numbers.`);
    const s = acct(); const before = ruleFor(s.lockout);
    if (s.lockout === v && (v !== "custom" || (s.custom.attempts === custom!.attempts && s.custom.minutes === custom!.minutes))) return;
    s.lockout = v; if (v === "custom") s.custom = { attempts: custom!.attempts, minutes: custom!.minutes }; saveAcct();
    const after = ruleFor(v);
    wsLog("team.lockout.changed", `${before.label} (${before.note}) → ${after.label} (${after.note})`, "Access"); bumpData();
  }, () => post<void>("/team/settings", { lockout: v, custom }));
}
export const lockoutPreset = () => acct().lockout;
/** A trusted office network is never blocked for failed sign-ins (accounts still lock and MFA still applies). Adding one weakens a control, so a
 *  second company admin approves it; removing one is immediate. */
export function requestTrustedNet(netIn: string, labelIn: string) {
  return viaApi<TrustedNet>(() => {
    assertRole("add a trusted office network", "admin");
    const net = String(netIn ?? "").trim(); const label = clampText(labelIn, 60);
    if (!validNet(net)) throw new SodError("Enter one address (203.0.113.7) or one /24 network (203.0.113.0/24).");
    if (label.length < 3) throw new SodError("Name the office or network.");
    if (trustedNets().some((n) => n.net === net && n.status !== "Removed")) throw new SodError("That network is already listed.");
    const me = getActor().name;
    const n: TrustedNet = { id: "TN-" + secureHex(3).toUpperCase(), net, label, requestedBy: me, status: "Pending" };
    const ap = requestApproval({ kind: "team-network", title: `Trust office network ${net} (${label})`, subject: net, needs: 1, approverRoles: ["admin"], ttlHours: 72, domain: "ws", payload: { id: n.id, net, label } });
    n.approvalId = ap.id; trustedNets().push(n); saveTrustedNets();
    wsLog("team.network.requested", `${net} (${label})`, "Access");
    return n;
  }, () => post<TrustedNet>("/team/trusted-networks", { net: netIn, label: labelIn }));
}
export function removeTrustedNet(id: string) {
  return viaApi<TrustedNet>(() => {
    assertRole("remove a trusted office network", "admin");
    const n = trustedNets().find((x) => x.id === id && x.status !== "Removed"); if (!n) throw new SodError("Network not found.");
    n.status = "Removed"; saveTrustedNets();
    wsLog("team.network.removed", `${n.net} (${n.label})`, "Access");
    return n;
  }, () => apiFetch<TrustedNet>(`/team/trusted-networks/${encodeURIComponent(id)}`, { method: "DELETE" }));
}
registerKind("team-network", {
  describe: (a) => `Trust ${a.payload.net} (${a.payload.label})`,
  apply: (a) => {
    const n = trustedNets().find((x) => x.id === a.payload.id); if (!n || n.status !== "Pending") return;
    n.status = "Active"; n.approvedBy = a.approvals.map((x) => x.by).join(", "); saveTrustedNets();
    wsLog("team.network.trusted", `${n.net} (${n.label}); requested by ${a.requestedBy}, approved by ${n.approvedBy}`, "Access");
  },
  closed: (a) => {
    const n = trustedNets().find((x) => x.id === a.payload.id); if (n && n.status === "Pending") { n.status = "Removed"; saveTrustedNets(); }
    wsLog("team.network." + a.status.toLowerCase(), `${a.payload.net}${a.decidedReason ? "; reason: " + a.decidedReason : ""}`, "Access");
  },
});
