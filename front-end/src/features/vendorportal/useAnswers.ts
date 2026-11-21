import { useCallback, useEffect, useRef, useState } from "react";
import { validateUpload, type UploadRule } from "@/lib/security";
import { blockReason, displayName, PREFILL_UPLOAD_RULE, QUESTIONS, SCAN_MS, VENDOR_UPLOAD_RULE, MAX_COMMENT, type Answer, type Answers, type Files } from "@/features/vendorportal/lib/vendorSubmission";

/** In-memory vendor answers (never written to storage). Scan timers are cleared on unmount. */
export function useAnswers() {
  const [ans, setAns] = useState<Answers>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Files>({});
  const [pre, setPre] = useState<Record<string, boolean>>({});
  const timers = useRef<number[]>([]);
  useEffect(() => () => { timers.current.forEach((t) => window.clearTimeout(t)); timers.current = []; }, []);

  const setAnswer = useCallback((id: string, v: string) => {
    setAns((a) => { const n = { ...a }; if (v) n[id] = v as Answer; else delete n[id]; return n; });
    setPre((p) => { const n = { ...p }; delete n[id]; return n; });
  }, []);
  const setNote = useCallback((id: string, v: string) => setNotes((n) => ({ ...n, [id]: v.slice(0, MAX_COMMENT) })), []);

  /** Evidence gate: validateUpload (25 MB, pdf/docx/xlsx/png/jpg). Content is never read; the scan result is simulated (board: 1.2 s). */
  const pickFile = useCallback((id: string, file: File) => {
    const name = displayName(file.name);
    if (validateUpload(file, VENDOR_UPLOAD_RULE)) { setFiles((f) => ({ ...f, [id]: { name, status: "blocked", why: blockReason(file, VENDOR_UPLOAD_RULE) } })); return; }
    setFiles((f) => ({ ...f, [id]: { name, status: "scanning" } }));
    const t = window.setTimeout(() => setFiles((f) => (f[id] && f[id].name === name ? { ...f, [id]: { name, status: "clean" } } : f)), SCAN_MS);
    timers.current.push(t);
  }, []);

  /** DEMO STUB: the board derives prefilled answers from the file-name length, not from the file. Returns a message for the toast. */
  /** Returns the message to show and whether it worked (the page shows a refusal as an error). */
  const applyPrefill = useCallback((file: File): { ok: boolean; msg: string } => {
    const rule: UploadRule = PREFILL_UPLOAD_RULE;
    const err = validateUpload(file, rule);
    if (err) return { ok: false, msg: err };
    let n = 0;
    const a = { ...ans }; const p = { ...pre };
    QUESTIONS.forEach((q, i) => { if (a[q.id]) return; const h = (i * 7 + file.name.length) % 10; a[q.id] = h < 8 ? "Y" : "P"; p[q.id] = true; n++; });
    setAns(a); setPre(p);
    return { ok: true, msg: `${n} answers prefilled from ${displayName(file.name)}. Check each one before submitting.` };
  }, [ans, pre]);

  const reset = useCallback(() => { timers.current.forEach((t) => window.clearTimeout(t)); timers.current = []; setAns({}); setNotes({}); setFiles({}); setPre({}); }, []);
  return { ans, notes, files, pre, setAnswer, setNote, pickFile, applyPrefill, reset };
}
export type AnswersApi = ReturnType<typeof useAnswers>;
