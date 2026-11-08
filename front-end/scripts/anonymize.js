// Synthetic-data substitution (org policy: no real names in the repo).
// The real-name -> synthetic-name map is NOT stored here. Provide it locally via the ANON_MAP environment variable
// (a JSON object of { "regex source": "replacement" }, applied in order), e.g.
//   ANON_MAP='{"Jane Real":"Jordan Avery"}' node scripts/extract-source.js ...
// Without ANON_MAP the text passes through unchanged, so review output before committing.
module.exports = (s) => {
  let map = {};
  try { map = JSON.parse(process.env.ANON_MAP || "{}"); } catch { throw new Error("ANON_MAP must be valid JSON"); }
  return Object.entries(map).reduce((t, [re, rep]) => t.replace(new RegExp(re, "g"), rep), s);
};
