import { Chip, Empty } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { getMe, wsLog } from "@/lib/audit";
import { bumpData, useData } from "@/lib/store";
import { ackOf, approvedOn, publishedPolicies } from "@/lib/me";
import { acknowledge } from "@/services/me";

/** Read-only approved versions + per-user acknowledgement. No edit or approve controls here by design. */
export default function PublishedPolicies() {
  useData();
  const L = useLayer();
  const user = getMe().name;
  const pubs = publishedPolicies();
  const ack = async (id: string, name: string) => {
    const a = await acknowledge(user, id);
    if (!a) { L.toast("This policy is not published, so it cannot be acknowledged", false); return; }
    wsLog("policy.acknowledged", `${name} v${a.ver}`, "Policy"); bumpData();
    L.toast(`Acknowledged ${name} — recorded with timestamp in the audit log`);
  };
  return (
    <section id="library" className="card" aria-labelledby="me-pub-h">
      <div className="c-head"><h3 id="me-pub-h">Published policies</h3><span className="sub r">Read only · approved versions</span></div>
      <div className="c-body">
        {pubs.length === 0 ? <Empty compact icon="policies" title="No policies are published yet" /> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
            {pubs.map((p: { id: string; name: string; ver: string; owner: string }) => {
              const a = ackOf(user, p.id);
              return (
                <div key={p.id} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div className="sub" style={{ fontSize: 12 }}>v{p.ver} · Owner {p.owner} · Approved {approvedOn(p.id)}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Chip cls={a ? "ok" : "warn"}>{a ? `Acknowledged ${a.at}` : "Not acknowledged"}</Chip>
                    <button className={`btn sm ${a ? "btn-secondary" : "btn-primary"}`} disabled={!!a} onClick={() => ack(p.id, p.name)} aria-label={a ? `${p.name}: done` : `Read & acknowledge ${p.name}`}>{a ? "Done" : "Read & acknowledge"}</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
