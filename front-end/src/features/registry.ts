/* Module registry: route key -> component. One file per module under features/<name>/. */
import { ComponentType } from "react";
import OverviewModule from "./overview/OverviewModule";
import WorkModule from "./work/WorkModule";
import ReportsModule from "./reports/ReportsModule";
import FrameworksModule from "./frameworks/FrameworksModule";
import ControlsModule from "./controls/ControlsModule";
import EvidenceModule from "./evidence/EvidenceModule";
import PoliciesModule from "./policies/PoliciesModule";
import AuditsModule from "./audits/AuditsModule";
import IssuesModule from "./issues/IssuesModule";
import PeopleModule from "./people/PeopleModule";
import AccessModule from "./access/AccessModule";
import RiskModule from "./risk/RiskModule";
import AiModule from "./ai/AiModule";
import VendorsModule from "./vendors/VendorsModule";
import TrustModule from "./trust/TrustModule";
import QuestionnairesModule from "./questionnaires/QuestionnairesModule";
import CommitmentsModule from "./commitments/CommitmentsModule";
import IntegrationsModule from "./integrations/IntegrationsModule";
import ApiModule from "./api/ApiModule";
import AssistantModule from "./assistant/AssistantModule";
import TeamModule from "./team/TeamModule";
import BillingWsModule from "./billingws/BillingWsModule";
import AuditLogModule from "./auditlog/AuditLogModule";
import CustomersModule from "./customers/CustomersModule";
import BillingModule from "./billing/BillingModule";
import RatesModule from "./rates/RatesModule";
import MfaModule from "./mfa/MfaModule";
import AdminLogModule from "./adminlog/AdminLogModule";
import AuthModule from "./auth/AuthModule";
import MeModule from "./me/MeModule";
import ElevationModule from "./elevation/ElevationModule";
import PlatformSecurityModule from "./platformsecurity/PlatformSecurityModule";
import AppSecModule from "./appsec/AppSecModule";

export const MODULES: Record<string, ComponentType<{ param?: string | null }>> = {
  overview: OverviewModule,
  work: WorkModule,
  reports: ReportsModule,
  frameworks: FrameworksModule,
  controls: ControlsModule,
  evidence: EvidenceModule,
  policies: PoliciesModule,
  audits: AuditsModule,
  issues: IssuesModule,
  people: PeopleModule,
  access: AccessModule,
  risk: RiskModule,
  ai: AiModule,
  vendors: VendorsModule,
  trust: TrustModule,
  questionnaires: QuestionnairesModule,
  commitments: CommitmentsModule,
  integrations: IntegrationsModule,
  api: ApiModule,
  assistant: AssistantModule,
  team: TeamModule,
  billingws: BillingWsModule,
  auditlog: AuditLogModule,
  customers: CustomersModule,
  billing: BillingModule,
  rates: RatesModule,
  mfa: MfaModule,
  adminlog: AdminLogModule,
  auth: AuthModule,
  me: MeModule,
  elevation: ElevationModule,
  security: PlatformSecurityModule,
  appsec: AppSecModule,
};
