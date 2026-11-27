/* Shared UI for four-eyes steps (contract: docs/security/SOD_MATRIX.md): service-error toasts and the pending-approvals card.
 * Disabled buttons always show the reason text (never a silent disable). The UI is not a control: services enforce the same rules. */
import { useState } from "react";
import { Chip, Icon } from "@/components/ui";
import { LayerFoot, useLayer } from "@/components/shell/LayerProvider";
import type { LayerApi } from "@/components/shell/LayerProvider";
import { approvals, whyCannotApprove, type Approval } from "@/lib/approvals";
import { getActor, isSamePerson, SodError } from "@/lib/sod";
import { useApp, useData } from "@/lib/store";
import { decide, type Decision } from "@/services/sodApprovals";
import { uiMessage } from "@/lib/grcSod";

/** Run a (possibly async) handler. A SodError (a rule the user can act on) shows its message; anything else a generic text (ASVS 7.4.1). */
export async function attempt(L: LayerApi, fn: () => Promise<void> | void) {
  try { await fn(); } catch (e) {
    const rule = e instanceof SodError || (e as { name?: string } | null)?.name === "SodError";
    L.toast(rule ? (e as Error).message : uiMessage(e), false); // a production refusal (4xx) is the server's own words
  }
}

/** Visible reason shown next to a disabled action. */
export const WhyNot = ({ text, id }: { text: string | null; id?: string }) => (text ? <p className="field help" id={id} style={{ margin: "6px 0 0" }}>{text}</p> : null);

const VERB: Record<Decision, string> = { approve: "Approve", reject: "Reject", withdraw: "Withdraw" };

function DecideForm({ a, decision }: { a: Approval; decision: Decision }) {
  const L = useLayer();
  const [reason, setReason] = useState(""); const [err, setErr] = useState("");
  const go = () => attempt(L, async () => {
    if (decision !== "withdraw" && reason.trim().length < 10) { setErr("Give a reason of at least 10 characters."); return; }
    try { await decide(a.id, decision, reason); } catch (e) { setErr(uiMessage(e)); return; }
    L.closeLayer(); L.toast(decision === "approve" ? "Decision recorded" : decision === "reject" ? "Request rejected" : "Request withdrawn");
  });
  return (
    <>
      <div>
        <p style={{ margin: "0 0 8px", fontSize: ".8125rem" }}>{VERB[decision]}: <strong>{a.title}</strong></p>
        <p className="field help" style={{ margin: "0 0 10px" }}>Requested by {a.requestedBy} · {a.id}. {decision === "approve" ? (a.needs > 1 ? `Needs ${a.needs} different approvers (${a.approvals.length} recorded).` : "Your decision is recorded in the audit log with your name and reason.") : decision === "reject" ? "The change will not be applied." : "Withdrawing is not a rejection."}</p>
        {decision !== "withdraw" ? (
          <div className="field"><label htmlFor="ap-reason">Reason <span style={{ color: "var(--bad-ink)" }}>*</span></label><textarea className="input" id="ap-reason" data-focus rows={3} maxLength={300} style={{ resize: "vertical" }} value={reason} onChange={(e) => { setReason(e.target.value); setErr(""); }} aria-invalid={!!err} aria-describedby={err ? "ap-err" : undefined} /></div>
        ) : null}
        <p className="field help" id="ap-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={() => L.closeLayer()}>Cancel</button><button className={`btn ${decision === "approve" ? "btn-primary" : "btn-danger"}`} onClick={go}>Confirm {VERB[decision].toLowerCase()}</button></LayerFoot>
    </>
  );
}

const statusChip = (s: Approval["status"]) => s === "Approved" ? <Chip cls="ok" icon="check">Approved</Chip> : s === "Pending" ? <Chip cls="warn" icon="clock">Pending</Chip> : s === "Rejected" ? <Chip cls="bad" icon="x">Rejected</Chip> : <Chip cls="neutral" icon="dot">{s}</Chip>;

/** Card listing pending (and the latest decided) approval requests whose `kind` starts with one of `prefix`. */
export function ApprovalsPanel({ prefix, title = "Pending approvals" }: { prefix: string | string[]; title?: string }) {
  useData(); useApp((s) => s.role);
  const L = useLayer();
  const pre = Array.isArray(prefix) ? prefix : [prefix];
  const all = approvals.get().list.filter((a) => pre.some((p) => a.kind.startsWith(p)));
  const pending = all.filter((a) => a.status === "Pending");
  const recent = all.filter((a) => a.status !== "Pending").slice(0, 3);
  const rows = [...pending, ...recent];
  if (!rows.length) return null;
  const me = getActor().name;
  const open = (a: Approval, d: Decision) => L.openModal(`${VERB[d]} request`, () => <DecideForm a={a} decision={d} />);
  return (
    <div className="card" style={{ marginBottom: 12, borderColor: "color-mix(in srgb,var(--accent) 30%,var(--line))" }}>
      <div className="c-head"><h3>{title}</h3>{pending.length ? <span className="tag" style={{ marginLeft: 6 }}>{pending.length}</span> : null}</div>
      <div className="c-body" style={{ padding: "4px 14px 10px" }}>
        {rows.map((a) => {
          const why = whyCannotApprove(a); const mine = isSamePerson(me, a.requestedBy); const isPending = a.status === "Pending";
          return (
            <div key={a.id} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", padding: "9px 0", borderTop: "1px solid var(--line)" }}>
              <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: ".8125rem", overflowWrap: "anywhere" }}>{a.title}</div>
                <div style={{ fontSize: ".71875rem", color: "var(--muted)" }}>{a.id} · requested by {a.requestedBy} · {a.approvals.length}/{a.needs} approval{a.needs > 1 ? "s" : ""}{a.approvals.length ? " (" + a.approvals.map((x) => x.by).join(", ") + ")" : ""}{a.decidedReason ? " · " + a.decidedReason : ""}</div>
                {isPending && why ? <div className="field help" style={{ margin: "3px 0 0" }}>{why}</div> : null}
              </div>
              {statusChip(a.status)}
              {isPending ? (
                <div className="btngrp" style={{ flexWrap: "nowrap", whiteSpace: "nowrap" }}>
                  {mine ? <button className="btn btn-ghost sm" onClick={() => open(a, "withdraw")}>Withdraw</button> : null}
                  <button className="btn btn-decide sm" disabled={!!why} title={why || undefined} aria-label={`Approve: ${a.title}`} onClick={() => open(a, "approve")}><Icon name="check" />Approve</button>
                  <button className="btn btn-ghost sm" disabled={!!why} title={why || undefined} aria-label={`Reject: ${a.title}`} onClick={() => open(a, "reject")}>Reject</button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
