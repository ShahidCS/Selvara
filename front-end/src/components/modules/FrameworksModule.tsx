import { useEffect, useRef } from "react";
import { Chip, Empty, Icon, Page, Table } from "@/components/ui";
import { DATA, FRAMEWORK_REQS } from "@/lib/data";
import { useData, useModState } from "@/lib/store";
import { useFwEdits, REQ_PAGE, fwBand, fwCanAdmin, fwLegend, fwReadiness, fwScopeIn, fwScore, fwSnoozed, fwEdits, touchFw } from "@/lib/frameworks";
import { FwDetail } from "./frameworks/FwDetail";
import { FwAdd } from "./frameworks/FwAdd";
import { FwSegsBar } from "./frameworks/FwSegsBar";
import { getMe, wsLog } from "@/lib/audit";
import { useLayer } from "@/hooks/useLayer";
import { useApp } from "@/lib/store";

const KINDS: [string, string][] = [["All", "All"], ["Standard", "Standards"], ["Framework", "Frameworks"], ["Regulation", "Regulations"]];
/* Ported as-is: Standard=0 is falsy, so `|| 3` sorts Standards last (Frameworks, Regulations, Standards). See checklist open question. */
const KORD: Record<string, number> = { Standard: 0, Framework: 1, Regulation: 2 };

export default function FrameworksModule() {
  useData(); useFwEdits(); useApp((s) => s.role);
  const L = useLayer();
  const [kind, setKind] = useModState("fw.kind", "All");
  const [jur, setJur] = useModState("fw.jur", "all");
  const [q, setQ] = useModState("fw.q", "");
  const [sel, setSel] = useModState<string | null>("fw.sel", null);
  const [, setReqF] = useModState("fw.reqf", "all");
  const [, setRq] = useModState("fw.rq", "");
  const [, setGrp] = useModState<string | null>("fw.grp", null);
  const [, setLimit] = useModState("fw.limit", REQ_PAGE);
  const [, setOpen] = useModState<Record<string, boolean>>("fw.open", {});
  const detailRef = useRef<HTMLDivElement>(null); const addRef = useRef<HTMLDivElement>(null);
  const admin = fwCanAdmin();

  // returning to the module with a framework selected scrolls it into view (prototype behaviour)
  useEffect(() => { if (sel && detailRef.current?.firstChild) detailRef.current.scrollIntoView({ block: "start" }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const select = (id: string) => {
    if (sel !== id) { setSel(id); setReqF("all"); setRq(""); setGrp(null); setLimit(REQ_PAGE); setOpen({}); setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); }
    else setSel(null);
  };
  const toggleSnooze = (id: string) => { if (!fwCanAdmin()) return; const S = fwEdits.get().SNOOZE; S[id] = !S[id]; wsLog("framework." + (S[id] ? "snoozed" : "resumed"), id, "Control"); touchFw(); };
  const toggleScope = (id: string) => { if (!fwCanAdmin()) return; const S = fwEdits.get().SCOPE; S[id] = fwScopeIn(id) ? false : true; wsLog("framework.scope." + (S[id] === false ? "out" : "in"), id, "Control"); touchFw(); };

  const regions = Array.from(new Set(DATA.frameworks.map((f) => f.region).filter(Boolean))).sort() as string[];
  const ql = (q || "").trim().toLowerCase();
  const list = DATA.frameworks
    .filter((f) => (kind === "All" || f.kind === kind) && (jur === "all" || f.region === jur) && (!ql || (f.name + " " + f.id + " " + (f.region || "")).toLowerCase().includes(ql)))
    .sort((a, b) => (KORD[a.kind] || 3) - (KORD[b.kind] || 3) || (a.name < b.name ? -1 : 1));

  return (
    <Page mod="frameworks" acts={<button className="btn btn-secondary" onClick={() => addRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}><Icon name="plus" />Add framework</button>}>
      <div className="scroll" id="fwScroll" style={{ flex: "1 1 auto", minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: 14, paddingRight: 2 }}>
        <div id="fwLibrary">
          <section className="card"><div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: "-.01em" }}>Standards, Regulations and Frameworks</h2>
              <p className="sub" style={{ margin: "4px 0 0" }}>One control set mapped to every catalogue in scope. Each catalogue is scored requirement by requirement from the status of its mapped controls.</p>
            </div>
            <div className="banner warn" style={{ display: "block" }}>Requirement titles are paraphrased; licensed standard text is not reproduced. All requirement-to-control mappings and applicability decisions are draft content requiring review by qualified compliance staff before reliance.</div>
            <div className="fwkinds">
              {KINDS.map((k) => {
                const fs = DATA.frameworks.filter((f) => k[0] === "All" || f.kind === k[0]);
                const inScope = fs.filter((f) => fwScopeIn(f.id));
                const avg = inScope.length ? Math.round(inScope.reduce((a, f) => a + fwReadiness(f.id), 0) / inScope.length) : 0;
                const on = kind === k[0];
                return (
                  <button key={k[0]} type="button" className={`fwkind ${on ? "on" : ""}`} aria-pressed={on} onClick={() => setKind(k[0])}>
                    <span className="kl">{k[1]}</span><span className="kn">{fs.length}</span>
                    <span className="km">{inScope.length} in scope · avg readiness {avg}%</span>
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
              <label className="field" style={{ flex: "0 1 190px", margin: 0 }}><span className="flab">Region</span>
                <select className="select" value={jur} onChange={(e) => setJur(e.target.value)}><option value="all">All regions</option>{regions.map((r) => <option key={r} value={r}>{r}</option>)}</select></label>
              <label className="field" style={{ flex: "1 1 240px", margin: 0 }}><span className="flab">Search by name or region</span>
                <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ISO, GDPR, EU…" /></label>
              <span style={{ fontSize: 12, color: "var(--muted)", paddingBottom: 9 }} aria-live="polite">{list.length} of {DATA.frameworks.length} shown</span>
            </div>
          </div></section>
          <section className="card">
            <div className="c-head"><h3>In the library</h3><div className="r"><span className="tag">{list.length}</span></div></div>
            <div className="c-body flush">
              {list.length ? (
                <Table cols={[{ t: "Name" }, { t: "Region" }, { t: "Readiness" }, { t: "Status" }, { t: "Scope" }, { t: "", r: true }]} minw={920}>
                  {list.map((f) => {
                    const sc = fwScore(f.id); const p = sc ? sc.pct : f.pct; const cat = FRAMEWORK_REQS[f.id]; const on = f.id === sel;
                    const snoozed = fwSnoozed(f.id), inscope = fwScopeIn(f.id);
                    return (
                      <tr key={f.id} style={{ background: on ? "var(--accent-weak)" : undefined, opacity: inscope && !snoozed ? undefined : 0.6 }}>
                        <td>
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}><span className="strong">{f.name}</span><Chip cls={f.kind === "Regulation" ? "info" : "neutral"}>{f.kind}</Chip></div>
                          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{cat ? cat.r.length + " requirements · " : ""}{f.mapped} mapped controls{f.audit ? " · " + f.audit : ""}</div>
                        </td>
                        <td style={{ fontSize: 13 }}>{f.region || "-"}</td>
                        <td style={{ minWidth: 200 }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "center" }}><FwSegsBar fwId={f.id} /><span className="num" style={{ fontSize: 13, fontWeight: 600, color: fwBand(p), width: 38, textAlign: "right" }}>{p}%</span></div>
                          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>{fwLegend(f.id)}</div>
                        </td>
                        <td>{admin
                          ? <button className={`fchip sm ${snoozed ? "" : "on"}`} onClick={() => toggleSnooze(f.id)} aria-pressed={!snoozed}>{snoozed ? "Snoozed" : "Active"}</button>
                          : <Chip cls={snoozed ? "neutral" : "ok"}>{snoozed ? "Snoozed" : "Active"}</Chip>}</td>
                        <td>{admin
                          ? <button className={`fchip sm ${inscope ? "on" : ""}`} onClick={() => toggleScope(f.id)} aria-pressed={inscope}>{inscope ? "In scope" : "Out of scope"}</button>
                          : <span style={{ fontSize: 13 }}>{inscope ? "In scope" : "Out of scope"}</span>}</td>
                        <td className="r"><button className={`btn ${on ? "btn-primary" : "btn-ghost"} sm`} onClick={() => select(f.id)} aria-expanded={on}>{on ? "Open" : "Details"}</button></td>
                      </tr>
                    );
                  })}
                </Table>
              ) : <Empty icon="search" title="Nothing matches these filters" />}
            </div>
          </section>
        </div>
        <div id="fwDetail" ref={detailRef}>{sel ? <FwDetail fwId={sel} onClose={() => setSel(null)} /> : null}</div>
        <div id="fwAdd" ref={addRef}><FwAdd onAdded={(id) => { setSel(id); setReqF("all"); setRq(""); setGrp(null); setLimit(REQ_PAGE); setOpen({}); setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); }} /></div>
      </div>
    </Page>
  );
  void L; void getMe;
}
