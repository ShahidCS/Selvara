import type { AppProps } from "next/app";
import Head from "next/head";
import "@/styles/globals.css";
import { AppShell } from "@/components/shell/AppShell";
import { useEffect } from "react";
import { installSubmitGuard } from "@/lib/submitGuard";

export default function App({ Component, pageProps }: AppProps) {
  // EDGE-11: a button that started a save cannot send it again until the save ends (every page, every button).
  useEffect(() => installSubmitGuard(document), []);
  return (
    <>
      <Head>
        <title>Selvara</title>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <AppShell><Component {...pageProps} /></AppShell>
    </>
  );
}
