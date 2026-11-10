/* Module registry: route key -> component. One file per module under features/<name>/. */
import { ComponentType } from "react";
import { OverviewModule } from "@/features/overview";
import { WorkModule } from "@/features/work";
import { ReportsModule } from "@/features/reports";
import { FrameworksModule } from "@/features/frameworks";
import { ControlsModule } from "@/features/controls";
import { EvidenceModule } from "@/features/evidence";
import { PoliciesModule } from "@/features/policies";
import { AuditsModule } from "@/features/audits";
import { IssuesModule } from "@/features/issues";
import { PeopleModule } from "@/features/people";
import { AccessModule } from "@/features/access";
import { RiskModule } from "@/features/risk";
import { AiModule } from "@/features/ai";
import { VendorsModule } from "@/features/vendors";
import { TrustModule } from "@/features/trust";
import { QuestionnairesModule } from "@/features/questionnaires";
import { CommitmentsModule } from "@/features/commitments";
import { IntegrationsModule } from "@/features/integrations";
import { ApiModule } from "@/features/api";
import { AssistantModule } from "@/features/assistant";
import { TeamModule } from "@/features/team";
import { BillingWsModule } from "@/features/billingws";
import { AuditLogModule } from "@/features/auditlog";
import { CustomersModule } from "@/features/customers";
import { BillingModule } from "@/features/billing";
import { RatesModule } from "@/features/rates";
import { MfaModule } from "@/features/mfa";
import { AdminLogModule } from "@/features/adminlog";
import { AuthModule } from "@/features/auth";
import { MeModule } from "@/features/me";
import { ElevationModule } from "@/features/elevation";
import { PlatformSecurityModule } from "@/features/platformsecurity";
import { AppSecModule } from "@/features/appsec";

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
