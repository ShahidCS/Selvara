/* Guided tours of the Settings group: Integrations, API, AI Assistant, Team & Rules, Billing & Invoices, Audit Logs.
   Targets are `data-tour` hooks in each feature's markup (demo and API variants carry the same hooks); a step whose element is not on the
   page for this role or view is skipped by the engine. */
import type { Tours } from "./types";

export const TOURS: Tours = {
  integrations: {
    version: 1,
    title: "Integrations",
    steps: [
      { target: "main#content h1", title: "Your connected tools", body: "Connect the systems Selvara reads from: identity, cloud, source control and more. Every connector is read-only; Selvara never changes anything there." },
      { target: "main#content .kpi-strip", title: "Connection summary", body: "How many connectors are connected, which need attention, and that access stays read-only and scoped to least privilege." },
      { target: "[data-tour=\"integrations-connectors\"]", title: "Set up a connector", body: "Choose Set up, follow the steps on the provider's side, enter the identifiers and test. A second admin approves before anything is read regularly." },
      { target: "[data-tour=\"integrations-table\"]", title: "Your connections", body: "Search or filter the list, then click a row to open a connection: what it reads, its status and when it last synced." },
      { target: "[data-tour=\"integrations-sync\"]", title: "Sync all", body: "Sync all reads every connected source again now. Each sync updates the automated checks that come from that connection." },
      { title: "Checks feed your controls", body: "On a connection's page, link a check to a control and the control follows its result. Connections bring in employee data (names, emails, MFA status); disconnecting erases it." },
    ],
  },
  api: {
    version: 1,
    title: "API, Webhooks & Custom Tests",
    steps: [
      { target: "main#content h1", title: "Your developer surface", body: "Create API keys to read your registers, send signed events to your systems with webhooks, and turn pushed events into custom tests." },
      { target: "[data-tour=\"api-tabs\"]", title: "Four views", body: "Switch between API keys, Webhooks, Custom tests and the Event stream, which lists recent events pushed to Selvara and deliveries to your webhooks." },
      { target: "[data-tour=\"api-table\"]", title: "Keys, hooks and tests", body: "Each list has a search, and keys and webhooks have status tabs. Admins use the buttons on a row to show a new key or secret once, revoke a key, test or pause a webhook, or run a test." },
      { target: "[data-tour=\"api-add\"]", title: "Add one", body: "This button follows the view: New API key, Add webhook, New custom test or Push test event. A key is shown only once; if it is lost, revoke it and create a new one." },
      { target: "[data-tour=\"api-approvals\"]", title: "Second admin approval", body: "A read/write key and every new webhook wait here until a second admin approves. You cannot approve your own request." },
      { title: "Custom tests", body: "Custom tests turn the events your systems push into Pass or Fail results." },
    ],
  },
  assistant: {
    version: 1,
    title: "AI Assistant",
    steps: [
      { target: "main#content h1", title: "Drafts, not decisions", body: "The Assistant drafts answers and summaries from your workspace. Every answer is a draft for a person to review before anyone relies on it." },
      { target: "[data-tour=\"assistant-views\"]", title: "Assistant views", body: "Ask is where you put questions. Custom agents, Run log and MCP access show the agents, what they did and which tools they may use. Settings, where shown, turns AI on or off." },
      { target: "[data-tour=\"assistant-records\"]", title: "Choose what is sent", body: "Add the records to send with your question. Only those are sent, without owners' names. A PII blocker checks every request and stops it if it finds personal data or a secret." },
      { target: "[data-tour=\"assistant-question\"]", title: "Ask a question", body: "Type your question and select Draft answer, or pick a suggestion. Copy the draft, and mark it reviewed once you have checked it." },
      { target: "[data-tour=\"assistant-create\"]", title: "Create an agent", body: "Agents suggest changes; someone other than the person who ran them approves each one. Grant an agent its tools in MCP access first." },
      { title: "Who approves", body: "Turning AI on and granting agent tools need a second admin. The AI provider does not train on these requests." },
    ],
  },
  team: {
    version: 1,
    title: "Team & Rules",
    steps: [
      { target: "main#content h1", title: "Team & Rules", body: "Manage who is in your company's workspace, what role each person has, and the rules your company works by." },
      { target: "[data-tour=\"team-views\"]", title: "Sections", body: "Each tab is one area: members and invitations, then the settings your company keeps here, such as review cycles, rules, retention or sign-in protection." },
      { target: "[data-tour=\"team-body\"]", title: "Members", body: "On Members, search or filter by workspace role. Change someone's role from their row. Nobody changes their own role: another admin does." },
      { target: "[data-tour=\"team-invite\"]", title: "Invite people", body: "Invite a member by work email and role. The invitation link works once, for that email address only, and expires." },
      { target: "[data-tour=\"team-approvals\"]", title: "Four-eyes approvals", body: "Granting or inviting an admin or owner needs a second admin's approval. Pending requests show here; nobody approves their own request." },
      { title: "Changes are recorded", body: "Role changes and invitations are recorded in the Audit Logs with who made them." },
    ],
  },
  billingws: {
    version: 1,
    title: "Billing & Invoices",
    steps: [
      { target: "main#content h1", title: "Your billing", body: "Your plan, invoices and payments, as the Selvara billing team keeps them for your company." },
      { target: "main#content .kpi-strip", title: "Billing summary", body: "Your plan, seats used against the plan's limit, the next billing period and how many invoices are still open." },
      { target: "[data-tour=\"billingws-subscription\"]", title: "Subscription", body: "Your plan, billing cycle and how you pay." },
      { target: "[data-tour=\"billingws-invoices\"]", title: "Invoices", body: "Filter by status and download any invoice. Pay open invoices by bank transfer with the invoice number as the reference, or by card where Pay is shown." },
      { target: "[data-tour=\"billingws-plan\"]", title: "Change your plan", body: "Ask for a different plan here. The Selvara team accepts or declines it, and an accepted change applies from your next period." },
    ],
  },
  auditlog: {
    version: 1,
    title: "Audit Logs",
    steps: [
      { target: "main#content h1", title: "Your company's audit log", body: "Every change in your workspace is recorded here, with who did it and when. Entries cannot be edited or deleted." },
      { target: "[data-tour=\"auditlog-status\"]", title: "Chain status", body: "Each entry is sealed in a hash chain with the one before it. This shows whether the chain is intact and how many entries it holds." },
      { target: "[data-tour=\"auditlog-views\"]", title: "Four views", body: "Audit log lists the entries. Chain integrity verifies the chain, RoPA register shows the processing activities, and Evidence export builds a package for auditors." },
      { target: "[data-tour=\"auditlog-body\"]", title: "Search the log", body: "Use the category tabs and search to find an entry by actor, action or target. Click a RoPA tag to open its processing activity." },
      { target: "[data-tour=\"auditlog-export\"]", title: "Export", body: "Export the log or the RoPA register as JSON or CSV. Every export is recorded." },
      { title: "Before an audit", body: "Verify the chain in Chain integrity, then generate an evidence package in Evidence export. The RoPA register is a reference to confirm with your DPO." },
    ],
  },
};
