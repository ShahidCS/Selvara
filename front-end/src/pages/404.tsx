import { Empty } from "@/components/ui";
import { useGo } from "@/lib/route";
export default function NotFound() {
  const go = useGo();
  return <div className="page"><Empty icon="alert" title="Page not found" action={<button className="btn btn-primary" onClick={() => go("/ws/overview")}>Back to Overview</button>}>That route doesn&apos;t exist or has moved.</Empty></div>;
}
