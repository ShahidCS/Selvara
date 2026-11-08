# Commitments module checklist

Source: lines 3479-3495 (`INCIDENT`, `STANDARD_TERMS`, `REND.commitments`, incident and contract functions). React: `CommitmentsModule.tsx`, `commitments/CommitmentLayers.tsx`, `src/services/commitments.ts`. State: `src/lib/trustData.ts` (`INCIDENT`, `STANDARD_TERMS`, seeded from `src/data/trustSeed.json`). `DATA.commitments` already existed.

| source feature | source lines | React file | status | notes |
|---|---|---|---|---|
| Incident banner (started time, 48h notice text, Close incident) | 3482 | `CommitmentsModule` | done | `role="alert"` added |
| Commitments table + "Run contract analysis" | 3484 | `CommitmentsModule` | done | |
| Standard terms table | 3485 | `CommitmentsModule` | done | |
| Page actions Import contract / Start incident (hidden while incident active) | 3487 | `CommitmentsModule` | done | |
| Start incident modal (summary), danger button, log `incident.started`, toast | 3489-3490 | `StartIncidentForm`, `svc.startIncident` | done | adminLog not ported (see OQ 1) |
| Close incident: log `incident.closed`, toast | 3491 | `CommitmentsModule` | done | |
| Contract analysis modal (4 findings, draft disclaimer), log `contract.analysis.run` | 3492 | `openAnalysis` | done | static synthetic result |
| Import contract modal, "Contract name is required.", default detail "Imported contract", status Review, log `contract.imported` | 3493-3494 | `ImportContractForm` | done | |

## Open questions
1. Source also called `adminLog("incident.started", summary, {categories:["Incident"], basis:"Legal obligation"})` (platform admin chain). No `adminLog` exists yet in `src/lib` (AdminLog module is another phase); only a comment marks the spot in `CommitmentLayers.tsx`. Wire it when that module lands.
2. Incident state is a single global flag (not per tenant), starting/closing are not role-gated, and the clock is only a start timestamp (no countdown or notification).
3. Source logs the raw (untrimmed) summary or "incident drill"; ported with clamp(200).
4. Analysis findings are fixed text containing "Globex"/"one MSA", not computed from DATA.commitments.

## Security notes
* Starting/closing an incident and importing contracts are UI-only gated. The API must restrict them, use server time for the breach clock, and write the incident to an immutable log (legal obligation).
* Contract data is confidential: tenant isolation and authorization on the API; no contract files are uploaded or parsed in the prototype.
* Analysis output is advisory ("Legal review required"); it is not a legal determination. All text renders as React text; inputs clamped.
