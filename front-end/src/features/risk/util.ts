import type { LayerApi } from "@/components/shell/LayerProvider";
import { uiMessage } from "@/lib/grcSod";

/** Run a (possibly async) handler. A SodError (segregation of duties / role refusal) or a server refusal shows its own message; anything else gets a generic one (ASVS 7.4.1: never raw exception text). */
export async function attemptR(L: LayerApi, fn: () => Promise<void> | void) {
  try { await fn(); } catch (e) { L.toast(uiMessage(e), false); }
}
