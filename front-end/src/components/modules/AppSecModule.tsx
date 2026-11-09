import { useState } from "react";
import { Empty, Page } from "@/components/ui";
import { modAllowed } from "@/lib/rbac";
import { useApp } from "@/lib/store";
import spec from "@/data/appsecSpec.json";
import { ControlGroup, Group } from "./appsec/ControlGroup";
import { ResponseCompare } from "./appsec/ResponseCompare";
import { RateLimitTable } from "./appsec/RateLimitTable";
import { PermissionMatrix } from "./appsec/PermissionMatrix";
import { ReleaseGate } from "./appsec/ReleaseGate";

const SECTIONS: [string, string][] = [["core", "Core rule"], ["responses", "Responses"], ["controls", "Control groups"], ["limits", "Rate limits"], ["matrix", "Permissions"], ["gate", "Release gate"]];
const GROUPS = spec.groups as Group[];
const groupText = (g: Group) => [g.title, g.threat, g.refs, g.test, ...g.controls].join(" ").toLowerCase();

/** Application Security Controls: read-only reference specification (no persistence, no actions). */
export default function AppSecModule() {
  const role = useApp((s) => s.role);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  if (!modAllowed(role, "ws", "appsec")) {
    return <Page mod="appsec"><Empty icon="shieldcheck" title="Access restricted">Your role does not have access to this reference page.</Empty></Page>;
  }

  const jump = (id: string) => {
    const el = document.getElementById(`appsec-${id}`);
    if (!el) return;
    el.scrollIntoView({ block: "start" });
    el.focus({ preventScroll: true });
  };
  const ql = q.trim().toLowerCase();
  const list = GROUPS.map((g, i) => ({ g, n: i + 1 })).filter(({ g }) => !ql || groupText(g).includes(ql));
  const secHead = (id: string, t: string, sub?: string) => (
    <div style={{ marginBottom: 10 }}><h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{t}</h2>{sub ? <p className="sub" style={{ margin: "4px 0 0" }}>{sub}</p> : null}</div>
  );

  return (
    <Page mod="appsec">
      <div className="scroll" style={{ overflow: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
        <p className="sub" style={{ margin: 0 }}>{spec.intro}</p>
        <div className="banner info" style={{ display: "block" }}>Specification text only. It describes what the server must enforce; nothing on this page changes behaviour or records evidence. Draft content that needs review by qualified security staff.</div>
        <nav aria-label="Sections" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {SECTIONS.map(([id, label]) => <button key={id} type="button" className="btn btn-secondary sm" onClick={() => jump(id)}>{label}</button>)}
        </nav>

        <section className="card" id="appsec-core" tabIndex={-1} aria-labelledby="appsec-core-h"><div className="c-body">
          <h2 id="appsec-core-h" style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{spec.coreRule.heading}</h2>
          <p style={{ margin: "6px 0 0", color: "var(--ink-2)" }}>{spec.coreRule.body}</p>
        </div></section>

        <section className="card" id="appsec-responses" tabIndex={-1} aria-labelledby="appsec-responses-h"><div className="c-body">
          <div id="appsec-responses-h">{secHead("responses", "What a response may contain")}</div>
          <ResponseCompare bad={spec.badResponse} good={spec.goodResponse} neverSend={spec.neverSend} />
        </div></section>

        <section id="appsec-controls" tabIndex={-1} aria-labelledby="appsec-controls-h" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div id="appsec-controls-h">{secHead("controls", "Control groups")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
            <label className="field" style={{ flex: "1 1 260px", margin: 0 }}><span className="flab">Search controls</span>
              <input className="input" type="search" value={q} maxLength={80} onChange={(e) => setQ(e.target.value)} placeholder="IDOR, lockout, CSRF, API3…" /></label>
            <button type="button" className="btn btn-ghost sm" onClick={() => setOpen(Object.fromEntries(GROUPS.map((g) => [g.id, true])))}>Expand all</button>
            <button type="button" className="btn btn-ghost sm" onClick={() => setOpen({})}>Collapse all</button>
            <span style={{ fontSize: 12, color: "var(--muted)", paddingBottom: 9 }} aria-live="polite">{list.length} of {GROUPS.length} shown</span>
          </div>
          {list.length === 0 ? <Empty title="No matching controls">Try a different search term.</Empty> :
            list.map(({ g, n }) => <ControlGroup key={g.id} g={g} n={n} open={!!open[g.id] || !!ql} onToggle={() => setOpen({ ...open, [g.id]: !open[g.id] })} />)}
        </section>

        <section className="card" id="appsec-limits" tabIndex={-1} aria-labelledby="appsec-limits-h"><div className="c-body">
          <div id="appsec-limits-h">{secHead("limits", "Rate limits and lockout (starting values)", spec.rateLimitsIntro)}</div>
          <RateLimitTable rows={spec.rateLimits} />
        </div></section>

        <section className="card" id="appsec-matrix" tabIndex={-1} aria-labelledby="appsec-matrix-h"><div className="c-body">
          <div id="appsec-matrix-h">{secHead("matrix", "Server-side permission matrix", spec.matrixIntro)}</div>
          <PermissionMatrix roles={spec.matrixRoles} rows={spec.matrix} />
        </div></section>

        <section className="card" id="appsec-gate" tabIndex={-1} aria-labelledby="appsec-gate-h"><div className="c-body">
          <div id="appsec-gate-h">{secHead("gate", "Release gate: evidence required before go-live")}</div>
          <ReleaseGate items={spec.releaseGate} />
        </div></section>
      </div>
    </Page>
  );
}
