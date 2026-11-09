import type { LayerApi } from "@/components/shell/LayerProvider";
import { riskCanEdit } from "./riskLocal";
import { ImportWizard } from "./ImportWizard";

/** Opens the risk import wizard (Excel/CSV -> column mapping -> scale conversion -> row preview).
 *  Interface contract between RiskModule and the wizard. Source: riskImport() lines 2808-2810. */
export function openImportWizard(L: LayerApi, opts?: { onDone?: () => void }): void {
  if (!riskCanEdit()) { L.toast("You do not have permission to import risks"); return; }
  L.openModal("Import risks from Excel", <ImportWizard L={L} onDone={opts?.onDone} />, undefined, { wide: true });
}
