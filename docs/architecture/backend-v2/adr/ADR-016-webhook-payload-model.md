# ADR-016: Thin webhook payloads, delivered from a transactional outbox

| | |
|---|---|
| Status | **Proposed** (rev P5, 2026-11-24). Records decision C-70 of 2C, recommended in DU-18. Owner acceptance pending, together with DU-37. |
| Date | 2026-11-24 |
| Workstream | 2C (owner of the detail); 2D (delivery job D-68), 2I (metering), 2F (egress, secrets), 2J (verification) |
| Related | DU-18, DU-17, 2C C-DR2; risk R-31; ADR-007 D7-6 (inbound billing webhooks, a different flow); finding P4-A3-06 (2) |
| Detail | [2C-api.md](../phase2/2C-api.md) §7 (C-70 to C-92) |

## Context

- Tenants subscribe endpoints to events from their own workspace (module M18): control status, evidence, policy, risk, issue, audit, vendor, access, member, approval, DSAR and incident events (C-71 to C-83).
- A webhook endpoint is configured by a tenant admin and may be wrong, compromised or later re-pointed. Whatever the payload carries leaves Selvara's controls the moment it is sent.
- Many events concern records that hold personal data or confidential free text (risks, incidents, DSARs, members).
- Customers already have an authorised API with object-level rules (2C §1.8).

## Options considered

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Full payloads: the resource snapshot after the change | Consumers need no follow-up call; simplest integration | Personal data and confidential text sent to an endpoint Selvara cannot vouch for; payload shape must follow every field change; per-object authorisation is bypassed |
| B (recommended) | **Thin payloads:** `{ id, type, occurredAt, apiVersion, resource: { type, id, ref }, changes: [field names], actorKind }`, no personal data and no free text; the consumer fetches detail through the API with its own key | A misconfigured endpoint learns ids and field names only; detail is always read through the authorised API, so object rules and audit apply; payload schema is small and stable | More API calls (R-31); consumers must hold an API key; slightly more integration work |
| C | Thin by default, with an opt-in "full payload" per endpoint under tenant four-eyes | Flexibility for customers who want fewer calls | Two schemas to maintain; the opt-in is the risky path and would need its own classification filter; harder to test that no E2 or personal field leaks |
| D | No webhooks; consumers poll an events API | No outbound traffic; no SSRF surface | Parity loss (M18 exists today); polling costs more API calls than option B |

## Decision

Option **B**, with these delivery rules (2C §7.2):

1. **Transactional outbox** (C-85): the change writes a `webhook_delivery` row per subscribed endpoint in the same tenant transaction; job D-68 sends. A failing endpoint never fails the change.
2. **Signing** (C-86): HMAC-SHA256 over `t + "." + body`, header `Selvara-Signature: t=,v1=`; receivers reject `t` older than 5 minutes; both signatures for 24 h during rotation.
3. **Secrets** (C-87): 32 random bytes in the secrets manager, referenced by name and version only; shown once; never in the database.
4. **Network** (C-88): https only; resolved addresses must be public; connection pinned to the checked address; no redirects; 10 s timeout; response body ignored beyond 4 KB.
5. **Retries, auto-disable, delivery log and volume limits** as C-89 to C-92 (7 attempts over about 45 h; disabled after 3 days of failure; 30-day delivery log; 50 deliveries per second per tenant).
6. **Metering** of the follow-up API calls stays as designed. Excluding calls made within 10 minutes of a delivery (DU-17) is deferred and monitored (R-31).

## Consequences

- Event schemas are part of the public API and are versioned with `apiVersion`.
- Consumers need an API key with read scopes for the resources they follow (C-M18-07).
- API usage rises for webhook consumers. If R-31 materialises, DU-17 is the lever.
- The outbox lives in the tenant schema, so delivery state is isolated, backed up and shredded with the tenant.

## Security and privacy implications

- No personal data, free text or E1/E2 value is ever in a payload; a contract lint on the event schemas enforces it.
- SSRF is treated by rule 4 and by the 2H egress design. Webhook delivery is the only tenant-configured outbound destination, so these controls are mandatory.
- Detail reads go through the API with its object rules (OBJ-*) and audit (F-EV), so the webhook cannot widen what an integration may see.
- `actorKind` reveals whether a human, system or API key acted, but no identity.

## Verification

| ID | Check |
|---|---|
| V-016-1 | Contract lint: every event schema contains only the thin fields; no field classed PD, C or E1/E2 in 2B-classification (build fails otherwise). |
| V-016-2 | The change and its `webhook_delivery` rows commit or roll back together; an endpoint failure never fails the change. |
| V-016-3 | Delivery to a private, loopback or link-local address, a redirect, or a DNS rebind is refused (J-SEC). |
| V-016-4 | Signature: a body or timestamp change fails verification; dual signatures during rotation. |
| V-016-5 | Auto-disable after 3 days of failures, with an admin notice; re-enable needs `api.manage`. |
