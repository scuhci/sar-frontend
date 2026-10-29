// as_search.js -- smar-appstore-agent: SMAR's iOS keyword search (vendor/SAR-backend-ios controllers/searchController.js
// + app-store-scraper 0.18 search/app/similar/lookup), as a resumable, deterministic, dependency-free engine.
// UMD: Node `require('./as_search')`, browser `window.SMAR_AS_SEARCH`. No I/O of its own: every request goes through the
// injected `io` (PLAN section 6.1; Node: net_apple.js makeIo). Ported from eval/appstore/probes/ios-search-parity/
// ios_search.js (698/698 replay, 27/30 live) + the non-US fallback in verify/ios-search-parity__non-us-similar-us-only.
//
// IO CONTRACT (PLAN 6.1): io.get(req) -> Promise<{status, body, headers, finalUrl, hops, fromJournal, contentEncoding}>;
//   req = {url, headers, bucket, kind[, fresh]} (fresh:true = must not be answered from the journal/day cache: the rank
//   re-read and the garbled-page re-fetch). get never throws on an HTTP status; it throws Errors with a string `code`:
//   NETWORK (after net_apple's retries: treated here like a failed call, SMAR semantics), RATE_LIMITED / REPLAY_MISS /
//   DEADLINE / anything else (propagated untouched: the state is only mutated after a unit completes, so the caller
//   saves and resumes). Optional: io.now() (ms, deadline checks), io.save(st) (called after every unit). Response flags
//   read when present (net_apple.js): gzipBody (compressed bytes for a request without Accept-Encoding: SMAR's
//   undecoding transport would have lost that similar page -> transportRisk), garbled (undecodable body -> one fresh
//   re-fetch, then 0 related ids for that primary).
//
// EXPORTS
//   Constants
//     SEARCH_BASE, LOOKUP_BASE, SIMILAR_BASE ('https://itunes.apple.com/us/app/app/id'), SIMILAR_DIRECT_BASE
//     ('https://apps.apple.com/us/app/app/id', probe P1 only), MARKETS (app-store-scraper 0.18 lib/constants.js markets,
//     115, verbatim), DEFAULT_STORE 143441, PRIMARY_N 50, ID_BATCH 200, BUNDLE_BATCH 50, MAX_URL_BYTES 2000,
//     LABELS {primary:'primary search', related:'related app', keyword:'keyword search', similar:'similar app links'},
//     REQUIRED_LOOKUP_KEYS (PLAN 3.6)
//   Pure helpers
//     storefrontFor(cc, {compat, storefronts}) -> {id, source:'markets'|'storefronts'|'fallback'|null, fallback, verified}
//        compat: MARKETS[CC] || 143441 (fallback:true when CC is not in MARKETS -- SMAR's US-store fallback).
//        default: storefronts[CC] (number or {id, verified}) || MARKETS[CC] || {id:null} (-> STOP no_storefront).
//     smarBackendQuery(typed, cc) -> {query, countryCode, status:200|400, changed}  (sar-frontend SearchBar + express qs)
//     isLatin1(s)
//     mzSearchReq(term, cc, {compat, storefronts, storefront}) -> req  (headers exactly X-Apple-Store-Front
//        '<sf>,24 t:native' + Accept-Language 'en-us')
//     lookupReq(ids, field, country) -> req  ('lookup?<field>=<ids,>&country=<country||us>&entity=software'; ids raw,
//        unencoded, exactly as app-store-scraper builds it -- the bundle-id probe sends the raw term)
//     similarPageReq(id, {direct}) -> req  (header X-Apple-Store-Front '143441,32'; country never passed, as SMAR)
//     chunkIds(ids, field, {country, max, maxUrlBytes}) -> string[][]  first-seen order; max 200 (id) / 50 (bundleId);
//        a bundleId chunk is also cut before its URL would pass maxUrlBytes (default 2000)
//     parseMzSearch(body, {num, page}) -> {ok, noResults, allIds, ids, entities, lockups, storefront, error}
//        ids = bubbles[0].results.slice(0,50) ids of ANY entity (paginate(undefined)); lockups = trimmed
//        storePlatformData['native-search-lockup-search'].results (cross-check anchors only, never values)
//     parseLookup(body) -> {ok, raw[] (wrapperType undefined|'software', Apple order), resultCount, missingKeys{key:n}, error}
//     parseSimilar(body, {contentEncoding}) -> {ok, keyFound, ids[], gzip, garbled, productDv, storefront, error}
//        SMAR's regex /customersAlsoBoughtApps":(.*?\])/ then JSON.parse; productDv = trimmed
//        its.serverData.storePlatformData['product-dv-product'].results[<id>] (cross-check anchor)
//     cleanApp(raw)  app-store-scraper lib/common.js cleanApp, verbatim (fallback when as_writer is absent)
//   Engine (state slice = PLAN 6.2 fields search/primaries/similar/relatedOrder/details/rows/dropped/transport/stage)
//     newSearchState(opts) -> st   opts {term, country='US', compat=false, primaryOnly=false, storefronts,
//        similarLookup:'batch'(default: uniq page ids, 200/lookup, halve on failure)|'perPrimary'(SMAR's call pattern),
//        similarDirect=false, rankReread=true, maxUrlBytes=2000, runId}
//     advanceSearch(st, io, {deadlineMs, maxUnits}) -> {done, units, stop?}   one unit = one request (perPrimary
//        similar: page + its lookup). Resumable: call again with the same st after an interruption.
//        stop = {code, message, smarHttp} with code in: smar_http400 (compat: frontend term empty), no_storefront,
//        smar_http500_search (MZ search/primary lookup failed: smarSearchWouldHttp500), endpoint_drift (MZ search shape),
//        no_results (0 rows: SMAR answers 500).
//     runSearch(opts|st, io, {deadlineMs}) -> st  (loops advanceSearch to done/stop/deadline)
//     searchRows(st, {writer}) -> SMAR row objects in output order: {...cleanApp(detail raw), country:CC, source}
//        (searchController's {...appInfo, ...appDetails}; source = internal label; the writer maps it to scrapedFrom)
//     searchReport(st) -> summary fragment: {run, rows, bySource, primaries, related, smarWouldDrop, transportRisk,
//        drift, similarStats, compatReasons[{code, detail}], smarSiteTerm?, smarSearchWouldHttp500?, smarUiWouldReject?,
//        countryVerified, problems[], stop?}
(function (root, factory) {
  // source(): the full module text for the browser fingerprint (browser_driver.js), not just the exported surface
  const m = Object.assign(factory(root), { source: () => String(factory) });
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.SMAR_AS_SEARCH = m;
}(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const VERSION = '2.1.0';
  const SEARCH_BASE = 'https://search.itunes.apple.com/WebObjects/MZStore.woa/wa/search?clientApplication=Software&media=software&term=';
  const LOOKUP_BASE = 'https://itunes.apple.com/lookup';
  const SIMILAR_BASE = 'https://itunes.apple.com/us/app/app/id';
  const SIMILAR_DIRECT_BASE = 'https://apps.apple.com/us/app/app/id';
  // app-store-scraper 0.18 lib/constants.js `markets`, verbatim (115 storefronts)
  const MARKETS = {"DZ":143563,"AO":143564,"AI":143538,"AR":143505,"AM":143524,"AU":143460,"AT":143445,"AZ":143568,"BH":143559,"BB":143541,"BY":143565,"BE":143446,"BZ":143555,"BM":143542,"BO":143556,"BW":143525,"BR":143503,"VG":143543,"BN":143560,"BG":143526,"CA":143455,"KY":143544,"CL":143483,"CN":143465,"CO":143501,"CR":143495,"HR":143494,"CY":143557,"CZ":143489,"DK":143458,"DM":143545,"EC":143509,"EG":143516,"SV":143506,"EE":143518,"FI":143447,"FR":143442,"DE":143443,"GB":143444,"GH":143573,"GR":143448,"GD":143546,"GT":143504,"GY":143553,"HN":143510,"HK":143463,"HU":143482,"IS":143558,"IN":143467,"ID":143476,"IE":143449,"IL":143491,"IT":143450,"JM":143511,"JP":143462,"JO":143528,"KE":143529,"KR":143466,"KW":143493,"LV":143519,"LB":143497,"LT":143520,"LU":143451,"MO":143515,"MK":143530,"MG":143531,"MY":143473,"ML":143532,"MT":143521,"MU":143533,"MX":143468,"MS":143547,"NP":143484,"NL":143452,"NZ":143461,"NI":143512,"NE":143534,"NG":143561,"NO":143457,"OM":143562,"PK":143477,"PA":143485,"PY":143513,"PE":143507,"PH":143474,"PL":143478,"PT":143453,"QA":143498,"RO":143487,"RU":143469,"SA":143479,"SN":143535,"SG":143464,"SK":143496,"SI":143499,"ZA":143472,"ES":143454,"LK":143486,"SR":143554,"SE":143456,"CH":143459,"TW":143470,"TZ":143572,"TH":143475,"TN":143536,"TR":143480,"UG":143537,"UA":143492,"AE":143481,"US":143441,"UY":143514,"UZ":143566,"VE":143502,"VN":143471,"YE":143571};
  const DEFAULT_STORE = 143441;
  const PRIMARY_N = 50, ID_BATCH = 200, BUNDLE_BATCH = 50, MAX_URL_BYTES = 2000;
  const LABELS = { primary: 'primary search', related: 'related app', keyword: 'keyword search', similar: 'similar app links' };
  const REQUIRED_LOOKUP_KEYS = ['trackId', 'bundleId', 'trackName', 'trackViewUrl', 'artistId', 'artistName', 'version', 'currency',
    'minimumOsVersion', 'fileSizeBytes', 'genres', 'genreIds', 'primaryGenreName', 'primaryGenreId', 'releaseDate',
    'contentAdvisoryRating', 'averageUserRating', 'userRatingCount'];
  const PROPAGATE = (e) => !(e && e.code === 'NETWORK');

  // ---------------- pure helpers ----------------
  const upper = (cc) => String(cc == null ? 'US' : cc).toUpperCase();
  const lower = (s) => String(s).toLowerCase();
  function isLatin1(s) { return !/[^\u0000-ÿ]/.test(String(s)); }

  function storefrontFor(cc, o) {
    o = o || {};
    const C = upper(cc);
    if (o.compat) {
      const m = MARKETS[C];
      return { id: m || DEFAULT_STORE, source: m ? 'markets' : 'fallback', fallback: !m, verified: C === 'US' };
    }
    const t = o.storefronts && o.storefronts[C];
    if (t != null) {
      const id = typeof t === 'object' ? t.id : t;
      if (id) return { id: Number(id), source: 'storefronts', fallback: false, verified: typeof t === 'object' ? !!t.verified : false };
    }
    if (MARKETS[C]) return { id: MARKETS[C], source: 'markets', fallback: false, verified: C === 'US' };
    return { id: null, source: null, fallback: false, verified: false };
  }

  // What SMAR's backend receives for a keyword typed into smar-tool.org: sar-frontend SearchBar.js builds
  // `/ios/search?query=${term}&countryCode=${country}&time=...` unencoded; the WHATWG URL parser drops '#...' and
  // percent-encodes; express 4 / qs splits on '&', '+' -> ' ', percent-decodes (raw text kept if decoding fails).
  // Verified for 17 terms against express 4.22.3 + qs 6.16.0 (probes/ios-search-parity/frontend_query_sim.json).
  function smarBackendQuery(typed, country) {
    country = country || 'US';
    const URLc = (typeof URL !== 'undefined') ? URL : (root && root.URL);
    const u = new URLc(`/ios/search?query=${typed}&countryCode=${country}&time=2026-01-01T00:00:00.000Z`, 'https://smar-tool.org');
    const out = {};
    for (const part of u.search.slice(1).split('&')) {
      if (!part) continue;
      const eq = part.indexOf('=');
      const dec = (s) => { s = s.replace(/\+/g, ' '); try { return decodeURIComponent(s); } catch (e) { return s; } };
      const k = dec(eq === -1 ? part : part.slice(0, eq));
      const v = eq === -1 ? '' : dec(part.slice(eq + 1));
      if (k in out) out[k] = [].concat(out[k], v); else out[k] = v;
    }
    const q = out.query;
    return { query: q, countryCode: out.countryCode, status: q ? 200 : 400, changed: q !== typed };
  }

  function mzSearchReq(term, cc, o) {
    o = o || {};
    const sf = o.storefront != null ? o.storefront : storefrontFor(cc, o).id;
    return { url: SEARCH_BASE + encodeURIComponent(term), headers: { 'X-Apple-Store-Front': `${sf},24 t:native`, 'Accept-Language': 'en-us' }, bucket: 'itunes_api', kind: 'mzsearch' };
  }
  function lookupReq(ids, field, country) {
    return { url: `${LOOKUP_BASE}?${field || 'id'}=${ids.join(',')}&country=${country || 'us'}&entity=software`, headers: {}, bucket: 'itunes_api', kind: 'lookup' };
  }
  function similarPageReq(id, o) {
    o = o || {};
    return { url: (o.direct ? SIMILAR_DIRECT_BASE : SIMILAR_BASE) + id, headers: { 'X-Apple-Store-Front': `${DEFAULT_STORE},32` }, bucket: 'apple_other', kind: 'similar' };
  }
  function chunkIds(ids, field, o) {
    o = o || {};
    field = field || 'id';
    const max = o.max || (field === 'bundleId' ? BUNDLE_BATCH : ID_BATCH);
    const maxBytes = field === 'bundleId' ? (o.maxUrlBytes || MAX_URL_BYTES) : Infinity;
    const enc = (s) => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s).length : unescape(encodeURIComponent(s)).length);
    const base = enc(lookupReq([], field, o.country).url);
    const out = [];
    let cur = [], bytes = base;
    for (const id of ids) {
      const add = enc(String(id)) + (cur.length ? 1 : 0);
      if (cur.length && (cur.length >= max || bytes + add > maxBytes)) { out.push(cur); cur = []; bytes = base; }
      bytes += enc(String(id)) + (cur.length ? 1 : 0);
      cur.push(id);
    }
    if (cur.length) out.push(cur);
    return out;
  }

  const LOCKUP_KEEP = ['id', 'bundleId', 'name', 'artistId', 'artistName', 'artistUrl', 'releaseDate', 'minimumOSVersion', 'kind', 'url'];
  // anchors keep genres as [{genreId}] (the raw platform shape as_checks.anchorsFromPlatform reads); av:2 marks an anchor
  // that carries genres/artistUrl/minimumOSVersion/price, so a missing one is real anchor drift (older saved states lack it)
  const trimGenres = (g) => (Array.isArray(g) ? g.filter((x) => x && x.genreId != null).map((x) => ({ genreId: String(x.genreId) })) : undefined);
  function trimLockup(x) {
    const o = { av: 2 };
    const g = trimGenres(x.genres); if (g) o.genres = g;
    for (const k of LOCKUP_KEEP) if (x[k] !== undefined) o[k] = x[k];
    if (x.userRating) o.userRating = x.userRating;
    const of = Array.isArray(x.offers) && x.offers[0];
    if (of) o.offer = { price: of.price, priceFormatted: of.priceFormatted, version: of.version && of.version.display, size: of.assets && of.assets[0] && of.assets[0].size };
    if (x.contentRatingsBySystem && x.contentRatingsBySystem.appsApple) o.contentRating = x.contentRatingsBySystem.appsApple.name;
    return o;
  }
  // app-store-scraper search(): JSON.parse(body); results = bubbles[0] && bubbles[0].results || []; paginate slice.
  function parseMzSearch(body, o) {
    o = o || {};
    let j;
    try { j = JSON.parse(body); } catch (e) { return { ok: false, error: 'json: ' + e.message }; }
    if (!j || typeof j !== 'object') return { ok: false, error: 'not an object' };
    const noResults = /NoResults/i.test(String(j.pageType || '')) || /NoResults/i.test(String((j.metricsBase || {}).pageType || ''));
    const hasBubbles = Array.isArray(j.bubbles);
    const results = (j.bubbles && j.bubbles[0] && j.bubbles[0].results) || [];
    const num = o.num || PRIMARY_N, page = (o.page || 1) - 1 || 0;
    const lk = (((j.storePlatformData || {})['native-search-lockup-search'] || {}).results) || {};
    const lockups = {};
    for (const k of Object.keys(lk)) lockups[k] = trimLockup(lk[k]);
    return {
      ok: hasBubbles || noResults, noResults: !results.length, drift: !hasBubbles && !noResults,
      allIds: results.map((r) => String(r.id)), ids: results.slice(num * page, num * page + num).map((r) => String(r.id)),
      entities: results.slice(num * page, num * page + num).map((r) => r.entity), lockups,
      storefront: (j.metricsBase && j.metricsBase.storeFront) || null,
    };
  }
  function keepResult(a) { return typeof a.wrapperType === 'undefined' || a.wrapperType === 'software'; }
  function parseLookup(body) {
    let j;
    try { j = JSON.parse(body); } catch (e) { return { ok: false, error: 'json: ' + e.message }; }
    if (!j || !Array.isArray(j.results)) return { ok: false, error: 'no results[]' };
    const raw = j.results.filter(keepResult);
    const missingKeys = {};
    for (const r of raw) for (const k of REQUIRED_LOOKUP_KEYS) if (r[k] === undefined) missingKeys[k] = (missingKeys[k] || 0) + 1;
    return { ok: true, raw, resultCount: j.resultCount, missingKeys };
  }
  const GZIP_RE = /^\u001f(\u008b|�)/;
  function parseSimilar(body, o) {
    o = o || {};
    const text = String(body == null ? '' : body);
    const out = { ok: true, keyFound: false, ids: [], gzip: /gzip/i.test(String(o.contentEncoding || '')), garbled: GZIP_RE.test(text), productDv: null, storefront: null };
    if (out.garbled) { out.ok = false; out.error = 'gzip bytes not decoded'; return out; }
    if (text.indexOf('customersAlsoBoughtApps') !== -1) {
      out.keyFound = true;
      const m = /customersAlsoBoughtApps":(.*?\])/g.exec(text); // app-store-scraper 0.18 similar.js, verbatim
      try { out.ids = JSON.parse(m[1]).map(String); } catch (e) { out.ok = false; out.error = 'customersAlsoBoughtApps: ' + e.message; out.ids = []; }
    }
    const s = text.indexOf('its.serverData=');
    if (s !== -1) {
      const e = text.indexOf('</script>', s);
      try {
        const sd = JSON.parse(text.slice(s + 15, e === -1 ? undefined : e).trim().replace(/;$/, ''));
        const dv = (sd.storePlatformData || {})['product-dv-product'] || {};
        out.storefront = (dv.meta && dv.meta.storefront) || null;
        const ids = Object.keys(dv.results || {});
        if (ids.length) {
          const x = dv.results[o.id && dv.results[o.id] ? o.id : ids[0]];
          const vh = Array.isArray(x.versionHistory) && x.versionHistory[0];
          const of = Array.isArray(x.offers) && x.offers[0];
          out.productDv = { av: 2, id: x.id, bundleId: x.bundleId, name: x.name, artistId: x.artistId, artistName: x.artistName, artistUrl: x.artistUrl,
            releaseDate: x.releaseDate, userRating: x.userRating, version: vh ? vh.versionString : undefined, versionDate: vh ? vh.releaseDate : undefined,
            minimumOSVersion: x.minimumOSVersion, genres: trimGenres(x.genres), url: x.url, price: of ? of.price : undefined };
        }
      } catch (err) { /* anchor missing -> unverified, never a value */ }
    }
    return out;
  }

  // app-store-scraper 0.18 lib/common.js cleanApp, verbatim -- key ORDER is the CSV column order.
  function cleanApp(app) {
    return {
      id: app.trackId, appId: app.bundleId, title: app.trackName, url: app.trackViewUrl, description: app.description,
      icon: app.artworkUrl512 || app.artworkUrl100 || app.artworkUrl60, genres: app.genres, genreIds: app.genreIds,
      primaryGenre: app.primaryGenreName, primaryGenreId: app.primaryGenreId, contentRating: app.contentAdvisoryRating,
      languages: app.languageCodesISO2A, size: app.fileSizeBytes, requiredOsVersion: app.minimumOsVersion,
      released: app.releaseDate, updated: app.currentVersionReleaseDate || app.releaseDate, releaseNotes: app.releaseNotes,
      version: app.version, price: app.price, currency: app.currency, free: app.price === 0, developerId: app.artistId,
      developer: app.artistName, developerUrl: app.artistViewUrl, developerWebsite: app.sellerUrl, score: app.averageUserRating,
      reviews: app.userRatingCount, currentVersionScore: app.averageUserRatingForCurrentVersion,
      currentVersionReviews: app.userRatingCountForCurrentVersion, screenshots: app.screenshotUrls,
      ipadScreenshots: app.ipadScreenshotUrls, appletvScreenshots: app.appletvScreenshotUrls, supportedDevices: app.supportedDevices,
    };
  }

  // ---------------- engine ----------------
  function newSearchState(opts) {
    opts = opts || {};
    if (opts.term == null || opts.term === '') throw Object.assign(new Error('term is required'), { code: 'USAGE' });
    const o = {
      mode: 'search', term: String(opts.term), country: upper(opts.country), compat: !!opts.compat, primaryOnly: !!opts.primaryOnly,
      storefronts: opts.storefronts || null, similarLookup: opts.similarLookup === 'perPrimary' ? 'perPrimary' : 'batch',
      similarDirect: !!opts.similarDirect, rankReread: opts.rankReread !== false, maxUrlBytes: opts.maxUrlBytes || MAX_URL_BYTES,
    };
    return {
      v: 1, skill: 'smar-appstore-agent', runId: opts.runId || null, opts: o, stage: 'term', cursor: 0, stop: null,
      search: { typedTerm: o.term, term: null, siteTerm: null, siteChanged: false, storefront: null, req: null, reportedStorefront: null,
        allIds: [], ids: [], entities: [], lockups: {}, appIdQuery: null, probe: null, rankReread: null, primaryIds: [], usAvail: null, work: {} },
      primaries: [], similar: {}, relatedOrder: [], related: {}, details: {}, rows: [], dropped: [],
      transport: { gzipPages: [], garbledPages: [], batchSplits: 0, probeErrors: [], similarErrors: [], lookupErrors: [] },
    };
  }
  const now = (io) => (io && io.now ? io.now() : Date.now());
  const net = (e) => ({ status: 0, body: '', error: String((e && e.message) || e), network: true });
  async function get(io, req) {
    try { return await io.get(req); } catch (e) { if (PROPAGATE(e)) throw e; return net(e); }
  }
  async function getLookup(io, ids, field, country) {
    const r = await get(io, lookupReq(ids, field, country));
    if (r.status !== 200) return { ok: false, status: r.status, error: r.error || ('HTTP ' + r.status) };
    const p = parseLookup(r.body);
    if (!p.ok) return { ok: false, status: r.status, error: p.error };
    return Object.assign(p, { status: 200, fromJournal: !!r.fromJournal, headers: r.headers });
  }
  const mini = (raw) => ({ id: String(raw.trackId), appId: raw.bundleId });
  function stopWith(st, code, message, extra) {
    st.stop = Object.assign({ code, message }, extra || {});
    st.stage = 'stopped';
  }

  // Each stage handler performs at most one unit and returns true when it did network work (for unit counting).
  const STAGES = {
    async term(st) {
      const o = st.opts, s = st.search;
      const site = smarBackendQuery(o.term, o.country);
      s.siteTerm = site.query == null ? '' : (Array.isArray(site.query) ? String(site.query) : site.query);
      s.siteStatus = site.status;
      s.siteChanged = site.changed || Array.isArray(site.query);
      if (o.compat) {
        if (site.status === 400) return stopWith(st, 'smar_http400', `smar-tool.org would send an empty query for "${o.term}" (HTTP 400 "Search query is missing").`, { smarHttp: 400 }), false;
        // express/qs turns a repeated query param into an array; SMAR passes it to search() which stringifies it
        s.term = Array.isArray(site.query) ? String(site.query) : site.query;
      } else s.term = o.term;
      s.storefront = storefrontFor(o.country, { compat: o.compat, storefronts: o.storefronts });
      if (!s.storefront.id) return stopWith(st, 'no_storefront', `No App Store storefront is known for country ${o.country}.`), false;
      st.stage = 'search';
      return false;
    },
    async search(st, io) {
      const s = st.search, o = st.opts;
      s.req = mzSearchReq(s.term, o.country, { storefront: s.storefront.id });
      const r = await get(io, s.req);
      if (r.status !== 200) return stopWith(st, 'smar_http500_search', `Apple's search answered ${r.status ? 'HTTP ' + r.status : r.error} for "${s.term}" in ${o.country}; SMAR would answer HTTP 500.`, { smarHttp: 500, status: r.status }), true;
      const p = parseMzSearch(r.body);
      if (!p.ok || p.drift) return stopWith(st, 'endpoint_drift', `Apple's search response no longer has the expected shape (${p.error || 'bubbles missing'}).`, { smarHttp: 500, endpoint: 'MZSEARCH' }), true;
      Object.assign(s, { allIds: p.allIds, ids: p.ids, entities: p.entities, lockups: p.lockups, reportedStorefront: p.storefront });
      st.stage = 'primaries';
      return true;
    },
    async primaries(st, io) {
      const s = st.search, o = st.opts;
      if (!s.ids.length) { st.primaries = []; st.stage = 'probe'; return false; } // lookup?id= returns 0 results; skip the call
      const r = await getLookup(io, s.ids, 'id', o.country);
      if (!r.ok) return stopWith(st, 'smar_http500_search', `The lookup of the ${s.ids.length} search results failed (${r.error}); SMAR would answer HTTP 500.`, { smarHttp: 500, status: r.status }), true;
      st.primaries = r.raw; // Apple's lookup order (== request order, 74/74); non-software entities dropped
      s.primaryIds = r.raw.map((x) => x.bundleId);
      s.primaryTrackIds = r.raw.map((x) => String(x.trackId)); // the lookup's own result list (the app-id branch replaces st.primaries)
      s.lookupMissingKeys = r.missingKeys;
      st.stage = 'probe';
      return true;
    },
    async probe(st, io) {
      const s = st.search, o = st.opts;
      // SMAR's request() throws "unescaped characters" before sending for non-Latin-1 terms -> keyword path
      if (!isLatin1(s.term)) { s.probe = { skipped: 'non_latin1', hit: false }; s.appIdQuery = false; st.stage = nextAfterProbe(st); return false; }
      const r = await getLookup(io, [s.term], 'bundleId', o.country);
      if (r.ok && r.raw.length) {
        s.probe = { hit: true, appId: r.raw[0].bundleId, id: String(r.raw[0].trackId) };
        s.appIdQuery = true;
        st.primaries = [r.raw[0]];
      } else {
        s.probe = { hit: false, status: r.status, error: r.ok ? undefined : r.error };
        if (!r.ok) st.transport.probeErrors.push({ status: r.status, error: r.error });
        s.appIdQuery = false;
      }
      st.stage = nextAfterProbe(st);
      return true;
    },
    // non-US: similar({appId}) first does app({appId}) in the US store; a primary not sold in the US gets no related apps
    async usAvail(st, io) {
      const s = st.search;
      if (!s.usAvail) s.usAvail = { queue: chunkIds(st.primaries.map((m) => m.bundleId), 'bundleId', { country: 'us', maxUrlBytes: st.opts.maxUrlBytes }), inUs: [], notInUs: [], errors: [] };
      const u = s.usAvail;
      if (!u.queue.length) {
        const inUs = new Set(u.inUs);
        u.notInUs = st.primaries.filter((m) => !inUs.has(lower(m.bundleId))).map((m) => m.bundleId);
        st.stage = 'similar'; st.cursor = 0;
        return false;
      }
      const chunk = u.queue[0];
      const r = await getLookup(io, chunk, 'bundleId', undefined);
      u.queue.shift();
      if (r.ok) { for (const g of r.raw) u.inUs.push(lower(g.bundleId)); }
      else if (chunk.length > 1) { st.transport.batchSplits++; const h = Math.ceil(chunk.length / 2); u.queue.unshift(chunk.slice(0, h), chunk.slice(h)); }
      else u.errors.push({ appId: chunk[0], status: r.status, error: r.error }); // SMAR: "Unable to fetch app details" -> no related apps
      return true;
    },
    async similar(st, io) {
      const s = st.search, o = st.opts;
      const list = similarFor(st);
      if (st.cursor >= list.length) { st.cursor = 0; st.stage = o.similarLookup === 'perPrimary' ? 'details' : 'similarLookup'; return false; }
      const m = list[st.cursor];
      const id = String(m.trackId);
      const req = similarPageReq(id, { direct: o.similarDirect });
      let r = await get(io, req);
      let p = r.status === 200 ? parseSimilar(r.body, { contentEncoding: r.contentEncoding, id }) : null;
      let garbled = false;
      if (p && (p.garbled || r.garbled)) { // undecoded gzip body (a poisoned cache/journal entry): re-fetch once, fresh
        garbled = true;
        r = await get(io, Object.assign({}, req, { fresh: true }));
        p = r.status === 200 ? parseSimilar(r.body, { contentEncoding: r.contentEncoding, id }) : null;
      }
      if (p && r.garbled && !p.garbled) { p.ok = false; p.error = 'garbled body'; p.ids = []; p.keyFound = false; }
      const rec = { status: r.status, encoding: r.contentEncoding || null, gzipBody: !!r.gzipBody, keyFound: !!(p && p.keyFound), ids: (p && p.ids) || [], productDv: (p && p.productDv) || null, storefront: (p && p.storefront) || null };
      if (r.status !== 200) rec.error = r.error || ('HTTP ' + r.status);
      else if (!p.ok) rec.error = p.error;
      let related = null;
      if (o.similarLookup === 'perPrimary' && rec.ids.length) { // SMAR's own pattern: one lookup per primary, country us
        const l = await getLookup(io, rec.ids, 'id', undefined);
        if (l.ok) related = l.raw.map(mini);
        else { rec.lookupError = l.error; st.transport.lookupErrors.push({ stage: 'similar_lookup', primary: id, status: l.status, error: l.error }); }
      }
      // ---- commit ----
      if (garbled) st.transport.garbledPages.push(id);
      if (rec.gzipBody || (rec.encoding && /gzip|deflate|br/i.test(rec.encoding))) st.transport.gzipPages.push(id); // SMAR (no decoding) would have lost these
      if (rec.error) st.transport.similarErrors.push({ id, appId: m.bundleId, status: rec.status, error: rec.error });
      st.similar[id] = rec;
      if (o.similarLookup === 'perPrimary') {
        const got = related || [];
        for (const g of got) st.related[g.id] = g;
        st.relatedOrder.push([id, got.map((g) => g.id)]);
      }
      st.cursor++;
      return true;
    },
    async similarLookup(st, io) {
      const s = st.search;
      const w = s.work;
      if (!w.relQueue) {
        const seen = new Set(), uniq = [];
        for (const m of similarFor(st)) for (const id of (st.similar[String(m.trackId)] || {}).ids || []) if (!seen.has(id)) { seen.add(id); uniq.push(id); }
        w.relQueue = chunkIds(uniq, 'id');
        w.relFailed = [];
      }
      if (!w.relQueue.length) {
        // per-primary order = page order minus ids the lookup did not return (Apple returns request order)
        for (const m of similarFor(st)) {
          const id = String(m.trackId);
          st.relatedOrder.push([id, ((st.similar[id] || {}).ids || []).filter((x) => st.related[x])]);
        }
        st.stage = 'details'; st.cursor = 0;
        return false;
      }
      const chunk = w.relQueue[0];
      const r = await getLookup(io, chunk, 'id', undefined);
      w.relQueue.shift();
      if (r.ok) for (const g of r.raw) st.related[String(g.trackId)] = mini(g);
      else if (chunk.length > 1) { st.transport.batchSplits++; const h = Math.ceil(chunk.length / 2); w.relQueue.unshift(chunk.slice(0, h), chunk.slice(h)); }
      else { w.relFailed.push(chunk[0]); st.transport.lookupErrors.push({ stage: 'similar_lookup', id: chunk[0], status: r.status, error: r.error }); }
      return true;
    },
    async details(st, io) {
      const s = st.search, o = st.opts, w = s.work;
      if (!w.want) {
        const all = allResults(st);
        const seen = new Set();
        w.want = [];
        for (const a of all) if (!seen.has(a.appId)) { seen.add(a.appId); w.want.push(a.appId); }
        w.detQueue = chunkIds(w.want, 'bundleId', { country: o.country, maxUrlBytes: o.maxUrlBytes });
        w.singles = [];
      }
      if (w.detQueue.length) {
        const chunk = w.detQueue[0];
        const r = await getLookup(io, chunk, 'bundleId', o.country);
        w.detQueue.shift();
        if (r.ok) {
          const exact = new Map(), low = new Map();
          for (const g of r.raw) { if (!exact.has(g.bundleId)) exact.set(g.bundleId, g); if (!low.has(lower(g.bundleId))) low.set(lower(g.bundleId), g); }
          for (const id of chunk) {
            const d = exact.get(id) || low.get(lower(id));
            if (d) st.details[lower(id)] = { raw: d, via: 'batch' };
            else w.singles.push(id); // tell a batch quirk from "not available in CC"
          }
        } else if (chunk.length > 1) { st.transport.batchSplits++; const h = Math.ceil(chunk.length / 2); w.detQueue.unshift(chunk.slice(0, h), chunk.slice(h)); }
        else w.singles.push(chunk[0]);
        return true;
      }
      if (w.singles.length) {
        const id = w.singles[0];
        if (st.details[lower(id)]) { w.singles.shift(); return false; }
        const r = await getLookup(io, [id], 'bundleId', o.country);
        w.singles.shift();
        if (r.ok && r.raw[0]) st.details[lower(id)] = { raw: r.raw[0], via: 'single' };
        else if (r.ok) st.dropped.push({ appId: id, stage: 'details', reason: 'not_in_storefront' });
        else { st.dropped.push({ appId: id, stage: 'details', reason: 'lookup_failed', status: r.status, error: r.error }); st.transport.lookupErrors.push({ stage: 'details', appId: id, status: r.status, error: r.error }); }
        return true;
      }
      st.stage = 'rows';
      return false;
    },
    async rows(st) {
      const o = st.opts;
      const seen = new Set();
      st.rows = [];
      let seq = 0, dupes = 0, invalid = 0;
      for (const a of allResults(st)) {
        const d = st.details[lower(a.appId)];
        if (!d) { invalid++; continue; }
        const appId = d.raw.bundleId; // {...appInfo, ...appDetails}: the detail's bundleId is the de-dup key
        if (seen.has(appId)) { dupes++; continue; }
        seen.add(appId);
        st.rows.push({ appId, key: lower(a.appId), source: a.source, seq: seq++ });
      }
      st.search.counts = { primary: st.primaries.length, related: allResults(st).length - st.primaries.length, all: allResults(st).length, valid: allResults(st).length - invalid, unique: st.rows.length, duplicates: dupes };
      if (!st.rows.length) return stopWith(st, 'no_results', `Search for '${st.search.term}' did not return any results.`, { smarHttp: 500 }), false;
      st.stage = o.rankReread ? 'reread' : 'done';
      return false;
    },
    async reread(st, io) {
      const s = st.search;
      // its own journal key (journalTag): the re-read never overwrites the recorded search that produced the primaries,
      // so --resume and --replay see the original response and the re-read each under its own key (SE-C)
      const r = await get(io, Object.assign({}, s.req, { fresh: true, tag: 'rank-reread', journalTag: 'rank-reread' }));
      const p = r.status === 200 ? parseMzSearch(r.body) : null;
      if (p && p.ok && !p.drift) {
        const diff = [];
        for (let i = 0; i < Math.max(p.ids.length, s.ids.length); i++) if (p.ids[i] !== s.ids[i]) diff.push(i);
        const a = new Set(s.ids), b = new Set(p.ids);
        s.rankReread = { same: diff.length === 0, fromJournal: !!r.fromJournal, positionsDiffering: diff.length, sameSet: a.size === b.size && [...a].every((x) => b.has(x)), firstDiff: diff.slice(0, 5) };
      } else s.rankReread = { error: r.error || (r.status !== 200 ? 'HTTP ' + r.status : 'unparseable') };
      st.stage = 'done';
      return true;
    },
  };
  function nextAfterProbe(st) {
    if (st.search.appIdQuery || st.opts.primaryOnly || !st.primaries.length) return 'details';
    return st.opts.country !== 'US' ? 'usAvail' : 'similar';
  }
  function similarFor(st) {
    if (st.search.appIdQuery || st.opts.primaryOnly) return [];
    if (st.opts.country === 'US') return st.primaries;
    const u = st.search.usAvail;
    if (!u) return [];
    const inUs = new Set(u.inUs);
    return st.primaries.filter((m) => inUs.has(lower(m.bundleId)));
  }
  // searchController allResults: primaries ('primary search') then every primary's related apps in order ('related app')
  function allResults(st) {
    const out = st.primaries.map((m) => ({ id: String(m.trackId), appId: m.bundleId, source: LABELS.primary }));
    for (const [, ids] of st.relatedOrder) for (const id of ids) { const g = st.related[id]; if (g) out.push({ id, appId: g.appId, source: LABELS.related }); }
    return out;
  }

  async function advanceSearch(st, io, o) {
    o = o || {};
    let units = 0;
    while (st.stage !== 'done' && st.stage !== 'stopped') {
      if (o.maxUnits != null && units >= o.maxUnits) break;
      if (o.deadlineMs != null && now(io) >= o.deadlineMs) break;
      const h = STAGES[st.stage];
      if (!h) throw Object.assign(new Error('unknown search stage ' + st.stage), { code: 'STATE' });
      const did = await h(st, io);
      if (did) { units++; if (io && io.save) await io.save(st); }
    }
    if (io && io.save && (st.stage === 'done' || st.stage === 'stopped')) await io.save(st);
    return { done: st.stage === 'done', units, stop: st.stop || undefined };
  }
  async function runSearch(optsOrSt, io, o) {
    const st = optsOrSt && optsOrSt.v === 1 && optsOrSt.search ? optsOrSt : newSearchState(optsOrSt);
    await advanceSearch(st, io, o);
    return st;
  }

  function getWriter(w) {
    if (w) return w;
    if (typeof module === 'object' && module.exports && typeof require === 'function') { try { return require('./as_writer'); } catch (e) { /* standalone */ } }
    return (root && root.SMAR_AS_WRITER) || null;
  }
  function searchRows(st, o) {
    o = o || {};
    const W = o.writer === false ? null : getWriter(o.writer);
    const cc = st.opts.country;
    return st.rows.map((r) => {
      const raw = st.details[r.key].raw;
      if (W && W.searchRow) return W.searchRow(raw, cc, r.source);
      return Object.assign({}, cleanApp(raw), { country: cc, source: r.source });
    });
  }

  function cap(a, n) { return a.length > n ? a.slice(0, n) : a; }
  function searchReport(st) {
    const s = st.search, o = st.opts, t = st.transport;
    const bySource = {};
    for (const r of st.rows) { const k = r.source === LABELS.primary ? LABELS.keyword : LABELS.similar; bySource[k] = (bySource[k] || 0) + 1; }
    const pages = Object.keys(st.similar).map((k) => st.similar[k]);
    const ok200 = pages.filter((p) => p.status === 200 && !p.error);
    const keyMissing = ok200.filter((p) => !p.keyFound).length;
    const similarDrift = ok200.length > 0 && keyMissing >= Math.max(3, Math.ceil(0.2 * ok200.length));
    // rows SMAR's similar() would have lost: related rows reachable only through a page Apple sent compressed
    const gz = new Set(t.gzipPages.concat(t.garbledPages));
    let gzRows = 0;
    if (gz.size) {
      const other = new Set();
      for (const [pid, ids] of st.relatedOrder) if (!gz.has(pid)) for (const id of ids) other.add(id);
      const prim = new Set(st.primaries.map((m) => String(m.trackId)));
      const lost = new Set();
      for (const [pid, ids] of st.relatedOrder) if (gz.has(pid)) for (const id of ids) if (!other.has(id) && !prim.has(id)) lost.add(id);
      gzRows = lost.size;
    }
    const compatReasons = [];
    if (s.storefront && s.storefront.fallback) compatReasons.push({ code: 'smar_storefront_fallback', detail: `${o.country} is not in app-store-scraper's markets: SMAR searches the US store (143441) and looks up in ${o.country}` });
    if (o.compat && s.siteChanged) compatReasons.push({ code: 'site_term_applied', detail: `searched "${s.term}" (what smar-tool.org sends for "${o.term}")` });
    if (gz.size) compatReasons.push({ code: 'transport_dependent', detail: `${gz.size} similar page(s) arrived compressed; SMAR (no decoding) would have lost about ${gzRows} related row(s)` });
    // a 200 similar page without customersAlsoBoughtApps is no compat risk (stress WI-9): SMAR's similar() reads the same
    // page and returns [] (small apps legitimately have no list), so its file holds the same rows; the count stays in
    // drift.similarKeyAbsent and a compressed page is transport_dependent above. Only a mass loss (similarDrift: the
    // endpoint changed) is named, since a SMAR run at another moment may read pages that have the key again.
    if (similarDrift && o.compat) compatReasons.push({ code: 'similar_key_missing', detail: `${keyMissing} of ${ok200.length} similar pages had no customersAlsoBoughtApps (endpoint drift)` });
    if (s.rankReread && s.rankReread.same === false) compatReasons.push({ code: 'search_rank_nondeterminism', detail: `a second search read differed at ${s.rankReread.positionsDiffering} of 50 positions` });
    if (o.primaryOnly) compatReasons.push({ code: 'no_smar_equivalent', detail: '--primary-only has no SMAR equivalent' });
    if (st.stop && st.stop.smarHttp) compatReasons.push({ code: 'smar_http500', detail: st.stop.message });
    const problems = [];
    if (similarDrift) problems.push(`similar pages: customersAlsoBoughtApps missing on ${keyMissing} of ${ok200.length} pages (endpoint drift)`);
    if (t.similarErrors.length) problems.push(`${t.similarErrors.length} similar page(s) failed after retries; their related apps are missing (SMAR loses them too)`);
    const lookupFailed = st.dropped.filter((d) => d.reason === 'lookup_failed');
    if (lookupFailed.length) problems.push(`${lookupFailed.length} app detail lookup(s) failed after retries (REFETCH)`);
    const rep = {
      run: { term: o.term, country: o.country, storefront: s.storefront && s.storefront.id, storefrontSource: s.storefront && s.storefront.source,
        compat: o.compat, primaryOnly: o.primaryOnly || undefined, appIdQuery: s.appIdQuery, searchedTerm: s.term },
      rows: st.rows.length, bySource,
      primaries: { searchIds: s.ids.length, allIds: s.allIds.length, lookedUp: s.primaryIds.length, droppedByLookup: s.ids.length - s.primaryIds.length, used: st.primaries.length },
      related: { pages: pages.length, pagesWithKey: pages.filter((p) => p.keyFound).length, ids: Object.keys(st.related).length, notInUs: s.usAvail ? s.usAvail.notInUs.length : undefined },
      counts: s.counts,
      smarWouldDrop: { count: st.dropped.length, items: cap(st.dropped.map((d) => ({ appId: d.appId, stage: d.stage, reason: d.reason })), 25) },
      transportRisk: { similarGzip: cap(t.gzipPages.concat(t.garbledPages), 25), similarGzipRows: gzRows, appIdProbeErrors: t.probeErrors.length, batchSplits: t.batchSplits },
      // similarKeyMissing (what the engine hands compatExact as a compat reason) only on a mass loss (WI-9); the plain
      // count of 200 pages without customersAlsoBoughtApps stays in similarKeyAbsent
      drift: { searchRankNondeterminism: s.rankReread || undefined, similarKeyMissing: similarDrift ? keyMissing : 0, similarKeyAbsent: keyMissing, similarDrift },
      compatReasons, problems,
      countryVerified: !!(s.storefront && (s.storefront.verified || (s.reportedStorefront && String(s.reportedStorefront) === String(s.storefront.id) && !s.storefront.fallback))),
    };
    if (s.siteChanged || s.siteStatus === 400) rep.smarSiteTerm = s.siteTerm;
    if (s.siteStatus === 400) rep.smarUiWouldReject = true;
    if (st.stop && (st.stop.code === 'smar_http500_search' || st.stop.code === 'endpoint_drift' || st.stop.code === 'no_results')) rep.smarSearchWouldHttp500 = st.stop.message;
    if (st.stop) rep.stop = st.stop;
    return rep;
  }

  return {
    VERSION, SEARCH_BASE, LOOKUP_BASE, SIMILAR_BASE, SIMILAR_DIRECT_BASE, MARKETS, DEFAULT_STORE, PRIMARY_N, ID_BATCH, BUNDLE_BATCH,
    MAX_URL_BYTES, LABELS, REQUIRED_LOOKUP_KEYS,
    storefrontFor, smarBackendQuery, isLatin1, mzSearchReq, lookupReq, similarPageReq, chunkIds,
    parseMzSearch, parseLookup, parseSimilar, keepResult, cleanApp,
    newSearchState, advanceSearch, runSearch, searchRows, searchReport,
    _internal: { allResults, similarFor, STAGES },
  };
}));
