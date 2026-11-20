/* Production Settings view of the AI Assistant (programme group 6): whether the company uses AI at all, what happens when a request holds
   personal data, and the agents' track record. Turning AI on and switching to "mask then send" each need a second admin's approval; turning
   AI off and going back to blocking are immediate (the safe direction). The server checks every rule again and records each change. */
import { Chip, Icon } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { useG6Settings } from "@/lib/g6";
import { useApp, useData } from "@/lib/store";
import { ApprovalsPanel, attempt } from "@/components/kit/sodKit";
import * as svc from "@/features/assistant/services/assistant";

export function SettingsTab() {
  useData(); const role = useApp((s) => s.role);
  const L = useLayer(); const s = useG6Settings();
  if (!s) return <p className="field help">Loading…</p>;
  const admin = role === "admin";
  const run = (p: () => Promise<{ pending?: boolean } | object>, pendingMsg: string, doneMsg: string) => attempt(L, async () => { const r = await p() as { pending?: boolean }; L.toast(r.pending ? pendingMsg : doneMsg); });
  const row = { display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" as const, padding: "12px 0", borderBottom: "1px solid var(--line)" };
  return (
    <div style={{ maxWidth: 880, display: "flex", flexDirection: "column", gap: 12 }}>
      <ApprovalsPanel prefix={["ai.enable", "ai.mask"]} title="AI setting approvals (second admin)" />
      <div style={row}>
        <div style={{ flex: "1 1 320px" }}>
          <div className="strong">AI for your company</div>
          <p className="field help" style={{ margin: "4px 0 0" }}>The Assistant and agents send requests to {s.model ? <>the AI provider (Claude, <span className="num">{s.model}</span>)</> : "the AI provider"} only while this is on. Turning it on needs a second admin; turning it off is immediate.</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          {!s.configured ? <Chip cls="neutral" icon="dot">Not set up on this deployment</Chip> : s.enabled ? <Chip cls="ok" icon="check">On</Chip> : s.enablePending ? <Chip cls="warn" icon="clock">Turning on: awaiting approval</Chip> : <Chip cls="neutral" icon="dot">Off</Chip>}
          {admin && s.configured ? (s.enabled
            ? <button className="btn btn-danger sm" onClick={() => run(() => svc.setAiOn(false), "", "AI turned off")}>Turn AI off</button>
            : <button className="btn btn-primary sm" disabled={!!s.enablePending} onClick={() => run(() => svc.setAiOn(true), "Turning AI on needs approval from a second admin", "AI turned on")}><Icon name="assistant" />Ask to turn AI on</button>) : null}
        </div>
      </div>
      {!s.configured ? <p className="field help" style={{ margin: 0 }}>The platform operator adds the AI provider&apos;s key on the server (never in the browser). Until then nothing can be sent.</p> : null}
      <div style={row}>
        <div style={{ flex: "1 1 320px" }}>
          <div className="strong">Personal data in a request</div>
          <p className="field help" style={{ margin: "4px 0 0" }}>A PII blocker checks the question, earlier turns and every record before anything leaves: email addresses, phone numbers, payment cards, IBANs, national identity and passport numbers, dates of birth, IP addresses, secrets and the names of your company&apos;s people. It finds these by pattern, so it cannot catch every way of describing a person: keep personal data out of questions.</p>
          <p className="field help" style={{ margin: "6px 0 0" }}><strong>Block and explain</strong> (default): nothing is sent; the person sees what kind of data was found and where. <strong>Mask then send</strong>: what was found is replaced by a placeholder such as [EMAIL] and the rest is sent. Both are recorded in the audit log (the kind and place, never the value).</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          {s.mode === "block" ? <Chip cls="ok" icon="check">Block and explain</Chip> : <Chip cls="warn" icon="alert">Mask then send</Chip>}
          {s.maskPending ? <Chip cls="warn" icon="clock">Mask then send: awaiting approval</Chip> : null}
          {admin ? (s.mode === "block"
            ? <button className="btn btn-secondary sm" disabled={!!s.maskPending} onClick={() => run(() => svc.setPiiMode("mask"), "Masking needs approval from a second admin", "Personal data will be masked")}>Ask to mask then send</button>
            : <button className="btn btn-secondary sm" onClick={() => run(() => svc.setPiiMode("block"), "", "Requests with personal data are blocked again")}>Back to block and explain</button>) : null}
        </div>
      </div>
      <div style={row}>
        <div style={{ flex: "1 1 320px" }}>
          <div className="strong">Agent track record</div>
          <p className="field help" style={{ margin: "4px 0 0" }}>Approved suggestions an agent needs, with none of that many latest ones rejected, before anyone can ask to raise it to &quot;Acts (logged)&quot;. Raising always needs a second person&apos;s approval.</p>
        </div>
        <div className="seg" role="radiogroup" aria-label="Agent track record">
          {[3, 2, 0].map((n) => <button key={n} role="radio" aria-checked={s.trackRecord === n} disabled={!admin} onClick={() => s.trackRecord !== n && run(() => svc.setTrackRecord(n), "", `Track record set to ${n || "Off"}`)}>{n || "Off"}</button>)}
        </div>
      </div>
      <div className="card" style={{ boxShadow: "none", background: "var(--surface-2)" }}><div className="c-body" style={{ padding: "10px 12px", fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
        What is sent: your question, earlier turns of the conversation and the records you attach, read from the server without owners&apos; or authors&apos; names. Agents send only their trigger&apos;s records. Questions and answers are not stored by Selvara; the audit log records who asked, which records were sent, the model and the token counts. The AI provider does not use these requests to train its models (commercial API terms). Every answer is a draft for a person to review.
      </div></div>
      {s.history.length ? <div><div className="sectitle">Changes</div><ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: "var(--ink-2)" }}>{s.history.map((h, i) => <li key={i}><span className="num">{h.at}</span> {h.what}</li>)}</ul></div> : null}
    </div>
  );
}
