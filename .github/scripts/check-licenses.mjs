#!/usr/bin/env node
// Licence policy gate.  usage: node check-licenses.mjs <package-lock.json> <license-policy.json>
// Reads the lockfile (no install needed). Fails on: denied licences, licences that are neither allowed nor
// covered by an exception, and exceptions past their review_by date (forces periodic re-approval).
import { readFileSync, appendFileSync } from "node:fs";

const [lockPath, policyPath] = process.argv.slice(2);
if (!lockPath || !policyPath) { console.error("usage: check-licenses.mjs <package-lock.json> <license-policy.json>"); process.exit(2); }
const lock = JSON.parse(readFileSync(lockPath, "utf8"));
const policy = JSON.parse(readFileSync(policyPath, "utf8"));
const today = new Date().toISOString().slice(0, 10);

const globToRe = (g) => new RegExp("^" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
const denyRes = policy.deny.map(globToRe);
const allow = new Set(policy.allow.map((x) => x.toLowerCase()));
const devOnly = new Set(policy.allowDevOnly.map((x) => x.toLowerCase()));
const exceptions = policy.exceptions.map((e) => ({ ...e, re: globToRe(e.package), used: 0, expired: e.review_by < today }));

// SPDX expressions: "A AND B" needs every part acceptable, "A OR B" needs one. Parentheses are flattened.
function parts(expr) {
  const s = String(expr || "UNKNOWN").replace(/[()]/g, " ").trim();
  if (/\bOR\b/.test(s)) return { op: "OR", ids: s.split(/\s+OR\s+/).map((x) => x.trim()) };
  return { op: "AND", ids: s.split(/\s+AND\s+/).map((x) => x.trim()) };
}

const violations = [];
const counts = {};
let total = 0;
for (const [key, pkg] of Object.entries(lock.packages || {})) {
  if (!key) continue; // root
  total++;
  const name = key.replace(/^.*node_modules\//, "");
  const dev = !!pkg.dev;
  const lic = typeof pkg.license === "string" ? pkg.license : pkg.license && pkg.license.type ? pkg.license.type : "UNKNOWN";
  counts[lic] = (counts[lic] || 0) + 1;
  const { op, ids } = parts(lic);

  const verdicts = ids.map((id) => {
    const low = id.toLowerCase();
    const exc = exceptions.find((e) => e.re.test(name) && e.licenses.some((l) => l.toLowerCase() === low));
    if (exc) { exc.used++; return exc.expired ? { ok: false, why: `exception for ${exc.package} expired on ${exc.review_by}` } : { ok: true }; }
    if (denyRes.some((r) => r.test(id))) return { ok: false, why: `denied licence ${id}` };
    if (allow.has(low)) return { ok: true };
    if (dev && devOnly.has(low)) return { ok: true };
    return { ok: false, why: `${id} is not on the allow list${devOnly.has(low) ? " (allowed for dev dependencies only)" : ""}; add a justified, time-boxed exception or remove the package` };
  });
  const pass = op === "OR" ? verdicts.some((v) => v.ok) : verdicts.every((v) => v.ok);
  if (!pass) violations.push(`${name} [${lic}] ${dev ? "dev" : "PROD"}: ${verdicts.filter((v) => !v.ok).map((v) => v.why).join("; ")}`);
}

const summary = [
  `### Licence policy`, ``,
  `${total} packages checked (${policyPath}). ${violations.length ? `**${violations.length} violation(s).**` : "No violations."}`, ``,
  `| Licence | Packages |`, `|---|---|`,
  ...Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`), ``,
  `Exceptions in use: ` + (exceptions.filter((e) => e.used).map((e) => `${e.package} (${e.used}, review by ${e.review_by})`).join(", ") || "none"),
].join("\n");
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n");

const stale = exceptions.filter((e) => e.expired);
if (violations.length || stale.length) {
  if (violations.length) console.error("\nViolations:\n" + violations.map((v) => "  " + v).join("\n"));
  if (stale.length) console.error("\nExpired exceptions:\n" + stale.map((e) => `  ${e.package} (review_by ${e.review_by})`).join("\n"));
  process.exit(1);
}
