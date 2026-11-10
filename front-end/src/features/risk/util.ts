import type { LayerApi } from "@/components/shell/LayerProvider";
import { SodError } from "@/lib/sod";

/** Run a (possibly async) handler. A SodError (segregation of duties / role refusal) shows its own message; anything else gets a generic one (ASVS 7.4.1: never raw exception text). */
export async function attemptR(L: LayerApi, fn: () => Promise<void> | void) {
  try { await fn(); } catch (e) { L.toast(e instanceof SodError ? e.message : "Something went wrong. Please try again.", false); }
}
