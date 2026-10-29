---
name: "smar-playstore-top-charts"
description: "Google Play top charts (Top free, Top paid, Top grossing, any category) in SMAR's 30-column CSV, driven through your own Chrome (Claude in Chrome): an in-page extractor sends Google's chart request, fetches each ranked app's page, cross-checks the cells and downloads the CSV. No Node or scripts needed. Same data rules as smar-playstore-keyword-search."
---

# SMAR Play Store Top Charts (v2): browser-driven

**How it works.** Claude drives the user's Chrome. One extractor script (below) is pasted into a play.google.com tab. It sends the same chart request smar-tool.org uses (Google's `vyAe2` top-chart call, not the category page, which is a recommendation shelf and shares only a fraction of the real chart), then fetches every ranked app's detail page same-origin, reads the same data slots and applies the same cell rules and same-page cross-checks as `smar-playstore-keyword-search`, builds SMAR's top-chart CSV and downloads it. There is no Node, no scripts folder and no shell step. Verified 2026-10-04 on Puzzle games / Top free (US) against a SMAR export taken minutes earlier: same 30 columns in the same order, same 200-rank chart, and all 196 apps present in both files matched on every static cell compared (description, developer, id, email, website, privacy URL, icon, rating label, release date, version, version notes, Android version, in-app price range, ads and IAP flags); one app's short description had changed on Google Play in between. Live counters (installs, ratings) drift by the minute and were not compared.

## Hard rules
- Never type, copy, round, estimate or edit a data value, and never edit the CSV. A value that is missing or fails its cross-check is the text `undefined`.
- Never build a chart from `/store/apps/category/...` pages, screenshots or `read_page`/`get_page_text`/`find` on play.google.com. Only read the short status JSON described in step 4. No tab clicks are needed: Top free, Top paid and Top grossing are all one request.
- Paste the extractor verbatim; change only the five `__...__` placeholders. Never wrap it in `eval`, `new Function` or a script tag (Play enforces Trusted Types).
- No Apple App Store (reply "This skill covers Google Play only; App Store needs a separate skill."). Keyword search and reviews are out of scope: use `smar-playstore-keyword-search` or `smar-playstore-bulk-reviews`.

## Step 1. Inputs (never guess)
- COLL: "top free", "free" gives `topselling_free`; "top paid", "paid" gives `topselling_paid`; "top grossing", "highest grossing", "best selling by revenue" gives `topgrossing`. If unclear, ask once.
- CAT = Google Play category id (table below). "No category" or "overall apps" is `APPLICATION` (non-game apps; for games use `GAME` or a `GAME_*` id). An id not in the table: ask once.
- CC = store country, two letters upper case (default US). Non-US countries are not yet verified: say so.
- MODE: default writes the page's true values (developerAddress filled, quotes cleaned once). Use `compat` (COMPAT = true) only if the user wants SMAR's file shape: developerAddress `undefined` on every row and quotes doubled in text cells. No BOM in either mode, LF line endings.
- LIMIT = `0` (every rank Google returns, at most 200, which is what SMAR exports); only set a number if the user asks for the first N.

## Step 2. Open the tab
`tabs_context_mcp` first; then `tabs_create_mcp` and `navigate` to `https://play.google.com/store/apps?hl=en&gl=<CC>` (a new tab, never reuse one). The extractor refuses any other origin.

## Step 3. Run the extractor (one `javascript_tool` call; it returns `started`)
Replace `__COLL__` (e.g. `topselling_free`), `__CAT__` (e.g. `GAME_PUZZLE`), `__CC__` (e.g. `US`), `__COMPAT__` (`true` or `false`) and `__LIMIT__` (`0`), then paste the whole script as the code. Do not await it inline.

```js
(() => {
if (window.__smarChart && window.__smarChart.state === 'running') return 'already running';
const COLL = '__COLL__', CAT = '__CAT__', CC = '__CC__', COMPAT = __COMPAT__, LIMIT = __LIMIT__;
if (location.origin !== 'https://play.google.com') return 'WRONG_ORIGIN: navigate this tab to https://play.google.com/store/apps?hl=en&gl=' + CC;
const S = window.__smarChart = { state: 'running', phase: 'chart', collection: COLL, category: CAT, country: CC, compat: COMPAT, done: 0, total: 0 };
const U = 'undefined';
const tail = a => { const r = a.length ? a[a.length - 1] : undefined; return r && typeof r === 'object' && !Array.isArray(r) && Object.keys(r).every(k => /^\d+$/.test(k) && +k >= a.length) ? r : null; };
const raw = (o, p) => { let n = o; for (const k of p) { if (n == null) return; const t = Array.isArray(n) && k >= n.length - 1 ? tail(n) : null; n = t ? t[String(k + 1)] : n[k]; } return n; };
const g = (o, p) => { const v = raw(o, p); return v === null ? undefined : v; };
const P = { title: [1,2,0,0], summary: [1,2,73,0,1], maxInstalls: [1,2,13,2], minInstalls: [1,2,13,1], score: [1,2,51,0,1], ratings: [1,2,51,2,1], reviews: [1,2,51,3,1], price: [1,2,57,0,0,0,0,1,0,0], currency: [1,2,57,0,0,0,0,1,0,1], originalPrice: [1,2,57,0,0,0,0,1,1,0], discountEnd: [1,2,57,0,0,0,0,14,1], iap: [1,2,19,0], android: [1,2,140,1,1,0,0,1], androidBox: [1,2,140,1,1], version: [1,2,140,0,0,0], versionBox: [1,2,140,0], devLink: [1,2,68,1,4,2], email: [1,2,69,1,0], website: [1,2,69,0,5,2], address: [1,2,69,4,2,0], privacy: [1,2,99,0,5,2], genre: [1,2,79,0,0,2], icon: [1,2,95,0,3,2], rating: [1,2,9,0], ads: [1,2,48], released: [1,2,10,0], changes: [1,2,144,1,1], avail: [1,2,18,0], developer: [1,2,68,0] };
const blobs = h => { const out = {}, re = /AF_initDataCallback\s*\(\s*\{\s*['"]?key['"]?\s*:\s*['"]([^'"]+)['"]/g; let m; while ((m = re.exec(h))) { let e = h.indexOf('</script>', m.index); if (e < 0) e = h.length; const a = h.slice(m.index, e), d = /[,{]\s*['"]?data['"]?\s*:\s*/.exec(a); if (!d) continue; const s = d.index + d[0].length; if (a[s] !== '[' && a[s] !== '{') continue; let c = 0, q = false, u = s; for (; u < a.length; u++) { const ch = a[u]; if (q) { if (ch === '\\') u++; else if (ch === '"') q = false; } else if (ch === '"') q = true; else if (ch === '[' || ch === '{') c++; else if ((ch === ']' || ch === '}') && --c === 0) break; } if (c === 0) try { out[m[1]] = JSON.parse(a.slice(s, u + 1)); } catch (_) {} } return out; };
const ldOf = h => { for (const m of h.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) try { const o = JSON.parse(m[1]); if (o && typeof o === 'object' && /Application|Game/.test(String(o['@type']))) return o; } catch (_) {} return null; };
const unesc = t => typeof t !== 'string' ? t : t.replace(/<[^>]+>/g, '').replace(/\r?\n|\r/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const norm = t => t == null ? '' : unesc(String(t).replace(/<br\s*\/?>/g, ' ')).replace(/\s+/g, ' ').trim();
const clean = t => typeof t !== 'string' ? t : t.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/<br\s*\/?>/g, ' ').replace(/\r?\n|\r/g, ' ');
const hasStr = t => typeof t === 'string' ? t.trim() !== '' : !!t && typeof t === 'object' && Object.values(t).some(hasStr);
const KNOWN_API = new Set([14,15,16,17,19,21,22,23,24,25,26,27,28,29,30,31]);
const EMPTY = t => Array.isArray(t) && t[0] == null && Array.isArray(t[1]) && !t[1].length;
const badgeMin = t => { const r = /^([\d.,]+)([KMB]?)\+$/i.exec(t || ''); return r ? Math.round(parseFloat(r[1].replace(/,/g, '')) * { '': 1, K: 1e3, M: 1e6, B: 1e9 }[r[2].toUpperCase()]) : NaN; };
const nextBucket = t => t <= 0 ? 1 : String(t)[0] === '1' ? 5 * t : 2 * t;
const normAndroid = t => { if (!t) return 'VARY'; const r = String(t).split(' ')[0]; return parseFloat(r) ? r : 'VARY'; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getText = async url => { let last; for (let i = 0; i < 4; i++) { try { const r = await fetch(url, { credentials: 'omit' }); if (r.ok) return { status: r.status, url: r.url, text: await r.text() }; last = 'HTTP ' + r.status; if (r.status === 403 || r.status === 404) break; } catch (e) { last = String(e && e.message || e); } await sleep(700 * (i + 1)); } throw new Error(last || 'fetch failed'); };
const searchIds = async q => { const r = await getText('/store/search?c=apps&q=' + encodeURIComponent(q) + '&hl=en&gl=' + CC + '&price=0'); if (/consent\.google|\/sorry\//.test(r.url)) throw new Error('consent_or_sorry_page'); const ids = []; for (const m of r.text.matchAll(/\/store\/apps\/details\?id=([\w.]+)/g)) if (!ids.includes(m[1])) ids.push(m[1]); return ids; };
const smarDrop = [], titles = {}, quarantined = {}, wrongStore = [], failed = [], softUnrated = [];
const quar = (row, id, cols, why) => { for (const c of cols) row[c] = U; quarantined[id] = (quarantined[id] || []).concat(cols.map(c => c + ':' + why)); };
const one = async (id, label) => {
  const r = await getText('/store/apps/details?id=' + encodeURIComponent(id) + '&hl=en&gl=' + CC), h = r.text;
  if (/consent\.google|\/sorry\//.test(r.url)) throw new Error('consent_or_sorry_page');
  const ld = ldOf(h), bs = blobs(h); let d = null;
  for (const b of Object.values(bs)) if (typeof g(b, P.title) === 'string' && JSON.stringify(b).includes(id)) { d = b; break; }
  if (!d || !ld) throw new Error('no_detail_blob_or_jsonld');
  const lang = (h.match(/<html[^>]*\blang="([^"]+)"/) || [])[1], sf = (h.match(/"fjF0tb":"([A-Z]{2})"/) || [])[1];
  const off = Array.isArray(ld.offers) ? ld.offers[0] : ld.offers, cur = off && off.priceCurrency;
  if (!/^en(-US)?$/i.test(lang || '') || (sf && sf !== CC) || (CC === 'US' && cur && cur !== 'USD')) { wrongStore.push(id); return null; }
  const v = {}; for (const k of Object.keys(P)) v[k] = g(d, P[k]);
  if (raw(d, [1,2,118]) === undefined) smarDrop.push(id);
  const tx = x => (x == null ? U : String(clean(x)));
  titles[id] = tx(v.title);
  const row = {
    appName: tx(v.title), appId: id, url: 'https://play.google.com/store/apps/details?id=' + id + '&hl=en&gl=' + CC, icon: v.icon == null ? U : String(v.icon),
    developer: tx(v.developer), currency: v.currency == null ? U : String(v.currency), price: Number.isInteger(v.price) ? String(v.price / 1e6) : U, description: tx(v.summary),
    avgRating: typeof v.score === 'number' ? String(v.score) : U, country: CC, scrapedFrom: label,
    approximateInstalls: Number.isInteger(v.maxInstalls) ? String(v.maxInstalls) : U, totalRatings: Number.isInteger(v.ratings) ? String(v.ratings) : U, totalReviews: Number.isInteger(v.reviews) ? String(v.reviews) : U,
    originalPrice: v.originalPrice ? String(v.originalPrice / 1e6) : U, discountEndDate: tx(v.discountEnd),
    downloadable: Number.isInteger(v.avail) ? String(Boolean(v.avail)) : U, inAppPurchases: String(!!v.iap), inAppPurchasesPriceRange: tx(v.iap),
    androidMinVersion: typeof v.android === 'string' ? normAndroid(v.android) : (EMPTY(raw(d, P.androidBox)) || (Number.isInteger(g(d, [1,2,140,1,1,0,0,0])) && g(d, [1,2,140,1,1,0,0,0]) > 31 && !KNOWN_API.has(g(d, [1,2,140,1,1,0,0,0])) && !hasStr(raw(d, P.androidBox)))) ? 'VARY' : U,
    developerId: typeof v.devLink === 'string' ? (v.devLink.split('id=')[1] || U) : U, developerEmail: tx(v.email), developerWebsite: tx(v.website),
    developerAddress: COMPAT ? U : tx(v.address), privacyPolicyURL: tx(v.privacy), genreId: tx(v.genre), contentRating: tx(v.rating), inAppAdvertisements: String(!!v.ads),
    originalReleaseDate: tx(v.released), currentAppVersion: typeof v.version === 'string' ? tx(v.version) : EMPTY(raw(d, P.versionBox)) ? 'VARY' : U, currentVersionChanges: tx(v.changes) };
  // same-page cross-checks (a cell that fails is written undefined)
  if (ld.name != null && unesc(v.title) !== unesc(ld.name)) quar(row, id, ['appName'], 'title!=jsonld');
  if (ld.description != null && norm(v.summary) !== norm(ld.description)) quar(row, id, ['description'], 'summary!=jsonld');
  if (ld.image != null && v.icon !== ld.image) quar(row, id, ['icon'], 'icon!=jsonld');
  if (ld.author && ld.author.name != null && norm(v.developer) !== norm(ld.author.name)) quar(row, id, ['developer'], 'developer!=jsonld');
  if (ld.applicationCategory != null && v.genre !== ld.applicationCategory) quar(row, id, ['genreId'], 'genre!=jsonld');
  if (ld.contentRating != null && unesc(v.rating) !== unesc(ld.contentRating)) quar(row, id, ['contentRating'], 'rating!=jsonld');
  if (off && off.price !== undefined && Number.isInteger(v.price) && Math.round(1e6 * Number(off.price)) !== v.price && Math.round(1e6 * Number(off.price)) !== v.originalPrice) quar(row, id, ['price'], 'price!=jsonld');
  const A = ld.aggregateRating;
  if (A) { if (typeof v.score !== 'number' || Math.abs(v.score - Number(A.ratingValue)) > 1e-6) quar(row, id, ['avgRating'], 'score!=jsonld'); if (v.ratings !== Number(A.ratingCount)) quar(row, id, ['totalRatings'], 'ratings!=jsonld'); }
  else if (row.avgRating === U && row.totalRatings === U) softUnrated.push(id);
  const vis = h.replace(/<script[\s\S]*?<\/script>/g, ''), bm = vis.match(/>([\d.,]+[KMBkmb]?\+)<\/div><div[^>]*>Downloads</);
  if (bm) { const b = badgeMin(bm[1]); if (!(Number.isInteger(v.maxInstalls) && v.maxInstalls >= b && v.maxInstalls < nextBucket(b))) quar(row, id, ['approximateInstalls'], 'installs!=badge'); }
  if (COMPAT) for (const c of ['appName', 'description', 'developer', 'privacyPolicyURL', 'currentVersionChanges']) if (row[c] !== U) row[c] = row[c].replace(/"/g, '""');
  return row;
};

const COLS = ['appName','description','approximateInstalls','avgRating','totalRatings','totalReviews','price','originalPrice','discountEndDate','currency','downloadable','inAppPurchases','inAppPurchasesPriceRange','androidMinVersion','developer','developerId','developerEmail','developerWebsite','developerAddress','privacyPolicyURL','genreId','icon','contentRating','inAppAdvertisements','originalReleaseDate','currentAppVersion','currentVersionChanges','appId','url','dateScraped'];
const csvCell = t => '"' + String(t).replace(/"/g, '""') + '"';
const smarDate = () => { const t = new Date(), p = x => String(x).padStart(2, '0'); return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][t.getUTCDay()] + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][t.getUTCMonth()] + ' ' + p(t.getUTCDate()) + ' ' + t.getUTCFullYear() + ' ' + p(t.getUTCHours()) + ':' + p(t.getUTCMinutes()) + ':' + p(t.getUTCSeconds()) + ' GMT+0000 (Coordinated Universal Time)'; };
// gps 9.2.0 list(): the vyAe2 chart request, byte for byte
const FM = [64,1,195,71,8,72,9,10,11,139,12,16,145,148,150,151,152,27,30,31,96,32,34,163,100,165,104,169,108,110,113,55,56,57,122];
const GI = [1,31,104,9,8,27,12,65,110,88,11,56,55,96,10,122,72,71,64,113,139,150,169,165,151,163,32,16,108,100];
const GF = [[7,[1,73,96,103,97,58,50,92,52,112,69,19,31,101,123,74,49,80,38,20,10,14,79,43,42,139]],[9,[1,7,9,24,12,31,5,15,27,8,13,10]],[17,[1,7,9,25,13,31,5,41,27,8,14,10]],[10,[1,7,6,9]],[1,[1,5,14,38,19,29,34,4,12,11,6,30,43,40,42,16,10,7]],[4,[1,3,5,4,7,6,11,19,21,17,15,12,16,20]],[3,[1,5,14,4,10,17]],[2,[1,5,7,4,13,16,12,18]]];
const B2 = '[[[true],null,[[null,[]]],null,null,null,null,[null,2],null,null,null,null,null,null,[1],null,null,null,null,null,null,null,[1]],[null,[[null,[]]]],[null,[[null,[]]],null,[true]],[null,[[null,[]]]],null,null,null,null,[[[null,[]]]],[[[null,[]]]]]';
const chartIds = async () => {
  const groups = []; for (const [g, f] of GF) for (const id of GI) groups.push([[g, id], [f]]);
  const inner = '[[null,[[8,[20,1000000]],true,null,' + JSON.stringify(FM) + ',[null,null,' + B2 + ',[' + JSON.stringify(groups) + ']],null,null,[[[1,2],[10,8,9],[],[]]]],' + JSON.stringify([2, COLL, CAT === '' ? 'APPLICATION' : CAT]) + ']]';
  const body = 'f.req=' + encodeURIComponent(JSON.stringify([[['vyAe2', inner, null, 'generic']]])) + '&at=' + encodeURIComponent('AFSRYlx8XZfN8-O-IKASbNBDkB6T:1655531200971') + '&';
  const url = '/_/PlayStoreUi/data/batchexecute?rpcids=vyAe2&source-path=%2Fstore%2Fapps&f.sid=-4178618388443751758&bl=boq_playuiserver_20220612.08_p0&authuser=0&soc-app=121&soc-platform=1&soc-device=1&_reqid=82003&rt=c&hl=en&gl=' + CC;
  let last;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body });
      const t = await r.text();
      if (/consent\.google|\/sorry\//.test(r.url) || /unusual traffic/i.test(t)) throw new Error('consent_or_sorry_page');
      if (r.status !== 200) throw new Error('HTTP ' + r.status);
      let env; for (const l of t.split('\n')) { if (l[0] !== '[') continue; try { for (const e of JSON.parse(l)) if (Array.isArray(e) && e[0] === 'wrb.fr' && e[1] === 'vyAe2') env = e; } catch (_) {} }
      if (!env) throw new Error('no vyAe2 envelope');
      if (env[2] == null) throw new Error('RPC error');
      const d = JSON.parse(env[2]), apps = g(d, [0,1,0,28,0]);
      if (apps == null && g(d, [0,1]) == null) return [];
      if (!Array.isArray(apps)) throw new Error('chart layout changed (no app list at [0,1,0,28,0])');
      const ids = apps.map(a => g(a, [0,0,0]));
      if (!ids.every(x => typeof x === 'string' && /^[A-Za-z]\w*(\.\w+)+$/.test(x))) throw new Error('chart layout changed (ids)');
      return ids;
    } catch (e) { last = e; if (/layout|consent/.test(e.message)) break; await sleep(700 * (i + 1)); }
  }
  throw last;
};
const runList = async (ids, rows) => { S.total = ids.length; for (let i = 0; i < ids.length; i += 5) { const out = await Promise.allSettled(ids.slice(i, i + 5).map(id => one(id, 'chart'))); out.forEach((o, k) => { if (o.status === 'fulfilled') { if (o.value) rows.push(o.value); } else failed.push(ids[i + k] + ': ' + o.reason.message); S.done++; }); await sleep(250); } };
(async () => {
  try {
    const all = await chartIds(), ids = LIMIT ? all.slice(0, LIMIT) : all, rows = [];
    if (!ids.length) { Object.assign(S, { state: 'STOP', READY_TO_DELIVER: false, NEXT: 'STOP: Google returned an empty chart for this category and list (nothing to write)' }); return; }
    S.phase = 'details'; await runList(ids, rows);
    const byId = {}; rows.forEach(r => { byId[r.appId] = r; });
    const ordered = ids.map(id => byId[id]).filter(Boolean);
    const dateScraped = smarDate();
    window.__smarCSV = [COLS.map(csvCell).join(',')].concat(ordered.map(r => COLS.map(c => c === 'dateScraped' ? dateScraped : csvCell(r[c])).join(','))).join('\n');
    const uc = {}; for (const c of COLS) { const n = ordered.filter(r => r[c] === U).length; if (n) uc[c] = n; }
    const missing = ids.length - ordered.length, ready = ordered.length > 0 && missing <= Math.max(2, Math.floor(0.02 * ids.length));
    const slug = (CAT || 'APPLICATION').toLowerCase() + '_' + COLL.replace('topselling_', 'top_').replace('topgrossing', 'grossing');
    Object.assign(S, { state: 'done', phase: 'done', READY_TO_DELIVER: ready, NEXT: ready ? 'DELIVER' : 'RETRY: apps missing above the 2% limit; run again once, then report', file: 'smar_chart_' + slug + '_' + CC.toLowerCase() + '.csv', chartRanks: all.length, csvRows: ordered.length, notCollected: missing, wrongStorefront: wrongStore.length, failed: failed.length, failedSample: failed.slice(0, 5), smarChartWouldHttp500: smarDrop.length > 0, smarChartHttp500Apps: smarDrop.length, quarantinedApps: Object.keys(quarantined).length, quarantinedCells: Object.values(quarantined).reduce((a, x) => a + x.length, 0), quarantinedSample: Object.entries(quarantined).slice(0, 5), undefinedCounts: uc, unratedApps: softUnrated.length, mode: COMPAT ? 'compat-lite (developerAddress undefined, quotes doubled)' : 'default (page values)' });
  } catch (e) { Object.assign(S, { state: 'ERR', READY_TO_DELIVER: false, NEXT: 'STOP: ' + String(e && e.message || e) }); }
})();
return 'started';
})()
```

## Step 4. Poll (short reads only)
The tool output cuts off after about 1,000 characters, and one call must finish in under 45 s, so wait with `computer` `wait` (10 s max) between reads. Running: `JSON.stringify({s:window.__smarChart.state,p:window.__smarChart.phase,d:window.__smarChart.done,t:window.__smarChart.total})`. A 200-rank chart takes about one minute. When `state` is `done`, read the summary in two short calls:
1. `(({READY_TO_DELIVER:r,NEXT:n,chartRanks:k,csvRows:c,notCollected:x,wrongStorefront:w,failed:f,failedSample:fs,smarChartWouldHttp500:h,smarChartHttp500Apps:ha})=>JSON.stringify({r,n,k,c,x,w,f,fs,h,ha}))(window.__smarChart)`
2. `(({quarantinedApps:a,quarantinedCells:q,quarantinedSample:qs,undefinedCounts:u,unratedApps:un,mode:m,file:fl})=>JSON.stringify({a,q,qs,u,un,m,fl}))(window.__smarChart)`

States: `STOP` or `ERR` (the `NEXT` text says why): tell the user that sentence and stop (empty chart, consent or "unusual traffic" page, HTTP 403, chart layout changed). An empty chart is reported, never filled from anywhere else. If the page reloaded, `window.__smarChart` is gone: repeat step 3 with identical inputs. If `READY_TO_DELIVER` is false, run step 3 once more; if it is still false, report it and do not deliver the file as final.

## Step 5. Deliver
Download with one call: `const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(new Blob([window.__smarCSV],{type:'text/csv;charset=utf-8'})),download:window.__smarChart.file});document.body.appendChild(a);a.click();a.remove();`. The file lands in the user's Downloads folder as `smar_chart_<category>_<list>_<cc>.csv` (e.g. `smar_chart_game_puzzle_top_free_us.csv`). Chrome allows one automatic download per site per session: if a second run's file does not land, ask the user to allow automatic downloads for play.google.com (the icon in the address bar) and trigger the download again; the CSV stays in `window.__smarCSV` until the tab is closed or reloaded. Close the tab you opened when done.

## Step 6. Report (copy numbers from the two summary reads; compute nothing; never paste the CSV)
- Request: mode (default or compat-lite), COLL, CAT, country.
- File name; `chartRanks` (ranks Google returned) and `csvRows` data rows; `notCollected`; `wrongStorefront`; `failed`.
- Cells: `undefinedCounts` per column; `quarantinedApps` and `quarantinedCells` (failed a same-page cross-check, written `undefined`); `unratedApps`.
- If `smarChartWouldHttp500` is true: "smar-tool.org itself returns no file for this chart: `smarChartHttp500Apps` of its apps break SMAR's loader (their pages lack the categories slot). This file holds every rank." Never say a default file matches SMAR's byte for byte; only compat mode is meant to.
- Say: "Values are read from Google Play and cross-checked on the same page; the chart and counts are live, so compare only with a SMAR export taken within minutes."

## File format (both modes)
30 columns, in this order, no `country` and no `scrapedFrom`, rows in rank order (row 1 = rank 1), every cell double-quoted with `""` for a quote except `dateScraped`, which is bare:
`appName, description, approximateInstalls, avgRating, totalRatings, totalReviews, price, originalPrice, discountEndDate, currency, downloadable, inAppPurchases, inAppPurchasesPriceRange, androidMinVersion, developer, developerId, developerEmail, developerWebsite, developerAddress, privacyPolicyURL, genreId, icon, contentRating, inAppAdvertisements, originalReleaseDate, currentAppVersion, currentVersionChanges, appId, url, dateScraped`
Cell rules (same as the keyword skill): `approximateInstalls` is the exact integer, not the "5M+" badge; `avgRating` the raw float; `totalReviews` the real review count (not the ratings count); `price` `0` for free apps; booleans `true`/`false`; `originalPrice`/`discountEndDate` `undefined` unless the app is on sale; `description` is the short description; `dateScraped` like `Mon Oct 05 2026 01:02:56 GMT+0000 (Coordinated Universal Time)`, the same on every row.

## Category ids
Apps: APPLICATION (no category), ANDROID_WEAR, ART_AND_DESIGN, AUTO_AND_VEHICLES, BEAUTY, BOOKS_AND_REFERENCE, BUSINESS, COMICS, COMMUNICATION, DATING, EDUCATION, ENTERTAINMENT, EVENTS, FINANCE, FOOD_AND_DRINK, HEALTH_AND_FITNESS, HOUSE_AND_HOME, LIBRARIES_AND_DEMO, LIFESTYLE, MAPS_AND_NAVIGATION, MEDICAL, MUSIC_AND_AUDIO, NEWS_AND_MAGAZINES, PARENTING, PERSONALIZATION, PHOTOGRAPHY, PRODUCTIVITY, SHOPPING, SOCIAL, SPORTS, TOOLS, TRAVEL_AND_LOCAL, VIDEO_PLAYERS, WATCH_FACE, WEATHER, FAMILY.
Games: GAME (all games), GAME_ACTION, GAME_ADVENTURE, GAME_ARCADE, GAME_BOARD, GAME_CARD, GAME_CASINO, GAME_CASUAL, GAME_EDUCATIONAL, GAME_MUSIC, GAME_PUZZLE, GAME_RACING, GAME_ROLE_PLAYING, GAME_SIMULATION, GAME_SPORTS, GAME_STRATEGY, GAME_TRIVIA, GAME_WORD.
smar-tool.org's own Top Charts page offers only: Top free for No Category, GAME_BOARD, GAME_CARD, GAME_PUZZLE; Top paid for No Category, BEAUTY, COMICS, EVENTS, HOUSE_AND_HOME, PARENTING; Top grossing for No Category, APPLICATION, GAME_CARD, GAME_CASINO. Any other combination still runs, but tell the user SMAR's website does not offer it, so there is no SMAR export to compare with. Many paid category charts are short or empty in the US; an empty chart stops with a message.

## Known limits (state them when relevant)
- The chart is live and reorders between runs; two runs minutes apart share most but not all apps, in a slightly different order. Compare with SMAR by app id, not by row number.
- Verified on one chart (Puzzle games, Top free, US, compat mode) against a SMAR export. Default mode shares the same code path and differs only in developerAddress (filled) and single versus doubled quotes; it was not compared file to file. Top paid and Top grossing use the same request with another collection name and were not compared against a SMAR export.
- No automatic layout-drift healing: if Google changes a data slot, the cross-checks write `undefined` and `undefinedCounts` jumps; if the chart response itself changes, the run stops with `chart layout changed`. Report it and suggest `smar-playstore-agent`.
