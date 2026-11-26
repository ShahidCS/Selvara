import { useEffect, useState } from "react";
import { Chip, Icon, Table } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { sodMessage } from "@/lib/approvalFlow";
import { JOIN } from "@/lib/session";
import { decideJoin, listPendingJoins, type JoinRow } from "@/services/joinRequests";
import { useData } from "@/lib/store";

/** People who asked to join from the sign-in page. A company admin approves (as Employee) or rejects, with a reason; both are audited. */
export function JoinRequests({ manage }: { manage: boolean }) {
  const v = useData(); const L = useLayer();
  const [list, setList] = useState<JoinRow[]>([]);
  useEffect(() => { let on = true; listPendingJoins().then((x) => { if (on) setList(x); }, () => { if (on) setList([]); }); return () => { on = false; }; }, [v]);
  if (!list.length) return null;
  return (
    <section className="card" style={{ boxShadow: "none" }} aria-labelledby="jr-h">
      <div className="c-head"><h3 id="jr-h">Requests to join</h3><div className="r"><span className="tag">join as Employee</span></div></div>
      <div className="c-body flush" style={{ padding: 0 }}>
        <Table cols={[{ t: "Name" }, { t: "Work email" }, { t: "Requested" }, { t: "Status" }, { t: "" }]}>
          {list.map((m) => (
            <tr key={m.id}>
              <td className="strong">{m.name}</td><td>{m.email}</td>
              <td className="num" style={{ fontSize: 12 }}>{new Date(m.requestedAt).toISOString().slice(0, 16).replace("T", " ")} UTC</td>
              <td><Chip cls="warn" icon="clock">Pending</Chip>{m.match ? <div style={{ marginTop: 4 }}><Chip cls="bad" icon="alert">{matchLabel(m.match)}</Chip>{m.match.reason ? <div className="field help" style={{ margin: "2px 0 0" }}>Earlier reason: {m.match.reason}</div> : null}</div> : null}</td>
              <td className="r">{manage ? (
                <div className="btngrp" style={{ justifyContent: "flex-end" }}>
                  <button className="btn btn-ghost sm" aria-label={`Approve: ${m.name}`} onClick={() => L.openModal(`Approve request to join, ${m.name}`, (close) => <Decide id={m.id} name={m.name} decision="approve" match={m.match} close={close} />)}><Icon name="check" />Approve</button>
                  <button className="btn btn-ghost sm" aria-label={`Reject: ${m.name}`} onClick={() => L.openModal(`Reject request to join, ${m.name}`, (close) => <Decide id={m.id} name={m.name} decision="reject" close={close} />)}><Icon name="x" />Reject</button>
                </div>
              ) : null}</td>
            </tr>
          ))}
        </Table>
      </div>
    </section>
  );
}

/** EDGE-20: why a request is flagged (the same mailbox as an earlier rejection or removal in this company). Never decided automatically. */
const matchLabel = (x: NonNullable<JoinRow["match"]>) => `Matches a ${x.kind === "rejected" ? "request rejected" : "member removed"} on ${new Date(x.at).toISOString().slice(0, 10)}`;

function Decide({ id, name, decision, match, close }: { id: string; name: string; decision: "approve" | "reject"; match?: JoinRow["match"]; close: () => void }) {
  const L = useLayer();
  const [reason, setReason] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return;
    if (reason.trim().length < JOIN.REASON_MIN) { setErr(`Give a reason of at least ${JOIN.REASON_MIN} characters.`); return; }
    setBusy(true);
    try { await decideJoin(id, decision, reason); close(); L.toast(decision === "approve" ? `${name} can now sign in as an Employee` : "Request rejected"); }
    catch (e) { setErr(sodMessage(e, "Could not record the decision")); setBusy(false); }
  };
  return (
    <>
      <div className="field"><label htmlFor="jr-reason">Reason (at least {JOIN.REASON_MIN} characters)</label><textarea className="input" id="jr-reason" data-focus rows={3} maxLength={300} style={{ resize: "vertical" }} value={reason} onChange={(e) => { setReason(e.target.value); setErr(""); }} aria-invalid={!!err} aria-describedby={err ? "jr-err" : undefined} /></div>
      <p className="field help" id="jr-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      {match && decision === "approve" ? <div className="banner warn" role="note" style={{ margin: "0 0 10px", fontSize: 13 }}><b>{matchLabel(match)}.</b> The address looks like the same mailbox (for example a +tag or dots in a Gmail address). It may be a different person on a shared or recycled address: check before approving, and say why in the reason.</div> : null}
      <p className="field help">{decision === "approve" ? "They join as an Employee. Any other role is a separate role change with its own approval." : "They cannot sign in. Recorded in the audit log with your name."}</p>
      <div className="btngrp" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        <button className="btn btn-secondary" onClick={close}>Cancel</button>
        <button className={`btn ${decision === "approve" ? "btn-primary" : "btn-danger"}`} disabled={busy} onClick={go}>{decision === "approve" ? "Approve" : "Reject"}</button>
      </div>
    </>
  );
}
