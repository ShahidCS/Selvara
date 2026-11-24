/* Risk detail / lifecycle panel (source renderRiskDetail + riskSetScore..riskClose, lines 2606-2707).
 * Authority actions (submit / approve / accept) are gated by riskCanEdit / riskCanApprove exactly as in the source; the services re-check
 * the role, but the real API must enforce it and must also enforce segregation of duties (see docs/guides/checklist/risk.md). */
import { useState } from "react";
import { ExplainCard } from "@/components/kit/ExplainCard";
import { explainRisk } from "@/lib/insights";
import { Chip, Icon, StatusChip, Stepper, Empty } from "@/components/ui";
import { useLayer } from "@/components/shell/LayerProvider";
import { DATA } from "@/lib/data";
import { wsLog } from "@/lib/audit";
import {
  ACCEPT_AUTH, Ib, Lb, RISK_PARTIES, expiresSoon, isoInDays, rband, riskAcceptState, riskCanApprove, riskCanEdit, riskCtrl, riskFindR, riskOpen, riskPriority,
  sCur, sInh, sRes,
} from "@/lib/risk";
import { bumpData, setModState, useApp, useData } from "@/lib/store";
import { SOD, hasRole, isMe, sodReason } from "@/lib/sod";
import { BOARD_BODIES, riskNeedsBoard } from "@/lib/riskBoard";
import { safeFileName } from "@/lib/security";
import { useOpenControl } from "@/features/controls";
import { attemptR } from "./util";
import * as svc from "@/features/risk/services/risks";
import { riskOpenActions } from "@/lib/risk";
import { BandPill, Req } from "./RiskBits";
import { AddActionForm, CancelActionForm } from "./RiskForms";
import { K_SEL } from "./nav";

/* eslint-disable @typescript-eslint/no-explicit-any */
const box: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 8 };
/* the Board / CEO rung is not selectable: at or below the Board threshold the ladder applies, above it Board approval evidence replaces the choice */
const AUTHS = Object.keys(ACCEPT_AUTH).map((k) => ACCEPT_AUTH[k]).filter((v, i, a) => a.indexOf(v) === i && v !== "Board / CEO");

const errStyle: React.CSSProperties = { color: "var(--bad-ink)", fontSize: 12, fontWeight: 600 };
function AcceptForm({ id, needAuth, scRes, block, onDone }: { id: string; needAuth: string; scRes: number; block: string | null; onDone: () => void }) {
  const L = useLayer();
  const board = riskNeedsBoard(scRes);
  const [by, setBy] = useState(needAuth); const [until, setUntil] = useState(() => isoInDays(180)); const [why, setWhy] = useState(""); const [comp, setComp] = useState(""); const [err, setErr] = useState("");
  const [ref, setRef] = useState(""); const [date, setDate] = useState(""); const [body, setBody] = useState<string>(BOARD_BODIES[0]); const [minutes, setMinutes] = useState(""); const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const submit = () => attemptR(L, async () => {
    const res = await svc.acceptRisk(id, { by: board ? "Board / CEO" : by, why, until, comp, board: board ? { ref, date, body, minutes, file } : undefined });
    if (!res.ok) { setErr(res.msg || ""); return; }
    setErr("");
    L.toast(res.pending ? "Board evidence recorded. Awaiting evidence verification by a second person (" + res.approvalId + ")." : "Risk " + id + " accepted"); onDone();
  });
  const off = !!block;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, border: "1px solid var(--line)", borderRadius: 12, padding: 12 }}>
      {board ? (
        <>
          <div style={{ fontSize: 12.5, color: "var(--warn-ink)", fontWeight: 600 }}>Residual {scRes} is above {SOD.RISK_BOARD_THRESHOLD}. The Board must have approved this acceptance. Enter the evidence; a second person verifies it before the acceptance takes effect.</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label className="field" style={{ flex: "1 1 150px", margin: 0 }}><span className="flab">Board decision reference</span><input className="input" id="rk-bd-ref" maxLength={20} placeholder="BRD-2026-04" disabled={off} value={ref} onChange={(e) => setRef(e.target.value)} /></label>
            <label className="field" style={{ flex: "1 1 140px", margin: 0 }}><span className="flab">Decision date</span><input className="input" type="date" id="rk-bd-date" disabled={off} value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label className="field" style={{ flex: "1 1 170px", margin: 0 }}><span className="flab">Approving body</span><select className="select" id="rk-bd-body" disabled={off} value={body} onChange={(e) => setBody(e.target.value)}>{BOARD_BODIES.map((b) => <option key={b}>{b}</option>)}</select></label>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label className="field" style={{ flex: "2 1 220px", margin: 0 }}><span className="flab">Minutes reference or file name</span><input className="input" id="rk-bd-min" maxLength={120} disabled={off || !!file} value={file ? safeFileName(file.name) : minutes} onChange={(e) => setMinutes(e.target.value)} /></label>
            <label className="field" style={{ flex: "1 1 160px", margin: 0 }}><span className="flab">Or attach minutes (pdf, docx, png, jpg)</span><input className="input" type="file" id="rk-bd-file" accept=".pdf,.docx,.png,.jpg" disabled={off} onChange={(e) => { const f = e.target.files?.[0]; setFile(f ? { name: f.name, size: f.size } : null); }} /></label>
          </div>
          <p className="field help" style={{ margin: 0 }}>Only the file name is kept. The file itself is not read or stored here.</p>
        </>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <label className="field" style={{ flex: "1 1 160px", margin: 0 }}><span className="flab">Accepting authority</span><select className="select" id="rk-acc-auth" disabled={off} value={by} onChange={(e) => setBy(e.target.value)}>{AUTHS.map((a) => <option key={a}>{a}</option>)}</select></label>
        </div>
      )}
      <label className="field" style={{ flex: "0 0 auto", margin: 0, maxWidth: 220 }}><span className="flab">Valid until (max 12 months)</span><input className="input" type="date" id="rk-acc-until" disabled={off} value={until} onChange={(e) => setUntil(e.target.value)} /></label>
      <label className="field" style={{ margin: 0 }}><span className="flab">{board ? <>Reason (at least 20 characters) <Req /></> : <>Rationale <Req /></>}</span><textarea className="input" id="rk-acc-why" rows={2} maxLength={1000} disabled={off} style={{ resize: "vertical" }} value={why} onChange={(e) => setWhy(e.target.value)} /></label>
      <label className="field" style={{ margin: 0 }}><span className="flab">Compensating controls</span><input className="input" id="rk-acc-comp" maxLength={500} disabled={off} value={comp} onChange={(e) => setComp(e.target.value)} /></label>
      <div id="rk-acc-err" role="alert" style={{ ...errStyle, display: err ? "block" : "none" }}>{err}</div>
      {block ? <div style={{ fontSize: 12, color: "var(--muted)" }}>{block}</div> : null}
      <button className="btn btn-secondary sm" style={{ alignSelf: "flex-start" }} disabled={off} title={block || undefined} onClick={submit}>{board ? "Record Board evidence" : "Record acceptance"}</button>
    </div>
  );
}

function VerifyBox({ r }: { r: any }) {
  const L = useLayer(); const role = useApp((x) => x.role);
  const [reason, setReason] = useState("");
  const p = r.pendingAcceptance; const ev = p.board;
  const block = svc.boardVerifyBlock(r) || sodReason("you recorded, own or last edited this risk, so you cannot verify its Board evidence", p.recordedBy, r.owner, r.lastEditedBy);
  const mine = isMe(p.recordedBy);
  const decide = (d: "approve" | "reject") => attemptR(L, async () => {
    const res = await svc.decideBoardEvidence(r.id, d, reason);
    if (!res.ok) { L.toast(res.msg || "Something went wrong. Please try again.", false); return; }
    L.toast(d === "approve" ? "Evidence verified. Risk " + r.id + " accepted." : "Evidence rejected. The acceptance did not take effect."); setReason(""); bumpData();
  });
  const withdraw = () => attemptR(L, async () => {
    const res = await svc.withdrawBoardEvidence(r.id);
    if (!res.ok) { L.toast(res.msg || "Something went wrong. Please try again.", false); return; }
    L.toast("Board evidence withdrawn"); bumpData();
  });
  return (
    <div style={{ background: "var(--warn-bg)", borderRadius: 12, padding: 12, fontSize: 13, display: "flex", flexDirection: "column", gap: 6 }}>
      <div><Chip cls="warn" icon="clock">Awaiting evidence verification</Chip></div>
      <div className="strong">{ev.body} decision {ev.ref} · {ev.date}</div>
      <div>Minutes: {ev.minutes}</div>
      <div>Reason: {p.note}</div>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>Recorded by {p.recordedBy} · valid until {p.until} · request {p.approvalId}. The acceptance is not effective until a second person verifies the evidence.</div>
      {mine || hasRole(role, "admin", "owner") ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className="field" style={{ flex: "1 1 220px", margin: 0 }}><span className="flab">Reason (at least 10 characters)</span><input className="input" id="rk-bd-reason" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <button className="btn btn-primary btn-decide sm" disabled={!!block} title={block || undefined} onClick={() => decide("approve")}>Verify evidence</button>
          <button className="btn btn-secondary sm" disabled={!!block} title={block || undefined} onClick={() => decide("reject")}>Reject evidence</button>
          {mine ? <button className="btn btn-ghost sm" onClick={withdraw}>Withdraw</button> : null}
        </div>
      ) : null}
      {block ? <div style={{ fontSize: 12, color: "var(--muted)" }}>{block}</div> : null}
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
  const openCtrl = useOpenControl();
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
  const run = <T extends svc.Res<any>>(fn: () => Promise<T>, ok: (res: T) => void) => attemptR(L, async () => {
    const res = await fn();
    if (!res.ok) { L.toast(res.msg || "Something went wrong. Please try again.", false); return; }
    ok(res); bumpData();
  });
  const setScore = (field: string, v: string) => run(() => svc.setScore(r.id, field, v), (res) => { wsLog("risk.scored", r.id + " " + field + "=" + res.value, "Risk"); if (res.invalidated) L.toast("Acceptance withdrawn: " + res.invalidated + ". The risk is Open again.", false); });
  const doMap = () => { const cid = mapSel; if (!cid) return; run(() => svc.mapControl(r.id, cid), () => { wsLog("risk.control.mapped", r.id + " ← " + cid, "Risk"); L.toast(cid + " mapped"); setMapSel(""); }); };
  const unmap = (cid: string) => run(() => svc.unmapControl(r.id, cid), () => { wsLog("risk.control.unmapped", r.id + " ✕ " + cid, "Risk"); L.toast(cid + " unmapped"); });
  const toggle = (ai: number) => run(() => svc.toggleAction(r.id, ai), (res) => wsLog("risk.action." + (res.done ? "done" : "reopened"), r.id + ": " + res.text, "Risk"));
  const submit = () => run(() => svc.submitRisk(r.id), () => { wsLog("risk.submitted", r.id, "Risk"); L.toast("Submitted for approval"); });
  const approve = () => run(() => svc.approveRisk(r.id), () => { wsLog("risk.approved", r.id, "Risk"); L.toast("Risk approved"); });
  const cancelAct = (ai: number, text: string) => L.openModal("Cancel treatment action", (close) => <CancelActionForm id={r.id} ai={ai} text={text} close={close} />);
  const approveBlock = sodReason("you edited or submitted this risk, so a different person must approve it", r.lastEditedBy, r.submittedBy);
  const closeBlock = svc.closeBlock(r);
  const openActs = riskOpenActions(r);
  const acState = riskAcceptState(r);
  const reqChanges = () => run(() => svc.requestChanges(r.id, revNote), () => { wsLog("risk.changes_requested", r.id, "Risk"); L.toast("Changes requested"); setRevNote(""); });
  const reopen = () => run(() => svc.reopenRisk(r.id), () => { wsLog("risk.reopened", r.id, "Risk"); L.toast("Risk " + r.id + " reopened"); });
  const closeRisk = () => run(() => svc.closeRisk(r.id, closeWhy), () => { L.toast("Risk " + r.id + " closed"); setCloseWhy(""); });
  const addAction = () => L.openModal("Add treatment action", (close) => <AddActionForm id={r.id} close={close} />);

  const mapOpts = DATA.controls.filter((c) => !(r.linked || []).includes(c.id));
  const reviewTone = r.review === "Approved" ? "ok" : r.review === "Submitted" ? "warn" : r.review === "Changes requested" ? "bad" : "neutral";

  const accBlock = sodReason("you own, edited or submitted this risk, so a different person must record its acceptance", r.owner, r.lastEditedBy, r.submittedBy)
    || (riskNeedsBoard(scRes) && !hasRole(role, "admin") ? "Only a company admin can record Board-approved acceptance." : null) || svc.acceptRoleBlock(r);
  let acceptBlock: React.ReactNode = null;
  if (r.acceptance) {
    const exp: string | undefined = r.acceptance.until; const soon = expiresSoon(exp); const bd = r.acceptance.board;
    acceptBlock = (
      <>
        <div style={{ background: "var(--accent-weak)", borderRadius: 12, padding: 12, fontSize: 13 }}>
          <div className="strong">Accepted by {r.acceptance.by}{bd ? <> <Chip cls="ok" icon="check">Board approved · {bd.ref} · {bd.date}</Chip></> : null}</div>
          {bd ? <div>{bd.body} · minutes: {bd.minutes}{bd.verifiedBy ? " · evidence verified by " + bd.verifiedBy : ""}</div> : null}
          <div>Rationale: {r.acceptance.note}</div>
          {r.acceptance.comp ? <div>Compensating controls: {r.acceptance.comp}</div> : null}
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Recorded {r.acceptance.at}{r.acceptance.recordedBy ? " by " + r.acceptance.recordedBy : ""}{exp ? " · valid until " + exp : ""}{soon ? <> <span style={{ color: "var(--bad-ink)", fontWeight: 600 }}>(expires within 60 days)</span></> : null}</div>
          {riskNeedsBoard(scRes) && !bd ? <div role="alert" style={{ ...errStyle, marginTop: 4 }}>Residual {scRes} is above {SOD.RISK_BOARD_THRESHOLD} and this acceptance has no Board approval evidence.</div> : null}
        </div>
        {canEdit ? <button className="btn btn-secondary sm" style={{ alignSelf: "flex-start" }} onClick={reopen}><Icon name="back" />Reopen risk</button> : null}
      </>
    );
  } else if (r.pendingAcceptance) {
    acceptBlock = <VerifyBox r={r} />;
  } else if (canEdit && riskOpen(r)) {
    acceptBlock = (
      <>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>Residual is <strong>{resBand} ({scRes})</strong>. {riskNeedsBoard(scRes)
          ? <>Above {SOD.RISK_BOARD_THRESHOLD}: <strong>Board approval evidence is required</strong> and a second person must verify it.</>
          : <>Lowest authority that can accept: <strong>{needAuth}</strong>. Up to {SOD.RISK_BOARD_THRESHOLD} no Board approval is needed.</>} Acceptance lasts at most 12 months.</div>
        {r.invalidatedAcceptance ? <div style={{ fontSize: 12, color: "var(--warn-ink)" }}>Previous acceptance was withdrawn on {r.invalidatedAcceptance.invalidatedAt}: {r.invalidatedAcceptance.invalidatedReason}.</div> : null}
        <AcceptForm key={id + ":" + needAuth + ":" + riskNeedsBoard(scRes)} id={r.id} needAuth={needAuth} scRes={scRes} block={accBlock} onDone={bumpData} />
      </>
    );
  } else if (!canEdit) {
    acceptBlock = <p className="field help" style={{ margin: 0 }}>Read-only: your role cannot record risk acceptance.</p>;
  }

  let wf: React.ReactNode = null;
  if (r.review === "Draft" || r.review === "Changes requested") {
    wf = canEdit ? <button className="btn btn-primary sm" onClick={submit}>Submit for approval</button> : <p className="field help" style={{ margin: 0 }}>Read-only: your role cannot submit risks for approval.</p>;
  } else if (r.review === "Submitted") {
    wf = canApprove ? (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", background: "var(--surface-2)", borderRadius: 12, padding: 12 }}>
        <label className="field" style={{ flex: "1 1 220px", margin: 0 }}><span className="flab">Note (required to request changes)</span><input className="input" id="rk-rev-note" maxLength={500} value={revNote} onChange={(e) => setRevNote(e.target.value)} /></label>
        <button className="btn btn-primary btn-decide sm" disabled={!!approveBlock} title={approveBlock || undefined} onClick={approve}>Approve</button><button className="btn btn-secondary sm" onClick={reqChanges}>Request changes</button>
        {approveBlock ? <span style={{ flexBasis: "100%", fontSize: 12, color: "var(--muted)" }}>{approveBlock}</span> : null}
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
            <Chip cls={reviewTone}>{r.review}</Chip><StatusChip s={r.status} />{acState === "Effective" && r.acceptance?.board ? <Chip cls="ok" icon="check">Board approved · {r.acceptance.board.ref} · {r.acceptance.board.date}</Chip> : null}{acState === "Awaiting evidence verification" ? <Chip cls="warn" icon="clock">Awaiting evidence verification</Chip> : null}<BandPill score={scInh} label="Inherent" /><BandPill score={scCur} label="Current" /><BandPill score={scRes} label="Residual" /><span className="tag">Priority {riskPriority(r)}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontSize: 13, color: "var(--ink-2)", maxWidth: 280, textAlign: "right" }}>Accountable <strong>{r.owner}</strong> ({r.team}, {r.jur})</div>
          <button className="btn btn-ghost sm" onClick={closePanel}><Icon name="x" />Close</button>
        </div>
      </div>
      <Stepper label="Approval progress" steps={flow.map((s) => ({ key: s, label: s }))} current={Math.max(0, curStep)} />
      {r.desc ? <p style={{ margin: 0, fontSize: 13, color: "var(--ink-2)" }}>{r.desc}</p> : null}
      {failing.length ? <div role="alert" style={{ background: "var(--bad-bg)", color: "var(--bad-ink)", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 600 }}>{failing.length} mapped control{failing.length > 1 ? "s are" : " is"} not passing ({failing.map((x: any) => x.cid).join(", ")}); current exposure relies on {failing.length > 1 ? "them" : "it"}.</div> : null}
      {checks.length ? <div style={{ background: "var(--warn-bg)", color: "var(--warn-ink)", borderRadius: 10, padding: "10px 14px", fontSize: 13 }}><strong>Data quality:</strong> {checks.join("; ")}.</div> : null}
      {wf ? <div>{wf}</div> : null}
      <ExplainCard e={explainRisk(r)} record={{ mod: "risk", id: r.id }} />
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
              <input type="checkbox" checked={!!a.done} disabled={!canEdit || !!a.cancelled} onChange={() => toggle(ai)} />
              <span style={{ flex: 1, minWidth: 0, ...(a.done || a.cancelled ? { textDecoration: "line-through", color: "var(--muted)" } : {}) }}>{a.text}<span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{a.owner || "Unassigned"}{a.due ? " · due " + a.due : ""}{a.cancelled ? " · cancelled: " + a.cancelReason : ""}</span></span>
              {canEdit && !a.done && !a.cancelled ? <button type="button" className="btn btn-ghost sm" aria-label={`Cancel action ${a.text}`} onClick={(e) => { e.preventDefault(); cancelAct(ai, a.text); }}>Cancel</button> : null}
            </label>
          )) : <Empty compact icon="risk" title="No treatment actions yet" />}
          {allDone || (acts.length > 0 && openActs.length === 0) ? <div style={{ fontSize: 12, color: "var(--ok-ink)", fontWeight: 600 }}>All actions complete — exposure at residual.</div> : null}
          {canEdit ? <button className="btn btn-ghost sm" style={{ alignSelf: "flex-start" }} onClick={addAction}><Icon name="plus" />Add action</button> : null}
        </div>
      </div>
      <div className="rgrid2">
        <div style={box}><h3 style={{ margin: 0, fontSize: 15 }}>Risk acceptance</h3>{acceptBlock}
          {canEdit && riskOpen(r) ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", borderTop: "1px solid var(--line)", paddingTop: 10 }}>
              <label className="field" style={{ flex: "1 1 220px", margin: 0 }}><span className="flab">Reason for closing</span><input className="input" id="rk-close-why" maxLength={300} value={closeWhy} onChange={(e) => setCloseWhy(e.target.value)} /></label>
              <button className="btn btn-ghost sm" disabled={!!closeBlock} title={closeBlock || undefined} onClick={closeRisk}>Close risk</button>
              {closeBlock ? <span style={{ flexBasis: "100%", fontSize: 12, color: "var(--muted)" }}>{closeBlock}</span> : null}
            </div>
          ) : null}
        </div>
        <div style={{ ...box, gap: 4 }}><h3 style={{ margin: "0 0 4px", fontSize: 15 }}>Interested parties</h3>
          {parties.length ? parties.map((p) => (
            <div key={p.party} style={{ fontSize: 13, padding: "5px 0", borderTop: "1px solid var(--line)" }}><strong>{p.party}</strong> <span style={{ color: "var(--muted)" }}>({p.loc})</span><div style={{ fontSize: 12, color: "var(--ink-2)" }}>{p.req}</div></div>
          )) : <Empty compact icon="risk" title="No interested party linked">Link on the Interested parties tab.</Empty>}
          <h3 style={{ margin: "10px 0 4px", fontSize: 15 }}>History</h3>
          {(r.history || []).slice().reverse().map((h: any, k: number) => (
            <div key={k} style={{ fontSize: 12, color: "var(--ink-2)", padding: "4px 0", borderTop: "1px solid var(--line)" }}>{h.ts} · {h.by} · {h.a}</div>
          ))}
        </div>
      </div>
    </div></section>
  );
}
