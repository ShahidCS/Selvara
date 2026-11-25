#!/usr/bin/env node
/* Runs after `next build` (package.json "build"). The production CSP allows scripts and styles from this site only
 * (next.config.js: script-src 'self', style-src 'self'), so a page's server-rendered HTML must not carry:
 *   - an inline script that runs (only <script src> and the JSON data block are allowed),
 *   - a <style> element,
 *   - a style="…" attribute.
 * The browser would block them and the page would break or lose its layout. React style props are fine: the browser applies
 * them after the page loads. Fails the build with the page and the offending markup. No dependencies. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(process.cwd(), ".next", "server", "pages");
const files = [];
const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith(".html")) files.push(p); } };
try { walk(root); } catch { console.error(`check-html: ${root} not found; run next build first`); process.exit(1); }
if (!files.length) { console.error("check-html: no prerendered pages found"); process.exit(1); }

const problems = [];
const clip = (s) => s.replace(/\s+/g, " ").slice(0, 120);
for (const f of files) {
  const html = readFileSync(f, "utf8"); const page = relative(root, f);
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1];
    if (/\bsrc\s*=/.test(attrs)) continue;
    if (/\btype\s*=\s*"application\/(json|ld\+json)"/i.test(attrs) || !m[2].trim()) continue;
    problems.push(`${page}: inline script <script${clip(attrs)}> ${clip(m[2])}`);
  }
  for (const m of html.matchAll(/<style\b[^>]*>/gi)) problems.push(`${page}: <style> element ${clip(m[0])}`);
  for (const m of html.matchAll(/<(\w+)[^>]*?\sstyle\s*=\s*"([^"]*)"/gi)) problems.push(`${page}: style attribute on <${m[1]}> "${clip(m[2])}"`);
}
if (problems.length) {
  console.error(`check-html: ${problems.length} problem(s) the production CSP would block. Move the style into a class (src/styles) or render the element in the browser only.`);
  for (const p of problems.slice(0, 50)) console.error("  " + p);
  process.exit(1);
}
console.log(`check-html: ${files.length} pages, no inline scripts, <style> elements or style attributes.`);
