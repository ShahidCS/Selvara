import { beforeEach, describe, expect, it } from "vitest";
import { COOKIE, handle, type Req, type Res } from "@/server/core";
import { MemoryAuth, MemoryStore } from "@/server/memory";
import { MemoryDirectory } from "@/server/directory";
import { MemoryPlatform } from "@/server/platform";
import { MemorySupport } from "@/server/support";
import { MemoryWsStore } from "@/server/ws/store";
import { MemoryFileStore } from "@/server/ws/files";
import type { Mailer, MailMessage } from "@/server/mail";
import type { Deps } from "@/server/types";
import { totpAt } from "@/lib/totp";
import { domainAllowed, parseJoinDomains } from "@/lib/emailDomains";
import { DISPOSABLE_SOURCE, isDisposable } from "@/server/disposable";

/* EDGE-20 (owner's decision, recommendations 1 and 2): a company may accept requests to join only from its own email domains, and throwaway
   addresses are refused. Synthetic people and example domains only; the stand-in mailer keeps what would be sent. */
describe("EDGE-20: the domain rules", () => {
  it("parses an admin's list: lower case, de-duplicated, sorted; empty means any domain", () => {
    expect(parseJoinDomains("Acme.example\n@corp.acme.example, acme.example")).toEqual({ domains: ["acme.example", "corp.acme.example"] });
    expect(parseJoinDomains("")).toEqual({ domains: [] });
    expect(parseJoinDomains(["acme.example", 7])).toEqual({ domains: ["acme.example"] });
  });
  it("refuses what is not a domain, too many, and public email providers", () => {
    expect(parseJoinDomains("acme")).toMatchObject({ error: expect.stringMatching(/not an email domain/) });
    expect(parseJoinDomains("*.acme.example")).toMatchObject({ error: expect.stringMatching(/not an email domain/) });
    expect(parseJoinDomains("gmail.com")).toMatchObject({ error: expect.stringMatching(/public email provider/) });
    expect(parseJoinDomains(Array.from({ length: 21 }, (_, i) => `d${i}.example`).join(","))).toMatchObject({ error: "List at most 20 domains." });
  });
  it("allows the listed domains and their subdomains, never a lookalike", () => {
    const list = ["acme.example"];
    expect(domainAllowed("john.doe@acme.example", list)).toBe(true);
    expect(domainAllowed("John.Doe@Mail.ACME.example", list)).toBe(true);
    expect(domainAllowed("john@evilacme.example", list)).toBe(false);
    expect(domainAllowed("john@acme.example.attacker.test", list)).toBe(false);
    expect(domainAllowed("anyone@other.example", [])).toBe(true);
  });
  it("knows disposable domains (and their subdomains) from the pinned CC0 list, not ordinary ones", () => {
    expect(DISPOSABLE_SOURCE.count).toBeGreaterThan(5_000); expect(DISPOSABLE_SOURCE.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(isDisposable("john@mailinator.com")).toBe(true);
    expect(isDisposable("john@x.mailinator.com")).toBe(true);
    for (const ok of ["john@acme.example", "john@gmail.com", "john@outlook.com", "john@proton.me"]) expect(isDisposable(ok)).toBe(false);
  });
});

const ORIGIN = "https://app.example.test"; const PW = "Lantern-orbit-Quince-71";
let clock = 1_800_000_000_000; let d: Deps; let auth: MemoryAuth; let store: MemoryStore; let dir: MemoryDirectory; let ACME = "";
const sent: MailMessage[] = []; const MAIL: Mailer = { provider: "resend", from: "Selvara <no-reply@mail.example.test>", send: async (m) => { sent.push(m); } };
beforeEach(() => {
  clock = 1_800_000_000_000; sent.length = 0; auth = new MemoryAuth(() => clock); store = new MemoryStore(() => clock); dir = new MemoryDirectory(store);
  const plat = new MemoryPlatform(store, dir); ACME = dir.addCompany("acme-eu", "Acme Test Co");
  d = { auth, store, dir, plat, sup: new MemorySupport(store, dir, plat), ws: new MemoryWsStore(store), files: new MemoryFileStore(), site: { origin: ORIGIN, rpId: "app.example.test" }, secret: "x".repeat(40), now: () => clock, mail: MAIL };
});
const call = (method: string, path: string, body: Record<string, unknown> = {}, cookie?: string, ip = "198.51.100.7"): Promise<Res> =>
  handle(d, { method, path: path.split("/"), body, ip, cookies: cookie ? { [COOKIE]: cookie } : {}, headers: { origin: ORIGIN, "content-type": "application/json", "user-agent": "Mozilla/5.0 Chrome/140" } } as Req);
async function member(email: string, role: string, person: string) {
  const id = await auth.createUser(email, PW, person); await auth.confirmUser(id);
  await store.insertProfile({ id, email, person, status: "Active", requestedAt: clock }); dir.addMember(ACME, id, role);
  const st = await call("POST", "auth/sign-in", { email, password: PW });
  const v = await call("POST", "auth/sign-in/verify", { ticket: (st.body as { ticket: string }).ticket, code: await totpAt(auth.secretOf(email)!, clock) });
  return v.cookies![0].match(new RegExp(`${COOKIE}=([^;]*)`))![1];
}
const pending = () => dir.memberships.filter((m) => m.tenantId === ACME && m.status === "Pending").length;
const join = (email: string, ip = "203.0.113.20") => call("POST", "auth/join-requests", { name: "John Doe", email, password: PW, company: "acme-eu" }, undefined, ip);

describe("EDGE-20: requests to join through the routes", () => {
  it("an admin lists the company's domains (audited); others may not; bad lists are refused", async () => {
    const jordan = await member("jordan@acme.example", "admin", "Jordan Avery");
    const priya = await member("priya@acme.example", "employee", "Priya Nair");
    expect((await call("GET", "team/settings", {}, jordan)).body).toMatchObject({ joinDomains: [] });
    expect((await call("POST", "team/settings", { joinDomains: ["acme.example"] }, priya)).status).toBe(403);
    expect((await call("POST", "team/settings", { joinDomains: "gmail.com" }, jordan)).status).toBe(400);
    expect((await call("POST", "team/settings", { joinDomains: "Acme.example\nmail.acme.example" }, jordan)).status).toBe(204);
    expect((await call("GET", "team/settings", {}, jordan)).body).toMatchObject({ joinDomains: ["acme.example", "mail.acme.example"] });
    expect((await call("POST", "team/settings", { joinDomains: ["mail.acme.example", "acme.example"] }, jordan)).status).toBe(204); // unchanged: no entry
    expect(store.auditLog.filter((x) => x.action === "team.join_domains.changed").map((x) => x.target)).toEqual(["any domain → acme.example, mail.acme.example"]);
  });
  it("another domain gets the same answer, no request reaches the admins, and the person is told by email", async () => {
    const jordan = await member("jordan@acme.example", "admin", "Jordan Avery");
    await call("POST", "team/settings", { joinDomains: ["acme.example"] }, jordan);
    const outside = await join("john.doe@other.example");
    const wrongCode = await call("POST", "auth/join-requests", { name: "John Doe", email: "john.doe@other.example", password: PW, company: "no-such-co" }, undefined, "203.0.113.21");
    expect(outside.status).toBe(202); expect(wrongCode.status).toBe(202); expect(outside.body).toEqual(wrongCode.body); // the code cannot be probed
    expect(pending()).toBe(0);
    expect(sent.map((m) => [m.to, m.subject])).toEqual([["john.doe@other.example", "Your request to join Acme Test Co"]]);
    expect(sent[0].text).toMatch(/only from its own email addresses/);
    expect((await join("jane.doe@mail.acme.example")).status).toBe(202); expect(pending()).toBe(1); // a subdomain is the company's own
  });
  it("with no list, any domain may ask as before; a throwaway address is always refused, openly", async () => {
    expect((await join("john.doe@other.example")).status).toBe(202); expect(pending()).toBe(1);
    const tmp = await join("john.doe@mailinator.com", "203.0.113.22");
    expect(tmp.status).toBe(400); expect((tmp.body as { error: string }).error).toMatch(/disposable/);
    expect(pending()).toBe(1); expect(await store.profileByEmail("john.doe@mailinator.com")).toBeNull();
  });
});
