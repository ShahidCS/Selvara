/* Guided tours for Policies, Audits, Issues, People & Devices, Access and the Risk Register.
   Steps whose element is missing for a role (create buttons, auditor-only panels, another tab's content) are skipped by the engine. */
import type { Tours } from "./types";

export const TOURS: Tours = {
  policies: {
    version: 1,
    title: "Getting started with policies",
    steps: [
      { target: "main#content h1", title: "Your policy library", body: "Every policy your company keeps lives here, with its version, owner and next review date. Everyone reads and acknowledges published policies." },
      { target: "main#content .kpi-strip", title: "Policy summary", body: "See how many policies are active, which are past their review date and which emergency publications still wait for a second approver." },
      { target: '[data-tour="policies-table"]', title: "Find and open a policy", body: "Filter by status with the tabs, search by ID or name, or filter by owner. Click a row to open the policy, read it and acknowledge it." },
      { target: '[data-tour="policies-add"]', title: "Write a new policy", body: "New policy starts a draft. You become its owner: only you edit its text, and an admin can hand it to someone else." },
      { title: "Approval and versions", body: "Submit a draft for review and name an approver who did not write it. Editing a published policy starts a new draft; the published one stays in force until the new one is published." },
      { title: "Emergency publication", body: "In an emergency an admin can publish at once; another admin or owner must then approve it within 5 business days." },
    ],
  },
  audits: {
    version: 1,
    title: "Running an audit",
    steps: [
      { target: "main#content h1", title: "Audit engagements", body: "Each row is an audit engagement: its framework, auditor, progress and open findings. Requests (PBC), tests and findings live inside it." },
      { target: '[data-tour="audits-auditor-note"]', title: "Your auditor access", body: "As external auditor you see the engagements assigned to you, read-only. You raise information requests and draft findings; management decides on them." },
      { target: "main#content .kpi-strip", title: "Audit summary", body: "Engagements in fieldwork, open findings and evidence requests still outstanding, so you know what to chase." },
      { target: '[data-tour="audits-table"]', title: "Open an engagement", body: "Filter by stage with the tabs or search by name, framework or auditor. Click a row to open the engagement and its requests and findings." },
      { target: '[data-tour="audits-requests"]', title: "Information requests", body: "Go straight to the information requests of your first engagement to raise a new one or follow up on the answers." },
      { target: '[data-tour="audits-add"]', title: "Create an engagement", body: "New audit creates the engagement. Then add the requests your team must provide and give each one an owner from your company." },
      { title: "Auditor access and findings", body: "Send to auditor gives an external auditor access to one engagement until an end date. You accept their findings into issues or decline them with a reason." },
    ],
  },
  issues: {
    version: 1,
    title: "Tracking remediation",
    steps: [
      { target: "main#content h1", title: "Remediation issues", body: "Each issue is a finding that needs fixing, with an owner from your company and a due date. Overdue issues also appear in the bell and on the Overview." },
      { target: "main#content .kpi-strip", title: "Issue summary", body: "Open, overdue, high or critical and in-progress issues at a glance." },
      { target: '[data-tour="issues-table"]', title: "Find and open an issue", body: "Filter by status with the tabs, or by severity and owner. Click a row to open the issue, link controls and risks, and record the root cause." },
      { target: '[data-tour="issues-view"]', title: "Table or Kanban", body: "Switch to Kanban to see issues as cards grouped by status. Click a card to open it." },
      { target: '[data-tour="issues-add"]', title: "Create an issue", body: "New issue records a finding. Give it an owner and a due date." },
      { title: "Closing an issue", body: "Medium and Low issues close directly. A High or Critical issue closes only after someone other than its owner and proposer verifies the fix." },
    ],
  },
  people: {
    version: 1,
    title: "Getting started with people",
    steps: [
      { target: "main#content h1", title: "People and devices", body: "Your company's members and contractors, with their department, device status and two-step verification (MFA) status." },
      { target: "main#content .kpi-strip", title: "Workforce summary", body: "Workforce size, MFA enrolment and device compliance. Device figures appear once a device management integration is connected." },
      { target: '[data-tour="people-tabs"]', title: "People or access grants", body: "People & devices lists who is on record. Access grants shows which systems each person has access to." },
      { target: '[data-tour="people-table"]', title: "Open a person", body: "Search by name, role or department, or filter by department, device and MFA. Click a row to open the person's record." },
      { target: '[data-tour="people-add"]', title: "Add a contractor", body: "Add contractors who do not sign in, so their devices and access are on record too." },
      { target: '[data-tour="people-reset-mfa"]', title: "Reset a lost authenticator", body: "Request an MFA reset with three identity checks and a ticket; the named approver approves it. You cannot reset your own MFA." },
      { title: "Offboarding", body: "Offboarding from a person's record ends their access here at once (a second approver for an admin or owner) and moves what they own to the person you choose." },
    ],
  },
  access: {
    version: 1,
    title: "Getting started with access",
    steps: [
      { target: "main#content h1", title: "Access to your systems", body: "Track who has access to which system, the requests for new access and the periodic reviews that recertify it." },
      { target: '[data-tour="access-views"]', title: "Three views", body: "Account inventory lists current access, Access requests holds the requests and their decisions, and Access reviews runs the recertifications." },
      { target: '[data-tour="access-panel"]', title: "Work through the list", body: "The view you are on shows here: accounts and requests list the user, the system and the access level, and open reviews show their progress." },
      { target: '[data-tour="access-record"]', title: "Record existing access", body: "Record the access people already have in your systems, so it can be reviewed and revoked here." },
      { target: '[data-tour="access-request"]', title: "Request access", body: "Ask for access to a system. An admin or owner who is neither the requester nor the beneficiary decides; admin-level or production access needs a second approver." },
      { target: '[data-tour="access-review-create"]', title: "Run an access review", body: "Create a review, decide Keep or Revoke for each account, then complete it. Nobody decides on their own access." },
      { title: "Decisions and systems", body: "Approving or revoking here records the decision; the system's administrators make the change in the system itself." },
    ],
  },
  risk: {
    version: 1,
    title: "Getting started with the risk register",
    steps: [
      { target: "main#content h1", title: "Your risk register", body: "Identify, score and treat your company's information security risks. Each risk is scored three times: inherent, current and residual." },
      { target: '[data-tour="risk-tabs"]', title: "Five sections", body: "Dashboard shows exposure, Register lists every risk, Scoring Criteria sets the scales, Interested Parties records stakeholders, and Governance holds acceptances and register snapshots." },
      { target: '[data-tour="risk-dash"] .kpi-strip', title: "Risk summary", body: "Open risks, those above appetite, those awaiting approval, valid acceptances and open risks with no control mapped." },
      { target: '[data-tour="risk-heatmap"]', title: "Heat map", body: "Switch between inherent, current and residual ratings. Click a cell to open the register filtered to the risks in it." },
      { target: '[data-tour="risk-treatment"]', title: "Treatment plan", body: "Open treatments by earliest action due date. Click a row to open that risk in the register." },
      { target: '[data-tour="risk-filters"]', title: "Search and filter", body: "Search by ID, title or team, filter by rating, status, category, team or jurisdiction, or show only the risks you own." },
      { target: '[data-tour="risk-table"]', title: "Open a risk", body: "Click a row to open the risk's detail below: its scores, mapped controls, treatment actions and approval." },
      { target: '[data-tour="risk-add"]', title: "Add or import risks", body: "Add a risk, or import your register from Excel or CSV. An import that changes existing risks needs a second admin's approval." },
      { title: "Approval and review", body: "A company admin who did not edit or submit a risk approves it. Scores, acceptances and snapshots are records for your risk process; qualified risk staff must review them." },
    ],
  },
};
