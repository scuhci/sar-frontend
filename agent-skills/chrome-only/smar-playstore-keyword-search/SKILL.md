---
name: "smar-playstore-keyword-search"
description: "Google Play keyword search in SMAR's 32-column CSV format, driven through your own Chrome (Claude in Chrome): an in-page extractor fetches each app's details on play.google.com, cross-checks them and downloads the CSV. No Node or scripts needed. Same data rules as smar-playstore-agent."
---

# SMAR Play Store Keyword Search (v8): browser-driven

**How it works (different from smar-playstore-agent).** Claude drives the user's Chrome. One extractor script (below) is pasted into a play.google.com tab; it runs there in the background, fetches the search page and every app's detail page same-origin, reads the same data slots and applies the same cell rules and same-page cross-checks as `smar-playstore-agent`, builds SMAR's 32-column CSV and downloads it. There is no Node, no scripts folder and no shell step. Verified 2026-10-04 on "fitness tracking": the 20 seeds, their order and every static cell of the apps found by both skills were identical to the agent's file (live counters drift by the minute).

## Hard rules
- Never type, copy, round, estimate or edit a data value, and never edit the CSV. A value that is missing or fails its cross-check is the text `undefined`.
- Never read app or search pages into context: no screenshots, `read_page`, `get_page_text` or `find` on play.google.com pages. Only read the short status JSON described in step 4.
- Paste the extractor verbatim; change only the four `__...__` placeholders. Never wrap it in `eval`, `new Function` or a script tag (Play enforces Trusted Types).
- No Apple App Store (reply "This skill covers Google Play only; App Store needs a separate skill."). No permissions columns (reply "Permissions columns are not supported by this skill."). Top charts and reviews are out of scope here: use `smar-playstore-top-charts`, `smar-playstore-bulk-reviews` or `smar-playstore-agent`.

## Step 1. Inputs (never guess)
- TERM = the exact string a user would type in SMAR's search box: quoted or labelled terms verbatim ("meditation apps", keyword: budget app); otherwise drop a trailing generic "app"/"apps" ("fitness tracking apps" gives fitness tracking) unless it is part of a name ("Cash App"). Never add, reorder, pluralise, translate or spell-correct. If unclear, ask once.
- CC = store country, two letters upper case (default US). Non-US countries are not yet verified: say so.
- MODE: default writes the page's true values (developerAddress filled, quotes cleaned once, no BOM). Use `compat` (COMPAT = true) only if the user wants SMAR's file shape: BOM, developerAddress `undefined`, quotes doubled, and apps whose page lacks the categories slot dropped (the main SMAR drop rule; SMAR's other quirks are not replicated).
- EXPAND = true (SMAR always adds similar apps); false only if the user asks for primary results only.

## Step 2. Open the tab
`tabs_context_mcp` first; then `tabs_create_mcp` and `navigate` to `https://play.google.com/store/apps?hl=en&gl=<CC>` (a new tab, never reuse one). The extractor refuses any other origin.

## Step 3. Run the extractor (one `javascript_tool` call; it returns `started`)
Replace `__TERM__` with the term as a JavaScript string literal (e.g. `"fitness tracking"`), `__CC__` with the two-letter country code (the quotes are already in the script), `__COMPAT__` and `__EXPAND__` with `true` or `false`, then paste the whole script as the code. Do not await it inline.

```js
(() => {
if (window.__smarKW && window.__smarKW.state === 'running') return 'already running';
const TERM = __TERM__, CC = '__CC__', COMPAT = __COMPAT__, SEEDS = 20, EXPAND = __EXPAND__, MAX_EXPAND = 400;
if (location.origin !== 'https://play.google.com') return 'WRONG_ORIGIN: navigate this tab to https://play.google.com/store/apps?hl=en&gl=' + CC;
const S = window.__smarKW = { state: 'running', phase: 'seeds', term: TERM, country: CC, compat: COMPAT, done: 0, total: 0 };
const U = 'undefined', own = Object.prototype.hasOwnProperty;
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
  if (COMPAT && raw(d, [1,2,118]) === undefined) { smarDrop.push(id); return null; }
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
const COLS = ['appName','appId','url','icon','developer','currency','price','description','avgRating','country','scrapedFrom','approximateInstalls','totalRatings','totalReviews','originalPrice','discountEndDate','downloadable','inAppPurchases','inAppPurchasesPriceRange','androidMinVersion','developerId','developerEmail','developerWebsite','developerAddress','privacyPolicyURL','genreId','contentRating','inAppAdvertisements','originalReleaseDate','currentAppVersion','currentVersionChanges','dateScraped'];
const csvCell = t => '"' + String(t).replace(/"/g, '""') + '"';
const smarDate = () => { const t = new Date(), p = x => String(x).padStart(2, '0'); return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][t.getUTCDay()] + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][t.getUTCMonth()] + ' ' + p(t.getUTCDate()) + ' ' + t.getUTCFullYear() + ' ' + p(t.getUTCHours()) + ':' + p(t.getUTCMinutes()) + ':' + p(t.getUTCSeconds()) + ' GMT+0000 (Coordinated Universal Time)'; };
const runList = async (ids, label, rows) => { S.total += ids.length; for (let i = 0; i < ids.length; i += 5) { const out = await Promise.allSettled(ids.slice(i, i + 5).map(id => one(id, label))); out.forEach((o, k) => { if (o.status === 'fulfilled') { if (o.value) rows.push(o.value); } else failed.push(ids[i + k] + ': ' + o.reason.message); S.done++; }); await sleep(250); } };
(async () => {
  try {
    const rows = [], ids0 = (await searchIds(TERM)).slice(0, SEEDS);
    if (!ids0.length) { window.__smarKW = Object.assign(S, { state: 'STOP', READY_TO_DELIVER: false, NEXT: 'STOP: no results for this search (nothing to write)' }); return; }
    await runList(ids0, 'keyword search', rows);
    const seedN = rows.length; let found = 0;
    if (EXPAND) {
      S.phase = 'similar'; const seen = new Set(rows.map(r => r.appId).concat(ids0)), extra = [];
      for (const r of rows.slice(0, seedN)) { try { for (const x of await searchIds('related to ' + titles[r.appId]) ) if (!seen.has(x)) { seen.add(x); extra.push(x); } } catch (e) { failed.push('search:' + r.appId + ': ' + e.message); } await sleep(200); S.found = extra.length; }
      found = extra.length; S.phase = 'details'; await runList(extra.slice(0, MAX_EXPAND), 'similar app links', rows);
    }
    const dateScraped = smarDate();
    window.__smarCSV = (COMPAT ? String.fromCharCode(65279) : '') + [COLS.map(csvCell).join(',')].concat(rows.map(r => COLS.map(c => c === 'dateScraped' ? dateScraped : csvCell(r[c])).join(','))).join('\n');
    const uc = {}; for (const c of COLS) { const n = rows.filter(r => r[c] === U).length; if (n) uc[c] = n; }
    const bySource = {}; rows.forEach(r => { bySource[r.scrapedFrom] = (bySource[r.scrapedFrom] || 0) + 1; });
    const total = ids0.length + Math.min(found, MAX_EXPAND), missing = total - rows.length;
    const ready = rows.length > 0 && failed.filter(f => !f.startsWith('search:')).length <= Math.max(2, Math.floor(0.02 * total));
    const slug = TERM.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    Object.assign(S, { state: 'done', phase: 'done', READY_TO_DELIVER: ready, NEXT: ready ? 'DELIVER' : 'RETRY: failures above the 2% limit; run again once, then report', file: 'smar_play_' + slug + '_' + CC.toLowerCase() + '.csv', csvRows: rows.length, seeds: seedN, bySource, wrongStorefront: wrongStore.length, smarWouldDrop: smarDrop.length, smarDropIds: smarDrop, notCollected: missing - smarDrop.length, failed: failed.length, failedSample: failed.slice(0, 5), quarantinedApps: Object.keys(quarantined).length, quarantinedCells: Object.values(quarantined).reduce((a, x) => a + x.length, 0), quarantinedSample: Object.entries(quarantined).slice(0, 5), undefinedCounts: uc, unratedApps: softUnrated.length, mode: COMPAT ? 'compat-lite (BOM, developerAddress undefined, quotes doubled; drops apps whose page lacks the categories slot, the main SMAR drop rule; other SMAR quirks not replicated)' : 'default (page values)' });
  } catch (e) { Object.assign(S, { state: 'ERR', READY_TO_DELIVER: false, NEXT: 'STOP: ' + String(e && e.message || e) }); }
})();
return 'started';
})()
```

## Step 4. Poll (short reads only)
The tool output cuts off after about 1,000 characters, and one call must finish in under 45 s, so wait with `computer` `wait` (10 s max) between reads. Running: `JSON.stringify({s:window.__smarKW.state,p:window.__smarKW.phase,d:window.__smarKW.done,t:window.__smarKW.total,f:window.__smarKW.found})`. A search takes about 1-3 minutes. When `state` is `done`, read the summary in two short calls:
1. `(({READY_TO_DELIVER:r,NEXT:n,csvRows:c,seeds:s,bySource:b,wrongStorefront:w,smarWouldDrop:d,notCollected:x,failed:f,failedSample:fs})=>JSON.stringify({r,n,c,s,b,w,d,x,f,fs}))(window.__smarKW)`
2. `(({quarantinedApps:a,quarantinedCells:q,quarantinedSample:qs,undefinedCounts:u,unratedApps:un,mode:m})=>JSON.stringify({a,q,qs,u,un,m}))(window.__smarKW)`

States: `STOP` or `ERR` (the `NEXT` text says why): tell the user that sentence and stop (no results, consent or "unusual traffic" page, HTTP 403, wrong storefront). If the page reloaded, `window.__smarKW` is gone: repeat step 3 with identical inputs. If `READY_TO_DELIVER` is false, run step 3 once more; if it is still false, report it and do not deliver the file as final.

## Step 5. Deliver
Download with one call: `const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(new Blob([window.__smarCSV],{type:'text/csv;charset=utf-8'})),download:window.__smarKW.file});document.body.appendChild(a);a.click();a.remove();`. The file lands in the user's Downloads folder as `smar_play_<term>_<cc>.csv`. Chrome allows one automatic download per site per session: if a second run's file does not land, ask the user to allow automatic downloads for play.google.com (the icon in the address bar) and trigger the download again; the CSV stays in `window.__smarCSV` until the tab is closed or reloaded. Close the tab you opened when done.

## Step 6. Report (copy numbers from the two summary reads; compute nothing; never paste the CSV)
- Request: mode (default or compat-lite), exact TERM, country, EXPAND.
- File name and `csvRows` data rows; `bySource` (seeds and similar); `wrongStorefront`; `failed`; `smarWouldDrop` (compat only: apps left out because their page lacks the categories slot, as SMAR does); `notCollected`.
- Cells: `undefinedCounts` per column; `quarantinedApps` and `quarantinedCells` (failed a same-page cross-check, written `undefined`); `unratedApps` (no rating on the page).
- Say: "Values are read from Google Play and cross-checked on the same page; counts are live, so compare only with a SMAR run from the same hour."

## Known limits (state them when relevant)
- Similar apps come from one search per seed, "related to <title>", as the agent does, but the list is not deterministic: in the test, 173 of the agent's 189 rows were found by both runs, 16 only by the agent and 23 only by this skill. Matching rows were identical on every static cell.
- First search page per seed only (no continuation pages); no automatic layout-drift healing: if Google changes a data slot, the cross-checks write `undefined` and `undefinedCounts` jumps; report it and suggest `smar-playstore-agent`.
- Verified on one keyword ("fitness tracking", country US). Page-values default mode is checked by the same code path but was not compared file-to-file.