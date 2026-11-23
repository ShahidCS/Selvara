/* R8: the single most urgent item, chosen by rules (no AI): an audit due in the next 60 days, else the oldest overdue High or Critical
   issue, else the next open audit. Only modules the role can open are considered. Hidden when nothing qualifies. */
import { DATA } from "@/lib/data";
import { Person, SeverityBars } from "@/components/ui";
import { useGo } from "@/lib/route";

const DAY = 86_400_000;
const daysTo = (s: string) => { const t = Date.parse(s); return Number.isNaN(t) ? null : Math.round((t - Date.now()) / DAY); };
const overdueDays = (due: string) => { const m = /Overdue (\d+)d/.exec(due || ""); return m ? Number(m[1]) : 0; };
const AUDIT_STAGES = ["Planned", "Fieldwork", "Reporting", "Complete"];
const ISSUE_STAGES = ["Open", "In progress", "Closed"];

type Row = Record<string, unknown>;
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
type Focus =
  | { kind: "audit"; a: Row; days: number | null; answered: number; total: number }
  | { kind: "issue"; i: Row; overdue: number };

export function pickFocus(can: (mod: string) => boolean): Focus | null {
  const audits = can("audits") ? (DATA.audits as Row[]).filter((a) => a.stage !== "Complete") : [];
  const withDays = audits.map((a) => ({ a, days: daysTo(str(a.period)) })).sort((x, y) => (x.days ?? 1e9) - (y.days ?? 1e9));
  const pbc = (a: Row) => { const l = (Array.isArray(a.pbc) ? a.pbc : []) as Row[]; return { answered: l.filter((p) => /Provided|Accepted|Answered|Closed/i.test(str(p.status))).length, total: l.length }; };
  const soon = withDays.find((x) => x.days !== null && x.days <= 60);
  if (soon) return { kind: "audit", a: soon.a, days: soon.days, ...pbc(soon.a) };
  if (can("issues")) {
    const late = (DATA.issues as Row[]).filter((i) => i.status !== "Closed" && /Critical|High/.test(str(i.sev)) && overdueDays(str(i.due)) > 0).sort((x, y) => overdueDays(str(y.due)) - overdueDays(str(x.due)))[0];
    if (late) return { kind: "issue", i: late, overdue: overdueDays(str(late.due)) };
  }
  if (withDays[0]) return { kind: "audit", a: withDays[0].a, days: withDays[0].days, ...pbc(withDays[0].a) };
  return null;
}

function Stages({ list, at }: { list: string[]; at: number }) {
  return (
    <ol className="stages" aria-label={`Stage ${at + 1} of ${list.length}: ${list[at]}`}>
      {list.map((s, k) => <li key={s} className={k < at ? "done" : k === at ? "now" : ""}><span className="st-dot" aria-hidden="true" /><span className="st-n">{s}</span></li>)}
    </ol>
  );
}

export function FocusCard({ can }: { can: (mod: string) => boolean }) {
  const go = useGo();
  const f = pickFocus(can);
  if (!f) return null;
  if (f.kind === "audit") {
    const { a, days, answered, total } = f;
    return (
      <section className="panel-soft focus" aria-labelledby="focus-h" data-tour="overview-focus">
        <span className="eyebrow focus-why">Most urgent · next audit</span>
        <div className="focus-top">
          <div><h2 id="focus-h">{str(a.name)}</h2><div className="cell-sub">{str(a.id)} · {str(a.auditor) || "Auditor not set"}{a.lead ? ` · ${str(a.lead)}` : ""}</div></div>
          <div className="focus-figs">
            <div><span className="eyebrow">Audit period</span><b>{days === null ? "Not dated" : days < 0 ? `${-days} days ago` : `${days} days`}</b><span className="cell-sub">{str(a.period)}</span></div>
            {total ? <div><span className="eyebrow">Requests answered</span><b>{answered} / {total}</b><span className="cell-sub">{total - answered} open</span></div> : null}
          </div>
        </div>
        <Stages list={AUDIT_STAGES} at={Math.max(0, AUDIT_STAGES.indexOf(str(a.stage)))} />
        <div className="btngrp"><button className="btn btn-decide" onClick={() => go(`/ws/audits/${encodeURIComponent(str(a.id))}`)}>Open audit</button></div>
      </section>
    );
  }
  const { i, overdue } = f;
  return (
    <section className="panel-soft focus" aria-labelledby="focus-h" data-tour="overview-focus">
      <span className="eyebrow focus-why">Most urgent · oldest overdue high issue</span>
      <div className="focus-top">
        <div><h2 id="focus-h">{str(i.title)}</h2><div className="cell-sub">{str(i.id)}</div></div>
        <div className="focus-figs">
          <div><span className="eyebrow">Overdue</span><b style={{ color: "var(--bad-ink)" }}>{overdue} days</b></div>
          <div><span className="eyebrow">Severity</span><SeverityBars level={str(i.sev)} /></div>
          <div><span className="eyebrow">Owner</span><Person name={str(i.owner)} /></div>
        </div>
      </div>
      <Stages list={ISSUE_STAGES} at={Math.max(0, ISSUE_STAGES.indexOf(str(i.status)))} />
      <div className="btngrp"><button className="btn btn-decide" onClick={() => go(`/ws/issues/${encodeURIComponent(str(i.id))}`)}>Open issue</button></div>
    </section>
  );
}
