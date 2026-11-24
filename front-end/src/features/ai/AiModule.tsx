import { adminLog } from "@/lib/adminAudit";
import { Chip, DataTable, Icon, KpiStrip, KpiTile, Page, Ring, StatusChip, Table, type DTColumn, Person } from "@/components/ui";
import { DATA } from "@/lib/data";
import { useApp, useData } from "@/lib/store";
import { hasRole } from "@/lib/sod";
import { wsLog } from "@/lib/audit";
import { useGo, useRoute } from "@/lib/route";
import { fwReadiness } from "@/lib/frameworks";
import { AI_DISCOVERY, AI_SHADOW, aiInit } from "@/features/ai/lib/ai";
import { useLayer } from "@/hooks/useLayer";
import * as svc from "@/features/ai/services/ai";
import { ApprovalsPanel } from "@/components/kit/sodKit";
import { askReason } from "@/components/kit/ReasonDialog";
import { API_ON } from "@/lib/rbac";
import { AiDetail } from "./AiDetail";
import { AiEditPage, AiRegisterPage } from "./AiForms";
import { AiEuChip, AiFriaChip, AiGuardChip } from "./AiChips";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AiSys = any;

/** `/ws/ai` is the register; `/new` (optionally `/new/:shadowId`), `/:id` and `/:id/edit` are pages. */
export default function AiModule() {
  const { param, sub } = useRoute();
  if (param === "new") return <AiRegisterPage shadowId={sub} />;
  if (param && sub === "edit") return <AiEditPage id={param} />;
  if (param) return <AiDetail id={param} />;
  return <AiList />;
}

function AiList() {
  useData();
  const L = useLayer(); const go = useGo();
  const canReg = hasRole(useApp((s) => s.role), "admin", "owner", ...(API_ON ? [] : ["analyst"]));
  DATA.ai.forEach(aiInit);
  const live = DATA.ai.filter((a) => a.status !== "Archived");
  const euHigh = live.filter((a) => a.euClass === "High-risk" || a.euClass === "Prohibited").length;
  const unconf = live.filter((a) => a.euState && a.euState.state !== "Confirmed").length;
  const iso = fwReadiness("iso42001");
  const dismiss = (id: string, name: string) => API_ON ? askReason(L, { title: "Dismiss discovered AI", label: "Why it does not need registering", confirm: "Dismiss", run: async (reason) => { await svc.dismissShadow(id, reason); return name + " dismissed from the discovered list"; } }) : askReason(L, {
    title: "Dismiss discovered AI", label: "", confirm: "Dismiss", intro: <>Dismiss <strong>{name}</strong> from the discovered list? It will no longer appear for registration.</>,
    run: async () => {
      const ok = await svc.dismissShadow(id); if (!ok) return "It was already gone from the discovered list";
      wsLog("ai.shadow.dismissed", id, "AI governance"); adminLog("ai.shadow.dismissed", id, { categories: ["AI governance"] });
      return name + " dismissed from the discovered list";
    },
  });
  const open = (id: string) => go(`/ws/ai/${encodeURIComponent(id)}`);
  const cols: DTColumn<AiSys>[] = [
    { key: "name", header: "System / model", value: (a) => a.name, locked: true, render: (a) => <span className="strong">{a.name}<div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 400 }}>{a.model} · {a.provider}</div></span> },
    { key: "surface", header: "Surface", value: (a) => a.surface, render: (a) => a.surface },
    { key: "eu", header: "EU AI Act", value: (a) => a.euClass || "Not classified", render: (a) => <><AiEuChip c={a.euClass} />{a.euState && a.euState.state === "Draft" ? <> <Chip cls="warn" icon="edit">Draft</Chip></> : null}</> },
    { key: "guard", header: "Guardrail", value: (a) => a.guardrail || "Controlled", render: (a) => <AiGuardChip g={a.guardrail} /> },
    { key: "status", header: "Status", value: (a) => a.status, render: (a) => <StatusChip s={a.status} /> },
    { key: "owner", header: "Owner", value: (a) => a.owner, render: (a) => <Person name={a.owner} /> },
    { key: "fria", header: "Impact assessment", value: (a) => a.fria?.status || "", render: (a) => <AiFriaChip f={a.fria} /> },
  ];
  const readiness: [string, string][] = [
    ["Systems with a confirmed class", (live.length - unconf) + " / " + live.length],
    ["Impact assessments approved", live.filter((a) => a.fria && a.fria.review === "Approved").length + " / " + live.filter((a) => a.tier === "High").length],
    ["High-risk under a Restricted guardrail", live.filter((a) => a.tier === "High" && a.guardrail === "Restricted").length + " / " + euHigh],
  ];
  return (
    <Page mod="ai" acts={<button className="btn btn-primary" data-tour="ai-register" disabled={!canReg} title={canReg ? undefined : "Only admin, owner or analyst can register AI systems"} onClick={() => go("/ws/ai/new")}><Icon name="plus" />Register system</button>}>
      <div className="scroll" style={{ flex: "1 1 auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingRight: 2 }}>
          <KpiStrip label="AI governance summary">
            <KpiTile label="Registered systems" value={live.length} caption="Not archived" />
            <KpiTile label="EU AI Act high-risk" value={euHigh} delta={euHigh ? { tone: "bad", text: "Obligations apply" } : { tone: "good", text: "None" }} caption="High-risk or prohibited" />
            <KpiTile label="Classifications to confirm" value={unconf} delta={unconf ? { tone: "watch", text: "Needs a second person" } : { tone: "good", text: "None" }} caption="Draft determinations" />
            <KpiTile label="Shadow AI found" value={AI_SHADOW.length} delta={AI_SHADOW.length ? { tone: "watch", text: "Unregistered" } : { tone: "good", text: "None" }} caption="Awaiting registration" />
          </KpiStrip>
          <details className="card" data-tour="ai-review" style={{ flex: "0 0 auto", boxShadow: "none", background: "var(--surface-2)", borderColor: "transparent" }}>
            <summary style={{ cursor: "pointer", padding: "10px 14px", fontSize: 12.5, color: "var(--muted)", display: "flex", gap: 8, alignItems: "center" }}><Icon name="shieldcheck" aria-hidden="true" style={{ width: 16, height: 16, flex: "0 0 auto" }} />Classifications and assessments are drafts for qualified compliance and legal review. <span style={{ color: "var(--ink-2)", textDecoration: "underline" }}>How decisions are made</span></summary>
            <div style={{ padding: "0 14px 10px 38px", fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>Do not rely on a classification or assessment until that review is done. EU AI Act classifications must be confirmed by an admin or owner other than the drafter, impact assessments approved by someone other than the submitter, and guardrail changes and archiving approved by a second person. Registering a system does not approve it. Only the AI system owner, an admin or an owner can change a system or triage its signals.</div>
          </details>
          <div className="card" data-tour="ai-inventory"><div className="c-head"><h3>AI inventory</h3></div><div className="c-body flush" style={{ padding: 0 }}>
            <DataTable<AiSys> id="ai-inventory" label="AI inventory" rows={DATA.ai} rowKey={(a) => a.id} columns={cols} searchText={(a) => `${a.id} ${a.name} ${a.model} ${a.provider} ${a.owner} ${a.surface}`}
              tabs={["Approved", "In review", "Archived"].map((st) => ({ key: st, label: st, match: (a: AiSys) => a.status === st }))}
              filters={[{ key: "eu", label: "EU AI Act", options: Array.from(new Set<string>(DATA.ai.map((a: AiSys) => String(a.euClass || "Not classified")))), get: (a: AiSys) => a.euClass || "Not classified" }, { key: "guard", label: "Guardrail", options: Array.from(new Set<string>(DATA.ai.map((a: AiSys) => String(a.guardrail || "Controlled")))), get: (a: AiSys) => a.guardrail || "Controlled" }]}
              onOpen={(a) => open(a.id)} exportName="ai-inventory" />
          </div></div>
          <ApprovalsPanel prefix={["ai.guardrail", "ai.archive"]} title="AI governance approvals (four-eyes)" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14, alignItems: "start" }}>
            <div className="card"><div className="c-head"><h3>Discovery sources</h3></div><div className="c-body" style={{ padding: "12px 14px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {AI_DISCOVERY.map((d) => (
                  <div key={d[0]} style={{ display: "flex", gap: 9 }}>
                    <span style={{ flex: "0 0 auto", width: 16, height: 16, color: "var(--accent)", marginTop: 1 }}><Icon name="search" /></span>
                    <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 13 }}>{d[0]}</div><div style={{ fontSize: 12, color: "var(--muted)" }}>{d[1]}</div></div>
                  </div>
                ))}
              </div>
              {API_ON ? <p className="field help" style={{ margin: "10px 0 0" }}>No discovery source is connected yet: they arrive with integrations. Register the AI your company uses with Register system. The AI Assistant registers itself when AI is turned on.</p> : null}
            </div></div>
            <div className="card" data-tour="ai-discovered"><div className="c-head"><h3>Discovered AI awaiting registration</h3>{AI_SHADOW.length ? <span className="tag" style={{ marginLeft: 6 }}>{AI_SHADOW.length}</span> : null}</div>
              <div className="c-body flush" style={{ padding: 0 }}>
                {AI_SHADOW.length ? (
                  <Table cols={[{ t: "AI found" }, { t: "Found by" }, { t: "Where" }, { t: "" }]}>
                    {AI_SHADOW.map((s) => (
                      <tr key={s.id}>
                        <td className="strong" style={{ minWidth: 200 }}>{s.name}<div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 400 }}>{s.data} · {s.risk}</div></td>
                        <td style={{ fontSize: 12 }}>{s.found}</td><td style={{ fontSize: 12, color: "var(--muted)" }}>{s.where}</td>
                        <td className="r"><div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "flex-end" }}>
                          <button className="btn btn-ghost sm" disabled={!canReg} aria-label={`Register ${s.name}`} onClick={() => go(`/ws/ai/new/${encodeURIComponent(s.id)}`)}><Icon name="plus" />Register</button>
                          <button className="btn btn-ghost sm" disabled={!canReg} aria-label={`Dismiss ${s.name}`} onClick={() => dismiss(s.id, s.name)}><Icon name="x" />Dismiss</button>
                        </div></td>
                      </tr>
                    ))}
                  </Table>
                ) : <div className="empty" style={{ padding: 22 }}><div className="ei"><Icon name="check" /></div><h4>Nothing unregistered</h4></div>}
              </div>
            </div>
          </div>
          <div className="card" data-tour="ai-iso42001"><div className="c-head"><h3>ISO/IEC 42001 readiness</h3><button className="btn btn-ghost sm" style={{ marginLeft: "auto" }} onClick={() => go("/ws/frameworks")}><Icon name="frameworks" />Open framework</button></div>
            <div className="c-body" style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
              <Ring pct={iso} size={72} color="var(--accent)" />
              <div style={{ flex: "1 1 220px" }}>
                <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>AI management system implemented</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 420 }}>
                  {readiness.map((r) => <div key={r[0]} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5 }}><span style={{ color: "var(--ink-2)" }}>{r[0]}</span><span className="strong num" style={{ whiteSpace: "nowrap" }}>{r[1]}</span></div>)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}
