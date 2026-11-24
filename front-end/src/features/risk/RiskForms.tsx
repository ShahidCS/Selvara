/* Add-risk and add-action modals (source riskFormBody/riskRead/riskCreate/riskSave 2771-2783 and riskAddAction/riskDoAddAction 2708-2709). */
import { useState } from "react";
import { LayerFoot, useLayer } from "@/components/shell/LayerProvider";
import { wsLog } from "@/lib/audit";
import { Ib, Lb, RISK_CATS, RISK_TREATS } from "@/lib/risk";
import { API_ON } from "@/lib/rbac";
import { MemberSelect, myMemberId, useMembers } from "@/components/kit/MemberSelect";
import { bumpData, setModState } from "@/lib/store";
import { Icon } from "@/components/ui";
import { PrefillBanner, usePrefilled } from "@/components/kit/PrefillBanner";
import * as svc from "@/features/risk/services/risks";
import { K_SEL, K_TAB } from "./nav";
import { attemptR, attemptR as attempt } from "./util";

const Req = () => <span style={{ color: "var(--bad-ink)" }}>*</span>;
const grid2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } as const;
const ScaleOpts = () => <>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} · {Lb[n - 1]}</option>)}</>;
/** Impact uses its own scale (Insignificant to Severe), never the likelihood words. */
const ImpactOpts = () => <>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} · {Ib[n - 1]}</option>)}</>;
const stack = { display: "flex", flexDirection: "column", gap: 12 } as const;

/** "Add risk" modal. Current score starts between inherent and residual (cl/ci computed in the service). */
export function AddRiskForm({ close }: { close: () => void }) {
  const L = useLayer();
  const members = useMembers();
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState(""); const [cat, setCat] = useState(RISK_CATS[0]); const [owner, setOwner] = useState("J. Avery");
  const [ownerId, setOwnerId] = useState(() => myMemberId(members));
  const [l, setL] = useState(3), [i, setI] = useState(3), [rl, setRl] = useState(2), [ri, setRi] = useState(2); const [treat, setTreat] = useState(RISK_TREATS[0]);
  const [err, setErr] = useState(false);
  const pf = usePrefilled();
  const fill = (v: Record<string, string>) => {
    if (v.title !== undefined) setTitle(v.title); if (v.desc !== undefined) setDesc(v.desc); if (v.cat !== undefined) setCat(v.cat); if (v.treat !== undefined) setTreat(v.treat);
    if (v.l !== undefined) setL(Number(v.l)); if (v.i !== undefined) setI(Number(v.i)); if (v.rl !== undefined) setRl(Number(v.rl)); if (v.ri !== undefined) setRi(Number(v.ri));
    pf.mark(Object.keys(v));
  };
  const save = () => attempt(L, async () => {
    if (!title.trim()) { setErr(true); document.getElementById("rk-title")?.focus(); return; }
    const res = await svc.createRisk({ title, desc, cat, owner, ownerId: API_ON ? ownerId || myMemberId(members) : undefined, l, i, rl, ri, treat });
    if (!res.ok) { L.toast(res.msg, false); return; }
    wsLog("risk.created", title.trim().slice(0, 200), "Risk"); close(); L.toast("Risk " + res.id + " added as draft");
    setModState(K_TAB, "reg"); setModState<string | null>(K_SEL, res.id); bumpData();
  });
  const num = (set: (n: number) => void, k: string) => (e: React.ChangeEvent<HTMLSelectElement>) => { set(Number(e.target.value)); pf.clear(k); };
  return (
    <>
      <div style={stack}>
        <PrefillBanner form="risk" onFill={fill} filled={pf.count} />
        <div className={pf.cls("title")}><label htmlFor="rk-title">Risk title <Req />{pf.tag("title")}</label><input className="input" id="rk-title" data-focus maxLength={200} value={title} onChange={(e) => { setTitle(e.target.value); pf.clear("title"); }} placeholder="e.g. Unencrypted data at rest in analytics store" aria-invalid={err} aria-describedby={err ? "rk-err" : undefined} />
          <p className="errmsg" id="rk-err" role="alert" style={{ margin: "4px 0 0", display: err ? "flex" : "none" }}><Icon name="alert" /><span>Risk title is required.</span></p></div>
        <div className={pf.cls("desc")}><label htmlFor="rk-desc">Description{pf.tag("desc")}</label><textarea className="input" id="rk-desc" rows={2} maxLength={1000} style={{ resize: "vertical" }} value={desc} onChange={(e) => { setDesc(e.target.value); pf.clear("desc"); }} /></div>
        <div className="grid2" style={grid2}>
          <div className={pf.cls("cat")}><label htmlFor="rk-cat">Category{pf.tag("cat")}</label><select className="select" id="rk-cat" value={cat} onChange={(e) => { setCat(e.target.value); pf.clear("cat"); }}>{RISK_CATS.map((c) => <option key={c}>{c}</option>)}</select></div>
          {API_ON ? <MemberSelect id="rk-owner" value={ownerId || myMemberId(members)} onChange={setOwnerId} />
            : <div className="field"><label htmlFor="rk-owner">Owner</label><input className="input" id="rk-owner" maxLength={100} value={owner} onChange={(e) => setOwner(e.target.value)} /></div>}
        </div>
        <div className="sectitle" style={{ margin: "4px 0 -4px" }}>Inherent (before controls)</div>
        <div className="grid2" style={grid2}>
          <div className={pf.cls("l")}><label htmlFor="rk-l">Likelihood{pf.tag("l")}</label><select className="select" id="rk-l" value={l} onChange={num(setL, "l")}><ScaleOpts /></select></div>
          <div className={pf.cls("i")}><label htmlFor="rk-i">Impact{pf.tag("i")}</label><select className="select" id="rk-i" value={i} onChange={num(setI, "i")}><ImpactOpts /></select></div>
        </div>
        <div className="sectitle" style={{ margin: "4px 0 -4px" }}>Residual (after treatment)</div>
        <div className="grid2" style={grid2}>
          <div className={pf.cls("rl")}><label htmlFor="rk-rl">Likelihood{pf.tag("rl")}</label><select className="select" id="rk-rl" value={rl} onChange={num(setRl, "rl")}><ScaleOpts /></select></div>
          <div className={pf.cls("ri")}><label htmlFor="rk-ri">Impact{pf.tag("ri")}</label><select className="select" id="rk-ri" value={ri} onChange={num(setRi, "ri")}><ImpactOpts /></select></div>
        </div>
        <div className={pf.cls("treat")}><label htmlFor="rk-treat">Treatment decision{pf.tag("treat")}</label><select className="select" id="rk-treat" value={treat} onChange={(e) => { setTreat(e.target.value); pf.clear("treat"); }}>{RISK_TREATS.map((t) => <option key={t}>{t}</option>)}</select></div>
        <p className="field help">Current score starts between inherent and residual; adjust it in the risk detail. New risks enter as Draft.</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={save}>Add as draft</button></LayerFoot>
    </>
  );
}

export function AddActionForm({ id, close }: { id: string; close: () => void }) {
  const L = useLayer();
  const members = useMembers();
  const [text, setText] = useState(""); const [owner, setOwner] = useState(""); const [ownerId, setOwnerId] = useState(() => myMemberId(members)); const [due, setDue] = useState(""); const [err, setErr] = useState(false);
  const add = () => attempt(L, async () => {
    if (!text.trim()) { setErr(true); return; }
    const res = await svc.addAction(id, { text, owner, ownerId: API_ON ? ownerId || myMemberId(members) : undefined, due });
    if (!res.ok) { L.toast(res.msg, false); return; }
    wsLog("risk.action.added", id + ": " + res.text, "Risk"); close(); bumpData();
  });
  return (
    <>
      <div style={stack}>
        <div className="field"><label htmlFor="rka-text">Action <Req /></label><input className="input" id="rka-text" data-focus maxLength={300} placeholder="e.g. Enforce patch SLA on edge services" value={text} onChange={(e) => setText(e.target.value)} aria-invalid={err} aria-describedby={err ? "rka-err" : undefined} /></div>
        <div className="grid2" style={grid2}>
          {API_ON ? <MemberSelect id="rka-owner" value={ownerId || myMemberId(members)} onChange={setOwnerId} />
            : <div className="field"><label htmlFor="rka-owner">Owner</label><input className="input" id="rka-owner" maxLength={100} value={owner} onChange={(e) => setOwner(e.target.value)} /></div>}
          <div className="field"><label htmlFor="rka-due">Due date</label><input className="input" type="date" id="rka-due" value={due} onChange={(e) => setDue(e.target.value)} /></div>
        </div>
        <p className="field help" id="rka-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>Action is required.</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={add}>Add</button></LayerFoot>
    </>
  );
}

/** Cancel an open treatment action (needs a reason; cancelled actions no longer block closing the risk). */
export function CancelActionForm({ id, ai, text, close }: { id: string; ai: number; text: string; close: () => void }) {
  const L = useLayer();
  const [why, setWhy] = useState(""); const [err, setErr] = useState("");
  const go = () => attemptR(L, async () => {
    const res = await svc.cancelAction(id, ai, why);
    if (!res.ok) { setErr(res.msg || ""); return; }
    wsLog("risk.action.cancelled", id + ": " + res.text, "Risk"); close(); bumpData();
  });
  return (
    <>
      <div>
        <p style={{ margin: "0 0 10px", fontSize: 13 }}>Cancel the action <strong>{text}</strong>? It stays in the history.</p>
        <div className="field"><label htmlFor="rkc-why">Reason (at least 10 characters)</label><input className="input" id="rkc-why" data-focus maxLength={300} value={why} onChange={(e) => setWhy(e.target.value)} /></div>
        <p className="field help" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Keep action</button><button className="btn btn-primary" onClick={go}>Cancel action</button></LayerFoot>
    </>
  );
}
