/* Server-only. The model client for the AI Assistant and agents (production programme group 6). The key is read from the server's environment
   (ANTHROPIC_API_KEY, added in Vercel by the owner); it never reaches the browser, a log or the database. Calls go straight to the Claude
   Messages API over HTTPS with a plain fetch: the project's dependencies are managed by Dependabot and adding the SDK needs the owner's approval.
   API inputs and outputs are not used to train models under Anthropic's commercial terms; nothing here asks for anything else.
   Every caller runs the PII blocker first and sends only the records the person chose. Prompts and records are treated as untrusted data. */

export interface AiAsk { system: string; messages: { role: "user" | "assistant"; content: string }[]; maxTokens: number }
export interface AiAnswer { text: string; inputTokens: number; outputTokens: number; model: string }
/** The model as the server sees it. Tests use a stand-in; production uses claudeFromEnv. */
export interface AiClient { readonly model: string; ask(a: AiAsk): Promise<AiAnswer> }
/** A refusal or failure the person should see in plain words (never the provider's raw error). */
export class AiUnavailable extends Error {}

const URL_MESSAGES = "https://api.anthropic.com/v1/messages";
export const DEFAULT_MODEL = "claude-opus-5-5";

export function claudeFromEnv(env: Record<string, string | undefined>): AiClient | undefined {
  const key = env.ANTHROPIC_API_KEY; if (!key) return undefined;
  const model = /^claude-[a-z0-9-]{3,60}$/.test(env.SELVARA_AI_MODEL ?? "") ? String(env.SELVARA_AI_MODEL) : DEFAULT_MODEL;
  return {
    model,
    async ask(a) {
      const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 60_000);
      let res: Response;
      try {
        res = await fetch(URL_MESSAGES, {
          method: "POST", signal: ctl.signal,
          headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2026-10-21", "anthropic-beta": "server-side-fallback-2026-07-01" },
          // short drafts: low effort keeps cost and wait down; a declined request is retried server-side on the recommended fallback model
          body: JSON.stringify({ model, max_tokens: a.maxTokens, system: a.system, messages: a.messages, output_config: { effort: "low" }, fallbacks: "default" }),
        });
      } catch { throw new AiUnavailable("The AI service did not answer. Try again in a minute."); }
      finally { clearTimeout(timer); }
      if (res.status === 429) throw new AiUnavailable("The AI service is busy. Try again in a minute.");
      if (!res.ok) throw new AiUnavailable("The AI service could not answer this request. Try again later.");
      const j = (await res.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number }; model?: string };
      if (j.stop_reason === "refusal") throw new AiUnavailable("The AI service declined this request.");
      if (j.stop_reason === "max_tokens") throw new AiUnavailable("The answer was too long and was cut off. Ask a narrower question or attach fewer records.");
      const text = (j.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
      if (!text) throw new AiUnavailable("The AI service returned no answer. Try again.");
      return { text, inputTokens: Number(j.usage?.input_tokens ?? 0), outputTokens: Number(j.usage?.output_tokens ?? 0), model: String(j.model ?? model) };
    },
  };
}
