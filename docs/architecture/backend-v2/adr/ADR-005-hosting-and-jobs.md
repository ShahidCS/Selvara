# ADR-005: Hosting and jobs: Vercel API plus Supabase-native scheduling and queues plus one scanning container

| | |
|---|---|
| Status | Proposed |
| Date | 2026-11-23 |
| Owners | 2A / 2H |
| Related | Spine S1, S8; ADR-012 (scanner); A-13; `2H-infrastructure.md` H-1, H-2 |

## Context

Today the API runs as Next.js API routes on Vercel and there are no background jobs (E-10: expiry is checked when a record is read; F1-05). v2 needs durable jobs (S8 list), fair per-tenant scheduling, malware scanning, and privileged fleet operations (migrations, decommission drops). There is no operations team (Q-23), the stack is TypeScript and Node (Q-12), and no general cloud has been chosen (Q-11).

## Options considered

| Option | Description | Pros | Cons |
|---|---|---|---|
| A. Vercel functions for API and worker endpoints; Supabase Queues (pgmq) and `pg_cron` + `pg_net` for scheduling; one managed scanner container; GitHub Actions for privileged fleet jobs | Spine S1 | Keeps today's deploy and attestation pipeline; queues are transactional with business writes (same database); no servers to patch apart from one container; cheap at low scale | Function duration limits (300 s default, up to 800 s on Pro *(verify)*); Queues maturity uncertain *(verify)*; worker invocation depends on `pg_net` reaching Vercel |
| B. Container platform for API and workers (for example a managed container service) | Long-running Node processes | No duration limits; persistent pools; could use session features | Servers, scaling, patching and a second deploy path to attest; more cost at low scale; does not remove the need for the Vercel front end |
| C. Supabase Edge Functions for API and jobs | Deno functions next to the database | Close to the data; integrated scheduling | Rewrite of today's Node API; different runtime and libraries; splits the codebase; per-invocation limits *(verify)* |
| D. External queue SaaS (Redis-based or HTTP queue service) | Jobs outside Postgres | Mature tooling | Not transactional with the business change (needs an outbox anyway); another subprocessor holding job payloads |

## Decision

**Option A**, with:

1. Queues per job type in `ops` (pgmq). Messages carry `tkey`, job type and ids only. Enqueue happens inside the tenant transaction through `ops.emit`/`ops.enqueue`, which derive `tkey` from `current_user`.
2. `pg_cron` ticks every minute per queue class; `pg_net` calls `/api/internal/worker/<class>` with an HMAC (secret in Supabase Vault), timestamp and nonce. A Vercel Cron job is a watchdog that triggers the same endpoint if the last tick is older than 3 minutes *(verify Vercel Cron limits)*.
3. The worker reads a batch, schedules round-robin by `tkey` with per-tenant concurrency 1 to 2, enters each tenant through `router`, and stops at 80% of its time budget; unfinished work is re-queued with a continuation cursor.
4. Visibility timeout and dead-letter queue per job type; poison messages after 5 attempts alert S2.
5. Scanner: one always-on container in `workloads-prod` (ADR-012 chooses the engine), pulling by signed URL, posting signed verdicts.
6. Privileged and long jobs (tenant migrations, decommission drops, large restores) run in GitHub Actions environments with approval (SD-H1).
7. Fallback if Queues proves unsuitable: a plain `ops.job` table with `FOR UPDATE SKIP LOCKED`, same API.

## Consequences

- One codebase, one attested build for API and worker.
- Jobs are bounded to the function duration; every job type must be chunkable.
- The cell database carries queue load; queue tables are small and vacuumed; monitored in H-8.
- GitHub becomes part of the operational path for privileged jobs (availability dependency accepted; nothing user-facing waits on it).

## Security and privacy implications

- The worker uses the same router and roles as the API; no service role or superuser for tenant data.
- Worker endpoints accept only HMAC-signed calls; replay window 60 s; they are excluded from public routing and rate-limited.
- Job payloads contain no business content, so queue tables, dead letters and logs hold no tenant data beyond ids.
- Privileged credentials (CREATEROLE-equivalent function owner aside, migrator, drop) never reach the Vercel runtime.

## Verification

| ID | Check |
|---|---|
| V-005-01 | Load test: 300 tenants with due reminders, no tenant starves (max wait under 2 ticks), per-tenant concurrency respected |
| V-005-02 | Unsigned or replayed worker call is refused (401) |
| V-005-03 | Static check: queue payload schemas contain no free-text fields |
| V-005-04 | Kill the worker mid-batch: messages reappear after the visibility timeout and complete once (idempotency keys) |
| V-005-05 | Watchdog fires when `pg_cron` is disabled in staging |
| V-005-06 | Expiry sweeps run from jobs, not GET handlers (F1-05 closed) |
