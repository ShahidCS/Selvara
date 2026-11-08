import type { AppProps } from "next/app";
import Head from "next/head";
import "@/styles/globals.css";
import { AppShell } from "@/components/shell/AppShell";

export default function App({ Component, pageProps }: AppProps) {
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
