import { Icon, Kpi, Page, Ring, StatusChip, Table, activate } from "@/components/ui";
import { DATA } from "@/lib/data";
import { bumpData, useData } from "@/lib/store";
import { wsLog } from "@/lib/audit";
import { useGo } from "@/lib/route";
import { fwReadiness } from "@/lib/frameworks";
import { AI_DISCOVERY, AI_SHADOW, aiInit } from "@/lib/ai";
import { useLayer } from "@/hooks/useLayer";
import * as svc from "@/services/ai";
import { attempt } from "./issues/util";
import { openAiDrawer } from "./ai/AiDrawer";
import { openRegister } from "./ai/AiModals";
import { AiEuChip, AiFriaChip, AiGuardChip } from "./ai/AiChips";

/* Hook for other modules: `useAiDrawer()` opens the AI system drawer by id (see ai/AiDrawer.tsx). */
export { useAiDrawer } from "./ai/AiDrawer";

export default function AiModule() {
  useData();
  const L = useLayer(); const go = useGo();
  DATA.ai.forEach(aiInit);
  const live = DATA.ai.filter((a) => a.status !== "Archived");
  const euHigh = live.filter((a) => a.euClass === "High-risk" || a.euClass === "Prohibited").length;
  const unconf = live.filter((a) => a.euState && a.euState.state !== "Confirmed").length;
  const iso = fwReadiness("iso42001");
  const stop = { onClick: (e: React.MouseEvent) => e.stopPropagation(), onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation() };
  const dismiss = (id: string) => attempt(L, async () => {
    const ok = await svc.dismissShadow(id); if (!ok) return;
    wsLog("ai.shadow.dismissed", id, "AI governance"); // source: wsLog + adminLog (admin chain not ported)
    L.toast("Removed from the discovered list"); bumpData();
  });
  const open = (id: string) => openAiDrawer(L, id);
  const readiness: [string, string][] = [
    ["Systems with a confirmed class", (live.length - unconf) + " / " + live.length],
    ["Impact assessments approved", live.filter((a) => a.fria && a.fria.review === "Approved").length + " / " + live.filter((a) => a.tier === "High").length],
    ["High-risk under a Restricted guardrail", live.filter((a) => a.tier === "High" && a.guardrail === "Restricted").length + " / " + euHigh],
  ];
  return (
    <Page mod="ai" acts={<button className="btn btn-primary" onClick={() => openRegister(L)}><Icon name="plus" />Register system</button>}>
      <div className="scroll" style={{ flex: "1 1 auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingRight: 2 }}>
          <div className="kpis">
            <Kpi icon="ai" label="Registered systems" value={live.length} tone="accent" />
            <Kpi icon="shieldcheck" label="EU AI Act high-risk" value={euHigh} tone={euHigh ? "bad" : "good"} />
            <Kpi icon="clock" label="Classifications to confirm" value={unconf} tone={unconf ? "warn" : "good"} />
            <Kpi icon="search" label="Shadow AI found" value={AI_SHADOW.length} tone={AI_SHADOW.length ? "warn" : "good"} />
          </div>
          <div className="card" style={{ boxShadow: "none", background: "var(--info-bg)", borderColor: "transparent" }}>
            <div className="c-body" style={{ padding: "10px 14px", fontSize: 12.5, color: "var(--info-ink)", lineHeight: 1.5 }}>Classifications and assessments are draft content and need review by qualified compliance and legal staff before reliance. EU AI Act classifications must be confirmed by someone other than the drafter. Only the AI system owner or an admin can change a system or triage its signals.</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14, alignItems: "stretch" }}>
            <div className="card"><div className="c-head"><h3>Discovery sources</h3></div><div className="c-body" style={{ padding: "12px 14px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {AI_DISCOVERY.map((d) => (
                  <div key={d[0]} style={{ display: "flex", gap: 9 }}>
                    <span style={{ flex: "0 0 auto", width: 16, height: 16, color: "var(--accent)", marginTop: 1 }}><Icon name="search" /></span>
                    <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 13 }}>{d[0]}</div><div style={{ fontSize: 12, color: "var(--muted)" }}>{d[1]}</div></div>
                  </div>
                ))}
              </div>
            </div></div>
            <div className="card"><div className="c-head"><h3>Discovered AI awaiting registration</h3>{AI_SHADOW.length ? <span className="tag" style={{ marginLeft: 6 }}>{AI_SHADOW.length}</span> : null}</div>
              <div className="c-body flush" style={{ padding: 0 }}>
                {AI_SHADOW.length ? (
                  <Table cols={[{ t: "AI found" }, { t: "Found by" }, { t: "Where" }, { t: "" }]}>
                    {AI_SHADOW.map((s) => (
                      <tr key={s.id}>
                        <td className="strong">{s.name}<div style={{ fontSize: 11.5, color: "var(--muted)" }}>{s.data} · {s.risk}</div></td>
                        <td style={{ fontSize: 12 }}>{s.found}</td><td style={{ fontSize: 12, color: "var(--muted)" }}>{s.where}</td>
                        <td className="r" style={{ whiteSpace: "nowrap" }}>
                          <button className="btn btn-ghost sm" aria-label={`Register ${s.name}`} onClick={() => openRegister(L, s.id)}><Icon name="plus" />Register</button>
                          <button className="btn btn-ghost sm" aria-label={`Dismiss ${s.name}`} onClick={() => dismiss(s.id)}>Dismiss</button>
                        </td>
                      </tr>
                    ))}
                  </Table>
                ) : <div className="empty" style={{ padding: 22 }}><div className="ei"><Icon name="check" /></div><h4>Nothing unregistered</h4></div>}
              </div>
            </div>
          </div>
          <div className="card"><div className="c-head"><h3>ISO/IEC 42001 readiness</h3><button className="btn btn-ghost sm" style={{ marginLeft: "auto" }} onClick={() => go("/ws/frameworks")}><Icon name="frameworks" />Open framework</button></div>
            <div className="c-body" style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
              <Ring pct={iso} size={72} color="var(--accent)" />
              <div style={{ flex: "1 1 220px" }}>
                <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>AI management system implemented</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {readiness.map((r) => <div key={r[0]} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5 }}><span style={{ color: "var(--ink-2)" }}>{r[0]}</span><span className="strong num">{r[1]}</span></div>)}
                </div>
              </div>
            </div>
          </div>
          <div className="card"><div className="c-head"><h3>AI inventory</h3></div><div className="c-body flush" style={{ padding: 0 }}><div className="tbl-wrap">
            <Table minw={1180} cols={[{ t: "System / model" }, { t: "Surface" }, { t: "Discovered by" }, { t: "EU AI Act" }, { t: "Guardrail" }, { t: "Status" }, { t: "Owner" }, { t: "Impact assessment" }, { t: "" }]}>
              {DATA.ai.map((a) => {
                const arch = a.status === "Archived";
                return (
                  <tr key={a.id} className={arch ? "" : "clickable"} style={arch ? { opacity: 0.55 } : undefined} {...(arch ? {} : activate(() => open(a.id)))}>
                    <td className="strong">{a.name}<div style={{ fontSize: 12, color: "var(--muted)" }}>{a.model} · {a.provider}</div></td>
                    <td style={{ fontSize: 12 }}>{a.surface}</td><td style={{ fontSize: 12 }}>{a.discovered}</td>
                    <td><AiEuChip c={a.euClass} />{a.euState && a.euState.state === "Draft" ? <> <span className="tag" style={{ color: "var(--warn-ink)" }}>draft</span></> : null}</td>
                    <td><AiGuardChip g={a.guardrail} /></td><td><StatusChip s={a.status} /></td><td style={{ fontSize: 12 }}>{a.owner}</td><td><AiFriaChip f={a.fria} /></td>
                    <td className="r" {...stop}><button className="btn btn-ghost sm" aria-label={`Open ${a.name}`} onClick={() => open(a.id)}>Open</button></td>
                  </tr>
                );
              })}
            </Table>
          </div></div></div>
        </div>
      </div>
    </Page>
  );
}
