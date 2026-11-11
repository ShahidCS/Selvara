/* Module registry: route key -> component. One file per module under features/<name>/. */
import dynamic from "next/dynamic";
import type { ComponentType } from "react";

type ModuleProps = { param?: string | null };

/* Each module is its own chunk, fetched when its route is first opened, so a page no longer downloads all 29 modules.
   Importing the feature's index (its public API) keeps the lint boundary intact. */
const lazy = (load: () => Promise<ComponentType<ModuleProps>>): ComponentType<ModuleProps> =>
  dynamic<ModuleProps>(load, { loading: () => null });

export const MODULES: Record<string, ComponentType<ModuleProps>> = {
  overview: lazy(() => import("@/features/overview").then((m) => m.OverviewModule)),
  work: lazy(() => import("@/features/work").then((m) => m.WorkModule)),
  reports: lazy(() => import("@/features/reports").then((m) => m.ReportsModule)),
  frameworks: lazy(() => import("@/features/frameworks").then((m) => m.FrameworksModule)),
  controls: lazy(() => import("@/features/controls").then((m) => m.ControlsModule)),
  evidence: lazy(() => import("@/features/evidence").then((m) => m.EvidenceModule)),
  policies: lazy(() => import("@/features/policies").then((m) => m.PoliciesModule)),
  audits: lazy(() => import("@/features/audits").then((m) => m.AuditsModule)),
  issues: lazy(() => import("@/features/issues").then((m) => m.IssuesModule)),
  people: lazy(() => import("@/features/people").then((m) => m.PeopleModule)),
  access: lazy(() => import("@/features/access").then((m) => m.AccessModule)),
  risk: lazy(() => import("@/features/risk").then((m) => m.RiskModule)),
  ai: lazy(() => import("@/features/ai").then((m) => m.AiModule)),
  vendors: lazy(() => import("@/features/vendors").then((m) => m.VendorsModule)),
  trust: lazy(() => import("@/features/trust").then((m) => m.TrustModule)),
  questionnaires: lazy(() => import("@/features/questionnaires").then((m) => m.QuestionnairesModule)),
  commitments: lazy(() => import("@/features/commitments").then((m) => m.CommitmentsModule)),
  integrations: lazy(() => import("@/features/integrations").then((m) => m.IntegrationsModule)),
  api: lazy(() => import("@/features/api").then((m) => m.ApiModule)),
  assistant: lazy(() => import("@/features/assistant").then((m) => m.AssistantModule)),
  team: lazy(() => import("@/features/team").then((m) => m.TeamModule)),
  billingws: lazy(() => import("@/features/billingws").then((m) => m.BillingWsModule)),
  auditlog: lazy(() => import("@/features/auditlog").then((m) => m.AuditLogModule)),
  customers: lazy(() => import("@/features/customers").then((m) => m.CustomersModule)),
  billing: lazy(() => import("@/features/billing").then((m) => m.BillingModule)),
  rates: lazy(() => import("@/features/rates").then((m) => m.RatesModule)),
  mfa: lazy(() => import("@/features/mfa").then((m) => m.MfaModule)),
  adminlog: lazy(() => import("@/features/adminlog").then((m) => m.AdminLogModule)),
  auth: lazy(() => import("@/features/auth").then((m) => m.AuthModule)),
  me: lazy(() => import("@/features/me").then((m) => m.MeModule)),
  elevation: lazy(() => import("@/features/elevation").then((m) => m.ElevationModule)),
  security: lazy(() => import("@/features/platformsecurity").then((m) => m.PlatformSecurityModule)),
  appsec: lazy(() => import("@/features/appsec").then((m) => m.AppSecModule)),
};
