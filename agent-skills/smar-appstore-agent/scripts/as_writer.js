// as_writer.js -- smar-appstore-agent: SMAR iOS CSV writer (search / ids / chart / reviews / bulk-reviews layouts).
// UMD: Node `require('./as_writer')`, browser `window.SMAR_AS_WRITER`. Pure, dependency-free, no I/O, no fetch.
//
// Byte contract (PLAN.md section 4.5, HARNESS.md section 3): the compat renderer is SMAR's utilities/jsonToCsv.js
// re-implemented statement for statement (columns = Object.keys(first row) minus EXCLUDE, `key in row` ? `"${cleanText(v)}"`
// : '' , the "primary search"/"related app" value swap on ANY cell, unquoted dateScraped, fixColumns' chained
// String#replace renames, cleaned + quoted header, '\n' joins, no trailing newline). Tested byte-identical against the
// vendored jsonToCsv on every recorded lookup record, both GT reviews feeds, the 4 GT files and a cleanText fuzz
// (eval/appstore/build_notes/writer_identity_test.js; results in eval/appstore/build_notes/writer.md).
//
// EXPORTS
//   Constants
//     VERSION                       '2.1.0'
//     EXCLUDE                       jsonToCsv's columnsToExclude, verbatim (Play-era list; 'title' is added for reviews)
//     RENAME                        {app:{key:header}, reviews:{key:header}} -- the effective fixColumns result (docs only;
//                                   rendering always runs the verbatim chained replace in smarFixColumns)
//     HEADERS                       {search[34], chart[32], reviews[9], bulkReviews[10]} header names, dateScraped last
//     LAYOUTS                       ['search','ids','chart','reviews','bulkReviews']  ('ids' renders exactly like 'search')
//     LABELS                        {primary:'primary search', related:'related app', keyword:'keyword search',
//                                    similar:'similar app links'}
//   Row shape (app-store-scraper 0.18, verbatim key order -> CSV column order)
//     cleanApp(raw)                 lib/common.js cleanApp: lookup result -> app object (33 keys incl. description, free)
//     keepResult(raw)               lookup()'s filter: wrapperType undefined or 'software'
//     ensureArray(x)                reviews.js ensureArray: falsy -> [], array -> itself, other -> [x]
//     cleanList(entries)            lib/reviews.js cleanList on feed.entry (pass ensureArray(feed.entry)); THROWS like
//                                   SMAR on a malformed entry (validate first, as_reviews does)
//     searchRow(raw, cc, source)    {...cleanApp(raw), country:cc, source}  (searchController: {...result, country, source,
//                                   ...appDetails}); source 'primary search'|'related app' (or the output labels
//                                   'keyword search'|'similar app links', mapped back to the internal labels)
//     chartRow(raw)                 cleanApp(raw)  (listController hands list({fullDetail}) output straight to jsonToCsv)
//     reviewRow(review, cc)         {...review, country:cc}  (reviewsController)
//     bulkReviewRow(appId, review, cc)  {appId, ...review, country:cc}  (SMAR's intended bulk layout, appId first)
//   Cells and text
//     smarCleanText(v)              SMAR cleanText, verbatim (non-strings returned unchanged)
//     defaultCleanText(v)           default-mode cleanText: identical except only real tags `<\/?[A-Za-z][^<>]*>` are
//                                   stripped (Q4: "I <3 it > ok" survives)
//     renderCell(v, {compat, column}) -> inner cell text WITHOUT the outer quotes. compat = `${smarCleanText(v)}` plus the
//                                   label swap on any column; default = defaultCleanText, arrays cleaned element-wise
//                                   (Q5), label swap only when column === 'source' (Q6). Template-literal stringification
//                                   keeps JS number/literal formatting: 0, 4.99, 5, undefined, null, '' for [].
//     smarDate(now)                 Date#toString() as on a UTC host: 'Thu Oct 01 2026 20:26:33 GMT+0000 (Coordinated
//                                   Universal Time)'. now: Date | ms | ISO string | undefined (= current time)
//     smarFixColumns(cols, source)  jsonToCsv fixColumns, verbatim chained String#replace ('app' | 'reviews')
//     smarHeader(layout, firstRow)  header names for a layout, from the first row's keys (or the canonical row)
//   Whole files
//     smarJsonToCsv(rows, source, {dateString|now})  the oracle-equivalent of jsonToCsv(rows, source) ('app'|'reviews');
//                                   returns SMAR's backend body (no BOM). [] -> '"dateScraped"' (13 bytes)
//     toCsv(rows, {layout, compat, now, dateString, stats}) -> string WITHOUT BOM. compat === smarJsonToCsv. default
//                                   differs only per Q4-Q6. stats (optional out-param) receives
//                                   {defaultFixes:{col:n}, undefinedCounts:{col:n}, refusedCells:{col:n}, rows:n};
//                                   col = output header name. refusedCells: values the shape guard would not
//                                   stringify (an object or array in a scalar column, a non-scalar list element),
//                                   written as "undefined" in BOTH modes instead of "[object Object]".
//                                   Default mode with 0 rows returns null (A7: never a 0-row CSV in default).
//     bomFor(layout, compat)        '﻿' when compat and layout in search|ids|reviews|bulkReviews; '' otherwise
//     renderFile(rows, {layout, compat, now, dateString}) -> {text, body, bom, stats, rows, empty, dateScraped}
//                                   text = bom + body (what goes on disk, UTF-8); text null in default mode with 0 rows
//     smarFrontendBulk(parts)       the website's BulkReviewSearchBar.combineCSVBlobs, exact: parts = [{appId, csv}] with
//                                   csv = each app's backend body; returns '﻿' + header + blocks, each block ending
//                                   '\n' (0-row app -> an empty line). Diagnostic only: compat bulk records
//                                   bulk_frontend_not_reproduced (PLAN 4.3).
//     smarFileName(info, now)       SMAR's download name: search/ids '<query>_<M><D><YYYY>.csv' (UTC, unpadded),
//                                   chart '<collection><categoryName><CC>_<M><D><YYYY>.csv', reviews '<bundleId>_reviews.csv',
//                                   bulkReviews 'reviews_<MM><DD><YYYY>.csv' (padded; browser local time -> UTC here)
//                                   info = {layout, query|term, collection, categoryName, country, bundleId}
//     parseCsv(text)                minimal RFC-4180 parser (tolerates a BOM, unquoted dateScraped) -> string[][]
//
// Notes: lone UTF-16 surrogates are left in the string; Buffer.from(text,'utf8') / Blob encode them as EF BF BD, which is
// exactly what SMAR's res.send does, so bytes on disk match. Write with '\n' only; never append a trailing newline.
(function asWriter(root) {
  'use strict';
  const VERSION = '2.1.0';

  // ------------------------------------------------------------------ constants (jsonToCsv.js, verbatim)
  const EXCLUDE = ['free', 'scoreText', 'installs', 'genre', 'androidMaxVersion', 'previewVideo', 'criterias', 'userName',
    'userImage', 'comments', 'descriptionHTML', 'contentRatingDescription', 'videoImage', 'video', 'headerImage',
    'familyGenreID', 'familyGenre', 'developerInternalID', 'requiredOsVersionText', 'histogram', 'minInstalls', 'priceText',
    'description', 'categories', 'preregister', 'earlyAccessEnabled', 'isAvailableInPlayPass', 'similarityScore', 'userURL'];
  const LABELS = { primary: 'primary search', related: 'related app', keyword: 'keyword search', similar: 'similar app links' };
  const LAYOUTS = ['search', 'ids', 'chart', 'reviews', 'bulkReviews'];

  // fixColumns, verbatim: a chain of first-occurrence String#replace calls, in SMAR's order.
  const APP_CHAIN = [['title', 'appName'], ['summary', 'description'], ['score', 'avgRating'], ['source', 'scrapedFrom'],
    ['maxInstalls', 'approximateInstalls'], ['ratings', 'totalRatings'], ['reviews', 'totalReviews'], ['available', 'downloadable'],
    ['offersIAP', 'inAppPurchases'], ['IAPRange', 'inAppPurchasesPriceRange'], ['androidVersion', 'androidMinVersion'],
    ['privacyPolicy', 'privacyPolicyURL'], ['adSupported', 'inAppAdvertisements'], ['released', 'originalReleaseDate'],
    ['version', 'currentAppVersion'], ['recentChanges', 'currentVersionChanges'], ['size', 'appSizeInBytes'],
    ['screenshots', 'appScreenshots'], ['ipadScreenshots', 'appIpadScreenshots'], ['appletvScreenshots', 'appletvScreenshots'],
    ['languages', 'supportedLanguages'], ['currentVersionScore', 'currentVersionAvgRating'], ['supportedDevices', 'supportedDeviceList'],
    ['developerUrl', 'developerAppStorePageURL'], ['updated', 'lastUpdated'], ['genreIds', 'genreIDs']];
  const REVIEWS_CHAIN = [['id', 'reviewID'], ['updated', 'dateReviewed'], ['score', 'rating'], ['url', 'reviewURL'],
    ['text', 'reviewText'], ['version', 'versionWhenReviewed'], ['dateReviewedScraped', 'dateScraped']];
  function smarFixColumns(oldColumns, source) {
    const chain = source === 'app' ? APP_CHAIN : REVIEWS_CHAIN;
    return oldColumns.map((column) => { let c = column; for (const [a, b] of chain) c = c.replace(a, b); return c; });
  }

  // ------------------------------------------------------------------ app-store-scraper 0.18 row shapes (verbatim)
  function cleanApp(app) {
    return {
      id: app.trackId,
      appId: app.bundleId,
      title: app.trackName,
      url: app.trackViewUrl,
      description: app.description,
      icon: app.artworkUrl512 || app.artworkUrl100 || app.artworkUrl60,
      genres: app.genres,
      genreIds: app.genreIds,
      primaryGenre: app.primaryGenreName,
      primaryGenreId: app.primaryGenreId,
      contentRating: app.contentAdvisoryRating,
      languages: app.languageCodesISO2A,
      size: app.fileSizeBytes,
      requiredOsVersion: app.minimumOsVersion,
      released: app.releaseDate,
      updated: app.currentVersionReleaseDate || app.releaseDate,
      releaseNotes: app.releaseNotes,
      version: app.version,
      price: app.price,
      currency: app.currency,
      free: app.price === 0,
      developerId: app.artistId,
      developer: app.artistName,
      developerUrl: app.artistViewUrl,
      developerWebsite: app.sellerUrl,
      score: app.averageUserRating,
      reviews: app.userRatingCount,
      currentVersionScore: app.averageUserRatingForCurrentVersion,
      currentVersionReviews: app.userRatingCountForCurrentVersion,
      screenshots: app.screenshotUrls,
      ipadScreenshots: app.ipadScreenshotUrls,
      appletvScreenshots: app.appletvScreenshotUrls,
      supportedDevices: app.supportedDevices,
    };
  }
  const keepResult = (r) => typeof r.wrapperType === 'undefined' || r.wrapperType === 'software';
  const ensureArray = (x) => (!x ? [] : Array.isArray(x) ? x : [x]); // verbatim: any falsy value -> []
  // lib/reviews.js cleanList, given ensureArray(results.feed.entry). Throws on a malformed entry, as SMAR does.
  function cleanList(entries) {
    return ensureArray(entries).map((review) => ({
      id: review.id.label,
      userName: review.author.name.label,
      userUrl: review.author.uri.label,
      version: review['im:version'].label,
      score: parseInt(review['im:rating'].label),
      title: review.title.label,
      text: review.content.label,
      url: review.link.attributes.href,
      updated: review.updated.label,
    }));
  }
  const internalSource = (s) => (s === LABELS.keyword ? LABELS.primary : s === LABELS.similar ? LABELS.related : s == null ? LABELS.primary : s);
  const searchRow = (raw, cc, source) => Object.assign(cleanApp(raw), { country: cc, source: internalSource(source) });
  const chartRow = (raw) => cleanApp(raw);
  const reviewRow = (review, cc) => Object.assign({}, review, { country: cc });
  const bulkReviewRow = (appId, review, cc) => Object.assign({ appId }, review, { country: cc });

  // ------------------------------------------------------------------ cleanText
  function smarCleanText(text) {
    if (typeof text !== 'string') return text;
    let t = text.replace(/<[^>]+>/g, '')
      .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");
    t = t.replace(/"/g, '""');
    t = t.replace(/<br\s*\/?>/g, ' ');
    t = t.replace(/\r?\n|\r/g, ' ');
    return t;
  }
  function defaultCleanText(text) {
    if (typeof text !== 'string') return text;
    let t = text.replace(/<\/?[A-Za-z][^<>]*>/g, '')
      .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");
    t = t.replace(/"/g, '""');
    t = t.replace(/<br\s*\/?>/g, ' ');
    t = t.replace(/\r?\n|\r/g, ' ');
    return t;
  }
  // Array#join semantics (null/undefined elements -> '', nested arrays recurse) with each string element cleaned.
  const joinClean = (arr) => arr.map((e) => (e == null ? '' : Array.isArray(e) ? joinClean(e) : typeof e === 'string' ? defaultCleanText(e) : `${e}`)).join(',');
  // Shape guard (both modes): a column whose value is not text, a number, a boolean, null or undefined -- or, in a list
  // column, a list whose elements are not -- is never stringified (`${obj}` would write "[object Object]" on every row
  // when Apple changes a field's type). The cell is written as "undefined" and counted in stats.refusedCells.
  const LIST_KEYS = { genres: 1, genreIds: 1, languages: 1, screenshots: 1, ipadScreenshots: 1, appletvScreenshots: 1, supportedDevices: 1 };
  const isScalar = (v) => v == null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
  function renderable(column, v) {
    if (isScalar(v)) return true;
    return !!LIST_KEYS[column] && Array.isArray(v) && v.every(isScalar);
  }
  function swapLabel(v) { return v === LABELS.primary ? LABELS.keyword : v === LABELS.related ? LABELS.similar : v; }
  function renderCell(v, o) {
    o = o || {};
    if (o.compat) return swapLabel(`${smarCleanText(v)}`);
    const s = Array.isArray(v) ? joinClean(v) : `${defaultCleanText(v)}`;
    return o.column === 'source' ? swapLabel(s) : s;
  }

  // ------------------------------------------------------------------ dateScraped
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p2 = (n) => String(n).padStart(2, '0');
  const toDate = (now) => (now == null ? new Date() : now instanceof Date ? now : new Date(now));
  function smarDate(now) {
    const d = toDate(now);
    if (isNaN(d.getTime())) return 'Invalid Date';
    const y = d.getUTCFullYear(), ys = y < 0 ? '-' + String(-y).padStart(6, '0') : String(y).padStart(4, '0');
    return `${WD[d.getUTCDay()]} ${MO[d.getUTCMonth()]} ${p2(d.getUTCDate())} ${ys} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())} GMT+0000 (Coordinated Universal Time)`;
  }

  // ------------------------------------------------------------------ the renderer (jsonToCsv, statement for statement)
  const sourceOf = (layout) => (layout === 'reviews' || layout === 'bulkReviews' ? 'reviews' : 'app');
  function columnsFor(firstRow, source) {
    const ex = source === 'reviews' ? EXCLUDE.concat('title') : EXCLUDE;
    const cols = Object.keys(firstRow || {}).filter((c) => !ex.includes(c));
    cols.push('dateScraped');
    return cols;
  }
  function render(rows, source, o) {
    o = o || {};
    const compat = o.compat !== false;
    const stamp = o.dateString != null ? String(o.dateString) : smarDate(o.now);
    const columns = columnsFor(rows[0], source);
    const header = smarFixColumns(columns, source);
    const stats = o.stats;
    if (stats) { stats.defaultFixes = stats.defaultFixes || {}; stats.undefinedCounts = stats.undefinedCounts || {}; stats.refusedCells = stats.refusedCells || {}; stats.rows = (stats.rows || 0) + rows.length; }
    const out = [];
    for (const row of rows) {
      const vals = [];
      for (let i = 0; i < columns.length; i++) {
        const column = columns[i];
        if (column in row) {
          const v = row[column];
          if (!renderable(column, v)) {
            if (stats) stats.refusedCells[header[i]] = (stats.refusedCells[header[i]] || 0) + 1;
            vals.push('"undefined"');
            continue;
          }
          const cell = renderCell(v, { compat, column });
          if (stats) {
            const h = header[i];
            if (v === undefined) stats.undefinedCounts[h] = (stats.undefinedCounts[h] || 0) + 1;
            if (!compat && cell !== renderCell(v, { compat: true, column })) stats.defaultFixes[h] = (stats.defaultFixes[h] || 0) + 1;
          }
          vals.push('"' + cell + '"');
        } else if (column === 'dateScraped') vals.push(stamp);
        else vals.push('');
      }
      out.push(vals.join(','));
    }
    out.unshift(header.map((c) => `"${smarCleanText(c)}"`).join(','));
    return out.join('\n');
  }
  function smarJsonToCsv(rows, source, o) {
    o = o || {};
    return render(rows || [], source === 'reviews' ? 'reviews' : 'app', { compat: true, now: o.now, dateString: o.dateString });
  }
  function toCsv(rows, o) {
    o = o || {};
    rows = rows || [];
    const layout = o.layout || 'search';
    if (!LAYOUTS.includes(layout)) throw Object.assign(new Error('as_writer: unknown layout ' + layout), { code: 'USAGE' });
    if (!o.compat && rows.length === 0) return null;
    return render(rows, sourceOf(layout), { compat: !!o.compat, now: o.now, dateString: o.dateString, stats: o.stats });
  }
  const bomFor = (layout, compat) => (compat && layout !== 'chart' ? '﻿' : '');
  function renderFile(rows, o) {
    o = o || {};
    rows = rows || [];
    const layout = o.layout || 'search';
    const dateScraped = o.dateString != null ? String(o.dateString) : smarDate(o.now);
    const stats = { defaultFixes: {}, undefinedCounts: {}, refusedCells: {}, rows: 0 };
    const body = toCsv(rows, { layout, compat: !!o.compat, dateString: dateScraped, stats });
    const bom = body == null ? '' : bomFor(layout, !!o.compat);
    return { text: body == null ? null : bom + body, body, bom, stats, rows: rows.length, empty: rows.length === 0, dateScraped, layout, compat: !!o.compat };
  }

  // ------------------------------------------------------------------ header helpers
  const CANON_APP = cleanApp({});
  const CANON_REVIEW = { id: 0, userName: 0, userUrl: 0, version: 0, score: 0, title: 0, text: 0, url: 0, updated: 0 };
  function canonicalRow(layout) {
    if (layout === 'chart') return CANON_APP;
    if (layout === 'reviews') return Object.assign({}, CANON_REVIEW, { country: 0 });
    if (layout === 'bulkReviews') return Object.assign({ appId: 0 }, CANON_REVIEW, { country: 0 });
    return Object.assign({}, CANON_APP, { country: 0, source: 0 });
  }
  function smarHeader(layout, firstRow) {
    const src = sourceOf(layout || 'search');
    return smarFixColumns(columnsFor(firstRow || canonicalRow(layout || 'search'), src), src);
  }
  const HEADERS = { search: smarHeader('search'), chart: smarHeader('chart'), reviews: smarHeader('reviews'), bulkReviews: smarHeader('bulkReviews') };
  const RENAME = (() => {
    const mk = (keys, src) => { const h = smarFixColumns(keys, src), m = {}; keys.forEach((k, i) => { if (h[i] !== k) m[k] = h[i]; }); return m; };
    return { app: mk(Object.keys(canonicalRow('search')), 'app'), reviews: mk(Object.keys(canonicalRow('reviews')), 'reviews') };
  })();

  // ------------------------------------------------------------------ website artifacts
  // BulkReviewSearchBar.jsx combineCSVBlobs + addAppIdColumnToCSV, statement for statement.
  function smarFrontendBulk(parts) {
    let headers = null;
    const blocks = [];
    for (const part of parts || []) {
      const csvText = String(part.csv);
      const rows = csvText.split('\n');
      if (headers === null) { const hd = rows[0].split(','); hd.unshift('"appId"'); headers = hd.join(',') + '\n'; }
      const r = csvText.split('\n');
      for (let i = 1; i < r.length; i++) {
        if (r[i].trim() === '') continue;
        const rowData = r[i].split(',');
        rowData.unshift(`"${part.appId}"`);
        r[i - 1] = rowData.join(',');
      }
      r.pop();
      blocks.push(r.join('\n') + '\n');
    }
    return '﻿' + (headers === null ? '' : headers) + blocks.join('');
  }
  function smarFileName(info, now) {
    info = info || {};
    const d = toDate(now);
    const mdY = `${d.getUTCMonth() + 1}${d.getUTCDate()}${d.getUTCFullYear()}`;
    const layout = info.layout || 'search';
    if (layout === 'chart') return `${info.collection || ''}${info.categoryName == null ? '' : info.categoryName}${info.country || ''}_${mdY}.csv`;
    if (layout === 'reviews') return `${info.bundleId || info.appId}_reviews.csv`;
    if (layout === 'bulkReviews') return `reviews_${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}${d.getUTCFullYear()}.csv`;
    return `${info.query != null ? info.query : info.term}_${mdY}.csv`;
  }
  function parseCsv(text) {
    text = String(text);
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const rows = []; let row = []; let i = 0; const n = text.length;
    if (!n) return rows;
    for (;;) {
      if (text[i] === '"') {
        let j = i + 1, s = '';
        for (;;) {
          const k = text.indexOf('"', j);
          if (k === -1) { s += text.slice(j); j = n; break; }
          s += text.slice(j, k);
          if (text[k + 1] === '"') { s += '"'; j = k + 2; } else { j = k + 1; break; }
        }
        row.push(s); i = j;
      } else {
        let k = i; while (k < n && text[k] !== ',' && text[k] !== '\n') k++;
        row.push(text.slice(i, k)); i = k;
      }
      if (i >= n) { rows.push(row); break; }
      if (text[i] === ',') { i++; if (i >= n) { row.push(''); rows.push(row); break; } continue; }
      if (text[i] === '\n') { rows.push(row); row = []; i++; if (i >= n) break; continue; }
      i++; // stray char after a closing quote: skip (malformed input)
    }
    return rows;
  }

  const source = () => asWriter.toString();
  const api = {
    VERSION, EXCLUDE, RENAME, HEADERS, LAYOUTS, LABELS,
    cleanApp, keepResult, ensureArray, cleanList, searchRow, chartRow, reviewRow, bulkReviewRow,
    smarCleanText, defaultCleanText, renderCell, smarDate, smarFixColumns, smarHeader,
    smarJsonToCsv, toCsv, bomFor, renderFile, smarFrontendBulk, smarFileName, parseCsv, source,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SMAR_AS_WRITER = api;
})(typeof window !== 'undefined' ? window : globalThis);
