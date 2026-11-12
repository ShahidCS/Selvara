import { DATA, FW_SHORT } from "@/lib/data";
import { bumpData } from "@/lib/store";
import { wsLog } from "@/lib/audit";
import { getActor } from "@/lib/sod";
import { downloadText } from "@/lib/format";
import { StatusChip } from "@/components/ui";
import type { LayerApi } from "@/components/shell/LayerProvider";
import * as svc from "@/features/controls/services/controls";
import { uiMessage } from "@/lib/grcSod";
import { FormHandle, newForm, val, useErrFlag, REQ } from "./modalForm";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const testChip = (r: string) => <StatusChip s={r === "Pass" ? "Pass" : r === "Fail" ? "Fail" : "Needs evidence"} />;

export async function ctrlJira(L: LayerApi, id: string) {
  try {
    const { key } = await svc.createTicket(id);
    wsLog("control.jira.created", key + " for " + id, "Control");
    L.toast("Created Tasklane ticket " + key + " (demo)");
  } catch (e) { L.toast(uiMessage(e), false); }
}
export async function ctrlWorkpaper(L: LayerApi, id: string) {
  const txt = await svc.exportWorkpaper(id);
  downloadText(id + "-workpaper.txt", txt);
  wsLog("control.workpaper.exported", id, "Control");
  L.toast("Workpaper exported");
}

/* ---------------- attestation modal ---------------- */
function AttestBody({ h, c }: { h: FormHandle; c: any }) {
  const err = useErrFlag(h);
  return (
    <>
      <p style={{ margin: "0 0 8px" }}>The control owner confirms this control is designed appropriately and operating as intended for the current period.</p>
      <div className="field"><label htmlFor="ca-by">Attested by</label><input className="input" id="ca-by" value={getActor().name} readOnly /><p className="field help">Only the control owner ({c.owner}) can attest; the name is set from your sign-in.</p></div>
      <div className="field"><label htmlFor="ca-note">Statement {REQ}</label><textarea className="input" id="ca-note" rows={2} style={{ resize: "vertical" }} placeholder="e.g. Reviewed configuration and evidence; control operating effectively" ref={h.ref("note")} /></div>
      <p className="field help" id="ca-err" role={err ? "alert" : undefined} style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>A statement is required.</p>
    </>
  );
}
export function openAttestModal(L: LayerApi, id: string) {
  const c = DATA.controls.find((x) => x.id === id)!;
  const h = newForm();
  const submit = async () => {
    const note = val(h, "note").trim();
    if (!note) { h.showErr?.(); return; }
    try {
      await svc.attestControl(id, note);
      L.closeLayer(); L.toast("Attestation recorded"); bumpData();
    } catch (e) { L.toast(uiMessage(e), false); }
  };
  L.openModal("Record attestation, " + id, <AttestBody h={h} c={c} />,
    <><button className="btn btn-secondary" onClick={L.closeLayer}>Cancel</button><button className="btn btn-primary" onClick={submit}>Attest</button></>);
}

/* ---------------- add-mapping modal ---------------- */
function MappingBody({ h }: { h: FormHandle }) {
  const err = useErrFlag(h);
  return (
    <>
      <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="field"><label htmlFor="cm-fw">Framework</label><select className="select" id="cm-fw" ref={h.ref("fw")}>{DATA.frameworks.map((f) => <option key={f.id} value={f.id}>{FW_SHORT[f.id] || f.id}</option>)}</select></div>
        <div className="field"><label htmlFor="cm-ref">Requirement code {REQ}</label><input className="input" id="cm-ref" placeholder="e.g. A.8.9" ref={h.ref("ref")} /></div>
      </div>
      <p className="field help" id="cm-err" role={err ? "alert" : undefined} style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>Requirement code is required.</p>
    </>
  );
}
export function openMappingModal(L: LayerApi, id: string) {
  const h = newForm();
  const submit = async () => {
    const ref = val(h, "ref").trim();
    if (!ref) { h.showErr?.(); return; }
    const fw = val(h, "fw");
    try {
      await svc.addMapping(id, fw, ref);
      wsLog("control.mapping.added", id + " → " + FW_SHORT[fw] + " " + ref, "Control");
      L.closeLayer(); L.toast("Mapping added"); bumpData();
    } catch (e) { L.toast(uiMessage(e), false); }
  };
  L.openModal("Add mapping, " + id, <MappingBody h={h} />,
    <><button className="btn btn-secondary" onClick={L.closeLayer}>Cancel</button><button className="btn btn-primary" onClick={submit}>Add mapping</button></>);
}
