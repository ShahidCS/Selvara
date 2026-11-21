import { Chip, Empty, Icon, Page, Ring, StatusChip } from "@/components/ui";
import { parseDay } from "@/lib/grcSod";
import { useLayer } from "@/hooks/useLayer";
import { DATA } from "@/lib/data";
import { API_ON } from "@/lib/rbac";
import { wsLog } from "@/lib/audit";
import { bumpData, useApp, useData } from "@/lib/store";
import { getApproval } from "@/lib/approvals";
import * as svc from "@/features/questionnaires/services/questionnaires";
import { WhyNot, attempt } from "@/components/kit/sodKit";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** A due date that has passed while the questionnaire is still open. */
export const qOverdue = (q: any): boolean => { if (q.status === "Complete") return false; const d = parseDay(q.due); if (!d) return false; const t = new Date(); t.setHours(0, 0, 0, 0); return d.getTime() < t.getTime(); };
/** Due column and field: the date, flagged with an icon and a word when it has passed; a dash once the questionnaire is sent. */
export function DueCell({ q }: { q: any }) {
  if (q.status === "Complete") return <span style={{ color: "var(--muted)" }}>—</span>;
  return qOverdue(q) ? <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>{q.due}<Chip cls="bad" icon="alert">Overdue</Chip></span> : <>{q.due}</>;
}

/** A questionnaire as a page (`/ws/questionnaires/:id`): completion, what is left and the actions. Same service calls as the old drawer; sending it to the customer is
 *  approved by an admin or owner who did not write or edit it. */
export function QuestionnaireDetail({ id }: { id: string }) {
  useData(); useApp((s) => s.role);
  const L = useLayer();
  const back = { href: "/ws/questionnaires", label: "Questionnaires" };
  const i = DATA.questionnaires.findIndex((x) => svc.qidOf(x) === id);
  const q = DATA.questionnaires[i];
  if (!q) return <Page title="Questionnaire not found" back={back}><Empty icon="questionnaires" title="No such questionnaire">There is no questionnaire with the ID &ldquo;{id}&rdquo;. It may have been removed, or the link may be wrong.</Empty></Page>;
  const [a, b] = svc.splitProg(q.prog);
  const pct = svc.qPct(q.prog);
  const waiting = getApproval(q.pendingSend)?.status === "Pending";
  const status = q.status === "Complete" ? "Completed" : q.status;
  const advance = () => attempt(L, async () => {
    await svc.advanceQuestionnaire(i);
    wsLog("questionnaire.updated", q.name + " " + q.prog, "Vendor"); L.toast("Progress updated"); bumpData();
  });
  const complete = () => attempt(L, async () => {
    await svc.requestSend(i);
    wsLog("questionnaire.send_requested", q.name + " (" + q.prog + ")", "Vendor"); L.toast("Submitted for review; a different admin or owner must approve sending it"); bumpData();
  });
  return (
    <Page title={q.name} sub={q.status === "Complete" ? "Sent to the customer" : `Due ${q.due}${qOverdue(q) ? " (overdue)" : ""}`} back={back} acts={<>
      <StatusChip s={status} />
      {q.status !== "Complete" ? (<>
        <button className="btn btn-secondary" disabled={waiting} onClick={advance}><Icon name="edit" />Answer next 10</button>
        <button className="btn btn-primary" disabled={waiting} onClick={complete}><Icon name="check" />{waiting ? "Awaiting review" : "Submit for review"}</button>
      </>) : API_ON ? <span className="sub">Sent by {q.sentBy}, reviewed by {q.reviewedBy}</span> : <button className="btn btn-secondary" onClick={() => L.toast("Exported responses (demo)")}><Icon name="download" />Export responses</button>}
    </>}>
      <div className="scroll rec-scroll">
        <div className="rec-grid" style={{ gridTemplateColumns: "minmax(0,1fr)", maxWidth: 860 }}>
          <div className="rec-main">
            <div className="card"><div className="c-head"><h3>Completion</h3></div><div className="c-body">
              <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                <Ring pct={pct} size={76} color="var(--accent)" />
                <dl className="meta-grid lstart" style={{ flex: "1 1 220px" }}><dt>Answered</dt><dd>{a} of {b}</dd><dt>Remaining</dt><dd>{b - a}</dd><dt>Due</dt><dd><DueCell q={q} /></dd></dl>
              </div>
              {q.status !== "Complete" ? <p className="field help" style={{ margin: "12px 0 0" }}>Sending it to the customer is approved by an admin or owner who did not write or edit it.</p> : null}
              {waiting ? <WhyNot text="Awaiting review by someone other than the author. It cannot be edited meanwhile." /> : null}
            </div></div>
          </div>
        </div>
      </div>
    </Page>
  );
}
