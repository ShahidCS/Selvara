import { useCallback } from "react";
import { useLayer } from "@/hooks/useLayer";
import { bumpData, setModState } from "@/lib/store";
import * as svc from "@/services/people";

/** Prototype: resetUserMfa. Source behaviour kept: no confirmation, no wsLog (see docs/checklist/people.md, Security notes), view switches to "People". */
export function useResetMfa() {
  const L = useLayer();
  return useCallback(async (id: string) => {
    try {
      const r = await svc.resetMfa(id);
      if (!r) { L.toast("Person not found", false); return; }
      L.toast(r.name + "'s MFA reset, they must re-enrol at next sign-in");
      setModState("people.view", "People"); bumpData();
    } catch { L.toast("Could not reset MFA", false); }
  }, [L]);
}
