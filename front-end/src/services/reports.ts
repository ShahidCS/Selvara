/* Reports API stubs (source lines 3496-3525). Caller does wsLog/toast/bumpData.
 * A real API must generate reports server-side with the caller's permissions, own scheduling/recipients (validate addresses, restrict external
 * recipients) and distribution. */
import { nowStamp } from "@/lib/format";
import { SCHED_PACKS, SchedPack } from "@/lib/trustData";
import { apiFetch, viaApi } from "./http";

const send = <T,>(method: string, path: string, body?: unknown) =>
  apiFetch<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

/** source reportGenerate content (plain text, draft). */
export function generateReport(name: string) {
  return viaApi(() => "REPORT (DRAFT) — " + name + "\nGenerated " + nowStamp() + "\n\nSynthetic demo content. Requires review before distribution.",
    () => send<string>("POST", "/reports/generate", { name }));
}
export function saveSchedule(rec: SchedPack) {
  return viaApi(() => {
    const ex = SCHED_PACKS.find((p) => p.name === rec.name);
    if (ex) Object.assign(ex, rec); else SCHED_PACKS.unshift(rec);
    return rec;
  }, () => send<SchedPack>("PUT", "/reports/schedules", rec));
}
export function removeSchedule(i: number) {
  return viaApi(() => { const r = SCHED_PACKS[i]; if (r) SCHED_PACKS.splice(i, 1); return r || null; }, () => send<SchedPack | null>("DELETE", `/reports/schedules/${i}`));
}
