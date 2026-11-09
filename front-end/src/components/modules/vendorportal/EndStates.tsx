import { INVITE } from "@/lib/vendorSubmission";
import { Section, H1, Lead } from "./parts";

export function DeadState({ onRestart }: { onRestart: () => void }) {
  return (
    <Section narrow={560} gap={10}>
      <H1>This link can&apos;t be used</H1>
      <Lead>Ask your contact at {INVITE.customerName} to send a new request.</Lead>
      <button type="button" className="btn btn-secondary sm" style={{ alignSelf: "flex-start", borderRadius: 999 }} onClick={onRestart}>Restart demo</button>
    </Section>
  );
}

export function DoneState({ refId, ver, onSimulate, onRestart }: { refId: string; ver: number; onSimulate: () => void; onRestart: () => void }) {
  return (
    <Section narrow={640} gap={10}>
      <H1>Thank you, your response has been submitted</H1>
      <Lead>Reference {refId} · version {ver}. Your answers are now read-only. {INVITE.customerName} reviews each answer against its evidence and may ask for clarification through this portal.</Lead>
      <button type="button" className="btn btn-secondary sm" style={{ alignSelf: "flex-start", borderRadius: 999, borderStyle: "dashed" }} onClick={onSimulate}>Simulate: {INVITE.customerName} requests clarification (demo)</button>
      <button type="button" className="btn btn-secondary sm" style={{ alignSelf: "flex-start", borderRadius: 999 }} onClick={onRestart}>Restart demo</button>
    </Section>
  );
}
