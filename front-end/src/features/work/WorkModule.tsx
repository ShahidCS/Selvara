import { Icon, Kpi, Page, Table, StatusChip, activate } from "@/components/ui";
import { DATA } from "@/lib/data";
import { useData } from "@/lib/store";
import { useGo } from "@/lib/route";
import { useLayer } from "@/hooks/useLayer";
import { AccessRequestForm, VendorRequestForm } from "./RequestModals";
import { useSyncExternalStore } from "react";
import { API_ON, modAllowed } from "@/lib/rbac";
import { appStore } from "@/lib/store";
import { wsMeta } from "@/services/ws";
import { ModuleTip } from "@/components/kit/ModuleTip";

const REVIEWS = [
  { t: "Approve P-006 Acceptable Use & Awareness", m: "Policy review, due this week", sev: "Medium" },
  { t: "Sign off access recertification Q4", m: "Access, due 14d", sev: "Low" },
  { t: "Review AI impact assessment (6.1.4)", m: "ISO 42001, overdue", sev: "High" },
];

export default function WorkModule() { return API_ON ? <WorkLive /> : <WorkDemo />; }

const sevDot = (sev: string) => (sev === "High" ? "var(--bad-ink)" : sev === "Medium" ? "var(--warn-ink)" : "var(--muted)");
/** Production: what is really assigned to the signed-in person and the decisions waiting for them (server/ws/insight.ts). */
function WorkLive() {
  useData();
  const go = useGo(); const L = useLayer();
  const w = useSyncExternalStore(wsMeta.subscribe, () => wsMeta.get().work, () => wsMeta.get().work);
  const canIssues = modAllowed(appStore.get().role, "ws", "issues");
  const k = w?.kpis ?? { assigned: 0, overdue: 0, dueWeek: 0, approvals: 0 };
  return (
    <Page mod="work" acts={
      <>
        <button className="btn btn-secondary" onClick={() => L.openModal("Request access", (close) => <AccessRequestForm close={close} />)}><Icon name="access" />Request access</button>
        <button className="btn btn-secondary" onClick={() => L.openModal("Request a new vendor", (close) => <VendorRequestForm close={close} />)}><Icon name="vendors" />Request a new vendor</button>
        <button className="btn btn-primary" onClick={() => go("/ws/overview")}><Icon name="overview" />Overview</button>
      </>}>
      <ModuleTip mod="work" />
      <div className="kpis">
        <Kpi icon="work" label="Assigned to you" value={k.assigned} tone="accent" />
        <Kpi icon="alert" label="Overdue" value={k.overdue} tone="bad" />
        <Kpi icon="check" label="Due this week" value={k.dueWeek} tone="warn" />
        <Kpi icon="audits" label="Approvals waiting" value={k.approvals} tone="info" />
      </div>
      <div className="split" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="card">
          <div className="c-head"><h3>Assigned to you</h3></div>
          <div className="c-body flush scroll" style={{ padding: 0 }}>
            <Table cols={[{ t: "ID" }, { t: "Item" }, { t: "Severity" }, { t: "Due" }]}>
              {!w || (!w.issues.length && !w.actions.length) ? <tr><td colSpan={4} style={{ color: "var(--muted)" }}>Nothing is assigned to you right now.</td></tr> : null}
              {(w?.issues ?? []).map((i) => (
                <tr key={i.id} className={canIssues ? "clickable" : undefined} {...(canIssues ? activate(() => go(`/ws/issues/${encodeURIComponent(i.id)}`)) : {})}>
                  <td className="strong num">{i.id}</td><td>{i.title}</td><td><StatusChip s={i.sev} /></td>
                  <td>{/Overdue/.test(i.due) ? <span style={{ color: "var(--bad-ink)", fontWeight: 500 }}>{i.due}</span> : i.due}</td>
                </tr>
              ))}
              {(w?.actions ?? []).map((a, n) => (
                <tr key={a.riskId + n} className="clickable" {...activate(() => go("/ws/risk"))}>
                  <td className="strong num">{a.riskId}</td><td>{a.text}<div style={{ fontSize: 11, color: "var(--muted)" }}>Treatment action · {a.risk}</div></td><td>—</td>
                  <td>{a.due || "—"}</td>
                </tr>
              ))}
            </Table>
          </div>
        </div>
        <div className="card">
          <div className="c-head"><h3>Reviews &amp; approvals</h3></div>
          <div className="c-body scroll flush" style={{ padding: "6px 14px" }}>
            <div className="feed">
              {!w?.reviews.length ? <p className="field help" style={{ margin: "8px 0" }}>No decisions are waiting for you.</p> : null}
              {(w?.reviews ?? []).map((r, n) => (
                <div key={r.t + n} className="feed-item">
                  <span className="dot" style={{ marginTop: 5, background: sevDot(r.sev) }} />
                  <div className="fi"><div className="ft">{r.t}</div><div className="fm">{r.m}</div></div>
                  <button className="btn btn-ghost sm" onClick={() => go(r.path)}>Open</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}

function WorkDemo() {
  useData();
  const go = useGo(); const L = useLayer();
  const mine = DATA.issues.filter((i) => /Avery/.test(i.owner)).concat(DATA.issues.filter((i) => !/Avery/.test(i.owner)).slice(0, 3));
  const overdue = DATA.issues.filter((i) => /Overdue/.test(i.due)).length;
  return (
    <Page mod="work" acts={
      <>
        <button className="btn btn-secondary" onClick={() => L.openModal("Request access", (close) => <AccessRequestForm close={close} />)}><Icon name="access" />Request access</button>
        <button className="btn btn-secondary" onClick={() => L.openModal("Request a new vendor", (close) => <VendorRequestForm close={close} />)}><Icon name="vendors" />Request a new vendor</button>
        <button className="btn btn-primary" onClick={() => go("/ws/overview")}><Icon name="overview" />Overview</button>
      </>}>
      <div className="kpis">
        <Kpi icon="work" label="Assigned to you" value={mine.length + REVIEWS.length} tone="accent" />
        <Kpi icon="alert" label="Overdue" value={overdue + 1} tone="bad" />
        <Kpi icon="check" label="Due this week" value={4} tone="warn" />
        <Kpi icon="audits" label="Approvals waiting" value={2} tone="info" />
      </div>
      <div className="split" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="card">
          <div className="c-head"><h3>Issues assigned to you</h3></div>
          <div className="c-body flush scroll" style={{ padding: 0 }}>
            <Table cols={[{ t: "ID" }, { t: "Issue" }, { t: "Severity" }, { t: "Due" }]}>
              {mine.map((i, k) => (
                <tr key={i.id + k} className="clickable" {...activate(() => go("/ws/issues"))}>
                  <td className="strong num">{i.id}</td><td>{i.title}</td><td><StatusChip s={i.sev} /></td>
                  <td>{/Overdue/.test(i.due) ? <span style={{ color: "var(--bad-ink)", fontWeight: 500 }}>{i.due}</span> : i.due}</td>
                </tr>
              ))}
            </Table>
          </div>
        </div>
        <div className="card">
          <div className="c-head"><h3>Reviews &amp; approvals</h3></div>
          <div className="c-body scroll flush" style={{ padding: "6px 14px" }}>
            <div className="feed">
              {REVIEWS.map((r) => (
                <div key={r.t} className="feed-item">
                  <span className="dot" style={{ marginTop: 5, background: r.sev === "High" ? "var(--bad-ink)" : r.sev === "Medium" ? "var(--warn-ink)" : "var(--muted)" }} />
                  <div className="fi"><div className="ft">{r.t}</div><div className="fm">{r.m}</div></div>
                  <button className="btn btn-ghost sm" onClick={() => L.toast("Opened (demo)")}>Open</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}
