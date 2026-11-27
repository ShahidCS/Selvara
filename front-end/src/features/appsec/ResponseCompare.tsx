const PRE: React.CSSProperties = { margin: 0, padding: 12, overflow: "auto", maxHeight: 340, fontSize: ".75rem", lineHeight: 1.5, fontFamily: "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace", background: "var(--surface-2)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, whiteSpace: "pre-wrap", overflowWrap: "anywhere" };

/** Two example responses side by side. Static specification text rendered as text only; no live values. */
export function ResponseCompare({ bad, good, neverSend }: { bad: string; good: string; neverSend: string[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div className="sectitle">Not allowed</div>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, color: "var(--ink-2)" }}>{neverSend.map((x, i) => <li key={i}>{x}</li>)}</ul>
      </div>
      <div className="split" style={{ gridTemplateColumns: "1fr 1fr", alignItems: "start" }}>
        <figure style={{ margin: 0 }}>
          <figcaption style={{ fontSize: ".78125rem", fontWeight: 600, marginBottom: 6 }}><span className="chip bad">Not allowed</span> Common over-sharing login response</figcaption>
          <pre style={PRE} tabIndex={0} aria-label="Example of an over-sharing login response">{bad}</pre>
        </figure>
        <figure style={{ margin: 0 }}>
          <figcaption style={{ fontSize: ".78125rem", fontWeight: 600, marginBottom: 6 }}><span className="chip ok">Required</span> Minimal response; identity stays on the server</figcaption>
          <pre style={PRE} tabIndex={0} aria-label="Example of a minimal login response">{good}</pre>
        </figure>
      </div>
    </div>
  );
}
