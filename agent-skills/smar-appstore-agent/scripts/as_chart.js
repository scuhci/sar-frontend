/* as_chart.js -- SMAR iOS top charts (vendor/SAR-backend-ios controllers/listController.js + app-store-scraper 0.18
 * lib/list.js), ported from eval/appstore/probes/ios-charts/indep_chart.js (11/11 live combos byte-identical to SMAR).
 * UMD: require('./as_chart') in Node, window.SMAR_AS_CHART in a browser. Node core only, no network of its own:
 * every Apple request goes through the injected io.get(req) (net_apple.js makeIo, PLAN §6.1).
 *
 * EXPORTS
 *   VERSION                       '2.1.0'
 *   MARKETS                       app-store-scraper 0.18 constants.markets (115 storefronts, verbatim)
 *   SCRAPER_CATEGORIES            the 70 genre ids app-store-scraper validate() accepts (any other truthy id -> SMAR 500)
 *   IOS_CATEGORIES                sar-frontend topListCategories.js iosCategories (prod 3a2b10e == probe d8dba57):
 *                                 [{code:''|id, name, csvName}] -- "No Category" + 41 genres
 *   COLLECTIONS                   {code: {name, device, uiGenres:[code...] (frontend per-collection list, '' = No Category),
 *                                  expectedRows:50|110|0, live:true|false|'genre_only', genreIgnored?:true}}  (13 codes)
 *   CHART_COLUMNS                 the 32-column chart header (31 cleanApp-derived columns + dateScraped), SMAR order
 *   normalizeChartInput(collection, genre) -> {ok, collection, genreRaw, genreNum (0 = all), genreSeg ('/genre=N'|''),
 *                                 categoryName (frontend csvName, '' or 'null' as the frontend builds it),
 *                                 uiOffered, knownDead:{reason}|null, smar500:{code,detail}|null, warnings:[]}
 *   chartStorefront(cc, {compat, storefront}) -> {sf, source:'markets'|'storefronts'|'us_fallback'|'country_path', fallback}
 *   chartReq(collection, genre, cc, {compat, alt, storefront}) -> {url, headers:{}, bucket, kind:'CHART_RSS'|'CHART_RSS_ALT'}
 *                                 SMAR form: http://ax.itunes.apple.com/.../RSS/<coll>/<'/genre=N'|''>/limit=50/json?s=<sf>
 *                                 (double slash in BOTH cases; plain http -- https on ax.itunes fails TLS, ios-charts-08)
 *                                 alt form:  https://itunes.apple.com/<cc>/rss/<coll>/limit=50[/genre=N]/json (real store)
 *   chartLookupReq(ids, cc)       -> {url, headers:{}, bucket:'itunes_api', kind:'LOOKUP_ID'}
 *                                 exactly common.lookup: https://itunes.apple.com/lookup?id=<ids>&country=<CC>&entity=software
 *   parseChartRss(body)           -> {ok, kind:'list'|'one'|'empty', entries[], ids[], bundleIds[], genreIds[],
 *                                  feedUpdated, feedId, feedTitle, malformed:[index], noId:[index], error?}
 *                                 malformed = entry/id/attributes missing (SMAR: TypeError -> 500); noId = attributes
 *                                 present but no im:id (SMAR sends an empty slot `id=1,,3` in its lookup; no 500)
 *   parseChartLookup(body)        -> {ok, raw[] (software only, Apple order), resultCount, otherKinds[], error?}
 *   cleanApp(raw)                 app-store-scraper 0.18 lib/common.js cleanApp, verbatim (key order = CSV column order)
 *   smarNumWould500(num, nRows)   listController's `toplist = toplist.slice(..)` on a const, with its exact JS semantics
 *   buildChart(rss, lookup, {compat, num, cc}) -> {rows (cleanApp objects), raw[], rssIds[], lookupIds[], dropped[],
 *                                  orderEqual, rankOrdered, smar500:{code,detail}|null, stop:{code,sentence}|null, notes[]}
 *   crossCheckRss(entries, raw, {sameStore}) -> {rowsChecked, sameStore, hard:{col:n}, soft:{col:n}, notCrossCheckable:{col:n},
 *                                  items:[{appId, id, col, rss, lookup, level}]}  (hard: appId, developerId, price (same
 *                                  storefront only); soft: currency, appName, developer, primaryGenreId -- same storefront only)
 *   rankCrossCheck(ids, altIds)   -> {n, nAlt, shared, samePos, top10Same, equal}
 *   chartFileName(collection, genre, cc, now) -> SMAR download name <collection><categoryName><CC>_<M><D><YYYY>.csv (UTC)
 *   predictChart({collection, genre, cc, compat, num}) -> {smar500, knownDead, storefront, warnings} (no network)
 *   runChart(io, {collection, genre, country, compat, num, storefront, alt}) -> Promise<result>
 *                                 result = {ok, kind, rows, raw, req, lookupReq, altReq, rss:{ids, feedUpdated, kind},
 *                                  dropped, orderEqual, smar500, stop, storefront, rankCrossCheck, rssCheck, compatReasons[],
 *                                  warnings[], requests:{rss, lookup, alt}, smarFallback?}
 *                                 smarFallback (default mode, CC outside MARKETS): {storefront 143441, usChartRows,
 *                                  smarRows, dropped[], rowsNotInSmarFile, error?} = SMAR's file for this request (the
 *                                  US-ranked chart looked up in CC; +1 feed +1 lookup, SMAR's exact URLs)
 *                                 Never writes files and never renders CSV: the rows go to as_writer (layout 'chart').
 *                                 Request plan: 1 RSS + 1 lookup (+1 alt feed in default mode / alt!==false) -- PLAN §5.2;
 *                                 default mode outside MARKETS: +1 SMAR feed (kind CHART_RSS_SMAR) +1 lookup (smarFallback).
 *                                 default mode: +1 single-id lookup for relevant feed ids the batch lookup left out
 *                                 (relevance: fewer than keep batch-present feed ids rank above the id; at most 10,
 *                                 rank order; stress FI-08): result.relookup {omitted, tried, found[], notFound[],
 *                                 failed[], skipped, unavailable, relevant[], outside[] (not looked up: smarWouldDrop
 *                                 reason not_in_batch_lookup)}; found ids become rows and
 *                                 smarOnlyDrop (SMAR never retries); more than 10 relevant omissions -> STOP
 *                                 lookup_incomplete; a failed relevant single lookup -> STOP lookup_failed.
 *   summarizeChart(result)        -> {chart:{collection, genre, categoryName, rssRows, rows, dropped, feedUpdated,
 *                                  rankCrossCheck, rssCheck}, storefront, storefrontSource, smarWouldDrop:{count, items},
 *                                  compatReasons[], warnings[], smarChartWouldHttp500?, STOP?}  (the §6.3 chart slice)
 *
 * SMAR FACTS ENCODED (evidence ids from eval/appstore/workflow_result.json)
 *   - num is never passed to list(): Apple is always asked limit=50; top* feeds give 50, new* feeds give 110 and ignore
 *     the genre (ios-charts-04/08). No slice ever happens unless ?num= is sent (the UI never sends it).
 *   - Storefront = MARKETS[CC] || 143441; the lookup uses CC as sent. 108 of 222 UI countries fall back to the US chart
 *     filtered to CC (KZ/MA: 35 rows); a CC with no store makes the lookup 400 -> SMAR 500 (AQ) (ios-charts-02).
 *   - feed.entry missing -> `undefined.map` TypeError -> 500 (topmacapps always; topgrossingmacapps/toppaidmacapps with
 *     no category) (ios-charts-03); feed.entry a single object -> `.map is not a function` -> 500.
 *   - A genre id outside constants.category -> validate() throws -> 500; Number('all')/Number('') -> no genre.
 *   - Rows = lookup results (wrapperType software or absent) in Apple's order (== request order == rank in 11/11).
 *   - Every lookup failure (>=400, bad JSON) -> 500 (SMAR has no retries). 0 lookup results -> 200 + `"dateScraped"`.
 */
(function (root, factory) {
  // source(): the full module text for the browser fingerprint (browser_driver.js), not just the exported surface
  const m = Object.assign(factory(), { source: () => String(factory) });
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.SMAR_AS_CHART = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = '2.1.0';

  // app-store-scraper 0.18 lib/constants.js markets (115), verbatim values
  const MARKETS = { DZ: 143563, AO: 143564, AI: 143538, AR: 143505, AM: 143524, AU: 143460, AT: 143445, AZ: 143568, BH: 143559, BB: 143541, BY: 143565, BE: 143446, BZ: 143555, BM: 143542, BO: 143556, BW: 143525, BR: 143503, VG: 143543, BN: 143560, BG: 143526, CA: 143455, KY: 143544, CL: 143483, CN: 143465, CO: 143501, CR: 143495, HR: 143494, CY: 143557, CZ: 143489, DK: 143458, DM: 143545, EC: 143509, EG: 143516, SV: 143506, EE: 143518, FI: 143447, FR: 143442, DE: 143443, GB: 143444, GH: 143573, GR: 143448, GD: 143546, GT: 143504, GY: 143553, HN: 143510, HK: 143463, HU: 143482, IS: 143558, IN: 143467, ID: 143476, IE: 143449, IL: 143491, IT: 143450, JM: 143511, JP: 143462, JO: 143528, KE: 143529, KR: 143466, KW: 143493, LV: 143519, LB: 143497, LT: 143520, LU: 143451, MO: 143515, MK: 143530, MG: 143531, MY: 143473, ML: 143532, MT: 143521, MU: 143533, MX: 143468, MS: 143547, NP: 143484, NL: 143452, NZ: 143461, NI: 143512, NE: 143534, NG: 143561, NO: 143457, OM: 143562, PK: 143477, PA: 143485, PY: 143513, PE: 143507, PH: 143474, PL: 143478, PT: 143453, QA: 143498, RO: 143487, RU: 143469, SA: 143479, SN: 143535, SG: 143464, SK: 143496, SI: 143499, ZA: 143472, ES: 143454, LK: 143486, SR: 143554, SE: 143456, CH: 143459, TW: 143470, TZ: 143572, TH: 143475, TN: 143536, TR: 143480, UG: 143537, UA: 143492, AE: 143481, US: 143441, UY: 143514, UZ: 143566, VE: 143502, VN: 143471, YE: 143571 };
  const US_STORE = 143441;

  // app-store-scraper 0.18 constants.category values (validate() accepts only these)
  const SCRAPER_CATEGORIES = [6018, 6000, 6022, 6017, 6016, 6015, 6023, 6014, 7001, 7002, 7003, 7004, 7005, 7006, 7007, 7008, 7009, 7011, 7012, 7013, 7014, 7015, 7016, 7017, 7018, 7019, 6013, 6012, 6021, 13007, 13006, 13008, 13009, 13010, 13011, 13012, 13013, 13014, 13015, 13002, 13017, 13018, 13003, 13019, 13020, 13021, 13001, 13004, 13023, 13024, 13025, 13026, 13027, 13005, 13028, 13029, 13030, 6020, 6011, 6010, 6009, 6008, 6007, 6006, 6024, 6005, 6004, 6003, 6002, 6001];

  // sar-frontend src/constants/topListCategories.js (production 3a2b10e; identical to the probe copy d8dba57)
  const IOS_CATEGORIES = [
    { code: '', name: 'No Category', csvName: '' },
    { name: 'Books', code: 6018, csvName: 'BOOKS' }, { name: 'Business', code: 6000, csvName: 'BUSINESS' },
    { name: 'Education', code: 6017, csvName: 'EDUCATION' }, { name: 'Entertainment', code: 6016, csvName: 'ENTERTAINMENT' },
    { name: 'Finance', code: 6015, csvName: 'FINANCE' }, { name: 'Food and Drink', code: 6023, csvName: 'FOOD_AND_DRINK' },
    { name: 'Games', code: 6014, csvName: 'GAMES' }, { name: 'Action Games', code: 7001, csvName: 'GAMES_ACTION' },
    { name: 'Adventure Games', code: 7002, csvName: 'GAMES_ADVENTURE' }, { name: 'Arcade Games', code: 7003, csvName: 'GAMES_ARCADE' },
    { name: 'Board Games', code: 7004, csvName: 'GAMES_BOARD' }, { name: 'Card Games', code: 7005, csvName: 'GAMES_CARD' },
    { name: 'Casino Games', code: 7006, csvName: 'GAMES_CASINO' }, { name: 'Dice Games', code: 7007, csvName: 'GAMES_DICE' },
    { name: 'Educational Games', code: 7008, csvName: 'GAMES_EDUCATIONAL' }, { name: 'Family Games', code: 7009, csvName: 'GAMES_FAMILY' },
    { name: 'Music Games', code: 7011, csvName: 'GAMES_MUSIC' }, { name: 'Puzzle Games', code: 7012, csvName: 'GAMES_PUZZLE' },
    { name: 'Racing Games', code: 7013, csvName: 'GAMES_RACING' }, { name: 'Role Playing Games', code: 7014, csvName: 'GAMES_ROLE_PLAYING' },
    { name: 'Simulation Games', code: 7015, csvName: 'GAMES_SIMULATION' }, { name: 'Sports Games', code: 7016, csvName: 'GAMES_SPORTS' },
    { name: 'Strategy Games', code: 7017, csvName: 'GAMES_STRATEGY' }, { name: 'Trivia Games', code: 7018, csvName: 'GAMES_TRIVIA' },
    { name: 'Word Games', code: 7019, csvName: 'GAMES_WORD' }, { name: 'Health and Fitness', code: 6013, csvName: 'HEALTH_AND_FITNESS' },
    { name: 'Lifestyle', code: 6012, csvName: 'LIFESTYLE' }, { name: 'Magazines and Newspapers', code: 6021, csvName: 'MAGAZINES_AND_NEWSPAPERS' },
    { name: 'Medical', code: 6020, csvName: 'MEDICAL' }, { name: 'Music', code: 6011, csvName: 'MUSIC' },
    { name: 'Navigation', code: 6010, csvName: 'NAVIGATION' }, { name: 'News', code: 6009, csvName: 'NEWS' },
    { name: 'Photo and Video', code: 6008, csvName: 'PHOTO_AND_VIDEO' }, { name: 'Productivity', code: 6007, csvName: 'PRODUCTIVITY' },
    { name: 'Reference', code: 6006, csvName: 'REFERENCE' }, { name: 'Shopping', code: 6024, csvName: 'SHOPPING' },
    { name: 'Social Networking', code: 6005, csvName: 'SOCIAL_NETWORKING' }, { name: 'Sports', code: 6004, csvName: 'SPORTS' },
    { name: 'Travel', code: 6003, csvName: 'TRAVEL' }, { name: 'Utilities', code: 6002, csvName: 'UTILITIES' },
    { name: 'Weather', code: 6001, csvName: 'WEATHER' },
  ];
  const without = (names) => IOS_CATEGORIES.filter((c) => !names.includes(c.csvName)).map((c) => c.code);
  const TOPMAC_EXCLUDED = ['', 'BOOKS', 'BUSINESS', 'EDUCATION', 'ENTERTAINMENT', 'FINANCE', 'FOOD_AND_DRINK', 'GAMES_CASINO', 'GAMES_DICE', 'GAMES_EDUCATIONAL', 'GAMES_RACING', 'GAMES_ROLE_PLAYING', 'GAMES_SPORTS', 'GAMES_TRIVIA', 'HEALTH_AND_FITNESS', 'LIFESTYLE', 'MEDICAL', 'MUSIC', 'NEWS', 'NAVIGATION', 'PHOTO_AND_VIDEO', 'PRODUCTIVITY', 'REFERENCE', 'SPORTS', 'SOCIAL_NETWORKING', 'SHOPPING', 'UTILITIES', 'WEATHER', 'MAGAZINES_AND_NEWSPAPERS'];
  const STD = without(['GAMES_EDUCATIONAL', 'GAMES_DICE']);
  const STD_NO_ALL = without(['', 'GAMES_EDUCATIONAL', 'GAMES_DICE']);
  // live: true = rows for every UI genre; 'genre_only' = empty (SMAR 500) with No Category; false = always empty (500).
  // The UI still sends category='' for the Mac collections that drop "No Category" (ios-charts-03).
  const COLLECTIONS = {
    topmacapps: { name: 'Top Mac Apps', device: 'MAC', uiGenres: without(TOPMAC_EXCLUDED), expectedRows: 0, live: false },
    topfreemacapps: { name: 'Top Free Mac Apps', device: 'MAC', uiGenres: STD, expectedRows: 50, live: true },
    topgrossingmacapps: { name: 'Top Grossing Mac Apps', device: 'MAC', uiGenres: STD_NO_ALL, expectedRows: 50, live: 'genre_only' },
    toppaidmacapps: { name: 'Top Paid Mac Apps', device: 'MAC', uiGenres: STD_NO_ALL, expectedRows: 50, live: 'genre_only' },
    newapplications: { name: 'New iOS Apps', device: 'IOS', uiGenres: [''], expectedRows: 110, live: true, genreIgnored: true },
    newfreeapplications: { name: 'New Free iOS Apps', device: 'IOS', uiGenres: [''], expectedRows: 110, live: true, genreIgnored: true },
    newpaidapplications: { name: 'New Paid iOS Apps', device: 'IOS', uiGenres: [''], expectedRows: 110, live: true, genreIgnored: true },
    topfreeapplications: { name: 'Top Free iOS Apps', device: 'IOS', uiGenres: STD, expectedRows: 50, live: true },
    toppaidapplications: { name: 'Top Paid iOS Apps', device: 'IOS', uiGenres: STD, expectedRows: 50, live: true },
    topgrossingapplications: { name: 'Top Grossing iOS Apps', device: 'IOS', uiGenres: STD, expectedRows: 50, live: true },
    topfreeipadapplications: { name: 'Top Free iPad Apps', device: 'IPAD', uiGenres: STD, expectedRows: 50, live: true },
    toppaidipadapplications: { name: 'Top Paid iPad Apps', device: 'IPAD', uiGenres: STD, expectedRows: 50, live: true },
    topgrossingipadapplications: { name: 'Top Grossing iPad Apps', device: 'IPAD', uiGenres: STD, expectedRows: 50, live: true },
  };

  const CHART_COLUMNS = ['id', 'appId', 'appName', 'url', 'icon', 'genres', 'genreIDs', 'primaryGenre', 'primaryGenreId', 'contentRating', 'supportedLanguages', 'appSizeInBytes', 'requiredOsVersion', 'originalReleaseDate', 'lastUpdated', 'releaseNotes', 'currentAppVersion', 'price', 'currency', 'developerId', 'developer', 'developerAppStorePageURL', 'developerWebsite', 'avgRating', 'totalReviews', 'currentVersionAvgRating', 'currentVersionReviews', 'appScreenshots', 'appIpadScreenshots', 'appletvScreenshots', 'supportedDeviceList', 'dateScraped'];

  // app-store-scraper 0.18 lib/common.js cleanApp, verbatim
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

  const ccUpper = (cc) => String(cc == null || cc === '' ? 'US' : cc).toUpperCase();

  // ---------- inputs ----------
  // genre: number, numeric string, '' / 'all' / null (= No Category). SMAR does Number(req.query.category).
  function normalizeChartInput(collection, genre) {
    const warnings = [];
    const c = COLLECTIONS[collection];
    const genreRaw = genre == null || String(genre).toLowerCase() === 'all' ? '' : String(genre);
    const n = Number(genreRaw); // Number('') = 0; Number('abc') = NaN -> both falsy -> no genre, exactly as SMAR
    const genreNum = n ? n : 0;
    const genreSeg = genreNum ? `/genre=${genreNum}` : '';
    const out = { ok: true, collection, genreRaw, genreNum, genreSeg, categoryName: '', uiOffered: false, knownDead: null, smar500: null, warnings };
    if (!c) {
      out.ok = false;
      out.smar500 = { code: 'invalid_collection', detail: `app-store-scraper validate(): Invalid collection ${collection}` };
      return out;
    }
    if (genreRaw !== '' && !genreNum) warnings.push({ code: 'genre_not_numeric', detail: `Number(${JSON.stringify(genreRaw)}) is falsy: SMAR treats it as No Category` });
    if (genreNum && !SCRAPER_CATEGORIES.includes(genreNum)) {
      out.ok = false;
      out.smar500 = { code: 'invalid_category', detail: `app-store-scraper validate(): Invalid category ${genreNum}` };
    }
    // frontend: getIosCategoryByCode(iosCategoriesByCollection[collection] ?? iosCategories, category)
    const code = genreNum ? genreNum : '';
    const list = c.uiGenres;
    out.uiOffered = list.includes(code);
    if (code === '') out.categoryName = ''; // the UI sends category='' even where "No Category" is not listed (Mac)
    else {
      const e = IOS_CATEGORIES.find((x) => x.code === code);
      out.categoryName = out.uiOffered && e ? e.csvName : 'null'; // String(null) via concat, as the frontend would build it
    }
    if (!out.uiOffered) warnings.push({ code: 'ui_not_offered', detail: `SMAR's UI does not offer genre ${code === '' ? 'No Category' : code} for ${collection}` });
    if (c.genreIgnored && genreNum) warnings.push({ code: 'genre_ignored_by_feed', detail: `${collection} ignores the genre: Apple returns the all-genre feed (110 rows)` });
    if (c.live === false) out.knownDead = { reason: `${collection} is empty on Apple's legacy feed for every genre (SMAR answers HTTP 500)` };
    else if (c.live === 'genre_only' && !genreNum) out.knownDead = { reason: `${collection} with No Category is empty on Apple's legacy feed (SMAR answers HTTP 500); pick a genre` };
    return out;
  }

  function chartStorefront(cc, opts) {
    opts = opts || {};
    const CC = ccUpper(cc);
    if (opts.compat) {
      // common.storeId(): (countryCode && markets[countryCode.toUpperCase()]) || '143441'
      if (MARKETS[CC]) return { sf: MARKETS[CC], source: 'markets', fallback: false };
      return { sf: US_STORE, source: 'us_fallback', fallback: true };
    }
    if (opts.storefront) return { sf: Number(opts.storefront), source: 'storefronts', fallback: false };
    if (MARKETS[CC]) return { sf: MARKETS[CC], source: 'markets', fallback: false };
    return { sf: null, source: 'country_path', fallback: false }; // real store via itunes.apple.com/<cc>/rss (ios-charts-02)
  }

  function chartReq(collection, genre, cc, opts) {
    opts = opts || {};
    const g = normalizeChartInput(collection, genre);
    const CC = ccUpper(cc);
    const sf = chartStorefront(CC, opts);
    if (opts.alt || sf.source === 'country_path') {
      const seg = g.genreNum ? `/genre=${g.genreNum}` : '';
      return { url: `https://itunes.apple.com/${CC.toLowerCase()}/rss/${collection}/limit=50${seg}/json`, headers: {}, bucket: 'apple_other', kind: opts.alt ? 'CHART_RSS_ALT' : 'CHART_RSS', storefront: sf };
    }
    // app-store-scraper list.js: `.../RSS/${opts.collection}/${category}/limit=${opts.num}/json?s=${storeId}` with
    // category = '/genre=N' or '' -> a double slash in both cases; opts.num is always 50 (listController never passes num)
    return { url: `http://ax.itunes.apple.com/WebObjects/MZStoreServices.woa/ws/RSS/${collection}/${g.genreSeg}/limit=50/json?s=${sf.sf}`, headers: {}, bucket: 'apple_other', kind: 'CHART_RSS', storefront: sf };
  }

  function chartLookupReq(ids, cc) {
    return { url: `https://itunes.apple.com/lookup?id=${ids.join(',')}&country=${cc}&entity=software`, headers: {}, bucket: 'itunes_api', kind: 'LOOKUP_ID' };
  }

  // ---------- parsers ----------
  function parseChartRss(body) {
    let j;
    try { j = typeof body === 'string' ? JSON.parse(body) : body; } catch (e) { return { ok: false, kind: 'empty', entries: [], ids: [], bundleIds: [], genreIds: [], malformed: [], error: { code: 'bad_json', message: String(e && e.message) } }; }
    const feed = j && j.feed;
    if (!feed || typeof feed !== 'object') return { ok: false, kind: 'empty', entries: [], ids: [], bundleIds: [], genreIds: [], malformed: [], error: { code: 'endpoint_drift', message: 'no feed object' } };
    const e = feed.entry;
    const kind = e === undefined ? 'empty' : Array.isArray(e) ? 'list' : 'one';
    const entries = e === undefined ? [] : Array.isArray(e) ? e : [e];
    const malformed = [];
    const noId = [];
    const ids = entries.map((x, i) => {
      if (!x || !x.id || !x.id.attributes) { malformed.push(i); return undefined; } // app.id.attributes -> TypeError
      const id = x.id.attributes['im:id'];
      if (id == null) noId.push(i);
      return id;
    });
    const lbl = (o) => (o && o.label !== undefined ? o.label : undefined);
    return {
      ok: true, kind, entries, ids,
      bundleIds: entries.map((x) => x && x.id && x.id.attributes && x.id.attributes['im:bundleId']),
      genreIds: entries.map((x) => x && x.category && x.category.attributes && x.category.attributes['im:id']),
      feedUpdated: lbl(feed.updated), feedId: lbl(feed.id), feedTitle: lbl(feed.title), malformed, noId,
    };
  }

  function parseChartLookup(body) {
    let j;
    try { j = typeof body === 'string' ? JSON.parse(body) : body; } catch (e) { return { ok: false, raw: [], error: { code: 'bad_json', message: String(e && e.message) } }; }
    if (!j || !Array.isArray(j.results)) return { ok: false, raw: [], error: { code: 'endpoint_drift', message: 'lookup: no results[]' } };
    // common.lookup: results.filter(app => typeof app.wrapperType === 'undefined' || app.wrapperType === 'software')
    const raw = j.results.filter((a) => typeof a.wrapperType === 'undefined' || a.wrapperType === 'software');
    const otherKinds = j.results.filter((a) => !(typeof a.wrapperType === 'undefined' || a.wrapperType === 'software')).map((a) => a.wrapperType);
    return { ok: true, raw, resultCount: j.resultCount, otherKinds };
  }

  // listController: num = req.query.num ? req.query.num : 200; numAppsToFetch = num && num < 200 ? num : 200;
  // if (toplist.length > numAppsToFetch) toplist = toplist.slice(..)  -> TypeError (const) -> HTTP 500.
  // `num` arrives as a query STRING; the comparisons below are the same JS coercions SMAR performs.
  function smarNumWould500(num, nRows) {
    if (num === undefined || num === null) return false;
    const MAX_APPS_COUNT = 200;
    const q = String(num);
    const n = q ? q : MAX_APPS_COUNT;
    const numAppsToFetch = n && n < MAX_APPS_COUNT ? n : MAX_APPS_COUNT;
    return nRows > numAppsToFetch;
  }

  // ---------- assembly ----------
  // rss = parseChartRss(..), lookup = parseChartLookup(..) or null when the lookup was not made / failed.
  function buildChart(rss, lookup, opts) {
    opts = opts || {};
    const compat = !!opts.compat;
    const notes = [];
    const res = { rows: [], raw: [], rssIds: rss ? rss.ids.filter((x) => x != null).map(String) : [], lookupIds: [], dropped: [], orderEqual: null, rankOrdered: false, smar500: null, stop: null, notes };
    if (!rss || !rss.ok) {
      res.smar500 = { code: 'rss_unparseable', detail: (rss && rss.error && rss.error.message) || 'no feed' };
      res.stop = { code: 'endpoint_drift', sentence: "Apple's chart feed did not return a readable feed, so the chart cannot be built." };
      return res;
    }
    if (rss.kind === 'empty') {
      res.smar500 = { code: 'empty_feed', detail: "feed.entry is missing: list.js calls results.feed.entry.map -> TypeError" };
      res.stop = { code: 'empty_chart', sentence: "Apple's feed for this chart is empty, so there are no rows (SMAR answers an error for this chart)." };
      return res;
    }
    if (rss.kind === 'one') {
      res.smar500 = { code: 'one_entry_feed', detail: 'feed.entry is a single object: apps.map is not a function' };
      if (compat) { res.stop = { code: 'smar_http500', sentence: 'SMAR answers an error for this chart (its feed has a single entry), so there is no SMAR file.' }; return res; }
      notes.push('one_entry_feed: default mode writes the single row');
    }
    if (rss.malformed.length) {
      res.smar500 = { code: 'malformed_entry', detail: `entry without id.attributes at ${rss.malformed.slice(0, 5).join(',')}: SMAR's cleanApp/ids map throws` };
      res.stop = { code: 'endpoint_drift', sentence: "Apple's chart feed has entries without an app id; the chart cannot be read reliably." };
      return res;
    }
    if (rss.noId && rss.noId.length) notes.push(`rss_entry_without_id at ${rss.noId.slice(0, 5).join(',')}: ${compat ? "SMAR's lookup URL carries an empty id slot" : 'skipped in the lookup'}`);
    if (!lookup || !lookup.ok) {
      res.smar500 = { code: 'lookup_failed', detail: (lookup && lookup.error && lookup.error.message) || 'lookup failed' };
      res.stop = { code: 'lookup_failed', sentence: 'The app details lookup for this chart failed, so the chart cannot be built.' };
      return res;
    }
    let raw = lookup.raw.slice();
    res.lookupIds = raw.map((a) => String(a.trackId));
    const inLookup = new Set(res.lookupIds);
    res.dropped = res.rssIds.filter((id) => !inLookup.has(id)).map((id) => ({ appId: id, stage: 'chart_lookup', reason: 'not_in_storefront' }));
    const rssAvail = res.rssIds.filter((id) => inLookup.has(id));
    res.orderEqual = JSON.stringify(rssAvail) === JSON.stringify(res.lookupIds);
    if (!compat) {
      // default: rank order, one row per id (SMAR uses lookup order; identical on every recorded run)
      const pos = new Map();
      res.rssIds.forEach((id, i) => { if (!pos.has(id)) pos.set(id, i); });
      const seen = new Set();
      raw = raw.filter((a) => { const k = String(a.trackId); if (seen.has(k) || !pos.has(k)) return false; seen.add(k); return true; });
      if (!res.orderEqual) { raw.sort((a, b) => pos.get(String(a.trackId)) - pos.get(String(b.trackId))); res.rankOrdered = true; notes.push('lookup_order_differs: default rows re-ordered to the feed rank'); }
      if (raw.length !== lookup.raw.length) notes.push(`default dropped ${lookup.raw.length - raw.length} duplicate/unrequested lookup results`);
    }
    if (compat && smarNumWould500(opts.num, raw.length)) {
      res.smar500 = { code: 'num_below_rows', detail: `num=${opts.num} < ${raw.length} rows: listController reassigns a const toplist -> TypeError` };
      res.stop = { code: 'smar_http500', sentence: `SMAR answers an error when fewer rows (${opts.num}) than the chart holds (${raw.length}) are requested, so there is no SMAR file.` };
      return res;
    }
    if (!compat && opts.num != null && Number(opts.num) > 0) {
      const n = Math.floor(Number(opts.num));
      if (n < raw.length) raw = raw.slice(0, n);
      else if (n > raw.length) notes.push(`num ${n} exceeds the ${raw.length} rows the chart holds`);
    }
    res.raw = raw;
    res.rows = raw.map(cleanApp);
    if (!res.rows.length) {
      // SMAR: toplist = [] -> HTTP 200; jsonToCsv([]) = '"dateScraped"' (13 bytes)
      if (compat) notes.push('zero_rows: SMAR writes the 13-byte file "dateScraped"');
      else res.stop = { code: 'no_results', sentence: `None of this chart's apps are available in the ${opts.cc || 'requested'} store.` };
    }
    return res;
  }

  // ---------- cross-checks (C4) ----------
  // Every row against its own RSS entry. Calibrated offline on every recorded feed+lookup pair (35 pairs, 2,050 rows,
  // eval/appstore/build_notes/chart.md): with the feed storefront == the lookup storefront, appId, developerId, currency,
  // appName, developer, price and primaryGenreId agreed on 100% of rows; originalReleaseDate disagreed on ~23% (the
  // feed carries a different date), so it is not checked. With the US-fallback storefront (KZ/MA), currency (35/35)
  // and appName (9/35) legitimately differ, so only the identity fields are compared there.
  // HARD = identity (a failure means the lookup answered for a different app): appId, developerId; and price (100% agreement
  // on the same storefront, so a miss is a moved or rescaled value, stress FI-01).
  // SOFT = same-store only, informative (the feed and the lookup are built from different snapshots): the rest.
  const RSS_FIELDS = [
    // [csvColumn, level, rssGetter, lookupGetter, sameStoreOnly]
    ['appId', 'hard', (e) => e.id && e.id.attributes && e.id.attributes['im:bundleId'], (a) => a.bundleId, false],
    ['developerId', 'hard', (e) => { const h = e['im:artist'] && e['im:artist'].attributes && e['im:artist'].attributes.href; const m = h && /\/id(\d+)/.exec(h); return m ? m[1] : undefined; }, (a) => (a.artistId == null ? undefined : String(a.artistId)), false],
    ['currency', 'soft', (e) => e['im:price'] && e['im:price'].attributes && e['im:price'].attributes.currency, (a) => a.currency, true],
    ['appName', 'soft', (e) => e['im:name'] && e['im:name'].label, (a) => a.trackName, true],
    ['developer', 'soft', (e) => e['im:artist'] && e['im:artist'].label, (a) => a.artistName, true],
    // price: 2,588 of 2,588 corpus rows agree (as_checks gates price@rss hard since stress FI-01)
    ['price', 'hard', (e) => { const v = e['im:price'] && e['im:price'].attributes && e['im:price'].attributes.amount; return v == null ? undefined : parseFloat(v); }, (a) => a.price, true],
    ['primaryGenreId', 'soft', (e) => e.category && e.category.attributes && e.category.attributes['im:id'], (a) => (a.primaryGenreId == null ? undefined : String(a.primaryGenreId)), true],
  ];
  // opts.sameStore: false when the feed came from another storefront than the lookup country (compat US fallback)
  function crossCheckRss(entries, raw, opts) {
    const sameStore = !(opts && opts.sameStore === false);
    const byId = new Map();
    (entries || []).forEach((e) => { const id = e && e.id && e.id.attributes && e.id.attributes['im:id']; if (id != null && !byId.has(String(id))) byId.set(String(id), e); });
    const out = { rowsChecked: 0, sameStore, hard: {}, soft: {}, notCrossCheckable: {}, items: [] };
    for (const a of raw || []) {
      const e = byId.get(String(a.trackId));
      if (!e) continue;
      out.rowsChecked++;
      for (const [col, level, rg, lg, sameOnly] of RSS_FIELDS) {
        if (sameOnly && !sameStore) { out.notCrossCheckable[col] = (out.notCrossCheckable[col] || 0) + 1; continue; }
        const rv = rg(e); const lv = lg(a);
        if (rv === undefined || lv === undefined) { out.notCrossCheckable[col] = (out.notCrossCheckable[col] || 0) + 1; continue; } // absent anchor: unverified, not a failure
        if (String(rv) !== String(lv)) {
          out[level][col] = (out[level][col] || 0) + 1;
          out.items.push({ appId: a.bundleId, id: String(a.trackId), col, rss: rv, lookup: lv, level });
        }
      }
    }
    return out;
  }

  function rankCrossCheck(ids, altIds) {
    ids = (ids || []).map(String); altIds = (altIds || []).map(String);
    const s = new Set(altIds);
    let samePos = 0;
    for (let i = 0; i < Math.min(ids.length, altIds.length); i++) if (ids[i] === altIds[i]) samePos++;
    return { n: ids.length, nAlt: altIds.length, shared: ids.filter((x) => s.has(x)).length, samePos, top10Same: ids.slice(0, 10).every((x, i) => x === altIds[i]), equal: JSON.stringify(ids) === JSON.stringify(altIds) };
  }

  // downloadTopChartsCSV: `${query}_${M}${D}${YYYY}.csv` with query = collection + categoryName + country and the
  // date from toLocaleString('en-US') in the server TZ (UTC in production).
  function chartFileName(collection, genre, cc, now) {
    const g = normalizeChartInput(collection, genre);
    const d = now instanceof Date ? now : new Date(now == null ? Date.now() : now);
    return `${collection}${g.categoryName}${ccUpper(cc)}_${d.getUTCMonth() + 1}${d.getUTCDate()}${d.getUTCFullYear()}.csv`;
  }

  // Predictions that need no network.
  function predictChart(o) {
    o = o || {};
    const g = normalizeChartInput(o.collection, o.genre);
    const sf = chartStorefront(o.cc || o.country, { compat: o.compat, storefront: o.storefront });
    const warnings = g.warnings.slice();
    if (o.compat && sf.fallback) warnings.push({ code: 'smar_storefront_fallback', detail: `${ccUpper(o.cc || o.country)} is not in app-store-scraper's markets: SMAR ranks the US chart (s=143441) and looks the apps up in ${ccUpper(o.cc || o.country)}` });
    if (!o.compat && sf.source === 'country_path') warnings.push({ code: 'smar_storefront_fallback', detail: `SMAR would rank the US chart for ${ccUpper(o.cc || o.country)}; this run uses the real ${ccUpper(o.cc || o.country)} chart` });
    if (o.num != null && !o.compat) warnings.push({ code: 'no_smar_equivalent', detail: '--num: SMAR never slices a chart (its UI never sends num)' });
    return { smar500: g.smar500, knownDead: g.knownDead, storefront: sf, warnings, input: g };
  }

  // ---------- orchestration ----------
  async function getJson(io, req) {
    const r = await io.get(req); // io.get never throws on HTTP status; it throws {code} on RATE_LIMITED / NETWORK / REPLAY_MISS
    return r;
  }

  // Default mode (stress FI-08): Apple's batch lookup now and then leaves out an app it does sell; the chart then lost
  // that rank and the next feed app filled the slot, reported as "not_in_storefront". An omitted id is RELEVANT when
  // fewer than keep (--num, else every row) batch-present feed ids rank above it: only those can still reach the file
  // (an app below the requested rows fills one when an app above it turns out not to be sold). As the ids mode does,
  // each relevant id is looked up ON ITS OWN (the same lookup URL with one id, rank order) before it is called missing.
  // Found = a row (SMAR, which never retries, would drop it: smarWouldDrop reason batch_lookup_omitted); not found =
  // not_in_storefront (verified); a failed single lookup = lookup_failed (STOP when relevant, else a warning).
  // compat keeps SMAR's single batch (its file lacks the app). A replay journal without the single lookup (REPLAY_MISS)
  // leaves the id as the batch left it. RATE_LIMITED / DEADLINE propagate (the chart engine re-runs on --resume).
  // More than MAX_RELOOKUP relevant ids is no momentary omission (a batch that came back empty or cut): nothing is
  // looked up and the chart is not built (STOP lookup_incomplete), never a chart silently short of those ranks. When at
  // most MAX_RELOOKUP ids are left out in all, the non-relevant ones are looked up too (verified reasons); otherwise
  // they are not, and smarWouldDrop names them not_in_batch_lookup (unverified, outside the requested rows).
  const MAX_RELOOKUP = 10;
  async function relookupOmitted(io, rss, lookup, cc, result, keep) {
    const have = new Set(lookup.raw.map((a) => String(a.trackId)));
    const missing = [];
    for (const id of rss.ids) if (id != null && !have.has(String(id)) && !missing.includes(String(id))) missing.push(String(id));
    if (!missing.length) return;
    const presentAbove = new Map();
    let present = 0;
    for (const id of rss.ids) {
      if (id == null) continue;
      const key = String(id);
      if (presentAbove.has(key)) continue;
      presentAbove.set(key, present);
      if (have.has(key)) present++;
    }
    const relevant = missing.filter((id) => (presentAbove.get(id) || 0) < keep);
    const outside = missing.filter((id) => !relevant.includes(id));
    result.relookup = { omitted: missing.length, tried: 0, found: [], notFound: [], failed: [], skipped: relevant.length > MAX_RELOOKUP ? relevant.length : 0, outside: [], relevant: relevant.slice() };
    if (relevant.length > MAX_RELOOKUP) return;
    const toLookup = missing.length <= MAX_RELOOKUP ? missing : relevant;
    if (missing.length > MAX_RELOOKUP) result.relookup.outside = outside;
    for (const id of toLookup) {
      let r;
      try { r = await getJson(io, chartLookupReq([id], cc)); } catch (e) {
        if (e && (e.code === 'RATE_LIMITED' || e.code === 'DEADLINE')) throw e;
        if (e && e.code === 'REPLAY_MISS') { result.relookup.unavailable = (result.relookup.unavailable || 0) + 1; continue; }
        r = { status: 0, error: String((e && e.code) || e) };
      }
      result.requests.lookup++; result.relookup.tried++;
      const p = r.status === 200 ? parseChartLookup(r.body) : null;
      const hit = p && p.ok ? p.raw.find((a) => String(a.trackId) === id) : null;
      if (hit) { lookup.raw.push(hit); have.add(id); result.relookup.found.push(id); }
      else if (p && p.ok) result.relookup.notFound.push(id);
      else result.relookup.failed.push({ appId: id, status: r.status });
    }
    if (result.relookup.found.length) result.notes.push(`batch_lookup_omitted: ${result.relookup.found.length} app(s) missing from the batch lookup were found one by one (SMAR, which does not retry, would drop them)`);
    if (result.relookup.failed.length) result.warnings.push({ code: 'chart_relookup_failed', detail: `${result.relookup.failed.length} chart app(s) missing from the batch lookup could not be looked up one by one (${result.relookup.failed.slice(0, 5).map((f) => f.appId + ' HTTP ' + f.status).join(', ')}); they are not rows` });
  }

  async function runChart(io, o) {
    o = o || {};
    const collection = o.collection || 'topfreeapplications';
    const cc = ccUpper(o.country || o.cc);
    const compat = !!o.compat;
    const pred = predictChart({ collection, genre: o.genre, cc, compat, num: o.num, storefront: o.storefront });
    const result = { ok: false, kind: null, rows: [], raw: [], req: null, lookupReq: null, altReq: null, rss: null, dropped: [], orderEqual: null, smar500: pred.smar500, knownDead: pred.knownDead, stop: null, storefront: pred.storefront, rankCrossCheck: null, rssCheck: null, compatReasons: [], warnings: pred.warnings, notes: [], requests: { rss: 0, lookup: 0, alt: 0 }, input: pred.input };
    if (compat && pred.storefront.fallback) result.compatReasons.push({ code: 'smar_storefront_fallback', detail: `s=143441 for ${cc}` });
    if (compat && o.num != null) result.compatReasons.push({ code: 'no_smar_equivalent', detail: "--num: SMAR's UI never sends num" });
    if (!compat && o.num != null) result.compatReasons.push({ code: 'no_smar_equivalent', detail: '--num' });
    if (!COLLECTIONS[collection]) { result.stop = { code: 'usage', sentence: `Unknown chart collection "${collection}".` }; return result; }
    if (pred.smar500 && pred.smar500.code === 'invalid_category') {
      result.stop = { code: compat ? 'smar_http500' : 'usage', sentence: `Genre ${pred.input.genreNum} is not an App Store chart genre SMAR accepts (SMAR answers an error).` };
      if (compat) result.compatReasons.push({ code: 'smar_http500', detail: pred.smar500.detail });
      return result;
    }
    // C1: the feed (known-dead combos are still fetched once: 1 request confirms Apple has not revived them)
    const req = chartReq(collection, pred.input.genreRaw, cc, { compat, storefront: o.storefront });
    result.req = { url: req.url, kind: req.kind, storefront: req.storefront };
    const r = await getJson(io, req); result.requests.rss++;
    if (r.status !== 200) {
      result.smar500 = { code: 'rss_http', detail: `chart feed HTTP ${r.status}` };
      result.stop = { code: r.status === 400 || r.status === 404 ? 'no_storefront' : 'endpoint_drift', sentence: r.status === 400 || r.status === 404 ? `Apple has no chart feed for ${cc}.` : `Apple's chart feed answered HTTP ${r.status}.` };
      if (compat) result.compatReasons.push({ code: 'smar_http500', detail: result.smar500.detail });
      return result;
    }
    const rss = parseChartRss(r.body);
    result.kind = rss.kind;
    result.rss = { ids: rss.ids, kind: rss.kind, feedUpdated: rss.feedUpdated, feedId: rss.feedId, feedTitle: rss.feedTitle, n: rss.ids.length };
    let lookup = null;
    const proceed = rss.ok && rss.kind !== 'empty' && !rss.malformed.length && !(compat && rss.kind === 'one');
    if (proceed) {
      // C3: ONE lookup of every feed id in rank order, CC as sent (SMAR's exact URL; at most 110 ids)
      // compat keeps an entry without im:id as SMAR does (Array#join turns undefined into an empty slot)
      const lreq = chartLookupReq(compat ? rss.ids : rss.ids.filter((x) => x != null), cc);
      result.lookupReq = { url: lreq.url, kind: lreq.kind };
      const L = await getJson(io, lreq); result.requests.lookup++;
      if (L.status === 200) {
        lookup = parseChartLookup(L.body);
        if (!compat && lookup.ok) {
          const keep = o.num != null && Number(o.num) > 0 ? Math.floor(Number(o.num)) : Infinity;
          await relookupOmitted(io, rss, lookup, cc, result, keep);
        }
      } else {
        lookup = { ok: false, raw: [], error: { code: 'lookup_http', message: `lookup HTTP ${L.status}` } };
        if (L.status === 400) {
          result.smar500 = { code: 'lookup_400', detail: `lookup country=${cc} answered HTTP 400 (no App Store for ${cc})` };
          result.stop = { code: 'no_storefront', sentence: `There is no App Store for ${cc} (Apple rejects the country); SMAR answers an error.` };
          if (compat) result.compatReasons.push({ code: 'smar_http500', detail: result.smar500.detail });
          return result;
        }
      }
    }
    const b = buildChart(rss, lookup, { compat, num: o.num, cc });
    if (result.relookup) { // FI-08: what the one-by-one lookups showed about the ids the batch left out
      const failed = new Set(result.relookup.failed.map((f) => f.appId));
      for (const d of b.dropped) if (failed.has(d.appId)) d.reason = 'lookup_failed';
      const outside = new Set(result.relookup.outside || []);
      for (const d of b.dropped) if (outside.has(d.appId)) d.reason = 'not_in_batch_lookup';
      result.smarOnlyDrop = result.relookup.found.map((id) => ({ appId: id, stage: 'chart_lookup', reason: 'batch_lookup_omitted' }));
      // an app inside the requested ranks whose details could not be fetched at all: the file would silently lose that
      // rank and pull in the next app, so the chart is not built (as when the batch lookup itself fails)
      const relevant = new Set(result.relookup.relevant || []);
      const lost = result.relookup.failed.filter((f) => relevant.has(f.appId));
      if (result.relookup.skipped && !b.stop) {
        const n = rss.ids.filter((x) => x != null).length;
        b.stop = { code: 'lookup_incomplete', sentence: `Apple's batch lookup returned only ${n - result.relookup.omitted} of this chart's ${n} apps (${result.relookup.skipped} left-out apps could reach the requested rows, more than the ${MAX_RELOOKUP} this skill looks up one by one), so the chart cannot be built reliably; try again later.` };
      } else if (lost.length && !b.stop) {
        b.stop = { code: 'lookup_failed', sentence: `The app details of ${lost.length} chart app(s) (rank ${lost.slice(0, 5).map((f) => rss.ids.map(String).indexOf(f.appId) + 1).join(', ')}) could not be fetched after retries (Apple's batch lookup left them out and the single lookup answered HTTP ${lost[0].status}), so the chart cannot be built completely; try again later.` };
      }
    }
    // default mode, the country's own chart: a lookup that answers none of the apps the feed lists is no availability
    // question (the feed for this storefront lists apps sold there): records that carry none of the feed's ids are a
    // changed lookup layout (ids moved, records wrapped), no records at all a failing lookup. The availability sentence
    // misdirected the user (stress regression: trackId swapped with any numeric field, results wrapped or emptied).
    if (b.stop && b.stop.code === 'no_results' && !compat && !pred.storefront.fallback && lookup && lookup.ok && rss && rss.ok) {
      const n = rss.ids.filter((x) => x != null).length;
      b.stop = lookup.raw.length
        ? { code: 'endpoint_drift', sentence: `Apple's app lookup answered for this chart, but none of its ${lookup.raw.length} record(s) carries the id of one of the ${n} apps the chart feed lists (the lookup changed shape), so the chart cannot be built; tell the user and do not deliver.` }
        : { code: 'lookup_incomplete', sentence: `Apple's app lookup returned none of the ${n} apps that its ${cc} chart feed lists (a failing or changed lookup, not the apps' availability), so the chart cannot be built; try again later.` };
    }
    result.rows = b.rows; result.raw = b.raw; result.dropped = b.dropped; result.orderEqual = b.orderEqual; result.notes.push(...b.notes);
    if (b.smar500) result.smar500 = b.smar500;
    if (b.stop) {
      result.stop = b.stop;
      if (b.stop.code === 'empty_chart' && pred.knownDead) result.stop.sentence = pred.knownDead.reason.replace(/ \(SMAR answers HTTP 500\)/, '') + '; SMAR answers an error for this chart.';
      if (compat && b.smar500) result.compatReasons.push({ code: 'smar_http500', detail: b.smar500.detail });
      return result;
    }
    if (b.smar500 && b.smar500.code === 'one_entry_feed') result.warnings.push({ code: 'smar_http500', detail: 'SMAR answers an error for a one-entry feed' });
    // C4: every row against its RSS entry; the country-path feed as an informative rank check (1 request)
    result.rssCheck = crossCheckRss(rss.entries, b.raw, { sameStore: !pred.storefront.fallback });
    if (o.alt !== false && rss.kind === 'list') {
      const areq = chartReq(collection, pred.input.genreRaw, cc, { alt: true });
      if (areq.url !== req.url) {
        result.altReq = { url: areq.url, kind: areq.kind };
        try {
          const A = await getJson(io, areq); result.requests.alt++;
          if (A.status === 200) {
            const ap = parseChartRss(A.body);
            if (ap.ok) { result.rankCrossCheck = rankCrossCheck(rss.ids, ap.ids); result.rankCrossCheck.feedUpdated = ap.feedUpdated; result.rankCrossCheck.altIsRealStore = pred.storefront.fallback; }
          } else result.rankCrossCheck = { error: `alt feed HTTP ${A.status}` };
        } catch (e) {
          if (e && e.code === 'RATE_LIMITED') throw e;
          result.rankCrossCheck = { error: String((e && e.code) || e) };
        }
      }
    }
    // default mode in a country outside app-store-scraper's markets (GE, ...): this run reads that store's own chart,
    // but SMAR ranks the US chart (s=143441) and looks those apps up in CC, silently dropping the ones not sold there.
    // Two requests (SMAR's exact feed + lookup URLs, the ones --smar-compat sends) measure what SMAR's file would be,
    // so the summary says so instead of "matches SMAR" (SE-H, 2026-10-03). Never a value of this file.
    if (!compat && pred.storefront.source === 'country_path' && o.simulateFallback !== false) {
      const sim = { cc, storefront: US_STORE, usChartRows: 0, smarRows: 0, dropped: [], rowsNotInSmarFile: 0 };
      try {
        const sreq = Object.assign(chartReq(collection, pred.input.genreRaw, cc, { compat: true }), { kind: 'CHART_RSS_SMAR' }); // never this run's feed
        const S = await getJson(io, sreq); result.requests.rss++;
        const sp = S.status === 200 ? parseChartRss(S.body) : null;
        if (!sp || !sp.ok || sp.kind !== 'list') sim.error = S.status !== 200 ? `US chart feed HTTP ${S.status}` : 'US chart feed unreadable or not a list';
        else {
          const ids = sp.ids.filter((x) => x != null);
          const SL = await getJson(io, chartLookupReq(ids, cc)); result.requests.lookup++;
          const sl = SL.status === 200 ? parseChartLookup(SL.body) : null;
          if (!sl || !sl.ok) sim.error = `lookup of the US chart in ${cc}: ` + (SL.status !== 200 ? 'HTTP ' + SL.status : 'unreadable');
          else {
            const got = new Set(sl.raw.map((x) => String(x.trackId)));
            sim.usChartRows = ids.length; sim.smarRows = sl.raw.length;
            sim.dropped = ids.filter((id) => !got.has(String(id))).map((id) => ({ appId: id, stage: 'smar_us_chart_lookup', reason: 'not_in_storefront' }));
            const mine = new Set(b.raw.map((x) => String(x.trackId)));
            sim.rowsNotInSmarFile = [...mine].filter((id) => !got.has(id)).length;
          }
        }
      } catch (e) {
        if (e && (e.code === 'RATE_LIMITED' || e.code === 'DEADLINE')) throw e;
        sim.error = String((e && e.code) || e);
      }
      result.smarFallback = sim;
    }
    result.ok = true;
    return result;
  }

  // The chart-specific slice of the §6.3 summary, from a runChart result. Core merges it into its summary.
  function summarizeChart(r, opts) {
    opts = opts || {};
    const inp = r.input || {};
    const out = {
      chart: { collection: inp.collection, genre: inp.genreNum ? inp.genreNum : 'all', categoryName: inp.categoryName, rssRows: r.rss ? r.rss.n : 0, rows: r.rows.length, dropped: r.dropped.length, feedUpdated: r.rss ? r.rss.feedUpdated : undefined, rankCrossCheck: r.rankCrossCheck || null, rssCheck: r.rssCheck ? { rowsChecked: r.rssCheck.rowsChecked, sameStore: r.rssCheck.sameStore, hard: r.rssCheck.hard, soft: r.rssCheck.soft } : null,
        relookup: r.relookup ? { omittedByBatch: r.relookup.omitted, foundOneByOne: r.relookup.found.length, notInStorefront: r.relookup.notFound.length, failed: r.relookup.failed.length, notTried: r.relookup.skipped + (r.relookup.unavailable || 0), outsideRequestedRanks: (r.relookup.outside || []).length } : undefined },
      storefront: r.storefront ? r.storefront.sf : null,
      storefrontSource: r.storefront ? (r.storefront.source === 'storefronts' || r.storefront.source === 'country_path' ? 'storefronts' : 'markets') : null,
      // rows SMAR's file lacks: the ids no lookup returned, plus those only the one-by-one re-lookup found (FI-08)
      smarWouldDrop: { count: r.dropped.length + (r.smarOnlyDrop || []).length, items: r.dropped.concat(r.smarOnlyDrop || []).slice(0, 25) },
      compatReasons: r.compatReasons.slice(),
      warnings: r.warnings.slice(),
    };
    const sim = r.smarFallback;
    if (sim) { // default mode outside SMAR's markets: what SMAR's file would be (US-ranked chart looked up in CC)
      out.smarFallback = sim;
      if (!sim.error) out.smarWouldDrop = { count: sim.dropped.length, items: sim.dropped.slice(0, 25), basis: `SMAR's file: the US-ranked chart (s=${sim.storefront}) looked up in ${sim.cc}: ${sim.smarRows} rows, ${sim.dropped.length} of the US chart's ${sim.usChartRows} apps dropped (not sold here); ${sim.rowsNotInSmarFile} of this file's rows are not in SMAR's file` };
    }
    if (r.smar500) out.smarChartWouldHttp500 = r.smar500;
    if (r.stop) out.STOP = r.stop.sentence;
    return out;
  }

  return {
    VERSION, MARKETS, US_STORE, SCRAPER_CATEGORIES, IOS_CATEGORIES, COLLECTIONS, CHART_COLUMNS, RSS_FIELDS,
    cleanApp, normalizeChartInput, chartStorefront, chartReq, chartLookupReq, parseChartRss, parseChartLookup,
    smarNumWould500, buildChart, crossCheckRss, rankCrossCheck, chartFileName, predictChart, runChart, summarizeChart,
  };
});
