/* Frameworks actions (scope, snooze, add, requirement mapping and applicability). The demonstration changes the in-memory state as before; in
 * production each goes to the server, which checks the same rules (src/lib/rulesWs.ts), keeps the requirement and control mappings in step,
 * records the audit entry, and the workspace reloads. Contract: docs/architecture/inventory/group1-frameworks-controls-evidence.md, section 1. */
import { DATA, refreshFrameworkCounts } from "@/lib/data";
import { clearReqNA, fwCanAdmin, fwEdits, fwScopeIn, registerFrameworkReqs, seedReqCtrl, seedReqCtrlFw, setReqNA, toggleReqControl, touchFw, fwReqControls } from "@/lib/frameworks";
import { getMe, wsLog } from "@/lib/audit";
import { nowStamp } from "@/lib/format";
import { SodError } from "@/lib/sod";
import { bumpData } from "@/lib/store";
import { fwAdminBlock, fwIdFor, fwNaBlock } from "@/lib/rulesWs";
import { getActor } from "@/lib/sod";
import { viaApi } from "@/services/http";
import { wsPost } from "@/services/ws";
import { FW_DOM } from "../lib/fwTemplates";

const enc = encodeURIComponent;
const need = () => { const why = fwAdminBlock(getActor().base); if (why || !fwCanAdmin()) throw new SodError(why || "Not permitted."); };

export function setScope(id: string, on: boolean) {
  return viaApi(() => { need(); fwEdits.get().SCOPE[id] = on; wsLog("framework.scope." + (on ? "in" : "out"), id, "Control"); touchFw(); }, () => wsPost<void>(`/ws/frameworks/${enc(id)}/scope`, { on }));
}
export const toggleScope = (id: string) => setScope(id, !fwScopeIn(id));
export function toggleSnooze(id: string) {
  const on = !fwEdits.get().SNOOZE[id];
  return viaApi(() => { need(); fwEdits.get().SNOOZE[id] = on; wsLog("framework." + (on ? "snoozed" : "resumed"), id, "Control"); touchFw(); }, () => wsPost<void>(`/ws/frameworks/${enc(id)}/snooze`, { on }));
}

export interface NewFramework { template: string | null; short: string; name: string; kind: string; region: string; version: string; lines: string[] }
/** Adds a framework to the company's library. Returns its id. */
export function addFramework(f: NewFramework) {
  const sh = f.short.trim().slice(0, 40); const fn = (f.name || sh).trim().slice(0, 120);
  if (!sh) return Promise.reject(new SodError("Give the framework a short name."));
  const id = fwIdFor(sh, f.template);
  if (DATA.frameworks.some((x) => x.id === id)) return Promise.reject(new SodError("That framework is already in the library."));
  return viaApi(() => {
    need();
    const reqs = f.lines.map((l, i) => { const m = FW_DOM.find((x) => x[1].test(l)); return ["R" + (i + 1), l.slice(0, 200), "", m ? "Maps to " + m[0] + " control domain." : "No existing control domain matched; a new control is needed."]; });
    registerFrameworkReqs(id, reqs);
    const mapped = reqs.filter((r) => /Maps to/.test(r[3])).length; const pct = reqs.length ? Math.round((mapped / reqs.length) * 100) : 0;
    DATA.frameworks.push({ id, name: fn, kind: f.kind, region: (f.region || "Global").trim(), version: f.version, pct, controls: 0, gaps: reqs.length - mapped, audit: "New, mapping draft", mapped: 0 });
    refreshFrameworkCounts();
    if (!fwEdits.get().REQ_CTRL) seedReqCtrl(); seedReqCtrlFw(id);
    wsLog("framework.added", fn, "Control"); bumpData(); touchFw();
    return id;
  }, () => wsPost<{ id: string }>("/ws/frameworks", { template: f.template, short: sh, name: fn, kind: f.kind, region: f.region, version: f.version, lines: f.lines }).then((r) => r.id));
}

/** Maps the control on the requirement, or unmaps it if it is mapped. */
export function toggleRequirementControl(fwId: string, reqId: string, ctrlId: string): Promise<"mapped" | "unmapped"> {
  const mapped = fwReqControls(fwId, reqId).some((c) => c.id === ctrlId);
  return viaApi(() => {
    need();
    const res = toggleReqControl(fwId, reqId, ctrlId, getMe().name, nowStamp().slice(0, 10));
    wsLog(res === "unmapped" ? "framework.req.unmap" : "framework.req.map", fwId + " " + reqId + (res === "unmapped" ? " ✕ " : " ← ") + ctrlId, "Control"); touchFw();
    return res;
  }, () => wsPost<void>(`/ws/frameworks/${enc(fwId)}/requirements/${enc(reqId)}/map`, { control: ctrlId, on: !mapped }).then(() => (mapped ? "unmapped" : "mapped") as "mapped" | "unmapped"));
}
export function markNotApplicable(fwId: string, reqId: string, reason: string) {
  const why = reason.trim(); const bad = fwNaBlock(why); if (bad) return Promise.reject(new SodError(bad));
  return viaApi(() => { need(); setReqNA(fwId, reqId, why, getMe().name, nowStamp().slice(0, 10)); wsLog("framework.req.na", fwId + " " + reqId, "Control"); touchFw(); },
    () => wsPost<void>(`/ws/frameworks/${enc(fwId)}/requirements/${enc(reqId)}/na`, { on: true, reason: why }));
}
export function makeApplicable(fwId: string, reqId: string) {
  return viaApi(() => { need(); if (clearReqNA(fwId, reqId)) { wsLog("framework.req.applicable", fwId + " " + reqId, "Control"); touchFw(); } },
    () => wsPost<void>(`/ws/frameworks/${enc(fwId)}/requirements/${enc(reqId)}/na`, { on: false }));
}
/** Records a gap-assessment export in the audit log (the file is built in the browser from data the person can already see). */
export function logGapExport(name: string, gaps: number) {
  const target = name + ", " + gaps + " gaps";
  return viaApi(() => { wsLog("framework.gap.exported", target, "Control"); }, () => wsPost<void>("/ws/exports", { action: "framework.gap.exported", target }));
}
