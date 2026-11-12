import { useCallback } from "react";
import { useGo } from "@/lib/route";

/** Returns `(personId) => void` that opens the person's page (`/ws/people/:id`). */
export function useOpenPerson() {
  const go = useGo();
  return useCallback((id: string) => go(`/ws/people/${encodeURIComponent(id)}`), [go]);
}
