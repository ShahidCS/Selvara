import { useCallback } from "react";
import { useLayer } from "@/hooks/useLayer";
import { bumpData, setModState } from "@/lib/store";
import * as svc from "@/services/people";
import { wsLog } from "@/lib/audit";

/** Prototype: resetUserMfa. Source behaviour kept: no confirmation; view switches to "People". Security hardening: the source wrote no audit entry for an MFA reset, so one is added (ASVS 7.2.1). */
export function useResetMfa() {
  const L = useLayer();
  return useCallback(async (id: string) => {
    try {
      const r = await svc.resetMfa(id);
      if (!r) { L.toast("Person not found", false); return; }
      wsLog("person.mfa.reset", r.name, "Access");
      L.toast(r.name + "'s MFA reset, they must re-enrol at next sign-in");
      setModState("people.view", "People"); bumpData();
    } catch { L.toast("Could not reset MFA", false); }
  }, [L]);
}
