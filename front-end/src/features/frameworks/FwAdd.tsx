import { Chip, Icon, Table } from "@/components/ui";
import { DATA } from "@/lib/data";
import { useModState } from "@/lib/store";
import { REQ_PAGE, fwCanAdmin } from "@/lib/frameworks";
import { FW_DOM, FW_TPL } from "@/features/frameworks/lib/fwTemplates";
import { uiMessage } from "@/lib/grcSod";
import * as fw from "./services/frameworks";
import { useLayer } from "@/hooks/useLayer";

interface Add { tpl: string | null; short: string; fname: string; kind: string; region: string; version: string; text: string; err: string }
const Req = () => <span style={{ color: "var(--bad-ink)" }} aria-hidden="true">*</span>;
/** Which field a save error belongs to, so the message sits under that field. */
const errField = (m: string) => (/short name|already in the library/i.test(m) ? "short" : /requirement/i.test(m) ? "text" : "form");
const errStyle = { color: "var(--bad-ink)", fontSize: 13, fontWeight: 600, margin: "6px 0 0" } as const;
const EMPTY: Add = { tpl: null, short: "", fname: "", kind: "Framework", region: "Global", version: "", text: "", err: "" };

/** "Add a regulation, standard or guideline": templates + keyword mapping preview (prototype: renderFwAdd / fwAddPick / fwAddSave). */
export function FwAdd({ onAdded }: { onAdded: (id: string) => void }) {
  const L = useLayer();
  const [A, setA] = useModState<Add>("fw.add", EMPTY);
  const admin = fwCanAdmin();
  const set = (p: Partial<Add>) => setA((x) => ({ ...x, ...p }));
  const lines = String(A.text || "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 300);
  const rows = lines.map((l) => { const m = FW_DOM.find((x) => x[1].test(l)); return { text: l.slice(0, 200), dom: m ? m[0] : "No match — new control needed", ok: !!m }; });
  const mappedN = rows.filter((r) => r.ok).length; const cov = rows.length ? Math.round((mappedN / rows.length) * 100) : 0;

  const pick = (id: string) => {
    const t = FW_TPL.find((x) => x.id === id); if (!t) return; if (DATA.frameworks.some((f) => f.id === id)) return;
    setA({ tpl: id, short: t.short, fname: t.name, kind: t.kind, region: t.region, version: t.version, text: t.text, err: "" });
  };
  const save = () => {
    if (!fwCanAdmin()) return;
    fw.addFramework({ template: A.tpl, short: A.short || "", name: A.fname || "", kind: A.kind, region: A.region, version: A.version, lines })
      .then((id) => { L.toast("“" + (A.short || "").trim().slice(0, 40) + "” added to the library"); setA(EMPTY); onAdded(id); })
      .catch((e) => { const m = uiMessage(e); set({ err: m }); const fld = errField(m); if (fld !== "form") document.getElementById(fld === "short" ? "fa-short" : "fa-text")?.focus(); });
  };
  const ef = A.err ? errField(A.err) : null;
  const inv = (k: string) => ({ "aria-invalid": ef === k, "aria-describedby": ef === k ? "fa-err" : undefined });
  const errLine = (k: string) => (ef === k ? <p id="fa-err" role="alert" style={errStyle}>{A.err}</p> : null);


  return (
    <section className="card"><div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <p className="sub" style={{ margin: 0 }}>Start from a template or paste requirements, one per line. Each line is matched to an existing control domain by keyword; unmatched lines are listed as gaps. Draft mapping for compliance review.</p>
      </div>
      <div className="fwtpls">
        {FW_TPL.map((t) => {
          const exists = DATA.frameworks.some((f) => f.id === t.id); const on = A.tpl === t.id;
          return (
            <button key={t.id} type="button" className={`fwtpl ${on ? "on" : ""}`} aria-pressed={on} disabled={exists} onClick={() => pick(t.id)}>
              <span className="tl">{t.short}</span><span className="tn">{t.name}</span><span className="ts">{exists ? "Already in the library" : on ? "Selected" : "Load requirements"}</span>
            </button>
          );
        })}
      </div>
      <div className="grid-add">
        <div className="field" style={{ margin: 0 }}><label htmlFor="fa-short">Short name <Req /></label><input className="input" id="fa-short" required value={A.short} onChange={(e) => set({ short: e.target.value })} {...inv("short")} />{errLine("short")}</div>
        <label className="field" style={{ margin: 0 }}><span className="flab">Full name</span><input className="input" value={A.fname} onChange={(e) => set({ fname: e.target.value })} /></label>
        <label className="field" style={{ margin: 0 }}><span className="flab">Version</span><input className="input" value={A.version} onChange={(e) => set({ version: e.target.value })} placeholder="2024" /></label>
        <label className="field" style={{ margin: 0 }}><span className="flab">Kind</span><select className="select" value={A.kind} onChange={(e) => set({ kind: e.target.value })}>{["Standard", "Framework", "Regulation"].map((k) => <option key={k}>{k}</option>)}</select></label>
        <label className="field" style={{ margin: 0 }}><span className="flab">Region</span><input className="input" value={A.region} onChange={(e) => set({ region: e.target.value })} placeholder="Global" /></label>
      </div>
      <div className="field" style={{ margin: 0 }}><label htmlFor="fa-text">Requirements, one per line <Req /></label><textarea className="input" id="fa-text" required rows={6} style={{ resize: "vertical" }} value={A.text} onChange={(e) => set({ text: e.target.value })} {...inv("text")} />{errLine("text")}</div>
      {rows.length ? (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 4 }}>
            <strong style={{ fontSize: 13 }}>{mappedN} of {rows.length} requirements map to existing control domains</strong>
            <Chip cls={cov >= 80 ? "ok" : cov >= 50 ? "warn" : "bad"}>{cov}% covered</Chip>
          </div>
          <div className="scroll" style={{ maxHeight: 220, border: "1px solid var(--line)", borderRadius: 8, marginTop: 8 }}>
            <Table cols={[{ t: "Requirement" }, { t: "Mapped control domain" }]}>
              {rows.map((r, i) => <tr key={i}><td>{r.text}</td><td><Chip cls={r.ok ? "neutral" : "bad"} icon={r.ok ? "check" : "x"}>{r.dom}</Chip></td></tr>)}
            </Table>
          </div>
        </>
      ) : null}
      {ef === "form" ? <p id="fa-err" role="alert" style={errStyle}>{A.err}</p> : null}
      {admin
        ? <button className="btn btn-primary" style={{ alignSelf: "flex-start", marginTop: 4 }} onClick={save}><Icon name="plus" />Add to library</button>
        : <p className="field help" style={{ marginTop: 8 }}>You can preview a mapping. Only a company admin can add it to the library.</p>}
    </div></section>
  );
}
void REQ_PAGE;
