import type { Tours } from "./types";

/* Admin Console tours (platform super admins and support). Every page here is read-only until an elevated session starts, so most tours point
   at the elevation banner, which shows the current state and, for super admins, the "Elevate to make changes" button. Support never elevates. */
const H1 = "main#content h1";
const ELEV = 'main#content .banner.info[role="status"]';
const KPIS = "main#content .kpi-strip";

export const TOURS: Tours = {
  customers: {
    version: 1,
    title: "Customers and usage",
    steps: [
      { target: H1, title: "Customer companies", body: "This page shows the customer companies on the platform. Platform staff can browse it; every change needs an elevated session." },
      { target: ELEV, title: "Read-only until you elevate", body: "This banner shows whether you can make changes. Super admins start an elevated session with Elevate to make changes; support accounts browse only." },
      { target: '[data-tour="customers-search"]', title: "Find a customer", body: "Type a name, customer ID or billing email and pick a match. Nothing is shown until you select a customer." },
      { target: '[data-tour="customers-tabs"]', title: "Profile tabs", body: "Switch between the overview, plan and modules, users and the usage breakdown. Each usage figure is measured against its own plan limit." },
      { target: '[data-tour="customers-views"]', title: "Companies, requests, support", body: "Companies lists every company. Requests holds the create, suspend and reactivate requests. Support access opens read-only sessions where a company gave a grant." },
      { target: '[data-tour="customers-create"]', title: "Request a new company", body: "Enter the company name, its code and the first admin's work email. Nothing is created until another platform super admin approves it under Requests." },
      { target: '[data-tour="customers-onboard"]', title: "Onboard a customer", body: "Opens the onboarding form for a new customer. It stays disabled until you have an elevated session." },
    ],
  },
  billing: {
    version: 1,
    title: "Billing",
    steps: [
      { target: H1, title: "Customer billing", body: "Billing accounts, invoices and payments for each customer company. Amounts are drafts for finance review." },
      { target: ELEV, title: "Read-only until you elevate", body: "Every billing change needs an elevated session, a reason and a ticket. Until then the buttons on this page stay disabled." },
      { target: KPIS, title: "Billing at a glance", body: "The tiles count accounts and invoices that still need attention. A past-due count means an invoice is unpaid and needs follow-up." },
      { target: '[data-tour="billing-table"]', title: "Open a customer", body: "Search the list and click a customer to see its plan, contact, currency, tax, balance and invoices." },
      { target: '[data-tour="billing-views"]', title: "Invoices, ledger, requests", body: "Switch to invoices, the ledger of payments and credits, plan requests from company admins, the price list, or Requests waiting for a second super admin." },
      { target: '[data-tour="billing-issue"]', title: "Issue invoices", body: "Invoices each account's periods that have started, with today's rate and tax locked in. Refresh the exchange rates first: reference values are never used for an invoice." },
      { title: "A second super admin approves", body: "Payments, credits and refunds above USD 1,000, and every write-off, need a second super admin's approval. Nobody approves their own request." },
    ],
  },
  rates: {
    version: 1,
    title: "Exchange rates and tax",
    steps: [
      { target: H1, title: "Rates used on invoices", body: "Exchange rates per 1 USD and tax by country. Tax rates are reference values: finance confirms them before they are used." },
      { target: ELEV, title: "Read-only until you elevate", body: "Refreshing, releasing, rejecting and editing rates need an elevated session. Support accounts browse only." },
      { target: KPIS, title: "Held rates first", body: "Held for review counts rates that moved more than 3 %, where the two feeds disagree by more than 1 %, or older than 48 hours." },
      { target: '[data-tour="rates-table"]', title: "Rates and tax by country", body: "Search by country or currency and filter by region or status. Super admins release or reject a held rate from its row." },
      { target: '[data-tour="rates-refresh"]', title: "Refresh rates", body: "Reads two public feeds and compares them. A rate that fails the checks is held for you to release or reject." },
      { title: "Four-eyes on rates", body: "Releasing a held rate and every override need a second super admin. Rejecting a held rate keeps the rate in force. The rate on the issue date is locked into each invoice." },
    ],
  },
  mfa: {
    version: 1,
    title: "MFA resets",
    steps: [
      { target: H1, title: "Reset a lost second factor", body: "Reset multi-factor authentication for a customer's admin who lost their authenticator. Each reset needs identity checks and a second approver." },
      { target: ELEV, title: "Elevation for super admins", body: "Super admins elevate before they raise or decide a reset. Support can raise a request but never approve one." },
      { target: '[data-tour="mfa-admins"]', title: "Request a reset", body: "Find the admin and request a reset from their row. Confirm all three identity checks, pick a reason, add a ticket and name the second approver." },
      { title: "The named approver decides", body: "Only the named platform super admin approves or rejects a reset, never the requester or the person being reset. The requester can withdraw it." },
      { target: '[data-tour="mfa-views"], [data-tour="mfa-history"]', title: "Requests and history", body: "Open requests wait for the named approver. Decided, withdrawn and expired resets stay in the history." },
      { target: '[data-tour="mfa-log"]', title: "Check the audit trail", body: "Every request and decision is recorded. Open the Admin Audit Log to review them." },
    ],
  },
  adminlog: {
    version: 1,
    title: "Admin audit log",
    steps: [
      { target: H1, title: "What administrators did", body: "An append-only record of platform administrator actions. Entries are never edited or deleted." },
      { target: KPIS, title: "Log at a glance", body: "Shows the number of entries, whether the hash chain is intact, the tenants touched and the latest event." },
      { target: '[data-tour="adminlog-table"]', title: "Search the log", body: "Search by actor, action or object and use the filters to narrow the list. Export the rows from the table when you need them." },
      { target: '[data-tour="adminlog-chain"]', title: "Chain check", body: "Each entry hashes the one before it. A broken chain means an entry was changed or removed after it was written." },
      { target: '[data-tour="adminlog-views"]', title: "Chain, RoPA and exports", body: "Chain integrity verifies every link, the RoPA register maps entries to GDPR Article 30 activities, and Evidence export builds a package for auditors." },
      { target: '[data-tour="adminlog-export"]', title: "Export entries", body: "Download the log as JSON or CSV. On the RoPA register tab these buttons export the register instead." },
    ],
  },
  elevation: {
    version: 1,
    title: "Elevated access",
    steps: [
      { target: H1, title: "Elevate before you change", body: "Admin Console pages are read-only until you start an elevated session. It is time-boxed, one at a time, and recorded with its reason and ticket." },
      { target: ELEV, title: "Your current state", body: "Shows whether this session is elevated. Without an elevation, changes across the console stay disabled and the services refuse them." },
      { target: '[data-tour="elevation-request"]', title: "Request elevation", body: "Super admins give a reason of at least 15 characters, a ticket such as SEC-1234 and a duration of 60 minutes at most. Support cannot elevate." },
      { target: '[data-tour="elevation-grants"]', title: "Customer support grants", body: "Customers approve these read-only, expiring grants. They are the only route to a customer's workspace content. This list is read-only." },
      { title: "End it when done", body: "End the elevation as soon as your change is made. It also ends on its own at the time shown." },
    ],
  },
  security: {
    version: 1,
    title: "Platform security",
    steps: [
      { target: H1, title: "Sign-in blocks and rules", body: "Sign-in blocking and the platform's security rules. The rules describe policy the server enforces; nothing on this page is configurable." },
      { target: ELEV, title: "Read-only until you elevate", body: "Lifting a block needs an elevated session. Support accounts can see the blocks but not lift them." },
      { target: '[data-tour="security-blocks"]', title: "Blocked sign-in addresses", body: "Addresses blocked after repeated failed sign-ins. Every block ends on its own; only an elevated super admin can lift one early, with a reason." },
      { target: '[data-tour="security-rules"]', title: "Security rules", body: "The password, authentication and privileged-access rules for every tenant and for this console. They are read-only." },
      { title: "Lifts are recorded", body: "Each lifted block is recorded in the audit log with your reason. Review it under Admin Audit Log." },
    ],
  },
};
