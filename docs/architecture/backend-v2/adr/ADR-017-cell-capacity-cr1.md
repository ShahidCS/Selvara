# ADR-017: Cell capacity rule CR-1

| | |
|---|---|
| Status | **Proposed** (rev P5, 2026-11-24). Records CR-1, adopted by the design authority (DA-10) and registered as DU-01. The owner confirms the measured value at the V2-R0 exit. |
| Date | 2026-11-24 |
| Workstream | 2A (placement), 2J (measurement), 2H (provisioning, alerts, cost) |
| Related | ADR-001 C1-04 and C1-05; DU-01, DU-08; A-07, A-11, A-15, A-60; risks R-12, R-55, R-64; P3-X3 §2.2; finding P4-A3-06 (3) |
| Detail | [P3-X3 §2.2](../phase3/P3-X3-nfr-registers.md); 2A A-PH-02, A-PH-03, A-NFR-09; 2J J-7.2 |

## Context

- Under ADR-001 every tenant is a schema in a shared cell (one Supabase project). The Postgres catalog grows with every schema (about 140 tables, 500 indexes and 800 to 850 `pg_class` rows per tenant, A-CN-09, estimates), and pooled server connections accumulate cache entries for every schema they touch.
- Before Phase 3 the design had three thresholds for opening a new cell: 300 (2A and the cost model), 500 (2J) and 0.6 × K. The number of cells drives cost (2H H-11), migration time (ADR-009) and operations for a two-person company.
- No measurement exists yet. The knee `K` is measured by J-PERF on the production compute size before the V2-R0 exit (DU-08).

## Options considered

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | A fixed count (300 or 500 schemas per cell) | Simple to state and to cost | Not grounded in measurement; ignores database size, latency and memory; 500 may already be past the knee |
| B | Measure first; open no external tenant until `K` is known | Grounded | Blocks provisioning design and cost planning until J-PERF runs; no rule for the trials and staging that run before |
| C (recommended) | **CR-1:** provisional `T` = 300 until `K` is measured, then `T` = floor_100(0.6 × K); secondary triggers mark a cell `Full` regardless of count; provision the next cell at 0.8 × `T`; refuse placement at `T` | One rule everywhere; safe before measurement; reacts to the real limiting factor, not only to count | More metrics to monitor; the provisional value may waste capacity or need lowering |
| D | A project per tenant above a size (the database-per-tenant model) | Strong isolation for large tenants | Already rejected for the general case by ADR-001; kept only as the dedicated cell (`dedicated_cell`, Enterprise, ADR-020) |

## Decision

Option **C**, as stated in P3-X3 §2.2:

1. `T` is the placement threshold in tenant schemas per shared cell. Warm-pool, canary, trial and `__r`/`__old` restore schemas count toward `T`.
2. **Until J-PERF measures `K`, `T` = 300 (provisional).** Afterwards `T` = floor_100(0.6 × K), never above 0.6 × K, recorded in `control.tenant_cells` and re-measured under J-7.2.5.
3. **Secondary triggers**, any one marks the cell `Full`: `pg_class` rows above 250,000; database size above 60% of the tier's disk; p95 above A-NFR-03/04 for 3 consecutive days at the shared-cell compute ceiling (Large); a full migration rollout above 45 minutes; pooler clients above 70% of the limit at peak after a compute upgrade; backend resident memory above 60% of RAM.
4. **Provision ahead** at 0.8 × `T` or at 80% of any secondary trigger (S3 digest alert, H-AL-03).
5. **Refuse at the threshold.** The control plane refuses to place a new tenant in a cell at or over `T` or marked `Full`; existing tenants stay. Placement also refuses any cell outside the tenant's residency set (2A A-PH-04).
6. Trials may use at most 10% of `T` of a cell concurrently (ADR-018).

## Consequences

- Cost per tenant at small scale depends on `T` (R-19, R-55). The cost model uses the provisional 300 until measured.
- The V2-R0 exit includes the J-PERF measurement and the owner's confirmation of `T` (DU-01).
- Every cell adds migration fan-out, monitoring and a KMS and backup footprint; a low `K` multiplies cells early (R-55).
- A dedicated cell does not count toward any shared cell's `T` (2I I-4.2.13).

## Security and privacy implications

- Capacity exhaustion is an availability threat to every tenant in a cell. Refusing placement at `T` and the secondary triggers keep a cell inside its measured envelope.
- The trial cap stops a trial flood from filling cells or the KMS key count (R-64).
- Placement and relocation also enforce residency (P4-A1-11), so capacity never pushes a tenant into a cell outside its region set.

## Verification

| ID | Check |
|---|---|
| V-017-1 | J-7.2: the knee `K` is measured on the production compute size with synthetic schemas; `T` is derived and recorded before the V2-R0 exit. |
| V-017-2 | Placement into a cell at `T`, marked `Full`, or outside the residency set is refused (control-plane test). |
| V-017-3 | Each secondary trigger, injected synthetically, marks the cell `Full` and raises the alert. |
| V-017-4 | Trial provisioning beyond 10% of `T` in one cell is refused. |
