/* Server-only. The retention purge job (EDGE-19 step 2; owner's decisions 2026-11-26 and 2026-11-27; migration 0017).
   - Vercel Cron calls GET /api/cron/purge once a day with "Authorization: Bearer <CRON_SECRET>". Without CRON_SECRET (at least 32 characters)
     the route answers 503 and nothing runs; a wrong secret gets 403.
   - The database decides what is past its period, skips legal holds, and refuses to delete unless deletion was switched on with four-eyes
     between platform super admins and the first 30 days of runs were report-only (0017 retention_deletion_block). Until then each run only
     reports. Each run is recorded (platform record purge-run, the platform's audit log); each deletion is in the company's audit log.
   - Files named in deleted records are removed from storage afterwards; a failure there is reported, the records stay deleted.
   - Platform super admins switch deletion on (a request a second elevated super admin approves, refused during the first 30 days) and off
     (at once, by one elevated super admin: stopping deletion is always safe). */
import { createHash, timingSafeEqual } from "node:crypto";
import type { ApprovalRow } from "./directory";
import { MemoryPlatform } from "./platform";
import { MemoryPlatStore, type PTx } from "./platstore";
import type { Deps } from "./types";
import { WsRefused } from "./ws/store";

export const PURGE_KIND = "platform-purge-delete";
export const REPORT_ONLY_DAYS = 30;
const DAY = 86_400_000;
export const PURGE_SYSTEM = { id: null, name: "Retention purge job", ip: "system", system: "retention-purge" as const };

export interface PurgeKindRow { months: number; held: boolean; due: number; deleted: number; kept?: boolean }
export interface PurgeCompany { tenantId: string; ref: string; name: string; held: string[]; kinds: Record<string, PurgeKindRow> }
export interface PurgeReport {
  id: string; at: number; mode: "report" | "delete"; due: number; deleted: number; files: number;
  companies: PurgeCompany[];
  platform: { months: number; sessions: number; notices: number; cspReports: number; expired: number; deleted: boolean };
}
export interface PurgeOutcome { report: PurgeReport; block: string | null; paths: string[] }
export interface PurgeSettings { deletion: "on" | "off"; approvalId?: string; requestedBy?: string; approvedBy?: string; at: number; by: string; reason: string; ticket?: string }

export const NOT_ON = "deletion is not switched on";

/** The cron secret (Deps for the tests, else the environment); "" when not set. */
export const cronSecretOf = (d: Deps) => String((d.cronSecret === undefined ? process.env.CRON_SECRET : d.cronSecret) ?? "");

/** GET cron/purge: Vercel Cron, authenticated by CRON_SECRET only (no cookie, no origin). */
export async function cronPurge(d: Deps, r: { headers: Record<string, string | undefined> }) {
  const secret = cronSecretOf(d);
  if (secret.length < 32) return { status: 503, body: { error: "The purge job is not configured." } };
  if (!cronAuthorized(r.headers.authorization, secret)) return { status: 403, body: { error: "Not permitted." } };
  const x = await runPurge(d);
  return { status: 200, body: { id: x.id, mode: x.mode, due: x.due, deleted: x.deleted, files: x.files, filesFailed: x.filesFailed, ...(x.refused ? { refused: x.refused } : {}) } };
}

/** Constant-time check of the cron header. */
export function cronAuthorized(header: string | undefined, secret: string): boolean {
  const a = createHash("sha256").update(String(header ?? "")).digest(); const b = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(a, b);
}

/** One run: the database's report (or deletion), then the files of deleted records. */
export async function runPurge(d: Deps): Promise<PurgeReport & { filesFailed: number; refused?: string }> {
  if (d.plat instanceof MemoryPlatform) d.plat.pstore ??= (d.pstore ??= new MemoryPlatStore(d.store)); // the tests' stand-in
  const { report, block, paths } = await d.plat.retentionPurge(d.now());
  let filesFailed = 0;
  if (report.mode === "delete" && paths.length && d.files.configured) {
    for (let i = 0; i < paths.length; i += 100) {
      const part = paths.slice(i, i + 100);
      try { await d.files.remove(part); } catch { filesFailed += part.length; }
    }
  }
  return { ...report, filesFailed, ...(block && block !== NOT_ON ? { refused: block } : {}) };
}

/** The first recorded run, and from when deletion may be switched on. */
export async function purgeState(t: PTx) {
  const settings = (await t.get<PurgeSettings>("purge-settings", "settings"))?.data ?? null;
  const runs = (await t.list<PurgeReport>("purge-run")).map((x) => x.data).sort((a, b) => b.at - a.at);
  const firstRunAt = runs.length ? runs[runs.length - 1].at : null;
  return { settings, runs, firstRunAt, deletionFrom: firstRunAt === null ? null : firstRunAt + REPORT_ONLY_DAYS * DAY };
}

/** Why deletion cannot be switched on now, or null. */
export function enableBlock(s: Awaited<ReturnType<typeof purgeState>>, now: number): string | null {
  if (s.settings?.deletion === "on") return "Deletion is already switched on.";
  if (s.deletionFrom === null) return "The purge job has not run yet. Deletion can be switched on 30 days after its first run.";
  if (now < s.deletionFrom) return `The first ${REPORT_ONLY_DAYS} days are report-only. Deletion can be switched on from ${new Date(s.deletionFrom).toISOString().slice(0, 10)}.`;
  return null;
}

/** What an approved request to switch deletion on does, in the decision's transaction. */
export async function applyPurgeDeletion(t: PTx, a: ApprovalRow, approvers: string) {
  const s = await purgeState(t); const bad = enableBlock(s, t.now); if (bad) throw new WsRefused(`${bad} Reject this request.`, 409);
  const p = a.payload as Record<string, unknown>;
  const next: PurgeSettings = { deletion: "on", approvalId: a.id, requestedBy: a.requestedByName, approvedBy: approvers, at: t.now, by: approvers, reason: String(p.reason ?? ""), ticket: String(p.ticket ?? "") };
  await writeSettings(t, next);
  await t.audit("retention.purge.deletion_on", `Retention deletion switched on; ticket ${next.ticket}; requested by ${a.requestedByName}; approved by ${approvers}`, "Data");
}

export async function switchOff(t: PTx, by: string, reason: string) {
  const cur = await t.get<PurgeSettings>("purge-settings", "settings");
  if (cur?.data.deletion !== "on") throw new WsRefused("Deletion is not switched on.", 409);
  await writeSettings(t, { deletion: "off", at: t.now, by, reason });
  await t.audit("retention.purge.deletion_off", `Retention deletion switched off by ${by}; reason: ${reason}`, "Data");
}

async function writeSettings(t: PTx, s: PurgeSettings) {
  const cur = await t.get<PurgeSettings>("purge-settings", "settings");
  if (cur) await t.update("purge-settings", "settings", s, cur.version); else await t.insert("purge-settings", "settings", null, s);
}

/** A run's summary for the list (the full report is fetched on its own). */
export const runSummary = (x: PurgeReport) => ({ id: x.id, at: x.at, mode: x.mode, due: x.due, deleted: x.deleted, files: x.files, companies: x.companies.length });
