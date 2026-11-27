/* Server-only. Account erasure (EDGE-19; owner's decisions 2026-11-26; docs/security/DATA_RETENTION.md section 3).
   Only platform super admins, each with a live elevation:
   1. One asks to erase an account (reason, ticket). The person must no longer be an active member of any company (the company offboards
      them first, which hands over their work and access) and must not be platform staff.
   2. A second super admin approves (the platform four-eyes engine). From then the account is blocked at once: every session ends and
      sign-in is refused. The erasure is scheduled 14 days later.
   3. During those 14 days a super admin can cancel it (with a reason): the account is unblocked.
   4. After them, a super admin completes it: the database erases the person (migration 0015 erase_person: audit log, workspace records,
      credentials, profile), then the sign-in account is emptied (it stays blocked) and the person's short-lived sign-in records are removed.
   Each step is in the platform's audit log; companies' logs get "privacy.erasure.completed" with the pseudonym only. The erasure record
   keeps the pseudonym and a masked address, never the address itself. */
import { createHmac } from "node:crypto";
import { maskEmail } from "./mail";
import type { ApprovalRow } from "./directory";
import type { PActor, PTx } from "./platstore";
import type { Deps } from "./types";
import { WsRefused } from "./ws/store";

export const ERASE_KIND = "platform-account-erase";
export const ERASURE_GRACE_MS = 14 * 86_400_000;
const REC = "account-erasure";

export interface ErasureRecord {
  userId: string; pseudonym: string; email: string; status: "Scheduled" | "Cancelled" | "Completed";
  reason: string; ticket: string; requestedBy: string; approvedBy: string; approvalId: string;
  scheduledAt: number; dueAt: number; cancelledAt?: number; cancelledBy?: string; cancelReason?: string;
  completedAt?: number; completedBy?: string; result?: { auditEntries: number; records: number; companies: number };
}

/** A stable pseudonym for the person, which cannot be traced back without the server's secret. */
export const pseudonymOf = (d: Deps, userId: string) => `Former member · M-${createHmac("sha256", d.secret).update(`erasure\u0000${userId}`).digest("hex").slice(0, 8)}`;

/** Why this person cannot be asked to be erased now, or null. */
export async function eraseBlock(d: Deps, userId: string): Promise<string | null> {
  const p = await d.store.profileById(userId);
  if (!p) return "No account with that email address.";
  if (p.status === "Erased") return "This account is already erased.";
  if (await d.dir.platformRole(userId)) return "Platform staff cannot be erased this way. Remove them from the platform staff first.";
  if ((await d.dir.companiesOf(userId)).length) return "This person is still an active member of a company. The company offboards them first (People, Offboard), which hands over their work and access.";
  return null;
}

/** What an approved erasure request does, in the decision's transaction: block the account, end its sessions, schedule the erasure. */
export async function applyErasure(d: Deps, t: PTx, a: ApprovalRow, approvers: string) {
  const p = a.payload as Record<string, unknown>; const userId = String(p.userId);
  const bad = await eraseBlock(d, userId); if (bad) throw new WsRefused(`${bad} Reject this request.`, 409);
  const prev = await t.get<ErasureRecord>(REC, userId);
  if (prev && prev.data.status === "Scheduled") throw new WsRefused("An erasure is already scheduled for this account. Reject this request.", 409);
  const rec: ErasureRecord = { userId, pseudonym: pseudonymOf(d, userId), email: String(p.email), status: "Scheduled", reason: String(p.reason), ticket: String(p.ticket),
    requestedBy: a.requestedByName, approvedBy: approvers, approvalId: a.id, scheduledAt: t.now, dueAt: t.now + ERASURE_GRACE_MS };
  if (prev) await t.update(REC, userId, rec, prev.version); else await t.insert(REC, userId, null, rec);
  await d.auth.setBanned(userId, true);
  for (const s of await d.store.sessionsOf(userId)) if (!s.revokedAt) await d.store.updateSession(s.idHash, { revokedAt: t.now, revokedWhy: "Account erasure" });
  await t.audit("privacy.erasure.scheduled", `${rec.pseudonym} (${rec.email}): blocked now, erased after ${new Date(rec.dueAt).toISOString().slice(0, 10)}; ticket ${rec.ticket}; requested by ${rec.requestedBy}; approved by ${approvers}`, "Access");
}

/** The erasure records, newest first, with the person's current name while they still exist. */
export async function listErasures(d: Deps, t: PTx) {
  const out = [];
  for (const r of await t.list<ErasureRecord>(REC)) {
    const x = r.data; const p = x.status === "Scheduled" ? await d.store.profileById(x.userId) : null;
    out.push({ ...x, person: p && p.status !== "Erased" ? p.person : x.pseudonym, due: x.status === "Scheduled" && t.now >= x.dueAt });
  }
  return out.sort((a, b) => b.scheduledAt - a.scheduledAt);
}

export async function requestErasure(d: Deps, email: string): Promise<{ userId: string; masked: string } | { error: string }> {
  const p = await d.store.profileByEmail(email.trim().toLowerCase());
  if (!p) return { error: "No account with that email address." };
  const bad = await eraseBlock(d, p.id); if (bad) return { error: bad };
  return { userId: p.id, masked: maskEmail(p.email) };
}

export async function cancelErasure(d: Deps, t: PTx, userId: string, by: string, reason: string) {
  const r = await t.get<ErasureRecord>(REC, userId);
  if (!r || r.data.status !== "Scheduled") throw new WsRefused("No erasure is scheduled for this account.", 404);
  const next: ErasureRecord = { ...r.data, status: "Cancelled", cancelledAt: t.now, cancelledBy: by, cancelReason: reason };
  await t.update(REC, userId, next, r.version);
  await d.auth.setBanned(userId, false);
  await t.audit("privacy.erasure.cancelled", `${next.pseudonym} (${next.email}); reason: ${reason}`, "Access");
}

/** Completes a scheduled erasure once its grace period has ended. */
export async function completeErasure(d: Deps, t: PTx, actor: PActor, userId: string) {
  const r = await t.get<ErasureRecord>(REC, userId);
  if (!r || r.data.status !== "Scheduled") throw new WsRefused("No erasure is scheduled for this account.", 404);
  if (t.now < r.data.dueAt) throw new WsRefused(`The 14 days end on ${new Date(r.data.dueAt).toISOString().slice(0, 16).replace("T", " ")} UTC. It can be completed after that.`, 409);
  const bad = await eraseBlock(d, userId); if (bad) throw new WsRefused(bad, 409);
  const before = await d.store.profileById(userId);
  let result: ErasureRecord["result"];
  try { result = await d.plat.erasePerson(actor.id ?? "", userId, r.data.pseudonym); }
  catch (e) { const code = (e as { code?: string }).code; if (code === "55000" || code === "P0002") throw new WsRefused("The account can no longer be erased as scheduled. Check its memberships and staff role.", 409); throw e; }
  await d.auth.scrubUser(userId, `erased-${userId.replace(/-/g, "")}@erased.invalid`);
  if (before) { await d.store.kvDel("lock", before.email); await d.store.kvDel("resetReq", userId); await d.store.kvDel("failedSince", userId); }
  const next: ErasureRecord = { ...r.data, status: "Completed", completedAt: t.now, completedBy: actor.name, result };
  await t.update(REC, userId, next, r.version);
  await t.audit("privacy.erasure.completed", `${next.pseudonym} (${next.email}): ${result.auditEntries} audit entr${result.auditEntries === 1 ? "y" : "ies"}, ${result.records} workspace record(s) in ${result.companies} compan${result.companies === 1 ? "y" : "ies"}; ticket ${next.ticket}`, "Access");
  return next;
}
