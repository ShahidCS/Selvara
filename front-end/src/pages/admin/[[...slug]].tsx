import { useRoute } from "@/lib/route";
import { MODULES } from "@/components/modules/registry";

/** /admin/<module>[/<param>] */
export default function AdminPage() {
  const { mod, param } = useRoute();
  const C = MODULES[mod];
  return C ? <C param={param} /> : null;
}
