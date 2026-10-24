/* as_reviews.js -- SMAR iOS reviews path (reviewsController + app-store-scraper 0.18 reviews/cleanList), dependency-free.
 *
 * Owner: reviews. UMD: require('./as_reviews') in Node, window.SMAR_AS_REVIEWS in the browser. No Node built-ins are
 * used, so the same file runs in a page. All network access goes through the injected `io` (PLAN.md §6.1):
 *   io.get({url, headers}) -> Promise<{status, body, headers, finalUrl, fromJournal, contentEncoding}>
 *     never throws on an HTTP status; throws Error with string `code` (RATE_LIMITED | NETWORK | REPLAY_MISS).
 *   io.now() -> ms epoch;  io.sleep(ms) -> Promise
 *
 * What SMAR does (vendor/SAR-backend-ios, controllers/reviewsController.js, proven byte-identical in
 * eval/appstore/probes/ios-reviews and re-proven by eval/appstore/build_notes/reviews_test/test_as_reviews.js against SMAR's own code on recorded pages):
 *   1. app({appId: bundleId, country: CC}) = LOOKUP ?bundleId=<id>&country=<CC as sent>&entity=software, results
 *      filtered to wrapperType undefined|'software', results[0]; none -> 'App not found (404)' -> HTTP 500.
 *   2. target = (userRatingCount && userRatingCount < 500) ? userRatingCount : 500   (0/undefined -> 500)
 *   3. for page = 1.. while total < target && page < 11: RSS customerreviews page (each reviews() call re-runs the same
 *      bundleId lookup -- no CSV effect, omitted here); entries = ensureArray(feed.entry); EVERY entry is a review
 *      (no entry[0] skip); empty pages do not stop the loop; any HTTP>=400 / bad JSON / TypeError -> HTTP 500.
 *   4. slice to target; add {country: CC}; jsonToCsv(rows, 'reviews').  No de-dup (rev-04).
 *
 * The engine below fetches once and keeps the raw RSS entries per page, so outputs can render both modes:
 *   compat  = SMAR's rows (duplicates kept), from the pages this run received (healed pages included, PLAN A2).
 *   default = duplicates removed (first occurrence kept) BEFORE the slice to target (PLAN §4.3 V4 then V5).
 * Transport-dependent loss (Akamai-empty pages mid-feed, Q19) is healed in both modes with a cache-busted URL and
 * recorded as transport risk; the heal accepts a page only if its dates sit between its neighbours.
 * An empty page is never read as "no reviews" when the feed should hold some: a feed that came back empty on EVERY page
 * gets page 1 re-read the same way (the probe; when it fills, the pages up to its rel=last follow), then one MZ request
 * for page 1. emptyFeedState() says what the empty feed means: 'none' (Apple's lookup shows 0 ratings, or both review
 * sources are empty for an app with fewer than ZERO_REVIEWS_MAX_RATINGS ratings) or 'transient' (Apple's feed failing).
 * Heal cost is capped per app and pass (stress SCALE-5): at most 3 re-reads per page, one healWaitMs wait per app (not
 * per page), HEAL_MAX_REQUESTS re-reads, and the first round stops after HEAL_GIVE_UP_AFTER pages in a row stayed
 * empty (1 in a re-fetch pass: it probes); the rest stay unhealed (REFETCH; requeueApp() starts the next pass).
 *
 * EXPORTS (SMAR_AS_REVIEWS)
 *   VERSION, MAX_REVIEWS_COUNT=500, MAX_PAGE=10, SORT='mostRecent', PAGE_SIZE=50
 *   REVIEW_KEYS            cleanList key order: id,userName,userUrl,version,score,title,text,url,updated
 *   ROW_KEYS               REVIEW_KEYS + country (the object order handed to the writer, layout 'reviews')
 *   REVIEWS_HEADER         the 9 SMAR header names, in order (for the writer / lint)
 *   BULK_ID_RE, BULK_MAX_IDS, UI_MAX_RATINGS
 *   ensureArray(v)
 *   reviewsReq(cc, trackId, page, {cacheBust, variant}) -> {url, headers}   variant: 'smar'|'cachebust'|'lowercase'
 *   lookupBundleReq(bundleId, cc) -> {url, headers}   exactly SMAR's app({appId}) lookup URL
 *   lookupIdReq(trackId, cc)      -> {url, headers}   exactly app({id}) (trackId -> bundleId resolution)
 *   mzReviewsReq(cc, trackId, start, end, {storefront}) -> {url, headers}   MZ_REVIEWS cross-check (PLAN §2)
 *   parseLookupApp(body) -> {ok, error?, app|null, raw|null}   SMAR's results[0] after the wrapperType filter
 *   parseReviewsRss(body) -> {ok, error?, smarThrows, entries[], entryKind:'array'|'object'|'absent',
 *                             relLast:number|null, linksBlank, malformed:[{index, field, smarThrows}], legacyAppInfo}
 *   cleanEntry(entry) / cleanList(feedJson)   app-store-scraper cleanList, verbatim semantics (throws like SMAR)
 *   checkEntry(entry) -> [{field, smarThrows}]
 *   parseMzReviews(body) -> {ok, error?, list:[{id, rating, body, title, name, date, profileId}]}
 *   reviewTarget(ratingCount, {all}) -> number
 *   smarConcat(pageLists, target, maxPage) -> {rows, pagesUsed}   SMAR's count loop replayed over fetched pages
 *   dedupe(rows) -> {rows, duplicates:[{id, count, pages}]}
 *   emptyMidFeedPages(pages) -> [p]     (pre-2.1.0 rule, kept for callers; the engine uses healCandidates)
 *   healCandidates(pages, {probe, target, entries}) -> [p]   empty pages the feed should have filled (see below)
 *   emptyFeedState(rs) -> null | {state:'none'|'transient', why, pages, ratingCount, mz}   a finished app whose every
 *                         page is empty: what that means (null when any page holds entries, or on error/not found)
 *   requeueApp(rs) -> bool   a finished app with unhealed pages (or a failing empty feed) goes back to stage 'heal'
 *   finishApp(rs)            finalize an app stopped in stage 'heal'/'crosscheck' as it is (unhealed pages stay flagged)
 *   HEAL_VARIANTS, HEAL_MAX_REQUESTS, HEAL_GIVE_UP_AFTER, ZERO_REVIEWS_MAX_RATINGS
 *   healFits(list, prevPage, nextPage) -> bool
 *   fixPacificOffset(label) -> corrected Pacific timestamp label
 *   smarUiWouldReject(bundleId, ratingCount) -> [reason codes]
 *   smarFileName(bundleId) -> '<bundleId>_reviews.csv'
 *   newAppState(appRef, {country, all, storefront}) -> rs   (JSON-serialisable; lives at st.reviews[bundleId|ref])
 *   advanceApp(rs, io, {deadlineMs, heal=true, crossCheck=true, healWaitMs=15000, healMaxRequests, onPage, abort, mz})
 *     -> {done, units, deadline?, aborted?}   abort(): true stops between requests (another app's worker failed)
 *     mz: the run's shared MZ budget {fails, unavailable} (MZ is optional: one retry per request, none after a failure;
 *     MZ_FAIL_STREAK 5xx/unreachable answers in a row or one 403/429 end it for the run; later pages are skipped)
 *   appRows(rs, {compat}) -> {rows:[{...REVIEW_KEYS, country}], smarRows, duplicates, slicedAway}
 *   appSummary(rs) -> {appId, trackId, ratingCount, target, rows, pages, emptyMidFeedPages, healed, unhealed, emptyFeed,
 *                      duplicates, smarRows, smarReviewsWouldHttp500, notFound, error, transportRisk, capTruncation,
 *                      uiReject, mz}   emptyMidFeedPages = pages SMAR got empty that should hold reviews (healed ones
 *                      included; every page of a 'transient' empty feed); unhealed = those still empty
 *   bulkRows(states, {compat}) -> [{appId, ...row}]   SMAR's intended bulk layout (appId first), per-app blocks
 *   crossCheckInputs(rs) -> [{p, startIndex, rss: raw entries, mz: list, mzOk, mzStatus, healed}]
 *                           feed each to as_checks.checkReviews(rss, mz, {startIndex})
 *   compatReasons(rs) -> [{code, detail}]   transport_dependent | no_smar_equivalent (--all) | smar_http500
 *   Rendering: hand appRows(rs,{compat}).rows to as_writer toCsv/renderFile with layout 'reviews' (bulkRows ->
 *   'bulkReviews'). The rows are SMAR's exact objects (key order id,userName,...,updated,country; score a Number,
 *   NaN when Apple's label is not numeric; undefined where a label is absent).
 *
 * rs fields (PLAN §6.2 st.reviews[bundleId]): {appRef, appId, trackId, ratingCount, target, country, all, storefront,
 *   stage:'lookup'|'pages'|'heal'|'crosscheck'|'done', pages:[{p, status, n, healed, dupes, relLast, linksBlank,
 *   firstDate, lastDate, firstId, url, attempts}], pageEntries:{[p]: raw RSS entries}, rows:[raw compat entries],
 *   heal:{attempted:[], healed:[], waited, spent, failStreak, gaveUp, passes, retried}, mz:{[p]: {status, ok, error,
 *   list}}, notFound, smar500, error, resolvedFrom, notes:[],
 *   appName, appVersion (the lookup's version string or null; review versions far above it fail), appVersionDate (its
 *   currentVersionReleaseDate), smarTarget (SMAR's target; differs from target only with --all), endOfFeed (an empty page past rel=last:
 *   the loop stops there -- SMAR would request the remaining, necessarily empty, pages), malformed:[{p,index,field,
 *   smarThrows}], legacyAppInfo, transportParse:[p], lastError (io error that interrupted advanceApp; resumable)}
 *   Request budget: 1 lookup + pages (stops at target, page 10, or end of feed) + heal re-reads (<= HEAL_MAX_REQUESTS
 *   per pass, one healWaitMs wait) + <=3 MZ (at most 1 retry each; none once MZ failed or gave up for the run).
 *   io errors: RATE_LIMITED / DEADLINE / NETWORK / REPLAY_MISS during lookup or pages propagate (state stays consistent;
 *   call advanceApp again to resume). During the MZ cross-check only DEADLINE propagates (and RATE_LIMITED when no
 *   o.mz budget is given; with one, a refusal ends the optional MZ source instead).
 *   rs.smar500 = the reason SMAR would answer HTTP 500 deterministically on these bytes (not-found, malformed entry,
 *   page HTTP error after retries); rs.error = {code, message, stage} when this run itself could not finish the app.
 */
(function (root, factory) {
  // source(): the full module text for the browser fingerprint (browser_driver.js), not just the exported surface
  const m = Object.assign(factory(), { source: () => String(factory) });
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.SMAR_AS_REVIEWS = m;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = '2.1.0';
  const MAX_REVIEWS_COUNT = 500; // reviewsController.js
  const MAX_PAGE = 10; // app-store-scraper validate(): page > 10 throws; the controller loops while page < 11
  const PAGE_SIZE = 50;
  const SORT = 'mostRecent'; // app-store-scraper constants sort.RECENT
  const REVIEW_KEYS = ['id', 'userName', 'userUrl', 'version', 'score', 'title', 'text', 'url', 'updated'];
  const ROW_KEYS = REVIEW_KEYS.concat(['country']);
  // jsonToCsv(rows,'reviews'): keys minus EXCLUDE (userName, title) + dateScraped, then fixColumns renames
  const REVIEWS_HEADER = ['reviewID', 'userUrl', 'versionWhenReviewed', 'rating', 'reviewText', 'reviewURL', 'dateReviewed', 'country', 'dateScraped'];
  const BULK_ID_RE = /^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)+$/; // sar-frontend BulkReviewSearchBar.jsx:163
  const BULK_MAX_IDS = 20; // BulkReviewSearchBar.jsx:171
  const UI_MAX_RATINGS = 100000; // columns.js:61,75 -- per-app button disabled for ratings <= 0 or >= 100000
  const MZ_UA = 'iTunes/12.12 (Macintosh; OS X 10.15) AppleWebKit/0';
  // heal: re-read variants by attempt (the lower-case URL most often has the bytes while SMAR's /US/...mostRecent URL is
  // Akamai-empty: stress SCALE-1, AS-REV-1); attempt 3 comes after the app's one healWaitMs wait.
  const HEAL_VARIANTS = ['lowercase', 'cachebust', 'lowercase'];
  const HEAL_MAX_REQUESTS = 20;  // heal re-reads per app per pass (requeueApp starts a new pass)
  const HEAL_GIVE_UP_AFTER = 3;  // pages in a row still empty after their first two re-reads: stop this pass's first round
  // an app with this many ratings or more always has written reviews: an empty feed there is never "no written reviews",
  // even when the MZ source is empty too (below it, both sources empty = no written reviews; stars need no text)
  const ZERO_REVIEWS_MAX_RATINGS = 1000;
  // the MZ second source ends for the run after this many transport failures in a row (or one refusal): advanceApp o.mz
  const MZ_FAIL_STREAK = 2;

  // ---------------- request builders ----------------
  function reviewsReq(cc, trackId, page, o) {
    o = o || {};
    const variant = o.variant || (o.cacheBust ? 'cachebust' : 'smar');
    let url = `https://itunes.apple.com/${cc}/rss/customerreviews/page=${page}/id=${trackId}/sortby=${SORT}/json`;
    if (variant === 'lowercase') url = `https://itunes.apple.com/${String(cc).toLowerCase()}/rss/customerreviews/page=${page}/id=${trackId}/sortby=mostrecent/json`;
    if (variant !== 'smar') url += '?cb=' + (o.cacheBust || Date.now());
    return { url, headers: {} };
  }
  // common.lookup(ids, idField, country): `${LOOKUP_URL}?${idField}=${ids}&country=${country}&entity=software`
  function lookupBundleReq(bundleId, cc) { return { url: `https://itunes.apple.com/lookup?bundleId=${bundleId}&country=${cc}&entity=software`, headers: {} }; }
  function lookupIdReq(trackId, cc) { return { url: `https://itunes.apple.com/lookup?id=${trackId}&country=${cc}&entity=software`, headers: {} }; }
  function mzReviewsReq(cc, trackId, start, end, o) {
    const sf = (o && o.storefront) || 143441;
    return {
      url: `https://itunes.apple.com/WebObjects/MZStore.woa/wa/userReviewsRow?cc=${String(cc).toLowerCase()}&id=${trackId}&displayable-kind=11&startIndex=${start}&endIndex=${end}&sort=4`,
      headers: { 'X-Apple-Store-Front': `${sf}-1,29`, 'User-Agent': MZ_UA },
    };
  }

  // ---------------- parsers ----------------
  function ensureArray(value) { if (!value) return []; if (Array.isArray(value)) return value; return [value]; }

  function parseLookupApp(body) {
    let j;
    try { j = JSON.parse(body); } catch (e) { return { ok: false, error: 'lookup JSON.parse: ' + e.message, app: null, raw: null }; }
    if (!j || !Array.isArray(j.results)) return { ok: false, error: 'lookup: no results array', app: null, raw: null };
    const results = j.results.filter((a) => typeof a.wrapperType === 'undefined' || a.wrapperType === 'software');
    if (!results.length) return { ok: true, app: null, raw: null };
    const raw = results[0];
    // cleanApp(): id = trackId, appId = bundleId, reviews = userRatingCount
    return { ok: true, raw, app: { id: raw.trackId, appId: raw.bundleId, reviews: raw.userRatingCount, title: raw.trackName } };
  }

  // lib/reviews.js cleanList, same key order and the same property accesses (so it throws exactly where SMAR throws)
  function cleanEntry(review) {
    return {
      id: review.id.label,
      userName: review.author.name.label,
      userUrl: review.author.uri.label,
      version: review['im:version'].label,
      score: parseInt(review['im:rating'].label),
      title: review.title.label,
      text: review.content.label,
      url: review.link.attributes.href,
      updated: review.updated.label,
    };
  }
  function cleanList(results) { return ensureArray(results.feed.entry).map(cleanEntry); }

  // Apple's reviews RSS labels every updated timestamp with today's Pacific offset, even when the review was written in PST.
  // AS-REV-2 corrects the instant in default mode; --smar-compat keeps the label byte for byte as SMAR does.
  function fixPacificOffset(label) {
    if (typeof label !== 'string') return label;
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.exec(label);
    if (!m) return label;
    const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
    const hour = Number(m[4]), minute = Number(m[5]), second = Number(m[6]);
    // Apple's labels carry no fraction; an all-zero one (an ISO rewrite such as .000Z) is dropped so the default file
    // keeps Apple's shape, a non-zero one is kept so no precision is lost
    const fraction = m[7] && !/^\.0+$/.test(m[7]) ? m[7] : '';
    const validDate = (y, mo, d) => {
      const dt = new Date(0);
      dt.setUTCFullYear(y, mo - 1, d);
      dt.setUTCHours(0, 0, 0, 0);
      return mo >= 1 && mo <= 12 && d >= 1 && dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
    };
    if (!validDate(year, month, day) || hour > 23 || minute > 59 || second > 59) return label;
    const nthSunday = (y, mo, nth) => {
      const first = new Date(0);
      first.setUTCFullYear(y, mo - 1, 1);
      first.setUTCHours(0, 0, 0, 0);
      return 1 + ((7 - first.getUTCDay()) % 7) + (nth - 1) * 7;
    };
    const startDay = nthSunday(year, 3, 2), endDay = nthSunday(year, 11, 1);
    const inputOffset = m[8];
    const compactOffset = inputOffset.replace(':', '');
    if (compactOffset === '-0700' || compactOffset === '-0800') {
      if (year < 2007) return label;
      if ((month === 3 && day === startDay && hour === 2) || (month === 11 && day === endDay && hour === 1)) return label;
      const dst = month > 3 && month < 11 || month === 3 && (day > startDay || day === startDay && hour >= 3) || month === 11 && (day < endDay || day === endDay && hour < 1);
      const offset = dst ? '-07:00' : '-08:00';
      return label.slice(0, 19) + fraction + offset;
    }
    let offsetMinutes = 0;
    if (inputOffset !== 'Z') {
      const om = /^([+-])(\d{2}):?(\d{2})$/.exec(inputOffset);
      const oh = Number(om[2]), mins = Number(om[3]);
      if (oh > 23 || mins > 59) return label;
      offsetMinutes = (oh * 60 + mins) * (om[1] === '+' ? 1 : -1);
    }
    const wall = new Date(0);
    wall.setUTCFullYear(year, month - 1, day);
    wall.setUTCHours(hour, minute, second, 0);
    const instant = wall.getTime() - offsetMinutes * 60000;
    const utcYear = new Date(instant).getUTCFullYear();
    const utcStartDay = nthSunday(utcYear, 3, 2), utcEndDay = nthSunday(utcYear, 11, 1);
    const start = new Date(0), end = new Date(0);
    start.setUTCFullYear(utcYear, 2, utcStartDay); start.setUTCHours(10, 0, 0, 0);
    end.setUTCFullYear(utcYear, 10, utcEndDay); end.setUTCHours(9, 0, 0, 0);
    const dst = utcYear >= 2007 && instant >= start.getTime() && instant < end.getTime();
    const pacific = new Date(instant + (dst ? -7 : -8) * 3600000);
    const pad = (n) => String(n).padStart(2, '0');
    const rendered = String(pacific.getUTCFullYear()).padStart(4, '0') + '-' + pad(pacific.getUTCMonth() + 1) + '-' + pad(pacific.getUTCDate()) + 'T' + pad(pacific.getUTCHours()) + ':' + pad(pacific.getUTCMinutes()) + ':' + pad(pacific.getUTCSeconds());
    return rendered + fraction + (dst ? '-07:00' : '-08:00');
  }

  const ENTRY_FIELDS = [ // [field name, parent getter, label getter]
    ['id', (e) => e.id, (e) => e.id.label],
    ['author.name', (e) => e.author && e.author.name, (e) => e.author.name.label],
    ['author.uri', (e) => e.author && e.author.uri, (e) => e.author.uri.label],
    ['im:version', (e) => e['im:version'], (e) => e['im:version'].label],
    ['im:rating', (e) => e['im:rating'], (e) => e['im:rating'].label],
    ['title', (e) => e.title, (e) => e.title.label],
    ['content', (e) => e.content, (e) => e.content.label],
    ['link', (e) => e.link && e.link.attributes, (e) => e.link.attributes.href],
    ['updated', (e) => e.updated, (e) => e.updated.label],
  ];
  function checkEntry(e) {
    if (!e || typeof e !== 'object') return [{ field: 'entry', smarThrows: true }];
    const out = [];
    for (const [field, parent, label] of ENTRY_FIELDS) {
      let p; try { p = parent(e); } catch (x) { p = undefined; }
      if (p === undefined || p === null) { out.push({ field, smarThrows: true }); continue; }
      const v = label(e);
      if (typeof v !== 'string') out.push({ field, smarThrows: false });
    }
    if (!out.length) {
      const r = e['im:rating'].label;
      if (!/^[1-5]$/.test(r)) out.push({ field: 'im:rating', smarThrows: false, value: r });
      if (!/^\d+$/.test(e.id.label)) out.push({ field: 'id', smarThrows: false, value: e.id.label });
      if (isNaN(Date.parse(e.updated.label))) out.push({ field: 'updated', smarThrows: false, value: e.updated.label });
    }
    return out;
  }

  function pageNum(href) { const m = /page=(\d+)/.exec(href || ''); return m ? Number(m[1]) : null; }

  function parseReviewsRss(body) {
    const res = { ok: false, smarThrows: false, entries: [], entryKind: 'absent', relLast: null, linksBlank: false, malformed: [], legacyAppInfo: false };
    let j;
    try { j = JSON.parse(body); } catch (e) { return Object.assign(res, { error: 'JSON.parse: ' + e.message, smarThrows: true }); }
    if (!j || typeof j !== 'object' || !j.feed || typeof j.feed !== 'object') return Object.assign(res, { error: 'no feed object', smarThrows: true });
    const feed = j.feed;
    const raw = feed.entry;
    res.entryKind = !raw ? 'absent' : Array.isArray(raw) ? 'array' : 'object';
    res.entries = ensureArray(raw);
    const links = ensureArray(feed.link);
    const last = links.find((l) => l && l.attributes && l.attributes.rel === 'last');
    res.relLast = last ? pageNum(last.attributes.href) : null;
    res.linksBlank = !last || !last.attributes.href;
    res.entries.forEach((e, i) => {
      for (const m of checkEntry(e)) res.malformed.push(Object.assign({ index: i }, m));
    });
    // the pre-2020 feed put an app-info entry first (im:name, no im:rating); SMAR's cleanList would throw on it
    const e0 = res.entries[0];
    res.legacyAppInfo = !!(e0 && typeof e0 === 'object' && !e0['im:rating'] && (e0['im:name'] || e0['im:artist']));
    res.smarThrows = res.malformed.some((m) => m.smarThrows);
    res.ok = true;
    return res;
  }

  function parseMzReviews(body) {
    let j;
    try { j = JSON.parse(body); } catch (e) { return { ok: false, error: 'JSON.parse: ' + e.message, list: [] }; }
    if (!j || !Array.isArray(j.userReviewList)) return { ok: false, error: 'no userReviewList', list: [] };
    const pid = (u) => { const m = String(u || '').match(/(?:\/id|userProfileId=)(\d+)/); return m ? m[1] : null; };
    return {
      ok: true,
      list: j.userReviewList.map((x) => ({ id: String(x.userReviewId), rating: x.rating != null ? String(x.rating) : undefined, body: x.body, title: x.title, name: x.name, date: x.date, profileId: pid(x.viewUsersUserReviewsUrl) })),
    };
  }

  // ---------------- SMAR rules ----------------
  function reviewTarget(ratingCount, o) {
    if (o && o.all) return MAX_REVIEWS_COUNT;
    return ratingCount && ratingCount < MAX_REVIEWS_COUNT ? ratingCount : MAX_REVIEWS_COUNT;
  }
  // fetchReviews' loop: concat pages while the running total < target and page < 11; empty pages do not stop it.
  // pageLists: {[p]: list}. Stops at the first page that was never fetched (SMAR would have fetched it).
  function smarConcat(pageLists, target, maxPage) {
    maxPage = maxPage || MAX_PAGE;
    let acc = [];
    let pagesUsed = 0;
    for (let page = 1; acc.length < target && page < maxPage + 1; page++) {
      if (!pageLists[page]) break;
      acc = acc.concat(pageLists[page]);
      pagesUsed = page;
    }
    if (acc.length > target) acc = acc.slice(0, target);
    return { rows: acc, pagesUsed };
  }
  function dedupe(rows, idOf) {
    idOf = idOf || ((r) => (r.id && typeof r.id === 'object' ? r.id.label : r.id));
    const seen = new Map();
    const out = [];
    const dups = new Map();
    rows.forEach((r, i) => {
      const id = idOf(r);
      if (seen.has(id)) { const d = dups.get(id) || { id, count: 1, at: [seen.get(id)] }; d.count++; d.at.push(i); dups.set(id, d); return; }
      seen.set(id, i);
      out.push(r);
    });
    return { rows: out, duplicates: Array.from(dups.values()) };
  }
  const tms = (d) => new Date(d).getTime();
  // an empty 200 page counts as mid-feed when a later fetched page had entries, or an earlier page's rel=last >= p
  function emptyMidFeedPages(pages) {
    const lastNonEmpty = pages.reduce((m, p) => (p.n > 0 ? Math.max(m, p.p) : m), 0);
    return pages.filter((pg) => {
      if (pg.n !== 0 || pg.healed) return false;
      const hint = pages.filter((q) => q.p < pg.p && q.relLast).reduce((m, q) => Math.max(m, q.relLast), 0);
      return pg.p < lastNonEmpty || pg.p <= hint;
    }).map((pg) => pg.p);
  }
  // healCandidates: the empty pages Apple's feed should have filled, in page order: an empty 200 page before a page with
  // entries (healed pages count with their entries), at or below an earlier page's rel=last, or -- only when o.probe is
  // set and every page is empty -- page 1 (the probe of an all-empty feed). With o.entries + o.target, a page is skipped
  // once the pages before it already hold target distinct reviews (neither mode's rows can reach it).
  function healCandidates(pages, o) {
    o = o || {};
    const P = (pages || []).slice().sort((a, b) => a.p - b.p);
    const lastNonEmpty = P.reduce((m, q) => (q.n > 0 ? Math.max(m, q.p) : m), 0);
    if (!lastNonEmpty) return o.probe && P.length && P[0].p === 1 && P[0].n === 0 ? [1] : [];
    const out = [];
    const seen = new Set();
    let hint = 0;
    for (const pg of P) {
      if (pg.n === 0 && (pg.p < lastNonEmpty || pg.p <= hint)) {
        if (!(o.entries && o.target && seen.size >= o.target)) out.push(pg.p);
      }
      if (pg.relLast) hint = Math.max(hint, pg.relLast);
      if (o.entries) for (const e of o.entries[pg.p] || []) seen.add(e && e.id && e.id.label);
    }
    return out;
  }
  const mzHasReviews = (rs) => { const m = rs.mz && rs.mz[1]; return !!(m && m.ok && Array.isArray(m.list) && m.list.length); };
  // the all-empty feed is probed unless Apple's lookup shows 0 ratings (and MZ shows no reviews either)
  const probeWanted = (rs) => !!(rs.pages.length && !rs.pages.some((q) => q.n > 0) && (rs.ratingCount !== 0 || mzHasReviews(rs)));
  // emptyFeedState: what a finished app whose every fetched page came back empty means
  function emptyFeedState(rs) {
    if (!rs || rs.stage !== 'done' || rs.error || rs.notFound || !rs.pages || !rs.pages.length) return null;
    if (rs.pages.some((q) => q.n > 0)) return null;
    const m = rs.mz && rs.mz[1];
    const mzN = m && m.ok && Array.isArray(m.list) ? m.list.length : null;
    const base = { pages: rs.pages.length, ratingCount: rs.ratingCount, mz: m ? (mzN == null ? 'failed' : mzN) : 'not_checked' };
    if (mzN > 0) return Object.assign({ state: 'transient', why: 'second_source_has_reviews' }, base);
    if (rs.ratingCount === 0) return Object.assign({ state: 'none', why: 'no_ratings' }, base);
    // an empty MZ answer counts only when it was asked with this country's own storefront (compat and unknown
    // storefronts send the US one, which can come back empty for another country's app)
    const sfOk = rs.sfKnown != null ? rs.sfKnown : String(rs.country).toUpperCase() === 'US';
    if (mzN === 0 && m.status === 200 && sfOk && !(rs.ratingCount >= ZERO_REVIEWS_MAX_RATINGS)) return Object.assign({ state: 'none', why: 'both_sources_empty' }, base);
    return Object.assign({ state: 'transient', why: mzN === 0 ? (sfOk ? 'too_many_ratings_for_none' : 'second_source_other_storefront') : m ? 'second_source_failed' : 'second_source_not_checked' }, base);
  }
  function healFits(list, prev, next) {
    if (!list || !list.length) return false;
    const first = tms(fixPacificOffset(list[0].updated.label));
    const last = tms(fixPacificOffset(list[list.length - 1].updated.label));
    if (isNaN(first) || isNaN(last)) return false;
    if (prev && prev.lastDate && first > tms(fixPacificOffset(prev.lastDate))) return false;
    if (next && next.firstDate && last < tms(fixPacificOffset(next.firstDate))) return false;
    return true;
  }
  function smarUiWouldReject(bundleId, ratingCount) {
    const out = [];
    if (!(ratingCount > 0) || ratingCount >= UI_MAX_RATINGS) out.push('per_app_button_disabled');
    if (!BULK_ID_RE.test(String(bundleId || ''))) out.push('bulk_form_rejects_id');
    return out;
  }
  function smarFileName(bundleId) { return `${bundleId}_reviews.csv`; }

  // ---------------- engine ----------------
  function newAppState(appRef, o) {
    o = o || {};
    const ref = String(appRef);
    return {
      appRef: ref, appId: /^\d+$/.test(ref) ? null : ref, trackId: /^\d+$/.test(ref) ? Number(ref) : null,
      ratingCount: null, target: null, country: o.country || 'US', all: !!o.all, storefront: o.storefront || 143441,
      sfKnown: !!o.storefront || String(o.country || 'US').toUpperCase() === 'US', // MZ asked with this country's storefront
      stage: 'lookup', pages: [], pageEntries: {}, rows: [], heal: { attempted: [], healed: [] }, mz: {},
      notFound: false, smar500: null, error: null, resolvedFrom: null, notes: [], requests: 0,
    };
  }
  function errCode(e) { return (e && typeof e.code === 'string') ? e.code : 'NETWORK'; }
  function expired(io, o) { return o && o.deadlineMs && io.now && io.now() >= o.deadlineMs; }
  const aborted = (o) => !!(o && typeof o.abort === 'function' && o.abort());

  async function doLookup(rs, io) {
    if (!rs.appId && rs.trackId) { // V0: a numeric trackId -> bundleId (SMAR's UI always sends the bundle id)
      const r = await io.get(lookupIdReq(rs.trackId, rs.country)); rs.requests++;
      if (r.status >= 400) { rs.error = { code: 'LOOKUP_HTTP', message: `lookup id HTTP ${r.status}`, stage: 'lookup' }; return false; }
      const p = parseLookupApp(r.body);
      if (!p.ok) { rs.error = { code: 'LOOKUP_PARSE', message: p.error, stage: 'lookup' }; return false; }
      if (!p.app) { rs.notFound = true; rs.smar500 = 'app_not_found'; return false; }
      rs.appId = p.app.appId; rs.resolvedFrom = String(rs.trackId);
      rs.notes.push(`numeric id ${rs.trackId} resolved to bundle id ${rs.appId}; SMAR's UI sends the bundle id`);
    }
    const r = await io.get(lookupBundleReq(rs.appId, rs.country)); rs.requests++;
    if (r.status >= 400) { rs.error = { code: 'LOOKUP_HTTP', message: `lookup HTTP ${r.status}`, stage: 'lookup' }; rs.smar500 = 'lookup_http_' + r.status; return false; }
    const p = parseLookupApp(r.body);
    if (!p.ok) { rs.error = { code: 'LOOKUP_PARSE', message: p.error, stage: 'lookup' }; rs.smar500 = 'lookup_parse'; return false; }
    if (!p.app) { rs.notFound = true; rs.smar500 = 'app_not_found'; return false; } // FS-12: SMAR answers 500
    rs.trackId = p.app.id;
    rs.ratingCount = p.app.reviews === undefined ? null : p.app.reviews;
    rs.appName = p.app.title;
    rs.appVersion = p.raw && typeof p.raw.version === 'string' ? p.raw.version : null; // as_checks.reviewSemantics: versions far above it
    rs.appVersionDate = p.raw && typeof p.raw.currentVersionReleaseDate === 'string' ? p.raw.currentVersionReleaseDate : null; // as_checks.driftReport (d3)
    rs.target = reviewTarget(p.app.reviews, { all: rs.all });
    rs.smarTarget = reviewTarget(p.app.reviews);
    return true;
  }

  async function fetchPage(rs, io, page, variant) {
    const req = reviewsReq(rs.country, rs.trackId, page, variant === 'smar' ? {} : { variant, cacheBust: io.now ? io.now() : Date.now() });
    const r = await io.get(req); rs.requests++;
    const meta = { p: page, status: r.status, url: req.url, fromJournal: !!r.fromJournal };
    if (r.status >= 400) return { meta, http: r.status };
    const parsed = parseReviewsRss(r.body);
    return { meta, parsed, xcache: r.headers && (r.headers['x-cache'] || r.headers['X-Cache']) };
  }
  function pageRecord(page, f) {
    const list = f.parsed.entries;
    const okDate = (e) => (e && e.updated && typeof e.updated.label === 'string' ? e.updated.label : null);
    return {
      p: page, status: f.meta.status, n: list.length, healed: false, dupes: 0, relLast: f.parsed.relLast, linksBlank: f.parsed.linksBlank,
      entryKind: f.parsed.entryKind, firstId: list[0] && list[0].id ? list[0].id.label : null,
      firstDate: list.length ? okDate(list[0]) : null, lastDate: list.length ? okDate(list[list.length - 1]) : null,
      url: f.meta.url, fromJournal: f.meta.fromJournal,
    };
  }

  // one heal re-read of page pg (attempt number = re-reads of pg so far in this pass). DEADLINE / RATE_LIMITED propagate
  // and are not counted (the page keeps its attempt for later); any other error is a failed attempt.
  async function healAttempt(rs, io, pg, o) {
    const rec = rs.pages.find((x) => x.p === pg);
    const prev = rs.pages.filter((x) => x.p < pg && x.n).pop();
    const next = rs.pages.find((x) => x.p > pg && x.n);
    const a = rs.heal.attempted.filter((x) => x.p === pg).length;
    const variant = HEAL_VARIANTS[Math.min(a, HEAL_VARIANTS.length - 1)];
    let f;
    try { f = await fetchPage(rs, io, pg, variant); } catch (e) {
      const c = errCode(e);
      if (c === 'DEADLINE' || c === 'RATE_LIMITED') throw e;
      rs.heal.attempted.push({ p: pg, attempt: a + 1, variant, err: c }); rs.heal.spent = (rs.heal.spent || 0) + 1;
      return false;
    }
    rs.heal.spent = (rs.heal.spent || 0) + 1;
    const list = f.parsed && f.parsed.ok && !f.parsed.smarThrows ? f.parsed.entries : [];
    const fits = healFits(list, prev, next);
    rs.heal.attempted.push({ p: pg, attempt: a + 1, variant, status: f.meta.status, n: list.length, fits });
    if (!fits) return false;
    rs.pageEntries[pg] = list;
    Object.assign(rec, pageRecord(pg, f), { healed: true, healedVariant: variant });
    rs.heal.healed.push(pg);
    return true;
  }
  // heal stage, resumable from rs.heal: round 1 = up to two re-reads per candidate page in page order (candidates are
  // recomputed after every heal: a healed page can reveal more, e.g. the probe's rel=last); round 2 = after ONE wait per
  // app and pass, a third re-read of the pages still empty. Capped by healMaxRequests; round 1 stops after
  // HEAL_GIVE_UP_AFTER pages in a row stayed empty. Returns 'done' | 'deadline' | 'aborted'.
  async function healStage(rs, io, o) {
    const h = rs.heal;
    const max = o.healMaxRequests == null ? HEAL_MAX_REQUESTS : o.healMaxRequests;
    // a re-fetch pass (the app already finished a heal pass) probes: one page in a row still empty ends its first round
    const giveUpAfter = (h.passes || 0) >= 1 ? 1 : HEAL_GIVE_UP_AFTER;
    const tries = (p) => h.attempted.filter((x) => x.p === p).length;
    const cands = () => healCandidates(rs.pages, { probe: probeWanted(rs), target: rs.target, entries: rs.pageEntries });
    for (let guard = 0; guard < 100; guard++) {
      let progressed = false;
      // round 1
      while (!h.gaveUp && (h.spent || 0) < max) {
        const p = cands().find((x) => tries(x) < 2);
        if (p == null) break;
        if (expired(io, o)) return 'deadline';
        if (aborted(o)) return 'aborted';
        const ok = await healAttempt(rs, io, p, o);
        progressed = true;
        if (ok) h.failStreak = 0;
        else if (tries(p) >= 2) { h.failStreak = (h.failStreak || 0) + 1; if (h.failStreak >= giveUpAfter) h.gaveUp = true; }
      }
      // round 2: one wait per app and pass, then the third re-read
      const r2 = cands().filter((x) => tries(x) === 2);
      if (r2.length && (h.spent || 0) < max) {
        if (!h.waited) { // the wait is a point in time (h.waitUntil): a call that cannot sleep it out leaves it running
          const wait = o.healWaitMs == null ? 15000 : o.healWaitMs;
          const now = () => (io.now ? io.now() : Date.now());
          if (expired(io, o)) return 'deadline';
          if (aborted(o)) return 'aborted';
          if (h.waitUntil == null) h.waitUntil = now() + wait;
          const left = Math.min(wait, h.waitUntil - now());
          if (left > 0) {
            if (o.deadlineMs && now() + left >= o.deadlineMs) return 'deadline';
            if (io.sleep) await io.sleep(left);
          }
          h.waited = true;
        }
        for (const p of r2) {
          if ((h.spent || 0) >= max) break;
          if (tries(p) !== 2 || rs.heal.healed.includes(p)) continue;
          if (expired(io, o)) return 'deadline';
          if (aborted(o)) return 'aborted';
          if (await healAttempt(rs, io, p, o)) { h.failStreak = 0; h.gaveUp = false; }
          progressed = true;
        }
      }
      if (!progressed) break;
    }
    return 'done';
  }

  function finalize(rs) {
    // compat rows: SMAR's loop over the pages as finally held (healed pages included); raw entries
    const lists = {};
    for (const pg of rs.pages) lists[pg.p] = rs.pageEntries[pg.p] || [];
    rs.rows = smarConcat(lists, rs.smarTarget == null ? rs.target : rs.smarTarget).rows;
    // per-page duplicate counts (ids already seen on an earlier page)
    const seen = new Set();
    for (const pg of rs.pages.slice().sort((a, b) => a.p - b.p)) {
      let d = 0;
      for (const e of lists[pg.p]) { const id = e.id && e.id.label; if (seen.has(id)) d++; else seen.add(id); }
      pg.dupes = d;
    }
    rs.stage = 'done';
  }
  // finishApp: an app stopped in stage 'heal' or 'crosscheck' (all its pages fetched) is finalized as it stands; its
  // unhealed pages stay flagged (REFETCH). Used when a re-fetch pass runs out of time (appstore_core settle()).
  function finishApp(rs) {
    if (!rs || (rs.stage !== 'heal' && rs.stage !== 'crosscheck')) return false;
    if (rs.stage === 'heal') rs.heal.passes = (rs.heal.passes || 0) + 1;
    finalize(rs);
    return true;
  }
  // requeueApp: a finished app whose feed left pages unhealed (or came back empty while the app has reviews) goes back to
  // stage 'heal' for a new pass: its unhealed pages get fresh re-reads, the wait and the heal budget start over, and a
  // failed MZ answer is asked again. Returns true when requeued.
  function requeueApp(rs) {
    if (!rs || rs.stage !== 'done' || rs.error || rs.notFound) return false;
    const a = appSummary(rs);
    if (!a.unhealed || !a.unhealed.length) return false;
    const h = rs.heal;
    const keep = h.attempted.filter((x) => h.healed.includes(x.p));
    h.retried = (h.retried || 0) + h.attempted.length - keep.length;
    h.attempted = keep;
    h.waited = false; h.waitUntil = null; h.spent = 0; h.failStreak = 0; h.gaveUp = false;
    for (const p of Object.keys(rs.mz || {})) if (!rs.mz[p] || !rs.mz[p].ok || rs.mz[p].status !== 200) delete rs.mz[p];
    rs.stage = 'heal';
    return true;
  }

  // advance one app as far as the deadline allows. Resumable: every request's result is stored in rs before the next.
  async function advanceApp(rs, io, o) {
    o = Object.assign({ heal: true, crossCheck: true }, o || {});
    let units = 0;
    const spent0 = (rs.heal && rs.heal.spent) || 0;
    try {
      if (aborted(o)) return { done: false, units, aborted: true };
      if (rs.stage === 'lookup') {
        if (expired(io, o)) return { done: false, units, deadline: true };
        const ok = await doLookup(rs, io); units++;
        if (!ok) { rs.stage = 'done'; return { done: true, units }; }
        rs.stage = 'pages';
      }
      if (rs.stage === 'pages') {
        const total = () => rs.pages.reduce((s, pg) => s + pg.n, 0);
        for (let page = rs.pages.length + 1; total() < rs.target && page < MAX_PAGE + 1; page = rs.pages.length + 1) {
          if (expired(io, o)) return { done: false, units, deadline: true };
          if (aborted(o)) return { done: false, units, aborted: true };
          let f = await fetchPage(rs, io, page, 'smar'); units++;
          if (f.http) { rs.error = { code: 'PAGE_HTTP', message: `reviews page ${page}: HTTP ${f.http}`, stage: 'pages', page }; rs.smar500 = 'page_http_' + f.http; rs.stage = 'done'; return { done: true, units }; }
          if (!f.parsed.ok) { // garbled body: one cache-busted re-read before giving up (SMAR: JSON.parse throws -> 500)
            rs.notes.push(`page ${page}: ${f.parsed.error}; re-read with a cache-buster`);
            let g;
            try { g = await fetchPage(rs, io, page, 'cachebust'); } catch (e) { if (errCode(e) === 'RATE_LIMITED') throw e; g = { http: 0, parsed: { ok: false } }; }
            units++;
            if (g.http || !g.parsed.ok) { rs.error = { code: 'PAGE_PARSE', message: `reviews page ${page}: ${f.parsed.error}`, stage: 'pages', page }; rs.smar500 = 'page_parse'; rs.stage = 'done'; return { done: true, units }; }
            f = g; rs.transportParse = (rs.transportParse || []).concat([page]);
          }
          if (f.parsed.smarThrows) {
            rs.malformed = f.parsed.malformed.map((m) => Object.assign({ p: page }, m));
            rs.legacyAppInfo = f.parsed.legacyAppInfo;
            rs.error = { code: 'MALFORMED_ENTRY', message: `reviews page ${page}: entry ${f.parsed.malformed[0].index} lacks ${f.parsed.malformed[0].field}${f.parsed.legacyAppInfo ? ' (legacy app-info entry[0])' : ''}`, stage: 'pages', page };
            rs.smar500 = 'malformed_entry'; rs.stage = 'done'; return { done: true, units };
          }
          if (f.parsed.malformed.length) rs.malformed = (rs.malformed || []).concat(f.parsed.malformed.map((m) => Object.assign({ p: page }, m)));
          rs.pageEntries[page] = f.parsed.entries;
          rs.pages.push(pageRecord(page, f));
          if (o.onPage) o.onPage(rs, page);
          // genuine end of feed: an empty page beyond the rel=last that earlier pages reported. SMAR keeps requesting
          // the remaining pages (all empty); they cannot add rows, so they are not fetched. Recorded in rs.endOfFeed.
          const hint = rs.pages.reduce((m, x) => (x.p < page && x.relLast ? Math.max(m, x.relLast) : m), 0);
          if (f.parsed.entries.length === 0 && hint > 0 && page > hint) { rs.endOfFeed = page; rs.notes.push(`page ${page} empty past rel=last=${hint}: end of feed; SMAR would also request pages ${page + 1}..${MAX_PAGE}`); break; }
        }
        rs.stage = 'heal';
      }
      if (rs.stage === 'heal') {
        if (o.heal) {
          const r = await healStage(rs, io, o);
          units += ((rs.heal.spent || 0) - spent0);
          if (r === 'deadline') return { done: false, units, deadline: true };
          if (r === 'aborted') return { done: false, units, aborted: true };
        }
        rs.heal.passes = (rs.heal.passes || 0) + 1;
        rs.stage = 'crosscheck';
      }
      if (rs.stage === 'crosscheck') {
        if (o.crossCheck && rs.pages.length) {
          const nonEmpty = rs.pages.filter((x) => x.n > 0).map((x) => x.p);
          const want = [];
          if (nonEmpty.length) want.push(nonEmpty[0], nonEmpty[nonEmpty.length - 1]);
          else want.push(1); // every page empty: does Apple's second review source list written reviews? (emptyFeedState)
          for (const h of rs.heal.healed) want.push(h);
          const uniq = want.filter((p, i) => want.indexOf(p) === i).slice(0, 3);
          // MZ is an OPTIONAL second source (as the app pages are, stress FI-09): each request gets at most one retry
          // (none after a failure), and MZ_FAIL_STREAK transport failures in a row (5xx / no answer) or one refusal
          // (403 / 429) end it for the run (o.mz, shared by every app of the run): the pages not asked are recorded as
          // skipped (not cross-checked, never a pass). With the default 6 retries and 15-60 s backoff a 503 MZ held one
          // app's reviews for 17 minutes (stress regression).
          const mzx = o.mz || null;
          for (const p of uniq) {
            if (rs.mz[p]) continue;
            if (mzx && mzx.unavailable) { rs.mz[p] = { status: 0, ok: false, error: 'source_unavailable', skipped: true, list: [] }; mzx.unavailable.skipped = (mzx.unavailable.skipped || 0) + 1; continue; }
            if (expired(io, o)) return { done: false, units, deadline: true };
            if (aborted(o)) return { done: false, units, aborted: true };
            const start = (p - 1) * PAGE_SIZE;
            let rec;
            try {
              const req = Object.assign(mzReviewsReq(rs.country, rs.trackId, start, start + PAGE_SIZE, { storefront: rs.storefront }), { maxRetries: mzx && mzx.fails ? 0 : 1 });
              const r = await io.get(req); rs.requests++; units++;
              const m = r.status === 200 ? parseMzReviews(r.body) : { ok: false, error: 'HTTP ' + r.status, list: [] };
              rec = { status: r.status, ok: m.ok, error: m.error, list: m.list };
              if (r.replayMiss) rec.replayMiss = true;
            } catch (e) {
              const c = errCode(e);
              if (c === 'DEADLINE') throw e;
              // a refusal of the optional source ends it; the reviews feed itself stops the run if Apple limits it too
              if (c === 'RATE_LIMITED' && !mzx) throw e;
              rec = c === 'RATE_LIMITED' ? { status: e.status || 429, ok: false, error: c, limited: true, list: [] } : { status: 0, ok: false, error: c, list: [] };
            }
            rs.mz[p] = rec;
            if (mzx) {
              const transportFail = !rec.replayMiss && (rec.status >= 500 || rec.status === 0); // a replay miss is no outage
              mzx.fails = rec.limited || transportFail ? (mzx.fails || 0) + 1 : 0;
              if (rec.limited || mzx.fails >= MZ_FAIL_STREAK) {
                mzx.unavailable = { why: rec.limited ? `Apple's second review source refused requests (HTTP ${rec.status})` : rec.status ? `Apple's second review source answered HTTP ${rec.status}` : "Apple's second review source did not answer", skipped: 0 };
              }
            }
          }
        }
        finalize(rs);
      }
      return { done: rs.stage === 'done', units };
    } catch (e) {
      // io errors (RATE_LIMITED, NETWORK, REPLAY_MISS): state is consistent up to the last stored page; resumable
      rs.lastError = { code: errCode(e), message: String((e && e.message) || e).slice(0, 300), stage: rs.stage };
      throw e;
    }
  }

  // ---------------- rows / summary ----------------
  function appRows(rs, o) {
    const compat = !!(o && o.compat);
    if (rs.stage !== 'done' || rs.error || rs.notFound) return { rows: [], smarRows: 0, duplicates: [], slicedAway: 0 };
    const toRow = (e) => {
      const row = Object.assign(cleanEntry(e), { country: rs.country });
      if (!compat) row.updated = fixPacificOffset(row.updated);
      return row;
    };
    const compatRows = rs.rows.map(toRow);
    if (compat) return { rows: compatRows, smarRows: compatRows.length, duplicates: dedupe(compatRows).duplicates, slicedAway: 0 };
    // default: concat every held page in order, de-dup (first occurrence wins), then slice to the target
    let all = [];
    for (const pg of rs.pages.slice().sort((a, b) => a.p - b.p)) all = all.concat(rs.pageEntries[pg.p] || []);
    const d = dedupe(all.map(toRow));
    const rows = d.rows.slice(0, rs.target);
    return { rows, smarRows: compatRows.length, duplicates: d.duplicates, slicedAway: d.rows.length - rows.length };
  }

  function appSummary(rs) {
    // pages SMAR got empty that should hold reviews: the healed ones, plus those still empty that the feed should fill
    // (every page of an all-empty feed that is failing; none of a feed confirmed empty)
    const feed = emptyFeedState(rs);
    const healed = rs.heal.healed.slice().sort((a, b) => a - b);
    let unhealed = rs.pages.length && !(feed && feed.state === 'none')
      ? healCandidates(rs.pages, { probe: probeWanted(rs), target: rs.target, entries: rs.pageEntries }) : [];
    if (feed && feed.state === 'transient') unhealed = rs.pages.map((p) => p.p);
    const empty = healed.concat(unhealed.filter((p) => healed.indexOf(p) < 0)).sort((a, b) => a - b);
    const def = appRows(rs, { compat: false });
    const cmp = appRows(rs, { compat: true });
    const maxHint = rs.pages.reduce((m, p) => Math.max(m, p.relLast || 0), 0);
    const held = rs.pages.reduce((s, p) => s + p.n, 0);
    return {
      appId: rs.appId, trackId: rs.trackId, appName: rs.appName, ratingCount: rs.ratingCount, target: rs.target, smarTarget: rs.smarTarget,
      rows: def.rows.length, smarRows: cmp.rows.length,
      pages: rs.pages.map((p) => p.n), emptyMidFeedPages: empty, healed,
      unhealed, emptyFeed: feed,
      duplicates: cmp.duplicates.map((d) => ({ id: d.id, count: d.count })),
      smarReviewsWouldHttp500: !!rs.smar500, smar500: rs.smar500, notFound: rs.notFound, error: rs.error, malformed: (rs.malformed || []).slice(0, 10),
      transportRisk: { emptyReviewPages: empty, healed, parseRetried: rs.transportParse || [] },
      heal: { attempts: rs.heal.attempted.length + (rs.heal.retried || 0), passes: rs.heal.passes || 0 },
      // SMAR's target is userRatingCount (ratings): when it binds below 500 while the feed holds more, older reviews are cut
      capTruncation: (rs.smarTarget != null && rs.smarTarget < MAX_REVIEWS_COUNT && (held > rs.smarTarget || maxHint > rs.pages.length))
        ? { target: rs.smarTarget, held, feedLastPage: maxHint || null } : null,
      uiReject: smarUiWouldReject(rs.appId, rs.ratingCount),
      mz: Object.keys(rs.mz).map((p) => ({ p: Number(p), status: rs.mz[p].status, n: rs.mz[p].list.length })),
      smarFileName: rs.appId ? smarFileName(rs.appId) : null,
      requests: rs.requests, notes: rs.notes.slice(0, 5),
    };
  }

  // inputs for as_checks.checkReviews(rssEntries, mzList, {startIndex}): one item per cross-checked page
  function crossCheckInputs(rs) {
    return Object.keys(rs.mz).map(Number).sort((a, b) => a - b).map((p) => ({
      p, startIndex: (p - 1) * PAGE_SIZE, rss: rs.pageEntries[p] || [], mz: rs.mz[p].list, mzOk: rs.mz[p].ok, mzStatus: rs.mz[p].status, healed: rs.heal.healed.indexOf(p) > -1,
    }));
  }
  // compatExact.reasons codes this app contributes (PLAN §6.3)
  function compatReasons(rs) {
    const out = [];
    const sm = appSummary(rs);
    if (sm.emptyFeed && sm.emptyFeed.state === 'transient') out.push({ code: 'transport_dependent', detail: `${rs.appId}: every review page (${sm.pages.length}) came back empty although the app has reviews (Apple feed failure); healed none` });
    else if (sm.emptyMidFeedPages.length || sm.transportRisk.parseRetried.length) out.push({ code: 'transport_dependent', detail: `${rs.appId}: Akamai-empty/garbled review pages ${sm.emptyMidFeedPages.concat(sm.transportRisk.parseRetried).join(',')}; healed ${sm.healed.join(',') || 'none'}` });
    if (rs.all) out.push({ code: 'no_smar_equivalent', detail: `${rs.appId}: --all` });
    if (rs.smar500) out.push({ code: 'smar_http500', detail: `${rs.appId}: ${rs.smar500}` });
    return out;
  }

  // SMAR's intended bulk layout: "appId" first, then the review columns, per-app blocks in input order
  function bulkRows(states, o) {
    const out = [];
    for (const rs of states) for (const r of appRows(rs, o).rows) out.push(Object.assign({ appId: rs.appId }, r));
    return out;
  }

  return {
    VERSION, MAX_REVIEWS_COUNT, MAX_PAGE, PAGE_SIZE, SORT, REVIEW_KEYS, ROW_KEYS, REVIEWS_HEADER, BULK_ID_RE, BULK_MAX_IDS, UI_MAX_RATINGS,
    ensureArray, reviewsReq, lookupBundleReq, lookupIdReq, mzReviewsReq, fixPacificOffset,
    parseLookupApp, parseReviewsRss, cleanEntry, cleanList, checkEntry, parseMzReviews,
    reviewTarget, smarConcat, dedupe, emptyMidFeedPages, healCandidates, emptyFeedState, healFits, smarUiWouldReject, smarFileName,
    newAppState, advanceApp, appRows, appSummary, bulkRows, crossCheckInputs, compatReasons, requeueApp, finishApp,
    HEAL_VARIANTS, HEAL_MAX_REQUESTS, HEAL_GIVE_UP_AFTER, ZERO_REVIEWS_MAX_RATINGS, MZ_FAIL_STREAK,
  };
}));
