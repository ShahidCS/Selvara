/* Join requests: a company admin approves or rejects a person who asked to join (lib/session.ts). Deny by default, a reason is required, audited.
   The real API must do this server-side and send the outcome by email; nothing is sent here. */
import { wsLog } from "@/lib/audit";
import { clampText } from "@/lib/security";
import { JOIN, joinRequests, saveJoinRequests, type JoinRequest } from "@/lib/session";
import { assertRole, getActor, isSamePerson, SodError } from "@/lib/sod";
import { bumpData } from "@/lib/store";
import { apiFetch, viaApi } from "./http";

export const pendingJoins = () => joinRequests().filter((m) => m.status === "Pending");
export interface JoinRow { id: string; name: string; email: string; requestedAt: number }
/** Requests waiting for a decision. Production: GET /team/join-requests (company admins only). */
export const listPendingJoins = () => viaApi<JoinRow[]>(() => pendingJoins().map((m) => ({ id: m.id, name: m.name, email: m.email, requestedAt: m.requestedAt })), () => apiFetch<JoinRow[]>("/team/join-requests"));
export function decideJoin(id: string, decision: "approve" | "reject", reason: string) {
  return viaApi<JoinRequest>(() => {
    assertRole("decide a request to join", "admin");
    const m = joinRequests().find((x) => x.id === id);
    if (!m) throw new SodError("Request not found.");
    if (m.status !== "Pending") throw new SodError("That request has already been decided.");
    const me = getActor().name;
    if (isSamePerson(me, m.name)) throw new SodError("Segregation of duties: you cannot decide your own request to join.");
    const why = clampText(reason, 300); if (why.length < JOIN.REASON_MIN) throw new SodError(`Give a reason of at least ${JOIN.REASON_MIN} characters.`);
    m.status = decision === "approve" ? "Active" : "Rejected"; m.decidedBy = me; m.decidedAt = Date.now(); m.reason = why;
    saveJoinRequests();
    wsLog(decision === "approve" ? "team.join.approved" : "team.join.rejected", `${m.id}: ${m.name} <${m.email}> as Employee; reason: ${why}`, "Access"); bumpData();
    return m;
  }, async () => { // production: the server decides and audits; the lists reload
    const r = await apiFetch<{ id: string; status: string }>(`/team/join-requests/${encodeURIComponent(id)}/${decision}`, { method: "POST", body: JSON.stringify({ reason }) });
    bumpData(); return r as unknown as JoinRequest;
  });
}
