import { useState } from "react";
import { Icon } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { wsLog } from "@/lib/audit";
import { bumpData } from "@/lib/store";
import { clampText } from "@/lib/security";
import * as svc from "@/services/team";

/** Prototype: "settings" view. Selects apply immediately (with a toast); text fields apply on change (blur/Enter); "Save settings" only logs. */
export function SettingsTab({ manage }: { manage: boolean }) {
  const L = useLayer(); const T = svc.TEAM_SETTINGS;
  const [sla, setSla] = useState(T.controlSla); const [crit, setCrit] = useState(T.critSla);
  const pick = async (key: "reviewCycle" | "appetite", value: string, allowed: string[], label: string) => {
    if (!manage || !allowed.includes(value)) return;
    try { await svc.setSetting(key, value); L.toast(label + ": " + value); bumpData(); } catch { L.toast("Could not update the setting", false); }
  };
  const commit = async (key: "controlSla" | "critSla", raw: string) => {
    const v = clampText(raw, 40);
    if (!manage || v === T[key]) return;
    try { await svc.setSetting(key, v); bumpData(); } catch { L.toast("Could not update the setting", false); }
  };
  const save = async () => {
    try { await svc.saveSettings(); wsLog("team.settings.saved", "review cycles & SLAs", "System"); L.toast("Settings saved"); } catch { L.toast("Could not save the settings", false); }
  };
  const enter = (key: "controlSla" | "critSla", v: string) => (e: React.KeyboardEvent) => { if (e.key === "Enter") commit(key, v); };
  return (
    <div style={{ maxWidth: 640 }}>
      <div className="sectitle" style={{ marginTop: 0 }}>Review cycles, appetite and SLAs</div>
      <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="field"><label htmlFor="ts-cycle">Access/control review cycle</label><select className="select" id="ts-cycle" disabled={!manage} value={T.reviewCycle} onChange={(e) => pick("reviewCycle", e.target.value, svc.REVIEW_CYCLES, "Review cycle")}>{svc.REVIEW_CYCLES.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div className="field"><label htmlFor="ts-app">Risk appetite</label><select className="select" id="ts-app" disabled={!manage} value={T.appetite} onChange={(e) => pick("appetite", e.target.value, svc.APPETITES, "Appetite")}>{svc.APPETITES.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div className="field"><label htmlFor="ts-sla">Standard remediation SLA</label><input className="input" id="ts-sla" maxLength={40} readOnly={!manage} value={sla} onChange={(e) => setSla(e.target.value)} onBlur={() => commit("controlSla", sla)} onKeyDown={enter("controlSla", sla)} /></div>
        <div className="field"><label htmlFor="ts-crit">Critical remediation SLA</label><input className="input" id="ts-crit" maxLength={40} readOnly={!manage} value={crit} onChange={(e) => setCrit(e.target.value)} onBlur={() => commit("critSla", crit)} onKeyDown={enter("critSla", crit)} /></div>
      </div>
      {manage ? <button className="btn btn-primary sm" style={{ marginTop: 10 }} onClick={save}><Icon name="check" />Save settings</button> : <p className="field help" style={{ marginTop: 10 }}>Read-only for your role.</p>}
    </div>
  );
}
