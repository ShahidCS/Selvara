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

/* Production programme, group 7 (Integrations: GitHub, AWS, Okta, Microsoft Entra ID, Google Workspace) through `handle`, against the in-memory
   stand-ins and a stand-in network that answers as each provider would (nothing leaves the test). Checked against the inventory in
   docs/architecture/inventory/group7-integrations.md. Synthetic people, accounts and identifiers only. */
import { newKeyPair, type NetRequest, type NetResponse } from "@/server/integrations/net";
const ORIGIN = "https://app.example.test";
let clock = 1_800_000_000_000; let d: Deps; let auth: MemoryAuth; let store: MemoryStore; let dir: MemoryDirectory; let ws: MemoryWsStore; let files: MemoryFileStore; let ACME = ""; let OTHER = "";
const used = new Map<string, number>();
const KEY = newKeyPair().privateKeyPem;
const calls: { url: string; init?: NetRequest }[] = [];
const routes: { re: RegExp; method?: string; res: (url: string, init?: NetRequest) => NetResponse }[] = [];
const J = (status: number, body: unknown, headers: Record<string, string> = {}): NetResponse => ({ status, headers, text: JSON.stringify(body) });
const idTok = (claims: Record<string, unknown>) => `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
const on = (re: RegExp, res: NetResponse | ((url: string, init?: NetRequest) => NetResponse), method?: string) => routes.push({ re, method, res: typeof res === "function" ? res : () => res });
beforeEach(() => {
  clock = 1_800_000_000_000; used.clear(); auth = new MemoryAuth(() => clock); store = new MemoryStore(() => clock); dir = new MemoryDirectory(store);
  const plat = new MemoryPlatform(store, dir); ws = new MemoryWsStore(store); files = new MemoryFileStore();
  ACME = dir.addCompany("acme-eu", "Acme Test Co"); OTHER = dir.addCompany("other-co", "Other Test Co");
  calls.length = 0; routes.length = 0;
  d = { auth, store, dir, plat, sup: new MemorySupport(store, dir, plat), ws, files, site: { origin: ORIGIN, rpId: "app.example.test" }, secret: "x".repeat(40), now: () => clock,
    net: async (url: string, init?: NetRequest) => { calls.push({ url, init }); const r = routes.find((x) => x.re.test(url) && (!x.method || x.method === (init?.method ?? "GET"))); return r ? r.res(url, init) : { status: 404, headers: {}, text: "{}" }; },
    intEnv: { github: { appId: "12345", privateKey: KEY, slug: "selvara-test", clientId: "Iv1.test", clientSecret: "gh-secret" }, aws: { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret-example", principalArn: "arn:aws:iam::111122223333:user/selvara" },
      entra: { clientId: "00000000-1111-2222-3333-444444444444", clientSecret: "test-secret" }, google: { clientEmail: "reader@selvara-test.iam.example", privateKey: KEY, clientId: "1234567890", oauthClientId: "g-oauth", oauthClientSecret: "g-secret" } } };
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
/** Signs in again (after the clock moves on, the earlier session has ended). */
async function signIn(email: string) {
  const st = await call("POST", "auth/sign-in", { email, password: PW });
  const v = await call("POST", "auth/sign-in/verify", { ticket: (st.body as { ticket: string }).ticket, code: await code(email) });
  return v.cookies![0].match(new RegExp(`${COOKIE}=([^;]*)`))![1];
}
const log = (action: string) => store.auditLog.filter((x) => x.action === action);
const body = <T,>(r: Res) => r.body as T;

async function team() {
  const jordan = await member("jordan@acme.example", "admin", "Jordan Avery");
  const casey = await member("casey@acme.example", "admin", "Casey Morgan");
  const owen = await member("owen@acme.example", "owner", "Owen Hart");
  return { jordan, casey, owen };
}
const four = (cookie: string, id: string, decision: string, reason = "Checked the connection request") => call("POST", `ws/four-eyes/${id}/${decision}`, { reason }, cookie);
type Conn = { id: string; provider: string; status: string; label: string; health: string; externalId?: string; jwk?: string; checks: { id: string; name: string; result: string; items: { item: string }[]; controls: string[] }[]; accounts: { email: string; member: string | null; mfa: boolean | null }[] };
const idata = async (cookie: string) => body<{ providers: { id: string; ready: string | null }[]; connections: Conn[]; approvals: { id: string; kind: string; status: string }[] }>(await call("GET", "ws/data/integrations", {}, cookie));
/** The provider's sign-in that binds the tenant: the state comes from the sign-in link the server built. */
async function verify(cookie: string, id: string, extra: Record<string, unknown> = {}) {
  const url = (await conn(cookie, id) as Conn & { verify?: { url: string } }).verify!.url;
  return call("POST", "ws/integrations/callback", { code: "test-code", state: new URL(url).searchParams.get("state"), ...extra }, cookie);
}
async function connect(t: Awaited<ReturnType<typeof team>>, provider: string, fields: Record<string, string>) {
  const id = body<{ id: string }>(await call("POST", `ws/integrations/${provider}/start`, {}, t.jordan.cookie)).id;
  if (["github", "entra", "google"].includes(provider)) expect((await verify(t.jordan.cookie, id)).status).toBe(200);
  const r = await call("POST", `ws/integrations/${id}/connect`, { fields }, t.jordan.cookie);
  expect(r.status).toBe(200);
  const ap = (await idata(t.casey.cookie)).approvals.find((a) => a.status === "Pending")!;
  expect((await four(t.jordan.cookie, ap.id, "approve")).status).toBe(403); // never the requester
  expect((await four(t.casey.cookie, ap.id, "approve")).status).toBe(200);
  return id;
}
const conn = async (cookie: string, id: string) => (await idata(cookie)).connections.find((x) => x.id === id)!;
const result = (c: Conn, key: string) => c.checks.find((x) => x.id.endsWith(`-${key}`))?.result;

function github() {
  on(/github\.com\/login\/oauth\/access_token/, J(200, { access_token: "gho_user" }), "POST");
  on(/api\.github\.com\/user\/installations/, J(200, { installations: [{ id: 777, app_id: 12345, account: { login: "acme-test", type: "Organization" } }] }));
  on(/api\.github\.com\/app\/installations\/777$/, J(200, { account: { login: "acme-test", type: "Organization" }, permissions: {} }));
  on(/\/app\/installations\/777\/access_tokens$/, J(201, { token: "ghs_test" }), "POST");
  on(/\/installation\/repositories/, J(200, { repositories: [{ name: "api", default_branch: "main", archived: false, owner: { login: "acme-test" } }, { name: "web", default_branch: "main", archived: false, owner: { login: "acme-test" } }] }));
  on(/\/orgs\/acme-test$/, J(200, { two_factor_requirement_enabled: true }));
  on(/\/orgs\/acme-test\/members\?filter=2fa_disabled/, J(200, [{ login: "dev-two" }]));
  on(/\/orgs\/acme-test\/members\?role=admin/, J(200, [{ login: "dev-one" }]));
  on(/\/orgs\/acme-test\/members\?per_page/, J(200, [{ login: "dev-one" }, { login: "dev-two" }]));
  on(/\/orgs\/acme-test\/installations/, J(200, { installations: [{ app_slug: "copilot-reviewer" }, { app_slug: "renovate" }] }));
  on(/dependabot\/alerts/, J(200, [{ number: 4, created_at: new Date(clock - 40 * 86400_000).toISOString(), repository: { name: "api" }, security_advisory: { severity: "critical" } }]));
  on(/secret-scanning\/alerts/, J(200, []));
  on(/repos\/acme-test\/api\/branches\/main\/protection/, J(200, {}));
  on(/repos\/acme-test\/web\/branches\/main\/protection/, J(404, {}));
}

describe("integrations on the server", () => {
  it("connects GitHub after a test call and a second admin, and turns what it reads into automated tests that move linked controls", async () => {
    const t = await team(); github();
    expect((await call("GET", "ws/data/integrations", {}, t.owen.cookie)).status).toBe(403); // admins only
    const start = body<{ id: string }>(await call("POST", "ws/integrations/github/start", {}, t.jordan.cookie));
    expect(body<{ error: string }>(await call("POST", `ws/integrations/${start.id}/connect`, { fields: { installationId: "777" } }, t.jordan.cookie)).error).toMatch(/Sign in with GitHub first/); // a typed number is never enough
    await call("POST", `ws/integrations/${start.id}/disconnect`, { reason: "Started by mistake, redoing" }, t.jordan.cookie);
    const id = await connect(t, "github", { installationId: "777" });
    expect(log("integration.connected").length).toBe(1);
    const ctl = body<{ id: string }>(await call("POST", "ws/controls", { title: "Code changes are reviewed", domain: "Operations" }, t.jordan.cookie)).id;
    expect((await call("POST", `ws/integrations/${id}/sync`, {}, t.jordan.cookie)).status).toBe(200);
    let c = await conn(t.jordan.cookie, id);
    expect(c.label).toBe("Organisation acme-test");
    expect([result(c, "gh-2fa"), result(c, "gh-members-2fa"), result(c, "gh-vuln-sla"), result(c, "gh-secrets"), result(c, "gh-branch")]).toEqual(["Pass", "Fail", "Fail", "Pass", "Fail"]);
    expect(c.checks.find((x) => x.id.endsWith("gh-branch"))!.items[0].item).toBe("web (main)");
    expect(c.health).toBe("Healthy");
    expect(log("test.result.recorded").some((x) => x.actor === "System" && /gh-branch .*: Fail by System/.test(x.target))).toBe(true);
    // the Copilot app becomes discovered AI
    expect(body<{ shadow: { name: string; found: string }[] }>(await call("GET", "ws/data/ai", {}, t.jordan.cookie)).shadow.map((x) => x.name)).toEqual(["copilot-reviewer"]);
    // link the branch test to a control: the control follows it
    const tb = c.checks.find((x) => x.id.endsWith("gh-branch"))!.id;
    expect((await call("POST", `ws/integrations/checks/${tb}/link`, { controlId: ctl }, t.jordan.cookie)).status).toBe(200);
    const status = async () => (body<{ controls: { id: string; status: string }[] }>(await call("GET", "ws/data/controls", {}, t.jordan.cookie)).controls.find((x) => x.id === ctl)!.status);
    expect(await status()).toMatch(/Fail/);
    expect((await call("POST", `ws/integrations/${id}/sync`, {}, t.jordan.cookie)).status).toBe(400); // once per 5 minutes
    // the provider fixes the repository; the next sync passes and the control follows
    routes.splice(routes.findIndex((r) => r.re.source.includes("web")), 1); on(/repos\/acme-test\/web\/branches\/main\/protection/, J(200, {}));
    clock += 6 * 60_000; t.jordan.cookie = await signIn("jordan@acme.example");
    await call("POST", `ws/integrations/${id}/sync`, {}, t.jordan.cookie);
    expect(await status()).toMatch(/Pass/);
    // a revoked installation: no stale Pass
    routes.splice(0, routes.length); on(/app\/installations\/777$/, J(404, {})); // the app was uninstalled
    clock += 6 * 60_000; t.jordan.cookie = await signIn("jordan@acme.example");
    await call("POST", `ws/integrations/${id}/sync`, {}, t.jordan.cookie);
    c = await conn(t.jordan.cookie, id);
    expect(c.health).toBe("Credential refused");
    expect(result(c, "gh-branch")).toBe("Needs data"); expect(result(c, "gh-vuln-sla")).toBe("Fail"); // a Pass needs data again; a known Fail stays
    expect(await status()).not.toMatch(/Pass/);
    // an automated test is never overwritten by hand in Controls
    expect((await call("POST", `ws/tests/${tb}/result`, { result: "Pass", note: "Looks fine to me today" }, t.owen.cookie)).status).toBe(403);
    // the owner sees how many accounts a check names, not who
    const ownerView = body<{ tests: { id: string; items: { item: string }[] }[] }>(await call("GET", "ws/data/controls", {}, t.owen.cookie)).tests.find((x) => x.id.endsWith("gh-vuln-sla"))!;
    expect(ownerView.items[0].item).toMatch(/item.*an admin sees them/);
    // disconnect: a reason, account data erased, tests need data
    expect((await call("POST", `ws/integrations/${id}/disconnect`, { reason: "short" }, t.jordan.cookie)).status).toBe(400);
    expect((await call("POST", `ws/integrations/${id}/disconnect`, { reason: "We moved to another code host" }, t.casey.cookie)).status).toBe(200);
    expect([...ws.rows.values()].some((r) => (r.kind === "integration-accounts" || (r.kind === "test" && r.id.startsWith("AT-"))) && !r.deleted)).toBe(false);
    expect(JSON.stringify(store.auditLog)).not.toContain("ghs_test");
    const kai = await member("kai@other.example", "admin", "Kai Brandt", OTHER); // another company sees and reaches none of it
    expect((await idata(kai.cookie)).connections).toEqual([]);
    expect((await call("POST", `ws/integrations/${id}/sync`, {}, kai.cookie)).status).toBe(404);
  });
  it("assumes an AWS role with the company's own external id, signed with Signature Version 4", async () => {
    const t = await team();
    on(/sts\.amazonaws\.com/, (_u, i) => (String(i?.body).includes("ExternalId=selvara-") ? { status: 200, headers: {}, text: "<AssumeRoleResponse><Credentials><AccessKeyId>ASIATEST</AccessKeyId><SecretAccessKey>s</SecretAccessKey><SessionToken>tok</SessionToken></Credentials><AssumedRoleUser><Arn>arn:aws:sts::123456789012:assumed-role/SelvaraAudit/selvara-integration</Arn></AssumedRoleUser></AssumeRoleResponse>" } : J(403, {})), "POST");
    on(/iam\.amazonaws\.com/, (_u, i) => {
      const b = String(i?.body);
      if (b.includes("GetAccountSummary")) return { status: 200, headers: {}, text: "<SummaryMap><entry><key>AccountMFAEnabled</key><value>1</value></entry></SummaryMap>" };
      if (b.includes("GetAccountPasswordPolicy")) return { status: 404, headers: {}, text: "<Error><Code>NoSuchEntity</Code></Error>" };
      if (b.includes("GetCredentialReport")) return { status: 200, headers: {}, text: `<Content>${Buffer.from(`user,password_enabled,mfa_active,access_key_1_active,access_key_1_last_rotated,access_key_2_active,access_key_2_last_rotated,password_last_used\n<root_account>,not_supported,true,false,N/A,false,N/A,no_information\nops-user,true,false,true,${new Date(clock - 200 * 86400_000).toISOString()},false,N/A,${new Date(clock).toISOString()}`).toString("base64")}</Content>` };
      return { status: 200, headers: {}, text: "<ok/>" };
    }, "POST");
    on(/cloudtrail\.eu-central-1/, (_u, i) => (String(i?.body).includes("Name") ? J(200, { IsLogging: true }) : J(200, { trailList: [{ IsMultiRegionTrail: true, TrailARN: "arn:aws:cloudtrail:eu-central-1:123456789012:trail/main" }] })), "POST");
    on(/s3-control/, { status: 200, headers: {}, text: "<PublicAccessBlockConfiguration><BlockPublicAcls>true</BlockPublicAcls><IgnorePublicAcls>true</IgnorePublicAcls><BlockPublicPolicy>true</BlockPublicPolicy><RestrictPublicBuckets>true</RestrictPublicBuckets></PublicAccessBlockConfiguration>" });
    const id = await connect(t, "aws", { roleArn: "arn:aws:iam::123456789012:role/SelvaraAudit", region: "eu-central-1" });
    const sts = calls.find((x) => x.url.includes("sts.amazonaws.com"))!;
    expect(sts.init?.headers?.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/us-east-1\/sts\/aws4_request/);
    await call("POST", `ws/integrations/${id}/sync`, {}, t.jordan.cookie);
    const c = await conn(t.jordan.cookie, id);
    expect(c.label).toBe("AWS account 123456789012");
    expect(Object.fromEntries(c.checks.map((x) => [x.id.split("-").slice(2).join("-"), x.result]))).toEqual({ "aws-root-mfa": "Pass", "aws-password": "Fail", "aws-user-mfa": "Fail", "aws-key-age": "Fail", "aws-cloudtrail": "Pass", "aws-s3-public": "Pass" });
    expect(c.externalId).toMatch(/^selvara-[0-9a-f]{32}$/);
  });
  it("reads Okta with Selvara's per-company key, matches accounts to members by email and flags leavers", async () => {
    const t = await team();
    const leaver = await member("lee@acme.example", "employee", "Lee Park");
    on(/acme\.okta\.com\/oauth2\/v1\/token/, (_u, i) => (String(i?.body).includes("client_assertion=") ? J(200, { access_token: "okta-tok" }) : J(401, {})), "POST");
    on(/acme\.okta\.com\/api\/v1\/users\?limit/, J(200, [
      { id: "u1", status: "ACTIVE", lastLogin: new Date(clock).toISOString(), profile: { email: "Jordan@acme.example", firstName: "Jordan", lastName: "Avery" } },
      { id: "u2", status: "ACTIVE", lastLogin: new Date(clock - 120 * 86400_000).toISOString(), profile: { email: "lee@acme.example", firstName: "Lee", lastName: "Park" } },
    ]));
    on(/iam\/assignees\/users/, J(200, { value: [{ id: "u1" }] }));
    on(/users\/u1\/factors/, J(200, [{ status: "ACTIVE" }])); on(/users\/u2\/factors/, J(200, []));
    on(/api\/v1\/apps/, J(200, [{ label: "ChatGPT Enterprise", status: "ACTIVE" }, { label: "Slack", status: "ACTIVE" }]));
    const id = body<{ id: string }>(await call("POST", "ws/integrations/okta/start", {}, t.jordan.cookie)).id;
    const jwk = JSON.parse((await conn(t.jordan.cookie, id)).jwk!); expect(jwk.kty).toBe("RSA"); expect(jwk.d).toBeUndefined(); // only the public key is shown
    expect(JSON.stringify([...ws.rows.values()])).not.toContain("BEGIN PRIVATE KEY"); // the private key is sealed
    expect((await call("POST", `ws/integrations/${id}/connect`, { fields: { domain: "acme.internal", clientId: "0oa1b2c3d4e5f6g7h8" } }, t.jordan.cookie)).status).toBe(400); // only Okta's domains
    await call("POST", `ws/integrations/${id}/connect`, { fields: { domain: "acme.okta.com", clientId: "0oa1b2c3d4e5f6g7h8" } }, t.jordan.cookie);
    await four(t.casey.cookie, (await idata(t.casey.cookie)).approvals.find((a) => a.status === "Pending")!.id, "approve");
    await dir.removeMember(ACME, t.jordan.id, leaver.id, "Left the company", clock, { at: clock, actor: "test", action: "x", target: "x", cat: "System", space: "ws", ip: "" });
    await call("POST", `ws/integrations/${id}/sync`, {}, t.jordan.cookie);
    const c = await conn(t.jordan.cookie, id);
    expect([result(c, "okta-mfa"), result(c, "okta-admin-mfa"), result(c, "okta-inactive"), result(c, "okta-leavers")]).toEqual(["Fail", "Pass", "Fail", "Fail"]);
    expect(c.accounts.find((a) => a.email === "jordan@acme.example")!.member).toBe("Jordan Avery");
    expect(body<{ shadow: { name: string }[] }>(await call("GET", "ws/data/ai", {}, t.jordan.cookie)).shadow.map((x) => x.name)).toEqual(["ChatGPT Enterprise"]);
  });
  it("reads Entra ID and Google Workspace through Selvara's own apps, and refuses a connection whose test fails", async () => {
    const t = await team();
    on(/login\.microsoftonline\.com/, J(200, { access_token: "graph-tok", id_token: idTok({ tid: "11111111-2222-3333-4444-555555555555" }) }), "POST");
    on(/graph\.microsoft\.com\/v1\.0\/users/, J(200, { value: [{ id: "e1", displayName: "Casey Morgan", mail: "casey@acme.example", userPrincipalName: "casey@acme.example", accountEnabled: true }] }));
    on(/userRegistrationDetails/, J(200, { value: [{ id: "e1", isMfaRegistered: true, isAdmin: true }] }));
    on(/directoryRoles\/r1\/members/, J(200, { value: [{ id: "e1" }] })); on(/directoryRoles\?/, J(200, { value: [{ id: "r1" }] }));
    on(/conditionalAccess/, J(200, { value: [{ displayName: "Require MFA", state: "enabled", grantControls: { builtInControls: ["mfa"] } }] }));
    on(/servicePrincipals/, J(200, { value: [{ displayName: "Claude for Work", servicePrincipalType: "Application" }] }));
    const e = await connect(t, "entra", {});
    await call("POST", `ws/integrations/${e}/sync`, {}, t.jordan.cookie);
    const ce = await conn(t.jordan.cookie, e);
    expect([result(ce, "entra-mfa"), result(ce, "entra-admin-mfa"), result(ce, "entra-ca-mfa"), result(ce, "entra-leavers")]).toEqual(["Pass", "Pass", "Pass", "Pass"]);
    // Google: the token request is refused, so the connection is never created
    on(/oauth2\.googleapis\.com\/token/, (_u, i) => (String(i?.body).includes("authorization_code") ? J(200, { id_token: idTok({ email: "reader@acme.example", email_verified: true, hd: "acme.example" }) }) : J(401, {})), "POST");
    const g = body<{ id: string }>(await call("POST", "ws/integrations/google/start", {}, t.jordan.cookie)).id;
    const link = (await conn(t.jordan.cookie, g) as Conn & { verify?: { url: string } }).verify!.url;
    const st = new URL(link).searchParams.get("state");
    expect((await call("POST", "ws/integrations/callback", { code: "c1", state: st }, t.jordan.cookie)).status).toBe(200);
    expect((await call("POST", "ws/integrations/callback", { code: "c2", state: st }, t.jordan.cookie)).status).toBe(400); // a sign-in link works once
    const r = await call("POST", `ws/integrations/${g}/connect`, {}, t.jordan.cookie);
    expect(body<{ error: string }>(r).error).toMatch(/connection test failed.*credentials were refused/);
    expect(log("integration.connect_failed").length).toBe(1);
    expect((await idata(t.casey.cookie)).approvals.filter((a) => a.status === "Pending").length).toBe(0);
    // a provider whose platform credentials are missing cannot be started
    d.intEnv = { ...d.intEnv, google: undefined };
    expect(body<{ error: string }>(await call("POST", "ws/integrations/google/start", {}, t.jordan.cookie)).error).toMatch(/has not set up/);
  });

});

describe("group 7 cross-check fixes", () => {
  it("never lets one company connect another's GitHub organisation or Entra tenant", async () => {
    const t = await team(); github();
    on(/login\.microsoftonline\.com/, J(200, { access_token: "graph-tok", id_token: idTok({ tid: "11111111-2222-3333-4444-555555555555" }) }), "POST");
    on(/graph\.microsoft\.com\/v1\.0\/users/, J(200, { value: [] }));
    await connect(t, "entra", {});
    // another company: its admins sign in, but GitHub shows them no installation of the app, and Microsoft names a tenant already bound
    const kai = await member("kai@other.example", "admin", "Kai Brandt", OTHER); const lu = await member("lu@other.example", "admin", "Lu Chen", OTHER);
    routes.splice(routes.findIndex((r) => r.re.source.includes("user\\/installations")), 1); on(/api\.github\.com\/user\/installations/, J(200, { installations: [] }));
    const g = body<{ id: string }>(await call("POST", "ws/integrations/github/start", {}, kai.cookie)).id;
    expect(body<{ error: string }>(await verify(kai.cookie, g, { installationId: "777" })).error).toMatch(/cannot see an installation/);
    expect(body<{ error: string }>(await call("POST", `ws/integrations/${g}/connect`, { fields: { installationId: "777" } }, kai.cookie)).error).toMatch(/Sign in with GitHub first/);
    const e = body<{ id: string }>(await call("POST", "ws/integrations/entra/start", {}, kai.cookie)).id;
    expect((await verify(kai.cookie, e)).status).toBe(200);
    expect(body<{ error: string }>(await call("POST", `ws/integrations/${e}/connect`, {}, kai.cookie)).error).toMatch(/already connected to another Selvara company/);
    void lu;
    // a state from one company's connection does nothing in another company
    const url = (await conn(t.jordan.cookie, body<{ id: string }>(await call("POST", "ws/integrations/github/start", {}, t.jordan.cookie)).id) as Conn & { verify?: { url: string } }).verify!.url;
    expect(body<{ error: string }>(await call("POST", "ws/integrations/callback", { code: "x", state: new URL(url).searchParams.get("state") }, kai.cookie)).error).toMatch(/already used or has expired|not found/);
  });
  it("refuses an AWS role that can be assumed without the company's external id", async () => {
    const t = await team();
    on(/sts\.amazonaws\.com/, { status: 200, headers: {}, text: "<AssumeRoleResponse><Credentials><AccessKeyId>ASIATEST</AccessKeyId><SecretAccessKey>s</SecretAccessKey><SessionToken>tok</SessionToken></Credentials><AssumedRoleUser><Arn>arn:aws:sts::123456789012:assumed-role/Open/x</Arn></AssumedRoleUser></AssumeRoleResponse>" }, "POST");
    const id = body<{ id: string }>(await call("POST", "ws/integrations/aws/start", {}, t.jordan.cookie)).id;
    const r = await call("POST", `ws/integrations/${id}/connect`, { fields: { roleArn: "arn:aws:iam::123456789012:role/Open", region: "eu-central-1" } }, t.jordan.cookie);
    expect(body<{ error: string }>(r).error).toMatch(/assumed without the external id/);
  });
});
