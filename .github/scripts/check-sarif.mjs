#!/usr/bin/env node
// Gate for SARIF results when GitHub code scanning is unavailable (private repository without Advanced Security).
// Fails when any result is High or Critical: CodeQL "security-severity" >= 7.0, or level "error" when no
// severity is given. Writes a table to the job summary.
//   node check-sarif.mjs <directory-or-file> [...]
import { readdirSync, readFileSync, statSync, appendFileSync } from "node:fs";
import { join } from "node:path";

const files = [];
const walk = (p) => {
  if (statSync(p).isDirectory()) readdirSync(p).forEach((f) => walk(join(p, f)));
  else if (/\.sarif$/.test(p)) files.push(p);
};
process.argv.slice(2).forEach(walk);
if (!files.length) { console.error("No SARIF files found: failing closed."); process.exit(1); }

const blocking = [];
let total = 0;
for (const f of files) {
  const sarif = JSON.parse(readFileSync(f, "utf8"));
  for (const run of sarif.runs || []) {
    const rules = new Map();
    for (const r of run.tool?.driver?.rules || []) rules.set(r.id, r);
    for (const res of run.results || []) {
      total++;
      const rule = rules.get(res.ruleId);
      const sev = parseFloat(rule?.properties?.["security-severity"] ?? res.properties?.["security-severity"]);
      const level = res.level || rule?.defaultConfiguration?.level || "warning";
      const high = Number.isFinite(sev) ? sev >= 7.0 : level === "error";
      if (high) {
        const loc = res.locations?.[0]?.physicalLocation;
        blocking.push({ id: res.ruleId, sev: Number.isFinite(sev) ? sev : level, where: `${loc?.artifactLocation?.uri ?? "?"}:${loc?.region?.startLine ?? "?"}`, msg: (res.message?.text || "").slice(0, 160) });
      }
    }
  }
}

const lines = [`### SARIF gate`, `${total} result(s), ${blocking.length} High or Critical.`];
if (blocking.length) {
  lines.push("", "| Rule | Severity | Location | Message |", "|---|---|---|---|", ...blocking.map((b) => `| ${b.id} | ${b.sev} | ${b.where} | ${b.msg.replace(/\|/g, "/")} |`));
}
const out = lines.join("\n");
console.log(out);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out + "\n");
process.exit(blocking.length ? 1 : 0);
