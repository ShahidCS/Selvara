import { Chip, DataTable, Icon, Page, StatusChip, Table, type DTColumn } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { DATA } from "@/lib/data";
import { wsLog } from "@/lib/audit";
import { bumpData, useApp, useData, useModState } from "@/lib/store";
import { ANSWER_LIB, KB_DOCS } from "@/lib/trustData";
import * as svc from "@/features/questionnaires/services/questionnaires";
import { ApprovalsPanel, WhyNot, attempt } from "@/components/kit/sodKit";
import { useGo, useRoute } from "@/lib/route";
import { AddAnswerPage, ImportFormPage } from "./QuestionnaireForms";
import { QuestionnaireDetail } from "./QuestionnaireDetail";
import VendorPortal from "./VendorPortal";
import { API_ON } from "@/lib/rbac";
import { ModuleTip } from "@/components/kit/ModuleTip";

const VIEWS: [string, string][] = [["flight", "In flight"], ["library", "Answer library"], ["kb", "Knowledge base"]];

/** Questionnaires (source REND.questionnaires, lines 3443-3478). The "vendor" role gets the vendor portal instead. */
export default function QuestionnairesModule() {
  const { param } = useRoute();
  const role = useApp((s) => s.role);
  const L = useLayer();
  if (role === "vendor") return <VendorPortal L={L} />;
  if (param === "import") return <ImportFormPage />;
  if (param === "answer") return <AddAnswerPage />;
  if (param) return <QuestionnaireDetail id={param} />;
  return <QuestionnairesList />;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Quest = any;
type Answer = (typeof ANSWER_LIB)[number];

function QuestionnairesList() {
  useData();
  const L = useLayer(); const go = useGo();
  const [view, setView] = useModState("questionnaires.view", "flight");
  DATA.questionnaires.forEach((q: Quest) => svc.qidOf(q));

  const flightCols: DTColumn<Quest>[] = [
    { key: "name", header: "Questionnaire", value: (q) => q.name, locked: true, render: (q) => <span className="strong">{q.name}</span> },
    { key: "prog", header: "Progress", value: (q) => svc.qPct(q.prog), render: (q) => <span style={{ whiteSpace: "nowrap" }}><span className="bar-track" style={{ width: 90, display: "inline-block", verticalAlign: "middle" }}><span className="bar-fill" style={{ width: `${svc.qPct(q.prog)}%`, background: "var(--accent)" }} /></span> <span className="num" style={{ fontSize: 12 }}>{q.prog}</span></span> },
    { key: "due", header: "Due", value: (q) => q.due, render: (q) => q.due },
    { key: "status", header: "Status", value: (q) => q.status, render: (q) => <StatusChip s={q.status === "Complete" ? "Completed" : q.status} /> },
  ];
  const libCols: DTColumn<Answer>[] = [
    { key: "q", header: "Question", value: (a) => a.q, locked: true, render: (a) => <span className="strong" style={{ display: "block", maxWidth: 260 }}>{a.q}</span> },
    { key: "a", header: "Answer", value: (a) => a.a, render: (a) => <span style={{ display: "block", maxWidth: 340, color: "var(--muted)" }}>{a.a}</span> },
    { key: "verified", header: "Verified", value: (a) => (a.verified ? "Verified" : "Unverified"), render: (a) => (a.verified ? <Chip cls="ok" icon="check">Verified</Chip> : <Chip cls="warn" icon="clock">Unverified</Chip>) },
    { key: "uses", header: "Uses", value: (a) => a.uses, align: "end", render: (a) => <span className="num">{a.uses}</span> },
    { key: "act", header: "Actions", hideHeader: true, align: "end", locked: true, render: (a) => {
      const i = ANSWER_LIB.indexOf(a);
      if (a.verified) return <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{a.verifiedBy ? "by " + a.verifiedBy : ""}</span>;
      const why = svc.verifyBlockReason(a);
      return (<><button className="btn btn-ghost sm" disabled={!!why} aria-describedby={why ? "vf-" + i : undefined} aria-label={`Verify answer: ${a.q}`} onClick={() => verify(i)}><Icon name="check" />Verify</button><WhyNot id={"vf-" + i} text={why} /></>);
    } },
  ];
  const verify = (i: number) => attempt(L, async () => {
    const a = ANSWER_LIB[i]; await svc.verifyAnswer(i);
    wsLog("answer.verified", ANSWER_LIB[i].q.slice(0, 40) + " (author " + (a.author || "unknown") + "; published to the public chatbot)", "Vendor");
    L.toast("Answer verified"); bumpData();
  });
  const acts = view === "flight"
    ? <button className="btn btn-primary" onClick={() => go("/ws/questionnaires/import")}><Icon name="plus" />Import questionnaire</button>
    : view === "library"
      ? <button className="btn btn-primary" onClick={() => go("/ws/questionnaires/answer")}><Icon name="plus" />Add answer</button>
      : API_ON ? <label className="btn btn-secondary" style={{ cursor: "pointer" }}><Icon name="plus" />Upload document
          <input type="file" style={{ display: "none" }} aria-label="Upload document" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) attempt(L, async () => { const r = await svc.uploadKbDoc(f); L.toast(`${r.name} added to the knowledge base`); bumpData(); }); }} /></label>
      : <button className="btn btn-secondary" onClick={() => L.toast("Upload document (demo)")}><Icon name="plus" />Upload document</button>;

  let body;
  if (view === "flight") {
    body = (
      <>
      <div style={{ padding: "12px 12px 0" }}><ApprovalsPanel prefix="q." title="Questionnaires awaiting review before sending" /></div>
      <DataTable<Quest> id="questionnaires" label="Questionnaires" rows={DATA.questionnaires} rowKey={(q) => svc.qidOf(q)} columns={flightCols} searchText={(q) => String(q.name)}
        tabs={["Not started", "In progress", "Complete"].map((st) => ({ key: st, label: st === "Complete" ? "Completed" : st, match: (q: Quest) => q.status === st }))}
        onOpen={(q) => go(`/ws/questionnaires/${encodeURIComponent(svc.qidOf(q))}`)} exportName="questionnaires" />
      </>
    );
  } else if (view === "library") {
    body = (
      <DataTable<Answer> id="answer-library" label="Answer library" rows={ANSWER_LIB} rowKey={(a) => a.id ?? String(ANSWER_LIB.indexOf(a))} columns={libCols} searchText={(a) => `${a.q} ${a.a}`}
        tabs={[{ key: "Verified", label: "Verified", match: (a: Answer) => !!a.verified }, { key: "Unverified", label: "Unverified", match: (a: Answer) => !a.verified }]} exportName="answer-library" />
    );
  } else {
    body = (
      <div style={{ padding: 12 }}>
        <Table cols={[{ t: "Document" }, { t: "Type" }, { t: "" }]}>
          {!KB_DOCS.length ? <tr><td colSpan={3} style={{ color: "var(--muted)" }}>No documents yet. Upload policies and reports you use to answer questionnaires.</td></tr> : null}
          {KB_DOCS.map((d, i) => (
            <tr key={i}><td className="strong"><Icon name="evidence" /> {d.name}</td><td>{d.type}</td><td className="r"><button className="btn btn-ghost sm" onClick={() => API_ON && d.id ? attempt(L, async () => { const { url } = await svc.kbDocLink(d.id!); window.open(url, "_blank", "noopener"); }) : L.toast("Opened (demo)")}><Icon name="ext" />Open</button></td></tr>
          ))}
        </Table>
      </div>
    );
  }
  return (
    <Page mod="questionnaires" acts={acts}>
      <ModuleTip mod="questionnaires" force={API_ON && !DATA.questionnaires.length && !ANSWER_LIB.length} />
      <div className="card" style={{ flex: "1 1 auto" }}>
        <div className="c-head"><div className="seg" role="tablist">{VIEWS.map((v) => <button key={v[0]} role="tab" aria-selected={view === v[0]} onClick={() => setView(v[0])}>{v[1]}</button>)}</div></div>
        <div className="c-body flush scroll" style={{ padding: 0 }} id="qBody">{body}</div>
      </div>
    </Page>
  );
}
