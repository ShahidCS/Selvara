import { DATA } from "@/lib/data";
import { bumpData } from "@/lib/store";
import { wsLog } from "@/lib/audit";
import type { LayerApi } from "@/components/shell/LayerProvider";
import * as svc from "@/services/controls";
import { FormHandle, newForm, val, useErrFlag, REQ } from "./modalForm";

function ControlBody({ h }: { h: FormHandle }) {
  const err = useErrFlag(h);
  return (
    <>
      <div className="field"><label htmlFor="cc-title">Control title {REQ}</label><input className="input" id="cc-title" placeholder="e.g. Secrets rotated every 90 days" ref={(e) => { h.els.title = e; }} /></div>
      <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="field"><label htmlFor="cc-dom">Domain</label><select className="select" id="cc-dom" ref={(e) => { h.els.dom = e; }}>{svc.CONTROL_DOMAINS.map((d) => <option key={d}>{d}</option>)}</select></div>
        <div className="field"><label htmlFor="cc-owner">Owner</label><input className="input" id="cc-owner" defaultValue="J. Avery" ref={(e) => { h.els.owner = e; }} /></div>
      </div>
      <p className="field help" id="cc-err" role={err ? "alert" : undefined} style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>Control title is required.</p>
    </>
  );
}
export function openCreateControl(L: LayerApi) {
  const h = newForm();
  const submit = async () => {
    const t = val(h, "title").trim();
    if (!t) { h.showErr?.(); return; }
    const { id } = await svc.createControl({ title: t, domain: val(h, "dom"), owner: val(h, "owner").trim() });
    wsLog("control.created", id + ", " + t, "Control");
    L.closeLayer(); L.toast("Custom control " + id + " created"); bumpData();
  };
  L.openModal("Add custom control", <ControlBody h={h} />,
    <><button className="btn btn-secondary" onClick={L.closeLayer}>Cancel</button><button className="btn btn-primary" onClick={submit}>Create control</button></>);
}

function TestBody({ h, ctrlOpts }: { h: FormHandle; ctrlOpts: string[] }) {
  const err = useErrFlag(h);
  return (
    <>
      <div className="field"><label htmlFor="tc-name">Test name {REQ}</label><input className="input" id="tc-name" placeholder="e.g. Object storage buckets are private" ref={(e) => { h.els.name = e; }} /></div>
      <div className="field"><label htmlFor="tc-logic">Condition each resource must meet</label><textarea className="input" id="tc-logic" rows={2} style={{ resize: "vertical" }} placeholder="e.g. bucket.public = false" ref={(e) => { h.els.logic = e; }} /></div>
      <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="field"><label htmlFor="tc-src">Source</label><input className="input" id="tc-src" defaultValue="Custom" ref={(e) => { h.els.src = e; }} /></div>
        <div className="field"><label htmlFor="tc-ctrl">Supports control</label><select className="select" id="tc-ctrl" ref={(e) => { h.els.ctrl = e; }}>{ctrlOpts.map((c) => <option key={c}>{c}</option>)}</select></div>
      </div>
      <p className="field help" id="tc-err" role={err ? "alert" : undefined} style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>Test name is required.</p>
    </>
  );
}
export function openCreateTest(L: LayerApi) {
  const ctrlOpts = DATA.controls.slice(0, 40).map((c) => c.id as string);
  const h = newForm();
  const submit = async () => {
    const name = val(h, "name").trim();
    if (!name) { h.showErr?.(); return; }
    const { id } = await svc.createTest({ name, source: val(h, "src").trim(), control: val(h, "ctrl"), logic: val(h, "logic").trim() });
    wsLog("test.created", name, "Control");
    L.closeLayer(); L.toast("Custom test " + id + " created"); bumpData();
  };
  L.openModal("Build custom test", <TestBody h={h} ctrlOpts={ctrlOpts} />,
    <><button className="btn btn-secondary" onClick={L.closeLayer}>Cancel</button><button className="btn btn-primary" onClick={submit}>Create test</button></>);
}
