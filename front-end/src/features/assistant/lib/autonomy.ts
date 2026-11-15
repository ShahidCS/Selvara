/* Autonomy ladder for custom agents (phase 5, draft for compliance review: docs/security/SOD_MATRIX.md section 11).
   Rungs, lowest first. A paused agent is off whatever its rung. An agent climbs one rung at a time, only with a track record and a second person's
   approval; it is lowered at once by any admin or owner. */
export const LADDER = ["Suggests only", "Acts (logged)"] as const;
export type Rung = (typeof LADDER)[number];
export const RUNG_HELP: Record<Rung, string> = {
  "Suggests only": "Every change it proposes waits for a person to approve it.",
  "Acts (logged)": "Applies changes within its scope at once and records each one in the audit log.",
};
export const AUTONOMY = {
  /** Default track record: approved suggestions needed, and none of that many latest decided ones rejected. A company admin can set 3, 2 or 0 (off). */
  TRACK_DEFAULT: 3,
  REASON_MIN: 10,
  /** Agents that run as this identity need two approvers to be raised. */
  TWO_APPROVERS_FOR: "Service account",
};
/** A change an acting agent applied that a person rejected afterwards. It counts as a rejection and lowers the agent. */
export const REJECTED_AFTER = "Rejected after applying";
export const rungOf = (v: string): number => LADDER.indexOf(v as Rung);
export const isRung = (v: unknown): v is Rung => LADDER.includes(v as Rung);
export const nextRung = (v: string): Rung | null => { const i = rungOf(v); return i >= 0 && i < LADDER.length - 1 ? LADDER[i + 1] : null; };

export interface RunLike { agent: string; agentId?: string; decision: string }
const APPROVED = new Set(["Approved & applied", "Applied after review"]);
/** Track record from the run log: suggestions a person approved, and whether one of the latest decided ones was rejected. Runs are newest first. */
export function trackRecord(agent: { id: string; name: string }, runs: RunLike[], window = AUTONOMY.TRACK_DEFAULT) {
  const mine = runs.filter((r) => (r.agentId ? r.agentId === agent.id : r.agent === agent.name));
  const rejected = (r: RunLike) => r.decision === "Rejected" || r.decision === REJECTED_AFTER;
  const decided = mine.filter((r) => APPROVED.has(r.decision) || rejected(r));
  return {
    approved: decided.filter((r) => APPROVED.has(r.decision)).length,
    recentRejection: window > 0 && decided.slice(0, window).some(rejected),
  };
}
