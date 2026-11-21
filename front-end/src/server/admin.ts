/* Server-only. The Admin Console API (slice 3a). Platform staff only: super admins and support read; only a platform super admin with a live
   elevation (reason, ticket, 60 minutes at most) changes anything, and every company change is a request another super admin approves
   (docs/security/SOD_MATRIX.md sections 2 and 3). The database checks the elevation again for the company functions (migration 0006).
   Registered into core.ts's route table through `adminRoutes`, which receives core's helpers (no import cycle). */
import { sendMail } from "./mail";
import { approvalBlock, companyBlock, elevationBlock, reasonBlock } from "@/lib/rules";
import { isEmail } from "@/lib/security";
import type { Ctx, Req, Res } from "./core";
import type { Log, Outcome } from "./directory";
import type { AuditRow, Deps, Profile } from "./types";
import type { PlatformKind } from "./platform";
import { applyGroup8 } from "./admin8";

type H = (d: Deps, r: Req) => Promise<Res>;
export interface AdminHelpers {
  signed: (h: (d: Deps, r: Req, c: Ctx) => Promise<Res>) => H;
  entry: (d: Deps, r: Req, p: Profile, a: Ctx["a"], action: string, target: string) => AuditRow;
  randomId: (bytes?: number) => string;
  sha256Hex: (s: string) => Promise<string>;
}
const ok = (body?: unknown): Res => ({ status: body === undefined ? 204 : 200, body });
const err = (status: number, error: string): Res => ({ status, body: { error } });
const s = (v: unknown, max = 300) => String(v ?? "").slice(0, max);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOUR = 3600_000;
export const ELEVATE_FIRST = "Elevate to make changes.";
/** What a request is about, for the screens: plain values only, never more than the title already says. */
const summary = (p: Record<string, unknown>) => Object.fromEntries(Object.entries(p).filter(([k, v]) => ["invoiceId", "code", "ticket", "reason", "person", "company", "amount"].includes(k) && (typeof v === "string" || typeof v === "number")));
const outcome = (o: Outcome): Res => ("error" in o ? err(o.code, o.error) : ok({ status: o.status }));

export function adminRoutes(h: AdminHelpers): Record<string, H> {
  const staff = (fn: (d: Deps, r: Req, c: Ctx) => Promise<Res>) => h.signed(async (d, r, c) => (c.a.platform ? fn(d, r, c) : err(403, "Not permitted.")));
  /** Changes: a platform super admin with a live elevation. Support never changes anything. */
  const elevated = (fn: (d: Deps, r: Req, c: Ctx) => Promise<Res>) => staff(async (d, r, c) => {
    if (c.a.role !== "super") return err(403, "Not permitted.");
    return (await d.plat.elevation(c.p.id, d.now())) ? fn(d, r, c) : err(403, ELEVATE_FIRST);
  });
  const log = (d: Deps, r: Req, c: Ctx): Log => (action, target) => h.entry(d, r, c.p, c.a, action, target);
  const needSecond = async (d: Deps, c: Ctx) => (await d.plat.superAdmins(c.p.id)).filter((x) => x !== c.p.id).length < 1
    ? "No other platform super admin can approve this. Add a second one first (docs/guides/SUPABASE.md section 5)." : null;

  /* ---------- elevation ---------- */
  const elevationGet = staff(async (d, _r, c) => ok({ elevation: await d.plat.elevation(c.p.id, d.now()), canElevate: c.a.role === "super" }));
  const elevationStart = staff(async (d, r, c) => {
    if (c.a.role !== "super") return err(403, "Only platform super admins can elevate.");
    const e = { reason: s(r.body.reason).trim(), ticket: s(r.body.ticket, 20).trim(), minutes: Number(r.body.minutes) };
    const why = elevationBlock(e); if (why) return err(400, why);
    const row = await d.plat.startElevation(c.p.id, e, d.now(), h.entry(d, r, c.p, c.a, "platform.elevation.started", `${e.minutes} minutes; ticket ${e.ticket}; reason: ${e.reason}`));
    return row ? ok({ elevation: row }) : err(409, "This account is already elevated, or has a support session open. End it first.");
  });
  const elevationEnd = staff(async (d, r, c) => {
    const done = await d.plat.endElevation(c.p.id, d.now(), h.entry(d, r, c.p, c.a, "platform.elevation.ended", "ended early"));
    return done ? ok() : err(409, "This account is not elevated.");
  });

  /* ---------- companies ---------- */
  const companyList = staff(async (d, _r, c) => ok(await d.plat.companies(c.p.id)));
  /** Asks to create a company with its first admin (by invitation). Another super admin approves; the company exists only then. */
  const companyCreate = elevated(async (d, r, c) => {
    const ref = s(r.body.ref, 40).trim().toLowerCase(); const name = s(r.body.name, 120).trim(); const adminEmail = s(r.body.adminEmail, 254).trim().toLowerCase(); const now = d.now();
    const bad = companyBlock({ ref, name }); if (bad) return err(400, bad);
    if (!isEmail(adminEmail)) return err(400, "Enter the first admin's work email.");
    if ((await d.plat.companies(c.p.id)).some((x) => x.ref === ref) || (await d.plat.pendingApproval(c.p.id, "platform-company-create", ref, now))) return err(409, "That company code is taken or already requested.");
    const p = await d.store.profileByEmail(adminEmail); if (p && (await d.dir.platformRole(p.id))) return err(409, "Platform staff cannot be a company admin.");
    const none = await needSecond(d, c); if (none) return err(409, none);
    const title = `Create company ${ref} (${name}) with first admin ${adminEmail}`;
    const id = await d.plat.requestApproval(c.p.id, { kind: "platform-company-create", title, subject: ref, payload: { ref, name, adminEmail }, ttlMs: 24 * HOUR },
      now, h.entry(d, r, c.p, c.a, "approval.platform-company-create.requested", title));
    return { status: 202, body: { pending: true, id } };
  });
  /** suspend | reactivate (a request another super admin approves, with a reason) | admin-link (the first admin's invitation link, shown once). */
  const companyAction = elevated(async (d, r, c) => {
    const ref = s(r.path[2], 40).toLowerCase(); const action = r.path[3]; const now = d.now();
    if (!["suspend", "reactivate", "admin-link"].includes(action)) return err(404, "Not found.");
    const co = (await d.plat.companies(c.p.id)).find((x) => x.ref === ref); if (!co) return err(404, "Company not found.");
    if (action === "admin-link") {
      const token = h.randomId(32);
      const v = await d.plat.adminInviteLink(c.p.id, co.id, await h.sha256Hex(token), now, h.entry(d, r, c.p, c.a, "platform.company.admin_link_created", co.ref));
      if (!v) return err(409, "This company has no pending first-admin invitation from the platform.");
      const link = `${d.site.origin}/login#invite=${token}`;
      const m = await sendMail(d, v.email, { t: "first-admin", company: co.name, link, expires: new Date(v.expiresAt).toISOString().slice(0, 16).replace("T", " ") + " UTC" }, { tenantId: null, actor: c.p.person, ip: r.ip });
      return ok(m.sent ? { emailed: true, email: v.email, expiresAt: v.expiresAt } : { emailed: false, mail: m.reason, link, email: v.email, expiresAt: v.expiresAt });
    }
    const kind: PlatformKind = action === "suspend" ? "platform-company-suspend" : "platform-company-reactivate";
    if (action === "suspend" ? co.status !== "Active" : co.status !== "Suspended") return err(409, `The company is ${co.status.toLowerCase()}.`);
    const reason = s(r.body.reason).trim(); const short = reasonBlock(reason); if (short) return err(400, short);
    if (await d.plat.pendingApproval(c.p.id, kind, co.id, now)) return err(409, "A request for this company is already pending.");
    const none = await needSecond(d, c); if (none) return err(409, none);
    const title = `${action === "suspend" ? "Suspend" : "Reactivate"} company ${co.ref} (${co.name})`;
    const id = await d.plat.requestApproval(c.p.id, { kind, title, subject: co.id, payload: { companyId: co.id, ref: co.ref, reason }, ttlMs: 24 * HOUR },
      now, h.entry(d, r, c.p, c.a, `approval.${kind}.requested`, `${title}; reason: ${reason}`));
    return { status: 202, body: { pending: true, id } };
  });

  /* ---------- platform requests (four-eyes) ---------- */
  const approvalList = staff(async (d, _r, c) => {
    const now = d.now(); const live = c.a.role === "super" && !!(await d.plat.elevation(c.p.id, now));
    return ok((await d.plat.approvals(c.p.id)).map((x) => {
      const status = x.status === "Pending" && x.expiresAt <= now ? "Expired" : x.status;
      const rule = status === "Pending" ? approvalBlock({ key: c.p.id, base: c.a.role }, { status, expiresAt: x.expiresAt, approverRoles: x.approverRoles, requestedBy: x.requestedBy, forbid: x.forbid, votes: x.votes.map((v) => v.by) }, now) : null;
      return { id: x.id, kind: x.kind, title: x.title, requestedBy: x.requestedByName, status, createdAt: x.createdAt, expiresAt: x.expiresAt, reason: x.decidedReason ?? null,
        votes: x.votes.map((v) => ({ by: v.byName, at: v.at, reason: v.reason })), mine: x.requestedBy === c.p.id, named: x.payload.namedName ?? null, payload: summary(x.payload),
        block: rule ?? (status === "Pending" && x.payload.named && x.payload.named !== c.p.id ? `Only the named approver (${String(x.payload.namedName)}) can decide this request.` : null) ?? (status === "Pending" && !live ? ELEVATE_FIRST : null) };
    }));
  });
  const approvalDecide = elevated(async (d, r, c) => {
    const id = s(r.path[2], 100); const decision = r.path[3];
    if (!["approve", "reject", "withdraw"].includes(decision)) return err(404, "Not found.");
    if (!UUID_RE.test(id)) return err(404, "Request not found.");
    const actor = { id: c.p.id, role: c.a.role };
    if (decision === "withdraw") return outcome(await d.plat.withdrawApproval(actor, id, d.now(), log(d, r, c)));
    const why = s(r.body.reason).trim(); const short = reasonBlock(why); if (short) return err(400, short);
    const row = (await d.plat.approvals(c.p.id)).find((x) => x.id === id);
    if (row?.payload.named && row.payload.named !== c.p.id) return err(403, `Only the named approver (${String(row.payload.namedName)}) can decide this request.`);
    return outcome(await d.plat.decideApproval(actor, id, decision === "approve", why, d.now(), log(d, r, c), (q, a, by) => applyGroup8(d, q, a, by, { id: c.p.id, name: c.p.person, ip: r.ip })));
  });

  /* ---------- platform audit log ---------- */
  const auditList = staff(async (d, _r, c) => {
    const bad = await d.plat.verifyAudit(c.p.id);
    return ok({ entries: await d.plat.auditLog(c.p.id, 300), verified: bad === null, firstBad: bad });
  });

  return {
    "GET admin/elevation": elevationGet, "POST admin/elevation": elevationStart, "POST admin/elevation/end": elevationEnd,
    "GET admin/companies": companyList, "POST admin/companies": companyCreate, "POST admin/companies/:ref/:action": companyAction,
    "GET admin/approvals": approvalList, "POST admin/approvals/:id/:decision": approvalDecide, "GET admin/audit": auditList,
  };
}
