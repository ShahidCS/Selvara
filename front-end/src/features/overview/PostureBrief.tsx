/* R9: the posture brief on the Overview. One sentence, the main causes as ranked bars and up to three next steps on named records, all computed
   from the loaded records (lib/insights.ts). "Write with AI" asks for wording of the same facts, as a draft; nothing is applied. */
import { HBarList, Icon } from "@/components/ui";
import { AiWording } from "@/components/kit/AiWording";
import { postureBrief, type Cause, type Target } from "@/lib/insights";
import { useGo } from "@/lib/route";
import { useRiskDrawer } from "@/features/risk";

/** Each cause's share of the total weight (failing controls weigh 3 each, overdue issues and risks above appetite 2, the rest 1), in whole percent. */
const shares = (cs: Cause[]) => { const t = cs.reduce((a, c) => a + c.weight, 0) || 1; return cs.map((c) => ({ ...c, share: Math.round((c.weight / t) * 100) })); };

export function PostureBrief({ can }: { can: (mod: string) => boolean }) {
  const go = useGo(); const openRisk = useRiskDrawer();
  const b = postureBrief(can);
  if (!b.causes.length && !b.steps.length) return null;
  const open = (to: Target) => ("risk" in to ? openRisk(to.risk) : go(to.path));
  return (
    <section className="panel-soft brief" aria-labelledby="brief-h" data-tour="overview-brief">
      <div className="brief-top">
        <div><span className="eyebrow">Posture brief · computed from your records</span><h2 id="brief-h" className="brief-h">{b.sentence}</h2></div>
        <AiWording source="Posture brief" label="Write the brief with AI" facts={b.facts}
          ask="Write a two to three sentence posture brief for a compliance lead, from the facts below. Name the biggest cause first and say what to do next." />
      </div>
      <div className="brief-grid">
        {b.causes.length ? <HBarList wrap title="Main causes, share of what holds posture back" unit="%" max={100} rows={shares(b.causes).map((c) => ({ label: c.label, value: c.share, tone: "bad" as const }))} /> : null}
        {b.steps.length ? (
          <div className="brief-steps">
            <h3 className="eyebrow" style={{ margin: 0 }}>Suggested next steps</h3>
            <ol>
              {b.steps.map((s) => (
                <li key={s.text}><button type="button" className="brief-step" onClick={() => open(s.to)}><span className="strong">{s.text}</span><span className="cell-sub">{s.why}</span><Icon name="chevron" aria-hidden="true" /></button></li>
              ))}
            </ol>
            <p className="cell-sub" style={{ margin: 0 }}>Suggestions follow fixed rules; nothing is changed until you act.</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
