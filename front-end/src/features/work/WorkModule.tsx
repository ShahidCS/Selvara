import { Icon, KpiStrip, KpiTile, Page, Table, StatusChip, activate } from "@/components/ui";
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
  { t: "Approve P-006 Acceptable Use & Awareness", m: "Policy review, due this week", sev: "Medium", path: "/ws/policies/P-006", mod: "policies", overdue: false, week: true },
  { t: "Sign off access recertification Q4", m: "Access, due 14d", sev: "Low", path: "/ws/access", mod: "access", overdue: false, week: false },
  { t: "Review AI impact assessment (6.1.4)", m: "ISO 42001, overdue", sev: "High", path: "/ws/ai", mod: "ai", overdue: true, week: false },
];
/** An issue counts as due this week when it is due in 7 days or fewer (and not already overdue). */
const dueThisWeek = (due: string) => { const m = /^Due (\d+)d/.exec(due); return !!m && Number(m[1]) <= 7; };
/** The ID column never wraps at the hyphen. */
const ID_CELL = { whiteSpace: "nowrap" } as const;

export default function WorkModule() { return API_ON ? <WorkLive /> : <WorkDemo />; }

/** Production: what is really assigned to the signed-in person and the decisions waiting for them (server/ws/insight.ts). */
function WorkLive() {
  useData();
  const go = useGo(); const L = useLayer();
  const w = useSyncExternalStore(wsMeta.subscribe, () => wsMeta.get().work, () => wsMeta.get().work);
  const canIssues = modAllowed(appStore.get().role, "ws", "issues"); const canRisk = modAllowed(appStore.get().role, "ws", "risk");
  const k = w?.kpis ?? { assigned: 0, overdue: 0, dueWeek: 0, approvals: 0 };
  return (
    <Page mod="work" acts={
      <>
        <button className="btn btn-secondary" onClick={() => L.openModal("Request access", (close) => <AccessRequestForm close={close} />)}><Icon name="access" />Request access</button>
        <button className="btn btn-secondary" onClick={() => L.openModal("Request a new vendor", (close) => <VendorRequestForm close={close} />)}><Icon name="vendors" />Request a new vendor</button>
        <button className="btn btn-primary" onClick={() => go("/ws/overview")}><Icon name="overview" />Overview</button>
      </>}>
      <ModuleTip mod="work" />
      <KpiStrip label="Your work summary">
        <KpiTile label="Assigned to you" value={k.assigned} caption="Issues, actions and reviews" />
        <KpiTile label="Overdue" value={k.overdue} delta={k.overdue ? { tone: "bad", text: "Past due" } : undefined} caption="Past their due date" />
        <KpiTile label="Due this week" value={k.dueWeek} caption="Due in the next 7 days" />
        <KpiTile label="Approvals waiting" value={k.approvals} caption="Decisions waiting for you" />
      </KpiStrip>
      <div className="split" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="card">
          <div className="c-head"><h3>Assigned to you</h3></div>
          <div className="c-body flush scroll" style={{ padding: 0 }}>
            <Table cols={[{ t: "ID" }, { t: "Item" }, { t: "Severity" }, { t: "Due" }]}>
              {!w || (!w.issues.length && !w.actions.length) ? <tr><td colSpan={4} style={{ color: "var(--muted)" }}>Nothing is assigned to you right now.</td></tr> : null}
              {(w?.issues ?? []).map((i) => (
                <tr key={i.id} className={canIssues ? "clickable" : undefined} {...(canIssues ? activate(() => go(`/ws/issues/${encodeURIComponent(i.id)}`)) : {})}>
                  <td className="strong num" style={ID_CELL}>{i.id}</td><td>{i.title}</td><td><StatusChip s={i.sev} /></td>
                  <td>{/Overdue/.test(i.due) ? <span style={{ color: "var(--bad-ink)", fontWeight: 500 }}>{i.due}</span> : i.due}</td>
                </tr>
              ))}
              {(w?.actions ?? []).map((a, n) => (
                <tr key={a.riskId + n} className={canRisk ? "clickable" : undefined} {...(canRisk ? activate(() => go("/ws/risk")) : {})}>
                  <td className="strong num" style={ID_CELL}>{a.riskId}</td><td>{a.text}<div style={{ fontSize: 11, color: "var(--muted)" }}>Treatment action{a.risk ? " · " + a.risk : ""}</div></td><td>—</td>
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
                <div key={r.t + n} className="feed-item clickable" {...activate(() => go(r.path))}>
                  <div className="fi"><div className="ft">{r.t}</div><div className="fm" style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 4 }}><StatusChip s={r.sev} /><span>{r.m}</span></div></div>
                  <span className="btn btn-ghost sm" aria-hidden="true">Open</span>
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
  const role = appStore.get().role;
  /* Every tile is counted from the two lists on this page. */
  const overdue = mine.filter((i) => /Overdue/.test(i.due)).length + REVIEWS.filter((r) => r.overdue).length;
  const week = mine.filter((i) => dueThisWeek(i.due)).length + REVIEWS.filter((r) => r.week).length;
  return (
    <Page mod="work" acts={
      <>
        <button className="btn btn-secondary" onClick={() => L.openModal("Request access", (close) => <AccessRequestForm close={close} />)}><Icon name="access" />Request access</button>
        <button className="btn btn-secondary" onClick={() => L.openModal("Request a new vendor", (close) => <VendorRequestForm close={close} />)}><Icon name="vendors" />Request a new vendor</button>
        <button className="btn btn-primary" onClick={() => go("/ws/overview")}><Icon name="overview" />Overview</button>
      </>}>
      <KpiStrip label="Your work summary">
        <KpiTile label="Assigned to you" value={mine.length + REVIEWS.length} caption={`${mine.length} issues, ${REVIEWS.length} reviews`} />
        <KpiTile label="Overdue" value={overdue} delta={overdue ? { tone: "bad", text: "Past due" } : undefined} caption="Past their due date" />
        <KpiTile label="Due this week" value={week} caption="Due in the next 7 days" />
        <KpiTile label="Approvals waiting" value={REVIEWS.length} caption="Reviews and approvals below" />
      </KpiStrip>
      <div className="split" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="card">
          <div className="c-head"><h3>Issues assigned to you</h3></div>
          <div className="c-body flush scroll" style={{ padding: 0 }}>
            <Table cols={[{ t: "ID" }, { t: "Issue" }, { t: "Severity" }, { t: "Due" }]}>
              {mine.map((i, k) => (
                <tr key={i.id + k} className="clickable" {...activate(() => go(`/ws/issues/${encodeURIComponent(i.id)}`))}>
                  <td className="strong num" style={ID_CELL}>{i.id}</td><td>{i.title}</td><td><StatusChip s={i.sev} /></td>
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
              {REVIEWS.map((r) => {
                const open = modAllowed(role, "ws", r.mod);
                return (
                  <div key={r.t} className={open ? "feed-item clickable" : "feed-item"} {...(open ? activate(() => go(r.path)) : {})}>
                    <div className="fi"><div className="ft">{r.t}</div><div className="fm" style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 4 }}><StatusChip s={r.sev} /><span>{r.m}</span></div></div>
                    {open ? <span className="btn btn-ghost sm" aria-hidden="true">Open</span> : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}
