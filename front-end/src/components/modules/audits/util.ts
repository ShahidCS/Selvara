import type { LayerApi } from "@/components/shell/LayerProvider";
import { uiMessage } from "@/lib/grcSod";

/** Run a (possibly async) handler. Policy refusals (SodError) show their message; anything else becomes a generic toast (ASVS 7.4.1). */
export async function attempt(L: LayerApi, fn: () => Promise<void> | void) {
  try { await fn(); } catch (e) { L.toast(uiMessage(e), false); }
}
