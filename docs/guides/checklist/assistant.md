# AI Assistant (Phase 3)

> **Wave D update.** An answer is shown on the AI panel (lavender, "AI-assisted", "Review before you rely on this"). Custom agents, the run log and MCP access are data tables; Create agent is a page (`/ws/assistant/new`). The run decision dialogs and the four-eyes enable and grant approvals are unchanged.

| Source feature | Source lines | React file | Status | Notes |
|---|---|---|---|---|
| Seeds (agents, runs, MCP grants) | 3593-3608 | `src/features/assistant/data/assistantSeed.json`, `features/assistant/services/assistant.ts` | Done | |
| Tabs ask / agents / log / mcp (shared with the sidebar sub-nav) | 3592, 3624-3627 | `AssistantModule.tsx` | Done | `useModState("assistant.view","ask")` via `SUBNAV.assistant`; unknown value -> ask |
| `asstCanManage` (super, admin, owner) | 3609 | `features/assistant/services/assistant.ts` | Done | Others see "View only" and no action buttons |
| `asstMetrics`, `asstDraft` (all canned templates, draft footer) | 3610-3623 | `features/assistant/services/assistant.ts` | Done | Copy verbatim; no model call |
| Ask view: welcome card, thread, suggestion chips, textarea (Cmd/Ctrl+Enter), Draft answer, Clear, "Draft only" note | 3629-3640 | `assistant/AskTab.tsx` | Done | Thread kept in memory only (survives navigation like source); scrolls to bottom on new message |
| Message rendering (user bubble / assistant card with "Draft · review required", Copy, Mark reviewed) | 3658-3661, 3662-3664 | `AskTab.tsx` | Done | React text, `white-space: pre-wrap`. wsLog `assistant.draft.generated` (first 60 chars) and `.reviewed` |
| Custom agents table + Create agent modal | 3641-3644, 3668-3669 | `assistant/Tables.tsx` (`AgentsTab`), `assistant/AgentForm.tsx` | Done | "Agent name is required."; selects checked against allow-lists |
| Run now (switches to Run log; "Suggests only" -> Waiting), Pause/Resume, Delete | 3665-3667 | `Tables.tsx`, `features/assistant/services/assistant.ts` | Done | |
| Run log: waiting banner, Approve / Reject | 3646-3651, 3670 | `Tables.tsx` (`RunLogTab`) | Done | Decision allowed only while "Waiting" |
| MCP access: Grant / Revoke | 3652-3656, 3671 | `Tables.tsx` (`McpTab`) | Done | |

## Open questions
1. "Mark reviewed" only logs and toasts; nothing changes on the message (source).
2. wsLog stores the first 60 chars of the user's prompt (source). Prompts can contain sensitive text.
3. Any manager can approve a run created by their own "Acts" agent; there is no separation of duties (source).
4. Approve/Reject decisions have no confirmation and no undo (source).
5. "Run now" on a Paused agent is allowed (source).
6. The Ask textarea is cleared after sending, also when a suggestion chip is used (source re-rendered the whole body).
7. Input capped at 2000 characters (added, `maxLength` + `clampText`).

## Security notes
UI gate only: `asstCanManage`; the API must authorize agent create/run/delete, run approvals (ideally separate approver) and MCP grants, and log them itself. Prompts and replies are React text only (no HTML, no markdown rendering). Replies are labelled draft / review required and never act. In a real integration treat prompts and any retrieved data as untrusted (prompt injection), keep model credentials server-side, gate every tool call by the MCP grant, and avoid writing prompt contents to the audit log.

## Hardening (docs/security/SOD_MATRIX.md, owner decision 2026-11)
Services throw `SodError`; `wsLog` calls kept; enabling uses `lib/approvals.ts` (`ApprovalsPanel` on the Agents and MCP tabs).

**What changed vs the prototype**
| Area | Prototype | Now |
|---|---|---|
| `asstCanManage` | super, admin, owner | admin, owner (base roles; super has no workspace); services also `assertRole` |
| Approve/Reject an agent run | any manager, no confirmation, even the person who ran it (OQ 3, 4) | approver != the person who triggered the run (`requestedBy`, recorded by "Run now"), admin/owner, confirmation step with a reason (>= 10 chars), decider and reason shown and logged; buttons disabled with the reason |
| Create a custom agent | active at once | created "Pending approval"; enabling needs a different admin/owner (not the creator); cannot run until then |
| Resume a paused agent | immediate | counts as enabling: approval by a different admin/owner; Pause stays immediate |
| Run now | allowed for Paused agents (OQ 5) | only Active agents |
| MCP grant | immediate | Grant is an approval by a different admin/owner; Revoke stays immediate; chip "Grant requested" while pending |

**Resolved open questions (owner decision):** OQ 3 (separation of duties), OQ 4 (confirmation step), OQ 5. Still open: OQ 1, 2, 6, 7.

**Security notes (additions):** agent-triggered seed runs (R1) have no `requestedBy`, so any admin/owner may decide them; the real API must record the triggering identity (human or schedule) and refuse a self-decision. Reasons are written to the audit log: do not put secrets in them.
