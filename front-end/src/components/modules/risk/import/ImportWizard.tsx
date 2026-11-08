/* Risk import wizard UI (source lines 2793-2980: stepper, step 1 upload, step 2 column match, step 3 check and import).
 * Markup and inline styles are kept from the prototype. All cell/file content is rendered as React text. */
import { useEffect, useRef, useState } from "react";
import type { LayerApi } from "@/components/shell/LayerProvider";
import { LayerFoot } from "@/components/shell/LayerProvider";
import { Chip, Icon } from "@/components/ui";
import { bumpData } from "@/lib/store";
import { safeFileName, validateUpload } from "@/lib/security";
import { commitRiskImport } from "@/services/riskImport";
import { type Counts, type Parsed, compute } from "./convert";
import { IMP_FIELDS, ImportError, LIMITS, autoMap, buildGrid, importMessage, parseCSV, readXlsx, type Grid } from "./parse";
import { rband, riskCanEdit } from "./riskLocal";

const UPLOAD_RULE = { maxBytes: LIMITS.maxFileBytes, exts: ["csv", "xlsx", "xls"] };
const SAMPLE_CSV = "Risk ID,Risk Scenario,Category,Owner,Likelihood,Impact,Residual Likelihood,Residual Impact,Treatment,Status,Due Date,Controls\n"
  + ",Phishing leads to credential theft,People,P. Nair,4,3,2,3,Mitigate,Open,2026-03-31,\"MFA; security awareness\"\n"
  + ",Cloud storage key leakage,Technology,A. Rivera,2,5,1,4,Mitigate,Open,2026-02-15,KMS rotation\n"
  + ",Vendor sub-processor outage,Third party,N. Kim,3,4,2,3,Transfer,In treatment,2026-04-30,Contractual SLA\n"
  + ",Model drift in automated screening,AI,Data science,3,4,2,3,Mitigate,Open,2026-05-20,Bias testing\n"
  + "RK-01,Ransomware via unpatched edge service,Technology,J. Avery,5,5,2,4,Mitigate,Open,2026-01-31,Patch SLA";

const thStyle: React.CSSProperties = { textAlign: "left", padding: "7px 10px", fontSize: 11, color: "var(--muted)", fontWeight: 600 };
const thSticky: React.CSSProperties = { textAlign: "left", padding: "7px 10px", fontSize: 11, color: "var(--muted)", position: "sticky", top: 0, background: "var(--surface-2)" };

const bandTint = (col: string, p: number) => `color-mix(in srgb, ${col} ${p}%, var(--surface))`;
const bandText = (col: string) => `color-mix(in srgb, ${col} 50%, var(--ink))`;
function ScoreChip({ score }: { score: number }) {
  const b = rband(score);
  return <span className="chip" style={{ background: bandTint(b.col, 15), color: bandText(b.col), border: `1px solid ${bandTint(b.col, 30)}`, fontVariantNumeric: "tabular-nums" }}>{score}</span>;
}

function Stepper({ step }: { step: number }) {
  const steps = ["Upload", "Match columns", "Check and import"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 16 }}>
      {steps.map((s, idx) => {
        const n = idx + 1, cur = n === step, done = n < step;
        const dot = done ? "var(--accent-weak)" : cur ? "var(--accent)" : "var(--surface-3)", dc = done ? "var(--accent-ink)" : cur ? "#fff" : "var(--muted)";
        return (
          <span key={s} style={{ display: "contents" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, background: cur ? "var(--accent-weak)" : "transparent", borderRadius: 8, padding: "5px 9px" }} aria-current={cur ? "step" : undefined}>
              <span style={{ flex: "0 0 auto", width: 21, height: 21, borderRadius: 999, background: dot, color: dc, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11.5, fontWeight: 600 }}>{done ? "✓" : n}</span>
              <span style={{ fontSize: 12.5, fontWeight: cur ? 600 : 500, color: cur ? "var(--ink)" : "var(--muted)", whiteSpace: "nowrap" }}>{s}</span>
            </div>
            {n < 3 ? <span style={{ flex: "0 0 auto", color: "var(--faint)" }}><Icon name="chevron" /></span> : null}
          </span>
        );
      })}
    </div>
  );
}

export function ImportWizard({ L, onDone }: { L: LayerApi; onDone?: () => void }) {
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState("");
  const [grid, setGrid] = useState<Grid | null>(null);
  const [map, setMap] = useState<Record<string, number>>({});
  const [autoCount, setAutoCount] = useState(0);
  const [conflict, setConflict] = useState<"update" | "new">("update");
  const [parsed, setParsed] = useState<Parsed[] | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [err, setErr] = useState("");
  const [reading, setReading] = useState(false);
  const [dropFocus, setDropFocus] = useState(false);
  const alive = useRef(true);
  const busy = useRef(false);
  const seq = useRef(0); // ignores results of a superseded file read
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const fail = (e: unknown) => { setReading(false); setErr(importMessage(e)); setStep(1); };
  const setGridFrom = (matrix: string[][]) => {
    try {
      const g = buildGrid(matrix); const am = autoMap(g.headers);
      setGrid(g); setMap(am.map); setAutoCount(am.autoCount); setErr(""); setReading(false); setStep(2);
    } catch (e) { fail(e); }
  };

  const onFile = (input: HTMLInputElement) => {
    const f = input.files && input.files[0]; if (!f) return;
    const name = safeFileName(f.name, "file");
    const bad = validateUpload({ name: f.name, size: f.size, type: f.type }, UPLOAD_RULE);
    input.value = ""; // allow re-choosing the same file
    if (bad) { setFileName(name); setErr(bad); setStep(1); return; }
    const my = ++seq.current;
    setFileName(name); setErr(""); setReading(true);
    const ok = (m: string[][]) => { if (alive.current && my === seq.current) setGridFrom(m); };
    const no = (e: unknown) => { if (alive.current && my === seq.current) fail(e); };
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    try {
      if (ext === "xls") { no(new ImportError("legacy-xls")); return; }
      if (ext === "xlsx") { f.arrayBuffer().then(readXlsx).then(ok).catch(no); }
      else {
        const rd = new FileReader();
        rd.onload = () => { try { ok(parseCSV(String(rd.result || ""))); } catch (e) { no(e instanceof ImportError && e.code !== "bad-csv" ? e : new ImportError("bad-csv")); } };
        rd.onerror = () => no(new ImportError("bad-csv")); // source copy "Could not read the file." is replaced by the generic CSV message
        rd.readAsText(f);
      }
    } catch (e) { no(e); }
  };
  const sample = () => {
    try { setFileName("sample-risk-register.csv"); setErr(""); setGridFrom(parseCSV(SAMPLE_CSV)); } catch (e) { fail(e); }
  };

  const runCompute = (c: "update" | "new" = conflict, m = map) => {
    if (!grid) return;
    try { const r = compute(grid, m, c); setParsed(r.parsed); setCounts(r.counts); }
    catch { setParsed([]); setCounts({ total: 0, nNew: 0, nUpd: 0, nWarn: 0, nErr: 0 }); setErr("Could not check the rows."); }
  };
  const run = async () => {
    if (!parsed || busy.current) return;
    if (!riskCanEdit()) { L.toast("You do not have permission to import risks"); return; }
    busy.current = true;
    try {
      const { nNew, nUpd } = await commitRiskImport(parsed, fileName);
      L.closeLayer();
      L.toast("Imported " + nNew + " new" + (nUpd ? " and updated " + nUpd : "") + " risk" + (nNew + nUpd !== 1 ? "s" : ""));
      bumpData(); onDone?.();
    } catch { busy.current = false; L.toast("Import failed. Nothing was changed.", false); }
  };

  const titleOk = map["title"] != null && map["title"] >= 0;
  const n = counts ? counts.nNew + counts.nUpd : 0;

  return (
    <>
      <Stepper step={step} />
      {step === 1 && (
        <>
          <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 9, border: "1.5px dashed var(--line-2)", borderRadius: 12, padding: "30px 16px", cursor: "pointer", background: "var(--surface-2)", textAlign: "center", outline: dropFocus ? "2px solid var(--accent)" : undefined, outlineOffset: 2 }}>
            <span style={{ width: 34, height: 34, color: "var(--accent)" }}><Icon name="download" /></span>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Choose your risk register file</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", maxWidth: 430 }}>Excel .xlsx or .csv, first sheet, one risk per row, headers in the first row. Up to {LIMITS.maxRows.toLocaleString("en-US")} rows, {LIMITS.maxFileBytes / 1024 / 1024} MB.</div>
            <input type="file" data-focus accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Choose your risk register file"
              style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden", clip: "rect(0 0 0 0)" }}
              onFocus={() => setDropFocus(true)} onBlur={() => setDropFocus(false)} onChange={(e) => onFile(e.currentTarget)} />
            <span className="btn btn-primary sm" style={{ pointerEvents: "none", marginTop: 2 }}>Browse files</span>
          </label>
          {reading ? <p className="field help" aria-live="polite" style={{ marginTop: 10 }}>Reading the file in your browser…</p> : null}
          {err ? <p className="field help" role="alert" style={{ color: "var(--bad-ink)", marginTop: 10 }}>{err}</p> : null}
          <p className="field help" style={{ marginTop: 12 }}>Any column names work; you match them in the next step. Useful columns: Risk ID, Title, Category, Owner, Likelihood, Impact, Residual likelihood, Residual impact, Treatment, Status, Due date, Controls. 3-point, 5-point, 10-point and High/Medium/Low ratings are converted to the 5×5 scale.</p>
          <button className="btn btn-ghost sm" onClick={sample} style={{ marginTop: 2 }}>Try with a sample register</button>
        </>
      )}
      {step === 2 && grid && (
        <>
          <p style={{ margin: "0 0 12px", fontSize: 13 }}><span className="strong">{fileName}</span> · {grid.rows.length} row{grid.rows.length !== 1 ? "s" : ""}, {grid.headers.length} columns. We matched {autoCount} column{autoCount !== 1 ? "s" : ""} automatically; check them.</p>
          <div style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "var(--surface-2)" }}><th scope="col" style={thStyle}>Field</th><th scope="col" style={thStyle}>Column in file</th><th scope="col" style={thStyle}>Sample</th></tr></thead>
              <tbody>
                {IMP_FIELDS.map((f) => {
                  const ci = map[f.k] == null ? -1 : map[f.k];
                  const sampleV = ci >= 0 && grid.rows.length ? String(grid.rows[0][ci] == null ? "" : grid.rows[0][ci]).trim() : "";
                  return (
                    <tr key={f.k} style={{ borderTop: "1px solid var(--line)" }}>
                      <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}><span className="strong" style={{ fontSize: 13 }}>{f.label}</span>{f.req ? <> <span style={{ color: "var(--bad-ink)" }}>*</span></> : null}</td>
                      <td style={{ padding: "7px 10px" }}>
                        <select className="select" aria-label={`Column for ${f.label}`} style={{ width: "100%", minWidth: 150 }} value={ci}
                          onChange={(e) => { const v = +e.target.value; setMap({ ...map, [f.k]: Number.isInteger(v) && v >= -1 && v < grid.headers.length ? v : -1 }); }}>
                          <option value={-1}>Not in file</option>
                          {grid.headers.map((h, idx) => <option key={idx} value={idx}>{h}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: "7px 10px", fontSize: 12, color: "var(--muted)", maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ci >= 0 ? (sampleV.slice(0, 40) || <span style={{ color: "var(--faint)" }}>(empty)</span>) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {titleOk ? null : <p className="field help" role="alert" style={{ color: "var(--bad-ink)", marginTop: 10 }}>Map a column to <strong>Risk title</strong> to continue.</p>}
        </>
      )}
      {step === 3 && parsed && counts && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {([[counts.total, "Rows read", ""], [counts.nNew, "New risks", "var(--ok-ink)"], [counts.nUpd, "Update existing", "var(--info-ink)"], [counts.nWarn, "With warnings", "var(--warn-ink)"], [counts.nErr, "Skipped, errors", "var(--bad-ink)"]] as [number, string, string][]).map(([v, l, cl]) => (
              <div key={l} style={{ flex: "1 1 92px", background: "var(--surface-2)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 20, fontWeight: 600, color: cl || "var(--ink)" }}>{v}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{l}</div>
              </div>
            ))}
          </div>
          <div role="radiogroup" aria-label="When a Risk ID already exists" style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 12, fontSize: 13 }}>
            <span className="strong">When a Risk ID already exists</span>
            <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}><input type="radio" name="impconf" checked={conflict === "update"} onChange={() => { setConflict("update"); runCompute("update"); }} /> Update the existing risk</label>
            <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}><input type="radio" name="impconf" checked={conflict === "new"} onChange={() => { setConflict("new"); runCompute("new"); }} /> Add as a new risk with a new ID</label>
          </div>
          <div style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "auto", maxHeight: 320 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "var(--surface-2)" }}>
                {["Row", "Result", "Risk", "Owner", "Inherent", "Residual", "Notes"].map((h) => <th key={h} scope="col" style={thSticky}>{h}</th>)}
              </tr></thead>
              <tbody>
                {parsed.slice(0, 150).map((p, k) => (
                  <tr key={k} style={{ borderTop: "1px solid var(--line)" }}>
                    <td style={{ padding: "6px 10px", color: "var(--muted)", fontSize: 12 }}>{p.row}</td>
                    <td style={{ padding: "6px 10px" }}>{p.result === "New" ? <Chip cls="ok">New</Chip> : p.result === "Update" ? <Chip cls="info">Update</Chip> : <Chip cls="bad">Skip</Chip>}</td>
                    <td style={{ padding: "6px 10px" }}><div className="strong" style={{ fontSize: 12.5 }}>{p.title}</div><div style={{ fontSize: 11, color: "var(--muted)" }}>{p.id || "—"}{p.cat ? " · " + p.cat : ""}</div></td>
                    <td style={{ padding: "6px 10px", fontSize: 12 }}>{p.owner || ""}</td>
                    <td style={{ padding: "6px 10px" }}>{p.inh ? <ScoreChip score={p.inh as number} /> : "—"}</td>
                    <td style={{ padding: "6px 10px" }}>{p.res ? <ScoreChip score={p.res as number} /> : "—"}</td>
                    <td style={{ padding: "6px 10px", fontSize: 11.5, color: p.result === "Skip" ? "var(--bad-ink)" : "var(--muted)" }}>{p.notes || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsed.length > 150 ? <p className="field help" style={{ marginTop: 8 }}>Showing the first 150 of {parsed.length} rows.</p> : null}
          <p className="field help" style={{ marginTop: 10 }}>The file is read in your browser. Formulas and links in cells are imported as plain text, never run. Every import is recorded in each risk&apos;s history and in the audit log.</p>
        </>
      )}
      <LayerFoot>
        {step === 1 && <button className="btn btn-secondary" onClick={L.closeLayer}>Cancel</button>}
        {step === 2 && (
          <>
            <button className="btn btn-secondary" onClick={() => { setStep(1); setErr(""); }}>Choose another file</button>
            <button className="btn btn-primary" disabled={!titleOk} onClick={() => { runCompute(); setStep(3); }}>Check rows</button>
          </>
        )}
        {step === 3 && (
          <>
            <button className="btn btn-secondary" onClick={() => setStep(2)}>Back to columns</button>
            <button className="btn btn-primary" disabled={!n} onClick={run}>Import {n} risk{n !== 1 ? "s" : ""}</button>
          </>
        )}
      </LayerFoot>
    </>
  );
}
