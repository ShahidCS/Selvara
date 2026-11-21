import type { Tours } from "./types";

/* Guided tours for AI Governance, Third Parties, Trust Center, Questionnaires, Commitments and Security Controls.
   Steps whose element is missing for a role (a create button, the admin or the public Trust Center view, the vendor portal) are skipped by the engine. */
export const TOURS: Tours = {
  ai: {
    version: 1,
    title: "AI governance",
    steps: [
      { target: "main#content h1", title: "Your AI register", body: "This page lists every AI system your company builds or uses, its EU AI Act classification, guardrail and impact assessment." },
      { target: "main#content .kpi-strip", title: "Where you stand", body: "Registered systems, high-risk systems under the EU AI Act, draft classifications still to confirm and discovered AI not yet registered." },
      { target: '[data-tour="ai-register"]', title: "Register a system", body: "Register system adds an AI system and its owner. Registering does not approve it. Admins and owners can register; in the demonstration analysts can too." },
      { target: '[data-tour="ai-inventory"]', title: "AI inventory", body: "Click a row to open the system: classify it, record the impact assessment, bias tests and oversight. Use the tabs, filters and search to narrow the list." },
      { target: '[data-tour="ai-review"]', title: "Who decides", body: "A classification is a draft until an admin or owner other than you and the system owner confirms it. Drafts also need review by qualified compliance and legal staff." },
      { target: '[data-tour="ai-discovered"]', title: "Discovered AI", body: "AI found in use but not registered. Register it to bring it into the inventory, or dismiss it with a reason if it does not need registering." },
      { target: '[data-tour="ai-iso42001"]', title: "ISO/IEC 42001 readiness", body: "Shows how much of the AI management system is in place. Open framework takes you to its controls in Frameworks." },
    ],
  },
  vendors: {
    version: 1,
    title: "Third parties",
    steps: [
      { target: "main#content h1", title: "Your vendor register", body: "Track the third parties your company relies on, their tier, risk score and when each is next due for review." },
      { target: '[data-tour="vendors-tiers"]', title: "Tiers and reviews", body: "Each tier sets the next review date: 12, 24 or 36 months. Click a tier to filter the list; overdue reviews are counted on each card." },
      { target: '[data-tour="vendors-requests"]', title: "New vendor requests", body: "Requests raised from My Work wait here. Someone other than the requester approves them, and a Critical-tier vendor needs a further approval before it is added." },
      { target: '[data-tour="vendors-table"]', title: "Open a vendor", body: "Click a row to open the vendor: record certificates with expiry dates, reassess it, request a waiver or send a questionnaire to its contact." },
      { target: '[data-tour="vendors-add"]', title: "Add a vendor", body: "Admins and owners add a vendor directly here. Others request one from My Work." },
      { title: "Good to know", body: "Risk scores and outcomes are your assessments. Qualified risk staff must review them." },
    ],
  },
  trust: {
    version: 1,
    title: "Your Trust Center",
    steps: [
      { target: "main#content h1", title: "Your Trust Center", body: "Customers find your security, privacy and compliance material here. Admins and owners manage it; customers and vendors see the public page." },
      { target: '[data-tour="trust-resources"]', title: "Documents", body: "Each card is a document. Making one public needs approval from a second admin or owner. Private documents are shared on request under NDA." },
      { target: '[data-tour="trust-publish"]', title: "Publish a resource", body: "Admins and owners add a new document here, then attach its file." },
      { target: '[data-tour="trust-tabs"]', title: "Requests and history", body: "Access & requests lists customers' requests and blocked domains; the person who unblocks a domain cannot approve its requests. Activity and the chatbot follow." },
      { target: '[data-tour="trust-preview"]', title: "See what customers see", body: "Preview the public page: published documents, verified answers, approved vendors that process data and control status." },
      { target: '[data-tour="trust-pub-access"]', title: "Your access", body: "Shows what your company can open. Private documents are shared only under NDA: accept it here. You can also subscribe to updates." },
      { target: '[data-tour="trust-pub-controls"]', title: "Control status", body: "The current status of the security control categories this company publishes." },
      { target: '[data-tour="trust-pub-docs"]', title: "Documents", body: "Public documents open with View. For a private document, click Request; the company approves it before you can open it." },
      { target: '[data-tour="trust-pub-ask"]', title: "Ask a question", body: "Answers come from the published FAQ and verified answers only. Anything else is sent to the security team. For anything binding, request documents under NDA." },
    ],
  },
  questionnaires: {
    version: 1,
    title: "Questionnaires",
    steps: [
      { target: 'main#content:has([data-tour="questionnaires-views"]) h1', title: "Customer questionnaires", body: "Answer the security questionnaires your customers send you, and keep the answers and documents you reuse." },
      { target: '[data-tour="questionnaires-import"]', title: "Import a questionnaire", body: "Import questionnaire adds one a customer sent you. Then record your progress as you answer it." },
      { target: '#qBody .dt:has([aria-label="Questionnaires status"])', title: "Questionnaires in flight", body: "Click a row to open a questionnaire. When every question is answered, submit it for review: an admin or owner who did not work on it approves sending it." },
      { target: '[data-tour="questionnaires-add-answer"]', title: "Add an answer", body: "Add answer puts a reusable question and answer into the library." },
      { target: '#qBody .dt:has([aria-label="Answer library status"])', title: "Answer library", body: "A verified answer is also published to your Trust Center, so someone other than its author verifies it with Verify." },
      { target: '[data-tour="questionnaires-upload"]', title: "Upload a document", body: "Add the policies and reports you quote from to the knowledge base." },
      { target: '[data-tour="questionnaires-views"]', title: "Three views", body: "Switch between In flight, Answer library and Knowledge base, the documents you quote from." },
      { target: '[data-tour="questionnaires-portal"]', title: "Your questionnaire", body: "A customer sent you this questionnaire to answer. The header shows who sent it and how many questions you have answered." },
      { target: '[data-tour="questionnaires-portal-list"]', title: "Pick a questionnaire", body: "You have more than one. Click a questionnaire to open it." },
      { target: "#vq-0", title: "Answer each question", body: "Type your answer under each question. Questions marked with an asterisk are required before you can submit." },
      { target: '[data-tour="questionnaires-portal-submit"]', title: "Save or submit", body: "Save draft keeps your answers so you can come back. Submit sends them to your customer, who can reopen it if they need more." },
    ],
  },
  commitments: {
    version: 1,
    title: "Contract commitments and incidents",
    steps: [
      { target: "main#content h1", title: "What you promised customers", body: "Track the commitments in customer contracts, compare them with your standard terms and run the breach-notification clock during an incident." },
      { target: "main#content .kpi-strip", title: "Summary", body: "How many commitments and standard terms you have, and whether incident mode is on." },
      { target: '[data-tour="commitments-import"]', title: "Import a contract", body: "Admins and owners import each customer contract's key commitment. Someone other than the importer marks it reviewed." },
      { target: '[data-tour="commitments-table"]', title: "Commitments", body: "Search or filter by status to find a commitment and see its detail and review status." },
      { target: '[data-tour="commitments-analysis"]', title: "Contract analysis", body: "Compares commitments with your standard terms and flags any that are stricter. The analysis is a draft for legal review." },
      { target: '[data-tour="commitments-incident"]', title: "Start the incident clock", body: "Start it when a breach is suspected. It shows the 48-hour deadline for notifying customers. Admins and owners start and close it." },
      { target: '[data-tour="commitments-incident-banner"]', title: "Incident mode is on", body: "The banner shows when the clock started and the deadline for notifying affected customers. Close the incident with an outcome once it is resolved." },
    ],
  },
  appsec: {
    version: 1,
    title: "Security controls",
    steps: [
      { target: "main#content h1", title: "Security control reference", body: "This page describes the application security controls the server must enforce. It is reference text: nothing here changes behaviour." },
      { target: '[data-tour="appsec-note"]', title: "Draft for review", body: "Nothing on this page records evidence. The content is a draft that needs review by qualified security staff." },
      { target: '[data-tour="appsec-sections"]', title: "Jump to a section", body: "Go straight to the core rule, responses, control groups, rate limits, permissions or the release gate." },
      { target: '[data-tour="appsec-search"]', title: "Find a control", body: "Search the control groups by threat or term, such as IDOR or CSRF. Expand all opens every group to show its threat, controls, mappings and test." },
      { target: "#appsec-matrix", title: "Permission matrix", body: "Which role the server allows to do what. The rate limits above it are starting values." },
      { target: "#appsec-gate", title: "Release gate", body: "The evidence required before go-live. The ticks are for reading along only: they are not saved, not logged and are not evidence." },
    ],
  },
};
