import { useRef } from "react";
import { Icon, Page } from "@/components/ui";
import { useApp, useData, useModState } from "@/lib/store";
import { SUBNAV } from "@/lib/subnav";
import { useLayer } from "@/hooks/useLayer";
import { asstCanManage } from "@/services/assistant";
import { ApprovalsPanel } from "@/components/kit/sodKit";
import { AgentForm } from "./AgentForm";
import { AskTab } from "./AskTab";
import { AgentsTab, McpTab, RunLogTab } from "./Tables";

export default function AssistantModule() {
  useData();
  const L = useLayer(); const bodyRef = useRef<HTMLDivElement>(null);
  const manage = asstCanManage(useApp((s) => s.role));
  const nav = SUBNAV.assistant; // the sidebar sub-nav shares this state key
  const [v, setV] = useModState<string>(nav.stateKey, nav.initial);
  const view = nav.items.some((x) => x[0] === v) ? v : nav.initial;
  const acts = view === "agents" && manage ? <button className="btn btn-primary" onClick={() => L.openModal("Create agent", (close) => <AgentForm close={close} />)}><Icon name="plus" />Create agent</button> : undefined;
  return (
    <Page mod="assistant" acts={acts}>
      <div className="card" style={{ flex: "1 1 auto" }}>
        <div className="c-head">
          <div className="seg" role="tablist">
            {nav.items.map((x) => <button key={x[0]} role="tab" aria-selected={view === x[0]} onClick={() => setV(x[0])}>{x[1]}</button>)}
          </div>
        </div>
        <div className="c-body scroll" id="asstBody" ref={bodyRef}>
          {view === "agents" || view === "mcp" ? <ApprovalsPanel prefix="assistant." title="Enable / grant approvals (four-eyes)" /> : null}
          {view === "ask" ? <AskTab scrollRef={bodyRef} /> : view === "agents" ? <AgentsTab manage={manage} /> : view === "log" ? <RunLogTab manage={manage} /> : <McpTab manage={manage} />}
        </div>
      </div>
    </Page>
  );
}
