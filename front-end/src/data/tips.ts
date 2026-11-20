/* In-product guidance for production workspaces (owner decision, PRODUCTION_PROGRAMME.md section 1: "plus tips to help people find their
   way"). Shown on a module's page until the person dismisses it, and again from the page's "How this works" button. Plain steps, no marketing. */
export interface ModuleTipText { title: string; steps: string[]; note?: string }
export const MODULE_TIPS: Record<string, ModuleTipText> = {
  frameworks: {
    title: "Getting started with frameworks",
    steps: [
      "Bring the frameworks you work towards into scope with the Scope button. Everything starts out of scope.",
      "Open a framework to see its requirements. Each requirement is met when every control mapped to it passes.",
      "Map your controls to requirements, or mark a requirement not applicable with a justification your auditor can review.",
      "Add your own framework or a regulation with Add framework: paste its requirements, one per line.",
    ],
    note: "Requirement titles are paraphrased and mappings are drafts until qualified compliance staff review them.",
  },
  controls: {
    title: "Getting started with controls",
    steps: [
      "Adopt the controls you run from the library (Adopt from library), or add your own.",
      "Give each control an owner. Only the owner attests to it or changes its status.",
      "Link a test: a person records the result of a manual check, and the control's status follows its tests.",
      "When a control cannot pass for a while, request an exception with a compensating control; another admin or owner approves it.",
    ],
  },
  evidence: {
    title: "Getting started with evidence",
    steps: [
      "Add evidence and attach the file (PDF, image, office document or text, up to 4 MB). Files are stored privately for your company.",
      "Someone who did not collect, version or attach to it reviews it: Accept or Reject with a note.",
      "Any change sends it back for review. Deleting evidence needs a second admin's approval and leaves a record of who and why.",
    ],
  },
};
