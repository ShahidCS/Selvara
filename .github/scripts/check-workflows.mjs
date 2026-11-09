#!/usr/bin/env node
// Pipeline supply-chain policy. Fails when a workflow under .github/workflows violates one of the rules
// below. Dependency-free (line-based, no YAML parser) so it runs before anything is installed.
//
//  R1  every `uses:` is pinned to a full 40-character commit SHA (local ./ and docker:// refs are exempt)
//  R2  a top-level `permissions:` block exists (least privilege: jobs then grant what they need)
//  R3  no `pull_request_target` trigger (runs with secrets on untrusted code)
//  R4  every job that runs steps has `timeout-minutes`
//  R5  no script injection: `run:` steps must not interpolate attacker-controllable expressions
//      (github.event.*, github.head_ref, inputs.*, github.ref_name); pass them through `env:` instead
//  R6  every actions/checkout step sets `persist-credentials: false`
//  R7  no `secrets: inherit`
//  R8  plain (unquoted) `name:` values must not contain ": " or " #" (YAML would parse them as a mapping or a comment)
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = ".github/workflows";
const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort();
const problems = [];
const bad = (file, line, rule, msg) => problems.push(`${file}:${line}  [${rule}] ${msg}`);
const indentOf = (s) => s.length - s.trimStart().length;
const UNSAFE = /\$\{\{\s*(github\.event\.|github\.head_ref|github\.ref_name|inputs\.)/;

for (const f of files) {
  const lines = readFileSync(join(dir, f), "utf8").split("\n");
  const noComment = (s) => s.replace(/(^|\s)#.*$/, "");

  // R2, R3, R7
  if (!lines.some((l) => /^permissions:/.test(l))) bad(f, 1, "R2", "no top-level `permissions:` block");
  lines.forEach((l, i) => {
    const t = noComment(l);
    if (/\bpull_request_target\b/.test(t)) bad(f, i + 1, "R3", "pull_request_target is not allowed");
    if (/^\s*secrets:\s*inherit\b/.test(t)) bad(f, i + 1, "R7", "`secrets: inherit` is not allowed; pass secrets explicitly");
  });

  // R8: an unquoted scalar containing ": " breaks the whole workflow file
  lines.forEach((l, i) => {
    const m = l.match(/^\s*(?:-\s*)?name:\s+(.*)$/);
    if (!m) return;
    const v = m[1].trim();
    if (/^["'|>]/.test(v)) return;
    if (/:\s/.test(v)) bad(f, i + 1, "R8", `unquoted name contains ": ", which is invalid YAML: ${v}`);
  });

  // R1, R6
  lines.forEach((l, i) => {
    const m = noComment(l).match(/^\s*(?:-\s*)?uses:\s*(\S+)/);
    if (!m) return;
    const ref = m[1];
    if (ref.startsWith("./") || ref.startsWith("docker://")) return;
    if (!/@[0-9a-f]{40}$/.test(ref)) bad(f, i + 1, "R1", `action not pinned to a full commit SHA: ${ref}`);
    if (/^actions\/checkout@/.test(ref)) {
      const base = indentOf(l);
      let ok = false;
      for (let j = i + 1; j < lines.length; j++) {
        const nl = lines[j];
        if (nl.trim() === "") continue;
        if (indentOf(nl) < base || /^\s*-\s/.test(nl) && indentOf(nl) <= base) break;
        if (/persist-credentials:\s*false/.test(nl)) ok = true;
      }
      if (!ok) bad(f, i + 1, "R6", "actions/checkout must set `persist-credentials: false`");
    }
  });

  // R5: inspect `run:` blocks (single-line and block scalars)
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)(?:-\s*)?run:\s*(.*)$/);
    if (!m) continue;
    const base = m[1].length;
    const first = m[2];
    if (first && !/^[|>][+-]?\s*$/.test(first)) {
      if (UNSAFE.test(first)) bad(f, i + 1, "R5", "attacker-controllable expression interpolated in `run:`; use env: instead");
      continue;
    }
    for (let j = i + 1; j < lines.length; j++) {
      const nl = lines[j];
      if (nl.trim() === "") continue;
      if (indentOf(nl) <= base) break;
      if (UNSAFE.test(nl)) bad(f, j + 1, "R5", "attacker-controllable expression interpolated in `run:`; use env: instead");
    }
  }

  // R4: jobs that run steps need timeout-minutes
  const jobsAt = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (jobsAt >= 0) {
    const jobStarts = [];
    for (let i = jobsAt + 1; i < lines.length; i++) {
      if (/^\S/.test(lines[i]) && lines[i].trim() !== "") break;
      const m = lines[i].match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
      if (m) jobStarts.push({ name: m[1], line: i });
    }
    jobStarts.forEach((j, k) => {
      const end = k + 1 < jobStarts.length ? jobStarts[k + 1].line : lines.length;
      const block = lines.slice(j.line + 1, end);
      const callsReusable = block.some((l) => /^ {4}uses:\s*\S/.test(l));
      const hasSteps = block.some((l) => /^ {4}steps:\s*$/.test(l));
      if (hasSteps && !callsReusable && !block.some((l) => /^ {4}timeout-minutes:/.test(l))) bad(f, j.line + 1, "R4", `job "${j.name}" has no timeout-minutes`);
    });
  }
}

if (problems.length) {
  console.error(`Workflow policy violations (${problems.length}):\n` + problems.map((p) => "  " + p).join("\n"));
  process.exit(1);
}
console.log(`Workflow policy OK: ${files.length} workflow file(s) checked (${files.join(", ")}).`);
