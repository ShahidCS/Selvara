#!/usr/bin/env node
// Verifies what is actually SHIPPED to browsers/hosting. usage: node check-shipped-artifact.mjs <dir> [<dir> ...]
//
// Why: the licence policy accepts two build-time-only exceptions (LGPL image binaries `@img/sharp-*`, CC-BY data
// `caniuse-lite`) on the grounds that none of their code is part of the deployed artefact. This check turns that
// claim into a verified fact on every build, and also pins the "static site only" invariant:
//   - no node_modules directories, no native addons (*.node), no file or content referring to sharp/libvips
//   - for a Vercel build output (directory name ends in "output"): no `functions` directory, i.e. no server code
//     is shipped. If that ever changes, every dependency in the function bundle needs a licence and security review.
// Vercel's own `diagnostics/` metadata and Next's `cache/` directory are not shipped content and are skipped.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, basename, extname } from "node:path";

const dirs = process.argv.slice(2);
if (!dirs.length) { console.error("usage: check-shipped-artifact.mjs <dir> [<dir> ...]"); process.exit(2); }
const SKIP_DIRS = new Set(["diagnostics", "cache", "trace", "trace-build"]);
const TEXT_EXT = new Set([".js", ".mjs", ".cjs", ".json", ".html", ".css", ".map", ".txt", ".svg", ".xml"]);
const MARKERS = [/sharp-libvips/i, /@img\/sharp/i, /\blibvips\b/i];
const problems = [];
let files = 0;

function walk(dir, root) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      if (name === "node_modules") { problems.push(`${p}: node_modules directory is shipped`); continue; }
      if (/sharp|libvips/i.test(name)) { problems.push(`${p}: directory name refers to sharp/libvips`); continue; }
      walk(p, root);
    } else {
      files++;
      if (extname(name) === ".node") problems.push(`${p}: native addon is shipped`);
      if (/sharp|libvips/i.test(name)) problems.push(`${p}: file name refers to sharp/libvips`);
      if (TEXT_EXT.has(extname(name).toLowerCase()) && st.size < 8 * 1024 * 1024) {
        const text = readFileSync(p, "utf8");
        for (const m of MARKERS) if (m.test(text)) { problems.push(`${p}: content refers to ${m}`); break; }
      }
    }
  }
}

for (const d of dirs) {
  if (!existsSync(d)) { problems.push(`${d}: does not exist (the check fails closed)`); continue; }
  if (/output$/.test(basename(d)) && existsSync(join(d, "functions"))) problems.push(`${join(d, "functions")}: server code is now shipped. Review the licence and security of every dependency in the function bundles, then update this check deliberately.`);
  walk(d, d);
}

if (problems.length) { console.error(`Shipped-artefact check FAILED (${problems.length}):\n` + problems.map((x) => "  " + x).join("\n")); process.exit(1); }
const summary = `Shipped-artefact check OK: ${files} files in ${dirs.join(", ")} (static content only; no node_modules, native addons or sharp/libvips).`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) { import("node:fs").then((fs) => fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n")); }
