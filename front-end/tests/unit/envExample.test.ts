import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/* SEC-11 (ASVS V14.1): configuration comes from the environment; .env.example names every variable the server reads, with empty or
   placeholder values only, and .env files are not committed. */
const ROOT = path.resolve(__dirname, "../..");
const files = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(d, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : []));
const read = (dirs: string[]) => dirs.flatMap((d) => files(path.join(ROOT, d))).map((f) => fs.readFileSync(f, "utf8")).join("\n");
const ex = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8");
const names = new Set([...ex.matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]));

describe("SEC-11: environment configuration", () => {
  it(".env.example names every variable the server and the browser read", () => {
    const src = read(["src/server", "src/pages", "src/lib", "src/services"]);
    const used = new Set([...src.matchAll(/\b(?:e|env|process\.env)\.([A-Z][A-Z0-9_]{2,})\b/g)].map((m) => m[1]));
    for (const skip of ["NODE_ENV", "VERCEL", "CI"]) used.delete(skip);
    expect([...used].filter((n) => !names.has(n)).sort()).toEqual([]);
  });
  it("holds no secret values: every SECRET line is empty", () => {
    const lines = ex.split("\n"); const bad: string[] = [];
    // "# SECRET" covers the next line, "# SECRET (both)" the next two
    lines.forEach((l, i) => { if (/^#.*SECRET/.test(l)) for (const v of lines.slice(i + 1, i + (/\(both\)/.test(l) ? 3 : 2))) if (!/^[A-Z0-9_]+=$/.test(v)) bad.push(v.split("=")[0]); });
    expect(lines.filter((l) => /^#.*SECRET/.test(l)).length).toBeGreaterThanOrEqual(10);
    expect(bad).toEqual([]);
  });
});
