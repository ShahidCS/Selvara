import { useState } from "react";
import { LayerFoot } from "@/hooks/useLayer";
import type { LayerApi } from "@/components/shell/LayerProvider";
import { DATA } from "@/lib/data";
import { wsLog } from "@/lib/audit";
import { bumpData } from "@/lib/store";
import { clampText } from "@/lib/security";
import { REPORT_FREQ } from "@/lib/trustData";
import * as svc from "@/services/reports";
import { attempt } from "@/components/kit/sodKit";


/* ---- schedule a report (source reportSchedule / reportDoSchedule) ---- */
export function ScheduleForm({ L }: { L: LayerApi }) {
  const [name, setName] = useState(DATA.reports[0]?.name ?? "");
  const [freq, setFreq] = useState("Monthly");
  const [day, setDay] = useState(""); const [custom, setCustom] = useState(""); const [recip, setRecip] = useState("");
  const ext = svc.externalRecipients(recip);
  const submit = () => attempt(L, async () => {
    // enum checks: pack must be a stored report, frequency one of REPORT_FREQ
    if (!DATA.reports.some((r) => r.name === name) || !REPORT_FREQ.includes(freq)) return;
    const detail = freq === "Custom" ? clampText(custom, 120) : freq === "On demand" ? "" : clampText(day, 120);
    const rec = { name, freq, detail, recip: clampText(recip, 300) || "—", next: freq === "On demand" ? "—" : "Scheduled" };
    const out = await svc.saveSchedule(rec);
    if (out.pending) { wsLog("report.schedule_requested", name + " · " + freq + " (external: " + svc.externalRecipients(rec.recip).join(", ") + ")", "System"); L.closeLayer(); L.toast("External distribution needs approval from a different admin"); bumpData(); return; }
    wsLog("report.scheduled", name + " · " + freq + (detail ? " (" + detail + ")" : ""), "System");
    L.closeLayer(); L.toast("Report schedule saved"); bumpData();
  });
  return (
    <>
      <div>
        <div className="field"><label htmlFor="rs-name">Report pack</label><select className="select" id="rs-name" value={name} onChange={(e) => setName(e.target.value)}>{DATA.reports.map((r) => <option key={r.name}>{r.name}</option>)}</select></div>
        <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div className="field"><label htmlFor="rs-freq">Frequency</label><select className="select" id="rs-freq" value={freq} onChange={(e) => setFreq(e.target.value)}>{REPORT_FREQ.map((f) => <option key={f}>{f}</option>)}</select></div>
          <div className="field" id="rs-day-wrap" style={{ display: freq === "On demand" ? "none" : "block" }}><label htmlFor="rs-day">Send on</label><input className="input" id="rs-day" maxLength={120} placeholder="e.g. 1st of month, Monday 09:00" value={day} onChange={(e) => setDay(e.target.value)} /></div>
        </div>
        <div className="field" id="rs-custom-wrap" style={{ display: freq === "Custom" ? "block" : "none" }}><label htmlFor="rs-custom">Custom schedule</label><input className="input" id="rs-custom" maxLength={120} placeholder="e.g. Every 6 weeks, or a cron expression" value={custom} onChange={(e) => setCustom(e.target.value)} /></div>
        <div className="field"><label htmlFor="rs-recip">Recipients</label><input className="input" id="rs-recip" maxLength={300} placeholder="e.g. Board, Risk Committee, auditor@firm.example" value={recip} onChange={(e) => setRecip(e.target.value)} /></div>
        <p className="field help">Packs are generated as draft and require review before distribution.</p>
        {ext.length ? <p className="field help" role="status">External recipient{ext.length > 1 ? "s" : ""} ({ext.join(", ")}): this schedule starts only after a different admin approves it.</p> : null}
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={() => L.closeLayer()}>Cancel</button><button className="btn btn-primary" onClick={submit}>Save schedule</button></LayerFoot>
    </>
  );
}
