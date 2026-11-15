import { useState } from "react";
import { Icon, Segmented } from "@/components/ui";
import { isBrand, type BrandId } from "@/lib/brand";
import { useLayer } from "@/hooks/useLayer";
import { wsLog } from "@/lib/audit";
import { bumpData } from "@/lib/store";
import { clampText } from "@/lib/security";
import * as svc from "@/services/team";
import { CredentialPolicy } from "./CredentialPolicy";
import { SignInProtection } from "./SignInProtection";

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
  const pickBrand = async (id: BrandId) => {
    if (!manage || id === T.brand) return;
    try { await svc.setBrand(id); L.toast("Workspace colour: " + (svc.BRAND_CHOICES.find((b) => b.id === id)?.label ?? id)); } catch { L.toast("Could not change the colour", false); }
  };
  const pickTrack = async (v: string) => {
    const n = Number(v); if (!manage || n === T.agentTrackRecord) return;
    try { await svc.setAgentTrackRecord(n); L.toast("AI agent track record: " + (svc.TRACK_RECORD_CHOICES.find((c) => c.value === n)?.label ?? v)); } catch { L.toast("Could not change the setting", false); }
  };
  const brand: BrandId = isBrand(T.brand) ? T.brand : "violet";
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
      <div className="sectitle" style={{ marginTop: 20 }}>Workspace colour</div>
      <p className="field help" style={{ margin: "0 0 8px", maxWidth: "62ch" }}>The accent colour of this workspace (buttons, links, selected items). Only the listed colours can be chosen: each is checked for readable text in the light and dark themes. Status colours, the Admin Console and the vendor portal do not change.</p>
      {manage ? (
        <Segmented<BrandId> label="Workspace colour" value={brand} onChange={pickBrand}
          options={svc.BRAND_CHOICES.map((b) => ({ value: b.id, text: b.label, label: <><span className="brand-sw" data-brand={b.id} aria-hidden="true" />{b.label}</> }))} />
      ) : <p style={{ margin: 0 }}><span className="brand-sw" data-brand={brand} aria-hidden="true" /> {svc.BRAND_CHOICES.find((b) => b.id === brand)?.label}. Only an admin can change it.</p>}
      <div className="sectitle" style={{ marginTop: 20 }}>AI agent track record</div>
      <p className="field help" style={{ margin: "0 0 8px", maxWidth: "62ch" }}>How many of an agent&apos;s suggestions a person must approve, with none of the latest that many rejected, before the agent can be raised to act on its own. Turn it off if your team is too small to build a record. Raising still always needs approval from a different admin or owner.</p>
      {manage ? (
        <Segmented<string> label="AI agent track record" value={String(T.agentTrackRecord)} onChange={pickTrack}
          options={svc.TRACK_RECORD_CHOICES.map((c) => ({ value: String(c.value), label: c.label }))} />
      ) : <p style={{ margin: 0 }}>{svc.TRACK_RECORD_CHOICES.find((c) => c.value === T.agentTrackRecord)?.label ?? "3 suggestions"}. Only an admin can change it.</p>}
      <SignInProtection manage={manage} />
      <CredentialPolicy manage={manage} />
      {manage ? <button className="btn btn-primary sm" style={{ marginTop: 10 }} onClick={save}><Icon name="check" />Save settings</button> : <p className="field help" style={{ marginTop: 10 }}>Read-only for your role.</p>}
    </div>
  );
}
