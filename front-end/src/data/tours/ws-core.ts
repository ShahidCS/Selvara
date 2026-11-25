import type { Tours } from "./types";

/* Guided tours for the core workspace modules: Overview, My Work, Reports, Frameworks, Controls & Tests and Evidence.
   Steps whose element is missing for a role (a create button the role cannot use, a tab it is not offered) are skipped by the engine. */
export const TOURS: Tours = {
  overview: {
    version: 1,
    title: "Your security posture at a glance",
    steps: [
      { target: "main#content h1", title: "Your posture this month", body: "This page sums up your frameworks, controls, risks and issues. The figures fill in as your team adds records." },
      { target: "main#content .kpi-strip", title: "Headline figures", body: "Compliance, open risks, failing controls, open issues, audits and vendor reviews. A risk is above appetite when its current score is 11 or more." },
      { target: '[data-tour="overview-panels"]', title: "Risk and readiness", body: "See the open-risk trend, issues by severity and the frameworks with the lowest readiness first. Use the links on each card to open that module." },
      { target: '[data-tour="overview-attention"]', title: "What needs attention", body: "Overdue issues, vendor reviews and audits in progress. Click an item to open its record. For modules your role cannot open you see only totals." },
      { target: '[data-tour="overview-coverage"]', title: "Control coverage", body: "Each cell shows the share of controls passing for that framework and category. A dash means no controls are mapped there yet." },
      { target: '[data-tour="overview-boardpack"]', title: "Board pack", body: "Export board pack builds a draft report for your board. Review it before you share it." },
      { target: '[data-tour="overview-work"]', title: "Where to go next", body: "Open my work lists the tasks, reviews and approvals waiting for you." },
    ],
  },
  work: {
    version: 1,
    title: "Your work",
    steps: [
      { target: "main#content h1", title: "Everything waiting for you", body: "My Work collects what you need to act on: your tasks, policies to read, your account security and approval delegation." },
      { target: 'main#content [role="tablist"]', title: "Sections", body: "Switch between Tasks, Policies, Account security and Delegation here. You see only the sections your role can use." },
      { target: 'main#content [role="tablist"] [role="tab"]:nth-of-type(1)', title: "Tasks", body: "Issues you own, risk treatment actions assigned to you and the reviews and approvals waiting for you, with due dates. Open an item to decide it on its page." },
      { target: 'main#content [role="tablist"] [role="tab"]:nth-of-type(2)', title: "Policies to acknowledge", body: "Policies lists every published policy. Read each one and acknowledge it there; the greeting above counts the ones still to do." },
      { target: 'main#content [role="tablist"] [role="tab"]:nth-of-type(3)', title: "Security and delegation", body: "Check your sign-in and two-step verification under Account security. Admins and owners can delegate approvals to another admin or owner for up to 14 days." },
    ],
  },
  reports: {
    version: 2,
    title: "Reports and schedules",
    steps: [
      { target: "main#content h1", title: "Reports and schedules", body: "Generate draft packs from your current records and schedule them to go out regularly." },
      { target: "main#content .kpi-strip", title: "Figures for the period", body: "Weighted compliance against the 80% target, open issues, failing controls, and how many packs are scheduled and reports you can generate." },
      { target: 'main#content [role="radiogroup"][aria-label="Period"]', title: "Choose the period", body: "7 days, 30 days or the quarter to date. The figures and trends follow it, and the Overview's trend uses the same choice." },
      { target: '[data-tour="reports-charts"]', title: "Charts", body: "Compliance against the target, issues closed and opened, the frameworks furthest from target, and open issues by severity. Hover or tab to a point for its value." },
      { target: '[data-tour="reports-stored"]', title: "Generate a report", body: "Generate now builds a draft pack from your current records. Review it before you share it. The calendar button schedules that report." },
      { target: '[data-tour="reports-new"]', title: "Schedule a pack", body: "A schedule to people in your company saves at once. A schedule to anyone outside it starts only after a different admin approves it." },
      { target: '[data-tour="reports-schedules"]', title: "Scheduled packs", body: "Each pack shows its recipients and next run. Removing or replacing a schedule that sends outside the company needs a reason." },
      { title: "Good to know", body: "Packs are not emailed until your administrator sets up email. Only admins and owners can generate or schedule reports." },
    ],
  },
  frameworks: {
    version: 1,
    title: "Getting started with frameworks",
    steps: [
      { target: "main#content h1", title: "Your framework library", body: "Every standard, framework and regulation you can work towards. Everything starts out of scope." },
      { target: "main#content .kpi-strip", title: "Library summary", body: "How many frameworks are in scope, their average readiness, open gaps (requirements not met or not assessed) and snoozed frameworks." },
      { target: '[data-tour="frameworks-table"]', title: "Find and open a framework", body: "Search, switch kind with the tabs or filter by region. Click a row to see its requirements: each is met when every control mapped to it passes." },
      { target: '[data-tour="frameworks-scope"]', title: "Bring it into scope", body: "Bring in adds a framework to your readiness figures; Take out removes it. Snooze pauses it without scoring it as due." },
      { target: '[data-tour="frameworks-add"]', title: "Add your own", body: "Add framework lets you add your own framework or a regulation: paste its requirements, one per line." },
    ],
  },
  controls: {
    version: 1,
    title: "Getting started with controls",
    steps: [
      { target: "main#content h1", title: "Controls and tests", body: "The controls you run, the tests that check them and how they map across your frameworks." },
      { target: '[data-tour="controls-views"]', title: "Three views", body: "Controls lists your controls, Tests lists the checks behind them and Matrix shows each control's mapping to every framework." },
      { target: '[data-tour="controls-table"]', title: "Find and open a control", body: "Search, filter by framework or use the status tabs. Click a row to open the control, its owner, tests and exceptions." },
      { target: '[data-tour="controls-tests"]', title: "Tests drive status", body: "A person records the result of a manual check, and a control's status follows its tests. Click a test to open it." },
      { target: '[data-tour="controls-add"]', title: "Add controls", body: "Adopt the controls you run from the library, or add your own with Add custom control." },
      { title: "Owners and exceptions", body: "Only a control's owner attests to it or changes its status. An exception needs a compensating control, and another admin or owner approves it." },
      { target: '[data-tour="controls-soa"]', title: "Statement of Applicability", body: "Export SoA downloads your controls as a CSV for your auditor." },
    ],
  },
  evidence: {
    version: 1,
    title: "Getting started with evidence",
    steps: [
      { target: "main#content h1", title: "Your evidence register", body: "The documents and files that show your controls work, each with a version and a review status." },
      { target: "main#content .kpi-strip", title: "Review status", body: "How many items are pending review, accepted or rejected. Pending items need a second person to review them." },
      { target: '[data-tour="evidence-table"]', title: "Find and open evidence", body: "Search, filter by type or collector, or use the review tabs. Click a row to open the item, its file and its history." },
      { target: '[data-tour="evidence-add"]', title: "Add evidence", body: "Attach a PDF, image, office document or text file up to 4 MB. Files are stored privately for your company." },
      { title: "Who reviews", body: "Someone who did not collect, version or attach to it accepts or rejects it with a note. Any change sends it back for review." },
      { title: "Deleting evidence", body: "Deleting evidence needs a second admin's approval and leaves a record of who asked and why." },
    ],
  },
};
