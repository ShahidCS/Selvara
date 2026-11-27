/* Data retention: the kinds of company records, how long each is kept by default, and the minimum (DRAFT for compliance review:
   docs/security/SOD_MATRIX.md section 14, docs/security/DATA_RETENTION.md). Shared by the demonstration (features/team/services/governance.ts)
   and the server (team/retention routes, migration 0016). Rules: keeping data longer applies at once; keeping it for less time needs a
   different company admin and never goes below the minimum; a legal hold stops all deletion of a kind at once, and releasing it needs a
   company admin other than the one who placed it (and other than the one who asks). */

export interface RetentionDef { id: string; label: string; months: number; floor: number; basis: string }
/** Defaults and floors are DRAFTS. Floors reflect common record-keeping duties (for example FATF Recommendation 11: at least five years for
 *  customer due diligence and transaction records) and must be confirmed per regulator by compliance. */
export const RETENTION_DEFS: readonly RetentionDef[] = [
  { id: "audit", label: "Audit logs", months: 84, floor: 60, basis: "Evidence of who did what; AML record keeping (draft floor 5 years)" },
  { id: "evidence", label: "Control evidence", months: 84, floor: 60, basis: "Audit and certification evidence" },
  { id: "risks", label: "Closed risks and acceptances", months: 84, floor: 60, basis: "Risk decisions and their approvals" },
  { id: "policies", label: "Retired policy versions", months: 120, floor: 60, basis: "What rule applied when" },
  { id: "issues", label: "Closed issues", months: 36, floor: 12, basis: "Remediation history" },
  { id: "access", label: "Access reviews", months: 36, floor: 12, basis: "Access recertification evidence" },
  { id: "security", label: "Sign-in history and security alerts", months: 12, floor: 6, basis: "Account security investigations" },
  { id: "joins", label: "Rejected requests to join", months: 3, floor: 1, basis: "Data minimisation: personal data not needed after the decision" },
];
export const MAX_RETENTION_MONTHS = 240;

export interface LegalHold { by: string; byId: string; at: number; reason: string }
/** What a company has stored (only what differs from the defaults, and holds). */
export type RetentionSettings = Record<string, { months?: number; hold?: LegalHold }>;
export interface RetentionRow extends RetentionDef { hold: LegalHold | null }

export const retentionDef = (id: string): RetentionDef | undefined => RETENTION_DEFS.find((x) => x.id === id);

/** Every kind, with the company's period (never below the floor) and its hold. Unknown stored keys are ignored. */
export function resolveRetention(stored: unknown): RetentionRow[] {
  const s = stored && typeof stored === "object" ? (stored as RetentionSettings) : {};
  return RETENTION_DEFS.map((d) => {
    const x = s[d.id] ?? {}; const m = Number(x.months);
    return { ...d, months: Number.isInteger(m) && m >= d.floor && m <= MAX_RETENTION_MONTHS ? m : d.months, hold: x.hold && typeof x.hold === "object" ? x.hold : null };
  });
}

/** Why a new period cannot be set, or null. `shorter` tells the caller a second admin must approve it. */
export function retentionChange(id: string, months: unknown, current: number): { error: string } | { months: number; shorter: boolean } {
  const d = retentionDef(id); if (!d) return { error: "Unknown record type." };
  const m = Number(months);
  if (!Number.isInteger(m) || m < 1 || m > MAX_RETENTION_MONTHS) return { error: `Enter a whole number of months, at most ${MAX_RETENTION_MONTHS}.` };
  if (m < d.floor) return { error: `${d.label}: at least ${d.floor} months (the minimum).` };
  if (m === current) return { error: "That is already the period." };
  return { months: m, shorter: m < current };
}
