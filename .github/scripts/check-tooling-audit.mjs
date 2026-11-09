#!/usr/bin/env node
// Guard for the deploy tooling (.github/vercel-cli). usage: node check-tooling-audit.mjs <npm-audit.json> <audit-baseline.json>
// Policy: a CRITICAL advisory always fails. A HIGH advisory fails unless it is in the baseline, and every baseline entry
// has an owner-approved review_by date; past that date the check fails until the entry is re-assessed. Entries that npm no
// longer reports are listed so they can be removed.
import { readFileSync, appendFileSync } from "node:fs";

const [auditPath, basePath] = process.argv.slice(2);
if (!auditPath || !basePath) { console.error("usage: check-tooling-audit.mjs <npm-audit.json> <audit-baseline.json>"); process.exit(2); }
const audit = JSON.parse(readFileSync(auditPath, "utf8"));
const base = JSON.parse(readFileSync(basePath, "utf8"));
const today = new Date().toISOString().slice(0, 10);

const found = new Map(); // advisory id -> { severity, pkg, title }
for (const [name, v] of Object.entries(audit.vulnerabilities || {})) {
  for (const via of v.via || []) {
    if (typeof via !== "object") continue;
    const id = (String(via.url || "").match(/GHSA-[a-z0-9-]+/i) || [`${via.name || name}:${via.source}`])[0].toUpperCase();
    if (via.severity === "high" || via.severity === "critical") found.set(id, { severity: via.severity, pkg: via.name || name, title: via.title || "" });
  }
}
const accepted = new Map((base.accepted || []).map((e) => [e.id.toUpperCase(), e]));
const failures = [];
for (const [id, a] of found) {
  if (a.severity === "critical") { failures.push(`CRITICAL ${id} in ${a.pkg}: ${a.title}`); continue; }
  const e = accepted.get(id);
  if (!e) failures.push(`new HIGH advisory ${id} in ${a.pkg}: ${a.title}`);
  else if (e.review_by < today) failures.push(`baseline entry ${id} (${a.pkg}) expired on ${e.review_by}: re-assess it`);
}
const fixed = [...accepted.keys()].filter((id) => !found.has(id));
const lines = [`### Deploy tooling audit`, ``,
  `${found.size} High/Critical advisory id(s) reported; ${[...found.keys()].filter((id) => accepted.has(id)).length} covered by the accepted baseline; ${failures.length} failure(s).`,
  fixed.length ? `\nNo longer reported (remove from the baseline): ${fixed.join(", ")}` : ""].join("\n");
console.log(lines);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines + "\n");
if (failures.length) { console.error("\n" + failures.map((f) => "  " + f).join("\n")); process.exit(1); }
