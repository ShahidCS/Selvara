import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/* EDGE-9: long text (a 5,000-word paste) never vanishes silently. The server caps every text field, so every multi-line field in the UI
   declares its limit (maxLength) and the browser stops typing or pasting there, or the field is read-only. */
const SRC = path.resolve(__dirname, "../../src");
const files = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(d, e.name)) : e.name.endsWith(".tsx") ? [path.join(d, e.name)] : []));

describe("EDGE-9: every text area declares its limit", () => {
  it("each <textarea> has maxLength or readOnly", () => {
    const missing: string[] = [];
    for (const f of files(SRC)) {
      const src = fs.readFileSync(f, "utf8");
      for (const m of src.matchAll(/<textarea\b[^>]*>/g)) if (!/\bmaxLength=|\breadOnly\b/.test(m[0])) missing.push(`${path.relative(SRC, f)}:${src.slice(0, m.index).split("\n").length}`);
    }
    expect(missing).toEqual([]);
  });
});
