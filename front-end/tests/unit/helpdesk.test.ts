import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { COOKIE, handle, type Req, type Res } from "@/server/core";
import { MemoryAuth, MemoryStore } from "@/server/memory";
import { MemoryDirectory } from "@/server/directory";
import { MemoryPlatform } from "@/server/platform";
import { MemorySupport } from "@/server/support";
import { MemoryWsStore } from "@/server/ws/store";
import { MemoryFileStore } from "@/server/ws/files";
import { MemoryHelpDesk, type HelpQ } from "@/server/helpdesk";
import type { MailMessage, Mailer } from "@/server/mail";
import type { Deps } from "@/server/types";
import { totpAt } from "@/lib/totp";

/* Reference review R4: "Ask a question" in the Help centre and the Admin Console's support inbox, through `handle` as /api runs it, against
   the in-memory stand-ins (the database enforces the same in 0011; tests/db covers it). Synthetic people and data only. */
const ORIGIN = "https://app.example.test";
let clock = 1_800_000_000_000; let d: Deps; let auth: MemoryAuth; let store: MemoryStore; let dir: MemoryDirectory; let help: MemoryHelpDesk; let ACME = ""; let OTHER = "";
const used = new Map<string, number>(); const sent: MailMessage[] = [];
const MAIL: Mailer = { provider: "resend", from: "Selvara <no-reply@mail.example.test>", send: async (m) => { sent.push(m); } };
beforeEach(() => {
  clock = 1_800_000_000_000; used.clear(); sent.length = 0; auth = new MemoryAuth(() => clock); store = new MemoryStore(() => clock); dir = new MemoryDirectory(store);
  const plat = new MemoryPlatform(store, dir); help = new MemoryHelpDesk(store);
  ACME = dir.addCompany("acme-eu", "Acme Test Co"); OTHER = dir.addCompany("other-co", "Other Test Co");
  d = { auth, store, dir, plat, sup: new MemorySupport(store, dir, plat), help, ws: new MemoryWsStore(store), files: new MemoryFileStore(), site: { origin: ORIGIN, rpId: "app.example.test" }, secret: "x".repeat(40), now: () => clock, mail: MAIL };
  process.env.SUPPORT_INBOX_EMAIL = "support-inbox@platform.example.test";
});
afterEach(() => { delete process.env.SUPPORT_INBOX_EMAIL; });
const PW = "Lantern-orbit-Quince-71";
const call = (method: string, path: string, body: Record<string, unknown> = {}, cookie?: string): Promise<Res> => handle(d, { method, path: path.split("/").filter(Boolean), body, ip: "198.51.100.7",
  cookies: cookie ? { [COOKIE]: cookie } : {}, headers: { origin: ORIGIN, "content-type": "application/json", "user-agent": "Mozilla/5.0 Chrome/140" } } as Req);
async function code(email: string) {
  const secret = auth.secretOf(email)!; const step = Math.floor(clock / 30_000);
  if ((used.get(email) ?? -1) >= step) clock = (step + 1) * 30_000 + 1_000;
  used.set(email, Math.floor(clock / 30_000)); return totpAt(secret, clock);
}
async function account(email: string, role: string, person: string, company = ACME) {
  const id = await auth.createUser(email, PW, person); await auth.confirmUser(id);
  await store.insertProfile({ id, email, person, status: "Active", requestedAt: clock });
  if (role === "support") dir.staff.set(id, "support"); else dir.addMember(company, id, role);
  const st = await call("POST", "auth/sign-in", { email, password: PW });
  const v = await call("POST", "auth/sign-in/verify", { ticket: (st.body as { ticket: string }).ticket, code: await code(email) });
  return { id, cookie: v.cookies![0].match(new RegExp(`${COOKIE}=([^;]*)`))![1] };
}
const body = <T,>(r: Res) => r.body as T;
const log = (action: string) => store.auditLog.filter((x) => x.action === action);
type One = { question: HelpQ }; type Many = { questions: HelpQ[] };

describe("Help centre questions (server)", () => {
  it("lets a member ask, sees only their own questions, and support answers in the inbox; the asker is told in the app and by email", async () => {
    const priya = await account("priya@acme.example", "employee", "Priya Nair");
    const noah = await account("noah@acme.example", "analyst", "Noah Kim");
    const ivy = await account("ivy@other.example", "admin", "Ivy Lane", OTHER);
    const sam = await account("sam@platform.example", "support", "Sam Hayes");
    const ask = (b: Record<string, unknown>, c = priya.cookie) => call("POST", "help/questions", b, c);
    expect(body<{ error: string }>(await ask({ subject: "Hi", body: "x", topic: "risk" })).error).toMatch(/subject of 5 to 160/);
    expect(body<{ error: string }>(await ask({ subject: "How do I map controls?", body: "", topic: "risk" })).error).toMatch(/Write your question/);
    expect(body<{ error: string }>(await ask({ subject: "How do I map controls?", body: "x", topic: "nope" })).error).toMatch(/Choose a topic/);
    const q = body<One>(await ask({ subject: "How do I map a control to two frameworks?", body: "We use ISO 27001 and SOC 2.\nCan one control cover both?", topic: "controls-evidence" })).question;
    expect(q).toMatchObject({ status: "Open", subject: "How do I map a control to two frameworks?", asker: "Priya Nair", company: "Acme Test Co" });
    expect(q.ref).toMatch(/^HQ-[0-9A-F]{6}$/); expect((q as unknown as Record<string, unknown>).tenantId).toBeUndefined();
    expect(log("help.question.asked").at(-1)).toMatchObject({ tenantId: ACME, target: `${q.ref}: How do I map a control to two frameworks?` });
    // the support inbox is told by email without the question's text
    const note = sent.find((m) => m.to === "support-inbox@platform.example.test")!;
    expect(note.subject).toBe(`New support question ${q.ref} from Acme Test Co`); expect(note.text).not.toContain("SOC 2.");
    // only the asker sees it: not a colleague, not another company; staff cannot ask, members cannot read the inbox
    expect(body<Many>(await call("GET", "help/questions", {}, noah.cookie)).questions).toEqual([]);
    expect(body<Many>(await call("GET", "help/questions", {}, ivy.cookie)).questions).toEqual([]);
    expect((await call("GET", "admin/help", {}, priya.cookie)).status).toBe(403);
    expect((await call("POST", "help/questions", { subject: "Staff question here", body: "x", topic: "other" }, sam.cookie)).status).toBe(403);
    expect((await call("POST", `help/questions/${q.id}/follow-up`, { text: "Me too" }, noah.cookie)).status).toBe(409);
    // support answers: Answered, the asker gets a notice and an email that links back without the answer
    const inbox = body<Many & { mail: boolean }>(await call("GET", "admin/help", {}, sam.cookie));
    expect(inbox.mail).toBe(true); expect(inbox.questions.map((x) => x.id)).toEqual([q.id]); expect(inbox.questions[0].tenantId).toBe(ACME);
    clock += 60_000;
    const a = body<One>(await call("POST", `admin/help/${q.id}/answer`, { text: "Yes: map it once, it counts in both frameworks." }, sam.cookie)).question;
    expect(a.status).toBe("Answered"); expect(a.messages.map((m) => [m.by, m.staff])).toEqual([["Priya Nair", false], ["Sam Hayes", true]]);
    expect(log("platform.help.answered").at(-1)).toMatchObject({ tenantId: null, target: q.ref });
    expect((await store.noticesOf(priya.id, 10))[0].text).toContain(`answered your question ${q.ref}`);
    const mail = sent.find((m) => m.to === "priya@acme.example")!;
    expect(mail.subject).toBe(`Selvara support answered your question ${q.ref}`); expect(mail.text).toContain(`/help/questions?q=${q.id}`); expect(mail.text).not.toContain("map it once");
    // a follow-up opens it again; the asker closes it; then nothing more can be added, and staff can reopen
    expect(body<One>(await call("POST", `help/questions/${q.id}/follow-up`, { text: "Thanks, and for NIS2?" }, priya.cookie)).question.status).toBe("Open");
    expect(body<One>(await call("POST", `help/questions/${q.id}/close`, {}, priya.cookie)).question.status).toBe("Closed");
    expect((await call("POST", `help/questions/${q.id}/follow-up`, { text: "One more" }, priya.cookie)).status).toBe(409);
    expect((await call("POST", `admin/help/${q.id}/close`, {}, sam.cookie)).status).toBe(409);
    expect(body<One>(await call("POST", `admin/help/${q.id}/reopen`, {}, sam.cookie)).question.status).toBe("Open");
    expect(log("platform.help.reopened").length).toBe(1);
    expect((await call("POST", "admin/help/not-a-uuid/answer", { text: "x" }, sam.cookie)).status).toBe(404);
  });
  it("limits open questions per person, refuses cross-site requests, and is off when not set up", async () => {
    const priya = await account("priya@acme.example", "employee", "Priya Nair");
    for (let i = 0; i < 10; i++) expect((await call("POST", "help/questions", { subject: `Question number ${i}`, body: "x", topic: "other" }, priya.cookie)).status).toBe(200);
    expect(body<{ error: string }>(await call("POST", "help/questions", { subject: "Question eleven", body: "x", topic: "other" }, priya.cookie)).error).toMatch(/10 open questions/);
    const cross = await handle(d, { method: "POST", path: ["help", "questions"], body: { subject: "Cross site one", body: "x", topic: "other" }, ip: "198.51.100.7", cookies: { [COOKIE]: priya.cookie }, headers: { origin: "https://evil.example.test", "content-type": "application/json" } } as Req);
    expect(cross.status).toBe(403);
    delete d.help;
    expect((await call("GET", "help/questions", {}, priya.cookie)).status).toBe(503);
  });
});
