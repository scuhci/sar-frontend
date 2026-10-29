// Team-kit copy of eval/gt_harness.js; run from inside a SAR-backend checkout (requires ./utilities/jsonToCsv).
// Same pipeline as controllers/searchController.js, but throttled + retried so no rows are silently dropped.
//   node smar_harness.js "<query>" out.csv [--country XX]
// V6 (PLAN.md 2.7): like searchController, the primary search() runs FIRST (a throw there = SMAR HTTP 500, no file),
// THEN the app-id branch: if app({appId: query}) succeeds, the file is that single app and no related searches run.
const { search, app } = require("google-play-scraper");
const { cleanText, jsonToCsv } = require("./utilities/jsonToCsv");
const fs = require("fs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function retry(fn, n = 4) { for (let i = 0; ; i++) { try { return await fn(); } catch (e) { if (i >= n || (e && e.status === 404)) throw e; await sleep(1500 * (i + 1)); } } }
(async () => {
  const argv = process.argv.slice(2);
  const ci = argv.indexOf("--country");
  const country = (ci > -1 ? argv[ci + 1] : "US").trim().toUpperCase();
  const pos = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--country");
  const query = pos[0], out = pos[1];
  let main;
  try { main = await retry(() => search({ term: query, country })); }
  catch (e) { console.error("SMAR would return HTTP 500 (primary search threw):", e.message); fs.writeFileSync(out.replace(/\.csv$/, ".smar500.json"), JSON.stringify({ query, country, error: String(e.message) })); process.exit(3); }
  console.error("primary:", main.length);
  let appIdBranch = false;
  try { const one = await app({ appId: query, country }); main.splice(0, main.length, one); appIdBranch = true; console.error("app-id branch"); } catch (e) { /* not an app id */ }
  // Team kit: every search list this run fetched goes to <out>.searches.json (never into the CSV), so report.js can tell
  // a row that follows from a different list Google served (primary or the same "related to" query) from a skill error.
  const lists = [{ kind: "primary", q: query, ids: main.map((m) => m.appId) }];
  const related = [];
  if (!appIdBranch) for (const m of main) {
    const q = `related to ${m.title}`;
    try { const rs = await retry(() => search({ term: q, country })); related.push(rs); lists.push({ kind: "related", seed: m.appId, q, ids: rs.map((r) => r.appId) }); }
    catch (e) { console.error("related fail", m.appId); lists.push({ kind: "related", seed: m.appId, q, ids: null, error: String(e && e.message) }); }
    await sleep(1000);
  }
  const all = [...main.map((r) => ({ ...r, country, source: "primary search" })), ...related.flatMap((rs) => rs.map((r) => ({ ...r, country, source: "related app" })))];
  const res = [], failedIds = new Set();
  let fail = 0;
  // Team kit: 2 parallel detail fetches (the skill adds 1 => <=3 concurrent Google requests), starts staggered 300 ms.
  // Concurrency changes timing only, never output: results are pushed in allResults order, as searchController does.
  const PAR = 2;
  for (let i = 0; i < all.length; i += PAR) {
    const batch = await Promise.all(all.slice(i, i + PAR).map((a, k) => sleep(300 * k).then(() => retry(() => app({ appId: a.appId, country }))).then((d) => ({ ...a, ...d })).catch(() => { fail++; failedIds.add(a.appId); return null; })));
    res.push(...batch.filter(Boolean)); await sleep(300);
  }
  // searchController: Promise.all over allResults (duplicates included), then unique by appId, first occurrence
  const seen = new Set(); const uniq = res.filter((r) => !seen.has(r.appId) && seen.add(r.appId));
  console.error("detailed:", res.length, "unique:", uniq.length, "failed:", fail);
  // an id whose every detail fetch failed is missing from SMAR's file although a list held it
  fs.writeFileSync(out.replace(/\.csv$/, ".searches.json"), JSON.stringify({ query, country, appIdBranch, lists, detailFailed: [...failedIds].filter((id) => !seen.has(id)) }));
  if (!uniq.length) { console.error("SMAR would return HTTP 500 (no results)"); process.exit(3); }
  for (const r of uniq) { if (r.summary) r.summary = cleanText(r.summary); if (r.recentChanges) r.recentChanges = cleanText(r.recentChanges); }
  fs.writeFileSync(out, jsonToCsv(uniq, "app", [], false));
  fs.writeFileSync(out.replace(/\.csv$/, ".primary_ids.json"), JSON.stringify(main.map((m) => m.appId)));
})();
