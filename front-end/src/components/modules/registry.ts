/* Module registry: route key -> component. One file per module under components/modules. */
import { ComponentType } from "react";
import OverviewModule from "./OverviewModule";
import WorkModule from "./WorkModule";
import ReportsModule from "./ReportsModule";
import FrameworksModule from "./FrameworksModule";
import ControlsModule from "./ControlsModule";
import EvidenceModule from "./EvidenceModule";
import PoliciesModule from "./PoliciesModule";
import AuditsModule from "./AuditsModule";
import IssuesModule from "./IssuesModule";
import PeopleModule from "./PeopleModule";
import AccessModule from "./AccessModule";
import RiskModule from "./RiskModule";
import AiModule from "./AiModule";
import VendorsModule from "./VendorsModule";
import TrustModule from "./TrustModule";
import QuestionnairesModule from "./QuestionnairesModule";
import CommitmentsModule from "./CommitmentsModule";
import IntegrationsModule from "./IntegrationsModule";
import ApiModule from "./ApiModule";
import AssistantModule from "./AssistantModule";
import TeamModule from "./TeamModule";
import BillingWsModule from "./BillingWsModule";
import AuditLogModule from "./AuditLogModule";
import CustomersModule from "./CustomersModule";
import BillingModule from "./BillingModule";
import RatesModule from "./RatesModule";
import MfaModule from "./MfaModule";
import AdminLogModule from "./AdminLogModule";
import AuthModule from "./AuthModule";

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
};
