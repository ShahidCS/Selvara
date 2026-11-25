/* Server-only. The read-only connectors the owner chose (production programme group 7): GitHub (a GitHub App), AWS (a cross-account role
   with an external id), Okta and Microsoft Entra ID (identity providers) and Google Workspace. Each connector:
   - says which platform credentials it needs (Vercel environment variables, set by the owner) and which identifiers a company admin enters;
   - tests a connection with one small read before anything is stored as connected;
   - syncs: reads only what its checks need and returns check results (Pass, Fail or Needs data, with the evidence items), the accounts it
     saw (for matching to members by email) and the applications people use (for AI and vendor discovery). Nothing is ever written to the
     provider. Values are read as data only; the permission lists in the setup texts are to be verified against each provider's documentation.
   Personal data kept: account name, email, status, MFA enrolled (yes or no, never the method's details), admin (yes or no), last sign-in day. */
import { amzDateOf, failed, json, jwtRS256, ProviderError, sigV4, xmlTag, type AwsCreds, type Net, type NetResponse } from "./net";
/** J2: what a company admin sees when the platform has not configured a connector. The platform's own setup (Vercel variables GITHUB_APP_*,
 *  AWS_INTEGRATION_*, ENTRA_CLIENT_*, GOOGLE_SA_* and GOOGLE_OAUTH_*) is never shown in the workspace: it is in docs/guides/SUPABASE.md
 *  (section 4g, "Connectors") for platform staff. */
export const NOT_AVAILABLE = "This connector isn't available yet. Contact your platform administrator.";

export type Result = "Pass" | "Fail" | "Needs data";
export interface Check { key: string; name: string; logic: string; result: Result; items: { item: string; result: string }[]; note: string }
export interface Account { key: string; name: string; email: string; status: "Active" | "Suspended" | "Deprovisioned"; mfa: boolean | null; admin: boolean; lastLogin: string | null }
export interface SyncOut { label: string; checks: Check[]; accounts: Account[]; apps: { name: string; users: number | null }[]; counts: Record<string, number> }
export interface IntegrationEnv {
  github?: { appId: string; privateKey: string; slug: string; clientId: string; clientSecret: string };
  aws?: { accessKeyId: string; secretAccessKey: string; principalArn: string };
  entra?: { clientId: string; clientSecret: string };
  google?: { clientEmail: string; privateKey: string; clientId: string; oauthClientId: string; oauthClientSecret: string };
}
export interface Ctx { net: Net; env: IntegrationEnv; now: number; secret: (sealed: string) => string }
export type Config = Record<string, string>;
export interface Field { key: string; label: string; help: string; pattern: RegExp; example: string }
export interface Provider {
  id: "github" | "aws" | "okta" | "entra" | "google"; name: string; type: string; scope: string;
  fields: Field[]; ready(env: IntegrationEnv): string | null; instructions(env: IntegrationEnv, cfg: Config & { externalId?: string; jwk?: string }, site: string): string[];
  test(c: Ctx, cfg: Config): Promise<string>; sync(c: Ctx, cfg: Config): Promise<SyncOut>;
  /** The provider-side identity this connection reads (an installation, account, tenant or domain): one company at a time, platform-wide. */
  bindKey(cfg: Config): string;
  /** Providers whose platform app is trusted by every customer (GitHub, Entra ID, Google) prove the tenant with a sign-in by one of its
   *  people: the identifier comes from the provider's own answer to that sign-in, never from what an admin types. */
  verify?: { label: string; url(env: IntegrationEnv, site: string, state: string): string; check(c: Ctx, code: string, site: string): Promise<{ config?: Config; choices?: { id: string; label: string }[] }> };
}
/** The redirect address registered with GitHub, Microsoft and Google for the sign-in that binds a tenant. */
export const callbackOf = (site: string) => `${site}/ws/integrations/callback`;
/** Claims of an ID token received directly from the provider's token endpoint over TLS (OpenID Connect allows trusting it without a signature check). */
const claims = (idToken: string): Record<string, unknown> => { try { return JSON.parse(Buffer.from(String(idToken).split(".")[1] ?? "", "base64url").toString("utf8")); } catch { return {}; } };

const DAY = 86_400_000;
const day = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : null);
const check = (key: string, name: string, logic: string, bad: string[], ok: boolean | null, note: string, total?: number): Check => ({
  key, name, logic, result: ok === null ? "Needs data" : ok ? "Pass" : "Fail", note,
  items: ok === null ? [] : bad.length ? [...bad.slice(0, 20).map((b) => ({ item: b, result: "Fail" })), ...(bad.length > 20 ? [{ item: `and ${bad.length - 20} more`, result: "Fail" }] : [])] : [{ item: total !== undefined ? `${total} checked` : "Checked", result: "Pass" }],
});
const unknown = (key: string, name: string, logic: string, why: string): Check => ({ key, name, logic, result: "Needs data", items: [], note: why });
/** Identity checks shared by the identity providers, from the accounts they returned. */
function identityChecks(prefix: string, src: string, accts: Account[], now: number, mfaKnown: boolean): Check[] {
  const active = accts.filter((a) => a.status === "Active");
  const noMfa = active.filter((a) => a.mfa === false); const admins = active.filter((a) => a.admin);
  const stale = active.filter((a) => !a.lastLogin || now - Date.parse(a.lastLogin) > 90 * DAY);
  return [
    mfaKnown ? check(`${prefix}-mfa`, `MFA enrolled for every active ${src} account`, "Each active account has at least one MFA factor enrolled.", noMfa.map((a) => `${a.email || a.name}: no MFA`), noMfa.length === 0, `${active.length - noMfa.length} of ${active.length} active accounts have MFA.`, active.length)
      : unknown(`${prefix}-mfa`, `MFA enrolled for every active ${src} account`, "Each active account has at least one MFA factor enrolled.", "MFA enrolment could not be read with the permissions granted."),
    mfaKnown ? check(`${prefix}-admin-mfa`, `${src} administrators have MFA`, "Every account holding an administrator role has MFA enrolled.", admins.filter((a) => a.mfa === false).map((a) => `${a.email || a.name}: administrator without MFA`), admins.every((a) => a.mfa !== false), `${admins.length} administrator accounts.`, admins.length)
      : unknown(`${prefix}-admin-mfa`, `${src} administrators have MFA`, "Every account holding an administrator role has MFA enrolled.", "MFA enrolment could not be read with the permissions granted."),
    check(`${prefix}-inactive`, `No active ${src} account unused for 90 days`, "Active accounts that have not signed in for 90 days (or never) are reviewed and suspended.", stale.map((a) => `${a.email || a.name}: last sign-in ${a.lastLogin ?? "never"}`), stale.length === 0, `${stale.length} of ${active.length} active accounts unused for 90 days.`, active.length),
  ];
}
/** Follows `Link: <...>; rel="next"` pages (GitHub, Okta), at most `max` pages, on the provider's own host only. */
async function paged<T>(net: Net, url: string, headers: Record<string, string>, max = 20, pick: (r: NetResponse) => T[] = (r) => json<T[]>(r)): Promise<T[] & { truncated?: boolean }> {
  const out: T[] & { truncated?: boolean } = []; let next: string | null = url; const host = new URL(url).host;
  for (let i = 0; next && i < max; i++) {
    const r = await net(next, { headers }); if (r.status !== 200) failed("Reading a list", r);
    out.push(...pick(r));
    const m = /<([^>]+)>;\s*rel="next"/.exec(r.headers.link ?? ""); next = m && new URL(m[1]).host === host ? m[1] : null;
  }
  if (next) out.truncated = true; // more pages than were read: a check over this list must not Pass on what it did not see
  return out;
}
/** A check over a list that was only partly read: failures found still Fail; a clean partial read needs data, never Passes. */
const partial = (ch: Check, truncated: boolean, what: string): Check => (truncated && ch.result === "Pass" ? { ...ch, result: "Needs data", items: [], note: `${ch.note} Not every ${what} could be read, so this cannot pass.` } : truncated ? { ...ch, note: `${ch.note} Not every ${what} was read.` } : ch);

/* ---------------- GitHub (GitHub App, installation token) ---------------- */
const GH = "https://api.github.com";
const ghHead = (token: string, kind: "Bearer" | "token" = "Bearer") => ({ authorization: `${kind} ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" });
const appJwt = (c: Ctx) => jwtRS256({ iat: Math.floor(c.now / 1000) - 60, exp: Math.floor(c.now / 1000) + 540, iss: c.env.github!.appId }, c.env.github!.privateKey);
async function ghInstallation(c: Ctx, id: string) {
  const r = await c.net(`${GH}/app/installations/${encodeURIComponent(id)}`, { headers: ghHead(appJwt(c)) });
  if (r.status === 404) throw new ProviderError("The Selvara GitHub App is no longer installed on this organisation.", 401); // uninstalled: the credential is gone
  if (r.status !== 200) failed("Finding the GitHub App installation", r);
  return json<{ account: { login: string; type: string }; permissions: Record<string, string> }>(r);
}
async function ghToken(c: Ctx, id: string) {
  const r = await c.net(`${GH}/app/installations/${encodeURIComponent(id)}/access_tokens`, { method: "POST", headers: ghHead(appJwt(c)) });
  if (r.status !== 201) failed("Getting a GitHub installation token", r);
  return json<{ token: string }>(r).token;
}
const github: Provider = {
  id: "github", name: "GitHub", type: "Source control", scope: "Read organisation settings, members, repositories' branch protection, Dependabot and secret-scanning alerts",
  fields: [],
  ready: (env) => (env.github ? null : NOT_AVAILABLE),
  instructions: (env) => [
    `An organisation owner installs the Selvara GitHub App on your organisation: https://github.com/apps/${env.github?.slug ?? "<app>"}/installations/new. Choose all repositories, or the ones in scope.`,
    "The app asks only for read access: organisation administration and members, repository administration and metadata, Dependabot alerts and secret-scanning alerts. It cannot read your code.",
    "Then select Sign in with GitHub below, as a person who can see that installation. Selvara connects only an installation your GitHub account can see, so nobody can connect another organisation by its number.",
  ],
  bindKey: (cfg) => `github:${cfg.installationId}`,
  verify: {
    label: "Sign in with GitHub",
    url: (env, site, state) => `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(env.github!.clientId)}&redirect_uri=${encodeURIComponent(callbackOf(site))}&state=${encodeURIComponent(state)}&allow_signup=false`,
    async check(c, code, site) {
      const e = c.env.github!;
      const r = await c.net("https://github.com/login/oauth/access_token", { method: "POST", headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: e.clientId, client_secret: e.clientSecret, code, redirect_uri: callbackOf(site) }).toString() });
      const tok = r.status === 200 ? json<{ access_token?: string }>(r).access_token : undefined; if (!tok) failed("Signing in with GitHub", r.status === 200 ? { ...r, status: 401 } : r);
      const list = await c.net(`${GH}/user/installations?per_page=100`, { headers: ghHead(tok!) });
      if (list.status !== 200) failed("Listing your GitHub App installations", list);
      const mine = json<{ installations: { id: number; app_id: number; account: { login: string; type: string } }[] }>(list).installations.filter((x) => String(x.app_id) === String(e.appId));
      if (!mine.length) throw new ProviderError("Your GitHub account cannot see an installation of the Selvara GitHub App. Install it first, or sign in as an organisation owner.");
      return { choices: mine.map((x) => ({ id: String(x.id), label: `${x.account.type === "Organization" ? "Organisation" : "Account"} ${x.account.login}` })) };
    },
  },
  async test(c, cfg) { const i = await ghInstallation(c, cfg.installationId); return `${i.account.type === "Organization" ? "Organisation" : "Account"} ${i.account.login}`; },
  async sync(c, cfg) {
    const inst = await ghInstallation(c, cfg.installationId); const org = inst.account.login; const isOrg = inst.account.type === "Organization";
    const tok = await ghToken(c, cfg.installationId); const H = ghHead(tok, "token");
    const repos = (await paged<{ name: string; default_branch: string; archived: boolean; owner: { login: string } }>(c.net, `${GH}/installation/repositories?per_page=100`, H, 10, (r) => json<{ repositories: never[] }>(r).repositories));
    const active = repos.filter((r) => !r.archived);
    const checks: Check[] = []; const accounts: Account[] = []; let apps: { name: string; users: number | null }[] = [];
    if (isOrg) {
      const o = await c.net(`${GH}/orgs/${encodeURIComponent(org)}`, { headers: H });
      const two = o.status === 200 ? json<{ two_factor_requirement_enabled?: boolean | null }>(o).two_factor_requirement_enabled : undefined;
      checks.push(two === undefined || two === null ? unknown("gh-2fa", "GitHub organisation requires two-factor authentication", "The organisation setting 'Require two-factor authentication' is on.", "The organisation setting could not be read (organisation administration: read).")
        : check("gh-2fa", "GitHub organisation requires two-factor authentication", "The organisation setting 'Require two-factor authentication' is on.", two ? [] : [`${org}: two-factor authentication not required`], two, two ? "Required." : "Not required."));
      const opt = async <T,>(url: string) => { try { return await paged<T>(c.net, url, H, 20); } catch { return null; } };
      const members = await opt<{ login: string }>(`${GH}/orgs/${encodeURIComponent(org)}/members?per_page=100`);
      const admins = (await opt<{ login: string }>(`${GH}/orgs/${encodeURIComponent(org)}/members?role=admin&per_page=100`)) ?? [];
      const no2faList = await opt<{ login: string }>(`${GH}/orgs/${encodeURIComponent(org)}/members?filter=2fa_disabled&per_page=100`);
      const no2fa = no2faList ? no2faList.map((x) => x.login) : null;
      // the filter is honoured only for owners' tokens: a list as long as every member means it was ignored
      const filterIgnored = !!no2fa && !!members && members.length > 1 && no2fa.length === members.length;
      for (const m of members ?? []) accounts.push({ key: m.login, name: m.login, email: "", status: "Active", mfa: no2fa && !filterIgnored ? !no2fa.includes(m.login) : null, admin: admins.some((a) => a.login === m.login), lastLogin: null });
      checks.push(no2fa === null || filterIgnored || !members ? unknown("gh-members-2fa", "Every GitHub organisation member has two-factor authentication", "No member of the organisation has two-factor authentication off.", "Members' two-factor status could not be read with this installation's access.")
        : partial(check("gh-members-2fa", "Every GitHub organisation member has two-factor authentication", "No member of the organisation has two-factor authentication off.", no2fa.map((l) => `${l}: two-factor off`), no2fa.length === 0, `${members.length - no2fa.length} of ${members.length} members have it.`, members.length), !!members.truncated || !!no2faList?.truncated, "member"));
      const inst2 = await c.net(`${GH}/orgs/${encodeURIComponent(org)}/installations?per_page=100`, { headers: H });
      if (inst2.status === 200) apps = json<{ installations: { app_slug: string }[] }>(inst2).installations.map((x) => ({ name: x.app_slug, users: null }));
      // oldest first, so the alerts that breach the 30-day limit are read first
      const dep = await opt<{ number: number; created_at: string; repository: { name: string }; security_advisory?: { severity?: string } }>(`${GH}/orgs/${encodeURIComponent(org)}/dependabot/alerts?state=open&severity=critical,high&sort=created&direction=asc&per_page=100`);
      if (dep) {
        const old = dep.filter((a) => c.now - Date.parse(a.created_at) > 30 * DAY);
        checks.push(partial(check("gh-vuln-sla", "No critical or high dependency alert open longer than 30 days", "Open Dependabot alerts of critical or high severity are fixed within 30 days.", old.map((a) => `${a.repository.name} #${a.number} (${a.security_advisory?.severity ?? "high"}, open since ${day(a.created_at)})`), old.length === 0, `${old.length} past the 30-day limit.`), !!dep.truncated, "alert"));
      } else checks.push(unknown("gh-vuln-sla", "No critical or high dependency alert open longer than 30 days", "Open Dependabot alerts of critical or high severity are fixed within 30 days.", "Dependabot alerts could not be read (Dependabot alerts: read, and alerts enabled)."));
      const sec = await opt<{ number: number; repository: { name: string } }>(`${GH}/orgs/${encodeURIComponent(org)}/secret-scanning/alerts?state=open&per_page=100`);
      checks.push(sec ? partial(check("gh-secrets", "No open secret-scanning alerts", "Secrets found in repositories are revoked and the alert closed.", sec.map((a) => `${a.repository.name} #${a.number}`), sec.length === 0, `${sec.length} open.`), !!sec.truncated, "alert")
        : unknown("gh-secrets", "No open secret-scanning alerts", "Secrets found in repositories are revoked and the alert closed.", "Secret-scanning alerts could not be read (secret scanning alerts: read, and scanning enabled)."));
    } else checks.push(unknown("gh-2fa", "GitHub organisation requires two-factor authentication", "The organisation setting 'Require two-factor authentication' is on.", "The app is installed on a personal account, not an organisation."));
    // branch protection: classic protection or a ruleset that applies to the default branch
    const LIMIT = 100; const unprotected: string[] = []; let unreadable = false;
    for (const r of active.slice(0, LIMIT)) {
      const base = `${GH}/repos/${encodeURIComponent(r.owner.login)}/${encodeURIComponent(r.name)}`; const b = encodeURIComponent(r.default_branch);
      const p = await c.net(`${base}/branches/${b}/protection`, { headers: H });
      if (p.status === 200) continue;
      if (p.status !== 404) { unreadable = true; break; }
      const rules = await c.net(`${base}/rules/branches/${b}`, { headers: H });
      if (rules.status === 200 && json<unknown[]>(rules).length) continue;
      unprotected.push(`${r.name} (${r.default_branch})`);
    }
    const n = Math.min(active.length, LIMIT);
    checks.push(unreadable ? unknown("gh-branch", "Default branches are protected", "Every active repository's default branch has protection rules or a ruleset.", "Branch protection could not be read (administration: read).")
      : partial(check("gh-branch", "Default branches are protected", "Every active repository's default branch has protection rules or a ruleset.", unprotected, unprotected.length === 0, `${n - unprotected.length} of ${n} protected.`, n), active.length > LIMIT || !!repos.truncated, "repository"));
    return { label: `${isOrg ? "Organisation" : "Account"} ${org}`, checks, accounts, apps, counts: { repositories: active.length, members: accounts.length } };
  },
};

/* ---------------- AWS (role in the company's account, assumed with an external id) ---------------- */
const STS = "https://sts.amazonaws.com/"; const IAM = "https://iam.amazonaws.com/";
async function awsQuery(c: Ctx, creds: AwsCreds, url: string, service: string, region: string, params: Record<string, string>): Promise<NetResponse> {
  const body = new URLSearchParams(params).toString();
  const headers = sigV4({ method: "POST", url, headers: { "content-type": "application/x-www-form-urlencoded; charset=utf-8" }, body }, creds, region, service, amzDateOf(c.now));
  return c.net(url, { method: "POST", headers, body });
}
async function assume(c: Ctx, cfg: Config, externalId: string | null = cfg.externalId): Promise<{ creds: AwsCreds; account: string }> {
  const e = c.env.aws!;
  const r = await awsQuery(c, { accessKeyId: e.accessKeyId, secretAccessKey: e.secretAccessKey }, STS, "sts", "us-east-1", { Action: "AssumeRole", Version: "2011-06-15", RoleArn: cfg.roleArn, RoleSessionName: "selvara-integration", ...(externalId ? { ExternalId: externalId } : {}), DurationSeconds: "900" });
  if (r.status !== 200) failed("Assuming the Selvara role in your AWS account", r);
  const creds = { accessKeyId: xmlTag(r.text, "AccessKeyId") ?? "", secretAccessKey: xmlTag(r.text, "SecretAccessKey") ?? "", sessionToken: xmlTag(r.text, "SessionToken") ?? "" };
  const account = /arn:aws:sts::(\d{12}):/.exec(xmlTag(r.text, "Arn") ?? "")?.[1] ?? "";
  if (!creds.accessKeyId || !account) throw new ProviderError("AWS sent an unexpected answer when the role was assumed.");
  return { creds, account };
}
const aws: Provider = {
  id: "aws", name: "AWS", type: "Cloud", scope: "Read security configuration (the AWS-managed SecurityAudit policy): root MFA, IAM users and keys, password policy, CloudTrail, S3 public access block",
  fields: [
    { key: "roleArn", label: "Role ARN", help: "The ARN of the role you created for Selvara in your AWS account.", pattern: /^arn:aws:iam::\d{12}:role\/[\w+=,.@/-]{1,128}$/, example: "arn:aws:iam::123456789012:role/SelvaraAudit" },
    { key: "region", label: "Main region", help: "The region where your CloudTrail trail and most resources are.", pattern: /^[a-z]{2}(-gov)?-[a-z]+-\d$/, example: "eu-central-1" },
  ],
  ready: (env) => (env.aws ? null : NOT_AVAILABLE),
  instructions: (env, cfg) => [
    "In your AWS account, create an IAM role for Selvara (IAM, Roles, Create role, Another AWS account).",
    `Trusted account: ${env.aws?.principalArn ?? "<Selvara's principal>"}. Require an external id: ${cfg.externalId ?? "(shown after you start)"}. Do not share this external id with anyone else.`,
    "Attach only the AWS-managed policy SecurityAudit (read-only configuration). Do not attach ReadOnlyAccess: it can read your data.",
    "Enter the role's ARN and your main region below. Add one connection per AWS account you want checked.",
  ],
  bindKey: (cfg) => `aws:${/arn:aws:iam::(\d{12}):/.exec(cfg.roleArn)?.[1] ?? cfg.roleArn}:${cfg.roleArn}`,
  async test(c, cfg) {
    const a = await assume(c, cfg);
    // the role must require this company's external id: if it can be assumed without it, any other Selvara customer could use it too
    let open = false; try { await assume(c, cfg, null); open = true; } catch { /* refused, as it must be */ }
    if (open) throw new ProviderError("The role can be assumed without the external id. Add the sts:ExternalId condition to its trust policy, then test again.");
    return `AWS account ${a.account}`;
  },
  async sync(c, cfg) {
    const { creds, account } = await assume(c, cfg); const checks: Check[] = []; const accounts: Account[] = [];
    const sum = await awsQuery(c, creds, IAM, "iam", "us-east-1", { Action: "GetAccountSummary", Version: "2010-05-08" });
    if (sum.status === 200) { const on = /<key>AccountMFAEnabled<\/key>\s*<value>1<\/value>/.test(sum.text); checks.push(check("aws-root-mfa", "AWS root user has MFA", "The account's root user has an MFA device.", on ? [] : [`account ${account}: root user without MFA`], on, on ? "Enabled." : "Not enabled.")); }
    else checks.push(unknown("aws-root-mfa", "AWS root user has MFA", "The account's root user has an MFA device.", "The account summary could not be read (iam:GetAccountSummary)."));
    const pol = await awsQuery(c, creds, IAM, "iam", "us-east-1", { Action: "GetAccountPasswordPolicy", Version: "2010-05-08" });
    if (pol.status === 200) { const len = Number(xmlTag(pol.text, "MinimumPasswordLength") ?? 0); checks.push(check("aws-password", "AWS password policy requires at least 14 characters", "The IAM password policy sets a minimum length of 14 or more.", len >= 14 ? [] : [`minimum length ${len}`], len >= 14, `Minimum length ${len}.`)); }
    else if (pol.status === 404) checks.push(check("aws-password", "AWS password policy requires at least 14 characters", "The IAM password policy sets a minimum length of 14 or more.", ["no password policy set"], false, "No password policy is set."));
    else checks.push(unknown("aws-password", "AWS password policy requires at least 14 characters", "The IAM password policy sets a minimum length of 14 or more.", "The password policy could not be read."));
    await awsQuery(c, creds, IAM, "iam", "us-east-1", { Action: "GenerateCredentialReport", Version: "2010-05-08" });
    const rep = await awsQuery(c, creds, IAM, "iam", "us-east-1", { Action: "GetCredentialReport", Version: "2010-05-08" });
    const content = rep.status === 200 ? xmlTag(rep.text, "Content") : null;
    if (content) {
      const [head, ...rows] = Buffer.from(content, "base64").toString("utf8").trim().split("\n"); const cols = head.split(",");
      const at = (row: string[], k: string) => row[cols.indexOf(k)] ?? "";
      // values are not quoted and a user name may hold a comma: the extra parts belong to the first column (the user name)
      const split = (l: string) => { const p = l.split(","); const extra = p.length - cols.length; return extra > 0 ? [p.slice(0, extra + 1).join(","), ...p.slice(extra + 1)] : p; };
      const users = rows.map(split).filter((r) => at(r, "user") !== "<root_account>");
      const noMfa = users.filter((u) => at(u, "password_enabled") === "true" && at(u, "mfa_active") !== "true");
      const oldKeys = users.flatMap((u) => ["1", "2"].filter((n) => at(u, `access_key_${n}_active`) === "true" && c.now - Date.parse(at(u, `access_key_${n}_last_rotated`)) > 90 * DAY).map((n) => `${at(u, "user")}: access key ${n} last rotated ${day(at(u, `access_key_${n}_last_rotated`))}`));
      for (const u of users) accounts.push({ key: at(u, "user"), name: at(u, "user"), email: "", status: "Active", mfa: at(u, "password_enabled") === "true" ? at(u, "mfa_active") === "true" : null, admin: false, lastLogin: /^\d{4}-/.test(at(u, "password_last_used")) ? at(u, "password_last_used") : null });
      checks.push(check("aws-user-mfa", "AWS IAM users with a console password have MFA", "Every IAM user who can sign in to the console has an MFA device.", noMfa.map((u) => `${at(u, "user")}: console password without MFA`), noMfa.length === 0, `${noMfa.length} of ${users.length} users without MFA.`, users.length));
      checks.push(check("aws-key-age", "AWS access keys rotated within 90 days", "Active IAM access keys are rotated at least every 90 days.", oldKeys, oldKeys.length === 0, `${oldKeys.length} keys older than 90 days.`, users.length));
    } else {
      const why = rep.status === 410 || /ReportInProgress|ReportNotPresent/.test(rep.text) ? "AWS is still preparing the credential report; it is read at the next sync." : "The credential report could not be read (iam:GetCredentialReport).";
      checks.push(unknown("aws-user-mfa", "AWS IAM users with a console password have MFA", "Every IAM user who can sign in to the console has an MFA device.", why), unknown("aws-key-age", "AWS access keys rotated within 90 days", "Active IAM access keys are rotated at least every 90 days.", why));
    }
    const ctUrl = `https://cloudtrail.${cfg.region}.amazonaws.com/`; const ctBody = "{}";
    const ct = await c.net(ctUrl, { method: "POST", body: ctBody, headers: sigV4({ method: "POST", url: ctUrl, headers: { "content-type": "application/x-amz-json-1.1", "x-amz-target": "com.amazonaws.cloudtrail.v20131101.CloudTrail_20131101.DescribeTrails" }, body: ctBody }, creds, cfg.region, "cloudtrail", amzDateOf(c.now)) });
    const ctCall = (target: string, body: string) => c.net(ctUrl, { method: "POST", body, headers: sigV4({ method: "POST", url: ctUrl, headers: { "content-type": "application/x-amz-json-1.1", "x-amz-target": `com.amazonaws.cloudtrail.v20131101.CloudTrail_20131101.${target}` }, body }, creds, cfg.region, "cloudtrail", amzDateOf(c.now)) });
    if (ct.status === 200) {
      const multi = (json<{ trailList?: { IsMultiRegionTrail?: boolean; TrailARN?: string }[] }>(ct).trailList ?? []).filter((t) => t.IsMultiRegionTrail && t.TrailARN);
      let logging = false; let unread = false;
      for (const t of multi.slice(0, 5)) { const st = await ctCall("GetTrailStatus", JSON.stringify({ Name: t.TrailARN })); if (st.status !== 200) { unread = true; continue; } if (json<{ IsLogging?: boolean }>(st).IsLogging) { logging = true; break; } }
      checks.push(!logging && unread ? unknown("aws-cloudtrail", "AWS CloudTrail records every region", "A multi-region CloudTrail trail exists and is logging.", "The trail's status could not be read (cloudtrail:GetTrailStatus).")
        : check("aws-cloudtrail", "AWS CloudTrail records every region", "A multi-region CloudTrail trail exists and is logging.", logging ? [] : [`account ${account}: ${multi.length ? "the multi-region trail is not logging" : "no multi-region trail"}`], logging, logging ? "A multi-region trail is logging." : multi.length ? "The multi-region trail is stopped." : "No multi-region trail."));
    } else checks.push(unknown("aws-cloudtrail", "AWS CloudTrail records every region", "A multi-region CloudTrail trail exists and is logging.", "Trails could not be read (cloudtrail:DescribeTrails)."));
    const s3Url = `https://${account}.s3-control.${cfg.region}.amazonaws.com/v20180820/configuration/publicAccessBlock`;
    const s3 = await c.net(s3Url, { headers: sigV4({ method: "GET", url: s3Url, headers: { "x-amz-account-id": account, "x-amz-content-sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" }, body: "" }, creds, cfg.region, "s3", amzDateOf(c.now)) });
    if (s3.status === 200 || s3.status === 404) {
      const all = s3.status === 200 && ["BlockPublicAcls", "IgnorePublicAcls", "BlockPublicPolicy", "RestrictPublicBuckets"].every((k) => xmlTag(s3.text, k) === "true");
      checks.push(check("aws-s3-public", "AWS account blocks public S3 access", "All four S3 Block Public Access settings are on for the account.", all ? [] : [`account ${account}: public access not fully blocked`], all, all ? "All four settings on." : "Not all four settings are on."));
    } else checks.push(unknown("aws-s3-public", "AWS account blocks public S3 access", "All four S3 Block Public Access settings are on for the account.", "The account's S3 settings could not be read (s3:GetAccountPublicAccessBlock)."));
    return { label: `AWS account ${account}`, checks, accounts, apps: [], counts: { "IAM users": accounts.length } };
  },
};

/* ---------------- Okta (service app, private-key JWT) ---------------- */
const OKTA_SCOPES = "okta.users.read okta.apps.read okta.roles.read";
async function oktaToken(c: Ctx, cfg: Config) {
  const url = `https://${cfg.domain}/oauth2/v1/token`;
  const assertion = jwtRS256({ iss: cfg.clientId, sub: cfg.clientId, aud: url, iat: Math.floor(c.now / 1000), exp: Math.floor(c.now / 1000) + 300, jti: `${c.now}-${Math.random().toString(36).slice(2)}` }, c.secret(cfg.privateKey), cfg.kid);
  const r = await c.net(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: new URLSearchParams({ grant_type: "client_credentials", scope: OKTA_SCOPES, client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer", client_assertion: assertion }).toString() });
  if (r.status === 400 && /dpop/i.test(r.text)) throw new ProviderError("Okta requires DPoP for this app. Turn off \"Require Demonstrating Proof of Possession\" in the app's settings, then try again.", 400);
  if (r.status !== 200) failed("Getting an Okta token", r);
  return json<{ access_token: string }>(r).access_token;
}
const okta: Provider = {
  id: "okta", name: "Okta", type: "Identity provider", scope: "Read users, their enrolled factors, administrator roles and applications",
  fields: [
    { key: "domain", label: "Okta domain", help: "Your Okta organisation's domain (Okta-hosted domains only).", pattern: /^[a-z0-9][a-z0-9-]{1,62}\.(okta|oktapreview|okta-emea|okta-gov)\.com$/, example: "acme.okta.com" },
    { key: "clientId", label: "Client id", help: "The client id of the API service app you created for Selvara.", pattern: /^[A-Za-z0-9_-]{10,64}$/, example: "0oa1b2c3d4e5f6g7h8" },
  ],
  ready: () => null,
  instructions: (_env, cfg) => [
    "In the Okta admin console, create an API Services app for Selvara (Applications, Create App Integration, API Services).",
    "Client authentication: Public key / Private key. Add this public key (JSON): " + (cfg.jwk ?? "(shown after you start)"),
    `Grant only these Okta API scopes: ${OKTA_SCOPES.split(" ").join(", ")}. If the app asks for DPoP, turn "Require Demonstrating Proof of Possession" off for this app.`,
    "Assign the app the Read-Only Administrator role (Admin roles), then enter your Okta domain and the app's client id below.",
  ],
  bindKey: (cfg) => `okta:${cfg.domain}`,
  async test(c, cfg) { await oktaToken(c, cfg); return `Okta ${cfg.domain}`; },
  async sync(c, cfg) {
    const H = { authorization: `Bearer ${await oktaToken(c, cfg)}`, accept: "application/json" }; const base = `https://${cfg.domain}/api/v1`;
    const users = await paged<{ id: string; status: string; lastLogin: string | null; profile: { email: string; firstName?: string; lastName?: string } }>(c.net, `${base}/users?limit=200`, H, 25);
    const adminIds = new Set<string>(); let next: string | null = `${base}/iam/assignees/users?limit=200`;
    for (let i = 0; next && i < 10; i++) { // follows _links.next on the same host
      const r = await c.net(next, { headers: H }); if (r.status !== 200) break;
      const j = json<{ value?: { id: string }[]; _links?: { next?: { href?: string } } }>(r); for (const x of j.value ?? []) adminIds.add(x.id);
      const href = j._links?.next?.href; next = href && new URL(href).host === cfg.domain ? href : null;
    }
    const ACTIVE = ["ACTIVE", "PASSWORD_EXPIRED", "LOCKED_OUT", "RECOVERY"];
    const active = users.filter((u) => ACTIVE.includes(u.status));
    const factors = new Map<string, boolean>(); let mfaKnown = true;
    for (let i = 0; i < Math.min(active.length, 300); i += 10) {
      await Promise.all(active.slice(i, i + 10).map(async (u) => {
        const r = await c.net(`${base}/users/${u.id}/factors`, { headers: H });
        if (r.status !== 200) { mfaKnown = false; return; }
        factors.set(u.id, json<{ status: string }[]>(r).some((f) => f.status === "ACTIVE"));
      }));
    }
    const accounts: Account[] = users.map((u) => ({ key: u.id, name: [u.profile.firstName, u.profile.lastName].filter(Boolean).join(" ") || u.profile.email, email: (u.profile.email ?? "").toLowerCase(), status: u.status === "DEPROVISIONED" ? "Deprovisioned" : ACTIVE.includes(u.status) ? "Active" : "Suspended" /* STAGED and PROVISIONED cannot sign in yet */, mfa: factors.has(u.id) ? factors.get(u.id)! : null, admin: adminIds.has(u.id), lastLogin: day(u.lastLogin) }));
    const checks = identityChecks("okta", "Okta", accounts, c.now, mfaKnown && factors.size > 0)
      .map((ch) => (ch.key === "okta-inactive" ? partial(ch, !!users.truncated, "account") : partial(ch, active.length > 300 || !!users.truncated, "account's MFA")));
    const apps = (await paged<{ label: string; status: string }>(c.net, `${base}/apps?limit=200`, H, 5)).filter((a) => a.status === "ACTIVE").map((a) => ({ name: a.label, users: null }));
    return { label: `Okta ${cfg.domain}`, checks, accounts, apps, counts: { users: users.length, applications: apps.length } };
  },
};

/* ---------------- Microsoft Entra ID (Selvara's multi-tenant app, admin consent) ---------------- */
const GRAPH = "https://graph.microsoft.com/v1.0";
async function entraToken(c: Ctx, cfg: Config) {
  const r = await c.net(`https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "client_credentials", client_id: c.env.entra!.clientId, client_secret: c.env.entra!.clientSecret, scope: "https://graph.microsoft.com/.default" }).toString() });
  if (r.status !== 200) failed("Getting a Microsoft Graph token (has a Global Administrator granted consent?)", r);
  return json<{ access_token: string }>(r).access_token;
}
async function graphAll<T>(c: Ctx, url: string, H: Record<string, string>, max = 20): Promise<T[] | null> {
  const out: T[] = []; let next: string | null = url;
  for (let i = 0; next && i < max; i++) {
    const r = await c.net(next, { headers: H }); if (r.status === 403) return null; if (r.status !== 200) failed("Reading from Microsoft Graph", r);
    const j = json<{ value: T[]; "@odata.nextLink"?: string }>(r); out.push(...j.value);
    next = j["@odata.nextLink"]?.startsWith(GRAPH) ? j["@odata.nextLink"] : null;
  }
  return out;
}
const MICROSOFT_TENANT = "f8cdef31-a31e-4b4a-93e4-5f571e91255a"; // owner of Microsoft's own first-party apps (not discovered as shadow AI)
const entra: Provider = {
  id: "entra", name: "Microsoft Entra ID", type: "Identity provider", scope: "Read users, MFA registration, directory role holders, enterprise applications and Conditional Access policies",
  fields: [],
  ready: (env) => (env.entra ? null : NOT_AVAILABLE),
  instructions: (env, cfg, site) => [
    "Select Sign in with Microsoft below as a person in your organisation's tenant. Selvara takes the tenant from Microsoft's answer, so nobody can connect another organisation's tenant.",
    cfg.tenantId ? `A Global Administrator then grants Selvara's app read-only access: https://login.microsoftonline.com/${cfg.tenantId}/adminconsent?client_id=${env.entra?.clientId ?? "<app>"}&redirect_uri=${encodeURIComponent(callbackOf(site))}` : "After signing in, a Global Administrator grants Selvara's app read-only access (the link appears here).",
    "The app asks for these application permissions only: User.Read.All, AuditLog.Read.All (MFA registration details), RoleManagement.Read.Directory, Application.Read.All, Policy.Read.All. It cannot change anything. MFA registration details need Microsoft Entra ID P1 or P2.",
  ],
  bindKey: (cfg) => `entra:${String(cfg.tenantId).toLowerCase()}`,
  verify: {
    label: "Sign in with Microsoft",
    url: (env, site, state) => `https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize?client_id=${encodeURIComponent(env.entra!.clientId)}&response_type=code&response_mode=query&scope=openid%20profile&prompt=select_account&redirect_uri=${encodeURIComponent(callbackOf(site))}&state=${encodeURIComponent(state)}`,
    async check(c, code, site) {
      const e = c.env.entra!;
      const r = await c.net("https://login.microsoftonline.com/organizations/oauth2/v2.0/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: callbackOf(site), client_id: e.clientId, client_secret: e.clientSecret, scope: "openid profile" }).toString() });
      if (r.status !== 200) failed("Signing in with Microsoft", r);
      const tid = String(claims(json<{ id_token?: string }>(r).id_token ?? "").tid ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(tid) || tid === "9188040d-6c67-4c5b-b112-36a304b66dad") throw new ProviderError("Sign in with a work account of your organisation, not a personal Microsoft account.");
      return { config: { tenantId: tid.toLowerCase() } };
    },
  },
  async test(c, cfg) {
    const H = { authorization: `Bearer ${await entraToken(c, cfg)}`, accept: "application/json" };
    const r = await c.net(`${GRAPH}/users?$top=1&$select=id`, { headers: H }); if (r.status !== 200) failed("Reading users (has a Global Administrator granted consent?)", r);
    return `Entra tenant ${cfg.tenantId}`;
  },
  async sync(c, cfg) {
    const H = { authorization: `Bearer ${await entraToken(c, cfg)}`, accept: "application/json" };
    const users = (await graphAll<{ id: string; displayName: string; mail: string | null; userPrincipalName: string; accountEnabled: boolean }>(c, `${GRAPH}/users?$select=id,displayName,mail,userPrincipalName,accountEnabled&$top=999`, H)) ?? failed("Reading users (User.Read.All)", { status: 403, headers: {}, text: "" });
    const reg = await graphAll<{ id: string; isMfaRegistered: boolean; isAdmin: boolean }>(c, `${GRAPH}/reports/authenticationMethods/userRegistrationDetails`, H);
    const roles = await graphAll<{ id: string }>(c, `${GRAPH}/directoryRoles?$select=id`, H);
    const admins = new Set<string>();
    for (const role of (roles ?? []).slice(0, 40)) for (const m of (await graphAll<{ id: string }>(c, `${GRAPH}/directoryRoles/${encodeURIComponent(role.id)}/members?$select=id`, H, 5)) ?? []) admins.add(m.id);
    const regBy = new Map((reg ?? []).map((x) => [x.id, x]));
    // a user missing from the registration report is unknown, not "no MFA"
    const accounts: Account[] = users.map((u) => ({ key: u.id, name: u.displayName, email: (u.mail ?? u.userPrincipalName ?? "").toLowerCase(), status: u.accountEnabled ? "Active" : "Suspended", mfa: regBy.has(u.id) ? regBy.get(u.id)!.isMfaRegistered : null, admin: admins.has(u.id) || !!regBy.get(u.id)?.isAdmin, lastLogin: null }));
    const missingReg = accounts.filter((a) => a.status === "Active" && a.mfa === null).length;
    const checks = identityChecks("entra", "Entra ID", accounts, c.now, !!reg).filter((x) => x.key !== "entra-inactive") // sign-in activity is not read (it needs more access)
      .map((ch) => (ch.key.endsWith("mfa") ? partial(ch, !!reg && missingReg > 0, "account's MFA registration") : ch));
    const ca = await graphAll<{ displayName: string; state: string; grantControls?: { builtInControls?: string[] } | null }>(c, `${GRAPH}/identity/conditionalAccess/policies`, H);
    const caMfa = (ca ?? []).filter((p) => p.state === "enabled" && (p.grantControls?.builtInControls ?? []).includes("mfa")).length;
    checks.push(ca === null ? unknown("entra-ca-mfa", "A Conditional Access policy requires MFA", "At least one enabled Conditional Access policy requires multifactor authentication.", "Conditional Access policies could not be read (Policy.Read.All).")
      : check("entra-ca-mfa", "A Conditional Access policy requires MFA", "At least one enabled Conditional Access policy requires multifactor authentication.", caMfa ? [] : ["no enabled policy requires MFA"], caMfa > 0, `${caMfa} enabled policies require MFA.`));
    const sps = (await graphAll<{ displayName: string; servicePrincipalType?: string; appOwnerOrganizationId?: string }>(c, `${GRAPH}/servicePrincipals?$select=displayName,servicePrincipalType,appOwnerOrganizationId&$top=999`, H, 5)) ?? [];
    const third = sps.filter((s) => s.servicePrincipalType === "Application" && s.appOwnerOrganizationId !== MICROSOFT_TENANT);
    return { label: `Entra tenant ${cfg.tenantId}`, checks, accounts, apps: third.map((s) => ({ name: s.displayName, users: null })), counts: { users: users.length, applications: third.length } };
  },
};

/* ---------------- Google Workspace (Selvara's service account, domain-wide delegation) ---------------- */
export const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/admin.directory.user.readonly", "https://www.googleapis.com/auth/admin.reports.audit.readonly"];
async function googleToken(c: Ctx, cfg: Config) {
  const e = c.env.google!; const now = Math.floor(c.now / 1000);
  const assertion = jwtRS256({ iss: e.clientEmail, sub: cfg.adminEmail, scope: GOOGLE_SCOPES.join(" "), aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 600 }, e.privateKey);
  const r = await c.net("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString() });
  if (r.status !== 200) failed("Getting a Google token (is domain-wide delegation set up for Selvara's client id?)", r);
  return json<{ access_token: string }>(r).access_token;
}
const google: Provider = {
  id: "google", name: "Google Workspace", type: "Identity provider", scope: "Read users (2-Step Verification, admin, last sign-in) and which third-party apps people authorised",
  fields: [],
  ready: (env) => (env.google ? null : NOT_AVAILABLE),
  instructions: (env) => [
    "A super administrator opens the Google Admin console, Security, Access and data control, API controls, Manage domain-wide delegation, Add new.",
    `Client id: ${env.google?.clientId ?? "<Selvara's client id>"}. Scopes (exactly these): ${GOOGLE_SCOPES.join(", ")}.`,
    "Create an admin account for Selvara with a custom admin role that can only read users and reports.",
    "Select Sign in with Google below as that account. Selvara reads your domain only as the account that signed in, so nobody can connect another organisation's domain.",
  ],
  bindKey: (cfg) => `google:${String(cfg.adminEmail).split("@")[1]?.toLowerCase()}`,
  verify: {
    label: "Sign in with Google",
    url: (env, site, state) => `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(env.google!.oauthClientId)}&response_type=code&scope=openid%20email&prompt=select_account&redirect_uri=${encodeURIComponent(callbackOf(site))}&state=${encodeURIComponent(state)}`,
    async check(c, code, site) {
      const e = c.env.google!;
      const r = await c.net("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: callbackOf(site), client_id: e.oauthClientId, client_secret: e.oauthClientSecret }).toString() });
      if (r.status !== 200) failed("Signing in with Google", r);
      const k = claims(json<{ id_token?: string }>(r).id_token ?? "");
      const email = String(k.email ?? "").toLowerCase(); const hd = String(k.hd ?? "").toLowerCase();
      if (!email || k.email_verified !== true || !hd || !email.endsWith(`@${hd}`)) throw new ProviderError("Sign in with an account of your Google Workspace domain (not a personal Google account).");
      return { config: { adminEmail: email } };
    },
  },
  async test(c, cfg) {
    const H = { authorization: `Bearer ${await googleToken(c, cfg)}` };
    const r = await c.net("https://admin.googleapis.com/admin/directory/v1/users?customer=my_customer&maxResults=1", { headers: H }); if (r.status !== 200) failed("Reading users", r);
    return `Google Workspace ${cfg.adminEmail.split("@")[1]}`;
  },
  async sync(c, cfg) {
    const H = { authorization: `Bearer ${await googleToken(c, cfg)}` };
    const users: { primaryEmail: string; name?: { fullName?: string }; suspended?: boolean; archived?: boolean; isEnrolledIn2Sv?: boolean; isAdmin?: boolean; isDelegatedAdmin?: boolean; lastLoginTime?: string }[] = [];
    let token = ""; for (let i = 0; i < 20; i++) {
      const r = await c.net(`https://admin.googleapis.com/admin/directory/v1/users?customer=my_customer&maxResults=500${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`, { headers: H });
      if (r.status !== 200) failed("Reading users", r);
      const j = json<{ users?: typeof users; nextPageToken?: string }>(r); users.push(...(j.users ?? [])); token = j.nextPageToken ?? ""; if (!token) break;
    }
    const accounts: Account[] = users.map((u) => ({ key: u.primaryEmail.toLowerCase(), name: u.name?.fullName ?? u.primaryEmail, email: u.primaryEmail.toLowerCase(), status: u.archived ? "Deprovisioned" : u.suspended ? "Suspended" : "Active", mfa: !!u.isEnrolledIn2Sv, admin: !!u.isAdmin || !!u.isDelegatedAdmin, lastLogin: u.lastLoginTime && !u.lastLoginTime.startsWith("1970") ? day(u.lastLoginTime) : null }));
    const checks = identityChecks("google", "Google Workspace", accounts, c.now, true);
    // third-party apps people authorised in the last 30 days (names and how many people, nothing else)
    const since = new Date(c.now - 30 * DAY).toISOString(); const per = new Map<string, Set<string>>();
    const rep = await c.net(`https://admin.googleapis.com/admin/reports/v1/activity/users/all/applications/token?eventName=authorize&maxResults=1000&startTime=${encodeURIComponent(since)}`, { headers: H });
    if (rep.status === 200) for (const it of json<{ items?: { actor?: { email?: string }; events?: { parameters?: { name: string; value?: string }[] }[] }[] }>(rep).items ?? []) {
      const app = it.events?.[0]?.parameters?.find((p) => p.name === "app_name")?.value; if (app) { const s = per.get(app) ?? new Set(); s.add(it.actor?.email ?? ""); per.set(app, s); }
    }
    return { label: `Google Workspace ${cfg.adminEmail.split("@")[1]}`, checks, accounts, apps: [...per].map(([name, s]) => ({ name, users: s.size })), counts: { users: users.length, "authorised apps": per.size } };
  },
};

export const PROVIDERS: Provider[] = [github, aws, okta, entra, google];
export const providerOf = (id: string) => PROVIDERS.find((p) => p.id === id) ?? null;
/** Platform credentials from the server's environment (Vercel variables, set by the owner). */
export function integrationEnv(e: Record<string, string | undefined>): IntegrationEnv {
  return {
    github: e.GITHUB_APP_ID && e.GITHUB_APP_PRIVATE_KEY && e.GITHUB_APP_SLUG && e.GITHUB_APP_CLIENT_ID && e.GITHUB_APP_CLIENT_SECRET ? { appId: e.GITHUB_APP_ID, privateKey: e.GITHUB_APP_PRIVATE_KEY, slug: e.GITHUB_APP_SLUG, clientId: e.GITHUB_APP_CLIENT_ID, clientSecret: e.GITHUB_APP_CLIENT_SECRET } : undefined,
    aws: e.AWS_INTEGRATION_ACCESS_KEY_ID && e.AWS_INTEGRATION_SECRET_ACCESS_KEY && e.AWS_INTEGRATION_PRINCIPAL_ARN ? { accessKeyId: e.AWS_INTEGRATION_ACCESS_KEY_ID, secretAccessKey: e.AWS_INTEGRATION_SECRET_ACCESS_KEY, principalArn: e.AWS_INTEGRATION_PRINCIPAL_ARN } : undefined,
    entra: e.ENTRA_CLIENT_ID && e.ENTRA_CLIENT_SECRET ? { clientId: e.ENTRA_CLIENT_ID, clientSecret: e.ENTRA_CLIENT_SECRET } : undefined,
    google: e.GOOGLE_SA_EMAIL && e.GOOGLE_SA_PRIVATE_KEY && e.GOOGLE_SA_CLIENT_ID && e.GOOGLE_OAUTH_CLIENT_ID && e.GOOGLE_OAUTH_CLIENT_SECRET ? { clientEmail: e.GOOGLE_SA_EMAIL, privateKey: e.GOOGLE_SA_PRIVATE_KEY, clientId: e.GOOGLE_SA_CLIENT_ID, oauthClientId: e.GOOGLE_OAUTH_CLIENT_ID, oauthClientSecret: e.GOOGLE_OAUTH_CLIENT_SECRET } : undefined,
  };
}
