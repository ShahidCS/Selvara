# ADR-006: Identity: Supabase Auth, per-tenant SAML/OIDC, SCIM 2.0 built in Selvara

| | |
|---|---|
| Status | **Proposed** |
| Date | 2026-11-23 |
| Workstream | 2E (detail in `2E-iam.md` E-10..E-28, E-50..E-58) |
| Related | ADR-001 (schema per tenant), ADR-002 (router), ADR-010 (control plane), ADR-014 (custom roles); spine S2, S3, S5 |

## Context

- The owner keeps Supabase Auth (Q-15) and needs customer SSO (SAML and OIDC) and SCIM (Q-14). Today: Supabase Auth for password and TOTP; Selvara-held passkeys (platform staff), recovery codes and server sessions (`__Host-sv`), with one active company per session (D1). No SSO or SCIM.
- Spine S3 requires the tenant to come from a server-side session record verified before routing.
- Supabase facts relevant here, all **to verify** (direct documentation access was blocked during this phase): SAML 2.0 SSO is available on paid plans (sources disagree whether Pro or Team), providers added through the CLI/management interface; custom OIDC providers are project-wide and reported as limited to about 3 per project; MFA factors are TOTP and phone, without recovery codes; WebAuthn MFA status unconfirmed; revoked sessions' access tokens stay valid until expiry.
- Regulated buyers (banks, health) expect enforced SSO, JIT and SCIM deprovisioning, and phishing-resistant MFA for administrators.

## Options considered

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Supabase Auth only: Supabase sessions as app sessions; SAML via Supabase; OIDC via Supabase custom providers; no SCIM | Least code | OIDC per tenant does not scale (project-wide providers, small limit); tenant binding not in Supabase session; revocation lag of access tokens; no recovery codes; SCIM missing (requirement unmet) |
| B (recommended) | Supabase Auth as **credential verifier** (password, TOTP, SAML); Selvara **server session** bound to tenant; Selvara-built **OIDC relying party** per tenant; Selvara-built **SCIM 2.0** server; Selvara passkeys and recovery codes | Keeps Supabase Auth (owner); tenant binding and immediate revocation in one server record; unlimited per-tenant OIDC; SCIM semantics fit memberships and four-eyes; continues v0.2.5 design | Selvara owns more security-critical code (OIDC RP, SCIM, WebAuthn): needs careful libraries, tests and pen-testing; two identity stores to keep linked |
| C | External identity broker (managed SSO/SCIM vendor or self-hosted IdP) in front of Supabase Auth | Mature SAML/OIDC/SCIM; less own code | New subprocessor holding identity data; cost per connection; another failure domain; Supabase Auth reduced to a user table; conflicts with "keep Supabase Auth" intent |
| D | Replace Supabase Auth with a self-hosted or managed IdP | One full-featured identity system | Contradicts Q-15; migration of existing auth code; larger operational burden for a team of two |

## Decision

Option **B**.

1. Supabase Auth verifies passwords, TOTP and SAML assertions; Selvara issues an opaque server session recorded in `control.sessions` (tenant, membership, role, auth method, AAL, step-up, elevation) and checks it on every request (E-10, E-20..E-23). Sessions, memberships and tenant status are never cached; only static routing fields are cached, ≤30 s (R2-01). The tenant-facing `app` deployment resolves sessions through `cp_tenant_api` functions and holds no `cp_rw` grant (R2-03). Supabase tokens never reach the browser. (rev P3)
2. SAML per tenant through Supabase SSO providers (SP-initiated only, signed assertions). OIDC per tenant with Selvara as relying party (code + PKCE + nonce), linking to the same Supabase user id.
3. A connection authenticates only emails in that tenant's verified domains (DNS TXT). Enforcement modes off / domain / all, with up to two exempt break-glass admins.
4. JIT provisioning off by default; never to a privileged role without four-eyes. "Privileged role" has one definition (DA-08, E-33d): `admin`, `owner`, and any custom role holding any admin-only permission; `analyst` is not privileged. (rev P3)
5. SCIM 2.0 (`/scim/v2`, RFC 7643/7644) built in Selvara with per-tenant hashed tokens (four-eyes to create); deprovisioning suspends the membership and revokes sessions immediately; deletion removes the membership and, if no other membership exists, the identity. SCIM assigns only non-privileged roles; a privileged assignment needs in-app four-eyes (`team.role`, DA-08). SCIM cannot remove the last two Active admins, and admin or bulk deactivations are held for review (E-55). (rev P3)
6. Identity ownership (`home_tenant_id`) limits what one tenant can do to a person who also belongs to other tenants.
7. Passkeys mandatory for platform staff and required again at elevation start.

**Fallback:** if Supabase SAML is unavailable on the chosen plan or limits the number of providers below the tenant forecast, Selvara implements the SAML SP itself (same pattern as OIDC), keeping Supabase Auth for passwords and TOTP. If that is judged too risky, Option C is the fallback with a recorded subprocessor review.

## Consequences

- New control-plane tables: `sessions`, `passkeys`, `recovery_codes`, `invitations`, `join_requests`, `sso_connections` (+ domains), `scim_tokens`; column `identities.home_tenant_id` (spine deviation SD-E1/SD-E3).
- Spine S3 step 1 is read as "the Selvara session bound to the Supabase user id" (SD-E2).
- New endpoints: `/api/v1/account/sso/*`, `/api/v1/settings/sso*`, `/scim/v2/*` (2C).
- New jobs: domain re-verification, SSO certificate expiry, SCIM side-effects propagation (D-79, D-80).
- Front end: SSO discovery on the sign-in screen; Single sign-on tab in Team; tenant-switch prompts when a target tenant enforces SSO.

## Security and privacy implications

- Positive: immediate revocation; tenant binding cannot be influenced by the client; enforced SSO and SCIM deprovisioning close leaver gaps; passkeys at elevation.
- Risks: own OIDC RP and SCIM code (mitigated by vetted libraries, conformance tests and pen-test scope); cross-tenant effects of a shared identity (R-36, mitigated by verified-domain binding and identity ownership); IdP MFA trust (default Selvara second factor unless the IdP asserts MFA).
- Personal data: identities (email, name) stay in the control plane (A-05, legal review pending); `control.identities.email` is E1 under the platform KEK with an HMAC blind index for lookup (DA-05, rev P3); SCIM attributes limited to name, email, department, manager; group names stored only as mapping keys; SAML/OIDC raw assertions are never stored (only issuer, subject, timestamp, assertion id hash for replay prevention, 24 h).
- Logging: tokens, assertions and SCIM bearer values are redacted from logs.

## Verification (Phase 4)

| ID | Check |
|---|---|
| V-006-1 | Test: a session for tenant A, with any header or body naming tenant B, only ever reaches `t_<A>` (router assertion E-23). |
| V-006-2 | Test: revoking a session (sign-out, SCIM `active=false`, membership removal, tenant suspension) fails the next request, with the routing cache warm (no session, membership or tenant-status cache, R2-01) (rev P3). |
| V-006-3 | SAML: unsigned assertion, wrong audience, replayed assertion id, IdP-initiated response: all refused. OIDC: wrong `nonce`, `aud`, `iss`, expired token, unverified email outside verified domains: all refused. |
| V-006-4 | A connection asserting an email outside its verified domains is refused. |
| V-006-5 | SCIM conformance suite (RFC 7644 behaviours used) passes; group mapping to a privileged role (E-33d) creates an approval, not a role; mapping to `analyst` applies directly (DA-08) (rev P3). |
| V-006-6 | Tenant switch to an SSO-enforced tenant from a password session returns `sso_required`; session id rotates on switch. |
| V-006-7 | Platform elevation without a fresh passkey assertion is refused. |
| V-006-8 | Documentation check closes A-40/A-41 (Supabase SAML plan and limits, MFA factors, recovery codes). |
