/* Demo only: the reviews and approvals waiting for the signed-in demo person, shown in My Work and counted by the approvals pill in the header.
   Production counts them on the server (My Work's figures). Synthetic data. */
export const WORK_REVIEWS = [
  { t: "Approve P-006 Acceptable Use & Awareness", m: "Policy review, due this week", sev: "Medium", path: "/ws/policies/P-006", mod: "policies", overdue: false, week: true },
  { t: "Sign off access recertification Q4", m: "Access, due 14d", sev: "Low", path: "/ws/access", mod: "access", overdue: false, week: false },
  { t: "Review AI impact assessment (6.1.4)", m: "ISO 42001, overdue", sev: "High", path: "/ws/ai", mod: "ai", overdue: true, week: false },
];
