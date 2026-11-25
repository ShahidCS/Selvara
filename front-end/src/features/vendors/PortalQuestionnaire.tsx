import { useState } from "react";
import { Chip, Icon, StatusChip, Empty, SelectList } from "@/components/ui";
import { LayerFoot } from "@/components/shell/LayerProvider";
import { apiMessage } from "@/components/kit/serverRequests";
import { useLayer } from "@/hooks/useLayer";
import questions from "@/data/vendorQuestions.json";
import type { WsVendorQ } from "@/services/ws";
import * as svc from "@/features/vendors/services/vendors";

/* Production (group 8b): the vendor assessment sent by email and answered in the standalone vendor portal, as the company sees it: answers,
   evidence opened through 60-second links, a new link, and a clarification on chosen questions (only those reopen). */
const QS = (questions as { questions: { id: string; domain: string; text: string; critical: boolean }[] }).questions;
const LABEL: Record<string, string> = { Y: "Yes", P: "Partially", N: "No", NA: "Not applicable" };

/** "Send questionnaire": by email to the vendor portal (when email is set up), or to a member with the Vendor role. */
export function SendQuestionnaire({ vendorId, mail, contacts, close }: { vendorId: string; mail: boolean; contacts: { id: string; name: string }[]; close: () => void }) {
  const L = useLayer(); const [how, setHow] = useState<"email" | "member">(mail ? "email" : "member");
  const [email, setEmail] = useState(""); const [due, setDue] = useState("14"); const [contact, setContact] = useState(contacts[0]?.id ?? "");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return; setBusy(true); setErr("");
    try {
      if (how === "email") { const r = await svc.sendQuestionnaireByEmail(vendorId, email.trim(), Number(due)); close(); L.toast(r.emailed ? `Questionnaire emailed to ${email.trim()}` : "Questionnaire created, but the email could not be sent. Use Send a new link."); }
      else { const r = await svc.sendQuestionnaire(vendorId, contact); if (r.ok === false) throw new Error(r.msg); close(); L.toast(`Security questionnaire sent to ${r.name}`); }
    } catch (x) { setErr(apiMessage(x, x instanceof Error && x.message ? x.message : "Could not send the questionnaire")); setBusy(false); }
  };
  return (
    <>
      <fieldset style={{ border: 0, padding: 0, margin: "0 0 10px" }}><legend className="sectitle" style={{ marginTop: 0 }}>Send to</legend>
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6 }}><input type="radio" name="sq-how" checked={how === "email"} disabled={!mail} onChange={() => setHow("email")} />
          <span>The vendor&apos;s contact by email<span className="field help" style={{ display: "block", margin: 0 }}>{mail ? "They answer the 12-question assessment, with evidence, in the vendor portal after confirming their address with a code." : "Not available: email is not set up for this platform yet."}</span></span></label>
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><input type="radio" name="sq-how" checked={how === "member"} onChange={() => setHow("member")} />
          <span>A member with the Vendor role<span className="field help" style={{ display: "block", margin: 0 }}>They answer in their own Selvara workspace.</span></span></label>
      </fieldset>
      {how === "email" ? (
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
          <div className="field"><label htmlFor="sq-email">Contact&apos;s work email</label><input className="input" id="sq-email" data-focus type="email" maxLength={254} autoComplete="off" value={email} onChange={(e) => { setEmail(e.target.value); setErr(""); }} /></div>
          <div className="field"><label htmlFor="sq-due">Due in</label><SelectList className="select" id="sq-due" value={due} onChange={(e) => setDue(e.target.value)}>{["7", "14", "21", "30", "45"].map((x) => <option key={x} value={x}>{x} days</option>)}</SelectList></div>
        </div>
      ) : contacts.length ? (
        <div className="field"><label htmlFor="sq-contact">Vendor contact</label><SelectList className="select" id="sq-contact" value={contact} onChange={(e) => setContact(e.target.value)}>{contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectList></div>
      ) : <Empty compact icon="team" title="No member has the Vendor role yet">Invite the vendor&apos;s contact in Team &amp; Rules with the Vendor role first.</Empty>}
      <p className="field help" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" disabled={busy || (how === "member" && !contacts.length)} onClick={go}>Send</button></LayerFoot>
    </>
  );
}

/** A portal questionnaire's answers, evidence and actions on the vendor's page. */
export function PortalAnswers({ q, can }: { q: WsVendorQ; can: boolean }) {
  const L = useLayer(); const p = q.portal!;
  const open = async (id: string) => { try { const r = await svc.portalFileLink(q.id, id); window.open(r.url, "_blank", "noopener"); } catch (x) { L.toast(apiMessage(x, "Could not open the file"), false); } };
  const relink = async () => { try { await svc.portalRelink(q.id); L.toast(`A new link was emailed to ${p.email}`); } catch (x) { L.toast(apiMessage(x, "Could not send a new link"), false); } };
  return (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 12.5, color: "var(--muted)" }}>
        <span>Vendor portal, due {p.due}{p.version ? `, version ${p.version}` : ""}.</span>
        {q.status !== "Submitted" ? (p.linkLive ? <Chip cls="info" icon="clock">Link active</Chip> : <Chip cls="bad" icon="alert">Link ended</Chip>) : null}
        {q.status !== "Submitted" && can ? <button className="btn btn-ghost sm" onClick={relink}><Icon name="ext" />Send a new link</button> : null}
        {q.status === "Submitted" && can ? <button className="btn btn-ghost sm" onClick={() => L.openModal(`Ask for clarification: ${q.vendor}`, (close) => <Clarify q={q} close={close} />)}><Icon name="refresh" />Ask for clarification</button> : null}
      </div>
      {q.status === "Sent" && !p.version ? <p className="field help" style={{ margin: 0 }}>{`Waiting for the answers: ${QS.length - p.readiness.unanswered} of ${QS.length} answered so far.`}</p> : (
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th scope="col">Question</th><th scope="col">Answer</th><th scope="col">Evidence</th></tr></thead><tbody>
          {QS.map((x) => { const it = p.items[x.id]; return (
            <tr key={x.id}>
              <td style={{ fontSize: 12.5 }}><span className="strong">{x.id}</span> {x.text}{x.critical ? " (required)" : ""}{p.clarify.includes(x.id) ? <> <Chip cls="warn" icon="clock">Reopened</Chip></> : null}</td>
              <td style={{ fontSize: 12.5 }}>{it?.answer ? <><StatusChip s={it.answer === "Y" ? "Pass" : it.answer === "N" ? "Fail" : it.answer === "P" ? "Partially met" : "Not applicable"} /> <span className="vh">{LABEL[it.answer]}</span>{it.comment ? <div style={{ marginTop: 4 }}>{it.comment}</div> : null}</> : "—"}</td>
              <td>{it?.file ? <button className="btn btn-ghost sm" aria-label={`Open evidence for ${x.id}: ${it.file.name}`} onClick={() => open(x.id)}><Icon name="download" />{it.file.name}</button> : x.critical && it?.answer === "Y" ? <Chip cls="warn" icon="alert">Missing</Chip> : "—"}</td>
            </tr>); })}
        </tbody></table></div>
      )}
    </div>
  );
}

function Clarify({ q, close }: { q: WsVendorQ; close: () => void }) {
  const L = useLayer(); const [ids, setIds] = useState<string[]>([]); const [note, setNote] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return; if (!ids.length) { setErr("Choose the questions that need a clarification."); return; }
    setBusy(true);
    try { const r = await svc.reopenVendorQuestionnaire(q.id, note, ids); close(); L.toast(r.emailed ? `Clarification asked; ${q.portal!.email} was emailed a new link` : "Clarification asked, but the email could not be sent. Use Send a new link."); }
    catch (x) { setErr(apiMessage(x, "Could not ask for clarification")); setBusy(false); }
  };
  return (
    <>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="sectitle" style={{ marginTop: 0 }}>Questions to reopen</legend>
        {QS.map((x) => <label key={x.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, marginBottom: 4 }}><input type="checkbox" checked={ids.includes(x.id)} onChange={(e) => { setIds(e.target.checked ? [...ids, x.id] : ids.filter((y) => y !== x.id)); setErr(""); }} /><span><b>{x.id}</b> {x.text}</span></label>)}
      </fieldset>
      <div className="field"><label htmlFor="cl-note">What needs clarifying (at least 10 characters)</label><textarea className="input" id="cl-note" rows={3} maxLength={500} value={note} onChange={(e) => { setNote(e.target.value); setErr(""); }} /></div>
      <p className="field help">The vendor can change only these answers; each needs a new comment, and a &quot;Yes&quot; new evidence. Their answers become a new version.</p>
      <p className="field help" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={go}>Reopen and email</button></LayerFoot>
    </>
  );
}
