import { Empty, Icon, Page, Ring, StatusChip } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { DATA } from "@/lib/data";
import { API_ON } from "@/lib/rbac";
import { wsLog } from "@/lib/audit";
import { bumpData, useApp, useData } from "@/lib/store";
import { getApproval } from "@/lib/approvals";
import * as svc from "@/features/questionnaires/services/questionnaires";
import { WhyNot, attempt } from "@/components/kit/sodKit";

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
    <Page title={q.name} sub={`Due ${q.due}`} back={back} acts={<>
      <StatusChip s={status} />
      {q.status !== "Complete" ? (<>
        <button className="btn btn-secondary" disabled={waiting} onClick={advance}><Icon name="check" />Answer next 10</button>
        <button className="btn btn-primary" disabled={waiting} onClick={complete}><Icon name="check" />{waiting ? "Awaiting review" : "Submit for review"}</button>
      </>) : API_ON ? <span className="sub">Sent by {q.sentBy}, reviewed by {q.reviewedBy}</span> : <button className="btn btn-secondary" onClick={() => L.toast("Exported responses (demo)")}><Icon name="download" />Export responses</button>}
    </>}>
      <div className="scroll rec-scroll">
        <div className="rec-grid">
          <div className="rec-main">
            <div className="card"><div className="c-head"><h3>Completion</h3></div><div className="c-body">
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <Ring pct={pct} size={76} color="var(--accent)" />
                <div><div style={{ fontSize: 13, color: "var(--muted)" }}>Answered</div><div style={{ fontSize: 22, fontWeight: 600 }}>{a} of {b}</div><div style={{ marginTop: 4 }}><StatusChip s={status} /></div></div>
              </div>
            </div></div>
            <div className="card"><div className="c-head"><h3>Sending</h3></div><div className="c-body">
              <p className="field help" style={{ marginTop: 0 }}>Sending a questionnaire to the customer is approved by an admin or owner who did not write or edit it.</p>
              {waiting ? <WhyNot text="Awaiting review by someone other than the author. It cannot be edited meanwhile." /> : null}
            </div></div>
          </div>
          <aside className="rec-side">
            <div className="card"><div className="c-head"><h3>Details</h3></div><div className="c-body">
              <dl className="meta-grid"><dt>Answered</dt><dd>{a} of {b}</dd><dt>Remaining</dt><dd>{b - a}</dd><dt>Due</dt><dd>{q.due}</dd></dl>
            </div></div>
          </aside>
        </div>
      </div>
    </Page>
  );
}
