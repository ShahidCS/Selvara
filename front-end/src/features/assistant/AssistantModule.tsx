import { useRef } from "react";
import { useGo, useRoute } from "@/lib/route";
import { Icon, Page } from "@/components/ui";
import { useApp, useData, useModState } from "@/lib/store";
import { SUBNAV } from "@/lib/subnav";
import { asstCanManage } from "@/features/assistant/services/assistant";
import { ApprovalsPanel } from "@/components/kit/sodKit";
import { AgentFormPage } from "./AgentFormPage";
import { AskTab } from "./AskTab";
import { AgentsTab, McpTab, RunLogTab } from "./Tables";
import { SettingsTab } from "./SettingsTab";

/** `/ws/assistant` shows the sidebar-selected view (Ask, Agents, Run log, MCP servers); `/new` creates an agent. */
export default function AssistantModule() {
  const { param } = useRoute();
  if (param === "new") return <AgentFormPage />;
  return <AssistantViews />;
}

function AssistantViews() {
  useData();
  const go = useGo(); const bodyRef = useRef<HTMLDivElement>(null);
  const manage = asstCanManage(useApp((s) => s.role));
  const nav = SUBNAV.assistant; // the sidebar sub-nav shares this state key
  const [v, setV] = useModState<string>(nav.stateKey, nav.initial);
  const view = nav.items.some((x) => x[0] === v) ? v : nav.initial;
  const acts = view === "agents" && manage ? <button className="btn btn-primary" onClick={() => go("/ws/assistant/new")}><Icon name="plus" />Create agent</button> : undefined;
  return (
    <Page mod="assistant" acts={acts}>
      <div className="card" style={{ flex: "1 1 auto" }}>
        <div className="c-head" style={{ padding: "0 8px" }}>
          <div className="tabs" role="tablist" aria-label="Assistant views">
            {nav.items.map((x) => <button key={x[0]} className="tab" role="tab" aria-selected={view === x[0]} onClick={() => setV(x[0])}>{x[1]}</button>)}
          </div>
        </div>
        <div className="c-body scroll" id="asstBody" ref={bodyRef}>
          {view === "agents" || view === "mcp" ? <ApprovalsPanel prefix="assistant." title="Enable / grant approvals (four-eyes)" /> : null}
          {view === "ask" ? <AskTab scrollRef={bodyRef} /> : view === "agents" ? <AgentsTab manage={manage} /> : view === "log" ? <RunLogTab manage={manage} /> : view === "settings" ? <SettingsTab /> : <McpTab manage={manage} />}
        </div>
      </div>
    </Page>
  );
}
