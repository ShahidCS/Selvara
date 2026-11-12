import { useCallback } from "react";
import { useGo } from "@/lib/route";

/** Returns `(controlId) => void` that opens the control's page (`/ws/controls/:id`). */
export function useOpenControl() {
  const go = useGo();
  return useCallback((id: string) => go(`/ws/controls/${encodeURIComponent(id)}`), [go]);
}
