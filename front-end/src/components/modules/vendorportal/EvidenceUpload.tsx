import { useRef } from "react";
import type { VendorFile } from "@/lib/vendorSubmission";

/** Evidence picker + status pill. The File is handed to the parent's validateUpload gate; its content is never read or rendered. Name shown as React text. */
export default function EvidenceUpload({ qid, file, onPick, hint }: { qid: string; file?: VendorFile; onPick: (f: File) => void; hint?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const cls = file ? (file.status === "clean" ? "ok" : file.status === "blocked" ? "bad" : "info") : "";
  const text = file ? (file.status === "scanning" ? `${file.name} — scanning for malware…` : file.status === "clean" ? `${file.name} — scanned, uploaded` : `${file.name} — ${file.why ?? "file type not allowed"}`) : "";
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
      <button type="button" className="btn btn-secondary" aria-label={`Attach evidence for ${qid}`} onClick={() => ref.current?.click()}>Attach evidence</button>
      <input ref={ref} type="file" hidden accept=".pdf,.docx,.xlsx,.png,.jpg" aria-label={`Evidence file for ${qid}`}
        onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) onPick(f); e.target.value = ""; }} />
      {hint ? <span style={{ fontSize: 12, color: "var(--muted)" }}>Suggested: {hint}</span> : null}
      {file ? <span className={"chip " + cls} role="status" style={{ height: "auto", minHeight: 22, whiteSpace: "normal", padding: "3px 8px" }}>{text}</span> : null}
    </div>
  );
}
