import { useEffect, useState } from "react";
import { Chip, Empty, Table } from "@/components/ui";
import { apiMessage, utcMin } from "@/components/kit/serverRequests";
import { useData } from "@/lib/store";
import { apiFetch } from "@/services/http";

/* Production: what the site's Content-Security-Policy blocked in people's browsers (migration 0012), reduced by the server before it was kept:
   the directive, the blocked source (an origin, or inline / eval), the page path and the script file. No person, address or code sample.
   Platform staff read it; nothing here can be changed. A new row is worth a look: an injection attempt, or a release that broke the CSP. */
interface Row { directive: string; blocked: string; page: string; source: string; line: number; hits: number; firstAt: number; lastAt: number }

export function CspReports() {
  const v = useData();
  const [rows, setRows] = useState<Row[] | null>(null); const [err, setErr] = useState("");
  useEffect(() => {
    let on = true;
    apiFetch<{ reports: Row[] }>("/admin/security/csp-reports").then((x) => { if (on) { setRows(x.reports); setErr(""); } }, (e) => { if (on) setErr(apiMessage(e, "Could not load the CSP reports")); });
    return () => { on = false; };
  }, [v]);
  const total = rows?.reduce((a, r) => a + r.hits, 0) ?? 0;
  return (
    <section className="card" aria-labelledby="csp-h" data-tour="security-csp">
      <div className="c-head"><h3 id="csp-h">Blocked by the content security policy</h3><div className="r"><span className="tag">{rows ? `${total} in 30 days` : "…"}</span></div></div>
      <div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <p className="field help" style={{ margin: 0 }}>Browsers report what the site&apos;s security policy stopped: a script or style that is not part of Selvara. A new entry can mean an injection attempt or a release that needs fixing. Kept for 30 days, without people, addresses or page content.</p>
        {err ? <p role="alert" style={{ margin: 0, color: "var(--bad-ink)" }}>{err}</p>
          : !rows ? <p style={{ margin: 0, color: "var(--muted)" }}>Loading…</p>
          : !rows.length ? <Empty compact icon="shieldcheck" title="Nothing blocked">No browser has reported a blocked script or style in the last 30 days.</Empty>
          : (
            <div style={{ margin: "0 -16px" }}>
              <Table cols={[{ t: "Blocked" }, { t: "Rule" }, { t: "Page" }, { t: "From" }, { t: "Times", r: true }, { t: "Last seen" }]}>
                {rows.map((r) => (
                  <tr key={`${r.directive}|${r.blocked}|${r.page}|${r.source}|${r.line}`}>
                    <td className="strong">{r.blocked === "inline" || r.blocked === "eval" ? <Chip cls="bad" icon="alert">{r.blocked === "inline" ? "Inline code" : "eval"}</Chip> : <span className="num">{r.blocked}</span>}</td>
                    <td className="num" style={{ fontSize: ".75rem" }}>{r.directive}</td>
                    <td className="num" style={{ fontSize: ".75rem" }}>{r.page}</td>
                    <td className="num" style={{ fontSize: ".75rem" }}>{r.source ? `${r.source}${r.line ? `:${r.line}` : ""}` : "—"}</td>
                    <td className="num r">{r.hits}</td>
                    <td className="num" style={{ fontSize: ".75rem" }}>{utcMin(r.lastAt)}</td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
      </div>
    </section>
  );
}
