---
name: "smar-playstore-bulk-reviews"
description: "Collect bulk user reviews from the U.S. Google Play Store for one or more apps as a SMAR-format CSV (appId plus 11 review columns, newest first, up to 10,000 reviews per app), driven through your own Chrome (Claude in Chrome): an in-page extractor pages through Google's review feed and downloads the CSV. No Node or scripts needed."
---

# SMAR Play Store Bulk Reviews (v2): browser-driven

**How it works.** Claude drives the user's Chrome. One extractor script (below) is pasted into a play.google.com tab. It reads the app's review count from its detail page, then pages through Google's review feed (the same `UsvDTd` request smar-tool.org uses, 150 reviews per page, newest first, English) until it has SMAR's row count, builds SMAR's bulk-reviews CSV and downloads it. There is no scrolling of the reviews dialog, no localStorage and no shell step. The old approach (scrolling "See all reviews" and reading card attributes) produced only a few hundred reviews and a different schema; do not use it. Verified 2026-10-04 on com.spotlightsix.zentimerlite2 (20,780 reviews) in compat mode against a SMAR export taken minutes earlier: identical header, BOM, 10,000 rows, trailing newline, and 295 rows sampled evenly through the file were byte-identical (ids, ISO timestamps with SMAR's millisecond quirk, ratings, text, `null` replies, versions, helpful votes).

## Hard rules
- Never type, copy, round, estimate or edit a data value, and never edit the CSV. A cell that fails its format check is the text `undefined`.
- Never collect reviewer names or images (SMAR excludes them too).
- Never scroll or read the reviews dialog, and never use screenshots, `read_page`, `get_page_text` or `find` on play.google.com. Only read the short status JSON described in step 4.
- Paste the extractor verbatim; change only the four `__...__` placeholders. Never wrap it in `eval`, `new Function` or a script tag (Play enforces Trusted Types).
- No Apple App Store (reply "This skill covers Google Play only; App Store needs a separate skill."). Keyword search and top charts are out of scope: use `smar-playstore-keyword-search` or `smar-playstore-top-charts`.

## Step 1. Inputs (never guess)
- IDS = the package ids (the `id=` value in the store URL, e.g. `com.duolingo`), as a JavaScript array of strings: `['com.duolingo']`. Several apps give one combined file (SMAR's Bulk page). If the user gives only a name or a URL, take the id from the URL; for a bare name ask once for the package id.
- CC = store country, two letters upper case (default US). Non-US countries are not yet verified: say so.
- MODE: default (COMPAT = false) writes true values: real milliseconds, each review once, no BOM. Use `compat` (COMPAT = true) when the user wants SMAR's file byte for byte: BOM, SMAR's millisecond bug (a time like `.059Z` is written `.590Z`, about 10% of rows) and SMAR's padding (if Google's feed ends before the review count, SMAR repeats the last page to reach the count).
- ALLOW_LARGE = `false`: an app with 100,000 or more reviews is skipped, as SMAR's results table offers no review button for it. Set `true` only if the user explicitly asks (SMAR's Bulk page itself has no such limit).
- Row count per app is SMAR's: the newest `min(review count, 10000)`; Google often holds two to three times more older reviews, which are not fetched.

## Step 2. Open the tab
`tabs_context_mcp` first; then `tabs_create_mcp` and `navigate` to `https://play.google.com/store/apps?hl=en&gl=<CC>` (a new tab, never reuse one). The extractor refuses any other origin.

## Step 3. Run the extractor (one `javascript_tool` call; it returns `started`)
Replace `__IDS__` with the JavaScript array, `__CC__` with the two-letter country code, `__COMPAT__` and `__ALLOW_LARGE__` with `true` or `false`, then paste the whole script as the code. Do not await it inline.

```js
(() => {
if (window.__smarRV && window.__smarRV.state === 'running') return 'already running';
const IDS = __IDS__, CC = '__CC__', COMPAT = __COMPAT__, ALLOW_LARGE = __ALLOW_LARGE__, MAXR = 10000, PAGE = 150;
if (location.origin !== 'https://play.google.com') return 'WRONG_ORIGIN: navigate this tab to https://play.google.com/store/apps?hl=en&gl=' + CC;
const S = window.__smarRV = { state: 'running', phase: 'count', app: '', apps: {}, rows: 0 };
const U = 'undefined', sleep = ms => new Promise(r => setTimeout(r, ms));
const tail = a => { const r = a.length ? a[a.length - 1] : undefined; return r && typeof r === 'object' && !Array.isArray(r) && Object.keys(r).every(k => /^\d+$/.test(k) && +k >= a.length) ? r : null; };
const raw = (o, p) => { let n = o; for (const k of p) { if (n == null) return; const t = Array.isArray(n) && k >= n.length - 1 ? tail(n) : null; n = t ? t[String(k + 1)] : n[k]; } return n; };
const blobs = h => { const out = {}, re = /AF_initDataCallback\s*\(\s*\{\s*['"]?key['"]?\s*:\s*['"]([^'"]+)['"]/g; let m; while ((m = re.exec(h))) { let e = h.indexOf('</script>', m.index); if (e < 0) e = h.length; const a = h.slice(m.index, e), d = /[,{]\s*['"]?data['"]?\s*:\s*/.exec(a); if (!d) continue; const s = d.index + d[0].length; if (a[s] !== '[' && a[s] !== '{') continue; let c = 0, q = false, u = s; for (; u < a.length; u++) { const ch = a[u]; if (q) { if (ch === '\\') u++; else if (ch === '"') q = false; } else if (ch === '"') q = true; else if (ch === '[' || ch === '{') c++; else if ((ch === ']' || ch === '}') && --c === 0) break; } if (c === 0) try { out[m[1]] = JSON.parse(a.slice(s, u + 1)); } catch (_) {} } return out; };
const cleanText = t => { if (typeof t !== 'string') return t; let x = t.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'"); x = x.replace(/"/g, '""').replace(/<br\s*\/?>/g, ' '); return x.replace(/\r?\n|\r/g, ' '); };
const smarDate = () => { const t = new Date(), p = x => String(x).padStart(2, '0'); return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][t.getUTCDay()] + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][t.getUTCMonth()] + ' ' + p(t.getUTCDate()) + ' ' + t.getUTCFullYear() + ' ' + p(t.getUTCHours()) + ':' + p(t.getUTCMinutes()) + ':' + p(t.getUTCSeconds()) + ' GMT+0000 (Coordinated Universal Time)'; };
// gps generateDate: compat zero-pad bug (.059 -> .590); default = the true time
const fmt = (a, quirk) => { if (!a) return null; if (quirk) return new Date(Number(`${a[0]}${String(a[1] || '000').substring(0, 3)}`)).toJSON(); return new Date(a[0] * 1000 + Math.floor((a[1] || 0) / 1e6)).toJSON(); };
const dateOk = (a, now) => Array.isArray(a) && Number.isInteger(a[0]) && a[0] > 1.2e9 && a[0] < now / 1000 + 86400 && (a[1] == null || (Number.isInteger(a[1]) && a[1] >= 0 && a[1] < 1e9 && a[1] % 1e6 === 0));
const badCols = (r, now) => { if (!Array.isArray(r)) return ['reviewID','dateReviewed','rating','reviewText','developerReplyDate','developerReplyText','versionWhenReviewed','helpfulVotes']; const b = []; if (typeof r[0] !== 'string' || !/^(gp:)?[\w-]{8,}$/.test(r[0])) b.push('reviewID'); if (!Number.isInteger(r[2]) || r[2] < 1 || r[2] > 5) b.push('rating'); if (!dateOk(r[5], now)) b.push('dateReviewed'); if (r[4] != null && typeof r[4] !== 'string') b.push('reviewText'); if (!Number.isInteger(r[6]) || r[6] < 0) b.push('helpfulVotes'); if (r[10] != null && typeof r[10] !== 'string') b.push('versionWhenReviewed'); if (r[7] != null) { if (!Array.isArray(r[7])) b.push('developerReplyText', 'developerReplyDate'); else { if (r[7][1] != null && typeof r[7][1] !== 'string') b.push('developerReplyText'); if (r[7][2] != null && !dateOk(r[7][2], now)) b.push('developerReplyDate'); } } return b; };
const getText = async url => { let last; for (let i = 0; i < 4; i++) { try { const r = await fetch(url, { credentials: 'omit' }); if (r.ok) return { url: r.url, text: await r.text() }; last = 'HTTP ' + r.status; if (r.status === 403 || r.status === 404) break; } catch (e) { last = String(e && e.message || e); } await sleep(700 * (i + 1)); } throw new Error(last || 'fetch failed'); };
const endpoint = '/_/PlayStoreUi/data/batchexecute?rpcids=qnKhOb&f.sid=-697906427155521722&bl=boq_playuiserver_20190903.08_p0&hl=en&gl=' + CC + '&authuser&soc-app=121&soc-platform=1&soc-device=1&_reqid=1065213';
const reqBody = (id, tok) => 'f.req=' + encodeURIComponent(JSON.stringify([[['UsvDTd', '[null,null,[2,2,[' + PAGE + ',null,' + (tok ? JSON.stringify(tok) : 'null') + '],null,[]],' + JSON.stringify([id, 7]) + ']', null, 'generic']]]));
const page = async (id, tok) => { let last; for (let i = 0; i < 4; i++) { try { const r = await fetch(endpoint, { method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: reqBody(id, tok) }); const t = await r.text(); if (/consent\.google|\/sorry\//.test(r.url) || /unusual traffic/i.test(t)) throw new Error('consent_or_sorry_page'); if (r.status !== 200) throw new Error('HTTP ' + r.status); if (!/^\s*\)\]\}'/.test(t)) throw new Error('not a batchexecute response'); let env; for (const l of t.split('\n')) { if (l[0] !== '[') continue; try { for (const e of JSON.parse(l)) if (Array.isArray(e) && e[0] === 'wrb.fr') { if (!env || e[1] === 'UsvDTd') env = e; } } catch (_) {} } if (!env) throw new Error('no wrb.fr envelope'); if (env[2] == null) { if (env[5] != null) throw new Error('RPC error ' + JSON.stringify(env[5]).slice(0, 100)); return { reviews: [], token: null }; } const d = JSON.parse(env[2]); if (d === null || (Array.isArray(d) && !d.length)) return { reviews: [], token: null }; if (!Array.isArray(d) || (d[0] != null && !Array.isArray(d[0]))) throw new Error('layout changed (review list)'); const tk = raw(d, [1, 1]); return { reviews: d[0] || [], token: typeof tk === 'string' ? tk : null }; } catch (e) { last = e; if (/layout|consent/.test(e.message)) break; await sleep(2000 * (i + 1)); } } throw last; };
const HEAD = ['reviewID','dateReviewed','rating','reviewURL','reviewText','developerReplyDate','developerReplyText','versionWhenReviewed','helpfulVotes','country','dateScraped'];
(async () => {
  try {
    const blocks = [], apps = {}, problems = [], now = Date.now(), dateScraped = smarDate();
    for (const id of IDS) {
      S.app = id; S.phase = 'count';
      const a = apps[id] = { count: null, fetched: 0, uniq: 0, dup: 0, stop: '', pad: 0, msQuirkRows: 0, quarantinedCells: {} };
      S.apps = apps;
      const r = await getText('/store/apps/details?id=' + encodeURIComponent(id) + '&hl=en&gl=' + CC), h = r.text;
      if (/consent\.google|\/sorry\//.test(r.url)) throw new Error('consent_or_sorry_page');
      const lang = (h.match(/<html[^>]*\blang="([^"]+)"/) || [])[1], sf = (h.match(/"fjF0tb":"([A-Z]{2})"/) || [])[1];
      if (!/^en(-US)?$/i.test(lang || '') || (sf && sf !== CC)) { a.stop = 'wrong-storefront'; problems.push(id + ': wrong storefront'); continue; }
      let d = null; for (const b of Object.values(blobs(h))) if (typeof raw(b, [1,2,0,0]) === 'string' && JSON.stringify(b).includes(id)) { d = b; break; }
      const cnt = d && raw(d, [1,2,51,3,1]), rat = d && raw(d, [1,2,51,2,1]);
      if (!Number.isInteger(cnt) || cnt < 0 || (Number.isInteger(rat) && cnt > rat)) { a.stop = 'layout-drift:reviewCount'; problems.push(id + ': review count unreadable (layout drift)'); continue; }
      a.count = cnt;
      if (cnt >= 100000 && !ALLOW_LARGE) { a.stop = 'ineligible'; problems.push(id + ': ' + cnt + ' reviews is at or above SMAR\'s 100,000 cap; skipped'); continue; }
      const limit = cnt && cnt < MAXR ? cnt : MAXR; a.limit = limit;
      S.phase = 'reviews';
      const seen = new Set(), rows = []; let tok = null, last = [], emptyRun = 0, guard = 0, lastTok;
      for (;;) {
        const pg = await page(id, tok); guard++;
        const bad = {}; let n = pg.reviews.length;
        const fresh = [];
        for (const rv of pg.reviews) { const b = badCols(rv, now); for (const k of b) bad[k] = (bad[k] || 0) + 1; const rid = Array.isArray(rv) ? rv[0] : undefined; if (seen.has(rid)) { a.dup++; continue; } seen.add(rid); fresh.push({ rv, b }); }
        const drift = Object.keys(bad).filter(k => bad[k] >= Math.max(2, n / 2));
        if (drift.length) { a.stop = 'layout-drift:' + drift.join(','); problems.push(id + ': Google changed the review layout (' + drift.join(',') + ')'); break; }
        for (const { rv, b } of fresh) { const o = Array.isArray(rv) ? rv : []; rows.push({ id: o[0], d: o[5] || null, s: o[2], t: o[4], rd: raw(o, [7, 2]) || null, rt: raw(o, [7, 1]) || null, v: o[10] || null, u: o[6], q: b }); }
        a.fetched += n; last = pg.reviews.slice(0, PAGE); S.rows = rows.length; S.done = rows.length;
        emptyRun = !n && pg.token ? emptyRun + 1 : 0;
        if (!pg.token) { a.stop = 'end-of-stream'; break; }
        if (rows.length >= limit) { a.stop = 'limit'; break; }
        if (emptyRun >= 5) { a.stop = 'empty-token-loop'; break; }
        if (n && !fresh.length && pg.token === tok) { a.stop = 'token-loop'; break; }
        if (guard > 200) { a.stop = 'page-cap'; break; }
        tok = pg.token; await sleep(250);
      }
      if (a.stop.startsWith('layout-drift')) continue;
      a.uniq = rows.length;
      let out = rows.slice(0, limit);
      if (COMPAT && a.stop === 'end-of-stream' && out.length < limit && last.length) { // SMAR re-sends the stale token and repeats the last call
        const rep = rows.slice(Math.max(0, rows.length - last.length)); a.pad = limit - out.length; let k = 0; while (out.length < limit) out.push(rep[k++ % rep.length]);
      }
      if (COMPAT && !out.length && a.count === 0) a.stop = 'smar-would-hang-or-empty';
      const lines = out.map(o => {
        a.msQuirkRows += (fmt(o.d, true) !== fmt(o.d, false) || fmt(o.rd, true) !== fmt(o.rd, false)) ? 1 : 0;
        const g = { reviewID: o.id, dateReviewed: fmt(o.d, COMPAT), rating: o.s, reviewURL: 'https://play.google.com/store/apps/details?id=' + id + '&reviewId=' + o.id, reviewText: o.t, developerReplyDate: fmt(o.rd, COMPAT), developerReplyText: o.rt, versionWhenReviewed: o.v, helpfulVotes: o.u, country: CC };
        for (const k of o.q) { g[k] = U; if (k === 'reviewID') g.reviewURL = U; a.quarantinedCells[k] = (a.quarantinedCells[k] || 0) + 1; }
        return '"' + id + '",' + HEAD.slice(0, 10).map(k => '"' + cleanText(g[k]) + '"').join(',') + ',' + (/[",\r\n]/.test(dateScraped) ? '"' + dateScraped.replace(/"/g, '""') + '"' : dateScraped);
      });
      blocks.push(lines);
    }
    const total = blocks.reduce((n, b) => n + b.length, 0);
    window.__smarCSV = (COMPAT ? String.fromCharCode(65279) : '') + '"appId",' + HEAD.map(h => '"' + h + '"').join(',') + '\n' + blocks.map(b => b.map(l => l + '\n').join('')).join('');
    const failedApps = Object.entries(apps).filter(([, a]) => /^(layout-drift|wrong-storefront|ineligible)/.test(a.stop)).length;
    const ready = total > 0 && !failedApps;
    const nullV = {}; Object.assign(S, { state: 'done', phase: 'done', rows: total, READY_TO_DELIVER: ready, NEXT: ready ? 'DELIVER' : (total ? 'REVIEW: some apps were skipped (see problems); deliver only with the user\'s OK' : 'STOP: no review rows were collected (see problems)'), file: 'smar_play_reviews_' + (IDS.length === 1 ? IDS[0].replace(/[^a-z0-9]+/gi, '_').toLowerCase() : 'bulk') + '_' + CC.toLowerCase() + '.csv', problems, mode: COMPAT ? 'compat (BOM, SMAR millisecond quirk, padding like SMAR)' : 'default (true milliseconds, each review once, no BOM)', apps: Object.fromEntries(Object.entries(apps).map(([k, a]) => [k, { count: a.count, limit: a.limit, rows: a.uniq, stop: a.stop, dup: a.dup, pad: a.pad, msQuirkRows: a.msQuirkRows, q: a.quarantinedCells }])) });
  } catch (e) { Object.assign(S, { state: 'ERR', READY_TO_DELIVER: false, NEXT: 'STOP: ' + String(e && e.message || e) }); }
})();
return 'started';
})()
```

## Step 4. Poll (short reads only)
Wait with `computer` `wait` (10 s max) between reads; one call must finish in under 45 s. Running: `JSON.stringify({s:window.__smarRV.state,p:window.__smarRV.phase,a:window.__smarRV.app,r:window.__smarRV.rows})`. 10,000 reviews take about one minute. When `state` is `done`, read the summary in one short call: `(({READY_TO_DELIVER:r,NEXT:n,rows:c,mode:m,file:f,problems:p,apps:a})=>JSON.stringify({r,n,c,m,f,p,a}))(window.__smarRV)`.

States: `ERR` (the `NEXT` text says why): tell the user that sentence and stop (consent or "unusual traffic" page, HTTP error, review feed changed). If the page reloaded, `window.__smarRV` is gone: repeat step 3 with identical inputs. If `READY_TO_DELIVER` is false and rows were collected, tell the user which apps were skipped and why (`problems`) and deliver only with their OK.

## Step 5. Ask, then deliver
Tell the user the row count and ask before downloading. Download with one call: `const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(new Blob([window.__smarCSV],{type:'text/csv;charset=utf-8'})),download:window.__smarRV.file});document.body.appendChild(a);a.click();a.remove();`. The file lands in the user's Downloads folder as `smar_play_reviews_<app>_<cc>.csv` (`bulk` instead of the app id when several apps). Chrome allows one automatic download per site per session: if a second run's file does not land, ask the user to allow automatic downloads for play.google.com and trigger the download again; the CSV stays in `window.__smarCSV` until the tab is closed or reloaded. Close the tab you opened when done.

## Step 6. Report (copy numbers from the summary; compute nothing; never paste the CSV)
- Request: mode, IDS, country.
- Per app (`apps`): `count` (Google's review count), `limit` (SMAR's row count), `rows` collected, `stop` reason (`limit` or `end-of-stream`), `pad` (rows SMAR would repeat; compat only), `msQuirkRows` (rows whose time SMAR writes with the millisecond bug), `q` (cells written `undefined`).
- Skipped apps and why (`problems`): 100,000+ reviews, wrong storefront, review layout changed.
- Say: "Reviews are live and new ones arrive constantly, so compare with a SMAR export only from the same hour."

## File format
Header (12 columns), every cell double-quoted, `dateScraped` bare, one review per line (line breaks inside a review become spaces), every line ending with `\n` including the last; compat adds a BOM at the very start:
`"appId","reviewID","dateReviewed","rating","reviewURL","reviewText","developerReplyDate","developerReplyText","versionWhenReviewed","helpfulVotes","country","dateScraped"`
- `appId` is the requested id; `dateReviewed` and reply date are ISO 8601 UTC with milliseconds, e.g. `2026-10-03T23:35:36.214Z`; `rating` 1-5; `reviewURL` is `https://play.google.com/store/apps/details?id=<appId>&reviewId=<reviewID>` (no `gl`/`hl`).
- `versionWhenReviewed` is the app version from the review record (present on most reviews). A review with no developer reply, or no version, has the text `null` in that cell, exactly as in SMAR's file; this is Google's own null, not a failed check. `undefined` means the cell failed its format check.
- `helpfulVotes` integer; `country` e.g. `US`; `dateScraped` like `Mon Oct 05 2026 01:04:07 GMT+0000 (Coordinated Universal Time)`, the same on every row.
- pandas: `pd.read_csv(path, na_values=['undefined', 'null'])`.

## Known limits (state them when relevant)
- Reviews are newest first (SMAR ignores its sort dropdown too) and capped at 10,000 per app, as in SMAR.
- Verified on one app (US, compat mode) against a SMAR export. Default mode shares the same code path and differs only in the BOM, true milliseconds and no padding; it was not compared file to file. SMAR's padding replay (stream shorter than the count) is implemented but was not exercised by the test app.
- When Google returns a short page that still has a continuation token, SMAR's library can drop reviews; this extractor keeps every review it receives, so a very rare row difference is possible.
- No automatic layout-drift healing: if Google changes the review feed, the run stops with `Google changed the review layout`. Report it and suggest `smar-playstore-agent`.
