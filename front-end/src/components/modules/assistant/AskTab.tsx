import { useEffect, useRef, useState } from "react";
import { Chip, Icon } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { getMe, wsLog } from "@/lib/audit";
import { bumpData } from "@/lib/store";
import { clampText } from "@/lib/security";
import * as svc from "@/services/assistant";

const SUGG = ["Summarise open risks", "Draft a board summary", "What is failing for SOC 2?", "Explain our MFA and access posture", "Draft a policy review update"];

/** Prototype: REND.assistant "ask" view. Prompts and replies are rendered as React text only (pre-wrap), never as HTML. */
export function AskTab({ scrollRef }: { scrollRef: React.RefObject<HTMLDivElement | null> }) {
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
  const reviewed = () => { wsLog("assistant.draft.reviewed", "draft reviewed by " + getMe().name, "System"); L.toast("Marked as reviewed"); };
  const clear = () => { svc.clearThread(); bumpData(); };
  return (
    <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
      {thread.length ? thread.map((mm, i) => mm.role === "user" ? (
        <div key={i} style={{ alignSelf: "flex-end", maxWidth: "85%", background: "var(--accent)", color: "#fff", padding: "9px 13px", borderRadius: "13px 13px 3px 13px", fontSize: 13.5, lineHeight: 1.5, overflowWrap: "anywhere" }}>{mm.text}</div>
      ) : (
        <div key={i} className="card" style={{ boxShadow: "none", background: "var(--surface-2)", alignSelf: "flex-start", maxWidth: "94%" }}>
          <div className="c-body">
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}><Icon name="assistant" /><span style={{ fontSize: 12, color: "var(--muted)" }}>Assistant</span><Chip cls="warn" icon="alert">Draft · review required</Chip></div>
            <div style={{ fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{mm.text}</div>
            <div className="btngrp" style={{ marginTop: 10 }}>
              <button className="btn btn-ghost sm" onClick={() => copy(i)}><Icon name="download" />Copy</button>
              <button className="btn btn-ghost sm" onClick={reviewed}><Icon name="check" />Mark reviewed</button>
            </div>
          </div>
        </div>
      )) : (
        <div className="card" style={{ boxShadow: "none", background: "var(--surface-2)" }}>
          <div className="c-body">
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}><Icon name="assistant" /><span style={{ fontSize: 12, color: "var(--muted)" }}>Assistant · draft, review required</span></div>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>Based on current workspace data, {mtr.ctrlFail} of {mtr.ctrlTotal} controls need attention and {mtr.highRisk} of {mtr.risks} risks are rated high or critical. Ask me to summarise risks, draft a board update, or explain your posture — every answer is a draft for your review.</p>
          </div>
        </div>
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
