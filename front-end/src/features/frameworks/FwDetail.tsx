import { Fragment, useState } from "react";
import { Chip, Icon, ReqStatusPill, Table, StatusChip, Empty } from "@/components/ui";
import { ANNEXA, DATA, FRAMEWORK_REQS, annexCovered, controlsForFw } from "@/lib/data";
import { useModState, setModState } from "@/lib/store";
import {
  REQ_PAGE, REQ_ST, REQ_ST_COL, fwBand, fwCanAdmin, fwEdits, fwGroupMap, fwGroupStat, fwReqControls, fwScore, fwSnoozed, clearReqNA, reqStatus, setReqNA, toggleReqControl, touchFw,
} from "@/lib/frameworks";
import { csvCell, downloadText, nowStamp } from "@/lib/format";
import { getMe, wsLog } from "@/lib/audit";
import { useLayer } from "@/hooks/useLayer";
import { useGo } from "@/lib/route";
import { useControlDrawer } from "@/features/controls";
import { FwSegsBar } from "./FwSegsBar";

export function FwDetail({ fwId, onClose }: { fwId: string; onClose: () => void }) {
  const L = useLayer(); const go = useGo();
  const f = DATA.frameworks.find((x) => x.id === fwId);
  const [, setCtrlQ] = useModState("controls.q", ""); void setCtrlQ;
  const [reqF, setReqF] = useModState("fw.reqf", "all");
  const [rq, setRq] = useModState("fw.rq", "");
  const [grp, setGrp] = useModState<string | null>("fw.grp", null);
  const [limit, setLimit] = useModState("fw.limit", REQ_PAGE);
  if (!f) return null;
  const cat = FRAMEWORK_REQS[f.id]; const sc = cat ? fwScore(f.id) : null; const p = sc ? sc.pct : f.pct;
  const ctrls = controlsForFw(f.id);
  const passing = ctrls.filter((c) => c.status === "Pass").length, needs = ctrls.filter((c) => c.status !== "Pass").length;
  const gm = fwGroupMap(f.id);

  const gapExport = () => {
    const head = ["Framework", "Requirement ID", "Requirement title", "Group", "Status", "Mapped controls", "Not applicable reason"];
    const body = cat.r.filter((r) => reqStatus(f.id, r[0]) !== "Met").map((r) => {
      const st = reqStatus(f.id, r[0]); const na = fwEdits.get().NA[f.id]?.[r[0]];
      return [f.name, r[0], r[1], (r[2] ? r[2] + " " : "") + (gm[r[2]] || ""), st, fwReqControls(f.id, r[0]).map((c) => c.id + " (" + c.status + ")").join("; "), na ? na.reason : ""];
    });
    const csv = [head].concat(body).map((r) => r.map(csvCell).join(",")).join("\r\n");
    if (!downloadText("gap-assessment-" + f.id + ".csv", csv, "text/csv;charset=utf-8")) { L.toast("Download not available in this view"); return; }
    wsLog("framework.gap.exported", f.name + ", " + body.length + " gaps", "Control");
    L.toast("Gap assessment exported (" + body.length + " row" + (body.length !== 1 ? "s" : "") + ")");
  };
  const viewInControls = () => { setModState("controls.fw", f.id); setModState("controls.status", "All"); setModState("controls.q", ""); setModState("controls.page", 1); go("/ws/controls"); };

  return (
    <>
      <section className="card"><div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>{f.kind} · {f.region || "-"}{f.audit ? " · " + f.audit : ""}</div>
            <h2 style={{ margin: "2px 0 0", fontSize: 22, fontWeight: 600, letterSpacing: "-.01em" }}>{f.name}</h2>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <Chip cls={fwSnoozed(f.id) ? "neutral" : "ok"}>{fwSnoozed(f.id) ? "Snoozed" : "Active"}</Chip>
            {cat ? <button className="btn btn-secondary sm" onClick={gapExport}><Icon name="download" />Export gap assessment</button> : null}
            <button className="btn btn-secondary sm" onClick={viewInControls}>View in controls</button>
            <button className="btn btn-ghost sm" onClick={onClose}><Icon name="x" />Close</button>
          </div>
        </div>
        <div className="fwmetrics">
          <div className="fwmetric"><div className="ml">Readiness</div><div className="mv" style={{ color: fwBand(p) }}>{p}%</div><div className="mm">{sc ? sc.impl + " of " + sc.total + " applicable requirements met" : ""}</div></div>
          <div className="fwmetric"><div className="ml">Mapped controls</div><div className="mv">{ctrls.length}</div><div className="mm">{passing} passing · {needs} need evidence</div></div>
          <div className="fwmetric"><div className="ml">Open gaps</div><div className="mv">{sc ? sc.cnt["Not met"] + sc.cnt["Not assessed"] : f.gaps}</div><div className="mm">{sc ? sc.cnt["Not met"] + " not met · " + sc.cnt["Not assessed"] + " not assessed" : "requirements to close"}</div></div>
          <div className="fwmetric"><div className="ml">Next audit</div><div className="mv" style={{ fontSize: 15, lineHeight: 1.3, fontWeight: 600 }}>{f.audit || "—"}</div></div>
        </div>
        {sc ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}><FwSegsBar fwId={f.id} h={10} /></div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: 12, color: "var(--ink-2)" }}>
              {REQ_ST.map((k) => <span key={k} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><span style={{ width: 10, height: 10, borderRadius: 3, background: REQ_ST_COL[k], display: "inline-block" }} />{k} {sc.cnt[k]}</span>)}
            </div>
          </div>
        ) : null}
      </div></section>

      {cat && cat.r && cat.r.length ? (
        <div className="fwsplit">
          <section className="card"><div className="c-head"><h3>Groups</h3><div className="r"><span className="tag">{cat.g.length}</span></div></div>
            <div className="c-body flush scroll" id="fwGroups" style={{ maxHeight: 520 }}>
              <button type="button" className={`fwgrp ${grp ? "" : "on"}`} aria-pressed={!grp} onClick={() => { setGrp(null); setLimit(REQ_PAGE); }}>
                <span className="gl"><span>All groups</span><span className="gr">{cat.r.length}</span></span>
              </button>
              {cat.g.map((g) => {
                const st = fwGroupStat(f.id, g[0]); const q = st.tot ? Math.round((st.met / st.tot) * 100) : 0; const on = grp === g[0];
                return (
                  <button key={g[0] + g[1]} type="button" className={`fwgrp ${on ? "on" : ""}`} aria-pressed={on} onClick={() => { setGrp(g[0]); setLimit(REQ_PAGE); }}>
                    <span className="gl"><span>{g[0] ? g[0] + " " : ""}{g[1]}</span><span className="gr">{st.tot ? st.met + "/" + st.tot : "n/a"}</span></span>
                    <span className="gbar"><span style={{ width: `${q}%`, background: st.tot ? fwBand(q) : "var(--line-2)" }} /></span>
                  </button>
                );
              })}
            </div>
          </section>
          <ReqPane fwId={f.id} reqF={reqF} setReqF={setReqF} rq={rq} setRq={setRq} grp={grp} setGrp={setGrp} limit={limit} setLimit={setLimit} />
        </div>
      ) : null}

      {f.id === "iso27001" || f.id === "iso27002" ? <AnnexCard /> : null}
    </>
  );
}

function AnnexCard() {
  const covered = annexCovered();
  return (
    <section className="card"><div className="c-head"><h3>ISO/IEC 27001:2022 Annex A catalogue</h3><div className="r"><span className="tag">{ANNEXA.length}</span></div></div>
      <div className="c-body">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>{["Organizational", "People", "Physical", "Technological"].map((th) => <span key={th} className="tag">{th}: {ANNEXA.filter((a) => a.theme === th).length}</span>)}</div>
        <div className="scroll" style={{ maxHeight: 260, border: "1px solid var(--line)", borderRadius: 8 }}>
          <Table cols={[{ t: "Ref" }, { t: "Control" }, { t: "Coverage" }]}>
            {ANNEXA.map((a) => <tr key={a.id}><td className="strong num">{a.id}</td><td>{a.title}</td><td>{covered.has(a.id) ? <StatusChip s="Applied" /> : <Chip cls="neutral" icon="dot">Not mapped</Chip>}</td></tr>)}
          </Table>
        </div>
      </div>
    </section>
  );
}

interface PaneProps { fwId: string; reqF: string; setReqF: (v: string) => void; rq: string; setRq: (v: string) => void; grp: string | null; setGrp: (v: string | null) => void; limit: number; setLimit: (v: number | ((p: number) => number)) => void }
function ReqPane({ fwId, reqF, setReqF, rq, setRq, grp, setGrp, limit, setLimit }: PaneProps) {
  const cat = FRAMEWORK_REQS[fwId]; const gm = fwGroupMap(fwId); const admin = fwCanAdmin();
  const base0 = cat.r.filter((r) => !grp || r[2] === grp);
  const cnt: Record<string, number> = {}; base0.forEach((r) => { const st = reqStatus(fwId, r[0]); cnt[st] = (cnt[st] || 0) + 1; });
  const chips: [string, string, number][] = [["all", "All", base0.length], ...REQ_ST.map((k) => [k, k, cnt[k] || 0] as [string, string, number])];
  const q = (rq || "").trim().toLowerCase();
  const base = cat.r.filter((r) => (!grp || r[2] === grp) && (!q || (r[0] + " " + r[1] + " " + (r[3] || "")).toLowerCase().includes(q)));
  const list = reqF === "all" ? base : base.filter((r) => reqStatus(fwId, r[0]) === reqF);
  const page = list.slice(0, limit);
  return (
    <section className="card"><div className="c-head"><h3>Requirements</h3><div className="r" id="fwReqCount"><span className="tag">{list.length}{list.length !== cat.r.length ? " of " + cat.r.length : ""}</span></div></div>
      <div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
        <div id="fwChips" className="btngrp" style={{ flexWrap: "wrap" }}>
          {chips.map((c) => <button key={c[0]} className="fchip" aria-pressed={reqF === c[0]} onClick={() => { setReqF(c[0]); setLimit(REQ_PAGE); }}>{c[1]} <span className="tag" style={{ marginLeft: 3 }}>{c[2]}</span></button>)}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
          <label className="field" style={{ flex: "1 1 220px", margin: 0 }}><span className="flab">Search requirements (id, title, guidance)</span>
            <input className="input" type="search" value={rq} onChange={(e) => { setRq(e.target.value); setLimit(REQ_PAGE); }} placeholder="Search…" /></label>
          <span id="fwGroupChip">{grp ? <button className="fchip on" onClick={() => { setGrp(null); setLimit(REQ_PAGE); }}>{grp + " " + (gm[grp] || "")} · Clear</button> : null}</span>
        </div>
        <div className="scroll" id="fwReqBody" style={{ flex: "1 1 auto", minHeight: 120, maxHeight: 520, overflow: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {!list.length ? (
            <div className="empty" style={{ padding: 24 }}><div className="ei"><Icon name="search" /></div><h4>No requirements match</h4><p>No requirements with this status, group or search.</p></div>
          ) : (
            <>
              {page.map((r) => <ReqRow key={r[0]} fwId={fwId} r={r} />)}
              {list.length > limit ? (
                <button className="btn btn-secondary sm" style={{ alignSelf: "flex-start" }} onClick={() => setLimit((l) => l + REQ_PAGE)}>Show {Math.min(REQ_PAGE, list.length - limit)} more ({list.length - limit} remaining)</button>
              ) : limit > REQ_PAGE && list.length > REQ_PAGE ? (
                <button className="btn btn-ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => setLimit(REQ_PAGE)}>Show less</button>
              ) : null}
            </>
          )}
        </div>
        {admin ? null : <p className="field help" style={{ margin: 0 }}>Only a company admin or control owner can change requirement mappings or applicability.</p>}
      </div>
    </section>
  );
}

function ReqRow({ fwId, r }: { fwId: string; r: string[] }) {
  const id = r[0], title = r[1], gid = r[2], gu = r[3] || "";
  const openCtrl = useControlDrawer();
  const [open, setOpen] = useModState<Record<string, boolean>>("fw.open", {});
  const [pick, setPick] = useModState<Record<string, string>>("fw.pick", {});
  const [nat, setNat] = useModState<Record<string, string>>("fw.nat", {});
  const [err, setErr] = useModState<Record<string, string>>("fw.err", {});
  const L = useLayer();
  const st = reqStatus(fwId, id); const na = st === "Not applicable";
  const mc = fwReqControls(fwId, id); const isOpen = !!open[id]; const gm = fwGroupMap(fwId);
  const E = fwEdits.get(); const mod = E.MOD[fwId]?.[id]; const naRec = E.NA[fwId]?.[id];
  const meta = [gm[gid] ? gid + " " + gm[gid] : "", mc.length + " control" + (mc.length === 1 ? "" : "s"), mod ? "mapping edited" : ""].filter(Boolean).join(" · ");
  const setE = (k: string, v: string | null) => setErr((p) => { const n = { ...p }; if (v == null) delete n[k]; else n[k] = v; return n; });
  const toggle = () => setOpen((p) => { const n = { ...p }; if (n[id]) delete n[id]; else n[id] = true; return n; });

  const mapCtrl = (ctrlId: string) => {
    if (!fwCanAdmin()) return;
    const c = DATA.controls.find((x) => x.id === ctrlId); if (!c) return;
    const res = toggleReqControl(fwId, id, ctrlId, getMe().name, nowStamp().slice(0, 10));
    if (res === "unmapped") { wsLog("framework.req.unmap", fwId + " " + id + " ✕ " + ctrlId, "Control"); L.toast(ctrlId + " unmapped from " + id); }
    else { wsLog("framework.req.map", fwId + " " + id + " ← " + ctrlId, "Control"); L.toast(ctrlId + " mapped to " + id); }
    setPick((p) => { const n = { ...p }; delete n[id]; return n; }); setE(id, null); touchFw();
  };
  const doMap = () => { const cid = pick[id]; if (!cid) { setE(id, "Choose a control first."); return; } mapCtrl(cid); };
  const toggleNA = () => {
    if (!fwCanAdmin()) return;
    if (clearReqNA(fwId, id)) { wsLog("framework.req.applicable", fwId + " " + id, "Control"); L.toast(id + " back in scope"); setE(id, null); touchFw(); return; }
    const why = String(nat[id] || "").trim();
    if (why.length < 15) { setE(id, "Justify why it does not apply (at least 15 characters); auditors review this."); return; }
    setReqNA(fwId, id, why, getMe().name, nowStamp().slice(0, 10));
    setNat((p) => { const n = { ...p }; delete n[id]; return n; }); setE(id, null);
    wsLog("framework.req.na", fwId + " " + id, "Control"); L.toast(id + " marked not applicable"); touchFw();
  };

  const admin = fwCanAdmin(); const picked = pick[id] || ""; const pickedMapped = !!picked && mc.some((c) => c.id === picked);
  return (
    <div className={`fwreq${isOpen ? " open" : ""}${na ? " na" : ""}`}>
      <button type="button" className="fwreq-head" aria-expanded={isOpen} onClick={toggle}>
        <span className="rh-main"><span className="rh-top"><span className="num strong" style={{ fontSize: 12 }}>{id}</span> <span style={{ fontWeight: 500 }}>{title}</span></span><span className="rh-meta">{meta}</span></span>
        <ReqStatusPill st={st} /><Icon name="chevd" className="rh-chev" />
      </button>
      {isOpen ? (
        <div className="fwreq-body">
          <div style={{ fontSize: 13, color: "var(--ink-2)" }}>{gu || "No guidance recorded."}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>Mapped controls:</span>
            {mc.length ? mc.map((c) => (
              <span key={c.id} style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
                <button type="button" className="tag num" title={c.title} onClick={() => openCtrl(c.id)} style={{ cursor: "pointer", color: "var(--ink-2)" }}>{c.id} · {c.status}</button>
                {admin ? <button className="btn btn-ghost sm" style={{ minHeight: 28, padding: "0 8px" }} onClick={() => mapCtrl(c.id)} aria-label={`Remove ${c.id} from ${id}`}>Remove</button> : null}
              </span>
            )) : <span style={{ fontSize: 12, color: "var(--bad-ink)" }}>None — this requirement is not assessed until a control is mapped.</span>}
          </div>
          {mod ? <div style={{ fontSize: 12, color: "var(--warn-ink)" }}>Mapping edited by {mod.by} on {mod.date}; draft until compliance review.</div> : null}
          {naRec ? <div style={{ background: "var(--surface-2)", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "var(--ink-2)" }}>Not applicable: {naRec.reason} ({naRec.by}, {naRec.date})</div> : null}
          {admin ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px dashed var(--line-2)", paddingTop: 10, marginTop: 2 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
                <label className="field" style={{ flex: "1 1 240px", margin: 0 }}><span className="flab">Add or remove a control mapping</span>
                  <select className="select" value={picked} onChange={(e) => setPick((p) => ({ ...p, [id]: e.target.value }))}>
                    <option value="">Choose a control…</option>
                    {DATA.controls.map((c) => <option key={c.id} value={c.id}>{c.id} — {c.title}</option>)}
                  </select></label>
                <button className="btn btn-primary sm" onClick={doMap}>{pickedMapped ? "Unmap " + picked : "Map control"}</button>
              </div>
              {na ? <button className="btn btn-secondary sm" style={{ alignSelf: "flex-start" }} onClick={toggleNA}>Make applicable again</button> : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
                  <label className="field" style={{ flex: "1 1 240px", margin: 0 }}><span className="flab">Justification if not applicable (min 15 characters)</span>
                    <input className="input" type="text" value={nat[id] || ""} onChange={(e) => setNat((p) => ({ ...p, [id]: e.target.value }))} /></label>
                  <button className="btn btn-secondary sm" onClick={toggleNA}>Mark not applicable</button>
                </div>
              )}
              {err[id] ? <div role="alert" style={{ color: "var(--bad-ink)", fontSize: 12, fontWeight: 600 }}>{err[id]}</div> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
void Fragment; void useState; void Empty;
