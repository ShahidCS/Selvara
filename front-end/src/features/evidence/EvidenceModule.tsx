import { Icon, Page, activate } from "@/components/ui";
import { DATA } from "@/lib/data";
import { useApp, useData, useModState } from "@/lib/store";
import { useLayer } from "@/hooks/useLayer";
import { evInit, whyCannotWrite } from "@/features/evidence/services/evidence";
import EvidencePreview, { EmptyPreview } from "./EvidencePreview";
import { EvidenceForm, SEL_KEY } from "./EvidenceForms";

/** Evidence: list + preview, CRUD, attachments, versioning (source REND.evidence, lines 2217-2251). */
export default function EvidenceModule() {
  useData();
  const L = useLayer();
  useApp((s) => s.role);
  const writeWhy = whyCannotWrite();
  const [sel, setSel] = useModState<string | null>(SEL_KEY, null);
  DATA.evidence.forEach(evInit);
  const selected = sel != null && DATA.evidence.some((e) => e.id === sel) ? sel : null;
  return (
    <Page mod="evidence" acts={<button className="btn btn-primary" disabled={!!writeWhy} title={writeWhy || undefined} onClick={() => L.openModal("Add evidence", (close) => <EvidenceForm close={close} />)}><Icon name="plus" />Add evidence</button>}>
      <div className="split">
        <div className="card">
          <div className="c-head"><h3>Evidence</h3><div className="r"><span className="tag">{DATA.evidence.length}</span></div></div>
          <div className="c-body flush scroll" id="evList">
            {DATA.evidence.map((e) => (
              <div key={e.id} className={`listrow ${selected === e.id ? "sel" : ""}`} {...activate(() => setSel(e.id))} aria-pressed={selected === e.id}>
                <div className="fi"><div className="lt">{e.name}</div><div className="lm">{e.type}, v{e.ver}, {e.updated}</div></div>
              </div>
            ))}
          </div>
        </div>
        <div className="card" id="evPrev">{selected ? <EvidencePreview id={selected} /> : <EmptyPreview />}</div>
      </div>
    </Page>
  );
}
