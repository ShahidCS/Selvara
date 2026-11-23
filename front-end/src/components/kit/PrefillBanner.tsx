/* R27: "Fill from a document" on a create form. The document is read in the browser (lib/docText.ts) and fields are filled by fixed rules
   (lib/prefill.ts); in production a role that opens the AI Assistant can ask the server to fill the rest (POST /ws/assistant/prefill), with
   the usual personal-data checks. The form tints what was filled until it is edited; nothing is saved until the person submits. */
import { useId, useRef, useState } from "react";
import { AiMark, Icon } from "@/components/ui";
import { DOC_ACCEPT, DocError, extractText } from "@/lib/docText";
import { PREFILL_FORMS, checkValues, prefillFromText } from "@/lib/prefill";
import { API_ON, modAllowed } from "@/lib/rbac";
import { useApp } from "@/lib/store";
import { wsPost } from "@/services/ws";
import { safeFileName } from "@/lib/security";

type Form = keyof typeof PREFILL_FORMS;
type AiRes = { blocked: true; message: string } | { blocked: false; values: Record<string, unknown>; model: string };

export function PrefillBanner({ form, onFill, filled }: { form: Form; onFill: (values: Record<string, string>) => void; filled: number }) {
  const role = useApp((s) => s.role); const id = useId(); const input = useRef<HTMLInputElement>(null);
  const fields = PREFILL_FORMS[form];
  const [file, setFile] = useState(""); const [text, setText] = useState(""); const [err, setErr] = useState(""); const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);
  const aiOk = API_ON && modAllowed(role, "ws", "assistant");
  const pick = async (f: File | undefined) => {
    if (!f) return; setErr(""); setNote(""); setBusy(true);
    try {
      const { text: t } = await extractText(f.name, new Uint8Array(await f.arrayBuffer()));
      const v = prefillFromText(t, fields); setFile(safeFileName(f.name, "document")); setText(t); onFill(v);
      if (!Object.keys(v).length) setNote(aiOk ? "No field was found by its label. You can ask the AI to read the document." : "No field was found by its label (for example \"Vendor name: Acme\"). Fill the form by hand.");
    } catch (e) { setErr(e instanceof DocError ? e.message : "The file could not be read."); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  };
  const ai = async () => {
    setErr(""); setNote(""); setBusy(true);
    try {
      const r = await wsPost<AiRes>("/ws/assistant/prefill", { form, text: text.slice(0, 20_000) });
      if (r.blocked === true) { setErr(r.message); return; }
      const g = r as Extract<AiRes, { blocked: false }>;
      const v = checkValues(fields, g.values); onFill(v);
      setNote(Object.keys(v).length ? `The AI (${g.model}) suggested ${Object.keys(v).length} field${Object.keys(v).length === 1 ? "" : "s"}. Check each one.` : "The AI found no field values in the document.");
    } catch (e) { setErr(e instanceof Error && e.message ? e.message : "The AI could not read the document. Try again later."); }
    finally { setBusy(false); }
  };
  return (
    <div className="prefill" role="region" aria-label="Fill from a document">
      <input ref={input} type="file" id={`${id}-f`} className="vh" accept={DOC_ACCEPT} onChange={(e) => void pick(e.target.files?.[0])} tabIndex={-1} aria-hidden="true" />
      <div className="prefill-row">
        <Icon name="upload" />
        {file ? <span><span className="strong">Filled from {file}</span> · {filled} of {fields.length} fields filled{filled ? " · check each highlighted field" : ""}</span>
          : <span><span className="strong">Fill from a document</span> <span className="cell-sub">PDF, Word (.docx) or text, up to 5 MB. It is read in your browser.</span></span>}
        <span className="prefill-acts">
          <button type="button" className="btn btn-ghost sm" disabled={busy} onClick={() => input.current?.click()}>{file ? "Replace file" : "Choose file"}</button>
          {file && aiOk && filled < fields.length ? <button type="button" className="btn btn-ghost sm" disabled={busy} aria-busy={busy || undefined} onClick={() => void ai()}><AiMark size={16} />{busy ? "Reading…" : "Fill the rest with AI"}</button> : null}
        </span>
      </div>
      {note ? <p className="cell-sub" role="status" style={{ margin: 0 }}>{note}</p> : null}
      {err ? <p className="advisory" role="alert"><Icon name="alert" /><span>{err}</span></p> : null}
    </div>
  );
}

/** The form's side: which fields were filled (tinted until edited). */
export function usePrefilled() {
  const [keys, setKeys] = useState<Set<string>>(new Set());
  return {
    keys, count: keys.size,
    mark: (ks: string[]) => setKeys((s) => new Set([...s, ...ks])),
    clear: (k: string) => setKeys((s) => { if (!s.has(k)) return s; const n = new Set(s); n.delete(k); return n; }),
    cls: (k: string) => (keys.has(k) ? "field prefilled" : "field"),
    /** Text next to the label, so a filled field is never marked by tint alone. */
    tag: (k: string) => (keys.has(k) ? <span className="pf-tag">From document</span> : null),
  };
}
