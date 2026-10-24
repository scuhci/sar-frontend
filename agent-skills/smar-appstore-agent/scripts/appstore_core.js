// appstore_core.js -- smar-appstore-agent v2: the section 6 API (PLAN.md §6.1-6.3), composed from the stage modules.
// UMD: require('./appstore_core') in Node, window.SMAR_AS in a browser (load as_writer, as_search, as_chart, as_reviews,
// as_checks first). Pure engine: no file I/O and no transport of its own -- every Apple request goes through the injected
// io (net_apple.js makeIo in Node). Values are copied by the modules from Apple's JSON (A1); this file only sequences
// them, runs the cross-checks, and decides READY_TO_DELIVER / NEXT.
//
// EXPORTS
//   Constants  VERSION '2.1.0', MARKETS, STOREFRONTS {CC:{id, verified}}, COLLECTIONS, GENRES (IOS_CATEGORIES), HEADERS,
//              EXCLUDE, RENAME, LIMITS, CHECKS, REQUIRED_LOOKUP_KEYS, OPTIONAL_KEY_BASELINE, SAMPLE {search,chart,ids,rerun}
//   Builders   mzSearchReq, lookupReq, similarPageReq, chunkIds (as_search); chartReq (as_chart); reviewsReq, mzReviewsReq
//              (as_reviews); webPageReq(cc, id, {url}); searchApiReq(name, cc)
//   Parsers    parseMzSearch, parseLookup, parseSimilar, parseChartRss, parseReviewsRss, parseMzReviews, parsePage
//              (= as_checks.anchorsFromWebPage), ensureArray
//   SMAR       cleanApp, cleanList, smarCleanText, renderCell, smarHeader, toCsv, renderFile, smarDate, smarFileName,
//              smarBackendQuery
//   Checks     checkRow, checkRatings, checkContentRating, checkReviews, invariants, driftReport (as_checks)
//   Terms      resolveTerm(phrase) -> {TERM, rule:'quoted'|'labelled'|'id'|'generic'|'name'|'verbatim', changed}  (SKILL.md step 2)
//              slugOf(text) -> file-name slug (Unicode letters kept; a hash when other characters were dropped or the
//                           slug was cut at SLUG_MAX_BYTES)
//   Countries  checkCountry(cc) -> null | usage message (SMAR_MENU = SMAR's 222 menu codes, plus MARKETS)
//   Resolution resolveName(results, name) -> {decision:'USE'|'ASK', match, candidates[<=5], reason}
//              lookup(io, name, {country}) -> {decision, match, candidates, query}
//   Engine     newState(opts) -> st        opts {mode:'search'|'chart'|'reviews'|'ids'|'rerun', country='US', compat,
//                                           term, primaryOnly, collection, genre, num, apps|ids, all, bulk, layout,
//                                           source, sample, heal, healWaitMs, runId}
//              seed(st, io)                marks the run seeded (all requests happen in advance)
//              advance(st, io, {deadlineMs, settle}) -> {done, units, deadline?}   resumable; throws io errors
//                                           RATE_LIMITED / REPLAY_MISS / NETWORK (state stays consistent; save and resume)
//                                           reviews: REVIEW_WORKERS apps at once inside the shared limiter; settle:true =
//                                           a deadline inside a re-fetch pass finalizes the apps as they stand
//              isDone(st); requeue(st) -> n   (--resume of a finished reviews run retries unhealed empty pages and feeds
//                                           that came back empty although the app has reviews)
//              settle(st) -> bool          end an interrupted reviews re-fetch pass as it stands (run finished again)
//              progress(st) -> {apps, appsDone, rows, fraction, refetching}   the --until-done progress line's counts
//              integrity(st) -> null | {fix:'rebuild'|'restart'|'restart_apps', why}; repair(st, ig) -> st   (--resume of a
//                                           progress file whose rows disagree with its own bookkeeping, FI-12)
//              refetch(st, io, ids) -> [{appId, status}]   re-collect the details of listed apps of a finished run
//              outputs(st, {compat, deliverAnyway, now, emitBoth, cmd, refetchCmd, runner, requests})
//                -> {csv (file text, BOM included where SMAR's site adds one) | null, csvName:'final'|'not_ready'|null,
//                    relog, summaryJson, summary, rows, compatExact, exitCode, other?:{csv, compat}|{skipped}}
//              summarize(st, {runner, full, cmd, error, incomplete, requests}) -> summary of an unfinished run
//              remaining(st) -> short text of what is left (the --until-done progress line)
//   outputs() also enforces: lookup values outside as_checks.LOOKUP_TYPES are quarantined in both modes
//   (summary.typeViolations); the writer's refused non-scalar cells (summary.refusedCells) block like drift; with
//   deliverAnyway every cell of each drifted column is blanked (summary.blankedColumns), or the delivery is refused
//   (STOP, exit 1) when a drifted anchor is no CSV column. READY is never true while a drifted column holds a value.
//   A held-back finished run (FIX_ANCHOR / REFETCH) carries summary.deliverAnyway {possible, blankColumns, why}; when
//   it is impossible NEXT says so. summary.crossChecks.unanchoredRows = rows no second Apple source evaluated; the
//   relog lists every output-changing option (and the shell command). A default chart outside SMAR's markets carries
//   SMAR's simulated file (compatExact smar_storefront_fallback, smarWouldDrop.basis).
// State: PLAN §6.2 (as_search's slice for search; st.chart, st.reviews[ref] = as_reviews app state; st.xc = cross-check
//   pages/plan; st.phase 'engine'|'xcheck'|'done'). JSON-serialisable; raw lookup objects only, rows rendered at write.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = Object.assign(factory(require('./as_writer'), require('./as_search'), require('./as_chart'), require('./as_reviews'), require('./as_checks')), { source: () => String(factory) });
  } else {
    // source(): the full module text for the browser fingerprint (browser_driver.js), not just the exported surface
    root.SMAR_AS = Object.assign(factory(root.SMAR_AS_WRITER, root.SMAR_AS_SEARCH, root.SMAR_AS_CHART, root.SMAR_AS_REVIEWS, root.SMAR_AS_CHECKS), { source: () => String(factory) });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (W, S, C, R, K) {
  'use strict';
  const VERSION = '2.1.0';
  const MODES = ['search', 'chart', 'reviews', 'ids', 'rerun'];
  const LIMITS = { itunesApiPerMin: 18, appleOtherPerMin: 30, idBatch: 200, bundleBatch: 50, maxUrlBytes: 2000, idsMax: 1000 };
  const SAMPLE = { search: 10, chart: 5, ids: 10, rerun: 10 };
  const MAX_REFETCH = 25, MAX_SAMPLE = 25;
  const PAGE_FAIL_STREAK = 2; // web-page cross-check: transport failures in a row that end the optional sample (FI-09)
  const REVIEW_WORKERS = 3; // reviews: apps advanced at once inside the shared rate limit (stress SCALE-5)
  // Default-mode storefronts. Stage 1 never produced Apple's full storefront table, so this is app-store-scraper's
  // markets map; verified = a storefront the campaign checked against an MZSEARCH/RSS response (PLAN 4.6: US, GB).
  const STOREFRONTS = {};
  for (const cc of Object.keys(S.MARKETS)) STOREFRONTS[cc] = { id: S.MARKETS[cc], verified: cc === 'US' || cc === 'GB' };
  const L = W.LABELS;
  const OUT_LABEL = { [L.primary]: L.keyword, [L.related]: L.similar, [L.keyword]: L.keyword, [L.similar]: L.similar };
  const lower = (s) => String(s == null ? '' : s).toLowerCase();
  const upper = (s) => String(s == null ? '' : s).trim().toUpperCase();
  const err = (code, msg) => Object.assign(new Error(msg), { code });
  const isNumId = (s) => /^\d{1,12}$/.test(String(s));
  const A_NUM = (s) => isNumId(s);
  // bundle ids usually contain a dot, but not always (CRONOMETER-GOLD, RunKeeperPro): isBundleId accepts both; lookup()
  // treats a dotted token as an exact bundle id and anything else as a name.
  const isBundleId = (s) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(String(s)) && !/^\d+$/.test(String(s));
  const nowMs = (io) => (io && io.now ? io.now() : Date.now());
  const save = async (io, st) => { if (io && io.save) await io.save(st); };
  function fnv(s) { let h = 0x811c9dc5; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; }
  function checkDeadline(io, dl) { if (dl !== Infinity && dl != null && nowMs(io) >= dl) throw err('DEADLINE', 'deadline reached'); }
  // "head: a, b, c (+N more)" within max characters (summary strings stay short; the 4 KB stdout cap cuts long ones)
  function capList(items, head, max, sep) {
    sep = sep || ', ';
    let s = head, i = 0;
    for (; i < items.length; i++) { const add = (i ? sep : '') + items[i]; if (i && s.length + add.length > max) break; s += add; }
    return i < items.length ? s + ` (+${items.length - i} more)` : s;
  }
  const ratingsText = (n) => (n == null ? 'an unknown number of ratings' : `${Number(n).toLocaleString('en-US')} rating${n === 1 ? '' : 's'}`);

  // ------------------------------------------------------------------ request builders owned here
  function webPageReq(cc, id, o) {
    const u = o && o.url ? String(o.url).split('?')[0] : '';
    const url = /^https:\/\/apps\.apple\.com\/[a-z]{2}\/app\//.test(u) && new RegExp('/id' + id + '$').test(u) ? u : `https://apps.apple.com/${lower(cc)}/app/id${id}`;
    return { url, headers: {}, bucket: 'apple_other', kind: 'WEB_PAGE' };
  }
  function searchApiReq(name, cc) {
    return { url: `https://itunes.apple.com/search?term=${encodeURIComponent(name)}&country=${upper(cc || 'US')}&entity=software`, headers: {}, bucket: 'itunes_api', kind: 'SEARCH_API' };
  }

  // ------------------------------------------------------------------ name resolution (A11; v1as-name-resolution rule)
  const nn = (s) => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const cand = (r) => ({ trackId: r.trackId, bundleId: r.bundleId, title: r.trackName, developer: r.artistName, ratings: r.userRatingCount || 0 });
  function resolveName(results, name) {
    const c = (Array.isArray(results) ? results : []).filter((r) => r && (r.wrapperType === undefined || r.wrapperType === 'software'));
    const want = nn(name);
    const lvl = (t) => (nn(t) === want ? 2 : new RegExp('^' + esc(want) + '\\s*[-:–—|(]').test(nn(t)) ? 1 : 0);
    // M = exact title, title prefix followed by [-:–—|(], or a title starting with the name as a whole word
    // (applied to every result, exactly as the verified simulation did: 8 USE right, 2 ASK, 0 wrong).
    const M = c.filter((r) => lvl(r.trackName) > 0 || nn(r.trackName).startsWith(want + ' '));
    let match = null, reason;
    if (!want) reason = 'empty_name';
    else if (!M.length) reason = 'no_title_match';
    else if (M.length === 1) { match = M[0]; reason = 'unique_title_match'; }
    else if (M[0] === c[0] && M.slice(1).every((o) => (c[0].userRatingCount || 0) >= 10 * (o.userRatingCount || 0))) { match = c[0]; reason = 'dominant_first_result'; }
    else reason = 'ambiguous';
    const pool = (M.length ? M : c).slice(0, 5).map(cand);
    return { decision: match ? 'USE' : 'ASK', match: match ? cand(match) : null, candidates: match ? [] : pool, reason };
  }
  async function lookup(io, name, o) {
    const cc = upper((o && o.country) || 'US');
    const q = String(name || '').trim();
    if (!q) throw err('USAGE', 'lookup needs a non-empty app name');
    const exact = isNumId(q) ? 'id' : isBundleId(q) && /\./.test(q) ? 'bundleId' : null;
    const req = exact ? S.lookupReq([q], exact, cc) : searchApiReq(q, cc);
    const r = await io.get(req);
    if (r.status !== 200) throw err('HTTP', `Apple answered HTTP ${r.status} to the ${exact ? 'lookup' : 'search'} request`);
    let j; try { j = JSON.parse(r.body); } catch (e) { throw err('ENDPOINT_DRIFT', 'unreadable answer: ' + e.message); }
    const results = Array.isArray(j.results) ? j.results : [];
    if (exact) {
      const hit = results.find((x) => (exact === 'id' ? String(x.trackId) === q : lower(x.bundleId) === lower(q)));
      return { query: q, exact, decision: hit ? 'USE' : 'ASK', match: hit ? cand(hit) : null, candidates: [], reason: hit ? 'exact_id' : 'not_in_storefront' };
    }
    return Object.assign({ query: q }, resolveName(results, q));
  }

  // ------------------------------------------------------------------ TERM rule (SKILL.md step 2), deterministic
  // resolveTerm(phrase) -> {TERM, rule, changed}: what a user would type into SMAR's search box for a request phrase.
  //   quoted   the first quoted part, verbatim ("meditation apps", “...”, «...», 「...」, '...'; an unpaired " at
  //            either end too: '"meditation apps' -> meditation apps)
  //   labelled keyword: / term: / search term: / query: <x> -> x verbatim (its own quotes removed)
  //   id       a bundle id (com.calm.calmapp) or a number: verbatim (SMAR's app-id branch / a text search)
  //   generic  a trailing lower-case "app"/"apps" (or "Apps") is dropped: "fitness tracking apps" -> fitness tracking;
  //            a capitalised singular "App" after a capitalised word is part of a name and kept ("Cash App")
  //   verbatim anything else (outer whitespace trimmed). Never adds, reorders, pluralises, translates or corrects.
  // slugOf(text) -> the file-name slug: lower case, every run of characters other than Unicode letters/digits -> '_';
  //   when the text holds any other character than single inner spaces ("c++", "c#", "fitness-tracking") a 6-hex hash
  //   of the exact text is appended, so two terms that differ by more than letter case never share a file name (SE-K:
  //   家計簿 used to become "_" and a second CJK term collided).
  const QUOTES = [/"([^"]+)"/, /\u201c([^\u201d]+)\u201d/, /\u201e([^\u201c\u201d]+)[\u201c\u201d]/, /\u00ab\s*([^\u00bb]+?)\s*\u00bb/, /\u300c([^\u300d]+)\u300d/, /\u300e([^\u300f]+)\u300f/,
    /\u2018([^\u2019]+)\u2019/, /(?:^|\s)'([^']+)'(?=$|[\s.,;:!?])/];
  function resolveTerm(phrase) {
    const t = String(phrase == null ? '' : phrase).trim();
    if (!t) throw err('USAGE', 'term needs the user\'s phrase');
    // an emoji or symbol is a real search ("🧘", "&": SMAR's box and Apple's search take them, stress WI-1); only a phrase
    // of nothing but quote marks, spaces and invisible characters holds no term. Invisible: controls, format characters,
    // lone combining marks (a variation selector U+FE0F on its own), default-ignorable fillers (U+3164) and the blank
    // braille cell U+2800
    if (!/[^\s"'“”„‘’«»「」『』\p{Cc}\p{Cf}\p{M}\p{Default_Ignorable_Code_Point}\u2800]/u.test(t)) throw err('USAGE', 'term needs the user\'s words (the phrase holds only quote marks or invisible characters)');
    const out = (TERM, rule) => ({ TERM, rule, changed: TERM !== t });
    for (const re of QUOTES) { const m = t.match(re); if (m && m[1].trim()) return out(m[1], 'quoted'); }
    // a quote the user opened (or closed) but never paired ('"meditation apps') still marks a quoted term: the text
    // without that quote character, verbatim (the quote is never part of the TERM)
    const t0 = t.replace(/^["\u201c\u201e\u00ab\u300c\u300e]+\s*/, '').replace(/\s*["\u201d\u00bb\u300d\u300f]+$/, '');
    if (t0 !== t && t0) return out(t0, 'quoted');
    const lab = t.match(/^(?:search\s+term|keywords?|term|query|search)\s*[:=]\s*([\s\S]+)$/i);
    if (lab) { const v = lab[1].trim().replace(/^(["'\u201c\u2018])([\s\S]*)(["'\u201d\u2019])$/, '$2'); if (v) return out(v, 'labelled'); }
    if (isNumId(t) || /^\d+$/.test(t) || (isBundleId(t) && /\./.test(t))) return out(t, 'id');
    const g = t.match(/^([\s\S]*\S)\s+(apps?|Apps?|APPS?)$/);
    if (g) {
      const name = g[2] === 'App' || g[2] === 'APP' ? /(^|\s)\p{Lu}[^\s]*$/u.test(g[1]) : false; // "Cash App" is a name
      if (name) return out(t, 'name');
      if (!/^(an?|the|my|your|all|some|any)$/i.test(g[1])) return out(g[1], 'generic');
    }
    return out(t, 'verbatim');
  }
  // the slug is at most SLUG_MAX_BYTES of UTF-8 (+ '_' and the 6-hex hash): every file the runner derives from
  // smar_appstore_<slug>_<cc>.csv (.csv.progress.json, .NOT_READY.csv, temp files) stays inside the 255-byte file-name
  // limit of APFS and ext4 (stress WI-5: a 600-character term crashed with ENAMETOOLONG). A cut slug is lossy (hashed).
  const SLUG_MAX_BYTES = 80;
  const utf8Len = (s) => { let n = 0; for (const ch of s) { const c = ch.codePointAt(0); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; } return n; };
  function slugOf(text) {
    const s = String(text == null ? '' : text).normalize('NFC');
    // marks are kept only on a kept letter (a lone variation selector after an emoji would make an invisible slug);
    // default-ignorable characters (U+3164 HANGUL FILLER is a letter) are never kept
    let base = s.toLowerCase().replace(/(?:[^\p{L}\p{N}\p{M}]|\p{Default_Ignorable_Code_Point})+/gu, '_').replace(/(^|_)\p{M}+/gu, '$1').replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'x';
    // the slug is lossy unless it IS the text, lower-cased with single spaces as '_': any character it does not keep
    // (punctuation, '-', '.', '_', a doubled or outer space, a dropped mark, an invisible character, a text with no
    // letter at all -> 'x') gets the hash, so "fitness-tracking", "fitness_tracking" and "fitness tracking" are three
    // files and a lone U+FE0F never shares the file of the term "x" (only case is folded)
    let lossy = /[^\p{L}\p{N}\p{M} ]/u.test(s) || /  |^ | $/.test(s) || base !== s.toLowerCase().replace(/ /g, '_');
    if (utf8Len(base) > SLUG_MAX_BYTES) {
      let cut = '', n = 0;
      for (const ch of base) { const k = utf8Len(ch); if (n + k > SLUG_MAX_BYTES) break; cut += ch; n += k; }
      base = cut.replace(/\p{M}+$/u, '').replace(/_+$/, '') || 'x';
      lossy = true;
    }
    return lossy ? base + '_' + (fnv(s) >>> 0).toString(16).padStart(8, '0').slice(0, 6) : base;
  }

  // ------------------------------------------------------------------ countries
  // SMAR's country menu (sar-frontend constants/countryCodes.js, the 222 codes its App Store pages offer) plus
  // app-store-scraper's markets: a code outside both is no App Store country SMAR can be asked for (XX, UK, KP) and is
  // refused before any request (stress WI-7). A code in the menu without an App Store (AQ) still asks Apple, which says so.
  const SMAR_MENU = ('AFALDZADAOAIAQAGARAMAWAUATAZBSBHBDBBBYBEBZBJBMBTBOBQBABWBVBRIOBNBGBFBIKHCMCACVKYCFTDCLCNCXCCCOKMCGCDCKCRHRCUCWCYCZCIDKDJDMDOECEGSVGQEREEETFKFJFIFR' +
    'TFGAGMGEDEGHGIGRGDGTGGGNGWGYHTHMHNHKHUISINIDIRIQIEIMILITJMJPJEJOKZKEKIKRKWKGLALVLBLSLRLYLILTLUMOMGMWMYMVMLMTMXFMMDMCMNMEMSMAMZMMNANRNPNLNZNINENGNUNFMK' +
    'NOOMPKPWPSPAPGPYPEPHPNPLPTPRQARORURWSHKNLCVCWSSMSTSASNRSSCSLSGSKSISBSOZAGSESLKSDSRSZSECHTWTJTZTHTLTGTKTOTTTNTRTMTCTVUGUAAEGBUSUMUYUZVUVEVNVGEHYEZMZW').match(/../g);
  // Apple storefronts outside both lists: lookup?country=XK|MR answers the app (probed 2026-10-04; ZZ, AS, GU, VI, RE,
  // KP, SY, SS, MH and the other ISO codes outside the menu answer Apple's invalid-country error)
  const APPLE_EXTRA = ['XK', 'MR'];
  const ALIASES = { UK: 'GB' };
  // checkCountry(cc) -> null when usable, else the usage message (no network)
  function checkCountry(cc) {
    const c = upper(cc);
    if (!/^[A-Z]{2}$/.test(c)) return `--country must be a two-letter country code such as US, GB or DE (got "${cc}")`;
    if (ALIASES[c]) return `--country "${c}" is not an App Store country code: use ${ALIASES[c]}`;
    if (!SMAR_MENU.includes(c) && !S.MARKETS[c] && !APPLE_EXTRA.includes(c)) return `unknown --country "${c}": not a country in SMAR's App Store menu nor an App Store storefront (a two-letter ISO code such as US, GB, DE)`;
    return null;
  }

  // ------------------------------------------------------------------ state
  function newState(opts) {
    opts = opts || {};
    const mode = opts.mode;
    if (!MODES.includes(mode)) throw err('USAGE', `unknown mode "${mode}"`);
    const country = upper(opts.country || 'US');
    const ccBad = checkCountry(country);
    if (ccBad) throw err('USAGE', ccBad);
    const runId = opts.runId || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
    const o = { mode, country, compat: !!opts.compat };
    if (opts.sample != null) o.sample = Math.max(0, Math.min(MAX_SAMPLE, Number(opts.sample) | 0));
    let st;
    if (mode === 'search') {
      if (opts.term == null || !String(opts.term).trim()) throw err('USAGE', 'search needs a non-empty term');
      // a term of nothing but invisible characters (a lone U+FE0F, a zero-width space, U+3164) is no search (as in term)
      if (!/[^\s\p{Cc}\p{Cf}\p{M}\p{Default_Ignorable_Code_Point}\u2800]/u.test(String(opts.term))) throw err('USAGE', 'search needs a visible term (this one holds only invisible characters); run term on the user\'s phrase first');
      st = S.newSearchState({ term: String(opts.term), country, compat: o.compat, primaryOnly: !!opts.primaryOnly, storefronts: STOREFRONTS, similarLookup: opts.similarLookup || 'batch', runId });
      Object.assign(st.opts, o);
    } else {
      if (mode === 'chart') {
        o.collection = String(opts.collection || '');
        if (!C.COLLECTIONS[o.collection]) throw err('USAGE', `unknown chart collection "${opts.collection}" (one of ${Object.keys(C.COLLECTIONS).join(', ')})`);
        const g = opts.genre != null ? opts.genre : opts.category;
        o.genre = g == null || g === '' || String(g).toLowerCase() === 'all' ? 'all' : String(g);
        if (opts.num != null) o.num = opts.num;
      } else if (mode === 'reviews') {
        const apps = [].concat(opts.apps || opts.ids || []).map((x) => String(Array.isArray(x) ? x[0] : x).trim()).filter(Boolean);
        if (!apps.length) throw err('USAGE', 'reviews needs a bundleId or trackId');
        if (apps.length > 1 && !opts.bulk) throw err('USAGE', 'several apps need --bulk');
        o.apps = apps; o.all = !!opts.all; o.bulk = !!opts.bulk || apps.length > 1; o.perApp = !!opts.perApp;
        o.heal = opts.heal !== false; if (opts.healWaitMs != null) o.healWaitMs = opts.healWaitMs;
      } else {
        const list = [].concat(opts.ids || []).map((x) => (Array.isArray(x) ? [String(x[0]).trim(), x[1] || opts.source || L.keyword] : [String(x).trim(), opts.source || L.keyword])).filter((x) => x[0]);
        if (!list.length) throw err('USAGE', `${mode} needs at least one app id`);
        if (list.length > LIMITS.idsMax) throw err('USAGE', `at most ${LIMITS.idsMax} apps per run (got ${list.length})`);
        const bad = list.filter(([id]) => !isNumId(id) && !isBundleId(id)).map(([id]) => id);
        if (bad.length) throw err('USAGE', 'not App Store ids or bundle ids: ' + bad.slice(0, 5).join(' '));
        o.ids = list; o.layout = opts.layout === 'chart' ? 'chart' : 'search';
        if (opts.from) o.from = opts.from;
      }
      st = { v: 1, skill: 'smar-appstore-agent', runId, opts: o, stage: mode, cursor: 0, rows: [], details: {}, dropped: [],
        transport: { gzipPages: [], emptyPages: [], batchSplits: 0, probeErrors: [] } };
    }
    Object.assign(st, { startedUTC: new Date().toISOString(), phase: 'engine', checks: {}, quarantined: {}, unverified: {}, xc: { step: 'plan', cursor: 0, plan: null, pages: {}, refetch: null } });
    return st;
  }
  async function seed(st) { st.seeded = true; return st; }
  const isDone = (st) => !!st && st.phase === 'done';

  // ------------------------------------------------------------------ engines (phase 'engine')
  const ENGINE = {
    async search(st, io, dl) {
      let units = 0, guard = 0;
      while (st.stage !== 'done' && st.stage !== 'stopped' && guard++ < 100000) {
        checkDeadline(io, dl);
        const r = await S.advanceSearch(st, io, { deadlineMs: dl === Infinity ? undefined : dl });
        units += r.units;
        if (!r.done && !st.stop && !r.units && st.stage !== 'done') checkDeadline(io, dl);
      }
      return units;
    },
    async chart(st, io) {
      if (st.chart && st.chart.done) return 0;
      const o = st.opts, cap = {};
      const io2 = Object.assign({}, io, { get: async (req) => { const r = await io.get(req); if (req && r.status === 200 && (req.kind === 'CHART_RSS' || req.kind === 'CHART_RSS_ALT')) cap[req.kind] = r.body; return r; } });
      const sf = !o.compat && STOREFRONTS[o.country] ? STOREFRONTS[o.country].id : undefined;
      const r = await C.runChart(io2, { collection: o.collection, genre: o.genre, country: o.country, compat: o.compat, num: o.num, storefront: sf, alt: true });
      const rss = cap.CHART_RSS ? K.anchorsFromChartRss(cap.CHART_RSS) : null, alt = cap.CHART_RSS_ALT ? K.anchorsFromChartRss(cap.CHART_RSS_ALT) : null;
      st.chart = { done: true, req: r.req, kind: r.kind, entries: r.rss ? r.rss.ids : [], lookupReq: r.lookupReq, altReq: r.altReq, dropped: r.dropped,
        stop: r.stop, smar500: r.smar500, storefront: r.storefront, input: r.input, compatReasons: r.compatReasons, warnings: r.warnings,
        summary: C.summarizeChart(r), rssById: rss && rss.ok ? rss.byId : {}, rendered: r.rows.length, rankDiff: [], smarFallback: r.smarFallback || undefined };
      if (alt && alt.ok && rss && rss.ok && !(r.storefront && r.storefront.fallback)) { // informative rank check (C4), with the apps named
        const a = rss.order.filter((id) => alt.order.includes(id)), b = alt.order.filter((id) => rss.order.includes(id));
        a.forEach((id, i) => { if (b[i] !== id) st.chart.rankDiff.push({ id, rank: rss.order.indexOf(id) + 1, altRank: alt.order.indexOf(id) + 1 }); });
      }
      st.rows = []; st.details = {};
      for (const raw of r.raw) {
        const appId = raw.bundleId != null ? raw.bundleId : String(raw.trackId), key = lower(appId);
        st.details[key] = { raw };
        st.rows.push({ appId, key, id: String(raw.trackId), source: null });
      }
      for (const d of st.chart.rankDiff) { const row = st.rows.find((x) => x.id === String(d.id)); if (row) d.appId = row.appId; }
      st.chart.rowIds = st.rows.map((x) => x.id); // the rows in output order, for integrity() on --resume (FI-12)
      st.stage = 'done';
      await save(io, st);
      return (r.requests.rss || 0) + (r.requests.lookup || 0) + (r.requests.alt || 0);
    },
    // REVIEW_WORKERS apps advance at once (stress SCALE-5): every request still takes its grant from the shared limiter,
    // so this only fills the time one app spends waiting (heal wait, the other bucket's spacing) with another app's
    // requests. Apps that have finished fewer heal passes go first (a re-fetch pass cut by the deadline is fair).
    // Any error stops every worker between requests and is rethrown once all have stopped (state stays consistent).
    // ao.settle: a DEADLINE inside a re-fetch pass (st.requeued) finalizes the apps as they stand (settle()): the run
    // stays finished (NEXT REFETCH / deliverable with --deliver-anyway) instead of becoming unfinished again.
    async reviews(st, io, dl, ao) {
      const o = st.opts;
      st.reviews = st.reviews || {};
      let units = 0;
      const io2 = Object.assign({}, io, { get: async (req) => { // a heal/MZ re-read missing from a replay is a failed attempt, not a crash
        try { return await io.get(req); } catch (e) { if (e && e.code === 'REPLAY_MISS' && /[?&](cb|_)=|userReviewsRow/.test(req.url)) return { status: 599, body: '', headers: {}, replayMiss: true }; throw e; }
      } });
      for (const ref of o.apps) { // the storefront only addresses the MZ cross-check (SMAR never reads MZ): the country's own in both modes
        if (!st.reviews[ref]) st.reviews[ref] = R.newAppState(ref, { country: o.country, all: o.all, storefront: STOREFRONTS[o.country] ? STOREFRONTS[o.country].id : undefined });
      }
      const passes = (ref) => (st.reviews[ref].heal && st.reviews[ref].heal.passes) || 0;
      const queue = o.apps.map((ref, i) => ({ ref, i })).filter((x) => st.reviews[x.ref].stage !== 'done')
        .sort((a, b) => passes(a.ref) - passes(b.ref) || a.i - b.i).map((x) => x.ref);
      let stopErr = null;
      const abort = () => !!stopErr;
      // the MZ second source's budget, shared by every app of the run (saved with st; the shell runner starts each call
      // with a fresh one, so a later --resume asks MZ again, while the re-fetch pass inside one call does not)
      st.mzx = st.mzx || { fails: 0 };
      const adv = { deadlineMs: dl === Infinity ? undefined : dl, heal: o.heal !== false, healWaitMs: o.healWaitMs != null ? o.healWaitMs : 15000, abort, mz: st.mzx };
      async function worker() {
        while (!stopErr && queue.length) {
          const rs = st.reviews[queue.shift()];
          try {
            let guard = 0;
            while (rs.stage !== 'done' && guard++ < 1000 && !stopErr) {
              checkDeadline(io, dl);
              const x = await R.advanceApp(rs, io2, adv);
              units += x.units; await save(io, st);
              if (x.done || stopErr) continue;
              if (x.deadline) throw err('DEADLINE', 'deadline reached');
              if (!x.units) checkDeadline(io, dl);
            }
          } catch (e) { if (!stopErr) stopErr = e; }
        }
      }
      const n = Math.max(1, Math.min(REVIEW_WORKERS, queue.length));
      await Promise.all(Array.from({ length: n }, worker));
      if (stopErr) {
        if (stopErr.code === 'DEADLINE' && ao && ao.settle && settle(st)) { await save(io, st); return units; }
        throw stopErr;
      }
      const left = o.apps.filter((ref) => st.reviews[ref].stage !== 'done');
      if (left.length) throw err('ENGINE_STALL', `reviews of ${left.slice(0, 3).join(', ')} did not finish`); // never 'done' with an app unread
      st.stage = 'done'; delete st.requeued;
      return units;
    },
    async ids(st, io, dl) {
      const o = st.opts, w = st.idsw = st.idsw || { queue: null, singles: [], found: {} };
      let units = 0;
      if (!w.queue) {
        const num = [], bun = [], seen = new Set();
        for (const [id] of o.ids) { const k = isNumId(id) ? 'n:' + id : 'b:' + lower(id); if (seen.has(k)) continue; seen.add(k); (isNumId(id) ? num : bun).push(id); }
        w.queue = S.chunkIds(num, 'id', { country: o.country }).map((ids) => ({ field: 'id', ids }))
          .concat(S.chunkIds(bun, 'bundleId', { country: o.country }).map((ids) => ({ field: 'bundleId', ids })));
      }
      const keyOf = (field, id) => (field === 'id' ? 'n:' + id : 'b:' + lower(id));
      const take = (field, id, raw) => { const k = lower(raw.bundleId != null ? raw.bundleId : raw.trackId); st.details[k] = { raw }; w.found[keyOf(field, id)] = k; };
      while (w.queue.length) {
        checkDeadline(io, dl);
        const c = w.queue[0];
        const r = await getLookup(io, S.lookupReq(c.ids, c.field, o.country)); units++;
        w.queue.shift();
        if (r.ok) {
          for (const id of c.ids) {
            const g = r.raw.find((x) => (c.field === 'id' ? String(x.trackId) === String(id) : x.bundleId === id)) || (c.field === 'bundleId' && r.raw.find((x) => lower(x.bundleId) === lower(id)));
            if (g) take(c.field, id, g); else w.singles.push([c.field, id]);
          }
        } else if (c.ids.length > 1) { st.transport.batchSplits++; const h = Math.ceil(c.ids.length / 2); w.queue.unshift({ field: c.field, ids: c.ids.slice(0, h) }, { field: c.field, ids: c.ids.slice(h) }); }
        else w.singles.push([c.field, c.ids[0]]);
        await save(io, st);
      }
      while (w.singles.length) {
        checkDeadline(io, dl);
        const [field, id] = w.singles[0];
        const r = await getLookup(io, S.lookupReq([id], field, o.country)); units++;
        w.singles.shift();
        if (r.ok && r.raw[0]) take(field, id, r.raw[0]);
        else st.dropped.push({ appId: id, stage: 'details', reason: r.ok ? 'not_in_storefront' : 'lookup_failed', status: r.status });
        await save(io, st);
      }
      buildIdRows(st);
      st.stage = 'done';
      return units;
    },
  };
  ENGINE.rerun = ENGINE.ids;
  function buildIdRows(st) {
    const w = st.idsw, seen = new Set();
    st.rows = [];
    for (const [id, source] of st.opts.ids) {
      const k = w.found[isNumId(id) ? 'n:' + id : 'b:' + lower(id)];
      if (!k || seen.has(k)) continue;
      seen.add(k);
      const raw = st.details[k].raw;
      st.rows.push({ appId: raw.bundleId != null ? raw.bundleId : String(raw.trackId), key: k, id: String(raw.trackId), source });
    }
  }
  async function getLookup(io, req) {
    let r;
    try { r = await io.get(req); } catch (e) { if (e && e.code === 'NETWORK') return { ok: false, status: 0, error: e.message }; throw e; }
    if (r.status !== 200) return { ok: false, status: r.status };
    const p = S.parseLookup(r.body);
    return p.ok ? Object.assign(p, { status: 200 }) : { ok: false, status: r.status, error: p.error };
  }

  // ------------------------------------------------------------------ cross-checks (phase 'xcheck', PLAN §3.4, A3)
  function rowRaw(st, row) { const d = st.details[row.key] || st.details[lower(row.appId)]; return d && d.raw; }
  function rowId(st, row) { const raw = rowRaw(st, row); return raw ? String(raw.trackId) : String(row.id || ''); }
  function planSample(st) {
    const k = st.opts.sample != null ? st.opts.sample : (SAMPLE[st.opts.mode] || 0);
    if (!k || !st.rows.length) return [];
    const cc = st.opts.country;
    const order = st.rows.slice().sort((a, b) => fnv(st.runId + a.appId) - fnv(st.runId + b.appId) || (a.appId < b.appId ? -1 : 1));
    const pick = order.slice(0, Math.min(k, order.length));
    for (const r of st.rows) { // every row with an invariant warning, up to MAX_SAMPLE in all
      if (pick.length >= Math.max(k, MAX_SAMPLE)) break;
      const raw = rowRaw(st, r);
      if (raw && !pick.includes(r) && K.invariants(raw, { cc }).some((iv) => !iv.ok)) pick.push(r);
    }
    return pick.map((r) => { const raw = rowRaw(st, r); return { appId: r.appId, id: rowId(st, r), url: raw && raw.trackViewUrl }; });
  }
  const platformFrom = (t, extra) => t && Object.assign({ id: t.id, bundleId: t.bundleId, name: t.name, artistId: t.artistId, artistName: t.artistName, artistUrl: t.artistUrl,
    releaseDate: t.releaseDate, minimumOSVersion: t.minimumOSVersion, genres: t.genres, url: t.url, userRating: t.userRating }, extra || {});
  function sourcesFor(st, row) {
    const o = st.opts, cc = lower(o.country), id = rowId(st, row), src = { storeIndependentOnly: {} };
    const page = st.xc.pages[row.appId];
    if (page && page.ok && page.a) src.webPage = page.a;
    if (o.mode === 'search') {
      const sim = st.similar && st.similar[id];
      if (sim && sim.productDv) {
        const pd = sim.productDv;
        src.productDv = K.anchorsFromPlatform(platformFrom(pd, { offers: pd.version || pd.price !== undefined ? [{ price: pd.price, version: pd.version ? { display: pd.version } : undefined }] : [] }), { cc: 'us' });
        if (!(pd.av >= 2)) src.uncarried = Object.assign(src.uncarried || {}, { productDv: 1 });
        if (cc !== 'us') src.storeIndependentOnly.productDv = true;
      }
      const lk = st.search && st.search.lockups && st.search.lockups[id];
      if (lk) {
        const fb = st.search.storefront && st.search.storefront.fallback;
        src.lockup = K.anchorsFromPlatform(platformFrom(lk, { offers: lk.offer ? [{ price: lk.offer.price, version: { display: lk.offer.version } }] : [] }), { cc: fb ? 'us' : cc });
        if (!(lk.av >= 2)) src.uncarried = Object.assign(src.uncarried || {}, { lockup: 1 });
        if (fb) src.storeIndependentOnly.lockup = true;
      }
      const prim = (st.primaries || []).find((p) => String(p.trackId) === id);
      if (prim) src.consistency = prim;
    } else if (o.mode === 'chart') {
      const a = st.chart && st.chart.rssById && st.chart.rssById[id];
      if (a) { src.rss = a; if (st.chart.storefront && st.chart.storefront.fallback) src.storeIndependentOnly.rss = true; }
      // the storefront's own feed names genres in its language (JP ファイナンス, DE Finanzen) where the lookup is English:
      // when the run's sampled app pages are non-English, those names are not compared (the genre id still is)
      if (a && Object.values(st.xc.pages || {}).some((p) => p && p.ok && p.a && p.a.localized)) src.rss = Object.assign({}, a, { localized: true });
    }
    return src;
  }
  // as_search's trimmed product-dv / lockup anchors carry genres, artistUrl, minimumOSVersion and price since anchor
  // version 2 (av:2). A state saved before that (a --resume across the upgrade) lacks them: there those columns are "not
  // cross-checkable by design", never "anchor missing" (which would read as anchor drift).
  const UNCARRIED = { productDv: ['genreIDs', 'requiredOsVersion', 'price', 'developerAppStorePageURL'], lockup: ['genreIDs', 'developerAppStorePageURL'] };
  function checkRowX(raw, src, ctx) {
    const un = src && src.uncarried; if (un) delete src.uncarried;
    const r = K.checkRow(raw, src, ctx);
    if (un) r.na = (r.na || []).filter((n) => !(n.why === 'anchor_absent' && un[n.src] && UNCARRIED[n.src] && UNCARRIED[n.src].includes(n.col)));
    return r;
  }
  async function xcheck(st, io, dl) {
    const x = st.xc, o = st.opts;
    let units = 0;
    if (o.mode === 'reviews') { x.step = 'done'; return 0; } // as_reviews ran its MZ cross-check per app
    if (x.step === 'plan') { x.plan = planSample(st); x.cursor = 0; x.step = 'pages'; }
    if (x.step === 'pages') {
      // The web pages are an OPTIONAL second source (stress FI-09: a 503/unreachable apps.apple.com held a finished
      // chart at exit 3 for 40+ minutes; a 403 discarded 25 verified rows). Each page gets at most one retry (none
      // after a failure); PAGE_FAIL_STREAK transport failures in a row (5xx/network), or one refusal (403/429), end the
      // sample: the pages not asked are recorded as skipped (anchor missing -> unverified, never a pass) and the run
      // finishes on its other sources (x.pagesUnavailable -> summary problem).
      const transportFail = (rec) => rec.status >= 500 || rec.error === 'NETWORK'; // a replay miss is no outage
      for (; x.cursor < x.plan.length; x.cursor++) {
        const p = x.plan[x.cursor];
        if (x.pages[p.appId]) continue;
        if (x.pagesUnavailable) { x.pages[p.appId] = { status: 0, ok: false, error: 'source_unavailable', skipped: true }; x.pagesUnavailable.skipped++; continue; }
        checkDeadline(io, dl);
        let rec;
        try {
          const req = Object.assign(webPageReq(o.country, p.id, { url: p.url }), { maxRetries: x.pageFails ? 0 : 1 });
          const r = await io.get(req); units++;
          const a = r.status === 200 ? K.anchorsFromWebPage(r.body) : null;
          rec = { status: r.status, ok: !!(a && a.ok), a: a && a.ok ? a.a : null, variant: a && a.variant };
        } catch (e) {
          if (e && e.code === 'DEADLINE') throw e;
          if (e && e.code === 'RATE_LIMITED') rec = { status: e.status || 403, ok: false, error: 'RATE_LIMITED', limited: true };
          else rec = { status: 0, ok: false, error: String((e && e.code) || e) }; // anchor missing -> unverified, never a pass
        }
        x.pages[p.appId] = rec;
        x.pageFails = rec.limited || transportFail(rec) ? (x.pageFails || 0) + 1 : 0;
        if (rec.limited || x.pageFails >= PAGE_FAIL_STREAK) {
          x.pagesUnavailable = { why: rec.limited ? `apps.apple.com refused requests (HTTP ${rec.status})` : rec.status ? `apps.apple.com answered HTTP ${rec.status}` : 'apps.apple.com unreachable',
            failed: Object.values(x.pages).filter((q) => q && !q.ok && !q.skipped).length, skipped: 0 };
        }
        await save(io, st);
      }
      // every sampled page answered 404 (no app had a page): the page URLs or the site changed, or it is down; the run
      // finishes on its other sources, and the summary says so (stress regression: only rowsChecked showed it)
      const asked = Object.values(x.pages).filter((q) => q && !q.skipped);
      if (!x.pagesUnavailable && asked.length && asked.every((q) => q.status === 404)) x.pagesUnavailable = { why: 'apps.apple.com answered HTTP 404 for every sampled app page', failed: asked.length, skipped: 0 };
      x.step = 'check';
    }
    if (x.step === 'check') {
      for (const r of st.rows) {
        const raw = rowRaw(st, r);
        st.checks[r.appId] = checkRowX(raw, sourcesFor(st, r), { cc: o.country, layout: o.mode === 'chart' || o.layout === 'chart' ? 'chart' : 'search' });
      }
      x.refetch = st.rows.filter((r) => st.checks[r.appId] && st.checks[r.appId].refetch).slice(0, MAX_REFETCH).map((r) => r.appId);
      x.refetchCursor = 0; x.step = 'refetch';
      await save(io, st);
    }
    if (x.step === 'refetch') {
      for (; x.refetchCursor < x.refetch.length; x.refetchCursor++) {
        const appId = x.refetch[x.refetchCursor], row = st.rows.find((r) => r.appId === appId), c = st.checks[appId];
        if (!row || !c || c.refetched) continue;
        checkDeadline(io, dl);
        const q = S.lookupReq([appId], 'bundleId', o.country);
        q.url += '&cb=' + (fnv(st.runId + appId) % 1e9); // one cache-busted re-read (A3); the value is never copied
        const r = await getLookup(io, q); units++;
        const raw2 = r.ok ? r.raw.find((g) => lower(g.bundleId) === lower(appId)) : null;
        c.refetched = true;
        // did the cache-busted re-read return another version? (false = the first read was not stale: not cdn_age)
        const raw1 = rowRaw(st, row);
        c.refetchVersionChanged = raw2 && raw1 ? String(raw2.version) !== String(raw1.version) : null;
        c.after = checkRowX(raw2 || raw1, sourcesFor(st, row), { cc: o.country });
        if (!raw2) c.refetchError = r.ok ? 'not_returned' : 'HTTP ' + r.status;
        // the re-read passes every hard check the first read failed: default renders the re-read (still the lookup,
        // A1); compat keeps the first read (SMAR's bytes) and lists the disputed cells as unverified
        else if ((c.hard || []).length && !(c.after.hard || []).length) st.details[row.key].refetched = raw2;
        await save(io, st);
      }
      x.step = 'done';
    }
    return units;
  }

  async function advance(st, io, o) {
    const dl = o && o.deadlineMs != null ? o.deadlineMs : Infinity;
    let units = 0;
    try {
      if (st.phase === 'engine') {
        units += await ENGINE[st.opts.mode](st, io, dl, { settle: !!(o && o.settle) });
        if (st.stage !== 'done' && st.stage !== 'stopped') return { done: false, units };
        st.phase = st.stop ? 'done' : 'xcheck';
        await save(io, st);
      }
      if (st.phase === 'xcheck') {
        units += await xcheck(st, io, dl);
        st.phase = 'done';
        st.finishedUTC = new Date().toISOString();
        await save(io, st);
      }
      return { done: true, units };
    } catch (e) {
      if (e && e.code === 'DEADLINE') { await save(io, st); return { done: false, units, deadline: true }; }
      throw e;
    }
  }

  // refetch: re-collect the listed apps of a finished run (only details; row membership is unchanged unless an app
  // dropped as lookup_failed now answers, in which case the row list is rebuilt the way the engine builds it).
  async function refetch(st, io, ids) {
    if (!isDone(st)) throw err('USAGE', 'the run is not finished; resume it first');
    if (st.opts.mode === 'reviews' || st.opts.mode === 'chart') throw err('USAGE', `refetch does not apply to ${st.opts.mode} runs; rerun the command into a NEW output file`);
    const out = [], want = new Set(ids.map(lower));
    for (const id of ids) {
      const field = isNumId(id) ? 'id' : 'bundleId';
      const r = await getLookup(io, S.lookupReq([id], field, st.opts.country));
      const g = r.ok && r.raw.find((x) => (field === 'id' ? String(x.trackId) === String(id) : lower(x.bundleId) === lower(id)));
      if (!g) { out.push({ appId: id, status: r.ok ? 'not_in_storefront' : 'failed', http: r.status }); continue; }
      const k = lower(g.bundleId);
      st.details[k] = { raw: g, via: 'refetch' };
      if (st.idsw) st.idsw.found[field === 'id' ? 'n:' + id : 'b:' + lower(id)] = k;
      st.dropped = st.dropped.filter((d) => !(want.has(lower(d.appId)) && d.reason === 'lookup_failed' && (lower(d.appId) === k || lower(d.appId) === lower(id))));
      out.push({ appId: g.bundleId, status: 'ok' });
    }
    if (st.opts.mode === 'search') { st.stage = 'rows'; await S._internal.STAGES.rows(st, io); st.stage = 'done'; }
    else buildIdRows(st);
    for (const r of st.rows) if (want.has(lower(r.appId)) || want.has(rowId(st, r))) delete st.checks[r.appId];
    st.xc.step = 'check'; st.phase = 'xcheck';
    await advance(st, io, {});
    return out;
  }

  // requeue(st): on --resume of a FINISHED reviews run, retry the empty pages that healing could not fill, including
  // feeds that came back empty on every page while the app has reviews (REFETCH for reviews; as_reviews.requeueApp).
  // Returns the number of apps requeued; st.requeued marks the re-fetch pass (see settle).
  function requeue(st) {
    if (!isDone(st) || st.opts.mode !== 'reviews') return 0;
    let n = 0;
    for (const rs of Object.values(st.reviews || {})) if (R.requeueApp(rs)) n++;
    if (n) { st.phase = 'engine'; st.stage = 'reviews'; st.requeued = (st.requeued || 0) + 1; }
    return n;
  }
  // settle(st): a reviews re-fetch pass (st.requeued) that cannot go on (deadline, or --deliver-anyway on a pass that was
  // interrupted) ends with every app as it stands: apps stopped in stage heal/crosscheck are finalized (their unhealed
  // pages stay flagged), the run is finished again. Returns false (and changes nothing) unless every app had all its
  // pages fetched, i.e. only re-reads were pending.
  function settle(st) {
    if (!st || st.opts.mode !== 'reviews' || !st.requeued) return false;
    const states = st.opts.apps.map((ref) => st.reviews && st.reviews[ref]);
    if (states.some((rs) => !rs || !['done', 'heal', 'crosscheck'].includes(rs.stage))) return false;
    for (const rs of states) R.finishApp(rs);
    st.stage = 'done'; delete st.requeued;
    if (st.phase === 'engine' || st.phase === 'xcheck') { st.phase = 'done'; st.finishedUTC = new Date().toISOString(); }
    return true;
  }

  // ------------------------------------------------------------------ saved-state integrity (--resume)
  // integrity(st) -> null | {fix, why, apps?}: does a saved run's row list agree with its own bookkeeping? A progress file
  // that was rolled back or edited used to resume to READY with rows missing (stress FI-12: chart 20 of 25 rows while
  // chart.rendered said 25). fix 'rebuild' = the rows follow deterministically from the saved lookups (search, ids):
  // rebuild them and re-run the checks; 'restart' = start the crawl over (the response journal under OUT.pages answers
  // what it holds, so this is mostly offline); 'restart_apps' = re-read those review apps.
  const idsOf = (rows) => (rows || []).map((r) => String(r && r.appId)).join('\n');
  function integrity(st) {
    if (!st || !st.opts) return null;
    const o = st.opts;
    try {
      if (o.mode === 'reviews') {
        const bad = [];
        for (const ref of o.apps || []) {
          const rs = st.reviews && st.reviews[ref];
          if (!rs || !Array.isArray(rs.pages)) continue;
          const pe = rs.pageEntries || {};
          let broken = rs.pages.some((pg) => !Array.isArray(pe[pg.p]) || pe[pg.p].length !== pg.n);
          if (!broken && rs.stage === 'done' && !rs.error && !rs.notFound) {
            const lists = {}; for (const pg of rs.pages) lists[pg.p] = pe[pg.p];
            broken = !Array.isArray(rs.rows) || rs.rows.length !== R.smarConcat(lists, rs.smarTarget == null ? rs.target : rs.smarTarget).rows.length;
          }
          if (broken) bad.push(ref);
        }
        return bad.length ? { fix: 'restart_apps', apps: bad, why: `the saved review pages of ${bad.slice(0, 3).join(', ')}${bad.length > 3 ? ` (+${bad.length - 3})` : ''} do not match their page counts` } : null;
      }
      if (st.phase === 'engine' || st.stop) return null; // rows are built at the end of the engine; a stopped run has none to check
      const rows = Array.isArray(st.rows) ? st.rows : null;
      if (!rows) return { fix: 'restart', why: 'the saved run has no row list' };
      if (rows.some((r) => !r || !(st.details[r.key] || st.details[lower(r.appId)]))) return { fix: 'restart', why: 'a saved row has no saved lookup record' };
      if (o.mode === 'chart') {
        const c = st.chart;
        if (!c || !c.done) return { fix: 'restart', why: 'the saved chart is incomplete' };
        const want = typeof c.rendered === 'number' ? c.rendered : null, sm = c.summary && c.summary.chart && typeof c.summary.chart.rows === 'number' ? c.summary.chart.rows : null;
        if ((want != null && rows.length !== want) || (sm != null && rows.length !== sm)) return { fix: 'restart', why: `${rows.length} rows saved, the chart feed and lookup gave ${want != null ? want : sm}` };
        const feedIds = (c.entries || []).filter((x) => x != null).map(String), feed = new Set(feedIds);
        if (feed.size && rows.some((r) => !feed.has(String(r.id)))) return { fix: 'restart', why: 'a saved row is not in the saved chart feed' };
        const got = rows.map((r) => String(r.id));
        // the exact row list the chart step wrote (order included): a reordered or swapped row list is caught here
        if (Array.isArray(c.rowIds) && got.join('\n') !== c.rowIds.map(String).join('\n')) return { fix: 'restart', why: 'the saved rows are not the rows (or the order) the chart step wrote' };
        // and the rows that follow from the saved feed: every feed app the lookup did not drop is a row, in default mode
        // in feed rank and cut at --num. Catches rows cut together with chart.rendered and the summary.
        if (!c.stop && feed.size) {
          const gone = new Set((c.dropped || []).map((d) => String(d && d.appId))), seen = new Set();
          let expect = feedIds.filter((id) => !gone.has(id) && !seen.has(id) && seen.add(id));
          if (!o.compat) {
            const n = o.num != null && Number(o.num) > 0 ? Math.floor(Number(o.num)) : Infinity;
            if (n < expect.length) expect = expect.slice(0, n);
            if (got.join('\n') !== expect.join('\n')) return { fix: 'restart', why: `${rows.length} rows saved, the saved chart feed less its dropped apps gives ${expect.length}${got.length === expect.length ? ' in another order' : ''}` };
          } else {
            const have = new Set(got), miss = expect.filter((id) => !have.has(id));
            if (miss.length) return { fix: 'restart', why: `${miss.length} app(s) of the saved chart feed are neither a saved row nor a dropped app` };
          }
        }
        return null;
      }
      const clone = JSON.parse(JSON.stringify(st));
      if (o.mode === 'search') {
        if (!S._internal || !S._internal.STAGES || !S._internal.STAGES.rows) return null;
        const p = S._internal.STAGES.rows(clone); if (p && p.catch) p.catch(() => {}); // synchronous body: clone.rows is set now
        const want = st.search && st.search.counts && typeof st.search.counts.unique === 'number' ? st.search.counts.unique : null;
        if (want != null && clone.rows.length !== want) return { fix: 'restart', why: `the saved lookups give ${clone.rows.length} rows, the search counted ${want}` };
        if (idsOf(clone.rows) !== idsOf(rows)) return { fix: 'rebuild', rows: clone.rows, why: `${rows.length} rows saved, the saved search and lookups give ${clone.rows.length}` };
        return null;
      }
      if (o.mode === 'ids' || o.mode === 'rerun') {
        if (!clone.idsw || !clone.idsw.found) return { fix: 'restart', why: 'the saved id lookups are missing' };
        for (const k of Object.values(clone.idsw.found)) if (!clone.details[k]) return { fix: 'restart', why: 'a found id has no saved lookup record' };
        buildIdRows(clone);
        if (idsOf(clone.rows) !== idsOf(rows)) return { fix: 'rebuild', rows: clone.rows, why: `${rows.length} rows saved, the saved lookups give ${clone.rows.length}` };
      }
    } catch (e) { return { fix: 'restart', why: 'the saved run could not be read back (' + String(e && e.message || e).slice(0, 80) + ')' }; }
    return null;
  }
  // repair(st, ig) -> the state to continue with (see integrity)
  function repair(st, ig) {
    if (!ig) return st;
    if (ig.fix === 'rebuild') {
      st.rows = ig.rows; st.checks = {}; st.quarantined = {}; st.unverified = {};
      st.xc = Object.assign({}, st.xc, { step: 'check', refetch: null, refetchCursor: 0 }); // the saved page anchors are kept
      st.phase = 'xcheck'; delete st.finishedUTC;
      return st;
    }
    if (ig.fix === 'restart_apps') {
      for (const ref of ig.apps) st.reviews[ref] = R.newAppState(ref, { country: st.opts.country, all: st.opts.all, storefront: STOREFRONTS[st.opts.country] ? STOREFRONTS[st.opts.country].id : undefined });
      st.phase = 'engine'; st.stage = 'reviews'; delete st.requeued; delete st.finishedUTC;
      return st;
    }
    const n = newState(Object.assign({}, st.opts, { runId: st.runId }));
    n.shell = st.shell; n.requests = st.requests; n.restarted = (st.restarted || 0) + 1;
    return n;
  }

  // ------------------------------------------------------------------ facts, rows, summary
  const ZERO_REQ = { itunes_api: 0, apple_other: 0, journalHits: 0, retries: 0, waitedSeconds: 0, rateLimited: 0 };
  function stopSentence(st) {
    const o = st.opts, s = st.stop;
    if (!s) return null;
    const term = o.term, cc = o.country;
    const map = {
      smar_http400: `smar-tool.org turns "${term}" into an empty search (its site cuts the term at &, #, + or %), so it answers an error and gives no file; try the term without those characters`,
      no_storefront: `this skill does not know the App Store storefront for ${cc}; SMAR would search the US store instead (run with --smar-compat to reproduce that), or ask the user for another country`,
      smar_http500_search: "Apple's App Store search failed after retries (SMAR answers an error here too); tell the user and try again later",
      endpoint_drift: "Apple's App Store search answered in an unknown shape (endpoint drift); tell the user and do not deliver",
      no_results: `Apple's App Store search found no apps for "${term}" in ${cc}`,
    };
    return { code: s.code, sentence: map[s.code] || s.message || s.code };
  }
  function modeFacts(st) {
    const o = st.opts, f = { compat: o.compat, problems: [], compatReasons: [], extra: {} };
    const td = []; // per-app transport_dependent details (reviews): merged into ONE reason below (stress SCALE-9)
    const addR = (list) => {
      for (const r of list || []) {
        if (r && r.code === 'transport_dependent' && o.mode === 'reviews') { td.push(r.detail); continue; }
        if (!f.compatReasons.some((x) => x.code === r.code)) f.compatReasons.push(r);
      }
    };
    if (o.mode === 'search') {
      const rep = S.searchReport(st);
      f.rep = rep; addR(rep.compatReasons); f.problems.push(...(rep.problems || []));
      if (st.stop) f.stop = stopSentence(st);
      if (rep.smarSearchWouldHttp500 || (st.stop && st.stop.smarHttp)) f.smarHttp500 = String(rep.smarSearchWouldHttp500 || st.stop.message);
      f.noResults = !!(st.stop && st.stop.code === 'no_results');
      f.fetchFailed = st.dropped.filter((d) => d.reason === 'lookup_failed').map((d) => d.appId);
      f.similarDrift = !!(rep.drift && rep.drift.similarDrift);
      if (o.compat && rep.drift && rep.drift.similarKeyMissing) f.similarKeyMissing = rep.drift.similarKeyMissing + ' pages';
      const fb = rep.compatReasons.find((r) => r.code === 'smar_storefront_fallback'); if (fb) f.storefrontFallback = fb.detail;
      const sa = rep.compatReasons.find((r) => r.code === 'site_term_applied'); if (sa) f.siteTermApplied = sa.detail;
      f.transportDependent = !!(rep.transportRisk && rep.transportRisk.similarGzip.length);
      if (rep.drift && rep.drift.searchRankNondeterminism && rep.drift.searchRankNondeterminism.same === false) f.searchRankNondeterminism = `${rep.drift.searchRankNondeterminism.positionsDiffering} of 50 positions`;
      if (o.primaryOnly) f.noSmarEquivalent = '--primary-only';
      // search ids the id lookup did not return as apps. The app-id branch (a bundle id as the term) replaces
      // st.primaries with that one app, so the lookup's own result list is the reference (SE-G: 49 phantom losses).
      const s0 = st.search || {}, looked = Array.isArray(s0.primaryTrackIds) ? s0.primaryTrackIds : s0.appIdQuery ? null : (st.primaries || []).map((m) => String(m.trackId));
      if (looked) {
        const got = new Set(looked.map(String)), lost = (s0.ids || []).filter((id) => !got.has(String(id)));
        if (lost.length) f.problems.push(`${lost.length} search result(s) were not returned as apps by the lookup (SMAR drops them too): ${lost.slice(0, 10).join(', ')}`);
      } else if (s0.ids && s0.primaryIds && s0.ids.length > s0.primaryIds.length) f.problems.push(`${s0.ids.length - s0.primaryIds.length} search result(s) were not returned as apps by the lookup (SMAR drops them too)`);
      if (s0.appIdQuery) f.problems.push(`the term is the bundle id of ${s0.probe && s0.probe.appId ? s0.probe.appId : 'an app'}: SMAR's app-id branch returns only that app, so the other ${(s0.primaryIds || []).filter((b) => !(s0.probe && lower(b) === lower(s0.probe.appId))).length} search result(s) are not rows (as on smar-tool.org)`);
    } else if (o.mode === 'chart') {
      const c = st.chart || {};
      addR(c.compatReasons);
      if (c.stop) f.stop = { code: c.stop.code, sentence: c.stop.sentence };
      if (c.smar500) f.smarHttp500 = c.smar500.detail || c.smar500.code;
      if (c.storefront && c.storefront.fallback && o.compat) f.storefrontFallback = `${o.country} is not in app-store-scraper's markets: SMAR reads the US chart`;
      const sim = !o.compat && c.smarFallback; // default mode outside SMAR's markets: this file is NOT SMAR's file (SE-H)
      if (sim) f.storefrontFallback = sim.error
        ? `${o.country} is not in app-store-scraper's markets: SMAR's file would be the US-ranked chart (s=143441) looked up in ${o.country}, not ${o.country}'s own chart as here (its size could not be measured: ${sim.error})`
        : `SMAR's file would be the US-ranked chart (s=143441) looked up in ${o.country}: ${sim.smarRows} rows, ${sim.dropped.length} of the US chart's ${sim.usChartRows} apps dropped (not sold in ${o.country}); this file is ${o.country}'s own chart (${sim.rowsNotInSmarFile} of its ${st.rows.length} rows are not in SMAR's file)`;
      if (o.num != null) f.noSmarEquivalent = '--num';
      const ids = c.entries || [];
      if (!c.stop && ids.length && ids.every((x) => x == null)) f.stop = { code: 'endpoint_drift', sentence: "Apple's chart feed entries carry no app ids (endpoint drift), so the chart cannot be read; tell the user and do not deliver" };
      const exp = (C.COLLECTIONS[o.collection] || {}).expectedRows || 0;
      if (!c.stop && !o.compat && c.kind === 'one' && exp > 1) f.endpointDrift = `the chart feed returned a single entry where Apple serves ${exp}`;
      if (!f.stop && !c.stop && !st.rows.length && o.compat && !c.smar500) f.compatEmpty200 = 'the chart lookup returned no apps: SMAR answers HTTP 200 with the 13-byte file "dateScraped"';
      if ((c.rankDiff || []).length) f.problems.push(`rank cross-check (informative): Apple's country chart feed orders ${c.rankDiff.length} app(s) differently: ` + c.rankDiff.slice(0, 10).map((d) => `${d.appId || d.id} #${d.rank} vs #${d.altRank}`).join(', '));
      // no App Store / no chart feed for the country: the storefront-fallback notes would contradict the STOP (WI-7)
      const noStore = !!(c.stop && c.stop.code === 'no_storefront');
      for (const w of c.warnings || []) if (w && w.code !== 'smar_http500' && !(noStore && w.code === 'smar_storefront_fallback')) f.problems.push(typeof w === 'string' ? w : (w.detail || w.code));
      if (noStore) f.noStorefront = true;
    } else if (o.mode === 'reviews') {
      const states = o.apps.map((ref) => st.reviews && st.reviews[ref]).filter(Boolean);
      f.apps = states.map((rs) => R.appSummary(rs));
      for (const rs of states) addR(R.compatReasons(rs));
      if (td.length) f.compatReasons.unshift({ code: 'transport_dependent', detail: capList(td, `${td.length} app(s): `, 400) });
      if (o.bulk) { f.bulk = true; addR([{ code: 'bulk_frontend_not_reproduced', detail: 'bulk reviews' }]); }
      if (o.all) f.noSmarEquivalent = '--all';
      f.transportDependent = f.apps.some((a) => a.emptyMidFeedPages.length || a.transportRisk.parseRetried.length);
      f.shortPages = [];
      for (const rs of states) { // a page before the last non-empty one always holds 50 reviews (60/60 mid-feed pages cached)
        const last = rs.pages.reduce((m, p) => (p.n > 0 ? Math.max(m, p.p) : m), 0);
        for (const p of rs.pages) if (p.p < last && p.n > 0 && p.n < R.PAGE_SIZE) f.shortPages.push({ appId: rs.appId, page: p.p, n: p.n });
      }
      // an empty page is never evidence of "no written reviews" (stress F1/F2, SCALE-1/2, WI-4, AS-REV-1): an app whose
      // every page came back empty although it has reviews ('transient') is a failed fetch in BOTH modes; one whose feed
      // is confirmed empty ('none': 0 ratings, or both Apple review sources empty) is not
      const failing = f.apps.filter((a) => a.emptyFeed && a.emptyFeed.state === 'transient');
      const none = f.apps.filter((a) => a.emptyFeed && a.emptyFeed.state === 'none');
      const unhealed = f.apps.filter((a) => !a.emptyFeed && a.unhealed && a.unhealed.length);
      // an all-empty feed is known to hide written reviews when Apple's second review source lists some, or the app has
      // ZERO_REVIEWS_MAX_RATINGS+ ratings; otherwise (few ratings, the second source unreadable or asked with another
      // storefront) it is unknown whether the app has written reviews at all: never "not a lack of reviews" then
      // (stress regression: an app with 3 ratings and an unreachable MZ was told to retry a "temporary failure")
      const knownReviews = (a) => a.emptyFeed.why === 'second_source_has_reviews' || a.emptyFeed.why === 'too_many_ratings_for_none' || a.ratingCount >= R.ZERO_REVIEWS_MAX_RATINGS;
      const failKnown = failing.filter(knownReviews), failUnknown = failing.filter((a) => !knownReviews(a));
      const rowsDefault0 = f.apps.reduce((s0, a) => s0 + a.rows, 0);
      // REFETCH follows unless every app came back empty in default mode (then the run STOPs: "try again later")
      const refetchNext = o.compat || rowsDefault0 > 0;
      // the 0-row apps first: the 4 KB stdout cap keeps the first problems
      if (failKnown.length) f.problems.push(capList(failKnown.map((a) => `${a.appId} (${ratingsText(a.ratingCount)}${a.emptyFeed.why === 'second_source_has_reviews' ? '; Apple\'s second review source lists reviews' : ''})`),
        `Apple's reviews feed returned only empty pages, so 0 rows, for ${failKnown.length} app(s) that have reviews (a temporary Apple feed failure, not missing reviews${refetchNext ? '; REFETCH re-reads them' : ''}): `, 600));
      if (failUnknown.length) f.problems.push(capList(failUnknown.map((a) => `${a.appId} (${ratingsText(a.ratingCount)})`),
        `Apple's reviews feed returned only empty pages, so 0 rows, for ${failUnknown.length} app(s) whose written reviews could not be confirmed either way (Apple's second review source could not be read, and ratings need no text${refetchNext ? '; REFETCH reads them again' : ''}): `, 600));
      if (unhealed.length) f.problems.push(capList(unhealed.map((a) => `${a.appId} page ${a.unhealed.join(',')}`), `empty review page(s) mid-feed that a cache-busted re-read could not heal (${unhealed.length} app(s)): `, 600, '; '));
      if (none.length && o.bulk) f.problems.push(capList(none.map((a) => `${a.appId} (${ratingsText(a.ratingCount)})`), 'no written reviews in either of Apple\'s review sources (0 rows): ', 400));
      // unhealed mid-feed pages leave an app short of its target in BOTH modes: --smar-compat used to call a file of 50 of
      // 500 rows (9 of 10 pages empty) READY while an all-empty feed was REFETCH (stress regression). The pages SMAR would
      // have received at that moment are transport luck, not SMAR's answer for the app; --deliver-anyway still writes them.
      const failed = unhealed.map((a) => a.appId).concat(failing.map((a) => a.appId));
      if (failed.length) {
        f.fetchFailed = failed.filter((x, i) => failed.indexOf(x) === i);
        // the apps have rows (or a failing empty feed): they are incomplete, not "failed to fetch" (stress regression)
        f.fetchFailedText = `${f.fetchFailed.length} app(s) incomplete after retries (${unhealed.length ? `${unhealed.length} with empty pages mid-feed` : ''}${unhealed.length && failing.length ? ', ' : ''}${failing.length ? `${failing.length} whose every page came back empty` : ''})`;
      }
      f.feedFailing = failing.map((a) => a.appId);
      if (f.shortPages.length) {
        f.problems.push('reviews feed returned short page(s) mid-feed: ' + f.shortPages.map((x) => `${x.appId} page ${x.page} has ${x.n} of 50`).join('; '));
        if (!o.compat) f.endpointDrift = 'reviews page(s) with fewer than 50 entries before the end of the feed';
      }
      // the optional MZ second source gave up for this run (5xx / no answer twice in a row, or one 403/429)
      // (read from the saved MZ records too: a later call without a re-fetch keeps reporting the checks never asked)
      const mzSkipped = states.reduce((n, rs) => n + Object.values(rs.mz || {}).filter((m) => m && m.skipped).length, 0);
      const mu = st.mzx && st.mzx.unavailable;
      if (mu || mzSkipped) {
        const why = mu ? mu.why : 'it failed earlier in this run';
        f.mzUnavailable = { why, skipped: mzSkipped };
        f.problems.push(`Apple's second review source (MZ) was unavailable (${why}; ${mzSkipped} page check(s) not asked): those reviews were not cross-checked, and an app whose feed came back empty could not be confirmed either way`);
      }
      const s500 = f.apps.filter((a) => a.smarReviewsWouldHttp500);
      if (s500.length) f.smarHttp500 = s500.map((a) => `${a.appId || '?'}: ${a.smar500}`).join('; ');
      const bad = f.apps.filter((a) => a.notFound || a.error);
      for (const a of bad) f.problems.push(`${a.appId || '?'}: ${a.notFound ? 'not available in the ' + o.country + ' store' : a.error.message}`);
      if (!o.bulk && bad.length) {
        const a = bad[0];
        f.stop = a.notFound ? { code: 'not_in_store', sentence: `${o.apps[0]} is not available in the ${o.country} App Store (SMAR answers an error)` + (/\./.test(o.apps[0]) || A_NUM(o.apps[0]) ? '' : '; if it is an app name, resolve it first with the lookup command') }
          : a.smar500 ? { code: 'smar_http500', sentence: `Apple's reviews feed for ${o.apps[0]} cannot be read the way SMAR reads it (${a.error.message}); SMAR answers an error` }
            : { code: 'fetch_failed', sentence: `the reviews of ${o.apps[0]} could not be fetched (${a.error.message}); tell the user and try again later` };
      } else if (bad.length === f.apps.length) f.stop = { code: 'fetch_failed', sentence: 'none of the apps could be read; tell the user' };
      const rowsDefault = f.apps.reduce((s, a) => s + a.rows, 0), rowsSmar = f.apps.reduce((s, a) => s + a.smarRows, 0);
      if (!f.stop && !(o.compat ? rowsSmar : rowsDefault)) {
        const later = st.shell && st.shell.resumeWith ? ` (in 15-30 minutes run: ${st.shell.resumeWith})` : '';
        if (o.compat && !f.smarHttp500) {
          f.compatEmpty200 = failing.length
            ? 'Apple\'s reviews feed returned only empty pages (a temporary feed failure): at this moment SMAR would answer HTTP 200 with the 13-byte file "dateScraped"'
            : 'no written reviews: SMAR answers HTTP 200 with the 13-byte file "dateScraped"';
        } else if (!o.compat && failing.length) {
          const a = failing[0], who = failing.length === f.apps.length ? 'every app' : failing.map((x) => x.appId).slice(0, 5).join(', ');
          f.stop = { code: 'feed_empty', sentence: o.bulk
            ? (failUnknown.length === failing.length
              ? `Apple's reviews feed returned only empty pages for ${who} right now, and Apple's second review source could not be read, so it cannot be told whether ${failing.length > 1 ? 'they have' : 'it has'} written reviews (ratings need no text): tell the user it could not be confirmed either way and try again later${later}`
              : `Apple's reviews feed returned only empty pages for ${who} right now, although ${failKnown.length === failing.length ? (failing.length > 1 ? 'they have' : 'it has') : `${failKnown.map((x) => x.appId).slice(0, 5).join(', ')} ${failKnown.length > 1 ? 'have' : 'has'}`} reviews; this is a temporary Apple feed failure, not a lack of reviews: tell the user and try again later${later}`)
            : !knownReviews(a)
              ? `Apple's reviews feed returned only empty pages for ${o.apps[0]}${a.appId && a.appId !== o.apps[0] ? ` (${a.appId})` : ''} right now, and Apple's second review source could not be read, so it cannot be told whether this app (${ratingsText(a.ratingCount)}) has written reviews (ratings need no text): tell the user it could not be confirmed either way and try again later${later}`
              : `Apple's reviews feed returned only empty pages for ${o.apps[0]}${a.appId && a.appId !== o.apps[0] ? ` (${a.appId})` : ''} right now, although ${a.ratingCount > 0 ? `it has ${ratingsText(a.ratingCount)}` : 'it has reviews'}${a.emptyFeed.why === 'second_source_has_reviews' ? ' and Apple\'s second review source lists written reviews' : ''}; this is a temporary Apple feed failure, not a lack of reviews: tell the user and try again later${later}` };
        } else if (!o.compat) {
          const why = (a) => a && a.emptyFeed && a.emptyFeed.why;
          f.stop = { code: 'no_reviews', sentence: o.bulk
            ? `${bad.length ? 'none of the apps that could be read' : 'none of these apps'} has written reviews in the ${o.country} store (Apple's lookup shows 0 ratings, or its reviews feed and its second review source are both empty, for each)`
            : why(f.apps[0]) === 'no_ratings' ? `This app has no ratings and no written reviews in the ${o.country} store (Apple's lookup shows 0 ratings and its reviews feed is empty)`
              : why(f.apps[0]) === 'both_sources_empty' ? `Apple shows no written reviews for this app in the ${o.country} store: its reviews feed and its second review source are both empty (it has ${ratingsText(f.apps[0].ratingCount)}, which need no text); if the user expected reviews, try again later${later}`
                : `Apple returned no reviews for this app in the ${o.country} store; tell the user and try again later${later}` };
        }
      }
    } else {
      f.noSmarEquivalent = o.mode === 'rerun' ? 'rerun' : 'ids';
      f.fetchFailed = st.dropped.filter((d) => d.reason === 'lookup_failed').map((d) => d.appId);
      const nis = st.dropped.filter((d) => d.reason === 'not_in_storefront').map((d) => d.appId);
      if (nis.length) f.problems.push(`${nis.length} id(s) not available in the ${o.country} App Store (no row): ${nis.slice(0, 10).join(', ')}`);
      if (!st.rows.length && !f.fetchFailed.length) { f.noResults = true; f.stop = { code: 'no_results', sentence: `none of the ids is available in the ${o.country} App Store` }; }
    }
    return f;
  }
  // reviews apps whose rows are incomplete: the fetchFailed apps of modeFacts with their rows / target / missing pages
  function reviewGaps(f, compat) {
    const ids = new Set(f.fetchFailed || []);
    return (f.apps || []).filter((a) => ids.has(a.appId)).map((a) => ({ appId: a.appId, rows: compat ? a.smarRows : a.rows, target: compat && a.smarTarget != null ? a.smarTarget : a.target,
      missingPages: (a.unhealed || []).slice(), emptyFeed: !!(a.emptyFeed && a.emptyFeed.state === 'transient') }));
  }
  function gapsText(gaps, nApps, smarEmptyFile) {
    const one = (g) => `${g.appId} ${g.rows} of ${g.target} rows (${g.emptyFeed ? 'every page came back empty' : `page${g.missingPages.length > 1 ? 's' : ''} ${g.missingPages.join(',')} missing`})`;
    const head = smarEmptyFile ? 'the file is SMAR\'s 13-byte "no reviews" file although the feed failed: ' : 'the file keeps the reviews fetched so far and is incomplete: ';
    const rest = nApps - gaps.length;
    return capList(gaps.map(one), head, 420) + (rest > 0 ? `; the other ${rest} app(s) are complete` : '');
  }
  const LEGACY_AGE = ['4+', '9+', '12+', '17+']; // 16,716/16,716 cached lookups (FS-05: the lookup keeps the legacy scale)
  function ageOutliers(st) {
    const out = [];
    const cc = st.opts && st.opts.country; // BR spells the legacy scale "+4" (K.legacyAge); the written value is unchanged
    for (const r of st.rows || []) { const raw = rowRaw(st, r); if (raw && raw.contentAdvisoryRating != null && !LEGACY_AGE.includes(K.legacyAge(raw.contentAdvisoryRating, cc))) out.push(r.appId); }
    return out;
  }
  // rendered row objects in output order (default mode: quarantined cells set to undefined, A3)
  function buildRows(st, compat, f) {
    const o = st.opts, cc = o.country;
    st.quarantined = {}; st.unverified = {};
    if (o.mode === 'reviews') {
      const states = o.apps.map((ref) => st.reviews[ref]).filter(Boolean);
      const qmap = {};
      // default blanks every failed review cell; compat blanks the cells whose entry contradicts itself (q.own) and keeps
      // SMAR's value where only Apple's second review source disagrees (unverified)
      for (const rs of states) {
        const q = K.reviewQuarantine(rs, { compat });
        for (const [id, cells] of Object.entries(q.cells)) {
          const own = (q.own || {})[id] || {}, blankHere = compat ? own : cells, rest = {};
          for (const [c, why] of Object.entries(cells)) if (!(c in blankHere)) rest[c] = why;
          if (Object.keys(blankHere).length) { qmap[id] = blankHere; st.quarantined['review:' + id] = Object.assign({}, blankHere); }
          if (Object.keys(rest).length) st.unverified['review:' + id] = rest;
        }
      }
      const KEY = { rating: 'score', reviewText: 'text', userUrl: 'userUrl', reviewID: 'id' };
      const blank = (r) => { if (qmap[r.id]) for (const c of Object.keys(qmap[r.id])) { const k = KEY[c] || c; if (k in r) r[k] = undefined; } return r; };
      const rows = o.bulk ? R.bulkRows(states, { compat }).map(blank) : states[0] ? R.appRows(states[0], { compat }).rows.map(blank) : [];
      // default mode: dateReviewed carries the review's own Pacific offset (AS-REV-2); count the rows whose RSS label changed
      let dateFixed = 0;
      if (!compat && R.fixPacificOffset) {
        const changed = new Set();
        for (const rs of states) for (const list of Object.values(rs.pageEntries || {})) for (const e of list || []) {
          const lab = e && e.updated && e.updated.label;
          if (typeof lab === 'string' && R.fixPacificOffset(lab) !== lab) changed.add(e.id && e.id.label);
        }
        dateFixed = rows.filter((r) => r.updated !== undefined && changed.has(r.id)).length;
      }
      return { layout: o.bulk ? 'bulkReviews' : 'reviews', rows, dateFixed };
    }
    if (f && f.stop && !st.rows.length) return { layout: o.mode === 'chart' || o.layout === 'chart' ? 'chart' : 'search', rows: [] };
    const compatOwn = {}; // compat: the cells of the rendered (first) read whose record contradicts itself (blanked)
    for (const r of st.rows) {
      const c = st.checks[r.appId];
      if (!c) continue;
      const q = K.quarantineCells(c, { compat });
      if (q.kind === 'quarantined') st.quarantined[r.appId] = q.cells; else if (q.kind === 'unverified') st.unverified[r.appId] = q.cells;
      if (Object.keys(q.anchorAbsent || {}).length) st.unverified[r.appId] = Object.assign(st.unverified[r.appId] || {}, q.anchorAbsent);
      if (compat) { const own = c.after ? K.quarantineCells(Object.assign({}, c, { after: undefined }), { compat: true }).own : q.own; if (own && Object.keys(own).length) compatOwn[r.appId] = own; }
    }
    for (const id of ageOutliers(st)) st.unverified[id] = Object.assign(st.unverified[id] || {}, { contentRating: 'lookup:outside_legacy_age_scale' });
    let layout, rows;
    const rawOf = (r) => { const d = st.details[r.key] || st.details[lower(r.appId)]; return !compat && d.refetched ? d.refetched : d.raw; };
    for (const r of st.rows) {
      const c = st.checks[r.appId], d = st.details[r.key];
      if (compat && c && c.after && d && d.refetched) {
        const q0 = K.quarantineCells(Object.assign({}, c, { after: undefined }), { compat: true });
        for (const col of Object.keys(q0.cells)) (st.unverified[r.appId] = st.unverified[r.appId] || {})[col] = q0.cells[col] + ' (a cache-busted re-read disagreed)';
      }
    }
    // --smar-compat keeps SMAR's value where another source disagrees (unverified), but never a value whose own record
    // contradicts it (a price that is not its formattedPrice, a genre name of another genre id...): blanked as in default
    for (const [id, own] of Object.entries(compatOwn)) {
      st.quarantined[id] = Object.assign(st.quarantined[id] || {}, own);
      if (st.unverified[id]) { for (const col of Object.keys(own)) delete st.unverified[id][col]; if (!Object.keys(st.unverified[id]).length) delete st.unverified[id]; }
    }
    if (o.mode === 'search') { layout = 'search'; rows = st.rows.map((r) => W.searchRow(rawOf(r), cc, r.source)); }
    else if (o.mode === 'chart' || o.layout === 'chart') { layout = 'chart'; rows = st.rows.map((r) => W.chartRow(rawOf(r))); }
    else { layout = 'search'; rows = st.rows.map((r) => W.searchRow(rawOf(r), cc, r.source)); }
    // type contract (BOTH modes): a lookup value outside its type ({value: 4.8} where a rating number belongs) is never
    // rendered; the cell is quarantined (undefined) and reported; driftReport counts it toward column drift.
    const typeQ = {}, typeViolations = {};
    st.rows.forEach((r) => {
      const cells = K.typeCells(rawOf(r));
      if (!Object.keys(cells).length) return;
      typeQ[r.appId] = cells;
      st.quarantined[r.appId] = Object.assign(st.quarantined[r.appId] || {}, cells);
      if (st.unverified[r.appId]) { for (const c of Object.keys(cells)) delete st.unverified[r.appId][c]; if (!Object.keys(st.unverified[r.appId]).length) delete st.unverified[r.appId]; }
      for (const c of Object.keys(cells)) typeViolations[c] = (typeViolations[c] || 0) + 1;
    });
    // default: every quarantined cell; compat: type violations and the cells whose record contradicts itself
    rows = rows.map((row, i) => K.applyQuarantine(row, st.quarantined[st.rows[i].appId] || {}, { compat: false }));
    return { layout, rows, typeViolations, compatBlanked: compat ? compatOwn : null };
  }
  // --deliver-anyway: every cell of each drifted column is blanked (not only the sampled ones that failed a check).
  const REVIEW_KEY = { reviewID: 'id', rating: 'score', reviewText: 'text', reviewURL: 'url', dateReviewed: 'updated', versionWhenReviewed: 'version' };
  const REVIEW_ROW_COL = { version: 'versionWhenReviewed', updated: 'dateReviewed' }; // review cells keyed by the row's own key (as_checks.reviewQuarantine)
  const rowKey = (layout, col) => (layout === 'reviews' || layout === 'bulkReviews' ? REVIEW_KEY[col] || col : K.COL_CLEAN_KEY[col] || col);
  function blankColumns(st, built, cols) {
    const out = {};
    built.rows.forEach((row, i) => {
      for (const [col, anchor] of Object.entries(cols)) {
        const k = rowKey(built.layout, col);
        if (!(k in row)) continue;
        row[k] = undefined; out[col] = (out[col] || 0) + 1;
        const r = built.layout === 'reviews' || built.layout === 'bulkReviews' ? null : st.rows[i];
        if (r) (st.quarantined[r.appId] = st.quarantined[r.appId] || {})[col] = st.quarantined[r.appId][col] || ('drift:' + anchor);
      }
    });
    return out;
  }
  function unblanked(built, cols) {
    return Object.keys(cols).filter((col) => { const k = rowKey(built.layout, col); return built.rows.some((row) => k in row && row[k] !== undefined); });
  }
  function smarName(st, now) {
    const o = st.opts;
    try {
      if (o.mode === 'search') return W.smarFileName({ layout: 'search', query: (st.search && st.search.term) || o.term }, now);
      if (o.mode === 'chart') return W.smarFileName({ layout: 'chart', collection: o.collection, categoryName: st.chart && st.chart.input ? st.chart.input.categoryName : '', country: o.country }, now);
      if (o.mode === 'reviews') { const rs = st.reviews && st.reviews[o.apps[0]]; return o.bulk ? W.smarFileName({ layout: 'bulkReviews' }, now) : W.smarFileName({ layout: 'reviews', bundleId: (rs && rs.appId) || o.apps[0] }, now); }
    } catch (e) { /* informative only */ }
    return null;
  }
  function runInfo(st) {
    const o = st.opts, run = { country: o.country, compat: o.compat };
    if (o.mode === 'search') {
      const s = st.search || {};
      Object.assign(run, { term: o.term, storefront: s.storefront ? s.storefront.id : null, storefrontSource: s.storefront ? s.storefront.source : null, primaryOnly: o.primaryOnly || undefined, appIdQuery: s.appIdQuery || undefined });
      if (s.term && s.term !== o.term) run.siteTerm = s.term;
    } else if (o.mode === 'chart') {
      const sm = st.chart && st.chart.summary;
      Object.assign(run, { collection: o.collection, genre: o.genre, num: o.num, storefront: sm ? sm.storefront : null, storefrontSource: sm ? sm.storefrontSource : null });
    } else if (o.mode === 'reviews') Object.assign(run, { apps: o.apps.slice(0, 20), all: o.all || undefined, bulk: o.bulk || undefined, storefront: STOREFRONTS[o.country] ? STOREFRONTS[o.country].id : null, storefrontSource: 'storefronts' });
    else Object.assign(run, { apps: o.ids.length, layout: o.layout, from: o.from });
    return run;
  }
  function countryVerified(st, f) {
    if (f && f.rep) return f.rep.countryVerified;
    const sf = STOREFRONTS[st.opts.country];
    return !!(sf && sf.verified);
  }
  function addReq(a, b) { const o = Object.assign({}, ZERO_REQ, a || {}); for (const k of Object.keys(ZERO_REQ)) o[k] = (o[k] || 0) + ((b && b[k]) || 0); return o; }
  function baseSummary(st, ctx, f) {
    const o = st.opts;
    const s = { skill: 'smar-appstore-agent', version: VERSION, runner: ctx.runner || 'shell', mode: o.mode, run: runInfo(st), csv: null, csvName: null, rows: 0 };
    s.requests = addReq(st.requests, ctx.requests);
    s.startedUTC = st.startedUTC;
    return s;
  }
  function modeSlice(st, f, s) {
    const o = st.opts;
    if (o.mode === 'search' && f.rep) {
      const rep = f.rep;
      s.bySource = rep.bySource;
      s.smarWouldDrop = rep.smarWouldDrop;
      s.transportRisk = rep.transportRisk;
      if (rep.smarSearchWouldHttp500) s.smarSearchWouldHttp500 = rep.smarSearchWouldHttp500;
      if (rep.smarSiteTerm !== undefined) s.smarSiteTerm = rep.smarSiteTerm;
      if (rep.smarUiWouldReject) s.smarUiWouldReject = rep.smarUiWouldReject;
      s.searchCounts = { primaries: rep.primaries, related: rep.related };
    } else if (o.mode === 'chart' && st.chart) {
      const sm = st.chart.summary || {};
      s.chart = Object.assign({}, sm.chart, (st.chart.rankDiff || []).length ? { rankDiff: st.chart.rankDiff.slice(0, 25) } : {}); s.smarWouldDrop = sm.smarWouldDrop;
      if (sm.smarChartWouldHttp500) s.smarChartWouldHttp500 = sm.smarChartWouldHttp500;
      s.transportRisk = {};
    } else if (o.mode === 'reviews' && f.apps) {
      s.reviews = { apps: f.apps.map((a) => ({ appId: a.appId, trackId: a.trackId, ratingCount: a.ratingCount, target: a.target, rows: a.rows, smarRows: a.smarRows, pages: a.pages,
        emptyMidFeedPages: a.emptyMidFeedPages, healed: a.healed, duplicates: a.duplicates.length, capTruncation: a.capTruncation || undefined, notFound: a.notFound || undefined, error: a.error ? a.error.code : undefined })) };
      s.transportRisk = { emptyReviewPages: f.apps.filter((a) => a.emptyMidFeedPages.length).map((a) => ({ appId: a.appId, pages: a.emptyMidFeedPages, healed: a.healed })) };
      if (f.shortPages && f.shortPages.length) s.transportRisk.shortReviewPages = f.shortPages;
      if (f.smarHttp500) s.smarReviewsWouldHttp500 = f.smarHttp500;
      const ui = f.apps.filter((a) => a.uiReject && a.uiReject.length).map((a) => ({ appId: a.appId, reasons: a.uiReject }));
      if (ui.length) s.smarUiWouldReject = ui;
      s.smarWouldDrop = { count: 0, items: [] };
    } else {
      s.smarWouldDrop = { count: st.dropped.length, items: st.dropped.slice(0, 25).map((d) => ({ appId: d.appId, stage: d.stage, reason: d.reason })) };
      s.transportRisk = { batchSplits: st.transport.batchSplits };
    }
  }
  // every option that changes what this file holds (SE-J: an --all run's relog read like a default run's)
  function runOptions(st, s) {
    const o = st.opts, a = [];
    if (o.compat) a.push('--smar-compat');
    if (o.primaryOnly) a.push('--primary-only');
    if (o.all) a.push('--all');
    if (o.bulk) a.push('--bulk');
    if (o.perApp) a.push('--per-app');
    if (o.num != null) a.push('--num ' + o.num);
    if (o.mode === 'ids' || o.mode === 'rerun') {
      a.push('--layout ' + o.layout);
      const n = {}; for (const [, src] of o.ids) n[src] = (n[src] || 0) + 1;
      a.push('scrapedFrom ' + Object.entries(n).map(([k, v]) => `"${k}" x${v}`).join(', '));
      if (o.from) a.push('from ' + o.from);
    }
    if (o.sample != null) a.push('--sample ' + o.sample);
    if (s && s.deliveredAnyway) a.push('--deliver-anyway (blanked: ' + (Object.keys(s.blankedColumns || {}).join(', ') || 'none') + ')');
    return a;
  }
  function relogText(st, s, ctx) {
    const o = st.opts, r = s.requests || {};
    const what = o.mode === 'search' ? `keyword search "${o.term}"` : o.mode === 'chart' ? `top chart ${o.collection}, genre ${o.genre}` : o.mode === 'reviews' ? `reviews of ${o.apps.join(', ')}` : `${o.mode} (${o.ids.length} apps)`;
    return [
      `tool: smar-appstore-agent ${VERSION} (produced by smar-appstore-agent, not by smar-tool.org)`,
      `store: iOS App Store`,
      `generated (UTC): ${new Date(ctx.now != null ? ctx.now : Date.now()).toISOString()}`,
      `request: ${what}; country ${o.country}; storefront ${s.run.storefront == null ? 'n/a' : s.run.storefront} (${s.run.storefrontSource || 'n/a'})`,
      `rendering: ${o.compat ? 'SMAR-compatible bytes (--smar-compat)' : 'default (SMAR columns and rules, without its transport losses and writer bugs)'}`,
      `options: ${runOptions(st, s).join(' ') || 'none (default run)'}`,
      ...(s.deliveredAnyway && s.partialApps && s.partialApps.length ? [`incomplete (delivered anyway): ${capList(s.partialApps.map((g) => `${g.appId} ${g.rows} of ${g.target} rows (${g.missingPages === 'all' ? 'every page came back empty' : 'pages ' + g.missingPages.join(',') + ' missing'})`), '', 60000, '; ')}`] : []),
      ...(ctx.cmd && ctx.runner !== 'browser' ? [`command: ${ctx.cmd}`] : []),
      `rows: ${s.rows}; READY_TO_DELIVER: ${s.READY_TO_DELIVER}; NEXT: ${s.NEXT}`,
      `compatExact: ${s.compatExact && s.compatExact.ok ? 'ok' : (s.compatExact ? s.compatExact.reasons.map((x) => x.code).join(', ') : 'n/a')}`,
      `requests: itunes_api ${r.itunes_api || 0}, apple_other ${r.apple_other || 0}, from journal ${r.journalHits || 0}, retries ${r.retries || 0}, rate-limited ${r.rateLimited || 0}`,
      `run started (UTC): ${st.startedUTC}; run id ${st.runId}`,
      `data source: Apple's public iTunes Lookup API and App Store feeds; values copied by script, never typed by a model`,
      '',
    ].join('\n');
  }

  function outputs(st, ctx) {
    ctx = ctx || {};
    const compat = ctx.compat == null ? !!st.opts.compat : !!ctx.compat;
    if (ctx.compat != null) st.opts.compat = compat;
    const now = ctx.now != null ? ctx.now : Date.now();
    const f = modeFacts(st), o0 = st.opts;
    const built = buildRows(st, compat, f);
    let file = W.renderFile(built.rows, { layout: built.layout, compat, now });
    const s = baseSummary(st, ctx, f);
    s.rows = built.rows.length;
    modeSlice(st, f, s);
    const d = K.decide(st, { finished: isDone(st), stop: f.stop, fetchFailed: f.fetchFailed, fetchFailedText: f.fetchFailedText, noResults: f.noResults, smarHttp500: f.smarHttp500, endpointDrift: f.endpointDrift,
      similarDrift: f.similarDrift, similarKeyMissing: f.similarKeyMissing, storefrontFallback: f.storefrontFallback, siteTermApplied: f.siteTermApplied,
      transportDependent: f.transportDependent, bulk: f.bulk, noSmarEquivalent: f.noSmarEquivalent, searchRankNondeterminism: f.searchRankNondeterminism,
      rows: built.rows.length, compat, deliverAnyway: !!ctx.deliverAnyway, problems: f.problems }, { cmd: ctx.cmd, refetchCmd: ctx.refetchCmd });
    for (const r of f.compatReasons) {
      const i = d.compatExact.reasons.findIndex((x) => x.code === r.code);
      if (i < 0) d.compatExact.reasons.push(r);
      // reviews: the per-app empty-page detail replaces the generic one, which counts search-mode pages (SCALE-9)
      else if (o0.mode === 'reviews' && r.code === 'transport_dependent') d.compatExact.reasons[i] = r;
    }
    if (compat) { // cells this compat file writes undefined where SMAR's file has a value (type violation, own record contradicts it)
      const qc = {};
      for (const cells of Object.values(st.quarantined || {})) for (const c of Object.keys(cells || {})) { const col = REVIEW_ROW_COL[c] || c; qc[col] = (qc[col] || 0) + 1; }
      const n = Object.values(qc).reduce((a, b) => a + b, 0);
      if (n) d.compatExact.reasons.push({ code: 'quarantined_cells', detail: `${n} cell(s) written undefined where SMAR's file has the value (the value fails a check of its own record or its type): ` + Object.entries(qc).map(([c, k]) => `${c}:${k}`).join(',') });
    }
    d.compatExact.ok = d.compatExact.reasons.length === 0;
    let READY = d.READY_TO_DELIVER, NEXT = d.NEXT, exitCode = d.exitCode, deliveredAnyway = d.deliveredAnyway;
    const drifted = d.drift.fixAnchors.slice(); // every anchor (column) this run flagged as drifted
    if (f.compatEmpty200 && compat && !f.stop) {
      d.problems = d.problems.filter((p) => p !== 'no rows'); d.problems.push(f.compatEmpty200); exitCode = 0;
      if ((f.fetchFailed || []).length) { // Apple's feed failed: SMAR's empty file at this moment, not its answer for the app
        d.problems.push(f.fetchFailedText || `${f.fetchFailed.length} app(s) failed to fetch after retries`);
        if (ctx.deliverAnyway) { READY = true; NEXT = 'DELIVER'; deliveredAnyway = true; d.problems.push('delivered anyway at the user\'s request despite: REFETCH'); }
        else { READY = false; NEXT = K.next.refetch(ctx.refetchCmd ? ctx.refetchCmd(f.fetchFailed) : (ctx.cmd || '<refetch>')); }
      } else { READY = true; NEXT = 'DELIVER'; }
    }
    const age = o0.mode === 'reviews' ? [] : ageOutliers(st);
    if (age.length) {
      d.problems.push(`contentRating outside the legacy 4+/9+/12+/17+ scale on ${age.length} row(s) (lookup.contentAdvisoryRating changed?)`);
      if (!compat && age.length >= Math.max(3, Math.ceil(0.1 * built.rows.length))) {
        drifted.push('lookup.contentAdvisoryRating');
        if (READY && ctx.deliverAnyway) { d.problems.push('delivered anyway at the user\'s request despite: FIX_ANCHOR: lookup.contentAdvisoryRating'); deliveredAnyway = true; }
        else if (READY) { READY = false; NEXT = K.next.fixAnchor(['lookup.contentAdvisoryRating']); }
      }
    }
    // writer shape guard: a value it refused to stringify (written undefined) is a changed field: not deliverable as is
    const refused = (file.stats && file.stats.refusedCells) || {};
    if (Object.keys(refused).length) {
      const anchors = Object.keys(refused).map((h) => 'writer.' + h);
      drifted.push(...anchors);
      d.problems.push('the writer refused non-scalar value(s) (written undefined): ' + Object.entries(refused).map(([h, n]) => `${h} on ${n} row(s)`).join('; '));
      if (READY && exitCode === K.EXIT.finished && built.rows.length) {
        if (ctx.deliverAnyway) { d.problems.push('delivered anyway at the user\'s request despite: FIX_ANCHOR: ' + anchors.join(', ')); deliveredAnyway = true; }
        else { READY = false; NEXT = K.next.fixAnchor(anchors); }
      }
    }
    // --deliver-anyway (SE-B): blank EVERY cell of each drifted column, or refuse when a drifted anchor is no column
    let blanked = null, blankedCols = null;
    if (deliveredAnyway && READY && drifted.length) {
      const ac = K.anchorColumns([...new Set(drifted)], built.layout);
      if (ac.unmapped.length) {
        READY = false; deliveredAnyway = false; exitCode = K.EXIT.stopped;
        d.problems = d.problems.filter((p) => !/^delivered anyway/.test(p));
        d.problems.push('--deliver-anyway refused: ' + ac.unmapped.join(', ') + ' drifted and is not one CSV column, so its wrong values cannot be blanked');
        NEXT = K.next.stop(`--deliver-anyway cannot blank what ${ac.unmapped.join(', ')} affects (it is not one CSV column), so this run cannot be delivered; tell the user`);
      } else if (Object.keys(ac.cols).length) {
        blanked = blankColumns(st, built, ac.cols); blankedCols = ac.cols;
        file = W.renderFile(built.rows, { layout: built.layout, compat, now });
        d.problems.push('delivered anyway: every cell of the drifted column(s) ' + Object.keys(ac.cols).join(', ') + ' is blank (undefined)');
        const left = unblanked(built, ac.cols);
        if (left.length) { // never READY while a drifted column still holds a value
          READY = false; deliveredAnyway = false; exitCode = K.EXIT.stopped;
          NEXT = K.next.stop('the drifted column(s) ' + left.join(', ') + ' could not be blanked, so this run cannot be delivered; tell the user');
        }
      }
    }
    // a finished run held back by drift or failed fetches: can --resume --deliver-anyway deliver it? (SE-F: it was
    // offered for a drifted webPage.version, which no blanking can fix, and the agent had to retract it)
    // reviews: the apps whose rows are incomplete (unhealed pages / a failing empty feed); what --deliver-anyway writes for
    // them is said exactly (SCALE-3, WI-8: the old text claimed they were left out, but their partial rows are kept)
    const gaps = o0.mode === 'reviews' ? reviewGaps(f, compat) : [];
    let deliverAnyway = null;
    if (!READY && exitCode === K.EXIT.finished && (built.rows.length || (compat && f.compatEmpty200)) && /^(FIX_ANCHOR|REFETCH):/.test(NEXT)) {
      const ac = K.anchorColumns([...new Set(drifted)], built.layout);
      if (ac.unmapped.length) {
        deliverAnyway = { possible: false, why: `${ac.unmapped.join(', ')} drifted and is not one CSV column, so its wrong values cannot be blanked; --deliver-anyway refuses this run (tell the user it cannot be delivered and why)` };
        if (/^FIX_ANCHOR:/.test(NEXT)) NEXT = NEXT.replace(/ \(an Apple source changed shape; tell the user, edit nothing\)$/, '') + ` (an Apple source changed shape; tell the user, edit nothing; this run cannot be delivered, not even with --deliver-anyway: ${ac.unmapped.join(', ')} is not one CSV column)`;
      } else {
        const why = [];
        if (Object.keys(ac.cols).length) why.push('every cell of ' + Object.keys(ac.cols).join(', ') + ' is written undefined');
        if (gaps.length) why.push(gapsText(gaps, f.apps.length, compat && f.compatEmpty200 && !built.rows.length));
        else if ((f.fetchFailed || []).length) why.push('the file is written without the apps whose fetch failed');
        deliverAnyway = { possible: true, blankColumns: Object.keys(ac.cols), why: 'only with the user\'s OK: ' + (why.join('; ') || 'the file is written as it stands') };
      }
    }
    if (deliveredAnyway && READY && gaps.length) d.problems.push('delivered anyway: ' + gapsText(gaps, f.apps.length, compat && f.compatEmpty200 && !built.rows.length));
    const noFile = (compat && f.smarHttp500 && !f.compatEmpty200) || (!built.rows.length && !(compat && f.compatEmpty200));
    const text = noFile ? null : file.text;
    const q = K.quarantineSummary(st, { rows: built.rows });
    if (blanked) for (const [col, n] of Object.entries(blanked)) q.quarantinedCells[col] = Math.max(q.quarantinedCells[col] || 0, n);
    const agg = d.drift.checks || {};
    Object.assign(s, {
      csvName: text == null ? null : READY ? 'final' : 'not_ready',
      READY_TO_DELIVER: READY, NEXT, problems: d.problems,
      crossChecks: { rowsChecked: (o0.mode === 'reviews' ? (agg.bySource || {}).mzReviews : agg.rowsChecked) || 0, unanchoredRows: o0.mode === 'reviews' ? Math.max(0, built.rows.length - ((agg.bySource || {}).mzReviews || 0)) : agg.unanchoredRows || 0,
        bySource: agg.bySource || {}, hardFailures: agg.hardFailures || {}, softWarnings: agg.softWarnings || {}, notCrossCheckable: agg.notCrossCheckable || {} },
      quarantinedCells: q.quarantinedCells, quarantinedApps: q.quarantinedApps, unverifiedCells: q.unverifiedCells,
      undefinedCounts: (file.stats && file.stats.undefinedCounts) || {}, defaultFixes: Object.assign({}, (file.stats && file.stats.defaultFixes) || {}, built.dateFixed ? { dateReviewed: built.dateFixed } : {}),
      drift: { cdnAgeRows: d.drift.cdnAgeRows, versionMismatchRows: d.drift.versionMismatchRows, versionMismatchPersistent: d.drift.versionMismatchPersistent || undefined, refetched: d.drift.refetched, searchRankNondeterminism: f.rep && f.rep.drift ? f.rep.drift.searchRankNondeterminism : undefined, fixAnchors: drifted.length ? [...new Set(drifted)] : undefined },
      smarFileName: smarName(st, now), compatExact: d.compatExact, countryVerified: countryVerified(st, f),
      finishedUTC: new Date(now).toISOString(), seconds: Math.max(0, Math.round((now - Date.parse(st.startedUTC)) / 1000)),
    });
    if (deliveredAnyway) s.deliveredAnyway = true;
    if (deliverAnyway) s.deliverAnyway = deliverAnyway;
    // every incomplete app (SKILL.md: partialApps names them all; the 4 KB stdout cap may cut the list, never summaryFile)
    if (gaps.length && (deliverAnyway || deliveredAnyway)) s.partialApps = gaps.map((g) => ({ appId: g.appId, rows: g.rows, target: g.target, missingPages: g.emptyFeed ? 'all' : g.missingPages }));
    if (blanked) s.blankedColumns = blanked;
    if (Object.keys(built.typeViolations || {}).length) s.typeViolations = built.typeViolations;
    if (Object.keys(refused).length) s.refusedCells = refused;
    if (d.drift.typeDrift && d.drift.typeDrift.length) s.drift.typeDrift = d.drift.typeDrift.map((x) => ({ key: x.key, column: x.col, expected: x.expected, violations: x.violations, of: x.of, got: x.got }));
    if (!s.countryVerified && !f.noStorefront) s.problems.push(`storefront for ${st.opts.country} not verified against Apple in this release (countryVerified:false)`);
    if (f.mzUnavailable) s.crossChecks.mzUnavailable = f.mzUnavailable;
    if (st.xc && st.xc.pagesUnavailable) { // FI-09: the optional app-page sample failed; rows stand on their other sources
      const pu = st.xc.pagesUnavailable;
      // an ids / rerun run has no other second source: say what was (not) checked (stress regression)
      const n2 = s.crossChecks.rowsChecked || 0;
      s.problems.push(`the optional App Store web-page cross-check was unavailable (${pu.why}; ${pu.failed} page(s) failed, ${pu.skipped} not asked): `
        + (n2 ? `rows are checked by the other sources only (${n2} of ${built.rows.length} row(s) cross-checked)` : `no row was compared with a second Apple source (this ${o0.mode} run has no other); only the lookup's own value checks ran`));
      s.crossChecks.webPageUnavailable = { why: pu.why, failed: pu.failed, skipped: pu.skipped };
    }
    const res = { csv: text, csvName: s.csvName, rows: built.rows.length, compatExact: d.compatExact, exitCode, summary: s, layout: built.layout };
    if (ctx.emitBoth) {
      if (f.siteTermApplied || f.storefrontFallback) res.other = { skipped: 'the two modes seed differently (' + (f.siteTermApplied ? 'site term' : 'storefront fallback') + ')' };
      else { const b2 = buildRows(st, !compat, modeFacts(st)); if (blankedCols) blankColumns(st, b2, blankedCols); const f2 = W.renderFile(b2.rows, { layout: b2.layout, compat: !compat, now }); res.other = { csv: f2.text, compat: !compat }; buildRows(st, compat, f); }
    }
    res.relog = relogText(st, s, { now, cmd: ctx.cmd, runner: ctx.runner });
    s.relog = null;
    res.summaryJson = JSON.stringify(s);
    return res;
  }

  // summary of an unfinished run (exit 1/3): NEXT from decide() with incomplete / stop / error facts
  function summarize(st, ctx) {
    ctx = ctx || {};
    if (isDone(st) && !ctx.error && !ctx.stopSentence) return outputs(st, Object.assign({}, ctx, { compat: undefined })).summary;
    const s = baseSummary(st, ctx, null);
    let f = { problems: [] };
    try { if (isDone(st)) f = modeFacts(st); } catch (e) { /* partial state */ }
    s.rows = Array.isArray(st.rows) ? st.rows.length : 0;
    const facts = { incomplete: !ctx.error || ctx.incomplete, rows: s.rows, compat: st.opts.compat, problems: f.problems || [] };
    if (ctx.stopSentence) { facts.incomplete = false; facts.stop = { code: ctx.error ? ctx.error.code : 'stop', sentence: ctx.stopSentence }; }
    const d = K.decide(st, facts, { cmd: ctx.cmd });
    Object.assign(s, { READY_TO_DELIVER: false, NEXT: d.NEXT, problems: d.problems, compatExact: d.compatExact,
      crossChecks: { rowsChecked: 0, bySource: {}, hardFailures: {}, softWarnings: {}, notCrossCheckable: {} }, smarFileName: null,
      finishedUTC: new Date().toISOString(), seconds: Math.max(0, Math.round((Date.now() - Date.parse(st.startedUTC)) / 1000)), incomplete: true,
      remaining: remaining(st), exitCode: d.exitCode });
    if (ctx.error) s.error = ctx.error;
    return s;
  }
  // progress(st) -> {apps, appsDone, rows, fraction, refetching}: reviews runs count apps finished and the review rows held so far (each app's
  // fetched entries up to its target), so the --until-done progress line moves (stress SCALE-5, SCALE-8); other modes
  // report st.rows.
  // fraction: share of the run's work done (a finished app counts 1, one in progress its pages held / target, at most
  // 0.95), so a pace estimate works while several apps are read at once.
  // search / ids / rerun fill st.rows only at their end: while they run, rows = the apps whose details are in hand
  // (each becomes one row unless it is a duplicate), so the line moves during a long search (stress SCALE-8).
  function progress(st) {
    const o = st.opts;
    if (o.mode !== 'reviews') {
      const held = Array.isArray(st.rows) ? st.rows.length : 0;
      const det = st.details && typeof st.details === 'object' ? Object.keys(st.details).length : 0;
      return { apps: null, appsDone: null, rows: held || (st.phase === 'engine' && o.mode !== 'chart' ? det : 0) };
    }
    // an app re-read in a re-fetch pass (st.requeued: its pages are all fetched, only its empty ones are re-read) stays
    // counted as done: the "apps left" count and the pace never go back up when that pass starts (stress regression:
    // "10 of 31" became "31 of 31 app(s) left, about 55 min") and the pass is named on its own (refetching)
    let appsDone = 0, rows = 0, work = 0, refetching = 0;
    for (const ref of o.apps) {
      const rs = st.reviews && st.reviews[ref];
      if (!rs) continue;
      const held = (rs.pages || []).reduce((n, p) => n + (p.n || 0), 0);
      rows += rs.target != null ? Math.min(held, rs.target) : held;
      const reread = !!st.requeued && rs.stage !== 'done' && rs.stage !== 'lookup' && rs.stage !== 'pages' && !!rs.heal && (rs.heal.passes || 0) >= 1;
      if (rs.stage === 'done' || reread) { appsDone++; work += 1; if (reread) refetching++; } else if (rs.target) work += Math.min(0.95, held / rs.target);
    }
    return { apps: o.apps.length, appsDone, rows, fraction: o.apps.length ? work / o.apps.length : 1, refetching };
  }
  function remaining(st) {
    const o = st.opts;
    if (st.phase === 'xcheck') return `cross-checks (${st.xc.step})`;
    if (o.mode === 'search') {
      const s = st.search || {}, w = s.work || {};
      let d = '';
      try {
        if (st.stage === 'similar') { const n = S._internal.similarFor(st).length; d = ` (${Math.min(st.cursor || 0, n)} of ${n} similar-app pages)`; }
        else if (st.stage === 'similarLookup' && w.relQueue) d = ` (${w.relQueue.length} lookup batch(es) left)`;
        else if (st.stage === 'details' && w.want) d = ` (${Object.keys(st.details || {}).length} of ${w.want.length} apps looked up)`;
        else if (st.primaries && st.primaries.length && st.stage !== 'term' && st.stage !== 'search') d = ` (${st.primaries.length} search results)`;
      } catch (e) { d = ''; }
      return `search stage ${st.stage}${d}`;
    }
    if (o.mode === 'reviews') { const p = progress(st); return `${p.apps - p.appsDone} of ${p.apps} app(s) left` + (p.refetching ? `; re-fetch pass ${st.requeued || 1}: re-reading the empty pages of ${p.refetching} app(s)` : ''); }
    if (o.mode === 'chart') return 'chart feed and lookup';
    return st.idsw ? `${(st.idsw.queue || []).length} lookup batch(es), ${st.idsw.singles.length} single(s)` : 'lookups';
  }

  return {
    VERSION, MODES, MARKETS: S.MARKETS, STOREFRONTS, COLLECTIONS: C.COLLECTIONS, GENRES: C.IOS_CATEGORIES, HEADERS: W.HEADERS, EXCLUDE: W.EXCLUDE, RENAME: W.RENAME,
    LIMITS, SAMPLE, CHECKS: K.CHECKS, REQUIRED_LOOKUP_KEYS: K.REQUIRED_LOOKUP_KEYS, OPTIONAL_KEY_BASELINE: K.OPTIONAL_KEY_BASELINE, LABELS: L, OUT_LABEL,
    mzSearchReq: S.mzSearchReq, lookupReq: S.lookupReq, similarPageReq: S.similarPageReq, chunkIds: S.chunkIds, chartReq: C.chartReq,
    reviewsReq: R.reviewsReq, mzReviewsReq: R.mzReviewsReq, webPageReq, searchApiReq,
    parseMzSearch: S.parseMzSearch, parseLookup: S.parseLookup, parseSimilar: S.parseSimilar, parseChartRss: C.parseChartRss,
    parseReviewsRss: R.parseReviewsRss, parseMzReviews: R.parseMzReviews, parsePage: K.anchorsFromWebPage, ensureArray: W.ensureArray,
    cleanApp: W.cleanApp, cleanList: W.cleanList, smarCleanText: W.smarCleanText, renderCell: W.renderCell, smarHeader: W.smarHeader,
    toCsv: W.toCsv, renderFile: W.renderFile, smarDate: W.smarDate, smarFileName: W.smarFileName, smarBackendQuery: S.smarBackendQuery, parseCsv: W.parseCsv,
    checkRow: K.checkRow, checkRatings: K.checkRatings, checkContentRating: K.checkContentRating, checkReviews: K.checkReviews, invariants: K.invariants, driftReport: K.driftReport,
    capSummary: K.capSummary, EXIT: K.EXIT,
    resolveName, lookup, isNumId, isBundleId, resolveTerm, slugOf, checkCountry, SMAR_MENU,
    newState, seed, advance, isDone, refetch, requeue, settle, outputs, summarize, remaining, progress, integrity, repair, REVIEW_WORKERS,
  };
});
