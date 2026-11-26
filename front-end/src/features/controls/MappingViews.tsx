import { useState } from "react";
import { DataTable, Icon, StatusChip, type DTColumn } from "@/components/ui";
import { DATA, FW_ID, FW_SHORT, mappedFws, reqTitle } from "@/lib/data";
import { setModState } from "@/lib/store";
import { codeWidth } from "@/lib/format";
import { fwScopeIn, fwSnoozed, REQ_PAGE } from "@/lib/frameworks";
import { useGo } from "@/lib/route";
import { useLayer } from "@/components/shell/LayerProvider";
import { scoped } from "@/services/audits";

/* Mapping views as the original sources showed them (GRC_Unified_Compliance_Dashboard.html, "Controls and tests"): a cross-framework
   matrix of controls against the catalogues in scope, and per control the requirements it satisfies, grouped by framework. Both read the
   control's own mappings (`map`), the same data the original matrix and control page used. */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Control = any;
const DEFAULT_COLS = 6;
const SHOW_CODES = 8;
const TONE: Record<string, [string, string]> = { Pass: ["ok", "check"], Fail: ["bad", "x"] };
const toneOf = (status: string): [string, string] => TONE[status] ?? ["warn", "alert"];
const fwShort = (id: string) => FW_SHORT[id] || FW_ID[id] || id;

/** Opens a framework page searched to one requirement, so the reader lands on it. */
export function useOpenRequirement() {
  const go = useGo();
  return (fwId: string, reqId?: string) => {
    setModState("fw.reqf", "all"); setModState("fw.grp", null); setModState("fw.limit", REQ_PAGE); setModState("fw.open", reqId ? { [reqId]: true } : {});
    setModState("fw.rq", reqId ?? "");
    go(`/ws/frameworks/${encodeURIComponent(fwId)}`);
  };
}

/** One framework's mapped requirement codes, with titles where the code resolves in the catalogue. */
function ReqCodes({ fwId, codes, onOpen }: { fwId: string; codes: string[]; onOpen: (fw: string, req: string) => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? codes : codes.slice(0, SHOW_CODES);
  return (
    <>
      <ul className="req-list" style={codeWidth(shown)}>
        {shown.map((code) => {
          const title = reqTitle(fwId === "iso27002" && !reqTitle("iso27002", code) ? "iso27001" : fwId, code);
          return (
            <li key={code}>
              {title ? <button type="button" className="req-code num" onClick={() => onOpen(fwId, code)} aria-label={`Open ${fwShort(fwId)} requirement ${code}`}>{code}</button>
                : <span className="req-code num plain">{code}</span>}
              <span className={title ? "req-title" : "req-title muted"}>{title ?? "Not in the catalogue (short reference, kept for review)"}</span>
            </li>
          );
        })}
      </ul>
      {codes.length > SHOW_CODES ? (
        <button type="button" className="btn btn-ghost sm" aria-expanded={all} onClick={() => setAll((v) => !v)}>{all ? "Show fewer" : `Show all ${codes.length}`}</button>
      ) : null}
    </>
  );
}

/** "Requirements satisfied" on a control's page: its mapped requirements grouped by framework. */
export function RequirementsSatisfied({ c }: { c: Control }) {
  const open = useOpenRequirement();
  const keys = mappedFws(c);
  const n = keys.reduce((a, k) => a + c.map[k].length, 0);
  if (!keys.length) return null;
  return (
    <div className="stack" style={{ gap: 12 }}>
      <p className="field help" style={{ margin: 0 }}>{n} requirement{n === 1 ? "" : "s"} across {keys.length} framework{keys.length === 1 ? "" : "s"}. Mappings are draft content until reviewed by qualified compliance staff.</p>
      {keys.map((k) => (
        <section key={k} className="req-group" aria-label={`${FW_ID[k] || k}: ${c.map[k].length} requirements`}>
          <div className="req-group-h">
            <button type="button" className="linkbtn strong" onClick={() => open(k)}>{FW_ID[k] || k}</button>
            <span className="tag">{c.map[k].length}</span>
          </div>
          <ReqCodes fwId={k} codes={c.map[k]} onOpen={open} />
        </section>
      ))}
    </div>
  );
}

/** The in-scope catalogues with at least one mapped control (most mapped first), their mapped and passing counts, and the chosen columns
    (the six most mapped until the reader picks). */
function matrixState(controls: Control[], sel: string[] | null) {
  const fws = scoped("frameworks", DATA.frameworks).filter((f) => fwScopeIn(f.id));
  const count: Record<string, number> = {}, ok: Record<string, number> = {};
  for (const f of fws) {
    const m = controls.filter((c) => (c.map?.[f.id] || []).length);
    count[f.id] = m.length; ok[f.id] = m.filter((c) => c.status === "Pass").length;
  }
  const byMapped = fws.filter((f) => count[f.id] > 0).sort((a, b) => count[b.id] - count[a.id] || (a.name < b.name ? -1 : 1));
  const chosen = (sel ?? byMapped.slice(0, DEFAULT_COLS).map((f) => f.id)).filter((id) => count[id] > 0);
  return { count, ok, byMapped, chosen };
}
/** The matrix columns as shown, in order (the CSV export uses the same columns). */
export const matrixCols = (controls: Control[], sel: string[] | null): string[] => { const s = matrixState(controls, sel); return s.byMapped.filter((f) => s.chosen.includes(f.id)).map((f) => f.id); };

/** The cross-framework matrix: chosen in-scope catalogues as columns, one row per control mapped to at least one of them. Each cell is the
    number of requirements the control satisfies there, toned (with an icon) by the control's status; opening a cell lists them. */
export function MappingMatrix({ controls, sel, setSel }: { controls: Control[]; sel: string[] | null; setSel: (v: string[]) => void }) {
  const L = useLayer(); const go = useGo(); const openReq = useOpenRequirement();
  const { count, ok, byMapped, chosen } = matrixState(controls, sel);
  const cols = byMapped.filter((f) => chosen.includes(f.id));
  const rows = controls.filter((c) => cols.some((f) => (c.map?.[f.id] || []).length));
  const toggle = (id: string) => setSel(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);

  const openCell = (c: Control, fwId: string) => {
    const codes: string[] = c.map[fwId];
    L.openDrawer(`${c.id}, ${fwShort(fwId)}`, `${codes.length} requirement${codes.length === 1 ? "" : "s"} in ${FW_ID[fwId] || fwId}`, () => (
      <div className="stack">
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><StatusChip s={c.status} /><span>{c.title}</span></div>
        <ReqCodes fwId={fwId} codes={codes} onOpen={(fw, req) => { L.closeLayer(); openReq(fw, req); }} />
        <p className="field help" style={{ margin: 0 }}>Mappings are draft content until reviewed by qualified compliance staff.</p>
      </div>
    ), () => (
      <>
        <button className="btn btn-secondary" onClick={() => { L.closeLayer(); openReq(fwId); }}>Open framework</button>
        <button className="btn btn-primary" onClick={() => { L.closeLayer(); go(`/ws/controls/${encodeURIComponent(c.id)}`); }}>Open control</button>
      </>
    ));
  };

  const columns: DTColumn<Control>[] = [
    { key: "mxctrl", header: "Control", width: 260, locked: true, value: (c) => c.id, render: (c) => (<>
      <div><span className="strong num">{c.id}</span> <span>{c.title}</span></div>
      <div style={{ marginTop: 4 }}><StatusChip s={c.status} /></div>
    </>) },
    ...cols.map((f): DTColumn<Control> => ({
      key: "mx-" + f.id, header: fwShort(f.id), width: 112, value: (c) => (c.map?.[f.id] || []).length,
      render: (c) => {
        const codes: string[] = c.map?.[f.id] || [];
        if (!codes.length) return <span className="mx-none" aria-label={`${c.id} not mapped to ${fwShort(f.id)}`}>—</span>;
        const [tone, icon] = toneOf(c.status);
        return (
          <button type="button" className={`mx-cell ${tone}`} title={`${fwShort(f.id)}: ${codes.join(", ")}`} onClick={() => openCell(c, f.id)}
            aria-label={`${c.id} (${c.status}) satisfies ${codes.length} ${fwShort(f.id)} requirement${codes.length === 1 ? "" : "s"}. Show them`}>
            <Icon name={icon} aria-hidden="true" />{codes.length}
          </button>
        );
      },
    })),
  ];

  return (
    <div className="stack">
      <p className="field help" style={{ margin: 0 }}>One control set mapped to the catalogues in scope. Each cell shows how many requirements the control satisfies, with the control&rsquo;s status as its icon and shade; open a cell for the requirement IDs and titles. The ratio on each catalogue is mapped controls that pass.</p>
      <div className="mx-pick" role="group" aria-label="Catalogues shown as columns">
        {byMapped.map((f) => {
          const on = chosen.includes(f.id);
          return (
            <button key={f.id} type="button" className="fchip" aria-pressed={on} onClick={() => toggle(f.id)} title={FW_ID[f.id]}>
              {on ? <Icon name="check" aria-hidden="true" /> : null}{fwShort(f.id)} <span className="num">{ok[f.id]}/{count[f.id]} pass</span>{fwSnoozed(f.id) ? " · snoozed" : ""}
            </button>
          );
        })}
      </div>
      <p className="field help" style={{ margin: 0 }} aria-live="polite">{cols.length} of {byMapped.length} in-scope catalogues shown; {rows.length} of {controls.length} controls map to at least one of them.</p>
      <p className="banner info" role="note" style={{ margin: 0 }}>Common-control mappings are draft content. Requirement codes and cross-framework mappings need review by qualified compliance staff before you rely on them for an audit or regulator.</p>
      <DataTable<Control> id="matrix" label="Cross-framework matrix" rows={rows} rowKey={(c) => c.id} columns={columns}
        searchText={(c) => `${c.id} ${c.title} ${c.domain}`} emptyText="Choose at least one catalogue to see the matrix."
        tabs={["Pass", "Needs evidence", "Fail"].map((s) => ({ key: s, label: s, match: (c: Control) => c.status === s }))}
        onOpen={(c) => go(`/ws/controls/${encodeURIComponent(c.id)}`)} exportName="cross-framework-matrix" />
    </div>
  );
}
