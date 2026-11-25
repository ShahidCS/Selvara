import { SelectList } from "@/components/ui";
import { useState } from "react";
import { LayerFoot } from "@/hooks/useLayer";
import type { LayerApi } from "@/components/shell/LayerProvider";
import { DATA } from "@/lib/data";
import { wsLog } from "@/lib/audit";
import { bumpData } from "@/lib/store";
import { clampText } from "@/lib/security";
import { REPORT_FREQ, SCHED_PACKS } from "@/lib/trustData";
import { API_ON } from "@/lib/rbac";
import * as svc from "@/features/reports/services/reports";
import { attempt } from "@/components/kit/sodKit";


/* ---- schedule a report (source reportSchedule / reportDoSchedule) ---- */
export function ScheduleForm({ L, initial }: { L: LayerApi; /** Preselects this stored report. */ initial?: string }) {
  const [name, setName] = useState(initial && DATA.reports.some((r) => r.name === initial) ? initial : DATA.reports[0]?.name ?? "");
  const [freq, setFreq] = useState("Monthly");
  const [day, setDay] = useState(""); const [custom, setCustom] = useState(""); const [recip, setRecip] = useState(""); const [reason, setReason] = useState("");
  const ext = svc.externalRecipients(recip);
  const replacesExternal = API_ON && !!SCHED_PACKS.find((p) => p.name === name)?.external && !ext.length;
  const submit = () => attempt(L, async () => {
    // enum checks: pack must be a stored report, frequency one of REPORT_FREQ
    if (!DATA.reports.some((r) => r.name === name) || !REPORT_FREQ.includes(freq)) return;
    const detail = freq === "Custom" ? clampText(custom, 120) : freq === "On demand" ? "" : clampText(day, 120);
    const rec = { name, freq, detail, recip: clampText(recip, 300) || "—", next: freq === "On demand" ? "—" : "Scheduled" };
    const out = await svc.saveSchedule(rec, reason);
    if (out.pending) { wsLog("report.schedule_requested", name + " · " + freq + " (external: " + svc.externalRecipients(rec.recip).join(", ") + ")", "System"); L.closeLayer(); L.toast("External distribution needs approval from a different admin"); bumpData(); return; }
    wsLog("report.scheduled", name + " · " + freq + (detail ? " (" + detail + ")" : ""), "System");
    L.closeLayer(); L.toast("Report schedule saved"); bumpData();
  });
  return (
    <>
      <div>
        <div className="field"><label htmlFor="rs-name">Report pack</label><SelectList className="select" id="rs-name" value={name} onChange={(e) => setName(e.target.value)}>{DATA.reports.map((r) => <option key={r.name}>{r.name}</option>)}</SelectList></div>
        <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div className="field"><label htmlFor="rs-freq">Frequency</label><SelectList className="select" id="rs-freq" value={freq} onChange={(e) => setFreq(e.target.value)}>{REPORT_FREQ.map((f) => <option key={f}>{f}</option>)}</SelectList></div>
          {/* one field for when it is sent: "Send on" for a fixed frequency, "Custom schedule" for Custom, none for On demand */}
          {freq === "Custom" ? <div className="field" id="rs-custom-wrap"><label htmlFor="rs-custom">Custom schedule</label><input className="input" id="rs-custom" maxLength={120} placeholder="e.g. Every 6 weeks" value={custom} onChange={(e) => setCustom(e.target.value)} /></div>
            : freq === "On demand" ? null
            : <div className="field" id="rs-day-wrap"><label htmlFor="rs-day">Send on</label><input className="input" id="rs-day" maxLength={120} placeholder="e.g. 1st of month, Monday 09:00" value={day} onChange={(e) => setDay(e.target.value)} /></div>}
        </div>
        <div className="field"><label htmlFor="rs-recip">Recipients</label><input className="input" id="rs-recip" maxLength={300} placeholder="e.g. Board, Risk Committee, auditor@firm.example" value={recip} onChange={(e) => setRecip(e.target.value)} /></div>
        <p className="field help">Packs are generated as draft and require review before distribution.</p>
        {ext.length ? <p className="field help" role="status">{API_ON ? `Recipients outside your company (${ext.join(", ")}, unless on your company's email domain) need a different admin's approval before the schedule starts.` : `External recipient${ext.length > 1 ? "s" : ""} (${ext.join(", ")}): this schedule starts only after a different admin approves it.`}</p> : null}
        {replacesExternal ? <div className="field"><label htmlFor="rs-reason">Reason for replacing the external distribution (at least 10 characters)</label><input className="input" id="rs-reason" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /></div> : null}
        {API_ON ? <p className="field help">Email delivery starts once your administrator sets up email; until then generate packs here and share them yourself.</p> : null}
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={() => L.closeLayer()}>Cancel</button><button className="btn btn-primary" onClick={submit}>Save schedule</button></LayerFoot>
    </>
  );
}

/* ---- confirm before removing an internal schedule (removal cannot be undone from here) ---- */
export function ConfirmRemoveSchedule({ L, i, run }: { L: LayerApi; i: number; run: () => void }) {
  const r = SCHED_PACKS[i];
  return (
    <>
      <div><p style={{ margin: 0 }}>Remove the {r?.freq.toLowerCase()} schedule for <strong>{r?.name}</strong>{r?.recip && r.recip !== "—" ? <> sent to {r.recip}</> : null}? It will no longer be generated or sent. You can schedule it again later.</p></div>
      <LayerFoot><button className="btn btn-secondary" onClick={() => L.closeLayer()}>Cancel</button><button className="btn btn-danger" data-focus onClick={() => { L.closeLayer(); run(); }}>Remove schedule</button></LayerFoot>
    </>
  );
}

/* ---- remove a schedule that sends outside the company (production): a reason is recorded ---- */
export function RemoveScheduleForm({ L, i }: { L: LayerApi; i: number }) {
  const [reason, setReason] = useState("");
  const r = SCHED_PACKS[i];
  const submit = () => attempt(L, async () => {
    await svc.removeSchedule(i, reason); L.closeLayer(); L.toast("Schedule removed"); bumpData();
  });
  return (
    <>
      <div>
        <p className="field help">{r?.name} is sent to {r?.recip}. Removing it is recorded with your reason.</p>
        <div className="field"><label htmlFor="rs-rm-reason">Reason (at least 10 characters)</label><input className="input" id="rs-rm-reason" data-focus maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={() => L.closeLayer()}>Cancel</button><button className="btn btn-danger" onClick={submit}>Remove schedule</button></LayerFoot>
    </>
  );
}
