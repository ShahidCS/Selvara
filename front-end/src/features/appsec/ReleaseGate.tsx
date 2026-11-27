import { useState } from "react";

/** DISPLAY-ONLY checklist: ticks are local component state, never persisted, logged or treated as evidence. */
export function ReleaseGate({ items }: { items: string[] }) {
  const [done, setDone] = useState<Record<number, boolean>>({});
  const n = items.filter((_, i) => done[i]).length;
  return (
    <div>
      <p className="sub" style={{ margin: "0 0 8px" }}>These ticks are for reading along only: they are not saved, not logged and are not evidence that any gate has passed.</p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((t, i) => (
          <li key={i}>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", color: "var(--ink-2)" }}>
              <input type="checkbox" checked={!!done[i]} onChange={(e) => setDone({ ...done, [i]: e.target.checked })} style={{ marginTop: 3 }} />
              <span>{t}</span>
            </label>
          </li>
        ))}
      </ul>
      <div style={{ fontSize: ".75rem", color: "var(--muted)", marginTop: 8 }} aria-live="polite">{n} of {items.length} ticked on this screen</div>
    </div>
  );
}
