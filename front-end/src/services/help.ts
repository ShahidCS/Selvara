/* Help centre questions (reference review R4). Production (API mode): the server keeps every question (migration 0011) and decides who may
   read and write (server/helpdesk.ts): a company member asks and reads only their own questions; Selvara support (platform staff) answers in
   the Admin Console. The demonstration keeps questions in this browser tab only, with the same rules checked here. */
import { appStore, createStore } from "@/lib/store";
import { getMe, wsLog } from "@/lib/audit";
import { API_ON, roleOf } from "@/lib/rbac";
import { apiFetch } from "./http";

export type QStatus = "Open" | "Answered" | "Closed";
export interface HelpMsg { at: number; by: string; staff: boolean; text: string }
export interface HelpQ { id: string; ref: string; company?: string; asker: string; topic: string; subject: string; status: QStatus; createdAt: number; updatedAt: number; messages: HelpMsg[] }
export const HELP_TOPICS: [string, string][] = [["getting-started", "Getting started"], ["controls-evidence", "Controls and evidence"], ["risk", "Risk"], ["vendors", "Third parties"],
  ["audits", "Audits"], ["ai", "AI features"], ["account-security", "Account and sign-in"], ["billing", "Billing"], ["other", "Something else"]];
export const topicName = (k: string) => HELP_TOPICS.find((t) => t[0] === k)?.[1] ?? k;
export const SUBJECT_MIN = 5, SUBJECT_MAX = 160, BODY_MAX = 4000, OPEN_MAX = 10;

/** Demonstration only: this tab's questions. */
export const demoHelp = createStore<{ list: (HelpQ & { askerRole: string })[] }>({ list: [] });
const post = <T,>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
const fail = (m: string) => { throw new Error(m); };
const now = () => Date.now();
const isStaff = () => roleOf(appStore.get().role).spaces.includes("admin");
const refOf = (id: string) => `HQ-${id.replace(/[^0-9a-z]/gi, "").slice(-6).toUpperCase().padStart(6, "0")}`;
const set = (f: (l: (HelpQ & { askerRole: string })[]) => void) => { const l = demoHelp.get().list.map((x) => ({ ...x, messages: [...x.messages] })); f(l); demoHelp.set({ list: l }); return l; };
const strip = ({ askerRole: _r, ...q }: HelpQ & { askerRole: string }): HelpQ => (void _r, q);

/** The person's own questions. */
export async function myQuestions(): Promise<HelpQ[]> {
  if (API_ON) return (await apiFetch<{ questions: HelpQ[] }>("/help/questions")).questions;
  const role = appStore.get().role;
  return demoHelp.get().list.filter((q) => q.askerRole === role).map(strip);
}
/** Checked here for a quick message; the server checks the same again. */
export function askBlock(subject: string, body: string, topic: string, open: number): string | null {
  const s = subject.trim(); const b = body.trim();
  if (s.length < SUBJECT_MIN || s.length > SUBJECT_MAX) return `Write a subject of ${SUBJECT_MIN} to ${SUBJECT_MAX} characters.`;
  if (!b) return "Write your question.";
  if (b.length > BODY_MAX) return `Keep the question under ${BODY_MAX} characters.`;
  if (!HELP_TOPICS.some((t) => t[0] === topic)) return "Choose a topic.";
  if (open >= OPEN_MAX) return `You have ${OPEN_MAX} open questions. Close one you no longer need first.`;
  return null;
}
export async function ask(subject: string, body: string, topic: string): Promise<HelpQ> {
  if (API_ON) return (await post<{ question: HelpQ }>("/help/questions", { subject, body, topic })).question;
  if (isStaff()) fail("Questions are asked from a company workspace.");
  const mine = await myQuestions(); const why = askBlock(subject, body, topic, mine.filter((q) => q.status !== "Closed").length); if (why) fail(why);
  const id = `demo-${now().toString(36)}`; const me = getMe(); const at = now();
  const q = { id, ref: refOf(id), company: "Demo company", asker: me.name, askerRole: appStore.get().role, topic, subject: subject.trim(), status: "Open" as QStatus, createdAt: at, updatedAt: at, messages: [{ at, by: me.name, staff: false, text: body.trim() }] };
  set((l) => l.unshift(q)); wsLog("help.question.asked", `${q.ref}: ${q.subject}`, "Access");
  return strip(q);
}
export async function followUp(id: string, text: string): Promise<HelpQ> {
  if (API_ON) return (await post<{ question: HelpQ }>(`/help/questions/${encodeURIComponent(id)}/follow-up`, { text })).question;
  const t = text.trim(); if (!t) fail("Write your message."); if (t.length > BODY_MAX) fail(`Keep it under ${BODY_MAX} characters.`);
  let out: HelpQ | null = null; const role = appStore.get().role; const me = getMe();
  set((l) => { const q = l.find((x) => x.id === id && x.askerRole === role && x.status !== "Closed"); if (!q) return; q.status = "Open"; q.updatedAt = now(); q.messages.push({ at: now(), by: me.name, staff: false, text: t }); out = strip(q); });
  if (!out) fail("This question is closed or is not yours. Ask a new one.");
  wsLog("help.question.followed_up", out!.ref, "Access"); return out!;
}
export async function closeMine(id: string): Promise<HelpQ> {
  if (API_ON) return (await post<{ question: HelpQ }>(`/help/questions/${encodeURIComponent(id)}/close`, {})).question;
  let out: HelpQ | null = null; const role = appStore.get().role;
  set((l) => { const q = l.find((x) => x.id === id && x.askerRole === role && x.status !== "Closed"); if (!q) return; q.status = "Closed"; q.updatedAt = now(); out = strip(q); });
  if (!out) fail("This question is already closed or is not yours.");
  wsLog("help.question.closed", out!.ref, "Access"); return out!;
}

/* ---------- Selvara support (platform staff, Admin Console) ---------- */
export async function inbox(): Promise<{ questions: HelpQ[]; mail: boolean }> {
  if (API_ON) return apiFetch<{ questions: HelpQ[]; mail: boolean }>("/admin/help");
  if (!isStaff()) fail("Not permitted.");
  return { questions: [...demoHelp.get().list].sort((a, b) => b.updatedAt - a.updatedAt).map(strip), mail: false };
}
export async function answer(id: string, text: string): Promise<HelpQ> {
  if (API_ON) return (await post<{ question: HelpQ }>(`/admin/help/${encodeURIComponent(id)}/answer`, { text })).question;
  if (!isStaff()) fail("Not permitted.");
  const t = text.trim(); if (!t) fail("Write the answer."); if (t.length > BODY_MAX) fail(`Keep it under ${BODY_MAX} characters.`);
  let out: HelpQ | null = null; const me = getMe();
  set((l) => { const q = l.find((x) => x.id === id); if (!q) return; q.status = "Answered"; q.updatedAt = now(); q.messages.push({ at: now(), by: me.name, staff: true, text: t }); out = strip(q); });
  if (!out) fail("Question not found.");
  wsLog("platform.help.answered", out!.ref, "Access"); return out!;
}
export async function setStatus(id: string, to: "Open" | "Closed"): Promise<HelpQ> {
  if (API_ON) return (await post<{ question: HelpQ }>(`/admin/help/${encodeURIComponent(id)}/${to === "Closed" ? "close" : "reopen"}`, {})).question;
  if (!isStaff()) fail("Not permitted.");
  let out: HelpQ | null = null;
  set((l) => { const q = l.find((x) => x.id === id && x.status !== to); if (!q) return; q.status = to; q.updatedAt = now(); out = strip(q); });
  if (!out) fail(`This question is already ${to.toLowerCase()}.`);
  wsLog(to === "Closed" ? "platform.help.closed" : "platform.help.reopened", out!.ref, "Access"); return out!;
}
