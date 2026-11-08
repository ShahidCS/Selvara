/* Risk detail / lifecycle panel (source renderRiskDetail + riskSetScore..riskClose, lines 2606-2707).
 * Authority actions (submit / approve / accept) are gated by riskCanEdit / riskCanApprove exactly as in the source; the services re-check
 * the role, but the real API must enforce it and must also enforce segregation of duties (see docs/checklist/risk.md). */
import { useState } from "react";
import { Chip, Icon, StatusChip } from "@/components/ui";
import { useLayer } from "@/components/shell/LayerProvider";
import { DATA } from "@/lib/data";
import { wsLog } from "@/lib/audit";
import {
  ACCEPT_AUTH, Ib, Lb, RISK_PARTIES, expiresSoon, isoInDays, rband, riskCanApprove, riskCanEdit, riskCtrl, riskFindR, riskOpen, riskPriority,
  sCur, sInh, sRes,
} from "@/lib/risk";
import { bumpData, setModState, useApp, useData } from "@/lib/store";
import { useControlDrawer } from "../controls/useControlDrawer";
import { attempt } from "../issues/util";
import * as svc from "@/services/risks";
import { BandPill } from "./RiskBits";
import { AddActionForm } from "./RiskForms";
import { K_SEL } from "./nav";

/* eslint-disable @typescript-eslint/no-explicit-any */
const box: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 8 };
const AUTHS = Object.keys(ACCEPT_AUTH).map((k) => ACCEPT_AUTH[k]).filter((v, i, a) => a.indexOf(v) === i);

function AcceptForm({ id, needAuth, onDone }: { id: string; needAuth: string; onDone: () => void }) {
  const L = useLayer();
  const [by, setBy] = useState(needAuth); const [until, setUntil] = useState(() => isoInDays(180)); const [why, setWhy] = useState(""); const [comp, setComp] = useState(""); const [err, setErr] = useState("");
  const submit = () => attempt(L, async () => {
    const res = await svc.acceptRisk(id, { by, why, until, comp });
    if (!res.ok) { setErr(res.msg); return; }
    wsLog("risk.accepted", id + " — " + by, "Risk"); L.toast("Risk " + id + " accepted"); onDone();
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, border: "1px solid var(--line)", borderRadius: 12, padding: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <label className="field" style={{ flex: "1 1 160px", margin: 0 }}><span className="flab">Accepting authority</span><select className="select" id="rk-acc-auth" value={by} onChange={(e) => setBy(e.target.value)}>{AUTHS.map((a) => <option key={a}>{a}</option>)}</select></label>
        <label className="field" style={{ flex: "1 1 140px", margin: 0 }}><span className="flab">Valid until</span><input className="input" type="date" id="rk-acc-until" value={until} onChange={(e) => setUntil(e.target.value)} /></label>
      </div>
      <label className="field" style={{ margin: 0 }}><span className="flab">Rationale (required)</span><textarea className="input" id="rk-acc-why" rows={2} maxLength={1000} style={{ resize: "vertical" }} value={why} onChange={(e) => setWhy(e.target.value)} /></label>
      <label className="field" style={{ margin: 0 }}><span className="flab">Compensating controls</span><input className="input" id="rk-acc-comp" maxLength={500} value={comp} onChange={(e) => setComp(e.target.value)} /></label>
      <div id="rk-acc-err" role="alert" style={{ color: "var(--bad-ink)", fontSize: 12, fontWeight: 600, display: err ? "block" : "none" }}>{err}</div>
      <button className="btn btn-secondary sm" style={{ alignSelf: "flex-start" }} onClick={submit}>Record acceptance</button>
    </div>
  );
}

function ScoreCard({ id, label, lk, ik, fl, fi, canEdit, onSet }: { id: string; label: string; lk: number; ik: number; fl: string; fi: string; canEdit: boolean; onSet: (f: string, v: string) => void }) {
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><strong style={{ fontSize: 13 }}>{label}</strong><BandPill score={lk * ik} /></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label className="field" style={{ margin: 0 }}><span className="flab">Likelihood</span><select className="select" id={`${id}-${fl}`} value={lk} disabled={!canEdit} onChange={(e) => onSet(fl, e.target.value)}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} · {Lb[n - 1]}</option>)}</select></label>
        <label className="field" style={{ margin: 0 }}><span className="flab">Impact</span><select className="select" id={`${id}-${fi}`} value={ik} disabled={!canEdit} onChange={(e) => onSet(fi, e.target.value)}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} · {Ib[n - 1]}</option>)}</select></label>
      </div>
    </div>
  );
}

export default function RiskDetail({ id }: { id: string }) {
  useData();
  const L = useLayer();
  const role = useApp((s) => s.role);
  const openCtrl = useControlDrawer();
  const [mapSel, setMapSel] = useState(""); const [revNote, setRevNote] = useState(""); const [closeWhy, setCloseWhy] = useState("");
  const r = riskFindR(id);
  const closePanel = () => setModState<string | null>(K_SEL, null);
  if (!r) {
    return <section className="card"><div className="c-body" style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
      <span>Risk not found.</span><button className="btn btn-ghost sm" onClick={closePanel}><Icon name="x" />Close</button></div></section>;
  }
  const canEdit = riskCanEdit(role), canApprove = riskCanApprove(role);
  const scInh = sInh(r), scCur = sCur(r), scRes = sRes(r);
  const flow = ["Draft", "Submitted", "Approved"]; const curStep = r.review === "Changes requested" ? 0 : flow.indexOf(r.review);
  const links = (r.linked || []).map((cid: string) => ({ cid, c: riskCtrl(cid) }));
  const failing = links.filter((x: any) => x.c && x.c.status !== "Pass");
  const acts: any[] = r.actions || []; const allDone = acts.length > 0 && acts.every((a) => a.done);
  const resBand = rband(scRes).name; const needAuth = ACCEPT_AUTH[resBand];
  const parties = RISK_PARTIES.filter((p) => p.links.includes(r.id));
  const checks: string[] = [];
  if (!(r.linked && r.linked.length)) checks.push("no control mapped");
  if (scCur < scRes) checks.push("current exposure is below residual — re-check scores");
  if (!r.actions || !r.actions.length) if (r.treat === "Mitigate") checks.push("mitigate decision has no treatment actions");

  /* run a service call; on failure toast its message, on success log + toast + refresh */
  const run = <T extends svc.Res<any>>(fn: () => Promise<T>, ok: (res: T) => void) => attempt(L, async () => {
    const res = await fn();
    if (!res.ok) { L.toast(res.msg || "Something went wrong. Please try again.", false); return; }
    ok(res); bumpData();
  });
  const setScore = (field: string, v: string) => run(() => svc.setScore(r.id, field, v), (res) => wsLog("risk.scored", r.id + " " + field + "=" + res.value, "Risk"));
  const doMap = () => { const cid = mapSel; if (!cid) return; run(() => svc.mapControl(r.id, cid), () => { wsLog("risk.control.mapped", r.id + " ← " + cid, "Risk"); L.toast(cid + " mapped"); setMapSel(""); }); };
  const unmap = (cid: string) => run(() => svc.unmapControl(r.id, cid), () => { wsLog("risk.control.unmapped", r.id + " ✕ " + cid, "Risk"); L.toast(cid + " unmapped"); });
  const toggle = (ai: number) => run(() => svc.toggleAction(r.id, ai), (res) => wsLog("risk.action." + (res.done ? "done" : "reopened"), r.id + ": " + res.text, "Risk"));
  const submit = () => run(() => svc.submitRisk(r.id), () => { wsLog("risk.submitted", r.id, "Risk"); L.toast("Submitted for approval"); });
  const approve = () => run(() => svc.approveRisk(r.id), () => { wsLog("risk.approved", r.id, "Risk"); L.toast("Risk approved"); });
  const reqChanges = () => run(() => svc.requestChanges(r.id, revNote), () => { wsLog("risk.changes_requested", r.id, "Risk"); L.toast("Changes requested"); setRevNote(""); });
  const reopen = () => run(() => svc.reopenRisk(r.id), () => { wsLog("risk.reopened", r.id, "Risk"); L.toast("Risk " + r.id + " reopened"); });
  const closeRisk = () => run(() => svc.closeRisk(r.id, closeWhy), () => { wsLog("risk.closed", r.id, "Risk"); L.toast("Risk " + r.id + " closed"); setCloseWhy(""); });
  const addAction = () => L.openModal("Add treatment action", (close) => <AddActionForm id={r.id} close={close} />);

  const mapOpts = DATA.controls.filter((c) => !(r.linked || []).includes(c.id));
  const reviewTone = r.review === "Approved" ? "ok" : r.review === "Submitted" ? "warn" : r.review === "Changes requested" ? "bad" : "neutral";

  let acceptBlock: React.ReactNode = null;
  if (r.acceptance) {
    const exp: string | undefined = r.acceptance.until; const soon = expiresSoon(exp);
    acceptBlock = (
      <>
        <div style={{ background: "var(--accent-weak)", borderRadius: 12, padding: 12, fontSize: 13 }}>
          <div className="strong">Accepted by {r.acceptance.by}</div><div>Rationale: {r.acceptance.note}</div>
          {r.acceptance.comp ? <div>Compensating controls: {r.acceptance.comp}</div> : null}
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Recorded {r.acceptance.at}{exp ? " · valid until " + exp : ""}{soon ? <> <span style={{ color: "var(--bad-ink)", fontWeight: 600 }}>(expires within 60 days)</span></> : null}</div>
        </div>
        {canEdit ? <button className="btn btn-secondary sm" style={{ alignSelf: "flex-start" }} onClick={reopen}><Icon name="back" />Reopen risk</button> : null}
      </>
    );
  } else if (canEdit) {
    acceptBlock = (
      <>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>Residual is <strong>{resBand} ({scRes})</strong>. Lowest authority that can accept: <strong>{needAuth}</strong>. Acceptance lasts at most 12 months.</div>
        <AcceptForm key={id + ":" + needAuth} id={r.id} needAuth={needAuth} onDone={bumpData} />
      </>
    );
  } else {
    acceptBlock = <p className="field help" style={{ margin: 0 }}>Read-only: your role cannot record risk acceptance.</p>;
  }

  let wf: React.ReactNode = null;
  if (r.review === "Draft" || r.review === "Changes requested") {
    wf = canEdit ? <button className="btn btn-primary sm" onClick={submit}>Submit for approval</button> : <p className="field help" style={{ margin: 0 }}>Read-only: your role cannot submit risks for approval.</p>;
  } else if (r.review === "Submitted") {
    wf = canApprove ? (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", background: "var(--surface-2)", borderRadius: 12, padding: 12 }}>
        <label className="field" style={{ flex: "1 1 220px", margin: 0 }}><span className="flab">Note (required to request changes)</span><input className="input" id="rk-rev-note" maxLength={500} value={revNote} onChange={(e) => setRevNote(e.target.value)} /></label>
        <button className="btn btn-primary sm" onClick={approve}>Approve</button><button className="btn btn-secondary sm" onClick={reqChanges}>Request changes</button>
      </div>
    ) : <p className="field help" style={{ margin: 0 }}>Submitted for approval. Awaiting a company admin.</p>;
  }

  return (
    <section className="card"><div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0, flex: "1 1 420px" }}>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>{r.id} · {r.cat} · {r.register}{r.parent ? " · " + r.parent.id + " " + r.parent.title : ""}</div>
          <h2 style={{ margin: "2px 0 8px", fontSize: 22, fontWeight: 600 }}>{r.title}</h2>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Chip cls={reviewTone}>{r.review}</Chip><StatusChip s={r.status} /><BandPill score={scInh} label="Inherent" /><BandPill score={scCur} label="Current" /><BandPill score={scRes} label="Residual" /><span className="tag">Priority {riskPriority(r)}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontSize: 13, color: "var(--ink-2)", maxWidth: 280, textAlign: "right" }}>Accountable <strong>{r.owner}</strong> ({r.team}, {r.jur})</div>
          <button className="btn btn-ghost sm" onClick={closePanel}><Icon name="x" />Close</button>
        </div>
      </div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", gap: 6 }} aria-label="Approval progress">
        {flow.map((s, i) => (
          <li key={s} aria-current={i === curStep ? "step" : undefined} style={{ flex: 1, textAlign: "center", padding: "7px 4px", borderRadius: 8, fontSize: 12, fontWeight: 600, ...(i <= curStep ? { background: "var(--accent-weak)", color: "var(--accent-ink)" } : { background: "var(--surface-2)", color: "var(--muted)" }) }}>
            {i <= curStep ? <Icon name="check" /> : null} {s}
          </li>
        ))}
      </ol>
      {r.desc ? <p style={{ margin: 0, fontSize: 13, color: "var(--ink-2)" }}>{r.desc}</p> : null}
      {failing.length ? <div role="alert" style={{ background: "var(--bad-bg)", color: "var(--bad-ink)", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 600 }}>{failing.length} mapped control{failing.length > 1 ? "s are" : " is"} not passing ({failing.map((x: any) => x.cid).join(", ")}); current exposure relies on {failing.length > 1 ? "them" : "it"}.</div> : null}
      {checks.length ? <div style={{ background: "var(--warn-bg)", color: "var(--warn-ink)", borderRadius: 10, padding: "10px 14px", fontSize: 13 }}><strong>Data quality:</strong> {checks.join("; ")}.</div> : null}
      {wf ? <div>{wf}</div> : null}
      <div className="rgrid3">
        <ScoreCard id={r.id} label="Inherent (before controls)" lk={r.l} ik={r.i} fl="l" fi="i" canEdit={canEdit} onSet={setScore} />
        <ScoreCard id={r.id} label="Current (with controls)" lk={r.cl || r.l} ik={r.ci || r.i} fl="cl" fi="ci" canEdit={canEdit} onSet={setScore} />
        <ScoreCard id={r.id} label="Residual (after treatment)" lk={r.rl} ik={r.ri} fl="rl" fi="ri" canEdit={canEdit} onSet={setScore} />
      </div>
      <div className="rgrid2">
        <div style={box}><h3 style={{ margin: 0, fontSize: 15 }}>Mapped platform controls</h3>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>The owner is alerted when a mapped control fails, because the current score relies on it.</div>
          {links.length ? links.map((x: any) => (
            <div key={x.cid} style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid var(--line)" }}>
              <button className="linkbtn" disabled={!x.c} onClick={() => x.c && openCtrl(x.cid)} style={{ font: "inherit", background: "none", border: 0, textAlign: "left", cursor: x.c ? "pointer" : "default", color: "var(--ink)", minWidth: 0 }}>
                <span className="num strong">{x.cid}</span> {x.c ? x.c.title : <span style={{ color: "var(--muted)" }}>external control</span>}
              </button>
              <span style={{ display: "flex", gap: 6, alignItems: "center" }}>{x.c ? <StatusChip s={x.c.status} /> : <Chip cls="neutral">—</Chip>}{canEdit ? <button className="btn btn-ghost sm" aria-label={`Unmap ${x.cid}`} onClick={() => unmap(x.cid)}>Unmap</button> : null}</span>
            </div>
          )) : <div style={{ fontSize: 13, color: "var(--bad-ink)" }}>No platform control mapped. Map at least one before approval.</div>}
          {canEdit ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
              <select className="select" id="rk-mapsel" aria-label="Map a control" style={{ flex: "1 1 220px" }} value={mapSel} onChange={(e) => setMapSel(e.target.value)}>
                <option value="">Map a control…</option>{mapOpts.map((c) => <option key={c.id} value={c.id}>{c.id} — {c.title}</option>)}
              </select>
              <button className="btn btn-secondary sm" onClick={doMap}>Map control</button>
            </div>
          ) : null}
        </div>
        <div style={box}><h3 style={{ margin: 0, fontSize: 15 }}>Treatment actions</h3>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>When every action is done, exposure moves to the residual score.</div>
          {acts.length ? acts.map((a, ai) => (
            <label key={ai} className="listrow" style={{ border: "1px solid var(--line)", borderRadius: 8, marginBottom: 6, display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", cursor: "pointer" }}>
              <input type="checkbox" checked={!!a.done} disabled={!canEdit} onChange={() => toggle(ai)} />
              <span style={{ flex: 1, minWidth: 0, ...(a.done ? { textDecoration: "line-through", color: "var(--muted)" } : {}) }}>{a.text}<span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{a.owner || "Unassigned"}{a.due ? " · due " + a.due : ""}</span></span>
            </label>
          )) : <p className="field help" style={{ margin: 0 }}>No treatment actions yet.</p>}
          {allDone ? <div style={{ fontSize: 12, color: "var(--ok-ink)", fontWeight: 600 }}>All actions complete — exposure at residual.</div> : null}
          {canEdit ? <button className="btn btn-ghost sm" style={{ alignSelf: "flex-start" }} onClick={addAction}><Icon name="plus" />Add action</button> : null}
        </div>
      </div>
      <div className="rgrid2">
        <div style={box}><h3 style={{ margin: 0, fontSize: 15 }}>Risk acceptance</h3>{acceptBlock}
          {canEdit && riskOpen(r) ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", borderTop: "1px solid var(--line)", paddingTop: 10 }}>
              <label className="field" style={{ flex: "1 1 220px", margin: 0 }}><span className="flab">Reason for closing</span><input className="input" id="rk-close-why" maxLength={300} value={closeWhy} onChange={(e) => setCloseWhy(e.target.value)} /></label>
              <button className="btn btn-ghost sm" onClick={closeRisk}>Close risk</button>
            </div>
          ) : null}
        </div>
        <div style={{ ...box, gap: 4 }}><h3 style={{ margin: "0 0 4px", fontSize: 15 }}>Interested parties</h3>
          {parties.length ? parties.map((p) => (
            <div key={p.party} style={{ fontSize: 13, padding: "5px 0", borderTop: "1px solid var(--line)" }}><strong>{p.party}</strong> <span style={{ color: "var(--muted)" }}>({p.loc})</span><div style={{ fontSize: 12, color: "var(--ink-2)" }}>{p.req}</div></div>
          )) : <p className="field help" style={{ margin: 0 }}>No interested party linked. Link on the Interested parties tab.</p>}
          <h3 style={{ margin: "10px 0 4px", fontSize: 15 }}>History</h3>
          {(r.history || []).slice().reverse().map((h: any, k: number) => (
            <div key={k} style={{ fontSize: 12, color: "var(--ink-2)", padding: "4px 0", borderTop: "1px solid var(--line)" }}>{h.ts} · {h.by} · {h.a}</div>
          ))}
        </div>
      </div>
    </div></section>
  );
}
