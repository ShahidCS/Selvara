import { useRoute } from "@/lib/route";
import { MODULES } from "@/features/registry";

/** /ws/<module>[/<param>] */
export default function WsPage() {
  const { mod, param } = useRoute();
  const C = MODULES[mod];
  return C ? <C param={param} /> : null;
}
