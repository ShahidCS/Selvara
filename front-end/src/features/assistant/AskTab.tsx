import { useEffect, useState } from "react";
import { AIPanel, Chip, Icon } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { getMe, wsLog } from "@/lib/audit";
import { bumpData, useModState } from "@/lib/store";
import { clampText } from "@/lib/security";
import * as svc from "@/features/assistant/services/assistant";
import { API_ON } from "@/lib/rbac";
import { AskServer } from "./AskServer";

const SUGG = ["Summarise open risks", "Draft a board summary", "What is failing for SOC 2?", "Explain our MFA and access posture", "Draft a policy review update"];

/** Prototype: REND.assistant "ask" view. Prompts and replies are rendered as React text only (pre-wrap), never as HTML. */
export function AskTab({ scrollRef }: { scrollRef: React.RefObject<HTMLDivElement | null> }) {
  return API_ON ? <AskServer scrollRef={scrollRef} /> : <AskDemo scrollRef={scrollRef} />;
}
/** The demonstration: canned drafts, nothing leaves the browser. */
function AskDemo({ scrollRef }: { scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const L = useLayer();
  const [text, setText] = useState("");
  const thread = svc.ASST.thread; const mtr = svc.asstMetrics();
  const n = thread.length;
  useEffect(() => { const sc = scrollRef.current; if (sc && n) sc.scrollTop = sc.scrollHeight; }, [n, scrollRef]);
  const ask = async (q?: string) => {
    const t = clampText(q ?? text, svc.ASK_MAX);
    if (!t) return;
    try {
      await svc.ask(t);
      wsLog("assistant.draft.generated", t.slice(0, 60), "System");
      setText(""); bumpData();
    } catch { L.toast("Could not draft an answer", false); }
  };
  const copy = async (i: number) => {
    const t = svc.ASST.thread[i]?.text || "";
    try { await navigator.clipboard.writeText(t); L.toast("Draft copied"); } catch { L.toast("Copy not available in this view"); }
  };
  // Which answers in this thread were marked reviewed, and by whom (kept while the app is open; cleared with the thread).
  const [rev, setRev] = useModState<Record<number, string>>("assistant.reviewed", {});
  const reviewed = (i: number) => {
    if (rev[i]) return;
    const me = getMe().name;
    wsLog("assistant.draft.reviewed", "draft reviewed by " + me, "System"); setRev((p) => ({ ...p, [i]: me })); L.toast("Marked as reviewed");
  };
  const clear = () => { svc.clearThread(); setRev({}); bumpData(); };
  return (
    <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
      {thread.length ? thread.map((mm, i) => mm.role === "user" ? (
        <div key={i} style={{ alignSelf: "flex-end", maxWidth: "85%", background: "var(--accent-weak)", color: "var(--ink)", padding: "9px 13px", borderRadius: "13px 13px 3px 13px", fontSize: 13.5, lineHeight: 1.5, overflowWrap: "anywhere" }}>{mm.text}</div>
      ) : (
        <div key={i} style={{ alignSelf: "flex-start", maxWidth: "94%" }}>
          <AIPanel source="Assistant" meta="Draft, review required" label="Assistant answer"
            footer={<>
              <button className="btn btn-ghost sm" onClick={() => copy(i)}>Copy</button>
              {rev[i] ? <Chip cls="ok" icon="check">Reviewed by {rev[i]}</Chip> : <button className="btn btn-ghost sm" onClick={() => reviewed(i)}><Icon name="check" />Mark reviewed</button>}
            </>}>
            <div style={{ fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{mm.text}</div>
          </AIPanel>
        </div>
      )) : (
        <AIPanel source="Assistant" meta="Draft, review required" label="Assistant introduction">
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>Based on current workspace data, {mtr.ctrlFail} of {mtr.ctrlTotal} controls need attention and {mtr.highRisk} of {mtr.risks} risks are rated high or critical. Ask me to summarise risks, draft a board update, or explain your posture. Every answer is a draft for your review.</p>
        </AIPanel>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{SUGG.map((s) => <button key={s} className="fchip" onClick={() => ask(s)}>{s}</button>)}</div>
      <div className="field" style={{ margin: 0 }}>
        <label className="vh" htmlFor="asstInput">Ask the assistant</label>
        <textarea className="input" id="asstInput" rows={2} maxLength={svc.ASK_MAX} placeholder="Ask about your posture, draft a summary, or summarise open risks…" style={{ resize: "vertical" }} value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask(); }} />
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="btn btn-primary" onClick={() => ask()}><Icon name="assistant" />Draft answer</button>
        {thread.length ? <button className="btn btn-ghost sm" onClick={clear}><Icon name="x" />Clear</button> : null}
        <span className="field help" style={{ margin: "0 0 0 auto" }}>Draft only · human review required</span>
      </div>
    </div>
  );
}
