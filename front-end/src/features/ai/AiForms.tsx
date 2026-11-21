import { useEffect, useRef, useState, type FormEvent } from "react";
import { Empty, FormActions, FormMessage, FormSection, Page } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";
import { DATA } from "@/lib/data";
import { bumpData, useApp, useData } from "@/lib/store";
import { useGo } from "@/lib/route";
import { hasRole } from "@/lib/sod";
import { FAIL_MSG, uiMessage } from "@/lib/grcSod";
import { AI_AUTONOMY, AI_SHADOW, AI_TIERS, aiFind, aiInit, aiLog } from "@/features/ai/lib/ai";
import * as svc from "@/features/ai/services/ai";
import { gridStyle } from "./AiModals";
import { API_ON } from "@/lib/rbac";
import { MemberSelect, myMemberId, useMembers } from "@/components/kit/MemberSelect";

/* eslint-disable @typescript-eslint/no-explicit-any */
const LIST = "/ws/ai";
const Req = () => <span style={{ color: "var(--bad-ink)" }}>*</span>;

/** `/ws/ai/new` (and `/ws/ai/new/:shadowId` to bring a discovered system into governance): register an AI system. It starts in the Controlled guardrail until classified. */
export function AiRegisterPage({ shadowId }: { shadowId: string | null }) {
  useData(); const role = useApp((s) => s.role);
  const L = useLayer(); const go = useGo();
  const sh = shadowId ? AI_SHADOW.find((x: any) => x.id === shadowId) : null;
  const init = { name: sh ? String(sh.name) : "", surface: sh ? String(sh.where || "") : "", tier: "Medium", model: "", provider: "", purpose: "", data: sh ? String(sh.data || "") : "", autonomy: AI_AUTONOMY[0], users: "", owner: DATA.people[0]?.name || "" };
  const [f, setF] = useState(init); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const members = useMembers(); const [ownerId, setOwnerId] = useState("");
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const dirty = !busy && (Object.keys(init) as (keyof typeof f)[]).some((k) => f[k] !== init[k]);
  const { allowLeave } = useUnsavedGuard(dirty, L);
  const ref = useRef<HTMLInputElement>(null); useEffect(() => { ref.current?.focus(); }, []);
  const back = { href: LIST, label: "AI governance" };
  if (!hasRole(role, "admin", "owner", ...(API_ON ? [] : ["analyst"]))) return <Page title="Register an AI system" back={back}><Empty icon="ai" title="You cannot do this">Only an admin, owner or analyst can register AI systems.</Empty></Page>;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      const r = await svc.registerSystem(API_ON ? { ...f, owner: "", ownerId: ownerId || myMemberId(members) } : f, shadowId);
      if (r.ok === false) { setBusy(false); setErr((r as { msg: string }).msg); ref.current?.focus(); return; }
      aiLog("ai.registered", r.name); allowLeave(); L.toast(r.name + " registered; classify it next"); bumpData();
      go(`${LIST}/${encodeURIComponent(r.id)}`);
    } catch (x) { setBusy(false); setErr(""); L.toast(uiMessage(x) || FAIL_MSG, false); }
  };
  return (
    <Page title="Register an AI system" sub="For AI the discovery sources did not capture, or to bring a discovered system into governance." back={back}>
      <div className="scroll rec-scroll"><form className="rec-form" onSubmit={submit} noValidate>
        <FormSection n={1} title="System" note="What it is and where it runs.">
          <div className="field"><label htmlFor="rN">Name <Req /></label><input ref={ref} className="input" id="rN" maxLength={120} placeholder="e.g. Fraud detection model" value={f.name} onChange={set("name")} aria-invalid={!!err} aria-describedby={err ? "rN-err" : undefined} />{err ? <FormMessage id="rN-err">{err}</FormMessage> : null}</div>
          <div style={gridStyle(12)}>
            <div className="field"><label htmlFor="rSurf">Surface</label><input className="input" id="rSurf" maxLength={120} placeholder="Where it runs" value={f.surface} onChange={set("surface")} /></div>
            <div className="field"><label htmlFor="rT">Risk tier (interim)</label><select className="select" id="rT" value={f.tier} onChange={set("tier")}>{AI_TIERS.map((t) => <option key={t}>{t}</option>)}</select></div>
          </div>
          <div style={gridStyle(12)}>
            <div className="field"><label htmlFor="rModel">Model</label><input className="input" id="rModel" maxLength={120} placeholder="e.g. LLM, in-house" value={f.model} onChange={set("model")} /></div>
            <div className="field"><label htmlFor="rProv">Provider</label><input className="input" id="rProv" maxLength={120} placeholder="In-house or vendor" value={f.provider} onChange={set("provider")} /></div>
          </div>
        </FormSection>
        <FormSection n={2} title="Use and data" note="What it does, what it can reach and how independent it is.">
          <div className="field"><label htmlFor="rP">Purpose</label><input className="input" id="rP" maxLength={200} placeholder="What it does" value={f.purpose} onChange={set("purpose")} /></div>
          <div className="field"><label htmlFor="rData">Data it can reach</label><input className="input" id="rData" maxLength={200} placeholder="e.g. Internal documents" value={f.data} onChange={set("data")} /></div>
          <div style={gridStyle(12)}>
            <div className="field"><label htmlFor="rAuto">Autonomy</label><select className="select" id="rAuto" value={f.autonomy} onChange={set("autonomy")}>{AI_AUTONOMY.map((t) => <option key={t}>{t}</option>)}</select></div>
            <div className="field"><label htmlFor="rUsers">Number of users</label><input className="input" id="rUsers" maxLength={40} placeholder="e.g. 20" value={f.users} onChange={set("users")} /></div>
          </div>
        </FormSection>
        <FormSection n={3} title="Ownership" note="Registering a system does not approve it.">
          {API_ON ? <MemberSelect id="rO" value={ownerId || myMemberId(members)} onChange={setOwnerId} help="The owner may change the system; they cannot confirm its classification or approve its assessment." />
            : <div className="field"><label htmlFor="rO">Owner</label><select className="select" id="rO" value={f.owner} onChange={set("owner")}>{DATA.people.map((p) => <option key={p.id || p.name}>{p.name}</option>)}</select></div>}
        </FormSection>
        <FormActions><button type="button" className="btn btn-secondary" onClick={() => go(LIST)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy}>Register</button></FormActions>
      </form></div>
    </Page>
  );
}

/** `/ws/ai/:id/edit`: change the name, purpose and governance basis. */
export function AiEditPage({ id }: { id: string }) {
  useData(); useApp((s) => s.role);
  const L = useLayer(); const go = useGo();
  const a = aiFind(id);
  const init = { n: String(a?.name ?? ""), p: String(a?.purpose ?? ""), b: String(a?.basis ?? "") };
  const [v, setV] = useState(init); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const dirty = !busy && (v.n !== init.n || v.p !== init.p || v.b !== init.b);
  const { allowLeave } = useUnsavedGuard(dirty, L);
  const ref = useRef<HTMLInputElement>(null); useEffect(() => { ref.current?.focus(); }, []);
  const rec = `${LIST}/${encodeURIComponent(id)}`; const back = { href: rec, label: "AI system" };
  if (!a) return <Page title="AI system not found" back={{ href: LIST, label: "AI governance" }}><Empty icon="ai" title="No such AI system">There is no AI system with the ID &ldquo;{id}&rdquo;.</Empty></Page>;
  aiInit(a);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      const r = await svc.editSystem(id, { name: v.n, purpose: v.p, basis: v.b });
      if (r.ok === false) { setBusy(false); setErr((r as { msg: string }).msg); return; }
      aiLog("ai.updated", a.name); allowLeave(); L.toast("System updated"); bumpData(); go(rec);
    } catch (x) { setBusy(false); setErr(""); L.toast(uiMessage(x) || FAIL_MSG, false); }
  };
  return (
    <Page title="Edit AI system" sub={a.name} back={back}>
      <div className="scroll rec-scroll"><form className="rec-form" onSubmit={submit} noValidate>
        <FormSection n={1} title="System" note="The service decides who may change it: the system owner, an admin or an owner.">
          <div className="field"><label htmlFor="aN">Name</label><input ref={ref} className="input" id="aN" maxLength={120} value={v.n} onChange={(e) => setV({ ...v, n: e.target.value })} aria-invalid={!!err} aria-describedby={err ? "aN-err" : undefined} /></div>
          <div className="field"><label htmlFor="aP">Purpose</label><input className="input" id="aP" maxLength={200} value={v.p} onChange={(e) => setV({ ...v, p: e.target.value })} /></div>
          <div className="field"><label htmlFor="aB">Governance basis</label><input className="input" id="aB" maxLength={200} value={v.b} onChange={(e) => setV({ ...v, b: e.target.value })} /></div>
        </FormSection>
        {err ? <FormMessage id="aN-err">{err}</FormMessage> : null}
        <FormActions><button type="button" className="btn btn-secondary" onClick={() => go(rec)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy}>Save</button></FormActions>
      </form></div>
    </Page>
  );
}
