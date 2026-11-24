# ADR-013: Audit-log anchoring and WORM export target

| | |
|---|---|
| Status | Proposed |
| Date | 2026-11-23; revised 2026-11-24 (rev P4) |
| Workstream | 2F |
| Related | Spine S2 (`control.platform_audit_log`), S4 M22 (`audit_log_entry`, `audit_anchor`), S8 (anchoring job), ADR-003, `2F-security.md` F-9 |

## Context

- v0.2.5 keeps a SHA-256 hash chain per tenant and for the platform, verifiable by `audit_verify` (LOG-05). A hash chain detects edits of the middle of a chain, but anyone with database superuser rights can recompute and replace a whole chain or cut its tail. CONTROLS.md LOG-01 asks for "HMAC or WORM storage".
- Supabase organisation owners and provider operators have superuser-equivalent access (F-8.2).
- Tenants (regulated buyers) and their auditors must be able to verify their log independently.
- The log must also honour erasure and retention: entries hold personal fields encrypted (`ip_enc` E1, `pd_enc` E2, `details_enc` E1), and the hash input carries those fields only as keyed HMACs (F-D-09, 2B B-D17), so retention can null the personal value while the chain still verifies. (rev P3)
- No operations team: anchoring must be automatic and self-checking.

## Options considered

| Option | Description | Pros | Cons |
|---|---|---|---|
| O1 Chain only (status quo) | SHA-256 chain in the database | Simple | Whole-chain rewrite or truncation by a superuser undetectable |
| O2 HMAC chain with key in KMS | Each entry MACed with a KMS-held key | Rewrite needs the key | Tenants cannot verify without the key; KMS call per entry or per batch; key compromise voids history |
| **O3 Hourly Merkle anchoring of all chain heads, signed, timestamped (RFC 3161) and written to a compliance-mode WORM bucket in a separate account, plus daily encrypted log segments to WORM** | External, immutable witness of every chain head | Detects rewrite and truncation; tenant-verifiable with public key and proofs; independent of Supabase admins; cheap | New dependencies (WORM bucket, TSA); up to 1 h window before an entry is anchored |
| O4 Public blockchain anchoring | Publish roots on a public ledger | Very strong public witness | Operational and reputational complexity; fees; regulated buyers may object; not needed given O3 |
| O5 Stream every entry to an external append-only log service | Real-time copy | No window | Copies personal data to another provider; cost; still needs integrity proof |

## Decision

Adopt **O3**.

1. **Leaves**: for each chain (each tenant and the platform), leaf = `SHA-256(anchor_id ‖ seq ‖ head_hash)`; `anchor_id` is a random per-chain identifier stored in `audit_anchor`, so the anchor object does not list tenant names or `tkey`s.
2. **Root**: Merkle tree over all leaves (sorted by `anchor_id`), root signed with the KMS asymmetric key `sig/anchor` (F-K-06), timestamped by an RFC 3161 timestamp authority.
3. **WORM target**: object-lock bucket in **compliance mode** in `offsite-prod` (H-AC-05; second EU region, separate account from `kms-prod`, Supabase and Vercel); anchors retained 10 years; daily per-tenant segments (that day's entries as stored, encrypted with the tenant DEK) retained 13 months. Bucket deletion and retention reduction impossible by design; versioning on. (rev P4) The same account also holds the KS-SNAP bucket `ks-snap` (2F F-7.5, ADR-003). It is a **separate bucket** with its own 8-day retention and its own KEK `kek/ks-snap`; no audit anchor or segment is written to it, and no key snapshot is written to the audit bucket, so the 10-year and 13-month retentions here never extend the 8-day key-destruction bound.
4. **Records**: each tenant's `audit_anchor` row holds root, leaf, proof path, object key, TSA token reference; the platform equivalent in `control.platform_audit_anchor`. Each chain entry's hash covers every column except the personal-data ciphertexts (`ip_enc`, `pd_enc`, `details_enc`), which are represented in the hash input only by their keyed HMACs (`ip_hmac`, `pd_hmac`, `details_hmac`; key F-K-33), never by plaintext or ciphertext (2F F-D-09, F-L-03; 2B B-D17). (rev P3)
5. **Cadence and checks**: anchoring hourly (S8 job type), verification daily (recompute chains, compare with the latest anchors, verify signatures and WORM object presence). Missing anchor for 2 h raises F-M-05; mismatch raises F-M-04.
6. **Tenant verification**: tenant admins download a verification bundle (entries, anchors, proofs, TSA tokens, public keys with validity) and can verify offline. Public keys are published on Selvara's Trust Center.
7. **Purges**: retention purges (2G) write an anchored "purge" entry describing the range removed, so a later gap is explained and verifiable.
8. **Vendor facts and fallbacks (rev P4, P4-A2-12; A-49, VC-22, owner verification OD-14):** (a) If compliance-mode object lock is not available in `offsite-prod`, the anchors and segments go to a second provider's object storage that offers it. If none does, governance mode with a deny-delete organisation policy that needs both administrators is used, and C13-03 is restated as "deletion needs two administrators" instead of "impossible". (b) If no RFC 3161 timestamp authority is reachable from `R1`, any public TSA is used, because the token carries only the root hash, and two independent TSAs are configured so that one outage does not stop anchoring. With no TSA at all, the KMS signature alone dates the root (weaker: a signing-key compromise could back-date roots); F-M-05 fires on every missed anchor. (c) Each fallback in use is recorded in the anchor object's metadata, so a verifier knows which guarantees applied.

## Consequences

| ID | Consequence |
|---|---|
| C13-01 | Up to 1 hour of entries is not yet externally anchored; tampering within that window by a superuser is detectable only by chain verification. |
| C13-02 | A WORM bucket, an asymmetric KMS key and a TSA are added (A-49); the fallbacks are in decision 8 (rev P4). |
| C13-03 | Compliance-mode retention cannot be shortened, even by Selvara; retention values must be chosen carefully before go-live. |
| C13-04 | Daily segments add storage proportional to log volume (small). |

## Security and privacy implications

- Anchors contain hashes only and no personal data; they can outlive tenant deletion.
- Segments hold ciphertext encrypted with the tenant DEK; tenant KEK destruction at offboarding makes them unreadable while object lock keeps them until expiry (disclosed in the DPA and in the deletion certificate).
- Personal fields enter the hash only as keyed HMACs (F-D-09, B-D17), so retention nulling (2B B-RC32) and subject-key shredding do not break verification, and the hash input reveals neither plaintext nor ciphertext. An HMAC kept after erasure is a pseudonymous value, consistent with OD-10. (rev P3)
- The signing key never leaves the KMS; its compromise is detectable through KMS logs and is limited by the TSA tokens, which fix the time of each root independently.

## Verification (Phase 4)

| ID | Check |
|---|---|
| V13-01 | Modify one entry in a synthetic tenant as superuser: `audit_verify` fails at that seq; daily verification raises F-M-04. |
| V13-02 | Recompute and replace a whole synthetic chain as superuser: head no longer matches the anchored leaf; F-M-04 fires. |
| V13-03 | Truncate the tail after an anchor: anchored head seq is missing; F-M-04 fires. |
| V13-04 | Attempt to delete or shorten retention of an anchor object with the security-account administrator: refused by compliance mode. |
| V13-05 | Offline verification of a tenant bundle with only the published public key and TSA certificate succeeds; altered bundle fails. |
| V13-06 | Anchor objects and their metadata contain no tenant names, `tkey`s or personal data. |
| V13-07 | Stop the anchoring job: F-M-05 fires within 2 hours. |
| V13-08 | Null `ip_enc` and `pd_enc` on old entries (retention purge) and shred a subject key: `audit_verify` and the daily verification still pass; altering an `ip_hmac` fails at that entry. (rev P3) |
| V13-09 | With the primary TSA unreachable, anchoring continues through the second TSA and records it in the anchor metadata; the anchor and segment buckets and the `ks-snap` bucket are distinct, with their own retention (rev P4) |
| V13-10 | Read-only paths (`t_<tkey>_ro`, auditor and support views) append audit entries only through `audit_append`, and a direct INSERT on `audit_log_entry` by any tenant role fails with 42501 (2F F-ISO-11, F-ISO-12; P4-A2-09) (rev P4) |
