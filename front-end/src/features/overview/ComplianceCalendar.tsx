/* R11: what falls due in the next six months, from data already loaded: audits (their period), policy reviews and vendor
   reassessments (their due dates; overdue ones sit at today, in red). Only modules the role can open are shown. Each marker opens its record. */
import { useState } from "react";
import { DATA } from "@/lib/data";
import { useGo } from "@/lib/route";

const DAY = 86_400_000; const SPAN = 183 * DAY;
interface Mark { label: string; at: number; late: boolean; href: string }
type Row = Record<string, unknown>;
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
interface Track { name: string; sub: string; marks: Mark[] }

export function calendarTracks(can: (mod: string) => boolean, now = Date.now()): Track[] {
  const start = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime();
  const inWindow = (t: number) => t >= start && t < start + SPAN;
  const when = (s: string): { at: number; late: boolean } | null => {
    if (/^Overdue/.test(s || "")) return { at: now, late: true };
    const t = Date.parse(s); return Number.isNaN(t) ? null : { at: t, late: t < now };
  };
  const out: Track[] = [];
  if (can("audits")) {
    const marks = (DATA.audits as Row[]).filter((a) => a.stage !== "Complete").map((a): Mark | null => { const w = when(str(a.period)); return w ? { label: str(a.name), at: w.at, late: w.late, href: `/ws/audits/${encodeURIComponent(str(a.id))}` } : null; }).filter((m): m is Mark => !!m && inWindow(m.at));
    out.push({ name: "Audits", sub: `${marks.length} in the next 6 months`, marks });
  }
  if (can("policies")) {
    const marks = (DATA.policies as Row[]).map((p): Mark | null => { const w = when(str(p.review)); return w ? { label: `${str(p.name)} review`, at: w.at, late: w.late, href: `/ws/policies/${encodeURIComponent(str(p.id))}` } : null; }).filter((m): m is Mark => !!m && inWindow(m.at));
    out.push({ name: "Policy reviews", sub: `${marks.length} due`, marks });
  }
  if (can("vendors")) {
    const marks = (DATA.vendors as Row[]).map((v): Mark | null => { const w = when(str(v.due)); return w ? { label: `${str(v.name)} reassessment`, at: w.at, late: w.late, href: `/ws/vendors/${encodeURIComponent(str(v.id || v.name))}` } : null; }).filter((m): m is Mark => !!m && inWindow(m.at));
    out.push({ name: "Vendor reassessments", sub: `${marks.filter((m) => m.late).length} overdue`, marks });
  }
  return out;
}

export function ComplianceCalendar({ can }: { can: (mod: string) => boolean }) {
  const go = useGo();
  const [now] = useState(() => Date.now());
  const tracks = calendarTracks(can, now);
  if (!tracks.length) return null;
  const d0 = new Date(now); const start = new Date(d0.getFullYear(), d0.getMonth(), 1).getTime();
  const months = Array.from({ length: 6 }, (_, k) => new Date(d0.getFullYear(), d0.getMonth() + k, 1).toLocaleDateString("en-GB", { month: "short" }));
  const pos = (t: number) => `${Math.min(100, Math.max(0, ((t - start) / SPAN) * 100))}%`;
  return (
    <section className="panel-soft cal" aria-labelledby="cal-h" data-tour="overview-calendar">
      <div><h2 id="cal-h" className="cal-h">Compliance calendar</h2><div className="cell-sub">Next 6 months · overdue items in red at today</div></div>
      <div className="cal-scroll">
        <div className="cal-grid">
          <div className="cal-row cal-head"><span>Track</span><div className="cal-months">{months.map((m) => <span key={m}>{m}</span>)}</div></div>
          {tracks.map((t) => (
            <div key={t.name} className="cal-row">
              <div><div className="strong">{t.name}</div><div className="cell-sub">{t.sub}</div></div>
              <div className="cal-lane">
                <span className="cal-today" style={{ left: pos(now) }} aria-hidden="true" />
                {t.marks.map((m, k) => (
                  <button key={k} className={`cal-mark${m.late ? " late" : ""}`} style={{ left: pos(m.at) }} onClick={() => go(m.href)}
                    title={`${m.label}: ${new Date(m.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}${m.late ? " (overdue)" : ""}`}>
                    <span className="vh">{m.label}, {new Date(m.at).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}{m.late ? ", overdue" : ""}</span>
                  </button>
                ))}
                {t.marks.length ? null : <span className="cell-sub cal-none">Nothing due</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
