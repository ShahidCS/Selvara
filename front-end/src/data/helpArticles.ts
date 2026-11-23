/* The Help centre's knowledge base (reference review R4). Short guides to how Selvara works, written for the people who use it. Each article
   names the module it is about, so "Open <module>" can take the reader there. Searching scores title, summary, keywords and body. */
export interface HelpArticle { id: string; topic: string; title: string; summary: string; keywords: string[]; open?: { label: string; href: string }; body: (string | string[])[] }

export const HELP_ARTICLES: HelpArticle[] = [
  { id: "first-week", topic: "getting-started", title: "Your first week in Selvara", summary: "Where to start: frameworks, controls, evidence and your own tasks.",
    keywords: ["start", "onboarding", "new", "overview", "begin"], open: { label: "Open the Overview", href: "/ws/overview" },
    body: ["Selvara keeps your security programme in one place: the frameworks you follow, the controls that meet them, the evidence that proves each control works, and the risks, issues and vendors around them.",
      ["Start on the Overview. The focus card shows the single most urgent item, and the posture brief explains what is holding you back.", "Open Frameworks to see how ready you are for each standard you have in scope.", "Open My Work for the tasks, approvals and policy acknowledgements waiting for you.", "Use Help, Take the tour of this page, on any screen for a short guided tour."],
      "Your role decides which modules you can open. If something you need is missing, ask a company admin."] },
  { id: "approvals", topic: "getting-started", title: "Why some changes need a second person", summary: "Four-eyes approval: who can approve what, and why you cannot approve your own request.",
    keywords: ["approve", "approval", "four eyes", "segregation", "sod", "self", "second admin"], open: { label: "Open My Work", href: "/ws/work?tab=tasks" },
    body: ["Changes that carry risk are requested by one person and approved by another. This is segregation of duties: nobody approves their own request.",
      ["Turning AI on, enabling an AI agent or raising its autonomy.", "Closing a High or Critical issue: a verifier who is not the assignee, the owner or the person who proposed it.", "Accepting a risk above appetite, publishing a policy, and inviting or removing people."],
      "Requests wait under My Work, Approvals, and in the approvals pill in the header. A request expires after 24 hours if nobody decides. The approval, the person who decided and their reason are written to the audit log."] },
  { id: "map-controls", topic: "controls-evidence", title: "Map one control to several frameworks", summary: "A control is written once and counts towards every framework it is mapped to.",
    keywords: ["map", "mapping", "framework", "iso", "soc 2", "crosswalk", "control"], open: { label: "Open Controls & Tests", href: "/ws/controls" },
    body: ["Each control carries its mappings to the frameworks in scope, for example ISO/IEC 27001 Annex A and SOC 2 criteria. Test it and attach evidence once; every mapped framework's readiness uses the same result.",
      ["Open the control, then its mappings, to see where it counts.", "A failing control lowers readiness for every framework it is mapped to, so fix shared controls first.", "Add a custom control from Controls & Tests when a framework needs something your library does not cover."]] },
  { id: "evidence", topic: "controls-evidence", title: "Collect and review evidence", summary: "Upload files or connect a source, and know when evidence is due again.",
    keywords: ["evidence", "upload", "file", "pdf", "proof", "expiry", "due", "stale"], open: { label: "Open Evidence", href: "/ws/evidence" },
    body: ["Evidence proves a control works. Each item has an owner, the controls it supports and a date it is next due.",
      ["Attach a file from the evidence record. Files are checked for type and size before they are kept.", "Connected integrations can collect evidence for you.", "Overdue evidence shows on the Overview and in the posture brief as a cause."]] },
  { id: "score-risk", topic: "risk", title: "Score a risk and read the heat map", summary: "Likelihood and impact from 1 to 5, inherent, current and residual scores, and the appetite line.",
    keywords: ["risk", "score", "likelihood", "impact", "heat map", "appetite", "residual", "inherent"], open: { label: "Open the risk register", href: "/ws/risk" },
    body: ["A risk is scored as likelihood times impact, each from 1 (rare, insignificant) to 5 (almost certain, severe).",
      ["Inherent: before any control.", "Current: with today's controls; this is compared with appetite (11).", "Residual: after the treatment you plan."],
      "A risk whose current score is at or above appetite needs treatment actions or an acceptance by the right authority. New risks start as a draft and are submitted for review."] },
  { id: "accept-risk", topic: "risk", title: "Accept a risk", summary: "Who may accept which risk, for how long, and what the Board must see.",
    keywords: ["accept", "acceptance", "board", "authority", "exception", "expiry"], open: { label: "Open the risk register", href: "/ws/risk" },
    body: ["Accepting a risk means you knowingly keep it. The authority needed rises with the residual score, and every acceptance expires and is reviewed again.",
      ["Give a reason and compensating measures.", "Above the Board threshold, record the Board decision; a second person verifies the evidence before the acceptance takes effect.", "A change that raises the risk's score invalidates the acceptance."]] },
  { id: "vendor-review", topic: "vendors", title: "Review a third party", summary: "Tiers, reassessment cadence, questionnaires and the vendor portal.",
    keywords: ["vendor", "third party", "supplier", "tier", "reassess", "questionnaire", "logo", "portal"], open: { label: "Open Third Parties", href: "/ws/vendors" },
    body: ["Each vendor has a tier that sets how often it is reassessed: critical vendors more often than low-risk ones.",
      ["Send a security questionnaire; the vendor answers in the vendor portal after confirming their email address.", "Record the reassessment result on the vendor's page; the next review date follows from the tier.", "You can fill the Add vendor form from a document, and add the vendor's logo on its page."]] },
  { id: "audit-prep", topic: "audits", title: "Prepare for an audit", summary: "Audit stages, requests from the auditor (PBC) and giving auditors read-only access.",
    keywords: ["audit", "auditor", "pbc", "request", "fieldwork", "readiness"], open: { label: "Open Audits", href: "/ws/audits" },
    body: ["An audit moves through Planned, Fieldwork, Reporting and Complete. During fieldwork the auditor sends requests (PBC); each has an owner and a due date.",
      ["The Overview's focus card shows the next audit within 60 days and how many requests are answered.", "External auditors get their own role: they read controls, evidence and policies, and change nothing.", "Close findings as issues, with a verifier for High and Critical ones."]] },
  { id: "ai-drafts", topic: "ai", title: "How AI is used in Selvara", summary: "Facts are computed first; AI only words them, always as a draft you review.",
    keywords: ["ai", "assistant", "draft", "claude", "personal data", "pii", "write with ai"], open: { label: "Open the AI Assistant", href: "/ws/assistant" },
    body: ["Figures, causes and suggested next steps are computed from your records by fixed rules. AI is used only when you ask, to word those facts, and the result is always marked as a draft.",
      ["AI is off until a company admin turns it on and a second admin approves.", "Before anything is sent, a personal-data check runs. By default it blocks the request and says what it found; a company can choose to mask instead, with a second admin's approval.", "Nothing is used for training, questions are not stored, and every request is written to the audit log."]] },
  { id: "agents", topic: "ai", title: "Custom agents and pausing them", summary: "What agents may do on their own, how autonomy is earned, and Pause all agents.",
    keywords: ["agent", "autonomy", "pause", "pause all", "suggests only", "acts", "recertify"], open: { label: "Open Custom agents", href: "/ws/assistant" },
    body: ["Every agent starts at Suggests only: each change it proposes waits for a person. It can be raised to Acts (logged) only with a track record and a second admin's approval, and must be recertified every 90 days.",
      ["Pause one agent from its card or row: it stops at once.", "Pause all agents stops every agent at once. Give a reason; it is written to the audit log, and enable requests already waiting are withdrawn.", "Each agent is resumed on its own, with approval from a different admin."]] },
  { id: "sign-in", topic: "account-security", title: "Sign-in, two-step verification and sessions", summary: "Authenticator codes, recovery codes, passkeys and ending other sessions.",
    keywords: ["sign in", "login", "password", "mfa", "2fa", "authenticator", "recovery", "session", "passkey"], open: { label: "Open Your account", href: "/auth" },
    body: ["Every account uses a password and an authenticator app. Keep your recovery codes somewhere safe: each works once.",
      ["Your account shows your recent sign-ins and the devices signed in. End any session you do not recognise.", "After several wrong attempts an account is locked for a while; your company admin chooses how strict this is.", "Platform super admins sign in with a passkey."]] },
  { id: "invite", topic: "account-security", title: "Invite people and choose their role", summary: "Roles decide which modules a person can open; invitations need approval.",
    keywords: ["invite", "role", "member", "team", "join", "remove", "permission"], open: { label: "Open Team & Rules", href: "/ws/team" },
    body: ["Company admins invite people from Team & Rules. The invitation link works once, for that email address, and expires.",
      ["Pick the narrowest role that lets the person do their job: Employee, Risk analyst, Owner, Auditor or Admin.", "Adding or removing an admin needs a second admin.", "People can also ask to join with your company code; an admin approves each request."]] },
  { id: "billing", topic: "billing", title: "Plans, invoices and payment", summary: "Where to see invoices, change the plan and pay.",
    keywords: ["billing", "invoice", "plan", "payment", "card", "subscription"], open: { label: "Open Billing & Invoices", href: "/ws/billingws" },
    body: ["Company admins see invoices, the current plan and payments under Billing & Invoices.",
      ["A plan change is a request that takes effect at the next period.", "Pay an invoice by card through the payment provider; card details never pass through Selvara.", "Every invoice and payment is in your audit log."]] },
  { id: "ask-support", topic: "other", title: "Ask Selvara support", summary: "When to ask, what to include, and where to read the answer.",
    keywords: ["support", "contact", "question", "help", "ticket", "ask"], open: { label: "Ask a question", href: "/help/ask" },
    body: ["If the guides do not answer your question, ask Selvara support from the Help centre. Your question goes only to Selvara support staff; your colleagues do not see it.",
      ["Describe what you were doing and what you expected. Do not include passwords, codes, personal data or customer data.", "You are told in Selvara when support answers (and by email, when your company has email set up). Read and reply under My questions.", "Close a question once it is solved. You can have up to 10 open at a time."]] },
];

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]+/g, " ");
const STOP = new Set(["how", "do", "does", "can", "the", "an", "to", "of", "in", "on", "for", "is", "it", "my", "we", "our", "what", "why", "when", "where", "and", "or", "with", "from", "this", "that", "be", "are", "you", "your"]);
const words = (s: string) => norm(s).split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));
/** Articles that match the query, best first: a word in the title counts most, then keywords, summary and body. "all" (the search box)
 *  needs every word to match; "any" (suggestions while typing a question) needs at least two words, or one in the title or keywords. */
export function searchArticles(query: string, list: HelpArticle[] = HELP_ARTICLES, mode: "all" | "any" = "all"): HelpArticle[] {
  const q = words(query); if (!q.length) return [];
  const scored = list.map((a) => {
    const title = norm(a.title); const kw = norm(a.keywords.join(" ")); const sum = norm(a.summary); const body = norm(a.body.flat().join(" "));
    let score = 0;
    for (const w of q) {
      const s = (title.includes(w) ? 6 : 0) + (kw.includes(w) ? 4 : 0) + (sum.includes(w) ? 2 : 0) + (body.includes(w) ? 1 : 0);
      if (!s && mode === "all") return { a, score: 0 };
      score += s;
    }
    return { a, score: mode === "any" && score < 8 ? 0 : score };
  });
  return scored.filter((x) => x.score > 0).sort((x, y) => y.score - x.score).map((x) => x.a);
}
export const articleById = (id: string) => HELP_ARTICLES.find((a) => a.id === id) ?? null;
