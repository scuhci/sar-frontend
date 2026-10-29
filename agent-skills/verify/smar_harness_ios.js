#!/usr/bin/env node
'use strict';
// Team-kit SMAR iOS harness: SMAR's own iOS pipelines (SAR-backend ios-production controllers, with SMAR's own
// app-store-scraper 0.18 and utilities/jsonToCsv.js from a SAR-backend checkout), run locally. smar-tool.org is never
// called. Team copy of eval/appstore/lib/gt_ios.js without the campaign cache: every Apple request waits for the same
// cross-process limiter the skill uses (scripts/net_apple.js fileLimiter: <= 18 lookups and <= 30 other Apple requests
// a minute, shared by every process of this user), so SMAR and the skill running side by side stay inside Apple's limits.
//
//   node smar_harness_ios.js <SMAR_DIR> <SKILL_DIR> search "<term>" OUT.csv [--country US]
//   node smar_harness_ios.js <SMAR_DIR> <SKILL_DIR> chart <collection> <genreId|all> OUT.csv [--country US]
//   node smar_harness_ios.js <SMAR_DIR> <SKILL_DIR> reviews <bundleId|trackId> OUT.csv [--country US]
//
// Writes OUT.csv (SMAR's server bytes: jsonToCsv output, LF, no trailing newline, no BOM; dateScraped in UTC as on
// production) plus OUT.summary.json {mode, params, counts, smarWouldDrop, firstAttemptFailures, requests, versions}.
// Exit 0 ok; 3 = SMAR would answer HTTP 500 (OUT.smar500.json written, no CSV); 4 = Apple rate-limited us; 2 usage.
//
// Differences from SMAR's server, none of which changes a row or a value (eval/appstore/lib/gt_ios.js, validated
// byte-identical against SMAR on 16 replayed searches): each library call is retried up to 4 times instead of failing
// (the first-attempt failures are listed, with the rows SMAR would have lost); the per-row detail lookups are batched
// 50 bundle ids per request (same endpoint, same parameters, same cleanApp output); the 3 s pause between similar()
// calls is replaced by the shared limiter.
process.env.TZ = 'UTC'; // production runs in UTC (prod-tz-utc); must be set before any Date is formatted
const fs = require('fs');
const path = require('path');
const http = require('http');

const argv = process.argv.slice(2);
const ci = argv.indexOf('--country');
const COUNTRY = (ci > -1 ? String(argv[ci + 1] || '') : 'US').trim().toUpperCase();
const pos = argv.filter((a, i) => !a.startsWith('--') && !(ci > -1 && i === ci + 1));
const [SMAR_DIR, SKILL_DIR, MODE] = pos;
const usage = () => { console.error('usage: node smar_harness_ios.js <SMAR_DIR> <SKILL_DIR> search "<term>" OUT.csv | chart <collection> <genreId|all> OUT.csv | reviews <bundleId|trackId> OUT.csv  [--country US]'); process.exit(2); };
if (!SMAR_DIR || !SKILL_DIR || !['search', 'chart', 'reviews'].includes(MODE)) usage();
const OUT = path.resolve(pos[pos.length - 1] || '');
if (!/\.csv$/i.test(OUT) || pos.length !== (MODE === 'chart' ? 6 : 5)) usage();

// ---- shared limiter: hook every Apple http(s) request before SMAR's modules load ----
const NET = require(path.join(path.resolve(SKILL_DIR), 'scripts', 'net_apple.js'));
const LIM = NET.fileLimiter();
const REQ = { itunes_api: 0, apple_other: 0, httpErrors: [] };
let rateLimited = null;
const origAdd = http.Agent.prototype.addRequest;
http.Agent.prototype.addRequest = function (req, options, ...rest) {
  const host = String(req.host || (options && (options.host || options.hostname)) || '').toLowerCase().replace(/:\d+$/, '');
  if (!NET.isAppleHost(host)) return origAdd.call(this, req, options, ...rest);
  const url = `${req.protocol || (options && options.protocol) || 'https:'}//${host}${req.path || (options && options.path) || '/'}`;
  req.once('response', (res) => {
    REQ[NET.bucketFor(url)]++;
    if (res.statusCode >= 400) REQ.httpErrors.push({ url: url.slice(0, 160), status: res.statusCode });
    const ra = NET.parseRetryAfter(res.headers['retry-after'], Date.now());
    LIM.report(url, res.statusCode, { retryAfterMs: ra }).catch(() => {});
  });
  req.once('error', () => { LIM.report(url, 0).catch(() => {}); });
  LIM.acquire(url).then(() => origAdd.call(this, req, options, ...rest), (e) => { if (e && e.code === 'RATE_LIMITED') rateLimited = e.message; req.destroy(e); });
  return undefined;
};

// ---- SMAR's own modules (from the SAR-backend checkout) ----
const SAR = path.resolve(SMAR_DIR);
const store = require(path.join(SAR, 'node_modules', 'app-store-scraper'));
const common = require(path.join(SAR, 'node_modules', 'app-store-scraper', 'lib', 'common'));
const { cleanText, jsonToCsv } = require(path.join(SAR, 'utilities', 'jsonToCsv'));
const VERSIONS = {
  sarBackend: require(path.join(SAR, 'package.json')).version,
  appStoreScraper: require(path.join(SAR, 'node_modules', 'app-store-scraper', 'package.json')).version,
  node: process.version,
};
const stdoutLog = console.log;
console.log = (...a) => console.error(...a); // jsonToCsv logs "Editing ... Column Headers"; keep stdout clean
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- per-call retry with a record of what SMAR would have seen ----
const LOG = { calls: 0, retried: 0, smarWouldDrop: [], firstAttemptFailures: [], notes: [] };
const errInfo = (e) => (e && e.response && e.response.statusCode ? { status: e.response.statusCode, msg: 'HTTP ' + e.response.statusCode } : { status: 0, msg: String((e && e.message) || e).slice(0, 200) });
const isPermanent = (e) => { const { status, msg } = errInfo(e); return /App not found \(404\)/.test(msg) || status === 400 || status === 404; };
async function call(stage, key, fn, maxRetries = 4) {
  for (let attempt = 1; ; attempt++) {
    LOG.calls++; if (attempt > 1) LOG.retried++;
    try { return await fn(); } catch (e) {
      if (rateLimited) { const x = new Error('Apple is rate limiting this network: ' + rateLimited); x.code = 'RATE_LIMITED'; throw x; }
      const permanent = isPermanent(e);
      if (attempt === 1 && !permanent) LOG.firstAttemptFailures.push({ stage, key, error: errInfo(e).msg });
      if (permanent || attempt > maxRetries) { e.__permanent = permanent; throw e; }
      if (!errInfo(e).status) await sleep(2000 * attempt); // the limiter already holds a cooldown for 403/429/5xx
    }
  }
}
const firstFailed = (stage, key) => LOG.firstAttemptFailures.some((f) => f.stage === stage && f.key === key);

const STARTED = new Date();
function finish(csv, rows, summary) {
  const base = OUT.replace(/\.csv$/i, '');
  const full = Object.assign({}, summary, {
    startedAt: STARTED.toISOString(), finishedAt: new Date().toISOString(), tz: process.env.TZ, versions: VERSIONS,
    smarWouldDrop: { note: 'rows SMAR would have lost (its call failed on the first attempt and SMAR never retries) or rows nobody can fetch', items: LOG.smarWouldDrop },
    firstAttemptFailures: LOG.firstAttemptFailures, notes: LOG.notes,
    requests: { itunes_api: REQ.itunes_api, apple_other: REQ.apple_other, httpErrors: REQ.httpErrors.slice(0, 50), libraryCalls: LOG.calls, retriedCalls: LOG.retried },
  });
  if (csv == null) {
    fs.writeFileSync(base + '.smar500.json', JSON.stringify(full, null, 2));
    console.error(`SMAR would answer HTTP 500: ${summary.smar500} -> ${base}.smar500.json`);
    process.exit(3);
  }
  fs.writeFileSync(OUT, csv);
  fs.writeFileSync(base + '.summary.json', JSON.stringify(full, null, 2));
  console.error(`wrote ${OUT} (${rows.length} rows) | apple requests ${REQ.itunes_api}+${REQ.apple_other}, retried calls ${LOG.retried}, smarWouldDrop ${LOG.smarWouldDrop.length}`);
  stdoutLog(OUT);
}

// ---- search (controllers/searchController.js) ----
let natural;
function similarityScore(query, title) {
  natural = natural || require(path.join(SAR, 'node_modules', 'natural'));
  const tk = new natural.WordTokenizer();
  const a = new Set(tk.tokenize(query.toLowerCase())), b = new Set(tk.tokenize(String(title).toLowerCase()));
  const inter = new Set([...a].filter((x) => b.has(x))), uni = new Set([...a, ...b]);
  return inter.size / uni.size;
}
async function runSearch(query, country) {
  const summary = { mode: 'search', params: { query, countryCode: country }, smarDownloadFilename: `${query}_<M><D><YYYY>.csv` };
  let mainResults;
  try { mainResults = await call('search', query, () => store.search({ term: query, country })); }
  catch (e) { if (e.code === 'RATE_LIMITED') throw e; return finish(null, [], Object.assign(summary, { smar500: 'primary search() threw: ' + errInfo(e).msg })); }
  if (firstFailed('search', query)) LOG.notes.push('primary search() failed on its first attempt: SMAR would have answered HTTP 500');
  summary.primaryIds = mainResults.map((m) => m.appId);
  const relatedResults = [];
  let appIdBranch = false;
  try {
    const fetched = await call('appid-probe', query, () => store.app({ appId: query, country }));
    mainResults.splice(0, mainResults.length, fetched);
    appIdBranch = true;
  } catch (error) {
    if (error.code === 'RATE_LIMITED') throw error;
    if (!error.__permanent) LOG.notes.push(`app-id probe for "${query}" failed transiently (${errInfo(error).msg}); SMAR treats any probe error as "not an app id"`);
    const singleSimilar = country !== 'US'; // similar({id}) skips the bundle->id lookup; equivalent only when that lookup's country is us
    for (const m of mainResults) {
      try {
        const rel = await call('similar', m.appId, () => (singleSimilar ? store.similar({ appId: m.appId }) : store.similar({ id: m.id })));
        relatedResults.push(...rel);
        if (firstFailed('similar', m.appId)) LOG.notes.push(`similar(${m.appId}) failed on its first attempt: SMAR would have lost its related apps`);
      } catch (e) { if (e.code === 'RATE_LIMITED') throw e; LOG.notes.push(`similar(${m.appId}) failed for good: ${errInfo(e).msg} (SMAR logs it and continues)`); }
    }
  }
  summary.appIdBranch = appIdBranch;
  const allResults = [
    ...mainResults.map((r) => ({ ...r, country, source: 'primary search' })),
    ...relatedResults.map((r) => ({ ...r, country, source: 'related app' })),
  ];
  const details = new Map();
  const want = [...new Set(allResults.map((a) => a.appId))];
  for (let i = 0; i < want.length; i += 50) { // a 200-bundle-id URL gets a deterministic HTTP 502 from Apple
    const chunk = want.slice(i, i + 50);
    try {
      const got = await call('detail-batch', `${i}`, () => common.lookup(chunk, 'bundleId', country), 2);
      const byId = new Map(got.map((g) => [g.appId, g])), byLower = new Map(got.map((g) => [String(g.appId).toLowerCase(), g]));
      for (const id of chunk) { const d = byId.get(id) || byLower.get(String(id).toLowerCase()); if (d) details.set(id, d); }
    } catch (e) { if (e.code === 'RATE_LIMITED') throw e; LOG.notes.push(`detail batch ${i} failed: ${errInfo(e).msg}; single lookups instead`); }
  }
  for (const id of want) {
    if (details.has(id)) continue;
    try { details.set(id, await call('detail', id, () => store.app({ appId: id, country }))); }
    catch (e) { if (e.code === 'RATE_LIMITED') throw e; details.set(id, null); LOG.smarWouldDrop.push({ appId: id, stage: 'detail', reason: (e.__permanent ? 'permanent: ' : 'gave up: ') + errInfo(e).msg }); }
  }
  for (const id of want) if (details.get(id) && firstFailed('detail', id)) LOG.smarWouldDrop.push({ appId: id, stage: 'detail', reason: 'transient first-attempt failure (kept here; SMAR would drop the row)' });
  const valid = allResults.map((a) => { const d = details.get(a.appId); return d ? { ...a, ...d } : null; }).filter((a) => a !== null);
  const unique = Array.from(new Set(valid.map((a) => a.appId))).map((id) => valid.find((a) => a.appId === id));
  summary.counts = { primary: mainResults.length, related: relatedResults.length, all: allResults.length, valid: valid.length, unique: unique.length };
  if (!unique.length) return finish(null, [], Object.assign(summary, { smar500: `Search for '${query}' did not return any results.` }));
  for (const r of unique) {
    r.similarityScore = similarityScore(query, r.title);
    if (r.description) r.description = cleanText(r.description);
    if (r.recentChanges) r.recentChanges = cleanText(r.recentChanges);
  }
  finish(jsonToCsv(unique, 'app'), unique, summary);
}

// ---- chart (controllers/listController.js) ----
async function runChart(collection, genreArg, country) {
  const category = Number(String(genreArg).toLowerCase() === 'all' ? '' : genreArg); // SMAR: Number(req.query.category); '' -> 0
  const summary = { mode: 'chart', params: { collection, category, country } };
  let toplist;
  try { toplist = await call('list', `${collection}/${category}`, () => store.list({ category, collection, country, fullDetail: true })); }
  catch (e) { if (e.code === 'RATE_LIMITED') throw e; return finish(null, [], Object.assign(summary, { smar500: 'list() threw: ' + errInfo(e).msg })); }
  if (firstFailed('list', `${collection}/${category}`)) LOG.notes.push('list() failed on its first attempt: SMAR would have answered HTTP 500');
  if (toplist.length > 200) return finish(null, [], Object.assign(summary, { smar500: `toplist.length ${toplist.length} > 200: SMAR reassigns a const (TypeError)` }));
  summary.counts = { rows: toplist.length };
  finish(jsonToCsv(toplist, 'app'), toplist, summary);
}

// ---- reviews (controllers/reviewsController.js) ----
async function runReviews(appIdArg, country) {
  let appId = appIdArg;
  const summary = { mode: 'reviews', params: { appIdArg, countryCode: country } };
  if (/^\d+$/.test(appIdArg)) { // SMAR's website always sends the bundle id
    try { appId = (await call('resolve-trackid', appIdArg, () => store.app({ id: appIdArg, country }))).appId; }
    catch (e) { if (e.code === 'RATE_LIMITED') throw e; return finish(null, [], Object.assign(summary, { smar500: 'track id not found: ' + errInfo(e).msg })); }
  }
  summary.params.appId = appId;
  let app;
  try { app = await call('reviews-app', appId, () => store.app({ appId, country })); }
  catch (e) { if (e.code === 'RATE_LIMITED') throw e; return finish(null, [], Object.assign(summary, { smar500: 'app() threw: ' + errInfo(e).msg })); }
  const target = app.reviews && app.reviews < 500 ? app.reviews : 500;
  Object.assign(summary, { userRatingCount: app.reviews, trackId: app.id, target });
  const options = { appId, sort: store.sort.RECENT, page: 1, country };
  let reviews = [];
  const perPage = [];
  try {
    while (reviews.length < target && options.page < 11) {
      const p = options.page;
      const result = await call('reviews-page', String(p), () => store.reviews(options));
      if (firstFailed('reviews-page', String(p))) LOG.notes.push(`reviews page ${p} failed on its first attempt: SMAR would have answered HTTP 500`);
      perPage.push({ page: p, n: result.length });
      reviews = reviews.concat(result);
      options.page++;
    }
  } catch (e) { if (e.code === 'RATE_LIMITED') throw e; return finish(null, [], Object.assign(summary, { perPage, smar500: 'reviews() threw: ' + errInfo(e).msg })); }
  if (reviews.length > target) reviews = reviews.slice(0, target);
  const ids = reviews.map((r) => r.id);
  Object.assign(summary, { perPage, counts: { rows: reviews.length, uniqueReviewIds: new Set(ids).size, duplicateRows: ids.length - new Set(ids).size }, smarDownloadFilename: `${appId}_reviews.csv` });
  const rows = reviews.map((r) => ({ ...r, country }));
  finish(jsonToCsv(rows, 'reviews'), rows, summary);
}

(async () => {
  try {
    if (MODE === 'search') await runSearch(pos[3], COUNTRY);
    else if (MODE === 'chart') await runChart(pos[3], pos[4], COUNTRY);
    else await runReviews(pos[3], COUNTRY);
  } catch (e) {
    if (e && e.code === 'RATE_LIMITED') { console.error(String(e.message)); process.exit(4); }
    console.error('smar_harness_ios crashed:', (e && e.stack) || e);
    process.exit(1);
  }
})();
