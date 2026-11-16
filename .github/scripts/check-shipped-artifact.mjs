#!/usr/bin/env node
// Verifies what is actually SHIPPED to browsers/hosting. usage: node check-shipped-artifact.mjs <dir> [<dir> ...]
//
// Why: the licence policy accepts two build-time-only exceptions (LGPL image binaries `@img/sharp-*`, CC-BY data
// `caniuse-lite`) on the grounds that none of their code is part of the deployed artefact. This check turns that
// claim into a verified fact on every build:
//   - no node_modules directories, no native addons (*.node), no file or content referring to sharp/libvips
//   - for a Vercel build output (directory name ends in "output"): server code is limited to the reviewed functions in
//     ALLOWED_FUNCTIONS. Every file a function bundle points to (`filePathMap` in its .vc-config.json, which Vercel
//     uploads with it) gets the same checks, no secret file (`.env`, `.env.*` except `.env.example`) may be included,
//     and every package in the bundle must carry a licence in BUNDLE_LICENCES. A new function, a native addon or a
//     package outside those licences fails the build and needs a licence and security review before this list changes.
// Vercel's own `diagnostics/` metadata and Next's `cache/` directory are not shipped content and are skipped.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, basename, extname, resolve, dirname, relative, sep } from "node:path";

/** Server functions that were reviewed (licences and security of their bundle). Paths relative to `<output>/functions`. */
const ALLOWED_FUNCTIONS = new Set([
  // Production authentication API (front-end/src/pages/api/[...path].ts). Reviewed 2026-11-16: 256 files from next,
  // react, react-dom, styled-jsx, client-only, @swc/helpers, tslib, iceberg-js and @supabase/* (MIT, Apache-2.0, 0BSD);
  // no native addons, no sharp/libvips, no secrets. See docs/security/EXCEPTIONS.md EX-02.
  "api/[...path].func",
]);
/** Licences a package inside a shipped function bundle may carry (permissive only). */
const BUNDLE_LICENCES = new Set(["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "0BSD"]);

const dirs = process.argv.slice(2);
if (!dirs.length) { console.error("usage: check-shipped-artifact.mjs <dir> [<dir> ...]"); process.exit(2); }
const SKIP_DIRS = new Set(["diagnostics", "cache", "trace", "trace-build"]);
const TEXT_EXT = new Set([".js", ".mjs", ".cjs", ".json", ".html", ".css", ".map", ".txt", ".svg", ".xml"]);
const MARKERS = [/sharp-libvips/i, /@img\/sharp/i, /\blibvips\b/i];
const problems = [];
let files = 0;
let bundled = 0;
const functions = [];

/** Checks that apply to any shipped file. */
function checkFile(p, st) {
  const name = basename(p);
  if (extname(name) === ".node") problems.push(`${p}: native addon is shipped`);
  if (/sharp|libvips/i.test(name)) problems.push(`${p}: file name refers to sharp/libvips`);
  if (TEXT_EXT.has(extname(name).toLowerCase()) && st.size < 8 * 1024 * 1024) {
    const text = readFileSync(p, "utf8");
    for (const m of MARKERS) if (m.test(text)) { problems.push(`${p}: content refers to ${m}`); break; }
  }
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      if (name === "node_modules") { problems.push(`${p}: node_modules directory is shipped`); continue; }
      if (/sharp|libvips/i.test(name)) { problems.push(`${p}: directory name refers to sharp/libvips`); continue; }
      walk(p);
    } else {
      files++;
      checkFile(p, st);
    }
  }
}

/** Every `*.func` directory under a Vercel output's `functions` directory, as a path relative to it. */
function findFunctions(root, dir = root, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!statSync(p).isDirectory()) continue;
    if (name.endsWith(".func")) out.push(relative(root, p).split(sep).join("/"));
    else findFunctions(root, p, out);
  }
  return out;
}

/** The package directory and name a bundled file belongs to (last node_modules segment), or null for app code. */
function packageOf(file) {
  const m = /^(.*node_modules\/(@[^/]+\/[^/]+|[^@/][^/]*))(?:\/|$)/.exec(file.split(sep).join("/"));
  return m ? { dir: m[1], name: m[2] } : null;
}

/** Applies the file checks to everything a function bundle points to, and checks each package's licence. */
function checkBundle(fn, funcDir, repoRoot) {
  const cfgPath = join(funcDir, ".vc-config.json");
  if (!existsSync(cfgPath)) { problems.push(`${funcDir}: no .vc-config.json (the check fails closed)`); return; }
  const map = JSON.parse(readFileSync(cfgPath, "utf8")).filePathMap || {};
  const packages = new Map();
  const visit = (src) => {
    const p = resolve(repoRoot, src);
    if (!existsSync(p)) { problems.push(`${fn}: bundled file ${src} does not exist (the check fails closed)`); return; }
    const st = statSync(p);
    if (st.isDirectory()) { for (const n of readdirSync(p)) visit(join(src, n)); return; }
    bundled++;
    const name = basename(p);
    if (/^\.env(\..+)?$/.test(name) && name !== ".env.example") problems.push(`${fn}: secret file ${src} is bundled`);
    if (/sharp|libvips/i.test(src)) problems.push(`${fn}: bundled path ${src} refers to sharp/libvips`);
    checkFile(p, st);
    const pkg = packageOf(src);
    if (pkg) packages.set(pkg.dir, pkg.name);
  };
  for (const src of Object.values(map)) visit(src);
  for (const [dir, name] of packages) {
    const pj = resolve(repoRoot, dir, "package.json");
    let licence = null;
    try { licence = JSON.parse(readFileSync(pj, "utf8")).license ?? null; } catch { /* missing or unreadable: fails below */ }
    if (typeof licence !== "string" || !BUNDLE_LICENCES.has(licence)) problems.push(`${fn}: package ${name} has licence ${JSON.stringify(licence)}, not one of ${[...BUNDLE_LICENCES].join(", ")}`);
  }
}

for (const d of dirs) {
  if (!existsSync(d)) { problems.push(`${d}: does not exist (the check fails closed)`); continue; }
  const fnRoot = join(d, "functions");
  if (/output$/.test(basename(d)) && existsSync(fnRoot)) {
    // The Vercel output sits in <repo>/.vercel/output; bundle paths are relative to <repo>.
    const repoRoot = resolve(dirname(resolve(d)), "..");
    for (const fn of findFunctions(fnRoot)) {
      functions.push(fn);
      if (!ALLOWED_FUNCTIONS.has(fn)) { problems.push(`${join(fnRoot, fn)}: server function not reviewed. Review the licence and security of its bundle, then add it to ALLOWED_FUNCTIONS deliberately.`); continue; }
      checkBundle(fn, join(fnRoot, fn), repoRoot);
    }
  }
  walk(d);
}

if (problems.length) { console.error(`Shipped-artefact check FAILED (${problems.length}):\n` + problems.map((x) => "  " + x).join("\n")); process.exit(1); }
const server = functions.length ? `; reviewed server functions: ${functions.join(", ")} (${bundled} bundled files, permissive licences only)` : "; static content only";
const summary = `Shipped-artefact check OK: ${files} files in ${dirs.join(", ")}${server}; no node_modules directories, native addons, secret files or sharp/libvips.`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) { import("node:fs").then((fs) => fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n")); }
