import { ROPA } from "@/lib/platform";
import { ropaFor } from "@/lib/ropa";

/** Prototype: ropaRegisterHTML (workspace) / alogRopa (admin). `intro` differs slightly between the two. All values render as React text. */
export function RopaRegister({ entries, intro }: { entries: { action?: string; categories?: string[]; cat?: string }[]; intro: string }) {
  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 14 }}><p className="field help" style={{ margin: 0, maxWidth: "none", textWrap: "balance" }}>{intro}</p></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(460px,100%),1fr))", gap: 12, alignItems: "stretch" }}>
        {ROPA.map((p) => {
          const events = entries.filter((l) => ropaFor(l) === p.id).length;
          return (
            <div className="card" style={{ boxShadow: "none" }} key={p.id}>
              <div className="c-body">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span className="tag num">{p.id}</span><span style={{ fontWeight: 600 }}>{p.name}</span><span className="tag" style={{ marginLeft: "auto" }}>{p.scope}</span>
                  {events ? <span className="tag">{events} event{events !== 1 ? "s" : ""}</span> : null}
                </div>
                <dl className="meta-grid lstart" style={{ gridTemplateColumns: "max-content 1fr" }}>
                  <dt>Purpose</dt><dd>{p.purpose}</dd><dt>Lawful basis</dt><dd>{p.basis}</dd><dt>Data subjects</dt><dd>{p.subjects}</dd><dt>Data categories</dt><dd>{p.data}</dd>
                  <dt>Recipients</dt><dd>{p.recipients}</dd><dt>Transfers</dt><dd>{p.transfers}</dd><dt>Retention</dt><dd>{p.retention}</dd><dt>Security measures (Art. 32)</dt><dd>{p.tom}</dd>
                </dl>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
