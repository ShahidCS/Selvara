import { Chip } from "@/components/ui";
import { remarksFor } from "@/lib/me";

export default function MyRemarks({ role }: { role: string }) {
  const remarks = remarksFor(role);
  return (
    <div className="card" style={{ flex: "1 1 420px" }}>
      <div className="c-head"><h3>My remarks</h3></div>
      <div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {remarks.length === 0 ? <p className="sub" style={{ margin: 0 }}>You have not added any remarks.</p> : remarks.map((r) => (
          <div key={r.id} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{r.policy} · {r.section}</span>
              <Chip cls={r.status === "Overdue" ? "bad" : "info"}>{r.status}</Chip>
            </div>
            <div style={{ fontSize: 13 }}>{r.text}</div>
            <div className="sub" style={{ fontSize: 12 }}>Owner to review by {r.due}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
