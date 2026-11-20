import Head from "next/head";
import { useRouter } from "next/router";
import { PublicTrustPage } from "@/features/trustpublic";
/** A company's public Trust Center (production, group 8b): no sign-in, no app shell. */
export default function PublicTrust() {
  const { query, isReady } = useRouter();
  return (<><Head><title>Trust Center</title></Head>{isReady ? <PublicTrustPage code={String(query.ref ?? "")} /> : null}</>);
}
