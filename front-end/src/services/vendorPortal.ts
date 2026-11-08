/* Vendor assessment portal service (external, unauthenticated-facing). Every function is a viaApi stub.
 * The attempt counters (3 email / 5 code) below are CLIENT-SIDE DEMO STATE ONLY. A real server must count per invite token AND per IP/device,
 * persist the count, void the token server-side, and answer unknown/expired/voided/mismatched with the same wording and timing.
 * The entered email and code are sent only in the request body, are never logged, stored, or put in a URL, and no wsLog (workspace audit) is used here:
 * reference ids and event names only. The real API takes the invite token from the path/cookie set at link open, never from a query string. */
import invite from "@/data/vendorInviteSeed.json";
import { isEmail } from "@/lib/security";
import { mailType, maskEmail, newRef, type Answers, type VendorQuestion } from "@/lib/vendorSubmission";
import { apiFetch, viaApi } from "./http";

export type EmailStatus = "ok" | "invalid" | "personal" | "temporary" | "unverified" | "dead";
export interface VerifyEmailResult { status: EmailStatus; masked?: string }
export type CodeStatus = "ok" | "wrong" | "dead";
export interface DraftItems { answers: Answers; comments: Record<string, string>; fileNames: Record<string, string> }
export interface SubmitResult { ok: boolean; ref?: string; ver?: number }

const post = <T,>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });

/* ---- demo-only state ---- */
const demo = { emailFails: 0, codeFails: 0 };
const EVENTS: { event: string; at: number }[] = []; // reference/event names only, never PII
export const resetVendorDemo = () => { demo.emailFails = 0; demo.codeFails = 0; EVENTS.length = 0; };

export function verifyEmail(email: string): Promise<VerifyEmailResult> {
  return viaApi<VerifyEmailResult>(() => {
    const em = String(email).trim().toLowerCase();
    if (!isEmail(em)) return { status: "invalid" };
    const t = mailType(em);
    if (t !== "work") return { status: t === "personal" ? "personal" : "temporary" };
    if (em !== invite.invitedEmail) {
      demo.emailFails += 1;
      return demo.emailFails >= 3 ? { status: "dead" } : { status: "unverified" };
    }
    return { status: "ok", masked: maskEmail(em) };
  }, () => post<VerifyEmailResult>("/vendor-portal/verify-email", { email }));
}

export function verifyCode(code: string): Promise<{ status: CodeStatus }> {
  return viaApi<{ status: CodeStatus }>(() => {
    if (code === "000000") { // demo: the only wrong code
      demo.codeFails += 1;
      return { status: demo.codeFails >= 5 ? "dead" : "wrong" };
    }
    return { status: "ok" };
  }, () => post<{ status: CodeStatus }>("/vendor-portal/verify-code", { code }));
}

export function enrolSecondFactor(method: "passkey" | "totp"): Promise<{ ok: boolean }> {
  return viaApi(() => ({ ok: true }), () => post<{ ok: boolean }>("/vendor-portal/second-factor", { method }));
}

export function saveDraft(d: DraftItems): Promise<{ ok: boolean }> {
  return viaApi(() => ({ ok: true }), () => post<{ ok: boolean }>("/vendor-portal/draft", d));
}

export function submit(d: DraftItems): Promise<SubmitResult> {
  return viaApi<SubmitResult>(() => ({ ok: true, ref: newRef(), ver: 1 }), () => post<SubmitResult>("/vendor-portal/submit", d));
}

export function submitClarification(d: DraftItems & { ref: string; ver: number }): Promise<SubmitResult> {
  return viaApi<SubmitResult>(() => ({ ok: true, ref: d.ref, ver: d.ver + 1 }), () => post<SubmitResult>("/vendor-portal/clarification", d));
}

export function recordView(step: string): Promise<void> {
  return viaApi<void>(() => { EVENTS.push({ event: "view:" + step, at: Date.now() }); }, async () => { await post<void>("/vendor-portal/view", { step }); });
}

/** Questions the reviewer reopened (demo: from seed). A real API returns this per submission version. */
export const reopenedIds = (qs: VendorQuestion[], map: Record<string, string>) => qs.filter((q) => map[q.id]).map((q) => q.id);
