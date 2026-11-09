#!/usr/bin/env node
// ZAP baseline gate.  usage: node zap-gate.mjs <report_json.json>
// Fails when the report contains any HIGH alert (riskcode 3). MEDIUM and below are listed in the job summary.
import { readFileSync, appendFileSync, existsSync } from "node:fs";

const path = process.argv[2];
if (!path || !existsSync(path)) { console.error(`ZAP report not found: ${path}. The scan did not produce a report, so the gate fails closed.`); process.exit(1); }
const report = JSON.parse(readFileSync(path, "utf8"));
const alerts = (report.site || []).flatMap((s) => (s.alerts || []).map((a) => ({
  name: a.name || a.alert, risk: Number(a.riskcode), desc: a.riskdesc || "", count: (a.instances || []).length || Number(a.count) || 1,
})));
const label = { 3: "High", 2: "Medium", 1: "Low", 0: "Informational" };
const by = (r) => alerts.filter((a) => a.risk === r);
const high = by(3);

const lines = [`### ZAP baseline (DAST)`, ``, `${alerts.length} alert type(s): High ${high.length}, Medium ${by(2).length}, Low ${by(1).length}, Informational ${by(0).length}.`, ``];
if (alerts.length) { lines.push(`| Risk | Alert | Instances |`, `|---|---|---|`); alerts.sort((a, b) => b.risk - a.risk).forEach((a) => lines.push(`| ${label[a.risk] ?? a.risk} | ${a.name} | ${a.count} |`)); }
const out = lines.join("\n");
console.log(out);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out + "\n");
if (high.length) { console.error(`\nBlocking: ${high.length} HIGH alert(s): ${high.map((a) => a.name).join(", ")}`); process.exit(1); }
