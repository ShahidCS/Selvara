import { localGreeting } from "@/lib/greeting";
import { useEffect, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/router";
import { Icon, KpiStrip, KpiTile, Page, Table, StatusChip, activate , SeverityBars, Empty } from "@/components/ui";
import { DATA } from "@/lib/data";
import { useApp, useData, useModState } from "@/lib/store";
import { useGo } from "@/lib/route";
import { useLayer } from "@/hooks/useLayer";
import { AccessRequestForm, VendorRequestForm } from "./RequestModals";
import { useSyncExternalStore } from "react";
import { API_ON, modAllowed } from "@/lib/rbac";
import { appStore } from "@/lib/store";
import { wsMeta } from "@/services/ws";
import { getMe } from "@/lib/audit";
import { toAcknowledge } from "@/lib/me";
import { DELEGATION } from "@/lib/delegation";
import { hasRole } from "@/lib/sod";
import AccountSecurity from "./AccountSecurity";
import { DelegationCard } from "./DelegationCard";
import MyRemarks from "./MyRemarks";
import MyTasks, { useTasks } from "./MyTasks";
import PublishedPolicies from "./PublishedPolicies";
import { WORK_REVIEWS } from "@/data/workReviews";

const REVIEWS = WORK_REVIEWS;
/** An issue counts as due this week when it is due in 7 days or fewer (and not already overdue). */
const dueThisWeek = (due: string) => { const m = /^Due (\d+)d/.exec(due); return !!m && Number(m[1]) <= 7; };
/** The ID column never wraps at the hyphen. */
const ID_CELL = { whiteSpace: "nowrap" } as const;

/** The tabs of My Work. Tasks is first and the default; the others need the `me` permission (the personal part of the page, formerly
 *  "My Workspace" at /ws/me, which now opens the Policies tab). Delegation is only for the roles that can hold an approver slot. */
export type WorkTab = "tasks" | "policies" | "security" | "delegation";
const TABS: [WorkTab, string][] = [["tasks", "Tasks"], ["policies", "Policies"], ["security", "Account security"], ["delegation", "Delegation"]];
export const WORK_TAB_KEY = "work.tab";
const isTab = (v: unknown): v is WorkTab => TABS.some((t) => t[0] === v);

/** `?tab=policies` on the address (an old /ws/me link, a notification) selects that tab. */
const queryTab = (asPath: string): string | null => {
  const q = asPath.split("#")[0].split("?")[1];
  return q ? new URLSearchParams(q).get("tab") : null;
};

/** My Work: the greeting and counts, then Tasks, Policies, Account security and Delegation. Deny by default: a tab the role may not see is not offered. */
export default function WorkModule() {
  useData();
  const role = useApp((s) => s.role);
  const router = useRouter();
  const L = useLayer(); const go = useGo();
  const personal = modAllowed(role, "ws", "me");
  const tabs = TABS.filter(([k]) => k === "tasks" || (personal && (k !== "delegation" || hasRole(role, ...DELEGATION.ROLES))));
  const [stored, setStored] = useModState<string>(WORK_TAB_KEY, "tasks");
  const q = queryTab(router.asPath);
  // a deep link wins and is remembered; stored state is never trusted blindly
  useEffect(() => { if (isTab(q) && q !== stored) setStored(q); }, [q, stored, setStored]);
  const want = isTab(q) ? q : stored;
  const tab: WorkTab = tabs.some((t) => t[0] === want) ? (want as WorkTab) : "tasks";
  const pick = (k: WorkTab) => {
    setStored(k);
    if (q !== null) void router.replace("/ws/work", undefined, { shallow: true }); // the address no longer pins a tab once the person picks one
  };
  const tabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const n = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : d ? (i + d + tabs.length) % tabs.length : -1;
    if (n < 0) return; e.preventDefault();
    pick(tabs[n][0]); document.getElementById(`work-tab-${tabs[n][0]}`)?.focus();
  };
  const body: ReactNode = tab === "policies" ? <PublishedPolicies />
    : tab === "security" ? (API_ON ? <YourAccountLink /> : <AccountSecurity />)
    : tab === "delegation" ? <DelegationCard />
    : <>
        {API_ON ? <WorkLive /> : <WorkDemo />}
        {personal ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "stretch" }}>
            <MyTasks role={role} />
            {API_ON ? null : <MyRemarks role={role} />}
          </div>
        ) : null}
      </>;
  // the member banner explains what a member cannot do; a role that manages the team (company admin) does not need it
  const member = personal && !modAllowed(role, "ws", "team");
  const greeting = useGreeting(role);
  return (
    <Page mod="work" sub={personal ? greeting : undefined} acts={
      <>
        <button className="btn btn-secondary" onClick={() => L.openModal("Request access", (close) => <AccessRequestForm close={close} />)}><Icon name="access" />Request access</button>
        <button className="btn btn-secondary" onClick={() => L.openModal("Request a new vendor", (close) => <VendorRequestForm close={close} />)}><Icon name="vendors" />Request a new vendor</button>
        <button className="btn btn-primary" onClick={() => go("/ws/overview")}><Icon name="overview" />Overview</button>
      </>}>
      {member ? (
        <div className="banner info">
          <strong>Member access.</strong> You can read published policies{API_ON ? "" : ", add remarks on policies you are invited to,"} and acknowledge policies. Only a policy&apos;s creator can edit it; settings and team management are for company admins.
        </div>
      ) : null}
      {tabs.length > 1 ? (
        <div className="tabs" role="tablist" aria-label="My Work sections" style={{ flexWrap: "nowrap", alignSelf: "flex-start" }}>
          {tabs.map(([k, label], i) => (
            <button key={k} className="tab" role="tab" id={`work-tab-${k}`} aria-controls="work-panel" aria-selected={tab === k} tabIndex={tab === k ? 0 : -1}
              style={{ whiteSpace: "nowrap", flex: "0 0 auto" }} onKeyDown={(e) => tabKey(e, i)} onClick={() => pick(k)}>{label}</button>
          ))}
        </div>
      ) : null}
      <div id="work-panel" className="scroll" {...(tabs.length > 1 ? { role: "tabpanel", "aria-labelledby": `work-tab-${tab}` } : {})} tabIndex={0}
        style={{ flex: "1 1 auto", display: "flex", flexDirection: "column", gap: 14 }}>
        {body}
      </div>
    </Page>
  );
}

/** "Good Morning, Priya. You have 3 open tasks · 2 policies to acknowledge" (counts from the same lists as the Tasks and Policies tabs). */
function useGreeting(role: string): string {
  const me = getMe();
  const { tasks } = useTasks(role);
  const open = tasks.filter((t) => !t.isDone).length;
  const toAck = toAcknowledge(me.name);
  const first = me.name.split(" ")[0];
  // the shell renders only on the client (after hydration), so the local hour is safe to read here
  const greet = localGreeting();
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return `${greet}, ${first}. You have ${plural(open, "open task", "open tasks")} · ${plural(toAck, "policy", "policies")} to acknowledge`;
}

/** Production: account security lives on Your account (/auth), which re-checks the password before a change. */
function YourAccountLink() {
  const go = useGo();
  return (
    <section className="card" aria-labelledby="work-sec-h">
      <div className="c-head"><h3 id="work-sec-h">My account security</h3></div>
      <div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p className="field help" style={{ margin: 0 }}>Your sign-in history, two-step verification, sessions, password and recovery codes are on Your account.</p>
        <div><button className="btn btn-secondary sm" onClick={() => go("/auth")}>Open Your account</button></div>
      </div>
    </section>
  );
}

/** The old address of the personal page (/ws/me, "My Workspace"): it now opens My Work on the Policies tab. */
export function MeRedirect() {
  const router = useRouter();
  useEffect(() => { void router.replace("/ws/work?tab=policies"); }, [router]);
  return null;
}

/** Production: what is really assigned to the signed-in person and the decisions waiting for them (server/ws/insight.ts). */
function WorkLive() {
  useData();
  const go = useGo();
  const w = useSyncExternalStore(wsMeta.subscribe, () => wsMeta.get().work, () => wsMeta.get().work);
  const canIssues = modAllowed(appStore.get().role, "ws", "issues"); const canRisk = modAllowed(appStore.get().role, "ws", "risk");
  const k = w?.kpis ?? { assigned: 0, overdue: 0, dueWeek: 0, approvals: 0 };
  return (
    <>
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
                  <td className="strong num" style={ID_CELL}>{i.id}</td><td>{i.title}</td><td><SeverityBars level={i.sev} /></td>
                  <td>{/Overdue/.test(i.due) ? <span style={{ color: "var(--bad-ink)", fontWeight: 500 }}>{i.due}</span> : i.due}</td>
                </tr>
              ))}
              {(w?.actions ?? []).map((a, n) => (
                <tr key={a.riskId + n} className={canRisk ? "clickable" : undefined} {...(canRisk ? activate(() => go("/ws/risk")) : {})}>
                  <td className="strong num" style={ID_CELL}>{a.riskId}</td><td>{a.text}<div style={{ fontSize: ".6875rem", color: "var(--muted)" }}>Treatment action{a.risk ? " · " + a.risk : ""}</div></td><td>—</td>
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
              {!w?.reviews.length ? <Empty compact icon="check" title="No decisions are waiting for you" /> : null}
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
    </>
  );
}

function WorkDemo() {
  useData();
  const go = useGo();
  const mine = DATA.issues.filter((i) => /Avery/.test(i.owner)).concat(DATA.issues.filter((i) => !/Avery/.test(i.owner)).slice(0, 3));
  const role = appStore.get().role;
  /* Every tile is counted from the two lists on this page. */
  const overdue = mine.filter((i) => /Overdue/.test(i.due)).length + REVIEWS.filter((r) => r.overdue).length;
  const week = mine.filter((i) => dueThisWeek(i.due)).length + REVIEWS.filter((r) => r.week).length;
  return (
    <>
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
                  <td className="strong num" style={ID_CELL}>{i.id}</td><td>{i.title}</td><td><SeverityBars level={i.sev} /></td>
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
    </>
  );
}
