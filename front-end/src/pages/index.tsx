import { useEffect } from "react";
import { useRouter } from "next/router";
import { useApp } from "@/lib/store";
import { landingPath } from "@/lib/rbac";

/** `/` -> the signed-in role's landing page (prototype: landingHash()). */
export default function Home() {
  const router = useRouter(); const role = useApp((s) => s.role); const hydrated = useApp((s) => s.hydrated);
  useEffect(() => { if (hydrated) router.replace(landingPath(role, "ws")); }, [hydrated, role, router]);
  return null;
}
