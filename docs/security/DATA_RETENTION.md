# Data retention and erasure policy

Status: **draft for review by qualified legal, privacy and compliance staff** (organisation rule: regulatory content is a draft until reviewed).
Owner: the platform owner. Review: yearly, and whenever a law, a regulator's rule, a customer contract or the product's data changes.
Basis: GDPR Art. 5(1)(c) and (e) (data minimisation, storage limitation), Art. 17 (erasure) and 17(3) (exceptions), Art. 30 (records of
processing), Art. 28 (processors); UAE PDPL Federal Decree-Law 45/2021 Art. 15 (erasure); ISO/IEC 27001:2022 Annex A 5.33 (protection of
records), 8.10 (information deletion); ISO/IEC 27701 (PII retention and disposal); NIST SP 800-88 Rev. 1 (media sanitisation); FATF
Recommendation 11 (record keeping, at least five years) where a customer is a regulated entity. Periods below are proposals to confirm per
jurisdiction and per contract.

## 1. Principles

1. **Keep only what has a purpose, only as long as the purpose lasts.** Every kind of data below has an owner, a purpose, a legal basis and a
   period. Nothing is kept "in case".
2. **Two roles.** For a customer's workspace content (risks, controls, evidence, policies, vendors), the **customer is the controller** and
   Selvara is the **processor**: the customer sets periods within the minimums, and Selvara deletes on the customer's instruction or at
   contract end. For accounts, security logs and billing, **Selvara is the controller**.
3. **Erase or anonymise, never just hide.** When a period ends or an erasure request is granted, data is deleted, or, where a record must
   stay (an audit trail, an invoice), the personal data in it is irreversibly anonymised.
4. **Integrity of the audit trail.** Audit logs are append-only and hash-chained. They are never edited to erase a person. Instead they
   hold as little personal data as possible from the start, and personal data that must go is removed by **crypto-shredding** (section 5).
5. **Legal hold beats the schedule.** A hold placed by a company admin (or by the platform for a legal claim) stops deletion of the held
   kind until released (four-eyes), as the product already enforces (`team-hold`).
6. **Backups follow.** Deleted data leaves backups by expiry of the backup cycle, never by restoring and editing a backup.

## 2. Retention schedule

"Period" starts from the event named. "Minimum" is the shortest period a company may set (shorter is refused; shortening is four-eyes).

| Data | Where | Controller | Period | Minimum | Basis / reason | At the end |
|---|---|---|---|---|---|---|
| Account profile (name, work email) | `profiles`, Supabase Auth | Selvara | While the person has any membership, then 90 days | 30 days | Contract; lets an admin reverse a mistaken removal | Erase (account and auth user); audit references stay as a pseudonymous id |
| Password hash, authenticator secrets, passkeys, recovery code hashes | Supabase Auth, `passkeys`, `recovery_codes` | Selvara | Until replaced or the account is erased | none | Security of the account | Delete immediately on replacement or erasure |
| Sessions (device, address, times) | `sessions` | Selvara | Absolute session life, then 90 days | 30 days | Security monitoring, "where you are signed in" | Delete |
| Sign-in history and security events (failed sign-ins, locks, denials) | function logs, `kv`, audit log | Selvara | 1 year | 6 months | Legitimate interest: detecting attacks (ASVS V7) | Delete (logs expire at the log store) |
| Company audit log | `audit_log` (company) | Customer | 7 years | 5 years | Customer's record keeping (ISO 27001 A.5.33, FATF R.11 where applicable) | Delete the company's chain as a whole at the end of its period or contract |
| Platform audit log | `audit_log` (platform) | Selvara | 7 years | 5 years | Accountability for staff actions | Delete as a whole |
| Workspace records: risks, controls, issues, policies (current and retired versions), vendors, audits | `ws_records` | Customer | Customer-set; proposed: closed risks and audits 7 years, retired policy versions 10 years, closed issues and access reviews 3 years | per the existing draft (`SOD_MATRIX` §14) | Customer's compliance obligations | Purge job (skips held kinds), audited |
| Evidence and Trust Center files | Storage bucket | Customer | With the record they belong to | as the record | Same | Delete the object; storage provider erasure |
| Requests to join that were rejected | `memberships`, `profiles` | Selvara and the customer | 3 months | 1 month | Lets an admin see a repeat request | Erase the profile if it has no other membership; keep only the alias match key (see the recommendations) |
| Invitations | `invitations` | Customer | 30 days after use, revocation or expiry | 7 days | Operation | Delete |
| Password reset requests | `kv` (`resetReq`, `resetUsed`) | Selvara | 60 minutes / 24 hours | as set | Security (SEC-17) | Expire automatically |
| Vendor portal and Trust Center visitors (email, codes, NDA acceptance) | `ws_records`, `kv` | Customer | Codes: minutes; visitor records 2 years after last access; NDA acceptance 7 years | NDA 5 years | Contract evidence | Delete or anonymise |
| Support and help-desk questions | `support_questions`, `support_messages` | Selvara | 2 years after closing | 1 year | Service quality, dispute handling | Delete |
| Platform support access (grants, elevations) | `support_grants`, `elevations` | Selvara | 7 years | 5 years | Accountability of staff access to customer data | Delete as a whole |
| CSP violation reports | `csp_reports` | Selvara | 90 days | 30 days | Security monitoring | Delete |
| Billing: invoices, payments, tax data | `platform_records`, payment provider | Selvara | As tax law requires (commonly 6 to 10 years; confirm per jurisdiction) | per law | Legal obligation | Delete; card data never stored (hosted checkout) |
| Email delivery records | mail provider | Selvara | Provider default, at most 30 days | none | Delivery troubleshooting | Provider deletion |
| AI assistant requests | not stored by Selvara beyond the audit entry; the AI provider's retention per its terms (zero-retention option where offered) | Customer / Selvara | none in Selvara | none | Minimisation | n/a |
| Backups | database provider | Selvara | Provider cycle (keep at most 35 days) | 7 days | Recovery | Expire; restored data is re-purged before use |

## 3. Erasure on request (data subject rights)

1. **Who asks.** A person (about their account) or a customer (about its workspace, or for one of its people). Requests reach the platform
   owner through support; identity is confirmed through the account (signed in with the second factor) or the customer's admin.
2. **Deadline.** Answer within one month (GDPR Art. 12(3)); extensions only as the law allows, with reasons.
3. **Scope check.** For workspace content, Selvara acts on the customer's instruction (processor). For data Selvara controls, Selvara
   decides, applying Art. 17(3): data needed for a legal obligation (invoices), for legal claims (under a hold) or for the integrity of the
   audit trail is kept, but restricted and minimised, and the person is told what is kept and why.
4. **What happens** (implementation target, see section 6):
   - the auth user, password hash, authenticators, passkeys, recovery codes and sessions are deleted;
   - the profile is anonymised: the name becomes "Former member" plus a stable pseudonym, the email is removed;
   - workspace records keep their history but show the pseudonym in place of the name;
   - audit entries keep the pseudonymous id; the person's name in them is removed by crypto-shredding (section 5);
   - the action is itself audited (`privacy.erasure.completed`) without the erased values.
5. **Re-joining.** After erasure the email address may join again as a new person; nothing of the erased account returns.

## 4. End of contract

When a company's contract ends: export offered for 30 days (data portability), then the company's workspace, files, settings and audit log
are deleted, except what the law requires Selvara to keep (billing). Deletion is confirmed to the customer in writing.

## 5. Erasure and the hash-chained audit log

The audit log's chain hashes each entry, so editing a past entry breaks verification by design. To reconcile erasure with integrity:

1. **Minimise at source:** entries name people by their member id and display name only; no emails, addresses beyond the client IP, or
   free-text personal data where avoidable.
2. **Crypto-shredding (target design):** the personal part of each entry (display names in `actor` and `target`) is stored encrypted under a
   per-person key, and the chain hashes the ciphertext. Erasure destroys the person's key: the entries and the chain stay valid, and the
   names become unreadable. Until this is built, erasure keeps audit entries as they are under Art. 17(3)(b) and (e), restricted to
   admins and auditors, and the person is told so.
3. Deleting a whole chain at the end of its period (or contract) is allowed and audited at the platform level.

## 6. Implementation status and gaps

| Part | Status |
|---|---|
| Schedule, minimums, four-eyes shortening, legal hold (company workspace) | Built as configuration (`features/team/services/governance.ts`, `SOD_MATRIX` §14); production purge job not built (the demonstration previews only) |
| Session, reset and code expiry | Built |
| Account erasure and anonymisation | **Not built** (EDGE-19): needs the steps in section 3 |
| Crypto-shredding of audit names | **Not built**: design in section 5 |
| Purge job (server, skips holds, audited) | **Not built** |
| Backups at most 35 days | Provider setting: to confirm |
| Records of processing (Art. 30) | The product has a RoPA module for customers; Selvara's own RoPA to be written from this schedule |

## 7. Disposal standard

Database rows: deleted with `delete` (and vacuumed by the database), never only flagged, once a period ends (workspace records are first
soft-deleted for the audit trail, then purged). Storage objects: deleted through the provider's API. Logs: expire at the log store.
Media: handled by the cloud providers under their certified processes (NIST SP 800-88 equivalent); no Selvara-owned physical media.
