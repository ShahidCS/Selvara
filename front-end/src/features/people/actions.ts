import { createElement, useCallback } from "react";
import { useLayer } from "@/hooks/useLayer";
import { MemberResetForm } from "@/features/mfa";

/** Reset MFA for a member: opens the request form (3 identity checks, ticket, reason, named approver). The reset is applied only after approval (services/people.ts). */
export function useResetMfa() {
  const L = useLayer();
  return useCallback((id: string) => {
    L.openModal("Request MFA reset", (close) => createElement(MemberResetForm, { personId: id, close }));
  }, [L]);
}
