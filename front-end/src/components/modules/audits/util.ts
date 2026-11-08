import type { LayerApi } from "@/components/shell/LayerProvider";

/** Run a (possibly async) handler; never surface raw exception text (ASVS 7.4.1). */
export async function attempt(L: LayerApi, fn: () => Promise<void> | void) {
  try { await fn(); } catch { L.toast("Something went wrong. Please try again.", false); }
}
