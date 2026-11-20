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
  overview: {
    title: "Your security posture at a glance",
    steps: [
      "The figures come from your frameworks, controls, risks and issues. They fill in as your team adds them.",
      "Above appetite means an open risk whose current score is 11 or more.",
      "Export board pack builds a draft report for your board. Review it before you share it.",
    ],
    note: "You see the detail of the modules your role can open. For the others you see only totals.",
  },
  work: {
    title: "Your work",
    steps: [
      "This page lists issues you own and risk treatment actions assigned to you, with their due dates.",
      "Reviews and approvals lists the decisions waiting for you. Open an item to decide it on its page.",
      "Use Request access or Request a new vendor to ask the right team without email.",
    ],
  },
  risk: {
    title: "Getting started with the risk register",
    steps: [
      "Add a risk, or import your existing register from Excel or CSV. An import that changes existing risks needs a second admin's approval.",
      "Score each risk three times: inherent, current and residual. Map at least one control, then submit it for approval.",
      "A company admin who did not edit or submit the risk approves it.",
      "To accept a risk, name an authority senior enough for its residual rating. Above 15 you need Board evidence, and a second person verifies it.",
      "Close a risk once its treatment actions are done or cancelled. The person who closes it cannot be its last editor.",
    ],
    note: "Scores, acceptances and snapshots are records for your risk process. Qualified risk staff must review them.",
  },
  issues: {
    title: "Tracking remediation",
    steps: [
      "Create an issue for each finding that needs fixing. Give it an owner from your company and a due date.",
      "Overdue issues appear in the bell and on the Overview.",
      "Medium and Low issues close directly. A High or Critical issue closes only after someone other than its owner and proposer verifies the fix.",
      "Link the controls and risks an issue affects. Record the root cause and the corrective action.",
    ],
  },
  reports: {
    title: "Reports and schedules",
    steps: [
      "Generate now builds a draft pack from your current records. Review it before you share it.",
      "A schedule to people in your company saves at once. A schedule to anyone outside it starts only after a different admin approves it.",
      "Removing or replacing a schedule that sends outside the company needs a reason.",
    ],
    note: "Packs are not emailed until your administrator sets up email.",
  },
  vendors: {
    title: "Managing third parties",
    steps: [
      "Requests for new vendors from My Work appear here. Someone other than the requester approves them. A Critical vendor needs two approvers.",
      "Each vendor gets a next review date from its tier: 12, 24 or 36 months. Overdue reviews show in the bell and on the Overview.",
      "Record certificates with their expiry dates. They turn Expiring at 60 days and Expired by themselves. A waiver needs a second person and ends on its date.",
      "Send questionnaire goes to the vendor's contact. Invite them in Team & Settings with the Vendor role. They answer in their own workspace.",
    ],
    note: "Risk scores and outcomes are your assessments. Qualified risk staff must review them.",
  },
  questionnaires: {
    title: "Answering customer questionnaires",
    steps: [
      "Import a questionnaire, then record your progress as you answer it.",
      "When every question is answered, submit it for review. An admin or owner who did not work on it approves sending it.",
      "Build the answer library. A verified answer is also published to your Trust Center, so someone other than its author verifies it.",
      "Keep the documents you quote from in the knowledge base.",
    ],
  },
  trust: {
    title: "Your Trust Center",
    steps: [
      "Add documents and attach their files. A public document needs a second admin or owner to approve it. Others are shared on request under NDA.",
      "Customers' access requests wait under Access & requests. Approving one gives their company access, and they open documents after accepting the NDA.",
      "Block domains you never want to approve. The person who unblocks a domain cannot approve its requests.",
      "The public page shows your company's own records: verified answers, approved vendors that process data, and control status.",
    ],
    note: "The public page for anonymous visitors opens once email is set up, because visitors must verify their address first.",
  },
  commitments: {
    title: "Contract commitments and incidents",
    steps: [
      "Import each customer contract's key commitment. Someone other than the importer marks it reviewed.",
      "Run contract analysis to compare commitments with your standard terms. It flags any commitment stricter than the standard.",
      "Start the incident clock when a breach is suspected. It shows the 48-hour deadline for notifying customers. Close it with an outcome.",
    ],
    note: "The analysis is a draft for legal review.",
  },
};
