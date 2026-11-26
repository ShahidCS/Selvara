import { beforeEach, describe, expect, it } from "vitest";
import { COOKIE, handle, type Req, type Res } from "@/server/core";
import { MemoryAuth, MemoryStore } from "@/server/memory";
import { MemoryDirectory } from "@/server/directory";
import { MemoryPlatform } from "@/server/platform";
import { MemorySupport } from "@/server/support";
import { MemoryWsStore } from "@/server/ws/store";
import { MemoryFileStore } from "@/server/ws/files";
import type { Deps } from "@/server/types";
import { totpAt } from "@/lib/totp";

/* Production programme, group 2 (Policies, People, Access, delegation) through `handle`, as /api runs it, against the in-memory stand-ins.
   Checked against the inventory in docs/architecture/inventory/group2-policies-people-access.md. Synthetic people only. */
const ORIGIN = "https://app.example.test";
let clock = 1_800_000_000_000; let d: Deps; let auth: MemoryAuth; let store: MemoryStore; let dir: MemoryDirectory; let ws: MemoryWsStore; let files: MemoryFileStore; let ACME = ""; let OTHER = "";
const used = new Map<string, number>();
beforeEach(() => {
  clock = 1_800_000_000_000; used.clear(); auth = new MemoryAuth(() => clock); store = new MemoryStore(() => clock); dir = new MemoryDirectory(store);
  const plat = new MemoryPlatform(store, dir); ws = new MemoryWsStore(store); files = new MemoryFileStore();
  ACME = dir.addCompany("acme-eu", "Acme Test Co"); OTHER = dir.addCompany("other-co", "Other Test Co");
  d = { auth, store, dir, plat, sup: new MemorySupport(store, dir, plat), ws, files, site: { origin: ORIGIN, rpId: "app.example.test" }, secret: "x".repeat(40), now: () => clock };
});
const PW = "Lantern-orbit-Quince-71";
async function call(method: string, path: string, body: Record<string, unknown> = {}, cookie?: string, raw?: Uint8Array): Promise<Res> {
  const r: Req = { method, path: path.split("/").filter(Boolean), body, ip: "198.51.100.7", cookies: cookie ? { [COOKIE]: cookie } : {}, raw,
    headers: { origin: ORIGIN, "content-type": raw ? "application/octet-stream" : "application/json", "user-agent": "Mozilla/5.0 Chrome/140" } };
  return handle(d, r);
}
async function code(email: string) {
  const secret = auth.secretOf(email)!; const step = Math.floor(clock / 30_000);
  if ((used.get(email) ?? -1) >= step) clock = (step + 1) * 30_000 + 1_000;
  used.set(email, Math.floor(clock / 30_000)); return totpAt(secret, clock);
}
async function member(email: string, role: string, person: string, company = ACME) {
  const id = await auth.createUser(email, PW, person); await auth.confirmUser(id);
  await store.insertProfile({ id, email, person, status: "Active", requestedAt: clock }); dir.addMember(company, id, role);
  const st = await call("POST", "auth/sign-in", { email, password: PW });
  const v = await call("POST", "auth/sign-in/verify", { ticket: (st.body as { ticket: string }).ticket, code: await code(email) });
  return { id, cookie: v.cookies![0].match(new RegExp(`${COOKIE}=([^;]*)`))![1] };
}
const log = (action: string) => store.auditLog.filter((x) => x.action === action);
const body = <T,>(r: Res) => r.body as T;


const day = (n: number) => new Date(clock + n * 86400_000).toISOString().slice(0, 10);
async function team() {
  const jordan = await member("jordan@acme.example", "admin", "Jordan Avery");
  const casey = await member("casey@acme.example", "admin", "Casey Morgan");
  const owen = await member("owen@acme.example", "owner", "Owen Hart");
  const priya = await member("priya@acme.example", "employee", "Priya Nair");
  return { jordan, casey, owen, priya };
}

describe("policies", () => {
  it("lifecycle: owner drafts and submits; the named approver (not the owner, author or submitter) approves and publishes; employees acknowledge", async () => {
    const { jordan, casey, owen, priya } = await team();
    expect((await call("POST", "ws/policies", { name: "Acceptable use", body: "Text" }, priya.cookie)).status).toBe(403);
    const id = body<{ id: string }>(await call("POST", "ws/policies", { name: "Acceptable use", body: "Use systems for work.", cycle: 12 }, jordan.cookie)).id;
    expect(id).toBe("P-001");
    expect((await call("PATCH", `ws/policies/${id}`, { name: "Acceptable use", body: "x" }, casey.cookie)).body).toEqual({ error: "Only the policy owner (Jordan Avery) can edit content. An admin can reassign ownership." });
    expect((await call("POST", `ws/policies/${id}/submit`, { approverId: jordan.id }, jordan.cookie)).status).toBe(403); // the owner, author and submitter
    expect((await call("POST", `ws/policies/${id}/submit`, { approverId: priya.id }, jordan.cookie)).status).toBe(400); // not admin or owner
    expect((await call("POST", `ws/policies/${id}/submit`, { approverId: owen.id }, jordan.cookie)).status).toBe(200);
    expect(store.notices.some((n) => n.userId === owen.id && /approve policy P-001/.test(n.text))).toBe(true);
    expect((await call("POST", `ws/policies/${id}/approve`, { reason: "Reviewed against ISO A.5.10" }, casey.cookie)).body).toEqual({ error: "Only the named approver (Owen Hart) can do this." });
    expect((await call("POST", `ws/policies/${id}/approve`, { reason: "Reviewed against ISO A.5.10", effective: day(-1) }, owen.cookie)).status).toBe(400);
    expect(body<{ ver: string }>(await call("POST", `ws/policies/${id}/approve`, { reason: "Reviewed against ISO A.5.10" }, owen.cookie)).ver).toBe("1.0");
    expect((await call("PATCH", `ws/policies/${id}`, { name: "x", body: "y" }, jordan.cookie)).body).toEqual({ error: "Content is locked while the version is approved." });
    expect((await call("POST", `ws/policies/${id}/publish`, {}, owen.cookie)).status).toBe(200);
    const pol = () => call("GET", "ws/data/policies", {}, jordan.cookie).then((r) => body<{ policies: { status: string; acceptance: { required: number; done: number } }[] }>(r).policies[0]);
    expect((await pol()).status).toBe("Active"); expect((await pol()).acceptance).toEqual({ required: 4, done: 0 });
    expect((await call("POST", "ws/me/acknowledgements", { policyId: id }, priya.cookie)).status).toBe(200);
    expect((await pol()).acceptance.done).toBe(1);
    expect(body<{ outstanding?: number } | number>(await call("POST", `ws/policies/${id}/remind`, {}, jordan.cookie))).toBe(3);
    expect((await call("POST", `ws/policies/${id}/remind`, {}, jordan.cookie)).status).toBe(400); // once a day
    // a new draft from the published version needs a reason; the published one stays
    expect((await call("PATCH", `ws/policies/${id}`, { name: "Acceptable use", body: "v2", note: "short" }, jordan.cookie)).status).toBe(400);
    expect(body<{ ver: string }>(await call("PATCH", `ws/policies/${id}`, { name: "Acceptable use", body: "v2", note: "Add remote work rules" }, jordan.cookie)).ver).toBe("1.1");
    const me = body<{ tasks: { kind: string }[]; published: { ver: string }[] }>(await call("GET", "ws/data/me", {}, priya.cookie));
    expect(me.published[0].ver).toBe("1.0"); expect(me.tasks).toEqual([]);
  });
  it("emergency change: any admin publishes at once; a different admin or owner, not the publisher or authors, approves retrospectively", async () => {
    const { jordan, casey, owen } = await team();
    const id = body<{ id: string }>(await call("POST", "ws/policies", { name: "Incident response", body: "Steps" }, owen.cookie)).id;
    expect((await call("POST", `ws/policies/${id}/emergency`, { reason: "Active ransomware incident, contain now" }, owen.cookie)).status).toBe(403); // admins only
    expect((await call("POST", `ws/policies/${id}/emergency`, { reason: "too short" }, jordan.cookie)).status).toBe(400);
    const r = body<{ exId: string; dueBy: string }>(await call("POST", `ws/policies/${id}/emergency`, { reason: "Active ransomware incident, contain now" }, jordan.cookie));
    expect(r.exId).toBe("PX-1");
    const decide = (cookie: string, decision = "approve") => call("POST", `ws/policies/${id}/exceptions/PX-1`, { decision, reason: "Checked the incident record" }, cookie);
    expect((await decide(jordan.cookie)).status).toBe(403); // published it
    expect((await decide(owen.cookie)).status).toBe(403); // wrote it
    expect((await decide(casey.cookie)).status).toBe(200);
    expect(log("policy.exception.approved")[0].target).toBe(`${id} v1.0 PX-1 by Casey Morgan`);
  });
  it("delegation: the named approver's delegate may approve; a delegation cannot be chained, looped or self-made", async () => {
    const { jordan, casey, owen } = await team();
    expect((await call("POST", "ws/delegations", { toId: owen.id, days: 15, reason: "Annual leave week" }, casey.cookie)).status).toBe(400);
    expect((await call("POST", "ws/delegations", { toId: casey.id, days: 3, reason: "Annual leave week" }, casey.cookie)).status).toBe(403);
    expect((await call("POST", "ws/delegations", { toId: owen.id, days: 3, reason: "Annual leave week" }, casey.cookie)).status).toBe(200);
    expect((await call("POST", "ws/delegations", { toId: casey.id, days: 3, reason: "Back the other way" }, owen.cookie)).body).toEqual({ error: "That person has delegated to you. End that delegation first." });
    const id = body<{ id: string }>(await call("POST", "ws/policies", { name: "Backup policy", body: "Back up daily" }, jordan.cookie)).id;
    await call("POST", `ws/policies/${id}/submit`, { approverId: casey.id }, jordan.cookie);
    expect((await call("POST", `ws/policies/${id}/approve`, { reason: "Approved while Casey is away" }, owen.cookie)).status).toBe(200);
    expect(log("policy.approved")[0].target).toMatch(/by Owen Hart on behalf of Casey Morgan \(delegation\)/);
  });
});

describe("isolation", () => {
  it("another company sees none of these records and cannot decide its requests", async () => {
    const { jordan, priya, casey } = await team();
    const other = await member("cam@other.example", "admin", "Cam Ortiz", OTHER);
    await call("POST", "ws/policies", { name: "Acceptable use", body: "Text" }, jordan.cookie);
    const a = body<{ id: string }>(await call("POST", `ws/people/${priya.id}/mfa-reset`, { checks: [true, true, true], reason: "Lost authenticator device", reasonText: "Phone lost on a trip", ticket: "SEC-12", approverId: casey.id }, jordan.cookie));
    expect(body<{ policies: unknown[] }>(await call("GET", "ws/data/policies", {}, other.cookie)).policies).toEqual([]);
    expect(body<{ people: { name: string }[] }>(await call("GET", "ws/data/people", {}, other.cookie)).people.map((p) => p.name)).toEqual(["Cam Ortiz"]);
    expect((await call("POST", `ws/approvals/${a.id}/approve`, { reason: "Not my company at all" }, other.cookie)).status).toBe(404);
    expect((await call("POST", `ws/people/${priya.id}/offboard`, { transferToId: other.id }, other.cookie)).status).toBe(404);
  });
});

describe("people", () => {
  it("the workforce is the real members (with real MFA status) plus contractors; device posture is never invented", async () => {
    const { jordan } = await team();
    expect((await call("POST", "ws/people/contractors", { name: "Grace Lin", role: "GRC Lead", dept: "External" }, jordan.cookie)).status).toBe(200);
    const ppl = body<{ people: { name: string; mfa: boolean; device: string; employment: string }[] }>(await call("GET", "ws/data/people", {}, jordan.cookie)).people;
    expect(ppl.map((p) => p.name)).toEqual(expect.arrayContaining(["Jordan Avery", "Priya Nair", "Grace Lin"]));
    expect(ppl.find((p) => p.name === "Priya Nair")!.mfa).toBe(true);
    expect(ppl.find((p) => p.name === "Grace Lin")).toEqual(expect.objectContaining({ mfa: false, employment: "Contractor", device: "Not connected" }));
  });
  it("member MFA reset: admin requests with three checks, a ticket and a named approver; on approval the factor really goes and sessions end", async () => {
    const { jordan, casey, owen, priya } = await team();
    const ask = (cookie: string, x: Record<string, unknown> = {}) => call("POST", `ws/people/${priya.id}/mfa-reset`, { checks: [true, true, true], reason: "Lost authenticator device", reasonText: "Phone lost on a trip", ticket: "sec-12", approverId: casey.id, ...x }, cookie);
    expect((await ask(owen.cookie)).status).toBe(403); // owners cannot request
    expect((await ask(jordan.cookie, { checks: [true, false, true] })).status).toBe(400);
    expect((await call("POST", `ws/people/${jordan.id}/mfa-reset`, { checks: [true, true, true], reason: "Lost authenticator device", reasonText: "Phone lost on a trip", ticket: "SEC-12", approverId: casey.id }, jordan.cookie)).status).toBe(403);
    const a = body<{ id: string; needs: number }>(await ask(jordan.cookie)); expect(a.needs).toBe(1);
    expect((await ask(jordan.cookie)).body).toEqual({ error: "A reset is already pending for this person." });
    expect((await call("POST", `ws/approvals/${a.id}/approve`, { reason: "Identity confirmed by call-back" }, owen.cookie)).body).toEqual({ error: "Only the named approver (Casey Morgan) can decide this request." });
    expect((await call("POST", `ws/approvals/${a.id}/approve`, { reason: "Identity confirmed by call-back" }, casey.cookie)).body).toEqual({ status: "Approved" });
    expect(await auth.mfaEnrolled(priya.id)).toBe(false);
    expect((await call("GET", "auth/session", {}, priya.cookie)).status).toBe(401); // her session here ended
    expect(log("person.mfa.reset")[0].target).toMatch(/Priya Nair; approved by Casey Morgan; ticket SEC-12/);
  });
  it("a privileged person's reset needs two approvers including the named one", async () => {
    const { jordan, casey, owen } = await team();
    expect((await call("POST", `ws/people/${owen.id}/mfa-reset`, { checks: [true, true, true], reason: "New device enrolment", reasonText: "Replaced laptop and phone", ticket: "SEC-13", approverId: casey.id }, jordan.cookie)).body)
      .toEqual({ error: "This reset needs 2 eligible approver(s) (not you, not Owen Hart); only 1 available." });
    const sam = await member("sam.admin@acme.example", "admin", "Sam Lee");
    const a = body<{ id: string; needs: number }>(await call("POST", `ws/people/${owen.id}/mfa-reset`, { checks: [true, true, true], reason: "New device enrolment", reasonText: "Replaced laptop and phone", ticket: "SEC-13", approverId: casey.id }, jordan.cookie));
    expect(a.needs).toBe(2);
    expect((await call("POST", `ws/approvals/${a.id}/approve`, { reason: "Identity confirmed in person" }, sam.cookie)).body).toEqual({ status: "Pending", votes: 1, needs: 2 });
    expect((await call("POST", `ws/approvals/${a.id}/approve`, { reason: "Identity confirmed in person" }, casey.cookie)).body).toEqual({ status: "Approved" });
  });
  it("offboarding ends the membership, sessions, grants, requests and delegations, and moves owned items; privileged people need a second approver; never the last admin", async () => {
    const { jordan, casey, owen, priya } = await team();
    await call("POST", "ws/access/grants", { userId: priya.id, system: "HR System", level: "Read", reason: "Found in the HR system export" }, jordan.cookie);
    await call("POST", "ws/controls", { title: "HR records reviewed", domain: "Governance", ownerId: owen.id }, jordan.cookie);
    expect((await call("POST", `ws/people/${jordan.id}/offboard`, { transferToId: casey.id }, jordan.cookie)).status).toBe(403);
    expect(body<{ pending: boolean; revoked: number }>(await call("POST", `ws/people/${priya.id}/offboard`, { transferToId: jordan.id }, jordan.cookie))).toEqual({ pending: false, revoked: 1 });
    expect(dir.memberships.find((m) => m.userId === priya.id)!.status).toBe("Removed");
    // EDGE-20: a later request to join from the same mailbox is flagged to the admins (12 months)
    const { findMatch } = await import("@/server/aliasMatch");
    expect(await findMatch(d, ACME, (await store.profileById(priya.id))!.email.replace("@", "+back@"))).toMatchObject({ kind: "removed" });
    expect((await call("GET", "auth/session", {}, priya.cookie)).status).toBe(401);
    const off = await call("POST", `ws/people/${owen.id}/offboard`, { transferToId: jordan.id }, casey.cookie); // an owner: privileged
    expect(off.status).toBe(202);
    const id = body<{ id: string }>(off).id;
    expect((await call("POST", `ws/approvals/${id}/approve`, { reason: "Leaver confirmed by HR" }, casey.cookie)).status).toBe(403); // the requester
    expect((await call("POST", `ws/approvals/${id}/approve`, { reason: "Leaver confirmed by HR" }, jordan.cookie)).body).toEqual({ status: "Approved" });
    expect(body<{ controls: { ownerId: string }[] }>(await call("GET", "ws/data/controls", {}, jordan.cookie)).controls[0].ownerId).toBe(jordan.id);
    expect(log("person.offboarded")[1].target).toMatch(/Owen Hart, items → Jordan Avery; .*1 control\(s\) and 0 policies transferred; approved by Jordan Avery/);
  });
});

describe("access", () => {
  it("employees request for themselves; a privileged request needs a second, different admin or owner; grants appear only on the final approval", async () => {
    const { jordan, casey, priya } = await team();
    expect((await call("POST", "ws/access/requests", { system: "Analytics warehouse", level: "Read", userId: jordan.id }, priya.cookie)).body).toEqual({ error: "Employees can only request access for themselves." });
    const r1 = body<{ id: string }>(await call("POST", "ws/access/requests", { system: "Analytics warehouse", level: "Read", reason: "Q4 reporting" }, priya.cookie)).id;
    expect((await call("POST", "ws/access/requests", { system: "Analytics warehouse", level: "Read", reason: "Q4 reporting" }, priya.cookie)).status).toBe(400); // already pending
    expect((await call("POST", `ws/access/requests/${r1}/decision`, { decision: "Approved", reason: "Needed for reporting" }, priya.cookie)).status).toBe(403);
    expect((await call("POST", `ws/access/requests/${r1}/decision`, { decision: "Approved", reason: "Needed for reporting" }, jordan.cookie)).status).toBe(200);
    const r2 = body<{ id: string }>(await call("POST", "ws/access/requests", { system: "Production database", level: "Admin", reason: "On-call database administrator" }, priya.cookie)).id;
    const first = body<{ stage: string; approvalId: string }>(await call("POST", `ws/access/requests/${r2}/decision`, { decision: "Approved", reason: "On-call rota confirmed" }, jordan.cookie));
    expect(first.stage).toBe("second");
    expect((await call("POST", `ws/approvals/${first.approvalId}/approve`, { reason: "Rota confirmed again" }, jordan.cookie)).status).toBe(403);
    expect((await call("POST", `ws/approvals/${first.approvalId}/approve`, { reason: "Rota confirmed again" }, casey.cookie)).body).toEqual({ status: "Approved" });
    const grants = body<{ grants: { system: string; userId: string }[] }>(await call("GET", "ws/data/access", {}, jordan.cookie)).grants;
    expect(grants.map((g) => g.system).sort()).toEqual(["Analytics warehouse", "Production database"]);
  });
  it("reviews: scope applied, holders never decide their own access, privileged reviews completed by someone other than the creator", async () => {
    const { jordan, casey, owen, priya } = await team();
    await call("POST", "ws/access/grants", { userId: owen.id, system: "Identity admin console", level: "Admin", reason: "Found in the IdP admin list" }, jordan.cookie);
    await call("POST", "ws/access/grants", { userId: priya.id, system: "HR System", level: "Read", reason: "Found in the HR system export" }, jordan.cookie);
    const id = body<{ id: string }>(await call("POST", "ws/access/reviews", { name: "Q4 privileged review", scope: "Privileged accounts only" }, jordan.cookie)).id;
    const rev = () => call("GET", "ws/data/access", {}, jordan.cookie).then((r) => body<{ reviews: { accounts: { id: string; user: string }[]; status: string }[] }>(r).reviews[0]);
    expect((await rev()).accounts.map((a) => a.user)).toEqual(["Owen Hart"]);
    const acc = (await rev()).accounts[0].id;
    expect((await call("POST", `ws/access/reviews/${id}/accounts/0/decision`, { decision: "Revoke", accountId: acc }, owen.cookie)).status).toBe(403);
    await call("POST", `ws/access/reviews/${id}/accounts/0/decision`, { decision: "Revoke", accountId: acc }, casey.cookie);
    expect((await call("POST", `ws/access/reviews/${id}/complete`, {}, jordan.cookie)).status).toBe(403);
    expect((await call("POST", `ws/access/reviews/${id}/complete`, {}, casey.cookie)).status).toBe(200);
    expect(body<{ grants: { user: string }[] }>(await call("GET", "ws/data/access", {}, jordan.cookie)).grants.map((g) => g.user)).toEqual(["Priya Nair"]);
  });
});

describe("cross-check fixes (group 2)", () => {
  it("MFA reset and offboarding need a recently confirmed password; the reset ends every session of the person", async () => {
    const { jordan, casey, priya } = await team();
    clock += 6 * 60_000; // the sign-in's confirmation has lapsed
    const ask = () => call("POST", `ws/people/${priya.id}/mfa-reset`, { checks: [true, true, true], reason: "Lost authenticator device", reasonText: "Phone lost on a trip", ticket: "SEC-12", approverId: casey.id }, jordan.cookie);
    expect((await ask()).body).toEqual({ error: "Confirm your password first." });
    expect((await call("POST", "me/reauth", { password: PW }, jordan.cookie)).status).toBe(204);
    const id = body<{ id: string }>(await ask()).id;
    expect((await call("POST", `ws/approvals/${id}/approve`, { reason: "Identity confirmed by call-back" }, casey.cookie)).body).toEqual({ error: "Confirm your password first." });
    await call("POST", "me/reauth", { password: PW }, casey.cookie);
    expect((await call("POST", `ws/approvals/${id}/approve`, { reason: "Identity confirmed by call-back" }, casey.cookie)).body).toEqual({ status: "Approved" });
    expect([...store.sessions.values()].filter((s) => s.userId === priya.id).every((s) => !!s.revokedAt)).toBe(true);
    expect(await store.kvGet("mfa", priya.id)).toBeNull();
  });
  it("the owner never approves their own policy by delegation; readers get published text only; employees see their own access only", async () => {
    const { jordan, casey, owen, priya } = await team();
    await call("POST", "ws/delegations", { toId: jordan.id, days: 3, reason: "Annual leave week" }, owen.cookie);
    const id = body<{ id: string }>(await call("POST", "ws/policies", { name: "Backup policy", body: "Secret draft text" }, jordan.cookie)).id;
    await call("POST", `ws/policies/${id}/submit`, { approverId: owen.id }, jordan.cookie);
    expect((await call("POST", `ws/policies/${id}/approve`, { reason: "Approving as Owen's delegate" }, jordan.cookie)).status).toBe(403);
    const seen = body<{ policies: { versions: { body: string }[] }[] }>(await call("GET", "ws/data/policies", {}, priya.cookie)).policies[0];
    expect(seen.versions[0].body).toBe("");
    await call("POST", "ws/access/grants", { userId: owen.id, system: "Identity admin console", level: "Admin", reason: "Found in the IdP admin list" }, jordan.cookie);
    expect(body<{ grants: unknown[] }>(await call("GET", "ws/data/access", {}, priya.cookie)).grants).toEqual([]);
    expect((await call("POST", "ws/access/grants", { userId: casey.id, system: "Vault", level: "Admin", reason: "Recording my own vault access" }, casey.cookie)).body).toEqual({ error: "Segregation of duties: you cannot record access for yourself." });
  });
  it("owned items go to an admin or owner; contractors with privileged access can be offboarded through a second approver", async () => {
    const { jordan, casey, priya } = await team();
    const pp = body<{ id: string }>(await call("POST", "ws/people/contractors", { name: "Grace Lin", role: "GRC Lead" }, jordan.cookie)).id;
    expect((await call("POST", `ws/people/${pp}/offboard`, { transferToId: priya.id }, jordan.cookie)).body).toEqual({ error: "Transfer owned items to an admin or owner (not the person being offboarded)." });
    await call("POST", "ws/access/grants", { userId: pp, system: "Production database", level: "Admin", reason: "Found in the database role list" }, jordan.cookie);
    const r = await call("POST", `ws/people/${pp}/offboard`, { transferToId: jordan.id }, jordan.cookie); expect(r.status).toBe(202);
    expect((await call("POST", `ws/approvals/${body<{ id: string }>(r).id}/approve`, { reason: "Contract ended last week" }, casey.cookie)).body).toEqual({ status: "Approved" });
    expect(body<{ people: { id: string }[] }>(await call("GET", "ws/data/people", {}, jordan.cookie)).people.some((p) => p.id === pp)).toBe(false);
  });
});
