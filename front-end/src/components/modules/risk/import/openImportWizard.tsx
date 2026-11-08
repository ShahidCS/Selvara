import type { LayerApi } from "@/components/shell/LayerProvider";

/** Opens the risk import wizard (Excel/CSV -> column mapping -> scale conversion -> row preview).
 *  Interface contract between RiskModule and the wizard. The wizard agent replaces this body. */
export function openImportWizard(L: LayerApi, opts?: { onDone?: () => void }): void {
  L.toast("Import wizard is being migrated"); void opts;
}
