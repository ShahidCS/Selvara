/* Modules that carry their own in-page tab bar are exposed in the sidebar as accordion parents.
 * The tab lives in module state (useModState key), so the sidebar sub-item and the module's tab bar stay in sync. */
export interface SubNav { stateKey: string; initial: string; items: [string, string][] }
import { API_ON } from "@/lib/rbac";
export const SUBNAV: Record<string, SubNav> = {
  risk: { stateKey: "risk.tab", initial: "dash", items: [["dash", "Dashboard"], ["reg", "Register"], ["crit", "Scoring Criteria"], ["ip", "Interested Parties"], ["gov", "Governance"]] },
  auditlog: { stateKey: "auditlog.view", initial: "log", items: [["log", "Audit log"], ["chain", "Chain integrity"], ["ropa", "RoPA register"], ["exp", "Evidence export"]] },
  assistant: { stateKey: "assistant.view", initial: "ask", items: [["ask", "Ask"], ["agents", "Custom agents"], ["log", "Run log"], ["mcp", "MCP access"], ...(API_ON ? [["settings", "Settings"] as [string, string]] : [])] },
};
