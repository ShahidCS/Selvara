import { Chip, Icon, Page, StatusChip, Table, activate } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { DATA } from "@/lib/data";
import { wsLog } from "@/lib/audit";
import { bumpData, useApp, useData, useModState } from "@/lib/store";
import { ANSWER_LIB, KB_DOCS } from "@/lib/trustData";
import * as svc from "@/features/questionnaires/services/questionnaires";
import { ApprovalsPanel, WhyNot, attempt } from "@/components/kit/sodKit";
import { AddAnswerForm, ImportForm, openQuestionnaireDrawer } from "./QuestionnaireLayers";
import VendorPortal from "./VendorPortal";

const VIEWS: [string, string][] = [["flight", "In flight"], ["library", "Answer library"], ["kb", "Knowledge base"]];

/** Questionnaires (source REND.questionnaires, lines 3443-3478). The "vendor" role gets the vendor portal instead. */
export default function QuestionnairesModule() {
  useData();
  const L = useLayer();
  const role = useApp((s) => s.role);
  const [view, setView] = useModState("questionnaires.view", "flight");
  if (role === "vendor") return <VendorPortal L={L} />;

  const verify = (i: number) => attempt(L, async () => {
    const a = ANSWER_LIB[i]; await svc.verifyAnswer(i);
    wsLog("answer.verified", ANSWER_LIB[i].q.slice(0, 40) + " (author " + (a.author || "unknown") + "; published to the public chatbot)", "Vendor");
    L.toast("Answer verified"); bumpData();
  });
  const acts = view === "flight"
    ? <button className="btn btn-primary" onClick={() => L.openModal("Import questionnaire", <ImportForm L={L} />)}><Icon name="plus" />Import questionnaire</button>
    : view === "library"
      ? <button className="btn btn-primary" onClick={() => L.openModal("Add answer", <AddAnswerForm L={L} />)}><Icon name="plus" />Add answer</button>
      : <button className="btn btn-secondary" onClick={() => L.toast("Upload document (demo)")}><Icon name="plus" />Upload document</button>;

  let body;
  if (view === "flight") {
    body = (
      <>
      <div style={{ padding: "12px 12px 0" }}><ApprovalsPanel prefix="q." title="Questionnaires awaiting review before sending" /></div>
      <Table cols={[{ t: "Questionnaire" }, { t: "Progress" }, { t: "Due" }, { t: "Status" }, { t: "" }]}>
        {DATA.questionnaires.map((q, i) => (
          <tr key={i} className="clickable" {...activate(() => openQuestionnaireDrawer(L, i))}>
            <td className="strong">{q.name}</td>
            <td style={{ minWidth: 150 }}><div className="bar-track" style={{ width: 90, display: "inline-block", verticalAlign: "middle" }}><span className="bar-fill" style={{ width: `${svc.qPct(q.prog)}%`, background: "var(--accent)" }}></span></div> <span className="num" style={{ fontSize: 12 }}>{q.prog}</span></td>
            <td>{q.due}</td><td><StatusChip s={q.status === "Complete" ? "Completed" : q.status} /></td><td className="r"><Icon name="chevron" /></td>
          </tr>
        ))}
      </Table>
      </>
    );
  } else if (view === "library") {
    body = (
      <Table cols={[{ t: "Question" }, { t: "Answer" }, { t: "Verified" }, { t: "Uses", r: true }, { t: "" }]}>
        {ANSWER_LIB.map((a, i) => (
          <tr key={i}>
            <td className="strong" style={{ maxWidth: 220 }}>{a.q}</td><td style={{ maxWidth: 320, color: "var(--muted)" }}>{a.a}</td>
            <td>{a.verified ? <Chip cls="ok" icon="check">Verified</Chip> : <Chip cls="warn" icon="clock">Unverified</Chip>}</td>
            <td className="r num">{a.uses}</td>
            <td className="r">{a.verified ? <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{a.verifiedBy ? "by " + a.verifiedBy : ""}</span> : (() => { const why = svc.verifyBlockReason(a); return (<><button className="btn btn-ghost sm" disabled={!!why} aria-describedby={why ? "vf-" + i : undefined} onClick={() => verify(i)}><Icon name="check" />Verify</button><WhyNot id={"vf-" + i} text={why} /></>); })()}</td>
          </tr>
        ))}
      </Table>
    );
  } else {
    body = (
      <div style={{ padding: 12 }}>
        <Table cols={[{ t: "Document" }, { t: "Type" }, { t: "" }]}>
          {KB_DOCS.map((d, i) => (
            <tr key={i}><td className="strong"><Icon name="evidence" /> {d.name}</td><td>{d.type}</td><td className="r"><button className="btn btn-ghost sm" onClick={() => L.toast("Opened (demo)")}><Icon name="ext" />Open</button></td></tr>
          ))}
        </Table>
      </div>
    );
  }
  return (
    <Page mod="questionnaires" acts={acts}>
      <div className="card" style={{ flex: "1 1 auto" }}>
        <div className="c-head"><div className="seg" role="tablist">{VIEWS.map((v) => <button key={v[0]} role="tab" aria-selected={view === v[0]} onClick={() => setView(v[0])}>{v[1]}</button>)}</div></div>
        <div className="c-body flush scroll" style={{ padding: 0 }} id="qBody">{body}</div>
      </div>
    </Page>
  );
}
