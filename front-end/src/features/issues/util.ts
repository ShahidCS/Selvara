import type { LayerApi } from "@/components/shell/LayerProvider";
import { uiMessage } from "@/lib/grcSod";

/** Run a (possibly async) handler; a refusal shows its own policy text, anything else a generic message (never raw exception text, ASVS 7.4.1). */
export async function attempt(L: LayerApi, fn: () => Promise<void> | void) {
  try { await fn(); } catch (e) { L.toast(uiMessage(e), false); }
}
