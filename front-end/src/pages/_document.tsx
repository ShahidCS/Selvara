import { Html, Head, Main, NextScript } from "next/document";
export default function Document() {
  return (
    <Html lang="en" data-theme="auto">
      <Head>
        <meta charSet="utf-8" />
        {/* Geist is self-hosted (CSP font-src 'self'); preloading the sans face avoids a late swap on first paint. */}
        <link rel="preload" href="/fonts/Geist-Variable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </Head>
      <body><Main /><NextScript /></body>
    </Html>
  );
}
