/* Vendor submission model + pure rules for the external vendor assessment portal (board: vendor-assessment-portal).
 * No workspace RBAC, no audit-log import: this surface is used by unauthenticated external people. Everything here is a UI convenience;
 * the real server must re-evaluate every rule (see docs/checklist/vendorportal.md, Security notes). */
import questions from "@/data/vendorQuestions.json";
import invite from "@/data/vendorInviteSeed.json";
import { randInt, safeFileName, type UploadRule } from "@/lib/security";

export type Answer = "Y" | "P" | "N" | "NA";
export const ANSWERS: { value: Answer; label: string }[] = [
  { value: "Y", label: "Yes" }, { value: "P", label: "Partially" }, { value: "N", label: "No" }, { value: "NA", label: "Not applicable" },
];
export interface VendorQuestion { domain: string; id: string; text: string; critical: boolean; evidence: string }
export type FileStatus = "scanning" | "clean" | "blocked";
/** Only the (sanitised) file name is kept. Content is never read; `hash` is assigned by the server after scanning. */
export interface VendorFile { name: string; status: FileStatus; why?: string; hash?: string }
export type SubmissionStatus = "draft" | "submitted" | "clarification";
export interface SubmissionItem { answer: Answer; comment: string; file?: { name: string; hash?: string } }
export interface VendorSubmission { ref: string; ver: number; items: Record<string, SubmissionItem>; status: SubmissionStatus }

export const QUESTIONS = questions.questions as VendorQuestion[];
export const CLARIFICATIONS = questions.clarifications as Record<string, string>;
export const INVITE = { customerName: invite.customerName, vendorSubject: invite.vendorSubject, expiresAt: invite.expiresAt, dueAt: invite.dueAt, clarifyBy: invite.clarifyBy };

export const MAX_COMMENT = 2000;
export const IDLE_MS = 15 * 60 * 1000;
export const SCAN_MS = 1200;
export const VENDOR_UPLOAD_RULE: UploadRule = { maxBytes: 25 * 1024 * 1024, exts: ["pdf", "docx", "xlsx", "png", "jpg"] };
export const PREFILL_UPLOAD_RULE: UploadRule = { maxBytes: 5 * 1024 * 1024, exts: ["xlsx", "csv"] };

/** Board copy (verbatim). Unknown invite, wrong address and expired link all share MSG.unverified (no account enumeration). */
export const MSG = {
  emailInvalid: "Enter a valid email address.",
  emailPersonal: "Personal email addresses cannot be used. Use your company email.",
  emailTemporary: "Temporary email addresses cannot be used.",
  unverified: "We couldn’t verify this request. Check the address, or ask your contact to resend it.",
  codeFormat: "Enter the 6-digit code.",
  codeWrong: "That code did not work.",
  generic: "Something went wrong. Please try again.",
};

export const CONTROLS = [
  "Single-use link with a random token; expires in 14 days and after submission",
  "Email must match the invited contact; mismatches get the same message as an invalid link",
  "Personal and temporary email domains rejected",
  "Email code plus passkey or authenticator app before any data is shown",
  "5 wrong codes void the link; requests rate-limited per IP",
  "Vendor sees only their own questionnaire; access checked on the server for every request",
  "Uploads: allow-listed types, 25 MB limit, content-type check, malware scan, stored encrypted outside the web root",
  "Comments are plain text, length-limited and encoded on display",
  "Session cookie HttpOnly, Secure, SameSite=Strict; 15-minute idle timeout",
  "Every view, answer, upload and submission written to the audit log",
  "Portal included in the annual penetration test scope",
];

/** "g•••@domain" (board mask()). */
export function maskEmail(e: string): string {
  const p = String(e).split("@");
  if (p.length < 2) return "•••";
  return p[0].slice(0, 1) + "•••@" + p.slice(1).join("@");
}

const FREE = ["gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "hotmail.com", "outlook.com", "live.com", "msn.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "zoho.com", "gmx.com", "mail.com", "yandex.com", "mail.ru", "qq.com", "163.com", "rediffmail.com"];
const DISP = ["mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "temp-mail.org", "yopmail.com", "trashmail.com", "maildrop.cc"];
export type MailType = "work" | "personal" | "disposable";
export function mailType(email: string): MailType {
  const d = String(email).trim().toLowerCase().split("@")[1] || "";
  if (DISP.includes(d)) return "disposable";
  if (FREE.includes(d) || /^(gmail|yahoo|hotmail|outlook|live|icloud|aol|proton)\.(com|net|co\.[a-z]{2}|[a-z]{2})$/.test(d)) return "personal";
  return "work";
}

/** Demo reference id (VQ-2026-NNNNNN). The real server issues it; never derive anything security-relevant from it. */
export const newRef = () => "VQ-2026-" + String(100000 + randInt(900000));

export type Answers = Record<string, Answer>;
export type Files = Record<string, VendorFile>;

export interface Readiness { answered: number; total: number; missingEv: number; unverified: number; ready: boolean; note: string }
export function readiness(ans: Answers, files: Files, pre: Record<string, boolean>, qs: VendorQuestion[] = QUESTIONS): Readiness {
  const answered = qs.filter((q) => ans[q.id]).length;
  const missingEv = qs.filter((q) => q.critical && ans[q.id] === "Y" && files[q.id]?.status !== "clean").length;
  const unverified = Object.keys(pre).length;
  const total = qs.length;
  const ready = answered === total && missingEv === 0 && unverified === 0;
  const note = ready ? "Ready to submit. Answers become read-only after submission."
    : answered < total ? `${total - answered} questions still need an answer.`
    : missingEv ? `${missingEv} "Yes" answers on required items still need evidence attached.`
    : `${unverified} prefilled answers still need checking (change or re-select each one).`;
  return { answered, total, missingEv, unverified, ready, note };
}

export interface ClarBase { notes: Record<string, string>; files: Record<string, string> }
/** Clarification rule (board): new text, different from the previous one; any "Yes" needs a clean file with a different name. */
export function clarReadiness(ids: string[], ans: Answers, notes: Record<string, string>, files: Files, base: ClarBase, ver: number) {
  const missing = ids.filter((id) => {
    const f = files[id];
    return !(notes[id] || "").trim() || notes[id] === (base.notes[id] || "")
      || (ans[id] === "Y" && !(f && f.status === "clean" && f.name !== (base.files[id] || "")));
  }).length;
  const ready = missing === 0;
  return { missing, ready, note: ready ? `Ready to send. This creates version ${ver + 1}; version ${ver} is kept.` : `${missing} answer(s) still need a new clarification and, for "Yes", new evidence.` };
}

/** Why validateUpload refused a file, in the board's wording. */
export function blockReason(file: { name: string; size: number }, rule: UploadRule): string {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!rule.exts.includes(ext)) return "file type not allowed";
  if (file.size > rule.maxBytes) return `larger than ${Math.round(rule.maxBytes / 1024 / 1024)} MB`;
  return "file is empty";
}
export const displayName = (n: string) => safeFileName(n, "file");
