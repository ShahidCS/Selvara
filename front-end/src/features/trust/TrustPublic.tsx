import { useState } from "react";
import { AIPanel, Chip, FormMessage, Icon, Page, StatusChip, Table } from "@/components/ui";
import type { LayerApi } from "@/components/shell/LayerProvider";
import { DATA } from "@/lib/data";
import { getMe, wsLog } from "@/lib/audit";
import { bumpData, useData } from "@/lib/store";
import { clampText } from "@/lib/security";
import { TRUST, TRUST_FAQ, TRUST_SUBPROC, TRUST_UPDATES } from "@/lib/trustData";
import * as svc from "@/features/trust/services/trust";
import { RequestAccessForm, SubscribeForm } from "./TrustModals";
import { useSyncExternalStore } from "react";
import { API_ON } from "@/lib/rbac";
import { uiMessage } from "@/lib/grcSod";
import { g4Meta } from "@/services/ws";

const FAIL = "Something went wrong. Please try again.";
const LIVE_CTRLS: [string, string][] = [["Access control", "Pass"], ["Encryption", "Pass"], ["Availability", "Pass"], ["Vulnerability management", "In review"]];

/** Public Trust Center page (source trustPublicView, lines 3411-3426). Visitors/vendors always land here; internal roles can preview it. */
export default function TrustPublic({ L, manage, back }: { L: LayerApi; manage: boolean; back: () => void }) {
  useData();
  const [q, setQ] = useState(""); const [qErr, setQErr] = useState("");
  const [shown, setShown] = useState<{ ans: boolean; reply: string } | null>(null);
  const pub = useSyncExternalStore(g4Meta.subscribe, () => g4Meta.get().trustPublic, () => g4Meta.get().trustPublic);
  /* production: the company's own name, control status and access from the server; the demonstration's fixed texts otherwise */
  const company = API_ON ? pub?.company || "Trust Center" : "Northwind Payments";
  const ctrls: [string, string][] = API_ON ? pub?.controls ?? [] : LIVE_CTRLS;
  const acct = API_ON ? pub?.account ?? null : null;
  const view = (i: number) => (API_ON ? (async () => { try { const { url } = await svc.resourceLink(i); window.open(url, "_blank", "noopener"); } catch (e) { L.toast(uiMessage(e), false); } })() : L.toast("Opened (demo)"));
  const nda = async () => { if (!API_ON) { L.toast("NDA accepted (demo)"); return; } try { await svc.acceptNda(); L.toast("NDA accepted"); bumpData(); } catch (e) { L.toast(uiMessage(e), false); } };

  const ask = async () => {
    const text = clampText(q, 1000);
    if (!text) { setQErr("Enter a question first."); document.getElementById("tq")?.focus(); return; }
    // source: ME.email was never set on the personas, so the domain is "anonymous"
    const em = (getMe() as { email?: string }).email;
    const dom = (em && em.split("@")[1]) || "anonymous";
    wsLog("trust.question.asked", text.slice(0, 60), "Policy");
    try {
      const { ans, reply } = await svc.askQuestion(text, dom);
      setShown({ ans: !!ans, reply });
      setQ(""); bumpData();
    } catch (e) { L.toast(API_ON ? uiMessage(e) : FAIL, false); }
  };

  return (
    <Page mod="trust" title={`${company} Trust Center`} sub="Security, privacy and compliance, in one place" acts={manage ? <button className="btn btn-secondary" onClick={back}><Icon name="back" />Back to admin</button> : undefined}>
      <div className="scroll" style={{ overflow: "auto" }}><div style={{ maxWidth: 860, margin: "0 auto" }}>
        {manage ? <p className="field help" style={{ margin: "0 0 14px" }}>Preview: this is the page your customers see.</p> : null}
        <div className="split" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 14 }}>
          <div className="card" data-tour="trust-pub-access"><div className="c-head"><h3>Your access</h3></div><div className="c-body">
            <p className="field help" style={{ margin: "0 0 10px" }}>{!API_ON ? "You are viewing the public page. Accept the NDA to request private documents such as the SOC 2 report."
              : acct ? `Your company has access to ${acct.access.join(", ")}. NDA: ${acct.nda}.` : "You are viewing the public page. Request a private document; once a request is approved, accept the NDA to open it."}</p>
            {API_ON && pub?.myRequests.length ? <p className="field help" style={{ margin: "0 0 10px" }}>Your requests: {pub.myRequests.map((r) => `${r.resource} (${r.status})`).join(", ")}</p> : null}
            <div className="btngrp">
              {!API_ON || (acct && !acct.nda.startsWith("Accepted")) ? <button className="btn btn-primary sm" onClick={nda}><Icon name="check" />Accept NDA</button> : null}
              {API_ON && pub?.subscribed ? <span className="sub">Subscribed to updates</span> : <button className="btn btn-secondary sm" onClick={() => L.openModal("Subscribe to updates", <SubscribeForm L={L} />)}><Icon name="bell" />Subscribe to updates</button>}
            </div>
          </div></div>
          <div className="card" data-tour="trust-pub-controls"><div className="c-head"><h3>Live control status</h3></div><div className="c-body" style={{ padding: 0 }}>
            <Table cols={[{ t: "Category" }, { t: "Status" }]}>
              {!ctrls.length ? <tr><td colSpan={2} style={{ color: "var(--muted)" }}>No controls published yet.</td></tr> : null}
              {ctrls.map((c) => <tr key={c[0]}><td className="strong">{c[0]}</td><td><StatusChip s={c[1] === "Pass" ? "Pass" : "In review"} /></td></tr>)}
            </Table>
          </div></div>
        </div>
        <div className="card" data-tour="trust-pub-docs" style={{ marginBottom: 14 }}><div className="c-head"><h3>Documents</h3></div><div className="c-body" style={{ padding: 0 }}>
          <Table cols={[{ t: "Document" }, { t: "Access" }, { t: "" }]}>
            {DATA.trust.map((t, i) => (
              <tr key={i}>
                <td className="strong">{t.name}</td>
                <td>{t.access === "Public" ? <Chip cls="ok" icon="check">Public</Chip> : <Chip cls="neutral" icon="access">On request</Chip>}</td>
                <td className="r">{t.access === "Public"
                  ? <button className="btn btn-ghost sm" onClick={() => view(i)}><Icon name="ext" />View</button>
                  : API_ON && acct?.access.includes(t.name) ? <button className="btn btn-ghost sm" onClick={() => view(i)}><Icon name="ext" />Open</button>
                  : <button className="btn btn-ghost sm" onClick={() => L.openModal("Request access, " + t.name, <RequestAccessForm i={i} L={L} />)}><Icon name="access" />Request</button>}</td>
              </tr>
            ))}
          </Table>
        </div></div>
        <div className="split" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 14 }}>
          <div className="card"><div className="c-head"><h3>Sub-processors</h3></div><div className="c-body" style={{ padding: 0 }}>
            <Table cols={[{ t: "Provider" }, { t: "Purpose" }, { t: "Region" }]}>
              {!TRUST_SUBPROC.length ? <tr><td colSpan={3} style={{ color: "var(--muted)" }}>None listed.</td></tr> : null}
              {TRUST_SUBPROC.map((s) => <tr key={s.name}><td className="strong">{s.name}</td><td>{s.purpose}</td><td>{s.region}</td></tr>)}
            </Table>
          </div></div>
          <div className="card"><div className="c-head"><h3>Updates</h3></div><div className="c-body"><div className="feed">
            {TRUST_UPDATES.map((u, i) => <div className="feed-item" key={i}><span className="dot" style={{ marginTop: 5, background: "var(--accent)" }}></span><div className="fi"><div className="ft">{u.title}</div><div className="fm">{u.at}</div></div></div>)}
          </div></div></div>
        </div>
        <div className="card" style={{ marginBottom: 14 }}><div className="c-head"><h3>Frequently asked questions</h3></div><div className="c-body">
          {!TRUST_FAQ.length ? <p className="field help" style={{ margin: 0 }}>No answers published yet.</p> : null}
          {TRUST_FAQ.map((f, i) => <details key={i} style={{ marginBottom: 8 }}><summary style={{ cursor: "pointer", fontWeight: 500 }}>{f.q}</summary><p className="field help" style={{ margin: "6px 0 0" }}>{f.a}</p></details>)}
        </div></div>
        <div className="card" data-tour="trust-pub-ask"><div className="c-head"><h3>Ask a question</h3></div><div className="c-body">
          {TRUST.chatbot ? <p className="field help" style={{ margin: "0 0 8px" }}>Answered instantly from our published FAQ and verified answer library. Anything it can’t answer is sent to the security team.</p> : null}
          <div className="field"><label htmlFor="tq">Your question</label><textarea className="input" id="tq" rows={2} maxLength={1000} style={{ resize: "vertical" }} placeholder="Ask about our security posture…" value={q} onChange={(e) => { setQ(e.target.value); setQErr(""); }} aria-invalid={!!qErr} aria-describedby={qErr ? "tq-err" : undefined} />{qErr ? <FormMessage id="tq-err">{qErr}</FormMessage> : null}</div>
          <button className="btn btn-primary sm" onClick={ask}><Icon name="assistant" />{TRUST.chatbot ? "Ask the assistant" : "Ask"}</button>
          <div id="tq-ans" style={{ marginTop: 12 }} aria-live="polite">
            {shown ? (shown.ans ? (
              <AIPanel source="Trust Center assistant" meta="From published material" label="Assistant answer">
                <p style={{ margin: "6px 0 0", fontSize: 13.5 }}>{shown.reply}</p>
                <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--muted)" }}>For anything binding, request documents under NDA.</p>
              </AIPanel>
            ) : (
              <div className="card" style={{ boxShadow: "none", background: "var(--surface-2)" }}><div className="c-body" style={{ padding: "12px 14px" }}>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 5 }}>Forwarded to the security team</div>
                <div style={{ fontSize: 13.5 }}>{shown.reply}</div>
              </div></div>
            )) : null}
          </div>
        </div></div>
      </div></div>
    </Page>
  );
}
