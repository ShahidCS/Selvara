#!/usr/bin/env node
/* Usage: node scripts/extract-source.js <source.html> <fromLine> <toLine> <NAME1,NAME2,...> > out.json
 * Evaluates the given line range of the prototype's <script> in a sandbox (no DOM/network) and prints the named top-level
 * consts/lets as JSON, with the synthetic-name substitution applied. Dev tool only; the source HTML is not part of this repo. */
const fs = require("fs"), vm = require("vm");
const [file, from, to, names] = process.argv.slice(2);
const anon = require("./anonymize");
const src = fs.readFileSync(file, "utf8").split("\n").slice(+from - 1, +to).join("\n");
const ctx = { document: { querySelector() { return null; } }, location: { hash: "" }, localStorage: { getItem() { return null; }, setItem() {} }, Intl, console, window: {} };
vm.createContext(ctx);
const tail = "\n;globalThis.__out={" + names.split(",").map((n) => n + ":(typeof " + n + "==='undefined'?undefined:" + n + ")").join(",") + "};";
vm.runInContext(src + tail, ctx);
process.stdout.write(anon(JSON.stringify(ctx.__out, null, 1)) + "\n");
