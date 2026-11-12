import { DATA, FW_ID, testsForControl } from "@/lib/data";
import { bumpData, setModState, useApp, useData } from "@/lib/store";
import { roleReason } from "@/lib/grcSod";
import { useGo } from "@/lib/route";
import { Empty, Icon, Page, StatusChip } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import * as svc from "@/features/controls/services/controls";
import { ctrlJira, ctrlWorkpaper, openAttestModal, openMappingModal, testChip } from "./controlDialogs";
import { openReasonModal, openStatusModal } from "./exceptionModals";

/** A control as a page (`/ws/controls/:id`): attestation, status, exceptions, mappings and linked tests. Same service calls as the old drawer; the short dialogs
 *  (attestation, mapping, status change, exception decision) stay dialogs, and requesting an exception is a form page. */
export function ControlDetail({ id }: { id: string }) {
  useData(); useApp((s) => s.role);
  const L = useLayer(); const go = useGo();
  const back = { href: "/ws/controls", label: "Controls" };
  const c = DATA.controls.find((x) => x.id === id);
  if (!c) return <Page title="Control not found" back={back}><Empty icon="controls" title="No such control">There is no control with the ID &ldquo;{id}&rdquo;. It may have been removed, or the link may be wrong.</Empty></Page>;
  svc.sweepExceptions();
  const attestWhy = svc.whyCannotAttest(c), statusWhy = svc.whyCannotSetStatus(c), mapWhy = svc.whyCannotManage(), excWhy = svc.whyCannotRequestException();
  const ticketWhy = roleReason("creating tickets", "admin", "owner", "analyst");
  const refresh = () => bumpData();
  const dis = (why: string | null) => ({ disabled: !!why, title: why || undefined });
  const tests = testsForControl(c.id);
  const att = c.attestation;
  const keys = Object.keys(c.map || {});
  const excs = svc.exceptionsOf(c);

  return (
    <Page title={c.title} sub={`${c.id}, ${c.domain}, owner ${c.owner}`} back={back} acts={<>
      <StatusChip s={c.status} />{c.custom ? <span className="tag">Custom</span> : null}
      <button className="btn btn-secondary" {...dis(ticketWhy)} onClick={() => ctrlJira(L, id)}><Icon name="ext" />Create Tasklane ticket</button>
      <button className="btn btn-secondary" onClick={() => ctrlWorkpaper(L, id)}><Icon name="download" />Export workpaper</button>
      <button className="btn btn-primary" onClick={() => L.toast("Evidence request sent")}>Request evidence</button>
    </>}>
      <div className="scroll rec-scroll">
        <div className="rec-grid">
          <div className="rec-main">
            <div className="card"><div className="c-head"><h3>Status</h3><StatusChip s={c.status} /></div><div className="c-body">
              <p className="field help" style={{ marginTop: 0 }}>{c.status === "Pass" ? "All mapped tests pass and current evidence is attached." : c.status === "Needs evidence" ? "The control is implemented but current evidence has not been attached for this period." : "A mapped test is failing. Remediation is tracked as an open issue in the register."}</p>
              {tests.length ? <p className="field help">Status follows {tests.length} automated test{tests.length > 1 ? "s" : ""} and cannot be overridden manually. To accept a known gap, request an exception with a compensating control (approved by a different person).</p>
                : <div className="btngrp"><button className="btn btn-ghost sm" {...dis(statusWhy)} onClick={() => openStatusModal(L, id, refresh)}><Icon name="edit" />Change status (owner)</button></div>}
              {!tests.length && statusWhy ? <p className="field help" style={{ margin: "6px 0 0" }}>{statusWhy}</p> : null}
            </div></div>

            <div className="card"><div className="c-head"><h3>Exceptions &amp; waivers</h3></div><div className="c-body">
              {excs.length ? excs.map((x) => {
                const st = svc.exceptionState(x); const dw = svc.whyCannotDecideException(c, x);
                return (
                  <div key={x.id} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", marginBottom: 6 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><span className="tag num">{x.id}</span><StatusChip s={st === "Active" ? "Approved" : st === "Expired" ? "Overdue" : st} /><span style={{ fontSize: 12, color: "var(--muted)" }}>until {x.expires}, requested by {x.requestedBy}</span></div>
                    <div style={{ fontSize: 12.5, marginTop: 4 }}>{x.reason}</div>
                    <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Compensating control: {x.compensating}</div>
                    {st === "Pending" ? (
                      <div className="btngrp" style={{ marginTop: 6 }}>
                        <button className="btn btn-primary sm" {...dis(dw)} onClick={() => openReasonModal(L, "Approve exception " + x.id, "Approval reason", "Approve", async (r) => { await svc.decideException(id, x.id, "approve", r); return "Exception approved"; }, refresh)}><Icon name="check" />Approve</button>
                        <button className="btn btn-secondary sm" {...dis(dw)} onClick={() => openReasonModal(L, "Reject exception " + x.id, "Reason", "Reject", async (r) => { await svc.decideException(id, x.id, "reject", r); return "Exception rejected"; }, refresh)}><Icon name="x" />Reject</button>
                      </div>) : null}
                    {st === "Pending" && dw ? <p className="field help" style={{ margin: "6px 0 0" }}>{dw}</p> : null}
                  </div>
                );
              }) : <p className="field help" style={{ marginTop: 0 }}>No exceptions or waivers.</p>}
              <button className="btn btn-ghost sm" {...dis(excWhy)} onClick={() => go(`/ws/controls/${encodeURIComponent(id)}/exception`)}><Icon name="plus" />Request exception</button>
            </div></div>

            <div className="card"><div className="c-head"><h3>Linked tests</h3><span className="sub">{tests.length}</span></div><div className="c-body">
              {tests.length ? tests.map((t) => (
                <div key={t.id} className="listrow" role="button" tabIndex={0} style={{ border: "1px solid var(--line)", borderRadius: 8, marginBottom: 6, cursor: "pointer" }}
                  onClick={() => { setModState("controls.view", "tests"); go(`/ws/controls/test/${encodeURIComponent(t.id)}`); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setModState("controls.view", "tests"); go(`/ws/controls/test/${encodeURIComponent(t.id)}`); } }}>
                  <div className="fi"><div className="lt">{t.name}</div><div className="lm">{t.id}, {t.cadence}</div></div>{testChip(t.result)}
                </div>
              )) : <p className="field help" style={{ margin: 0 }}>No automated tests linked to this control.</p>}
            </div></div>
          </div>

          <aside className="rec-side">
            <div className="card"><div className="c-head"><h3>Details</h3></div><div className="c-body">
              <dl className="meta-grid"><dt>Domain</dt><dd>{c.domain}</dd><dt>Owner</dt><dd>{c.owner}</dd><dt>Frameworks mapped</dt><dd>{keys.length}</dd><dt>Tests</dt><dd>{tests.length}</dd></dl>
            </div></div>

            <div className="card"><div className="c-head"><h3>Owner attestation</h3></div><div className="c-body">
              {att ? (
                <div className="card" style={{ boxShadow: "none", background: "var(--accent-weak)", borderColor: "transparent" }}><div className="c-body" style={{ padding: 11 }}>
                  <div style={{ fontWeight: 500 }}><Icon name="check" /> Attested by {att.by}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>{att.at}: &quot;{att.note}&quot;</div>
                </div></div>
              ) : <p className="field help" style={{ marginTop: 0 }}>No current attestation. The control owner should confirm the control is designed and operating.</p>}
              <div style={{ marginTop: 8 }}><button className="btn btn-secondary sm" {...dis(attestWhy)} onClick={() => openAttestModal(L, id)}><Icon name="check" />Record attestation</button></div>
              {attestWhy ? <p className="field help" style={{ margin: "6px 0 0" }}>{attestWhy}</p> : null}
            </div></div>

            <div className="card"><div className="c-head"><h3>Framework mappings</h3></div><div className="c-body">
              {keys.length ? keys.map((k) => (
                <div key={k} style={{ marginBottom: 8 }}><div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 3 }}>{FW_ID[k] || k}</div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{c.map[k].map((r: string, i: number) => <span key={i} className="tag num">{r}</span>)}</div></div>
              )) : <p className="field help" style={{ marginTop: 0 }}>No mappings.</p>}
              <button className="btn btn-ghost sm" {...dis(mapWhy)} onClick={() => openMappingModal(L, id)}><Icon name="plus" />Add mapping</button>
            </div></div>
          </aside>
        </div>
      </div>
    </Page>
  );
}
