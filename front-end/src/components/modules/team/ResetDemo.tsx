import { LayerFoot } from "@/components/shell/LayerProvider";
import type { LayerApi } from "@/hooks/useLayer";
import { resetPersisted } from "@/lib/store";

/** Prototype: resetDemo. Clears the persisted UI preferences (role/theme/collapsed only) and does a full reload at a fixed in-app path
 *  (a reload also re-seeds the in-memory DATA). No user-controlled value reaches the URL. */
export function resetDemo() {
  resetPersisted();
  window.location.assign("/ws/overview");
}
function ResetBody({ close }: { close: () => void }) {
  return (
    <>
      <p style={{ margin: "0 0 4px" }}>This clears locally saved view state (role, theme, layout) and reloads the prototype with the seeded data set.</p>
      <p className="sub" style={{ margin: 0 }}>Synthetic demo content only. No real records are affected.</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={resetDemo}>Reset</button></LayerFoot>
    </>
  );
}
/** Prototype: confirmReset. Exported for the Audit Logs module (Phase 4), the only place the source shows the "Reset demo data" button. */
export function openConfirmReset(L: LayerApi) {
  L.openModal("Reset demo data", (close) => <ResetBody close={close} />);
}
