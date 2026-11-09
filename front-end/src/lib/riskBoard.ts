/* Board approval evidence for risk acceptance above the Board threshold (contract: docs/security/SOD_MATRIX.md section 3, owner decision 2026-11).
 * Pure functions (no store access) so the boundary and the evidence rules can be tested on their own. UI validation is NOT a control:
 * the API must repeat every check with a trusted clock. File content is never read: only the file NAME is validated and stored. */
import { SOD } from "./sod";
import { clampText, isIsoDate, safeFileName, validateUpload } from "./security";

export const BOARD_BODIES = ["Board of Directors", "Board Risk Committee"] as const;
export const BOARD_REF_RE = /^BRD-\d{4}-\d{2}$/;
export const BOARD_MAX_AGE_DAYS = 90;
export const BOARD_REASON_MIN = 20;
export const MINUTES_EXTS = ["pdf", "docx", "png", "jpg"];
export const MINUTES_RULE = { maxBytes: 10 * 1024 * 1024, exts: MINUTES_EXTS };

/** Residual score strictly above the threshold (15) needs Board evidence; 15 itself does not. */
export const riskNeedsBoard = (residualScore: number): boolean => residualScore > SOD.RISK_BOARD_THRESHOLD;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export const isoShift = (days: number, now: Date = new Date()) => isoDay(new Date(now.getTime() + days * 864e5));

export interface BoardEvidenceInput { ref: string; date: string; body: string; minutes: string; file?: { name: string; size: number } | null }
export interface BoardEvidence { ref: string; date: string; body: string; minutes: string }
/* flat shape (tsconfig is not strict, so discriminated unions do not narrow): check `ok`, then read `value` or `msg` */
export interface BoardCheck { ok: boolean; msg?: string; value?: BoardEvidence }

/** Validate the Board evidence fields. `minutes` is a reference (e.g. "Minutes 2026-10-14 item 5") or a file name; an attached file is gated by validateUpload. */
export function validateBoardEvidence(e: Partial<BoardEvidenceInput> | undefined, now: Date = new Date()): BoardCheck {
  if (!e) return { ok: false, msg: "Board approval evidence is required above " + SOD.RISK_BOARD_THRESHOLD + "." };
  const ref = clampText(e.ref, 20).toUpperCase();
  if (!BOARD_REF_RE.test(ref)) return { ok: false, msg: "Enter the Board decision reference as BRD-YYYY-NN (for example BRD-2026-04)." };
  const date = clampText(e.date, 10);
  if (!isIsoDate(date)) return { ok: false, msg: "Enter a valid Board decision date." };
  if (date > isoShift(0, now)) return { ok: false, msg: "The Board decision date cannot be in the future." };
  if (date < isoShift(-BOARD_MAX_AGE_DAYS, now)) return { ok: false, msg: "The Board decision is older than " + BOARD_MAX_AGE_DAYS + " days. Obtain a current decision." };
  const body = String(e.body ?? "");
  if (!(BOARD_BODIES as readonly string[]).includes(body)) return { ok: false, msg: "Choose the approving body." };
  let minutes = "";
  if (e.file) {
    const bad = validateUpload(e.file, MINUTES_RULE);
    if (bad) return { ok: false, msg: "Minutes attachment: " + bad };
    minutes = safeFileName(e.file.name, "minutes");
  } else {
    const t = clampText(e.minutes, 120);
    if (t.length < 3) return { ok: false, msg: "Enter the minutes reference or attach the minutes file." };
    if (/\.[A-Za-z0-9]{1,5}$/.test(t)) { // looks like a file name: same allow-list
      const bad = validateUpload({ name: t, size: 1 }, MINUTES_RULE);
      if (bad) return { ok: false, msg: "Minutes reference: " + bad };
    }
    minutes = safeFileName(t, "minutes");
  }
  return { ok: true, value: { ref, date, body, minutes } };
}

/** Acceptance expiry: a real date, after today and at most 12 months (365 days) ahead. */
export function validateAcceptExpiry(until: string, now: Date = new Date()): string | null {
  if (!isIsoDate(until)) return "Enter a valid date.";
  if (until <= isoShift(0, now)) return "The acceptance expiry must be in the future.";
  const max = isoShift(365, now);
  if (until > max) return "Acceptance cannot exceed 12 months (" + max + ").";
  return null;
}
