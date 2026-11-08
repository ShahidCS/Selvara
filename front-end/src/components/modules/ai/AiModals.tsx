/* AI governance modals (source: aiRegister, aiEdit, aiClassify, aiAssign, aiGuard, aiEuClassify, aiFria, aiBias, aiOversight).
 * A modal replaces the drawer (one layer slot), so forms opened from the drawer take `reopen` and call it after saving, as the source did. */
import { useState } from "react";
import { LayerFoot, useLayer } from "@/components/shell/LayerProvider";
import type { LayerApi } from "@/components/shell/LayerProvider";
import { Icon } from "@/components/ui";
import { DATA } from "@/lib/data";
import { bumpData } from "@/lib/store";
import { AI_ANNEX_AREAS, AI_AUTONOMY, AI_BIAS_STATUSES, AI_FRIA_STATUSES, AI_GUARDRAILS, AI_ROLES, AI_SHADOW, AI_TIERS, aiFind, aiInit, aiLog } from "@/lib/ai";
import * as svc from "@/services/ai";
import { attempt } from "../issues/util";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Reopen = (() => void) | undefined;
const gridStyle = (gap: number) => ({ display: "grid", gridTemplateColumns: "1fr 1fr", gap });
const Foot = ({ L, label, onSave, icon }: { L: LayerApi; label: string; onSave: () => void; icon?: string }) => (
  <LayerFoot><button className="btn btn-secondary" onClick={() => L.closeLayer()}>Cancel</button><button className="btn btn-primary" onClick={onSave}>{icon ? <Icon name={icon} /> : null}{label}</button></LayerFoot>
);
const NotFound = () => <p className="field help">AI system not found.</p>;

/** Wraps a service call: failures show the source toast, exceptions a generic one (ASVS 7.4.1). */
function useAct() {
  const L = useLayer();
  return (p: () => Promise<svc.Res<any>>, ok: (r: any) => void) => attempt(L, async () => { const r = await p(); if (!r.ok) { L.toast(r.msg); return; } ok(r); });
}

/* ---------- register ---------- */
export function RegisterForm({ shadowId }: { shadowId: string | null }) {
  const L = useLayer(); const act = useAct();
  const sh = shadowId ? AI_SHADOW.find((x: any) => x.id === shadowId) : null;
  const [f, setF] = useState({ name: sh ? String(sh.name) : "", surface: sh ? String(sh.where || "") : "", tier: "Medium", model: "", provider: "", purpose: "", data: sh ? String(sh.data || "") : "", autonomy: AI_AUTONOMY[0], users: "", owner: DATA.people[0]?.name || "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const submit = () => act(() => svc.registerSystem(f, shadowId), (r) => {
    aiLog("ai.registered", r.name); L.closeLayer(); bumpData(); L.toast(r.name + " registered — classify it next");
  });
  return (
    <>
      <div>
        <p className="field help" style={{ margin: "0 0 12px" }}>For AI the discovery sources did not capture, or to bring a discovered system into governance. It starts in the Controlled guardrail until classified.</p>
        <div className="field" style={{ marginBottom: 12 }}><label htmlFor="rN">Name</label><input className="input" id="rN" data-focus maxLength={120} placeholder="e.g. Fraud detection model" value={f.name} onChange={set("name")} /></div>
        <div className="grid2" style={gridStyle(12)}>
          <div className="field"><label htmlFor="rSurf">Surface</label><input className="input" id="rSurf" maxLength={120} placeholder="Where it runs" value={f.surface} onChange={set("surface")} /></div>
          <div className="field"><label htmlFor="rT">Risk tier (interim)</label><select className="select" id="rT" value={f.tier} onChange={set("tier")}>{AI_TIERS.map((t) => <option key={t}>{t}</option>)}</select></div>
        </div>
        <div className="grid2" style={gridStyle(12)}>
          <div className="field"><label htmlFor="rModel">Model</label><input className="input" id="rModel" maxLength={120} placeholder="e.g. LLM, in-house" value={f.model} onChange={set("model")} /></div>
          <div className="field"><label htmlFor="rProv">Provider</label><input className="input" id="rProv" maxLength={120} placeholder="In-house or vendor" value={f.provider} onChange={set("provider")} /></div>
        </div>
        <div className="field"><label htmlFor="rP">Purpose</label><input className="input" id="rP" maxLength={200} placeholder="What it does" value={f.purpose} onChange={set("purpose")} /></div>
        <div className="field"><label htmlFor="rData">Data it can reach</label><input className="input" id="rData" maxLength={200} placeholder="e.g. Internal documents" value={f.data} onChange={set("data")} /></div>
        <div className="grid2" style={gridStyle(12)}>
          <div className="field"><label htmlFor="rAuto">Autonomy</label><select className="select" id="rAuto" value={f.autonomy} onChange={set("autonomy")}>{AI_AUTONOMY.map((t) => <option key={t}>{t}</option>)}</select></div>
          <div className="field"><label htmlFor="rUsers">Number of users</label><input className="input" id="rUsers" maxLength={40} placeholder="e.g. 20" value={f.users} onChange={set("users")} /></div>
        </div>
        <div className="field"><label htmlFor="rO">Owner</label><select className="select" id="rO" value={f.owner} onChange={set("owner")}>{DATA.people.map((p) => <option key={p.id || p.name}>{p.name}</option>)}</select></div>
      </div>
      <Foot L={L} label="Register" icon="plus" onSave={submit} />
    </>
  );
}
export const openRegister = (L: LayerApi, shadowId: string | null = null) => L.openModal("Register an AI system", () => <RegisterForm shadowId={shadowId} />);

/* ---------- edit ---------- */
function EditForm({ id }: { id: string }) {
  const L = useLayer(); const act = useAct(); const a = aiFind(id);
  const [n, setN] = useState(String(a?.name ?? "")); const [p, setP] = useState(String(a?.purpose ?? "")); const [b, setB] = useState(String(a?.basis ?? ""));
  if (!a) return <NotFound />;
  const save = () => act(() => svc.editSystem(id, { name: n, purpose: p, basis: b }), () => { aiLog("ai.updated", a.name); L.closeLayer(); bumpData(); L.toast("System updated"); });
  return (
    <>
      <div>
        <div className="field" style={{ marginBottom: 12 }}><label htmlFor="aN">Name</label><input className="input" id="aN" data-focus maxLength={120} value={n} onChange={(e) => setN(e.target.value)} /></div>
        <div className="field" style={{ marginBottom: 12 }}><label htmlFor="aP">Purpose</label><input className="input" id="aP" maxLength={200} value={p} onChange={(e) => setP(e.target.value)} /></div>
        <div className="field"><label htmlFor="aB">Governance basis</label><input className="input" id="aB" maxLength={200} value={b} onChange={(e) => setB(e.target.value)} /></div>
      </div>
      <Foot L={L} label="Save" onSave={save} />
    </>
  );
}
export function openEdit(L: LayerApi, id: string) { const a = aiFind(id); L.openModal(a ? "Edit " + a.name : "AI system", () => <EditForm id={id} />); }

/* ---------- classify (tier). Defined in the source but no control calls it ---------- */
function ClassifyForm({ id }: { id: string }) {
  const L = useLayer(); const act = useAct(); const a = aiFind(id);
  const [t, setT] = useState(String(a?.tier ?? "High"));
  if (!a) return <NotFound />;
  const save = () => act(() => svc.setTier(id, t), (r) => { aiLog("ai.classified", a.name); L.closeLayer(); bumpData(); L.toast("Risk tier set to " + r.tier); });
  return (
    <>
      <div>
        <div className="field"><label htmlFor="aT">Risk tier (EU AI Act / ISO 42001)</label><select className="select" id="aT" value={t} onChange={(e) => setT(e.target.value)}>{AI_TIERS.map((x) => <option key={x}>{x}</option>)}</select></div>
        <p className="field help" style={{ marginTop: 10 }}>High-risk systems require an impact assessment and human oversight before approval.</p>
      </div>
      <Foot L={L} label="Save" onSave={save} />
    </>
  );
}
export function openClassify(L: LayerApi, id: string) { const a = aiFind(id); L.openModal(a ? "Risk-classify " + a.name : "AI system", () => <ClassifyForm id={id} />); }

/* ---------- assign owner ---------- */
function AssignForm({ id }: { id: string }) {
  const L = useLayer(); const act = useAct(); const a = aiFind(id);
  // source: every person whose name contains the owner's surname is `selected`; in a single select the last one wins
  const init = () => { const last = String(a?.owner || "").split(" ").pop() as string; const m = DATA.people.filter((p) => p.name.includes(last)); return (m.length ? m[m.length - 1] : DATA.people[0])?.name || ""; };
  const [o, setO] = useState(init);
  if (!a) return <NotFound />;
  const save = () => act(() => svc.assignOwner(id, o), () => { aiLog("ai.owner.assigned", a.name); L.closeLayer(); bumpData(); L.toast("Owner assigned"); });
  return (
    <>
      <div className="field"><label htmlFor="aO">Owner</label><select className="select" id="aO" data-focus value={o} onChange={(e) => setO(e.target.value)}>{DATA.people.map((p) => <option key={p.id || p.name}>{p.name}</option>)}</select></div>
      <Foot L={L} label="Save" onSave={save} />
    </>
  );
}
export function openAssign(L: LayerApi, id: string) { const a = aiFind(id); L.openModal(a ? "Assign owner, " + a.name : "AI system", () => <AssignForm id={id} />); }

/* ---------- guardrail ---------- */
function GuardForm({ id, reopen }: { id: string; reopen: Reopen }) {
  const L = useLayer(); const act = useAct(); const a = aiFind(id);
  const [g, setG] = useState(String(a?.guardrail ?? AI_GUARDRAILS[0][0]));
  if (!a) return <NotFound />;
  const rule = (AI_GUARDRAILS.find((x) => x[0] === g) || AI_GUARDRAILS[0])[1];
  const save = () => act(() => svc.setGuardrail(id, g), (r) => { aiLog("ai.guardrail.set", a.name); L.closeLayer(); reopen?.(); bumpData(); L.toast("Guardrail tier set to " + r.guardrail); });
  return (
    <>
      <div>
        <div className="field"><label htmlFor="aG">Guardrail tier</label><select className="select" id="aG" data-focus value={AI_GUARDRAILS.some((x) => x[0] === g) ? g : AI_GUARDRAILS[0][0]} onChange={(e) => setG(e.target.value)}>{AI_GUARDRAILS.map((x) => <option key={x[0]}>{x[0]}</option>)}</select></div>
        <div id="aGrule" className="field help" style={{ marginTop: 4 }}>{rule}</div>
      </div>
      <Foot L={L} label="Save" onSave={save} />
    </>
  );
}
export function openGuard(L: LayerApi, id: string, reopen?: Reopen) {
  const a = aiFind(id); if (!a) return;
  L.openModal("Guardrail tier — " + a.name, () => <GuardForm id={id} reopen={reopen} />);
}

/* ---------- EU AI Act classification ---------- */
function EuForm({ id, reopen }: { id: string; reopen: Reopen }) {
  const L = useLayer(); const act = useAct(); const a = aiFind(id);
  const [P, setP] = useState("no"); const [H, setH] = useState("no"); const [area, setArea] = useState(AI_ANNEX_AREAS[0]); const [role, setRole] = useState("Deployer"); const [T, setT] = useState("yes");
  if (!a) return <NotFound />;
  const save = () => act(() => svc.saveEuDraft(id, { prohibited: P === "yes", high: H === "yes", transparency: T === "yes", area, role }), () => {
    aiLog("ai.euact.drafted", a.name); L.closeLayer(); reopen?.(); bumpData(); L.toast("Draft classification saved — a second person must confirm");
  });
  const hint = (t: string) => <span style={{ color: "var(--muted)", fontWeight: 400 }}>{t}</span>;
  return (
    <>
      <div>
        <p className="field help" style={{ margin: "0 0 12px" }}>Answer for this system. The result is a draft legal determination for a second person to confirm.</p>
        <div className="field"><label htmlFor="eqP">1. Does it use a prohibited practice? {hint("(Art. 5 — social scoring, manipulation, untargeted scraping, real-time remote biometric ID in public)")}</label><select className="select" id="eqP" value={P} onChange={(e) => setP(e.target.value)}><option value="no">No</option><option value="yes">Yes</option></select></div>
        <div className="field"><label htmlFor="eqH">2. Is it used in a high-risk area? {hint("(Annex III)")}</label><select className="select" id="eqH" value={H} onChange={(e) => setH(e.target.value)}><option value="no">No</option><option value="yes">Yes</option></select></div>
        <div className="grid2" style={gridStyle(10)}>
          <div className="field"><label htmlFor="eqArea">Annex III area</label><select className="select" id="eqArea" value={area} onChange={(e) => setArea(e.target.value)}>{AI_ANNEX_AREAS.map((x) => <option key={x}>{x}</option>)}</select></div>
          <div className="field"><label htmlFor="eqRole">Our role</label><select className="select" id="eqRole" value={role} onChange={(e) => setRole(e.target.value)}>{AI_ROLES.map((x) => <option key={x}>{x}</option>)}</select></div>
        </div>
        <div className="field"><label htmlFor="eqT">3. Does it interact with people or generate content? {hint("(Art. 50 transparency)")}</label><select className="select" id="eqT" value={T} onChange={(e) => setT(e.target.value)}><option value="yes">Yes</option><option value="no">No</option></select></div>
      </div>
      <Foot L={L} label="Save draft classification" onSave={save} />
    </>
  );
}
export function openEuClassify(L: LayerApi, id: string, reopen?: Reopen) {
  const a = aiFind(id); if (!a) return;
  aiInit(a);
  L.openModal("EU AI Act classification — " + a.name, () => <EuForm id={id} reopen={reopen} />);
}

/* ---------- impact assessment ---------- */
function FriaForm({ id, reopen }: { id: string; reopen: Reopen }) {
  const L = useLayer(); const act = useAct(); const a = aiFind(id); const f = (a && a.fria) || {};
  const [st, setSt] = useState(String(f.status ?? AI_FRIA_STATUSES[0])); const [sum, setSum] = useState(String(f.summary ?? ""));
  if (!a) return <NotFound />;
  const save = () => act(() => svc.saveFria(id, { status: st, summary: sum }), () => { aiLog("ai.impact_assessment.recorded", a.name); L.closeLayer(); reopen?.(); bumpData(); L.toast("Impact assessment saved as draft"); });
  return (
    <>
      <div>
        <div className="field" style={{ marginBottom: 12 }}><label htmlFor="aFs">Status</label><select className="select" id="aFs" value={AI_FRIA_STATUSES.includes(st) ? st : AI_FRIA_STATUSES[0]} onChange={(e) => setSt(e.target.value)}>{AI_FRIA_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>
        <div className="field"><label htmlFor="aFsum">Summary of findings</label><textarea className="input" id="aFsum" rows={3} maxLength={2000} style={{ resize: "vertical" }} value={sum} onChange={(e) => setSum(e.target.value)} /></div>
        <p className="field help">Draft — needs human review before reliance.</p>
      </div>
      <Foot L={L} label="Save" onSave={save} />
    </>
  );
}
export function openFria(L: LayerApi, id: string, reopen?: Reopen) {
  const a = aiFind(id); if (!a) return;
  aiInit(a);
  L.openModal("Record impact assessment — " + a.name, () => <FriaForm id={id} reopen={reopen} />);
}

/* ---------- bias test ---------- */
function BiasForm({ id, reopen }: { id: string; reopen: Reopen }) {
  const L = useLayer(); const act = useAct(); const a = aiFind(id); const b = (a && a.bias) || {};
  const [st, setSt] = useState(String(b.status ?? AI_BIAS_STATUSES[0])); const [n, setN] = useState(String(b.result ?? ""));
  if (!a) return <NotFound />;
  const save = () => act(() => svc.saveBias(id, { status: st, notes: n }), () => { aiLog("ai.bias_test.logged", a.name); L.closeLayer(); reopen?.(); bumpData(); L.toast("Bias / validation test logged (draft)"); });
  return (
    <>
      <div>
        <div className="field" style={{ marginBottom: 12 }}><label htmlFor="aBs">Result</label><select className="select" id="aBs" value={AI_BIAS_STATUSES.includes(st) ? st : AI_BIAS_STATUSES[0]} onChange={(e) => setSt(e.target.value)}>{AI_BIAS_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>
        <div className="field"><label htmlFor="aBn">Notes</label><textarea className="input" id="aBn" rows={3} maxLength={2000} style={{ resize: "vertical" }} value={n} onChange={(e) => setN(e.target.value)} /></div>
      </div>
      <Foot L={L} label="Save" onSave={save} />
    </>
  );
}
export function openBias(L: LayerApi, id: string, reopen?: Reopen) {
  const a = aiFind(id); if (!a) return;
  aiInit(a);
  L.openModal("Log bias / validation test — " + a.name, () => <BiasForm id={id} reopen={reopen} />);
}

/* ---------- oversight ---------- */
function OversightForm({ id, reopen }: { id: string; reopen: Reopen }) {
  const L = useLayer(); const act = useAct(); const a = aiFind(id);
  const [t, setT] = useState(((a && a.oversight) || []).join("\n"));
  if (!a) return <NotFound />;
  const save = () => act(() => svc.saveOversight(id, t), () => { aiLog("ai.oversight.updated", a.name); L.closeLayer(); reopen?.(); bumpData(); L.toast("Oversight measures updated"); });
  return (
    <>
      <div className="field"><label htmlFor="aOv">One measure per line</label><textarea className="input" id="aOv" rows={5} style={{ resize: "vertical" }} value={t} onChange={(e) => setT(e.target.value)} /></div>
      <Foot L={L} label="Save" onSave={save} />
    </>
  );
}
export function openOversight(L: LayerApi, id: string, reopen?: Reopen) {
  const a = aiFind(id); if (!a) return;
  aiInit(a);
  L.openModal("Human oversight measures — " + a.name, () => <OversightForm id={id} reopen={reopen} />);
}
