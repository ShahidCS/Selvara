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
  policies: {
    title: "Getting started with policies",
    steps: [
      "Write a policy with New policy. You become its owner: only you edit its text, and an admin can hand it to someone else.",
      "Submit it for review and name an approver: an admin or owner who did not write it. They approve it with an effective date, then publish it.",
      "Once published, everyone reads and acknowledges it from the policy or from My workspace; the acceptance count shows who has.",
      "Editing a published policy starts a new draft version; the published one stays in force until the new one is published.",
    ],
    note: "In an emergency an admin can publish at once; another admin or owner must then approve it within 5 business days.",
  },
  people: {
    title: "Getting started with people",
    steps: [
      "Your company's members appear here with their two-step verification status. Add contractors who do not sign in.",
      "A member who lost their authenticator: an admin requests an MFA reset with three identity checks and a ticket; the named approver approves it.",
      "Offboarding ends their access here at once (a second approver for an admin or owner) and moves what they own to the person you choose.",
    ],
    note: "Device posture appears once a device management integration is connected.",
  },
  access: {
    title: "Getting started with access",
    steps: [
      "Record the access people already have in your systems (Record existing access), or let them request it.",
      "An admin or owner who is neither the requester nor the beneficiary decides; admin-level or production access needs a second approver.",
      "Run an access review to recertify accounts: decide Keep or Revoke for each, then complete it. Nobody decides on their own access.",
    ],
    note: "Approving or revoking here records the decision; the system's administrators make the change in the system itself.",
  },
  me: {
    title: "Your workspace",
    steps: [
      "My tasks lists what is waiting on you: policies to read and acknowledge, and policies you are the named approver of.",
      "Admins and owners can delegate their approvals to another admin or owner while away (up to 14 days).",
    ],
  },
};
