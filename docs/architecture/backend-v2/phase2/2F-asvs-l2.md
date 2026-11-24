# Phase 2F annex: OWASP ASVS 4.0.3 Level 2, requirement by requirement (rev P4)

| | |
|---|---|
| Status | DRAFT (rev P4, 2026-11-24). This maps design to requirements. It is not a certification or a test result. Closes P4-A2-01; records the baseline decision for P4-A2-02. |
| Parent | [`2F-security.md`](2F-security.md) F-14 (the per-chapter counts there come from this file) |
| Baseline | OWASP ASVS **4.0.3**, Level 2 (every L1 and L2 requirement in chapters V1 to V14; L3-only requirements are left out). Requirement IDs and wording are from the 4.0.3 numbering as recalled in this design session, which could not reach owasp.org. Rows marked *(verify)* need their wording or level checked against the published standard before the Phase 5 gate (OD-14). |
| ASVS 5.0 | ASVS 5.0.0 (May 2025) renumbers and changes the requirements. Decision (rev P4, P4-A2-02): 4.0.3 stays the baseline for the V2 design and the V2-R6 penetration test because the pen-test market and this mapping both use it. A full re-mapping to 5.0 is planned for **2027-06-30** *(owner to confirm the date under OD-13)*, before the first yearly pen test after GA (F-SD-10). Note: the v0.2.x `docs/security/CONTROLS.md` already cites 5.0 numbers (for example "ASVS 6.3.8"), so the re-mapping must reconcile both. |
| Owners | R-A Management Approver, R-B CISO |

## How to read this

- **Met by design**: the design names a control that satisfies the requirement and a test or check that proves it. It still has to be built in the target release. A row is never "Met" when the design itself lists an open item for it, which was the error P4-A2-01 found in the old F-14.
- **Partial**: the design covers part of the requirement, or relies on an unverified vendor fact, or has an open finding against it. The remediation column gives a tracking ID `AG-nn` (ASVS gap register, section 3 below), an action, an owner and a target release.
- **Gap**: not designed. Same tracking as Partial.
- **N/A**: the requirement cannot apply (for example SOAP, GraphQL disabled, no native code), or 4.0.3 marks it deleted.
- A chapter is reported as Met only when every one of its L1 and L2 requirements is Met by design or N/A (section 2).
- Design references: 2F item IDs (F-*), 2E (E-*), 2C (C-*), retained v0.2.x controls kept by F-13 (AUTH-, SESS-, ACC-, DATA-, LOG-, HDR-, PIPE- in `docs/security/CONTROLS.md`), ADRs, and other workstream IDs where they hold the control.
- Target releases are the 2K releases V2-R0 to V2-R6. For Met rows the target is the release that builds the control.

## 1. Requirement matrix

### V1 Architecture, design and threat modelling

| Req ID | Short requirement | Status | Design reference | Remediation | Owner | Target |
|---|---|---|---|---|---|---|
| 1.1.1 | Secure SDLC covers every stage | Met by design | F-15, F-SD-01 to F-SD-12, PIPE-01 to PIPE-09; technical reviewer at every gate (OD-12, K-M06) | — | R-B | V2-R0 |
| 1.1.2 | Threat modelling for every design change | Met by design | F-SD-05 (PR template: threat-model delta, data class of new columns); F-1 to F-3 kept current | — | R-B | V2-R0 |
| 1.1.3 | User stories carry functional security constraints | Partial | 2K K-4 Definition of Done | AG-01: every 2K work item lists the F, E and C item IDs it must meet as acceptance criteria | R-B | V2-R0 |
| 1.1.4 | Trust boundaries, components and data flows documented | Met by design | F-1.1, F-1.2 (F-TB-01 to F-TB-13), F-1 diagram, 2A | — | R-B | V2-R0 |
| 1.1.5 | High-level architecture and remote services analysed | Met by design | 2A; F-2 STRIDE per component incl. F-2.14 SIEM and F-2.15 supply chain (rev P4) | — | R-B | V2-R0 |
| 1.1.6 | Central, simple, vetted security controls | Met by design | One router (F-ISO-04), one `can()` (E-35), `KeyProvider` (ADR-003), `storagebroker` (F-ISO-42), one audit append function (F-L-05) | — | R-B | V2-R0 |
| 1.1.7 | Secure coding checklist available to developers | Partial | AGENTS.md conventions; CONTROLS.md; SOD_MATRIX.md | AG-02: write a v2 server secure-coding checklist (router-only SQL, bound values, `can()` on every route, audit in the same transaction, no values in logs, Storage only through `storagebroker`) and link it from AGENTS.md | R-B | V2-R0 |
| 1.2.1 | Separate low-privilege accounts per component | Met by design | F-ISO-10 to F-ISO-13, F-CP-02, `ks` function roles (F-ISO-41), scanner without DB or KMS rights (F-T-061) | — | R-B | V2-R0 |
| 1.2.2 | Communications between components authenticated | Met by design | F-1.2 F-TB-02 to F-TB-12; F-6 | — | R-B | V2-R0 |
| 1.2.3 | One vetted authentication mechanism | Met by design | E-10 (Supabase Auth verifies; Selvara session), ADR-006 | — | R-B | V2-R1 |
| 1.2.4 | All authentication paths of consistent strength | Partial | E-11a to E-11f, E-53b (SSO requires an MFA indication), E-15i visitor sessions | AG-03: visitor sessions (Trust Center, vendor portal) rest on an emailed link and code only; record this as an accepted deviation limited to one assessment or NDA scope, or require the member-variant vendor with MFA for vendors rated Critical | R-A | V2-R3 |
| 1.4.1 | Access control enforced at trusted points, never on the client | Met by design | E-35, ACC-02, C §1.8; router (F-4.1) | — | R-B | V2-R1 |
| 1.4.2 | *(deleted in 4.0.3, not actionable)* *(verify)* | N/A | — | — | — | — |
| 1.4.3 | *(deleted in 4.0.3, duplicate of 4.1.3)* *(verify)* | N/A | — | — | — | — |
| 1.4.4 | Single, well-vetted access-control mechanism | Met by design | `can()` with object rules (E-35, C §1.8) over role-per-tenant routing and RLS (ADR-002) | — | R-B | V2-R1 |
| 1.4.5 | Attribute- or feature-based access control | Met by design | Permission catalogue E-30, object rules OBJ-OWN, OBJ-AUD, OBJ-VEN, OBJ-KEY (C §1.8) | — | R-B | V2-R1 |
| 1.5.1 | Input and output handling defined by type, content and law | Partial | 2C §1 conventions, 2B classification (E0/E1/E2, F-D-12) | AG-04 (machine-readable schemas) and AG-24 (`auth.*` classification) | R-B | V2-R1 |
| 1.5.2 | No serialisation with untrusted clients | Met by design | JSON only (2C §1); cursors and tokens are HMAC-signed opaque strings (C-31, F-K-08) | — | R-B | V2-R1 |
| 1.5.3 | Input validation on a trusted service layer | Met by design | Server-side schema validation per route (2C §1, C-32) | — | R-B | V2-R1 |
| 1.5.4 | Output encoding close to the interpreter | Met by design | DATA-01 (React text only), bound SQL values (F-ISO-06(3)), CSV formula neutralisation (DATA-04) | — | R-B | V2-R2 |
| 1.6.1 | Key management policy and lifecycle | Met by design | F-7 (F-K-01 to F-K-33, F-K-R1 to F-K-R5), ADR-003, KS-SNAP (F-7.5) | — | R-B | V2-R0 |
| 1.6.2 | Key material protected through vaults or KMS APIs | Met by design | KMS in `kms-prod`, secrets manager (F-11), `ks` (F-D-05) | — | R-B | V2-R0 |
| 1.6.3 | Keys and passwords replaceable, with re-encryption | Met by design | Rotation column of F-7.1; F-11 rotation; DEK re-encryption job (F-K-02) | — | R-B | V2-R0 |
| 1.6.4 | Client-side secrets treated as insecure | Met by design | No secrets in the browser (DATA-07); no secrets in Vercel env vars (F-D-02, F-11 rules) | — | R-B | V2-R0 |
| 1.7.1 | Common logging format | Met by design | LOG-04 structured lines; F-L-02 audit entry fields; F-ISO-34 | — | R-B | V2-R0 |
| 1.7.2 | Logs sent securely to a remote system | Met by design | F-12 sources to the SIEM; F-L-08 | — | R-B | V2-R0 |
| 1.8.1 | Sensitive data identified and classified | Partial | 2B classification, F-D-12 | AG-24: classify `auth.*` (P4-A3-01) and the E0 personal fields (P4-A3-04) | R-B | V2-R1 |
| 1.8.2 | Each protection level has protection requirements | Met by design | E0/E1/E2 rules (F-D-12, F-K-R1 to F-K-R4), retention classes (2G) | — | R-B | V2-R0 |
| 1.9.1 | Encrypted communication between components | Met by design | F-6 F-TLS-01 to F-TLS-06 | — | R-B | V2-R0 |
| 1.9.2 | Each side of a link authenticated | Met by design | `verify-full` with pinned CA (F-TLS-02); signed scanner jobs and verdicts (F-TB-06); webhook signatures (C-86) | — | R-B | V2-R0 |
| 1.10.1 | Source control with check-in procedures, identifiable users | Met by design | PIPE-07 (protected `main`, PRs only, signed commits), PIPE-06, CODEOWNERS (F-SD-04) | — | R-B | V2-R0 |
| 1.11.1 | Components documented by business or security function | Met by design | F-1.1 component table, 2A | — | R-B | V2-R0 |
| 1.11.2 | High-value flows share no unsynchronised state | Met by design | Session, membership and status read on every request (R2-01, F-ISO-01); approval votes serialised (D-24); chain head locked (F-L-04) | — | R-B | V2-R1 |
| 1.12.1 | *(deleted in 4.0.3, duplicate of 12.4.1)* *(verify)* | N/A | — | — | — | — |
| 1.12.2 | Uploaded files served as attachments or from an unrelated origin | Met by design | F-D-07 cookieless `files.<domain>`, F-U-06 | — | R-B | V2-R2 |
| 1.14.1 | Components of different trust levels segregated | Met by design | Separate accounts and projects (F-D-01, F-D-03, F-CP-01), cells, `ks` project | — | R-B | V2-R0 |
| 1.14.2 | Signed binaries and trusted deployment | Partial | PIPE-06 signed tags, PIPE-08 shipped-artifact check | AG-05: turn on build-provenance attestation (F-SD-09, EX-09) before GA | R-B | V2-R6 |
| 1.14.3 | Pipeline warns of outdated or insecure components | Met by design | PIPE-03 (dependency audit, OSV, dependency review), Dependabot | — | R-B | V2-R0 |
| 1.14.4 | Pipeline builds and verifies secure deployment (infrastructure as code) | Partial | F-SD-08 (settings as code, scheduled probe); 2H `infra.yml` | AG-06: make the settings-as-code probe and the Terraform policy check blocking (P4-A2-22) | R-B | V2-R0 |
| 1.14.5 | Deployments sandboxed or network-isolated | Partial | F-PL-03 network restrictions *(verify static egress)*; separate projects | AG-07: decide DU-34 (static IPs and database network allow-list for `cp` and cells, P4-A1-14) | R-A | V2-R0 |
| 1.14.6 | No deprecated client technologies | Met by design | React SPA only; no plugins | — | R-B | V2-R1 |

### V2 Authentication

| Req ID | Short requirement | Status | Design reference | Remediation | Owner | Target |
|---|---|---|---|---|---|---|
| 2.1.1 | Passwords at least 12 characters | Met by design | E-11a, AUTH-11 | — | R-B | V2-R1 |
| 2.1.2 | At least 64 characters allowed, more than 128 refused | Met by design | E-11a (12 to 128) | — | R-B | V2-R1 |
| 2.1.3 | No password truncation | Partial | E-11a; Supabase Auth stores the hash (E-10) | AG-08: Supabase Auth is believed to hash with bcrypt, which uses only the first 72 bytes *(verify, OD-14)*. Pre-hash the NFKC password with HMAC-SHA-256 under a pepper from the secrets manager and pass the base64 result to Supabase Auth, so no input byte is ignored | R-B | V2-R1 |
| 2.1.4 | Any printable Unicode allowed | Met by design | AUTH-11 (NFKC, no composition rules) | — | R-B | V2-R1 |
| 2.1.5 | Users can change their password | Met by design | AUTH-12, C-AC-11 | — | R-B | V2-R1 |
| 2.1.6 | Change needs current and new password | Met by design | AUTH-12 | — | R-B | V2-R1 |
| 2.1.7 | Breached-password check | Partial | E-11a, AUTH-11 ("k-anonymity range lookup in production", still an open item; the old F-V02 rated the chapter Met in spite of it) | AG-09: the `app` calls a k-anonymity range API server-side through the egress allow-list (H-NW-08); if it is unreachable, check a bundled list of the most common breached passwords instead; test both paths | R-B | V2-R1 |
| 2.1.8 | Password strength meter | Met by design | Existing advisory meter (`lib/credentials.ts`), kept (F-13) | — | R-B | V2-R1 |
| 2.1.9 | No composition rules | Met by design | E-11a | — | R-B | V2-R1 |
| 2.1.10 | No periodic rotation or history rules | Met by design | AUTH-11 (no expiry) | — | R-B | V2-R1 |
| 2.1.11 | Paste and password managers allowed | Met by design | Existing sign-in fields (`autoComplete` attributes), kept | — | R-B | V2-R1 |
| 2.1.12 | User can show the masked password | Met by design | Existing show/hide toggle (`AuthFields`), kept | — | R-B | V2-R1 |
| 2.2.1 | Anti-automation against stuffing, brute force and lockout abuse | Met by design | AUTH-02 to AUTH-06, C-58, F-T-005, F-M-11 | — | R-B | V2-R1 |
| 2.2.2 | Weak authenticators (SMS, email) only as secondary factor | Partial | E-11e (no SMS); visitor sessions use emailed codes (E-15i, F-T-093) | AG-03 | R-A | V2-R3 |
| 2.2.3 | Secure notification after authentication changes | Met by design | SESS-07, E-18, F-EV-01 | — | R-B | V2-R1 |
| 2.3.1 | System-generated codes random, short-lived, not long-term | Met by design | E-15h (ticket 5 min, OTP 10 min, reset 15 min, invitation 72 h), F-K-R5 | — | R-B | V2-R1 |
| 2.3.2 | FIDO/WebAuthn authenticators supported | Met by design | E-11c, AUTH-16 | — | R-B | V2-R1 |
| 2.3.3 | Renewal notice before time-bound authenticators expire | Partial | E-63 (API key expiry), E-57 (SCIM token expiry) | AG-11: email the owner and tenant admins 14 days and 1 day before an API key or SCIM token expires | R-B | V2-R5 |
| 2.4.1 | Passwords salted and hashed with an approved function | Partial | E-10 (Supabase Auth holds the hash) | AG-10: owner verifies the Supabase Auth algorithm and cost (OD-14); AG-08 makes the stored value depend on a secret pepper either way | R-B | V2-R1 |
| 2.4.2 | Salt of at least 32 bits | Met by design | bcrypt uses a 128-bit salt *(verify Supabase Auth, AG-10)* | — | R-B | V2-R1 |
| 2.4.3 | PBKDF2 iteration count | N/A | PBKDF2 not used | — | — | — |
| 2.4.4 | bcrypt work factor of at least 10 | Partial | E-10 | AG-10 | R-B | V2-R1 |
| 2.4.5 | Extra KDF iteration with a secret salt (pepper) | Gap | Recovery codes, API keys and SCIM tokens are peppered (E-57, E-61); passwords are not | AG-08 | R-B | V2-R1 |
| 2.5.1 | Activation or recovery secrets not sent in clear text | Met by design | Single-use, short-lived links only (E-15h, C-AC-12); no passwords ever sent | — | R-B | V2-R1 |
| 2.5.2 | No password hints or security questions | Met by design | E-18 | — | R-B | V2-R1 |
| 2.5.3 | Recovery never reveals the current password | Met by design | E-18, AUTH-13 | — | R-B | V2-R1 |
| 2.5.4 | No shared or default accounts | Met by design | Named identities only; demo accounts only in demo mode (AUTH-15); break-glass credentials are infrastructure accounts with a named custodian and a logged use (E-78) | — | R-B | V2-R1 |
| 2.5.5 | User notified when a factor changes | Met by design | SESS-07, E-18 | — | R-B | V2-R1 |
| 2.5.6 | Recovery uses a secure mechanism | Met by design | E-18 (reset link plus second factor) | — | R-B | V2-R1 |
| 2.5.7 | Lost factors need identity proofing | Met by design | E-18, four-eyes MFA reset with three identity checks (SOD_MATRIX §4, ACC-06) | — | R-B | V2-R1 |
| 2.6.1 | Look-up secrets single use | Met by design | E-11d | — | R-B | V2-R1 |
| 2.6.2 | Look-up secrets have enough entropy or are salted and hashed | Met by design | E-11d (salted hashes), F-K-R5 | — | R-B | V2-R1 |
| 2.6.3 | Look-up secrets not predictable | Met by design | F-K-R5 (WebCrypto CSPRNG) | — | R-B | V2-R1 |
| 2.7.1 | No clear-text out-of-band authenticator (SMS) by default | Met by design | E-11e | — | R-B | V2-R1 |
| 2.7.2 | Out-of-band code expires within 10 minutes | Met by design | E-15h (OTP 10 min) | — | R-B | V2-R3 |
| 2.7.3 | Out-of-band code single use, for the original request only | Met by design | E-15h; vendor session bound to the invite (F-T-093) | — | R-B | V2-R3 |
| 2.7.4 | Out-of-band channel secure and independent | Partial | Email via provider with TLS where the receiving server supports it (F-TLS-05) | AG-03 | R-A | V2-R3 |
| 2.7.5 | Verifier keeps only a hash of the code | Partial | Link tokens matched by hash (C-08); code storage not stated | AG-12: store emailed visitor codes only as HMAC-SHA-256 with the platform pepper; compare in constant time | R-B | V2-R3 |
| 2.7.6 | Code from a CSPRNG with at least 20 bits | Met by design | F-K-R5; six-digit codes *(verify D-06 wording)* | — | R-B | V2-R3 |
| 2.8.1 | Time-based OTP has a defined lifetime | Met by design | E-11b, AUTH-08 (30 s step) | — | R-B | V2-R1 |
| 2.8.2 | OTP seeds strongly protected | Partial | TOTP seeds held by Supabase Auth (E-10) | AG-14: owner verifies how Supabase Auth protects TOTP seeds (OD-14); fallback: Selvara verifies TOTP itself with seeds encrypted under the platform DEK in `cp` (F-K-31) | R-B | V2-R1 |
| 2.8.3 | Approved algorithms for OTP | Met by design | RFC 6238 (AUTH-08) | — | R-B | V2-R1 |
| 2.8.4 | TOTP usable once within its validity | Met by design | E-11b | — | R-B | V2-R1 |
| 2.8.5 | Reused TOTP logged, refused and notified | Partial | E-11b refuses reuse | AG-13: add event `mfa.code_reused` (F-EV-01) and an owner alert (SESS-07) | R-B | V2-R1 |
| 2.8.6 | Physical OTP generator revocable | N/A | No hardware OTP tokens; passkeys are removable (E-11c) | — | — | — |
| 2.9.1 | Verification keys stored securely | Met by design | Passkey private keys stay in the authenticator; the server stores public keys (E-10a) | — | R-B | V2-R1 |
| 2.9.2 | Challenge nonce at least 64 bits | Met by design | WebAuthn challenge from the CSPRNG (AUTH-16, F-K-R5) | — | R-B | V2-R1 |
| 2.9.3 | Approved algorithms for cryptographic verifiers | Met by design | AUTH-16 (ES256, user verification required) | — | R-B | V2-R1 |
| 2.10.1 | Intra-service secrets not static credentials | Partial | Cloud access by OIDC federation (F-D-02); database logins use passwords (F-S-01 to F-S-03) | AG-15: accepted deviation: the pooler authenticates by password *(verify, OD-14)*; mitigated by automated rotation with SCRAM verifiers (F-11 rule R-ROT, rev P4) | R-B | V2-R0 |
| 2.10.2 | No default credentials for service accounts | Met by design | Named logins (F-ISO-10, F-CP-02) | — | R-B | V2-R0 |
| 2.10.3 | Service passwords protected at rest | Met by design | Secrets manager (F-11) | — | R-B | V2-R0 |
| 2.10.4 | Secrets not in source code | Met by design | F-11 rules, Gitleaks (PIPE-04), push protection | — | R-B | V2-R0 |

### V3 Session management

| Req ID | Short requirement | Status | Design reference | Remediation | Owner | Target |
|---|---|---|---|---|---|---|
| 3.1.1 | Session tokens never in URLs | Met by design | `__Host-sv` cookie only (E-10); download and reset tokens are single-use capability tokens, not sessions (8.3.1) | — | R-B | V2-R1 |
| 3.2.1 | New session token on authentication | Met by design | E-19 (rotation on sign-in, switch, elevation) | — | R-B | V2-R1 |
| 3.2.2 | At least 64 bits of entropy | Met by design | E-10 (256-bit random) | — | R-B | V2-R1 |
| 3.2.3 | Tokens stored only in secure cookies | Met by design | E-10, DATA-07 | — | R-B | V2-R1 |
| 3.2.4 | Tokens from approved algorithms | Met by design | E-10 (CSPRNG, SHA-256 stored) | — | R-B | V2-R1 |
| 3.3.1 | Logout and expiry invalidate the token | Met by design | E-17 (row read on every request) | — | R-B | V2-R1 |
| 3.3.2 | Re-authentication after 12 h, or 30 min idle | Met by design | E-15a, E-15b, E-28 | — | R-B | V2-R1 |
| 3.3.3 | Option to end other sessions after a password change | Met by design | E-17 (all sessions end on password change) | — | R-B | V2-R1 |
| 3.3.4 | User can view and end sessions, after re-entering credentials | Partial | C-AC-07, C-AC-10; SESS-02 ends other sessions without re-authentication | AG-16: decide between step-up for "sign out other sessions" and an accepted deviation (signing others out is the safe direction) | R-B | V2-R1 |
| 3.4.1 | Cookie `Secure` | Met by design | E-10 | — | R-B | V2-R1 |
| 3.4.2 | Cookie `HttpOnly` | Met by design | E-10 | — | R-B | V2-R1 |
| 3.4.3 | Cookie `SameSite` | Met by design | E-10 (`Strict`) | — | R-B | V2-R1 |
| 3.4.4 | `__Host-` prefix | Met by design | E-10, E-15i | — | R-B | V2-R1 |
| 3.4.5 | Most precise cookie path where hosts are shared | Met by design | `__Host-` forces `Path=/` on a dedicated host; `console` and `files` on other hostnames (F-D-03, F-D-07) | — | R-B | V2-R1 |
| 3.5.1 | Users can revoke tokens of linked applications | Met by design | API key revoke (E-66), integration disconnect (F-S-05), SCIM token revoke (E-57) | — | R-B | V2-R5 |
| 3.5.2 | Session tokens rather than static secrets (except legacy) | Met by design | Browser uses sessions; API keys only for integrations (C-02) | — | R-B | V2-R1 |
| 3.5.3 | Stateless tokens signed and protected against tampering and replay | Met by design | Sealed sign-in tickets (F-K-07), HMAC cursors and download tokens (F-K-08, C-31), single use where stated (F-T-040) | — | R-B | V2-R1 |
| 3.7.1 | Full session or re-authentication before sensitive actions | Met by design | E-16 step-up list, STEP rule (C §1.8) | — | R-B | V2-R1 |

### V4 Access control

| Req ID | Short requirement | Status | Design reference | Remediation | Owner | Target |
|---|---|---|---|---|---|---|
| 4.1.1 | Access control on a trusted service layer | Met by design | E-35, ACC-02; generated authorisation suite J-AUTHZ-01 to -04 | — | R-B | V2-R1 |
| 4.1.2 | Access-control attributes not changeable by users | Met by design | Tenant from the session only (E-20, C-11); `user_metadata` never read (F-AB-04); write allow-lists (F-T-003) | — | R-B | V2-R1 |
| 4.1.3 | Least privilege | Partial | E-31 matrix, E-33b ceiling, E-42 to E-46 | AG-17: close P4-A2-13 (time-box member vendors), P4-A2-15 (questionnaire template versioning and approval) and P4-A2-16 (carry OQ-18 into E-31) | R-B | V2-R3 |
| 4.1.4 | *(deleted in 4.0.3, duplicate of 4.1.3)* *(verify)* | N/A | — | — | — | — |
| 4.1.5 | Access control fails securely | Met by design | Deny by default (E-35); F-ISO-05 fail closed; C-43 | — | R-B | V2-R0 |
| 4.2.1 | IDOR protection for create, read, update and delete | Partial | F-AB-03, OBJ rules (C §1.8), F-IT-30 to F-IT-33 | AG-18: close P4-A2-17 (auditor access to record history) and P4-A2-18 (parent-type to permission table for uploads, vendor-member path) | R-B | V2-R2 |
| 4.2.2 | Strong anti-CSRF | Met by design | C-13 (SameSite=Strict plus `Origin` match), F-T-002 | — | R-B | V2-R1 |
| 4.3.1 | Administrative interfaces use MFA | Met by design | Passkeys mandatory for staff (E-11c, F-T-020), elevation with a fresh passkey assertion (E-70) | — | R-B | V2-R1 |
| 4.3.2 | No directory browsing or metadata disclosure | Met by design | Private buckets (F-PL-04); PIPE-08 shipped-artifact check | — | R-B | V2-R0 |
| 4.3.3 | Step-up or segregation of duties for high-value actions | Partial | E-16, four-eyes (D-20), SOD_MATRIX | AG-19: close P4-A2-21 (no self-approval of the production gate) and P4-A2-23 (four-eyes and tenant-admin notice for auditor access grant and extension) | R-A | V2-R0 |

### V5 Validation, sanitisation and encoding

| Req ID | Short requirement | Status | Design reference | Remediation | Owner | Target |
|---|---|---|---|---|---|---|
| 5.1.1 | Defence against HTTP parameter pollution | Partial | C-32 (unknown filters refused) | AG-20: a repeated query parameter, other than a declared list filter, is refused with 400 `invalid_field` | R-B | V2-R1 |
| 5.1.2 | Mass-assignment protection | Met by design | F-T-003, 2B write allow-lists, C-11 | — | R-B | V2-R1 |
| 5.1.3 | Positive (allow-list) input validation | Met by design | 2C §1 schema validation per route, C-32, C-33 allow-lists | — | R-B | V2-R1 |
| 5.1.4 | Structured data strongly typed against a schema | Partial | 2C §1 | AG-04: publish the machine-readable API schema (OpenAPI) generated from the route registry, and generated schema-validation tests | R-B | V2-R1 |
| 5.1.5 | Redirects only to allow-listed destinations | Met by design | DATA-02 `safeHref`; SSO redirects only to configured connection endpoints with `state` (E-52, C-AC-06) | — | R-B | V2-R1 |
| 5.2.1 | WYSIWYG HTML sanitised | Met by design | No HTML input is accepted or rendered (DATA-01, F-T-001); a rich-text editor would need a new design item | — | R-B | V2-R2 |
| 5.2.2 | Unstructured data sanitised (characters, length) | Met by design | DATA-05 (`clampText`), 2B length limits | — | R-B | V2-R1 |
| 5.2.3 | Input sanitised before mail systems | Met by design | Fixed templates, escaped values, no header injection (F-ISO-35, ACC-25) | — | R-B | V2-R1 |
| 5.2.4 | No `eval` or dynamic code execution | Met by design | DATA-01, F-SD-03 lint | — | R-B | V2-R0 |
| 5.2.5 | Template injection prevented | Met by design | Fixed server-side templates; values only as data (F-ISO-35) | — | R-B | V2-R1 |
| 5.2.6 | SSRF protection | Met by design | F-AB-14, C-88, F-TLS-06, H-NW-08; F-IT-92, F-IT-93 | — | R-B | V2-R5 |
| 5.2.7 | User SVG sanitised or disabled | Met by design | SVG refused (F-U-01) | — | R-B | V2-R2 |
| 5.2.8 | Scriptable template content (Markdown, CSS, XSL) sanitised | Met by design | Rendered as text only (DATA-01); AI output rendered as text (F-AB-11) | — | R-B | V2-R2 |
| 5.3.1 | Output encoding fits the interpreter and context | Partial | DATA-01, DATA-04 | AG-21: review the server-side generators of documents (board pack PDF and similar) for context-correct encoding in v2 | R-B | V2-R2 |
| 5.3.2 | Encoding keeps the user's character set | Partial | JSON over HTTPS | AG-22: every response states `charset=utf-8` (2C §1 convention) | R-B | V2-R1 |
| 5.3.3 | Context-aware escaping against XSS | Met by design | DATA-01 (React text rendering); CSP as defence in depth tracked under 14.4.3 | — | R-B | V2-R1 |
| 5.3.4 | Parameterised queries | Met by design | F-ISO-06(3), F-SD-03, F-IT-24, F-IT-38 | — | R-B | V2-R0 |
| 5.3.5 | Context escaping where parameters are impossible | Met by design | Identifiers only from a validated `tkey` (F-ISO-03, F-ISO-06(4)) | — | R-B | V2-R0 |
| 5.3.6 | JSON injection and JSON eval prevented | Met by design | `JSON.parse` only; no `eval` (DATA-01) | — | R-B | V2-R0 |
| 5.3.7 | LDAP injection | N/A | No LDAP | — | — | — |
| 5.3.8 | OS command injection | Met by design | No shell execution with input; scanner receives bytes, never names (ADR-012, F-U-07) | — | R-B | V2-R0 |
| 5.3.9 | Local or remote file inclusion | Met by design | No user path components (F-U-07, F-T-041) | — | R-B | V2-R2 |
| 5.3.10 | XPath or XML injection | Met by design | No XPath; XML uploads refused (F-U-01); SAML parsed by Supabase Auth (E-51) | — | R-B | V2-R1 |
| 5.4.1 | Memory-safe string handling | N/A | Managed runtime; native addons banned (PIPE-08) | — | — | — |
| 5.4.2 | Format strings constant | N/A | Managed runtime | — | — | — |
| 5.4.3 | Integer overflow prevention | N/A | Managed runtime; money as integer minor units validated by schema (C-21) | — | — | — |
| 5.5.1 | Serialised objects integrity-protected | Met by design | HMAC cursors and tokens (C-31, F-K-08), sealed tickets (F-K-07) | — | R-B | V2-R1 |
| 5.5.2 | XML parsers restricted (no XXE) | Partial | XML uploads refused; OOXML imports parse XML (C-M10-02, C-M06-18) | AG-23: OOXML parsers configured with external entities and DTDs off; parsing only after `scan_state = clean` (P4-A2-26), inside the `workloads-prod` container, not in `app` | R-B | V2-R3 |
| 5.5.3 | Untrusted deserialisation avoided | Partial | JSON only on the API | AG-23 | R-B | V2-R3 |
| 5.5.4 | `JSON.parse` used for JSON | Met by design | DATA-01 | — | R-B | V2-R0 |

### V6 Stored cryptography

| Req ID | Short requirement | Status | Design reference | Remediation | Owner | Target |
|---|---|---|---|---|---|---|
| 6.1.1 | Regulated personal data encrypted at rest | Partial | E1/E2 (F-D-12), provider encryption | AG-24: `auth.*` personal data is plaintext in Supabase (P4-A3-01) and some personal fields are E0 (P4-A3-04) | R-B | V2-R1 |
| 6.1.2 | Regulated health data encrypted at rest | Met by design | Free text that may hold health data is E1; persons' identifiers E2 (F-D-12, ADR-003) | — | R-B | V2-R2 |
| 6.1.3 | Regulated financial data encrypted at rest | Met by design | No card data (F-AB-10); billing contact E1 under the platform DEK (F-K-31) | — | R-A | V2-R5 |
| 6.2.1 | Crypto modules fail securely (no padding oracle) | Met by design | AES-256-GCM only; generic errors (F-K-R1, C-48) | — | R-B | V2-R0 |
| 6.2.2 | Proven algorithms and libraries, no custom crypto | Met by design | WebCrypto, KMS (F-7.1, F-K-R5) | — | R-B | V2-R0 |
| 6.2.3 | IV, cipher and mode configured securely | Met by design | 96-bit random nonce per encryption, AAD binding (F-K-R1, F-K-R5) | — | R-B | V2-R0 |
| 6.2.4 | Algorithms and keys can be replaced | Met by design | Ciphertext carries class, key id and version (F-K-R1); rotation (F-7.1) | — | R-B | V2-R0 |
| 6.2.5 | No insecure modes, padding or weak hashes | Met by design | GCM, SHA-256, HMAC-SHA-256; HMAC-SHA1 only inside RFC 6238 TOTP for compatibility | — | R-B | V2-R0 |
| 6.2.6 | Nonces never reused with one key | Met by design | Random 96-bit nonces (F-K-R5); per-file keys (F-K-04); yearly DEK rotation keeps each key far below the random-nonce limit | — | R-B | V2-R0 |
| 6.3.1 | Unguessable values from a CSPRNG | Met by design | F-K-R5 | — | R-B | V2-R0 |
| 6.3.2 | GUIDs are v4 from a CSPRNG | Met by design | `gen_random_uuid()` / `crypto.randomUUID()` for ids *(verify 2B default)* | — | R-B | V2-R0 |
| 6.4.1 | Secrets in a secrets-management solution | Met by design | F-11 | — | R-B | V2-R0 |
| 6.4.2 | Key material not exposed to the application | Partial | KEKs and the signing key never leave the KMS (F-7.1); DEKs are unwrapped into memory for at most 5 minutes (F-K-R3) | AG-25: accepted deviation, inherent to envelope encryption (A-50); key buffers zeroed after use (AG-29) | R-B | V2-R0 |

### V7 Error handling and logging

| Req ID | Short requirement | Status | Design reference | Remediation | Owner | Target |
|---|---|---|---|---|---|---|
| 7.1.1 | No credentials or payment data in logs; session tokens only hashed | Met by design | LOG-04, F-ISO-34, F-SD-07 redaction test; password rotation by SCRAM verifier only (F-11 rule R-ROT, rev P4) | — | R-B | V2-R0 |
| 7.1.2 | No other sensitive data in logs | Met by design | F-ISO-34 incl. Postgres log settings (rev P4); V3-08 extended to E0 canaries (rev P4) | — | R-B | V2-R0 |
| 7.1.3 | Security events logged (authentication, access-control failures, input-validation failures) | Partial | F-EV-01, F-EV-11 (refused reads added, rev P4) | AG-26: align 2C C-63 with F-EV-11 (refusals of reads, P4-A2-08), and count input-validation failures (400 and 422) per principal as a SIEM metric with an alert threshold | R-B | V2-R1 |
| 7.1.4 | Events carry enough to rebuild a timeline | Met by design | F-L-02 fields (`at`, actor, `request_id`, outcome, `refusal_code`) | — | R-B | V2-R0 |
| 7.2.1 | All authentication decisions logged | Met by design | F-EV-01, incl. vendor-portal visitors (rev P4) | — | R-B | V2-R1 |
| 7.2.2 | All failed access-control decisions logged | Partial | F-EV-11 (rev P4); 2C C-63 still covers state changes only (P4-A2-08). The old F-V07 rated the chapter Met in spite of this | AG-26 | R-B | V2-R1 |
| 7.3.1 | Log encoding prevents log injection | Met by design | Structured JSON lines (LOG-04); canonical JSON audit entries (F-L-03) | — | R-B | V2-R0 |
| 7.3.2 | *(deleted in 4.0.3, duplicate of 7.3.1)* *(verify)* | N/A | — | — | — | — |
| 7.3.3 | Security logs protected from access and change | Partial | F-9 hash chain, ADR-013 anchoring and WORM, SIEM access R-A and R-B only (F-ISO-34), single insert path (F-L-05, rev P4) | AG-27: make the break-glass record append-only and chained (P4-A2-10) | R-B | V2-R1 |
| 7.3.4 | Time synchronised; UTC | Met by design | F-12 (provider NTP, UTC, database clock authoritative) | — | R-B | V2-R0 |
| 7.4.1 | Generic error message with an id | Met by design | C-48, LOG-04 | — | R-B | V2-R0 |
| 7.4.2 | Exception handling across the code base | Met by design | Router fail-closed (F-ISO-05); error model C-40 to C-48 | — | R-B | V2-R0 |
| 7.4.3 | Last-resort error handler | Met by design | C-48 (500 `internal`, never SQL, schema names or `tkey`) | — | R-B | V2-R0 |

### V8 Data protection

| Req ID | Short requirement | Status | Design reference | Remediation | Owner | Target |
|---|---|---|---|---|---|---|
| 8.1.1 | Sensitive data not cached by server components | Met by design | F-ISO-31 (one cache rule; CDN only for published Trust Center), F-T-004 | — | R-B | V2-R0 |
| 8.1.2 | Temporary server copies protected or purged | Met by design | DEK cache 5 min (F-K-R3); quarantine purge (F-U-03); export links expire (C-34, F-ISO-38) | — | R-B | V2-R2 |
| 8.1.3 | Minimal parameters in requests | Met by design | One cookie (E-20); tenant never in the request (C-11) | — | R-B | V2-R1 |
| 8.1.4 | Abnormal request volumes detected and alerted | Met by design | C-55 to C-59, F-M-10, F-M-11, F-M-12 | — | R-B | V2-R1 |
| 8.2.1 | Anti-caching headers | Met by design | `no-store` (F-ISO-31, F-T-004, E-26) | — | R-B | V2-R1 |
| 8.2.2 | No sensitive data in browser storage | Met by design | DATA-07 | — | R-B | V2-R1 |
| 8.2.3 | Client data cleared after the session | Met by design | E-26 (caches cleared, full reload on switch and sign-out) | — | R-B | V2-R1 |
| 8.3.1 | Sensitive data not in query strings | Partial | Single-use capability tokens in URL paths (reset C-AC-12, invitation, vendor link C-08, download F-U-06); `Referrer-Policy: strict-origin-when-cross-origin` (HDR-01) | AG-28: accepted for single-use, short-lived tokens; add a rule that log pipelines redact token path segments (F-ISO-34) and test it in F-SD-07 | R-B | V2-R1 |
| 8.3.2 | Users can export or remove their data | Met by design | Exports (C-34), DSAR (2G G-SAR), account data requests (C-AC-16), final export FINAL-EXPORT (2D D-12b, rev P4) | — | R-A | V2-R4 |
| 8.3.3 | Clear notice on collection and use | Partial | 2G G-27701-04 ("privacy notice to write") | Tracked by the 2G remediation plan (P4-A3-12); no separate AG | R-A | V2-R4 |
| 8.3.4 | Sensitive data identified with a handling policy | Partial | 2B classification, 2G | AG-24 | R-B | V2-R1 |
| 8.3.5 | Access to sensitive data audited | Met by design | F-EV-03 (extended rev P4, P4-A2-07); C-63 writes every F-EV-03 read | — | R-B | V2-R2 |
| 8.3.6 | Sensitive data overwritten in memory after use | Partial | DEKs in memory ≤ 5 min (F-K-R3) | AG-29: zero key and plaintext byte buffers (`Uint8Array.fill(0)`) after use; JavaScript strings cannot be zeroed (accepted) | R-B | V2-R0 |
| 8.3.7 | Encryption gives confidentiality and integrity | Met by design | AES-256-GCM (F-7.1) | — | R-B | V2-R0 |
| 8.3.8 | Retention classes with automatic deletion | Partial | 2G retention classes, purge job D-71, column purges (B-RC30 to B-RC35) | AG-30: retention periods are DRAFT until counsel reviews them (DU-21, P4-A3-05) | R-A | V2-R4 |

### V9 Communication

| Req ID | Short requirement | Status | Design reference | Remediation | Owner | Target |
|---|---|---|---|---|---|---|
| 9.1.1 | TLS for all client traffic, no fallback | Met by design | F-TLS-01 (HSTS preload) | — | R-B | V2-R0 |
| 9.1.2 | Only strong cipher suites | Partial | Vercel-managed TLS *(verify)* | AG-31: add a TLS configuration scan of every public hostname to the release checks (F-SD-06) | R-B | V2-R6 |
| 9.1.3 | Only TLS 1.2 and 1.3 | Partial | F-TLS-01 | AG-31 | R-B | V2-R6 |
| 9.2.1 | Trusted certificates; internal CA pinned | Met by design | F-TLS-02 (Supabase CA pinned, `verify-full`), F-TLS-03 | — | R-B | V2-R0 |
| 9.2.2 | TLS for every inbound and outbound connection | Met by design | F-TLS-01 to F-TLS-06 | — | R-B | V2-R0 |
| 9.2.3 | Encrypted external connections authenticated | Met by design | F-TLS-03 (no verification bypass, CodeQL), F-TB-07, F-TB-08 | — | R-B | V2-R0 |
| 9.2.4 | Certificate revocation checking (OCSP stapling) | Partial | Provider-managed certificates | AG-31: owner verifies OCSP stapling on Vercel (OD-14); outbound revocation checking is not done by the Node runtime (accepted) | R-B | V2-R6 |

### V10 Malicious code

| Req ID | Short requirement | Status | Design reference | Remediation | Owner | Target |
|---|---|---|---|---|---|---|
| 10.2.1 | No unauthorised phone-home or data collection | Partial | Dependency review, licence policy (PIPE-03) | AG-32: state in 2C that no third-party script or beacon runs in the browser or server, and add a bundle check for outbound hosts | R-B | V2-R1 |
| 10.2.2 | No excessive permissions to device features | Met by design | `Permissions-Policy` denies camera, microphone, geolocation, payment, USB (HDR-01) | — | R-B | V2-R0 |
| 10.3.1 | Auto-updates over secure channels, signed | N/A | No client auto-update; server deploys covered by 1.14.2 | — | — | — |
| 10.3.2 | Integrity protection (code signing, SRI) | Partial | Signed tags (PIPE-06), shipped-artifact check (PIPE-08) | AG-05 | R-B | V2-R6 |
| 10.3.3 | Protection from subdomain takeover | Gap | Not designed | AG-33: inventory every DNS record of the product domains (app, `console`, `files.<domain>`, Trust Center); monthly check for dangling CNAMEs; remove DNS records before a Vercel project or bucket is deleted | R-B | V2-R6 |

### V11 Business logic

| Req ID | Short requirement | Status | Design reference | Remediation | Owner | Target |
|---|---|---|---|---|---|---|
| 11.1.1 | Flows in sequential order, no skipped steps | Met by design | State machines (2D), sign-in ticket steps (E-14), approval engine (D-20) | — | R-B | V2-R1 |
| 11.1.2 | Flows in realistic human time | Partial | Proof-of-work and challenges on public flows (AUTH-05, C-58) | AG-34: accepted for authenticated flows, which rate limits and step-up cover (C-56, E-16); no further action | R-A | V2-R1 |
| 11.1.3 | Per-user limits on business actions | Met by design | C-56, C-58, plan limits (C-61) | — | R-A | V2-R1 |
| 11.1.4 | Anti-automation against exfiltration, uploads and DoS | Met by design | C-55 to C-59, F-M-10, F-U-02 | — | R-B | V2-R1 |
| 11.1.5 | Business-logic limits from the threat model | Met by design | F-3 abuse cases with tests (F-4.3b, rev P4) | — | R-B | V2-R1 |
| 11.1.6 | No TOCTOU or race conditions | Met by design | Optimistic locking (C-22), `FOR UPDATE` on entitlements (F-AB-10), chain-head lock (F-L-04), idempotency (C-50 to C-52); F-IT-76 | — | R-B | V2-R1 |
| 11.1.7 | Unusual business activity monitored | Met by design | F-M-10, F-M-12, F-M-17, DSAR volume alert (F-AB-13), automation run alert (F-AB-15) | — | R-B | V2-R1 |
| 11.1.8 | Configurable alerting on automated attacks | Met by design | Thresholds per plan (F-M-10), per-tenant presets (AUTH-02) | — | R-B | V2-R1 |

### V12 Files and resources

| Req ID | Short requirement | Status | Design reference | Remediation | Owner | Target |
|---|---|---|---|---|---|---|
| 12.1.1 | Large files refused | Met by design | F-U-02 (hard ceiling, bucket `file_size_limit`) | — | R-B | V2-R2 |
| 12.1.2 | Compressed files checked for uncompressed size and file count | Partial | Archives refused (F-U-01); OOXML is a ZIP container; F-IT-45 (rev P4) | AG-35: scanner policy (ADR-012) and import parsers set a maximum uncompressed size and entry count for OOXML | R-B | V2-R0 |
| 12.1.3 | Per-user file quota | Partial | Per-tenant quota (F-T-043), write rate per user (C-56) | AG-36: add a per-user daily upload byte cap (plan setting) | R-B | V2-R2 |
| 12.2.1 | File type checked by content | Met by design | F-U-01 (magic bytes must agree); F-IT-40 | — | R-B | V2-R2 |
| 12.3.1 | Filename metadata not used for filesystem paths | Met by design | F-U-07, F-T-041 | — | R-B | V2-R2 |
| 12.3.2 | Filename metadata cannot cause LFI | Met by design | F-U-07 | — | R-B | V2-R2 |
| 12.3.3 | Filename metadata cannot cause RFI or SSRF | Met by design | F-U-07; object keys built by `storagebroker` (F-ISO-42) | — | R-B | V2-R2 |
| 12.3.4 | Reflective file download prevented | Met by design | `Content-Disposition: attachment`, stored type, `nosniff` (F-U-06); API responses per 14.4.2 | — | R-B | V2-R2 |
| 12.3.5 | File metadata never reaches OS commands | Met by design | F-U-07, ADR-012 | — | R-B | V2-R0 |
| 12.3.6 | No code from untrusted sources | Met by design | Pinned dependencies and actions (PIPE-03, PIPE-05) | — | R-B | V2-R0 |
| 12.4.1 | Untrusted files stored outside the web root, limited rights | Met by design | Private buckets (F-PL-04), encrypted (F-U-05) | — | R-B | V2-R2 |
| 12.4.2 | Untrusted files scanned for malware | Partial | ADR-012, F-U-04, F-U-08 | AG-23 (parse only after `clean`, P4-A2-26) and AG-37: one scan-state model and route across 2B, ADR-012, F-10 and 2C (P4-A2-25) | R-B | V2-R2 |
| 12.5.1 | Web tier serves only expected file types | Met by design | Built assets only (PIPE-08); user files only through download tokens (F-U-06) | — | R-B | V2-R2 |
| 12.5.2 | Uploaded files never executed as HTML or script | Met by design | Cookieless origin, `CSP: sandbox`, attachment (F-D-07, F-U-06); F-IT-46 | — | R-B | V2-R2 |
| 12.6.1 | Server-side requests only to allow-listed resources | Partial | Platform egress allow-list (H-NW-08); tenant-set webhook and integration URLs checked against private ranges (F-AB-14) | AG-38: accepted deviation: tenant webhook targets cannot be allow-listed by Selvara; private, loopback, link-local and metadata ranges refused, connection pinned, no redirects | R-B | V2-R5 |

### V13 API and web service

| Req ID | Short requirement | Status | Design reference | Remediation | Owner | Target |
|---|---|---|---|---|---|---|
| 13.1.1 | One set of encoders and parsers | Met by design | One Node runtime, one URL and JSON parser (2C §1) | — | R-B | V2-R1 |
| 13.1.2 | *(deleted in 4.0.3, duplicate of 4.3.1)* *(verify)* | N/A | — | — | — | — |
| 13.1.3 | API URLs expose no keys or session tokens | Partial | API keys only in `Authorization` (E-60); single-use tokens in paths | AG-28 | R-B | V2-R1 |
| 13.1.4 | Authorisation at both route and resource level | Met by design | Permission plus object rule per endpoint (C §1.8, E-35); OBJ-T default to be stated (P4-A2-20) | — | R-B | V2-R1 |
| 13.1.5 | Unexpected or missing content types refused (406/415) | Gap | Not designed | AG-39: a body that is not `application/json` gets 415; an `Accept` the route cannot serve gets 406 (2C §1) | R-B | V2-R1 |
| 13.2.1 | Only valid HTTP methods per route and role | Met by design | Methods fixed per route (2C §2); permission per route | — | R-B | V2-R1 |
| 13.2.2 | JSON schema validation before accepting input | Partial | 2C §1 | AG-04 | R-B | V2-R1 |
| 13.2.3 | Cookie-based REST protected from CSRF | Met by design | C-13 | — | R-B | V2-R1 |
| 13.2.4 | *(deleted in 4.0.3, duplicate of 11.1.4)* *(verify)* | N/A | — | — | — | — |
| 13.2.5 | Incoming `Content-Type` checked | Gap | Not designed | AG-39 | R-B | V2-R1 |
| 13.2.6 | Headers and payload protected in transit | Met by design | TLS (F-6); signed webhooks (C-86) and provider callbacks (C-09) | — | R-B | V2-R1 |
| 13.3.1 | SOAP XSD validation | N/A | No SOAP | — | — | — |
| 13.3.2 | SOAP WS-Security signatures | N/A | No SOAP | — | — | — |
| 13.4.1 | GraphQL depth and amount limits | N/A | GraphQL disabled (F-D-10, F-PL-01) | — | — | — |
| 13.4.2 | GraphQL authorisation in the business layer | N/A | GraphQL disabled | — | — | — |

### V14 Configuration

| Req ID | Short requirement | Status | Design reference | Remediation | Owner | Target |
|---|---|---|---|---|---|---|
| 14.1.1 | Secure, repeatable build and deploy | Met by design | PIPE-01 to PIPE-09, F-15 | — | R-B | V2-R0 |
| 14.1.2 | Compiler hardening flags | N/A | No native code (PIPE-08) | — | — | — |
| 14.1.3 | Server configuration hardened | Partial | F-PL-01 to F-PL-05, F-D-10 | AG-06 | R-B | V2-R0 |
| 14.1.4 | Redeploy or restore from scripts in reasonable time | Partial | ADR-004, ADR-009; KS-SNAP restore drill (F-7.5) | AG-06 plus the DR drill in V2-R6 (2K) | R-B | V2-R6 |
| 14.2.1 | Components up to date | Met by design | Dependabot, PIPE-03 | — | R-B | V2-R0 |
| 14.2.2 | Unneeded features and samples removed | Met by design | Data API, GraphQL and Realtime postgres-changes off (F-D-10, F-PL-01, F-PL-02); demo mode not in API builds | — | R-B | V2-R0 |
| 14.2.3 | SRI for externally hosted assets | Partial | No external assets intended | AG-32 | R-B | V2-R1 |
| 14.2.4 | Components from trusted repositories | Met by design | npm registry with lockfile, pinned actions (PIPE-05) | — | R-B | V2-R0 |
| 14.2.5 | SBOM maintained | Met by design | Existing SBOM in the pipeline (F-V10 old text; PIPE-03) | — | R-B | V2-R0 |
| 14.2.6 | Third-party libraries sandboxed | Partial | Malware scanning isolated in a container (ADR-012) | AG-23 (file parsers run in `workloads-prod`, not in `app`) | R-B | V2-R3 |
| 14.3.1 | *(deleted in 4.0.3, duplicate of 7.4.1)* *(verify)* | N/A | — | — | — | — |
| 14.3.2 | Debug modes off in production | Met by design | Production builds only (PIPE-08) | — | R-B | V2-R0 |
| 14.3.3 | No detailed version information in responses | Met by design | `poweredByHeader: false` (existing `next.config.js`, kept); C-48 | — | R-B | V2-R0 |
| 14.4.1 | `Content-Type` with a safe charset on every response | Partial | 2C §1 | AG-22 | R-B | V2-R1 |
| 14.4.2 | API responses carry `Content-Disposition: attachment` | Gap | Not designed | AG-40: every `/api/v1` JSON response carries `Content-Disposition: attachment; filename="api.json"` (2C §1) | R-B | V2-R1 |
| 14.4.3 | Content Security Policy | Partial | HDR-01 with EX-05 (`'unsafe-inline'`) | AG-41: nonce-based CSP before production (EX-05) | R-B | V2-R6 |
| 14.4.4 | `X-Content-Type-Options: nosniff` everywhere | Met by design | HDR-01, F-U-06 | — | R-B | V2-R0 |
| 14.4.5 | HSTS on all responses and subdomains | Met by design | F-TLS-01, HDR-01 | — | R-B | V2-R0 |
| 14.4.6 | Suitable `Referrer-Policy` | Met by design | HDR-01 (`strict-origin-when-cross-origin`) | — | R-B | V2-R0 |
| 14.4.7 | No framing by third-party sites | Met by design | `frame-ancestors 'none'`, `X-Frame-Options: DENY` (HDR-01, F-T-006) | — | R-B | V2-R0 |
| 14.5.1 | Only used HTTP methods accepted; others logged or alerted | Partial | Methods fixed per route | AG-42: 405 responses counted per source in the SIEM with an alert threshold | R-B | V2-R1 |
| 14.5.2 | `Origin` never used for authentication or authorisation | Met by design | `Origin` used only as CSRF defence in depth next to SameSite (C-13) | — | R-B | V2-R1 |
| 14.5.3 | CORS strict allow-list, no `null` origin | Gap | Not designed | AG-43: no CORS: the API never emits `Access-Control-Allow-Origin`; the Trust Center and vendor portal are served from the same origin; ZAP check in F-SD-06 | R-B | V2-R1 |
| 14.5.4 | Headers added by trusted proxies are authenticated | Partial | Client IP used by AUTH-03 and AUTH-06 | AG-44: take the client address only from the header Vercel sets and overwrites *(verify which, OD-14)*, never from a client-supplied `X-Forwarded-For` chain | R-B | V2-R1 |

## 2. Counts per chapter

Counts include the N/A rows. "Chapter status" is Met only when Partial and Gap are both zero.

| Chapter | Rows | Met by design | Partial | Gap | N/A | Chapter status |
|---|---|---|---|---|---|---|
| V1 Architecture | 41 | 30 | 8 | 0 | 3 | Partial |
| V2 Authentication | 52 | 38 | 11 | 1 | 2 | Partial |
| V3 Session management | 18 | 17 | 1 | 0 | 0 | Partial |
| V4 Access control | 10 | 6 | 3 | 0 | 1 | Partial |
| V5 Validation | 30 | 20 | 6 | 0 | 4 | Partial |
| V6 Stored cryptography | 13 | 11 | 2 | 0 | 0 | Partial |
| V7 Errors and logging | 13 | 9 | 3 | 0 | 1 | Partial |
| V8 Data protection | 15 | 10 | 5 | 0 | 0 | Partial |
| V9 Communication | 7 | 4 | 3 | 0 | 0 | Partial |
| V10 Malicious code | 5 | 1 | 2 | 1 | 1 | Partial |
| V11 Business logic | 8 | 7 | 1 | 0 | 0 | Partial |
| V12 Files and resources | 15 | 11 | 4 | 0 | 0 | Partial |
| V13 API | 15 | 5 | 2 | 2 | 6 | Partial |
| V14 Configuration | 24 | 12 | 8 | 2 | 2 | Partial |
| **Total** | **266** | **181** | **59** | **6** | **20** | No chapter is Met |

## 3. ASVS gap register (AG)

Every Partial and Gap row points here. Each item carries the 2K release by which it closes. Status changes are recorded here and in F-14. "Accepted" items need the owner's acceptance at the Phase 5 gate, recorded with the F-2.13 register.

| AG | Requirements | Action | Owner | Target | Linked finding |
|---|---|---|---|---|---|
| AG-01 | 1.1.3 | Security acceptance criteria (F/E/C item IDs) on every 2K work item | R-B | V2-R0 | P4-A2-01 |
| AG-02 | 1.1.7 | v2 server secure-coding checklist, linked from AGENTS.md | R-B | V2-R0 | P4-A2-01 |
| AG-03 | 1.2.4, 2.2.2, 2.7.4 | Visitor sessions on emailed link and code: accepted deviation within one invite scope, or member-variant vendor with MFA for Critical vendors | R-A | V2-R3 | — |
| AG-04 | 1.5.1, 5.1.4, 13.2.2 | OpenAPI schema from the route registry; generated schema-validation tests | R-B | V2-R1 | old F-V13 |
| AG-05 | 1.14.2, 10.3.2 | Build-provenance attestation on (F-SD-09, EX-09) | R-B | V2-R6 | P4-A2-22 |
| AG-06 | 1.14.4, 14.1.3, 14.1.4 | Settings-as-code probe and Terraform policy check blocking | R-B | V2-R0 | P4-A2-22 |
| AG-07 | 1.14.5 | Decide DU-34 (static IPs, database network allow-list) | R-A | V2-R0 | P4-A1-14 |
| AG-08 | 2.1.3, 2.4.5 | Peppered HMAC pre-hash of the password before Supabase Auth | R-B | V2-R1 | — |
| AG-09 | 2.1.7 | Server-side k-anonymity breach check with a local fallback list | R-B | V2-R1 | old F-V02 |
| AG-10 | 2.4.1, 2.4.4 | Verify the Supabase Auth hash algorithm and cost | R-B | V2-R1 | OD-14 |
| AG-11 | 2.3.3 | Expiry reminders for API keys and SCIM tokens | R-B | V2-R5 | — |
| AG-12 | 2.7.5 | Visitor codes stored only as peppered HMAC | R-B | V2-R3 | — |
| AG-13 | 2.8.5 | `mfa.code_reused` event and owner alert | R-B | V2-R1 | — |
| AG-14 | 2.8.2 | Verify TOTP seed protection in Supabase Auth; fallback Selvara-side TOTP with seeds under F-K-31 | R-B | V2-R1 | OD-14 |
| AG-15 | 2.10.1 | Accepted: database password authentication with SCRAM-verifier rotation | R-B | V2-R0 | P4-A1-05 |
| AG-16 | 3.3.4 | Step-up for "sign out other sessions", or accepted deviation | R-B | V2-R1 | — |
| AG-17 | 4.1.3 | Close P4-A2-13, P4-A2-15, P4-A2-16 | R-B | V2-R3 | P4-A2-13, -15, -16 |
| AG-18 | 4.2.1 | Close P4-A2-17, P4-A2-18 | R-B | V2-R2 | P4-A2-17, -18 |
| AG-19 | 4.3.3 | Close P4-A2-21, P4-A2-23 | R-A | V2-R0 | P4-A2-21, -23 |
| AG-20 | 5.1.1 | Repeated query parameters refused | R-B | V2-R1 | — |
| AG-21 | 5.3.1 | Encoding review of server-side document generators | R-B | V2-R2 | old F-V05 |
| AG-22 | 5.3.2, 14.4.1 | `charset=utf-8` on every response | R-B | V2-R1 | — |
| AG-23 | 5.5.2, 5.5.3, 12.4.2, 14.2.6 | Safe import parsing: XXE off, only after `clean`, in `workloads-prod` | R-B | V2-R3 | P4-A2-26 |
| AG-24 | 1.5.1, 1.8.1, 6.1.1, 8.3.4 | Classify `auth.*`; E0 personal fields | R-B | V2-R1 | P4-A3-01, P4-A3-04 |
| AG-25 | 6.4.2 | Accepted: DEKs in memory ≤ 5 min | R-B | V2-R0 | — |
| AG-26 | 7.1.3, 7.2.2 | 2C C-63 aligned with F-EV-11 (refused reads); input-validation failure metric | R-B | V2-R1 | P4-A2-08 |
| AG-27 | 7.3.3 | Append-only, chained break-glass record | R-B | V2-R1 | P4-A2-10 |
| AG-28 | 8.3.1, 13.1.3 | Accepted single-use tokens in paths; redact token segments in logs | R-B | V2-R1 | — |
| AG-29 | 8.3.6 | Zero key and plaintext buffers after use | R-B | V2-R0 | — |
| AG-30 | 8.3.8 | Counsel review of retention periods | R-A | V2-R4 | P4-A3-05 |
| AG-31 | 9.1.2, 9.1.3, 9.2.4 | TLS scan in release checks; verify OCSP stapling | R-B | V2-R6 | OD-14 |
| AG-32 | 10.2.1, 14.2.3 | No third-party runtime scripts, stated and checked | R-B | V2-R1 | old F-V10 |
| AG-33 | 10.3.3 | DNS inventory and dangling-record check | R-B | V2-R6 | — |
| AG-34 | 11.1.2 | Accepted: human-time checks only on public flows | R-A | V2-R1 | — |
| AG-35 | 12.1.2 | Uncompressed size and entry limits for OOXML | R-B | V2-R0 | — |
| AG-36 | 12.1.3 | Per-user daily upload cap | R-B | V2-R2 | — |
| AG-37 | 12.4.2 | One scan-state model and route | R-B | V2-R2 | P4-A2-25 |
| AG-38 | 12.6.1 | Accepted: tenant webhook targets checked against private ranges, not allow-listed | R-B | V2-R5 | — |
| AG-39 | 13.1.5, 13.2.5 | 415 and 406 enforcement | R-B | V2-R1 | — |
| AG-40 | 14.4.2 | `Content-Disposition: attachment` on API responses | R-B | V2-R1 | — |
| AG-41 | 14.4.3 | Nonce-based CSP (EX-05) | R-B | V2-R6 | old F-V05, F-V14 |
| AG-42 | 14.5.1 | 405 counting and alert | R-B | V2-R1 | — |
| AG-43 | 14.5.3 | No CORS headers emitted; ZAP check | R-B | V2-R1 | — |
| AG-44 | 14.5.4 | Client address only from the Vercel-set header | R-B | V2-R1 | OD-14 |

## 4. Corrections to the old chapter-level claims (P4-A2-01)

| Old F-14 claim | Requirement-level finding | Now |
|---|---|---|
| F-V02 V2 "Met by design" | 2.1.7 breach check was an open item; 2.1.3 and 2.4.5 depend on how Supabase Auth hashes (bcrypt truncation, no pepper); 2.8.5 reuse not logged | Partial (AG-08 to AG-14) |
| F-V03 V3 "Met by design" | 3.3.4 ends other sessions without re-authentication | Partial (AG-16) |
| F-V04 V4 "Met by design" | Least-privilege, IDOR and SoD findings P4-A2-13, -15 to -18, -21, -23 | Partial (AG-17 to AG-19) |
| F-V06 V6 "Met by design" | 6.1.1 `auth.*` plaintext and E0 personal fields; 6.4.2 DEKs in memory | Partial (AG-24, AG-25) |
| F-V07 V7 "Met by design" | 7.2.2 refused reads not logged (P4-A2-08); 7.3.3 break-glass record mutable | Partial (AG-26, AG-27) |
| F-V09 V9 "Met by design" | Cipher, protocol and revocation settings are provider-managed and unverified | Partial (AG-31) |
| F-V11 V11 "Met by design" | 11.1.2 human-time checks only on public flows | Partial, accepted (AG-34) |
| F-V12 V12 "Met by design" | 12.1.2, 12.1.3, 12.4.2 (P4-A2-25, P4-A2-26) | Partial (AG-23, AG-35 to AG-37) |
