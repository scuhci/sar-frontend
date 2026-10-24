// as_checks.js -- smar-appstore-agent v2: per-field cross-checks, quarantine, drift, summary/READY/NEXT helpers.
// UMD: require('./as_checks.js') in Node, window.SMAR_AS_CHECKS in a browser. Pure: no I/O, no network, no
// fetch (it only reads response bodies the engine already holds). Calibration lives in eval/appstore/build_notes.
//
// PLAN: eval/appstore/PLAN.md sec. 3 (sources, gates, invariants, drift detectors), A3 (quarantine), sec. 6.3 (summary).
// Values are NEVER taken from a cross-check source: a source only votes on the lookup value (A1/A3).
//
// ---------------------------------------------------------------------------------------------------- EXPORTS
// Constants
//   VERSION, COLUMNS_SEARCH (34), COLUMNS_CHART (32), COLUMNS_REVIEWS (9)
//   COL_LOOKUP_KEY {column: lookup key}          COL_CLEAN_KEY {column: cleanApp key (for applyQuarantine)}
//   CHECKS {'<col>@<src>': {gate:'hard'|'soft'|'warn'|'canary', ver:bool, n, agree, note}}  (calibrated, sec. 3.5)
//   REQUIRED_LOOKUP_KEYS, OPTIONAL_KEY_BASELINE {key: blank fraction on the corpus}, BLANK_BASELINE (all columns)
//   ANCHOR_BASELINE {'<src>.<field>': presence fraction on the corpus}, AGE_ALLOW (FS-05 allow-list), EXIT, NEXT_KINDS
//   STRUCT_BASELINE {'webPage.<block marker>': presence}, VERSION_MISMATCH_BASELINE {src: rate}, DRIFT_ALPHA (1e-4)
//   SHAPE_BASELINE {'<lookupKey>.<missing|blank>.<stratum>': {row, unit}}  (stratified: releaseNotes by version age;
//        Mac apps excluded for iPad/TV/devices; unit = developer)          SRC_COLS, COMPARE (per-column comparators)
// Anchor extractors (raw response body or parsed JSON -> normalised anchor objects; never throw)
//   anchorsFromWebPage(html) -> {ok, variant, a:{id,bundleId,name,url,cc,iconDir,primaryGenreId,primaryGenreName,genres,
//        minOs,version,lastUpdated,releaseNotes,currency,price,artistId,artistName,artistUrl,website,hist,ldRating,
//        ageRating,appPlatforms,sizeText,isPreorder,lang,localized}}   (WEB_PAGE, both information-shelf variants, FS-06;
//        locale-independent on non-English storefront pages: see "Locale-independent anchors")
//   anchorsFromPlatform(obj, {cc}) -> a                   (one product-dv / lockup result object)
//   anchorsFromSimilarPage(body, id) -> {ok, decodable, keyFound, cc, a|null}   (SIMILAR_PAGE product-dv; gzip-safe)
//   anchorsFromLockups(body) -> {ok, cc, byId:{id:a}}     (MZSEARCH storePlatformData lockups, first ~8)
//   anchorsFromChartRss(body) -> {ok, kind, byId:{id:a}, order:[id]}   (CHART_RSS / CHART_RSS_ALT entries)
//   parseMzReviews(body) -> {ok, list:[{id, rating, body, title, name, profileId, date}]}
// Checks (pure)
//   checkRow(raw, sources, {cc, layout, expectCurrency}) -> {hard[], soft[], warn[], na[], pass[], versionEqual,
//        versionSources, cdnAge, status:'ok'|'hard_fail'|'drift'|'unverified', refetch:boolean, flags[]}
//        sources = {webPage?:a, productDv?:a, lockup?:a, rss?:a, consistency?:rawLookup2, storeIndependentOnly?:{src:true}}
//   checkRatings({lookup, hist, ldRating, delivered?}) -> {status, checks[]}          (FS-08 port)
//   checkContentRating(lookupValue, pageValue) -> {r, flag?, drift?}                    (FS-05 allow-list, warn only)
//   legacyAge(lookupValue, cc) -> the value in the legacy 4+/9+/12+/17+ spelling (BR's "+4" -> "4+"; anything else unchanged)
//   checkConsistency(rawA, rawB, {sameStore}) -> {equal, diffs:[{key, cls:'counter'|'version'|'value'}]}
//   invariants(raw, {cc, expectCurrency}) -> [{col, ok, why}]      reviewInvariants(row, {cc, trackId}) -> [...]
//   checkReviews(rssEntries, mzList, {startIndex}) -> {hard[], soft[], pass, order, perRow:{id:{fails[]}}}  (FS-11 port)
//   lookupShape(rawList) -> {n, missing:{key:n}, blank:{key:n}, rates}   shapeRates(rawList) -> {'<k>.<what>.<stratum>': {n,m,units,mUnits}}
//   reviewShape(entries) -> {n, malformed[]}
//   LOOKUP_TYPES {lookupKey: kind}, LOOKUP_COL {lookupKey: column}, typeCheck(raw) -> [{key, col, kind, got}], typeCells(raw) -> {col: reason}
//        (type/shape contract of every rendered lookup key; violations are quarantined in both modes and are drift)
//   anchorColumns(fixAnchors, layout) -> {cols:{column: anchor}, unmapped[]}   (what --deliver-anyway must blank; a drifted
//        genre id or genreIDs also blanks the genre columns derived from it: COLUMN_FAMILY)
//   SEM {lookupKey: (value, raw, cc) -> true|false|null}, PRIMARY_GENRE {primaryGenreId: English name}
//   semanticCheck(raw, {cc, skipCols}) -> {fails:[{col, key, why, partnerOf?, unrendered?}], evaluated:[col]}  (stress
//        FI-01/02: per-row semantic contract + cross-field invariants + swap partners; checkRow files them as HARD
//        failures of source 'semantic', quarantined whatever the page version; 0 failures on 35,667 cached records)
//   reviewsChecks(rs) -> [checkReviews result + p]   (an as_reviews app state: rs.mz[p] + rs.pageEntries[p]; or rs.checks)
//   reviewSemantics(rs) -> {n, hard[], perRow, blankVersion, versionIsRating}   (per-row review checks on every RSS entry)
//   reviewQuarantine(rs, {compat}) -> {cells:{reviewID:{col:reason}}, own (the reviewSemantics subset), kind}   (MZ disagreements + reviewSemantics; the
//        versionWhenReviewed cell is keyed 'version', the review row's key, and reported under its column by quarantineSummary)
//   reviewTransport(st, facts) -> [{appId, empty[], healed[], parse[]}]   appsTable(apps) -> {cols, rows}  (capSummary)
//   binomTail(m, n, p), significant(m, n, base)   drift significance (>= max(3,10%), > base+15pt, binomial tail < DRIFT_ALPHA)
// Quarantine (A3)
//   quarantineCells(result, {compat}) -> {cells:{col:reason}, kind:'quarantined'|'unverified'|null, anchorAbsent:{col:reason},
//        own:{col:reason} (the cells whose record contradicts itself: --smar-compat blanks these too)}
//   applyQuarantine(cleanRow, cells, {compat}) -> cleanRow (default: cells set to undefined; compat: unchanged)
// Drift and summary (sec. 3.6, 6.3)
//   aggregateChecks(st) -> {rowsChecked (rows a second Apple source evaluated), unanchoredRows (invariants only or no
//        check), bySource, hardFailures, softWarnings, notCrossCheckable, evaluated}
//   driftReport(st, {compat}) -> {anchorDrift[] (incl. '<src>.version' when a source's version disagrees on many rows),
//        anchorDead[], lookupDrift[], blankDrift[], structDrift[] (advisory), cdnAgeRows (a version mismatch whose
//        cache-busted re-read returned the same version is NOT cdn_age: versionMismatchPersistent), versionMismatchRows, refetched,
//        fixAnchors[], advisory[], problems[], blocking, checks (aggregateChecks)}
//   quarantineSummary(st, {rows}) -> {quarantinedCells, quarantinedApps, unverifiedCells, undefinedCounts}
//   compatExact(st, facts) -> {ok, reasons:[{code, detail}]}
//   decide(st, facts, ctx) -> {READY_TO_DELIVER, NEXT, problems, exitCode, compatExact, drift, deliveredAnyway}
//        facts = {finished, incomplete, crash, stop:{code, sentence}, fetchFailed:[ids], fetchFailedText (reviews: the apps
//                 are incomplete, not failed), noResults, smarHttp500,
//                 endpointDrift:'<what>', similarDrift:bool, similarKeyMissing, storefrontFallback, siteTermApplied,
//                 transportDependent, bulk, noSmarEquivalent, searchRankNondeterminism, rows, compat, deliverAnyway,
//                 problems[]}; ctx = {cmd (the identical command line), refetchCmd(ids)}
//        Order: crash > stop > incomplete > compat smar_http500 > endpoint/similar drift (default) > no rows > REFETCH >
//        FIX_ANCHOR (both modes) > DELIVER. Exit 0 for DELIVER/REFETCH/FIX_ANCHOR (read READY_TO_DELIVER), 1 STOP,
//        3 RESUME, 5 crash. deliverAnyway turns REFETCH/FIX_ANCHOR into DELIVER (problems keep the reason).
//   next.{deliver(), resume(cmd), refetch(cmd), fixAnchor(list), stop(sentence)}
//   capSummary(summary, maxBytes=4096) -> summary with lists trimmed until JSON.stringify fits; a reviews summary that
//        does not fit gets reviews.appsTable (one short tuple per app, kept whole while other lists are cut) and, only if
//        that alone cannot fit, reviews.appsTableTruncated {shown, of, file (appsFile or summaryFile), key}; strings
//        longer than 200 characters (paths and NEXT aside) are cut; last resort: only the fields to act on + summaryFile
// Drift additions (stress 2026-10-03): soft checks failing far above their calibrated rate escalate (anchorDrift
//   why soft_check_fails_on_many_rows); semantic.<column> column drift; lookup.rowIdentity (bundleId no longer identifies
//   each row: blocks in both modes, no CSV column, so --deliver-anyway refuses); reviewsRss.versionWhenReviewed (blank or
//   equal to the rating); lookup.releaseNotes (longer than the description on most rows); swap pairs named in problems.
// Round 2 (verifier): checkRow names a lookup version EQUAL to another field of its record (minimum OS, a rating, a count)
//   while a page shows another version (version_copied_from_<key>, hard), and lookup.version drift when that holds on many
//   rows; a page's grossly different rating count also quarantines currentVersionReviews (sameUnitAs totalReviews); the
//   app page dating the same version after a lookup release date that equals its update date is a hard lastUpdated
//   failure (updated_date_is_the_release_date), and more than 7 days after the lookup's date at all (date_grossly_differs);
//   a failed genre id also quarantines the genre columns derived from it, per row and in --deliver-anyway (COLUMN_FAMILY).
// Round 3 (verifier of 6980ec1): the semantic contract names the field holding the primary genre id (SEM.primaryGenreId);
//   the current-version count/average must equal the overall ones within the counter lag (current_count_below_count,
//   current_average_differs; both columns unless a page confirms one); an update date more than a day in the future on a
//   released app (updated_in_the_future); a same-version page date more than an hour after the lookup's, or a day before
//   it unless the lookup's date is the storefront availability date (date_grossly_differs); reviews: a version with no
//   digit / text phrase / far above the app's version (rs.appVersion), above it while dated more than a day before the
//   app's current release (rs.appVersionDate), impossible dates, an RSS date a day or more from
//   MZ's (hard) and MZ date disagreements on many rows (drift mzReviews.dateReviewed).
// State used (PLAN 6.2): st.opts.{mode,country,compat}, st.rows[{appId}], st.details[appIdLower].raw, st.checks[appId],
//   st.quarantined[appId]{col:reason}, st.unverified[appId]{col:reason}, st.reviews[*].checks, st.chart, st.transport.
//   st.checks[appId] is the checkRow() result (optionally plus .refetched:true and .after: second result).
//   checkRow(...).refetch is true on a hard failure OR a version mismatch (PLAN 3.2 row 17); refetchReason says which.
//   checkRow(...).struct {'webPage.<marker>': bool} feeds the advisory structure-drift detector.
// Calibration: eval/appstore/build_notes/checks_calibrate.js (calibrate | tally | measure), embedded by checks_embed.js.
//   measure (2026-10-01): 0 hard failures on 3,413 real (lookup, anchor) pairs; 0 blocking drift on 1,050 random lookup
//   groups (3..200 rows) + every run-sized real group; catch 1.0 on 30/34 simulated relocations/garbling, 0.97-0.99 on 3
//   (groups with < 3 developers), ld.author rename -> advisory only (developerAction fallback still verifies).
// ------------------------------------------------------------------------------------------------------------
(function (root, factory) {
  // source(): the full module text for the browser fingerprint (browser_driver.js), not just the exported surface
  const m = Object.assign(factory(), { source: () => String(factory) });
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.SMAR_AS_CHECKS = m;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const VERSION = '2.1.0';

  const COLUMNS_CHART = ['id', 'appId', 'appName', 'url', 'icon', 'genres', 'genreIDs', 'primaryGenre', 'primaryGenreId',
    'contentRating', 'supportedLanguages', 'appSizeInBytes', 'requiredOsVersion', 'originalReleaseDate', 'lastUpdated',
    'releaseNotes', 'currentAppVersion', 'price', 'currency', 'developerId', 'developer', 'developerAppStorePageURL',
    'developerWebsite', 'avgRating', 'totalReviews', 'currentVersionAvgRating', 'currentVersionReviews', 'appScreenshots',
    'appIpadScreenshots', 'appletvScreenshots', 'supportedDeviceList', 'dateScraped'];
  const COLUMNS_SEARCH = COLUMNS_CHART.slice(0, 31).concat(['country', 'scrapedFrom', 'dateScraped']);
  const COLUMNS_REVIEWS = ['reviewID', 'userUrl', 'versionWhenReviewed', 'rating', 'reviewText', 'reviewURL', 'dateReviewed', 'country', 'dateScraped'];

  const COL_LOOKUP_KEY = { id: 'trackId', appId: 'bundleId', appName: 'trackName', url: 'trackViewUrl', icon: 'artworkUrl512',
    genres: 'genres', genreIDs: 'genreIds', primaryGenre: 'primaryGenreName', primaryGenreId: 'primaryGenreId',
    contentRating: 'contentAdvisoryRating', supportedLanguages: 'languageCodesISO2A', appSizeInBytes: 'fileSizeBytes',
    requiredOsVersion: 'minimumOsVersion', originalReleaseDate: 'releaseDate', lastUpdated: 'currentVersionReleaseDate',
    releaseNotes: 'releaseNotes', currentAppVersion: 'version', price: 'price', currency: 'currency', developerId: 'artistId',
    developer: 'artistName', developerAppStorePageURL: 'artistViewUrl', developerWebsite: 'sellerUrl',
    avgRating: 'averageUserRating', totalReviews: 'userRatingCount', currentVersionAvgRating: 'averageUserRatingForCurrentVersion',
    currentVersionReviews: 'userRatingCountForCurrentVersion', appScreenshots: 'screenshotUrls', appIpadScreenshots: 'ipadScreenshotUrls',
    appletvScreenshots: 'appletvScreenshotUrls', supportedDeviceList: 'supportedDevices' };
  const LOOKUP_COL = {};
  for (const [c, k] of Object.entries(COL_LOOKUP_KEY)) LOOKUP_COL[k] = c;
  const COL_CLEAN_KEY = { appName: 'title', genreIDs: 'genreIds', supportedLanguages: 'languages', appSizeInBytes: 'size',
    originalReleaseDate: 'released', lastUpdated: 'updated', currentAppVersion: 'version', developerAppStorePageURL: 'developerUrl',
    avgRating: 'score', totalReviews: 'reviews', currentVersionAvgRating: 'currentVersionScore', appScreenshots: 'screenshots',
    appIpadScreenshots: 'ipadScreenshots', supportedDeviceList: 'supportedDevices', scrapedFrom: 'source' };

  // PLAN 3.6: required lookup keys; a required key absent on >= max(3, 10%) of rows is anchor drift on lookup.<key>.
  const REQUIRED_LOOKUP_KEYS = ['trackId', 'bundleId', 'trackName', 'trackViewUrl', 'artistId', 'artistName', 'version', 'currency',
    'minimumOsVersion', 'fileSizeBytes', 'genres', 'genreIds', 'primaryGenreName', 'primaryGenreId', 'releaseDate',
    'contentAdvisoryRating', 'averageUserRating', 'userRatingCount'];

  // Type/shape contract of every lookup key the writer renders into a CSV column (cleanApp). Measured on the 19,965
  // cached lookup records (2026-10-03): 0 violations. A present value outside its contract (averageUserRating turned
  // into {value: N}, a count turned into text, a URL list holding objects) is never rendered: typeCells() quarantines
  // the cell (undefined, both modes), the summary reports it (typeViolations, quarantinedCells), and driftReport counts
  // it as column drift on lookup.<key> (blocking in both modes: READY false, FIX_ANCHOR). Absent keys are the
  // missing/blank detectors' job. Number kinds also accept the canonical decimal text of a number ("4.5"): it renders
  // to the same bytes. icon is checked on the value cleanApp renders (artworkUrl512 || artworkUrl100 || artworkUrl60).
  const LOOKUP_TYPES = { trackId: 'id', bundleId: 'text', trackName: 'text', trackViewUrl: 'url', artworkUrl512: 'url', genres: 'textList',
    genreIds: 'idList', primaryGenreName: 'text', primaryGenreId: 'id', contentAdvisoryRating: 'text', languageCodesISO2A: 'textList',
    fileSizeBytes: 'count', minimumOsVersion: 'text', releaseDate: 'isoDate', currentVersionReleaseDate: 'isoDate', releaseNotes: 'text',
    version: 'text', price: 'price', currency: 'currency', artistId: 'id', artistName: 'text', artistViewUrl: 'url', sellerUrl: 'url',
    averageUserRating: 'rating', userRatingCount: 'count', averageUserRatingForCurrentVersion: 'rating', userRatingCountForCurrentVersion: 'count',
    screenshotUrls: 'urlList', ipadScreenshotUrls: 'urlList', appletvScreenshotUrls: 'urlList', supportedDevices: 'textList' };
  const numText = (v) => typeof v === 'string' && v !== '' && String(Number(v)) === v;
  const asNum = (v) => (typeof v === 'number' ? v : numText(v) ? Number(v) : NaN);
  const isHttp = (v) => typeof v === 'string' && /^https?:\/\//i.test(v); // "http://" alone occurs (1 sellerUrl in the corpus)
  const TYPE_OK = {
    id: (v) => { const n = asNum(v); return Number.isInteger(n) && n > 0; },
    count: (v) => { const n = asNum(v); return Number.isInteger(n) && n >= 0; },
    rating: (v) => { const n = asNum(v); return isFinite(n) && n >= 0 && n <= 5; },
    price: (v) => { const n = asNum(v); return isFinite(n) && n >= 0; },
    text: (v) => typeof v === 'string',
    url: isHttp,
    currency: (v) => typeof v === 'string' && /^[A-Z]{3}$/.test(v),
    isoDate: (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.test(v) && !isNaN(Date.parse(v)),
    textList: (v) => Array.isArray(v) && v.every((x) => typeof x === 'string'),
    idList: (v) => Array.isArray(v) && v.every((x) => (typeof x === 'string' && /^\d+$/.test(x)) || (Number.isInteger(x) && x > 0)),
    urlList: (v) => Array.isArray(v) && v.every(isHttp),
  };
  const TYPE_WORD = { id: 'a positive whole number', count: 'a whole number', rating: 'a rating number 0-5', price: 'a price number', text: 'text',
    url: 'an http(s) URL', currency: 'a 3-letter currency code', isoDate: 'an ISO date', textList: 'a list of text', idList: 'a list of numeric ids', urlList: 'a list of URLs' };

  // @@CALIBRATION_BEGIN (generated by `node eval/appstore/build_notes/checks_calibrate.js calibrate | node checks_embed.js`; do not hand-edit numbers)
  const CALIBRATION = {"generated":"2026-10-02","corpus":{"webPages":334,"productDv":142,"lockups":349,"rssEntries":2588,"lookupApps":4645,"reviewPairs":150},"checks":{"id@webPage":{"n":332,"agree":332,"nAll":334,"agreeAll":334},"appId@webPage":{"n":332,"agree":332,"nAll":334,"agreeAll":334},"appName@webPage":{"n":332,"agree":332,"nAll":334,"agreeAll":334},"url@webPage":{"n":332,"agree":332,"nAll":334,"agreeAll":334},"icon@webPage":{"n":332,"agree":332,"nAll":334,"agreeAll":332},"genres@webPage":{"n":332,"agree":331,"nAll":334,"agreeAll":333},"genreIDs@webPage":{"n":327,"agree":327,"nAll":329,"agreeAll":329},"primaryGenre@webPage":{"n":327,"agree":325,"nAll":329,"agreeAll":327},"primaryGenreId@webPage":{"n":327,"agree":327,"nAll":329,"agreeAll":329},"contentRating@webPage":{"n":332,"agree":332,"nAll":334,"agreeAll":334},"appSizeInBytes@webPage":{"n":312,"agree":312,"nAll":314,"agreeAll":312},"requiredOsVersion@webPage":{"n":332,"agree":332,"nAll":334,"agreeAll":334},"lastUpdated@webPage":{"n":281,"agree":278,"nAll":283,"agreeAll":278},"releaseNotes@webPage":{"n":281,"agree":281,"nAll":283,"agreeAll":283},"price@webPage":{"n":332,"agree":332,"nAll":334,"agreeAll":334},"currency@webPage":{"n":332,"agree":332,"nAll":334,"agreeAll":334},"developerId@webPage":{"n":332,"agree":332,"nAll":334,"agreeAll":334},"developer@webPage":{"n":332,"agree":332,"nAll":334,"agreeAll":334},"developerAppStorePageURL@webPage":{"n":332,"agree":332,"nAll":334,"agreeAll":334},"developerWebsite@webPage":{"n":332,"agree":332,"nAll":334,"agreeAll":334},"avgRating@webPage":{"n":289,"agree":289,"nAll":289,"agreeAll":289},"totalReviews@webPage":{"n":324,"agree":320,"nAll":326,"agreeAll":322},"supportedDeviceList@webPage":{"n":330,"agree":330,"nAll":332,"agreeAll":332},"appScreenshots@webPage":{"n":319,"agree":289,"nAll":321,"agreeAll":290},"id@productDv":{"n":141,"agree":141,"nAll":142,"agreeAll":142},"appId@productDv":{"n":141,"agree":141,"nAll":142,"agreeAll":142},"appName@productDv":{"n":141,"agree":141,"nAll":142,"agreeAll":141},"url@productDv":{"n":141,"agree":141,"nAll":142,"agreeAll":142},"genreIDs@productDv":{"n":141,"agree":141,"nAll":142,"agreeAll":142},"requiredOsVersion@productDv":{"n":141,"agree":141,"nAll":142,"agreeAll":142},"originalReleaseDate@productDv":{"n":141,"agree":141,"nAll":142,"agreeAll":142},"price@productDv":{"n":141,"agree":141,"nAll":142,"agreeAll":142},"developerId@productDv":{"n":141,"agree":141,"nAll":142,"agreeAll":142},"developer@productDv":{"n":141,"agree":141,"nAll":142,"agreeAll":142},"developerAppStorePageURL@productDv":{"n":141,"agree":141,"nAll":142,"agreeAll":142},"id@lockup":{"n":349,"agree":349,"nAll":349,"agreeAll":349},"appId@lockup":{"n":349,"agree":349,"nAll":349,"agreeAll":349},"appName@lockup":{"n":349,"agree":349,"nAll":349,"agreeAll":349},"url@lockup":{"n":349,"agree":349,"nAll":349,"agreeAll":349},"genreIDs@lockup":{"n":349,"agree":349,"nAll":349,"agreeAll":349},"requiredOsVersion@lockup":{"n":349,"agree":349,"nAll":349,"agreeAll":349},"originalReleaseDate@lockup":{"n":349,"agree":349,"nAll":349,"agreeAll":349},"price@lockup":{"n":349,"agree":349,"nAll":349,"agreeAll":349},"developerId@lockup":{"n":349,"agree":349,"nAll":349,"agreeAll":349},"developer@lockup":{"n":349,"agree":349,"nAll":349,"agreeAll":349},"developerAppStorePageURL@lockup":{"n":349,"agree":349,"nAll":349,"agreeAll":349},"id@rss":{"n":2588,"agree":2588,"nAll":2588,"agreeAll":2588},"appId@rss":{"n":2588,"agree":2588,"nAll":2588,"agreeAll":2588},"appName@rss":{"n":2588,"agree":2588,"nAll":2588,"agreeAll":2588},"url@rss":{"n":2588,"agree":2588,"nAll":2588,"agreeAll":2588},"genreIDs@rss":{"n":2588,"agree":2588,"nAll":2588,"agreeAll":2588},"primaryGenre@rss":{"n":2588,"agree":2577,"nAll":2588,"agreeAll":2577},"primaryGenreId@rss":{"n":2588,"agree":2588,"nAll":2588,"agreeAll":2588},"originalReleaseDate@rss":{"n":2588,"agree":2578,"nAll":2588,"agreeAll":2578},"price@rss":{"n":2588,"agree":2588,"nAll":2588,"agreeAll":2588},"currency@rss":{"n":2588,"agree":2588,"nAll":2588,"agreeAll":2588},"developerId@rss":{"n":2588,"agree":2588,"nAll":2588,"agreeAll":2588},"developer@rss":{"n":2588,"agree":2588,"nAll":2588,"agreeAll":2588},"reviews@mzReviews":{"n":150,"agree":150,"wallClockSoft":0,"rssDstOffset":15}},"optionalKeyBaseline":{"releaseNotes":0.093,"price":0.0017,"sellerUrl":0.3113,"ipadScreenshotUrls":0.0144,"appletvScreenshotUrls":0.0144,"supportedDevices":0.0144},"blankBaseline":{"trackId":0,"bundleId":0,"trackName":0,"trackViewUrl":0,"artworkUrl512":0,"genres":0,"genreIds":0,"primaryGenreName":0,"primaryGenreId":0,"contentAdvisoryRating":0,"languageCodesISO2A":0.0116,"fileSizeBytes":0,"minimumOsVersion":0,"releaseDate":0,"currentVersionReleaseDate":0,"releaseNotes":0.093,"version":0,"price":0.0017,"currency":0,"artistId":0,"artistName":0,"artistViewUrl":0,"sellerUrl":0.3113,"averageUserRating":0,"userRatingCount":0,"averageUserRatingForCurrentVersion":0,"userRatingCountForCurrentVersion":0,"screenshotUrls":0.011,"ipadScreenshotUrls":0.3701,"appletvScreenshotUrls":1,"supportedDevices":0.0144},"anchorBaseline":{"webPage.id":1,"webPage.appId":1,"webPage.appName":1,"webPage.url":1,"webPage.icon":1,"webPage.genres":1,"webPage.genreIDs":0.985,"webPage.primaryGenre":0.985,"webPage.primaryGenreId":0.985,"webPage.appSizeInBytes":0.9401,"webPage.requiredOsVersion":1,"webPage.lastUpdated":0.8473,"webPage.releaseNotes":0.8473,"webPage.price":1,"webPage.currency":1,"webPage.developerId":1,"webPage.developer":1,"webPage.developerAppStorePageURL":1,"webPage.developerWebsite":1,"webPage.totalReviews":0.976,"webPage.supportedDeviceList":0.994,"webPage.appScreenshots":0.9611,"productDv.id":1,"productDv.appId":1,"productDv.appName":1,"productDv.url":1,"productDv.genreIDs":1,"productDv.requiredOsVersion":1,"productDv.originalReleaseDate":1,"productDv.price":1,"productDv.developerId":1,"productDv.developer":1,"productDv.developerAppStorePageURL":1,"lockup.id":1,"lockup.appId":1,"lockup.appName":1,"lockup.url":1,"lockup.genreIDs":1,"lockup.requiredOsVersion":1,"lockup.originalReleaseDate":1,"lockup.price":1,"lockup.developerId":1,"lockup.developer":1,"lockup.developerAppStorePageURL":1,"rss.id":1,"rss.appId":1,"rss.appName":1,"rss.url":1,"rss.genreIDs":1,"rss.primaryGenre":1,"rss.primaryGenreId":1,"rss.originalReleaseDate":1,"rss.price":1,"rss.currency":1,"rss.developerId":1,"rss.developer":1},"structBaseline":{"webPage.ld":1,"webPage.ld.name":1,"webPage.ld.image":1,"webPage.ld.author":1,"webPage.ld.offers":1,"webPage.ld.genre":1,"webPage.ssd":1,"webPage.ssd.titleOfferDisplayProperties":1,"webPage.ssd.canonicalURL":1,"webPage.ssd.developerAction":1,"webPage.ssd.information":1,"webPage.ssd.mostRecentVersion":0.8473,"webPage.ssd.productRatings":0.997,"webPage.ssd.notPurchasedLinks":1,"webPage.breadcrumb":0.985},"versionMismatchBaseline":{"webPage":0.01,"productDv":0.01,"lockup":0.01},"shapeBaseline":{"releaseNotes.missing.updated":{"row":0.0002,"unit":0.0003,"n":4163,"units":3255},"releaseNotes.missing.new":{"row":0.8942,"unit":0.8862,"n":482,"units":448},"releaseNotes.blank.updated":{"row":0.0002,"unit":0.0003,"n":4163,"units":3255},"releaseNotes.blank.new":{"row":0.8942,"unit":0.8862,"n":482,"units":448},"price.missing.all":{"row":0.0017,"unit":0.0022,"n":4645,"units":3686},"price.blank.all":{"row":0.0017,"unit":0.0022,"n":4645,"units":3686},"sellerUrl.missing.all":{"row":0.3113,"unit":0.315,"n":4645,"units":3686},"sellerUrl.blank.all":{"row":0.3113,"unit":0.315,"n":4645,"units":3686},"ipadScreenshotUrls.missing.all":{"row":0,"unit":0,"n":4578,"units":3665},"ipadScreenshotUrls.blank.all":{"row":0.3609,"unit":0.3844,"n":4578,"units":3665},"appletvScreenshotUrls.missing.all":{"row":0,"unit":0,"n":4578,"units":3665},"appletvScreenshotUrls.blank.all":{"row":1,"unit":1,"n":4578,"units":3665},"supportedDevices.missing.all":{"row":0,"unit":0,"n":4578,"units":3665},"supportedDevices.blank.all":{"row":0,"unit":0,"n":4578,"units":3665},"trackId.missing.all":{"row":0,"unit":0,"n":4645,"units":3686},"trackId.blank.all":{"row":0,"unit":0,"n":4645,"units":3686},"bundleId.missing.all":{"row":0,"unit":0,"n":4645,"units":3686},"bundleId.blank.all":{"row":0,"unit":0,"n":4645,"units":3686},"trackName.missing.all":{"row":0,"unit":0,"n":4645,"units":3686},"trackName.blank.all":{"row":0,"unit":0,"n":4645,"units":3686},"trackViewUrl.missing.all":{"row":0,"unit":0,"n":4645,"units":3686},"trackViewUrl.blank.all":{"row":0,"unit":0,"n":4645,"units":3686},"artworkUrl512.missing.all":{"row":0,"unit":0,"n":4645,"units":3686},"artworkUrl512.blank.all":{"row":0,"unit":0,"n":4645,"units":3686},"genres.missing.all":{"row":0,"unit":0,"n":4645,"units":3686},"genres.blank.all":{"row":0,"unit":0,"n":4645,"units":3686},"genreIds.missing.all":{"row":0,"unit":0,"n":4645,"units":3686},"genreIds.blank.all":{"row":0,"unit":0,"n":4645,"units":3686},"primaryGenreName.missing.all":{"row":0,"unit":0,"n":4645,"units":3686},"primaryGenreName.blank.all":{"row":0,"unit":0,"n":4645,"units":3686},"primaryGenreId.missing.all":{"row":0,"unit":0,"n":4645,"units":3686},"primaryGenreId.blank.all":{"row":0,"unit":0,"n":4645,"units":3686},"contentAdvisoryRating.missing.all":{"row":0,"unit":0,"n":4645,"units":3686},"contentAdvisoryRating.blank.all":{"row":0,"unit":0,"n":4645,"units":3686},"languageCodesISO2A.missing.all":{"row":0,"unit":0,"n":4645,"units":3686},"languageCodesISO2A.blank.all":{"row":0.0116,"unit":0.0114,"n":4645,"units":3686},"fileSizeBytes.missing.all":{"row":0,"unit":0,"n":4645,"units":3686},"fileSizeBytes.blank.all":{"row":0,"unit":0,"n":4645,"units":3686},"minimumOsVersion.missing.all":{"row":0,"unit":0,"n":4645,"units":3686},"minimumOsVersion.blank.all":{"row":0,"unit":0,"n":4645,"units":3686},"releaseDate.missing.all":{"row":0,"unit":0,"n":4645,"units":3686},"releaseDate.blank.all":{"row":0,"unit":0,"n":4645,"units":3686},"currentVersionReleaseDate.missing.all":{"row":0,"unit":0,"n":4645,"units":3686},"currentVersionReleaseDate.blank.all":{"row":0,"unit":0,"n":4645,"units":3686},"version.missing.all":{"row":0,"unit":0,"n":4645,"units":3686},"version.blank.all":{"row":0,"unit":0,"n":4645,"units":3686},"currency.missing.all":{"row":0,"unit":0,"n":4645,"units":3686},"currency.blank.all":{"row":0,"unit":0,"n":4645,"units":3686},"artistId.missing.all":{"row":0,"unit":0,"n":4645,"units":3686},"artistId.blank.all":{"row":0,"unit":0,"n":4645,"units":3686},"artistName.missing.all":{"row":0,"unit":0,"n":4645,"units":3686},"artistName.blank.all":{"row":0,"unit":0,"n":4645,"units":3686},"artistViewUrl.missing.all":{"row":0,"unit":0,"n":4645,"units":3686},"artistViewUrl.blank.all":{"row":0,"unit":0,"n":4645,"units":3686},"averageUserRating.missing.all":{"row":0,"unit":0,"n":4645,"units":3686},"averageUserRating.blank.all":{"row":0,"unit":0,"n":4645,"units":3686},"userRatingCount.missing.all":{"row":0,"unit":0,"n":4645,"units":3686},"userRatingCount.blank.all":{"row":0,"unit":0,"n":4645,"units":3686},"averageUserRatingForCurrentVersion.missing.all":{"row":0,"unit":0,"n":4645,"units":3686},"averageUserRatingForCurrentVersion.blank.all":{"row":0,"unit":0,"n":4645,"units":3686},"userRatingCountForCurrentVersion.missing.all":{"row":0,"unit":0,"n":4645,"units":3686},"userRatingCountForCurrentVersion.blank.all":{"row":0,"unit":0,"n":4645,"units":3686},"screenshotUrls.missing.all":{"row":0,"unit":0,"n":4645,"units":3686},"screenshotUrls.blank.all":{"row":0.011,"unit":0.0024,"n":4645,"units":3686}}};
  // @@CALIBRATION_END

  // Gate defaults (PLAN 3.2/3.3). Calibration may only DEMOTE hard -> soft (100% at equal versions on >= 100 pairs).
  const GATE_PLAN = {
    'id@webPage': 'hard', 'id@productDv': 'hard', 'id@lockup': 'hard', 'id@rss': 'hard',
    'appId@webPage': 'hard', 'appId@productDv': 'hard', 'appId@lockup': 'hard', 'appId@rss': 'hard',
    'appName@webPage': 'hard', 'appName@productDv': 'hard', 'appName@lockup': 'hard', 'appName@rss': 'hard',
    'url@webPage': 'hard', 'url@productDv': 'hard', 'url@lockup': 'hard', 'url@rss': 'hard',
    'icon@webPage': 'hard:ver',
    'genres@webPage': 'soft', 'genreIDs@webPage': 'soft', 'genreIDs@rss': 'soft', 'genreIDs@productDv': 'soft', 'genreIDs@lockup': 'soft',
    'primaryGenre@webPage': 'soft', 'primaryGenre@rss': 'soft',
    'primaryGenreId@webPage': 'hard', 'primaryGenreId@rss': 'hard',
    'contentRating@webPage': 'warn',
    // appSizeInBytes and price: 100% agreement at equal versions on >= 141 pairs per source (CALIBRATION), so hard
    // (stress FI-01: a size divided by 1000 and a rating count in the price slot shipped as soft warnings)
    'appSizeInBytes@webPage': 'hard:ver',
    'requiredOsVersion@webPage': 'hard', 'requiredOsVersion@productDv': 'hard', 'requiredOsVersion@lockup': 'hard',
    'originalReleaseDate@rss': 'soft', 'originalReleaseDate@productDv': 'soft', 'originalReleaseDate@lockup': 'soft',
    'lastUpdated@webPage': 'hard:ver',
    'releaseNotes@webPage': 'hard:ver',
    'price@webPage': 'hard', 'price@rss': 'hard', 'price@productDv': 'hard', 'price@lockup': 'hard',
    'currency@webPage': 'hard', 'currency@rss': 'hard',
    'developerId@webPage': 'hard', 'developerId@productDv': 'hard', 'developerId@lockup': 'hard', 'developerId@rss': 'hard',
    'developer@webPage': 'hard', 'developer@productDv': 'hard', 'developer@lockup': 'hard', 'developer@rss': 'hard',
    'developerAppStorePageURL@webPage': 'hard', 'developerAppStorePageURL@productDv': 'hard', 'developerAppStorePageURL@lockup': 'hard',
    'developerWebsite@webPage': 'hard',
    'avgRating@webPage': 'soft', 'totalReviews@webPage': 'soft',
    'supportedDeviceList@webPage': 'soft', 'appScreenshots@webPage': 'soft',
  };
  // Version-sensitive comparisons: when the anchor's version differs from the lookup's, a failure is drift (cdn_age).
  // Store-dependent comparisons are skipped when the anchor's storefront differs from the run's (US similar page, non-US run).
  const STORE_DEPENDENT = { appName: 1, url: 1, currency: 1, price: 1, developer: 1, primaryGenre: 1, genres: 1, releaseNotes: 1,
    lastUpdated: 1, icon: 1, requiredOsVersion: 1, totalReviews: 1, avgRating: 1, contentRating: 1, developerWebsite: 1,
    developerAppStorePageURL: 1, appSizeInBytes: 1, supportedDeviceList: 1, appScreenshots: 1, originalReleaseDate: 1 };

  function gateOf(col, src) {
    const key = col + '@' + src, p = GATE_PLAN[key];
    if (!p) return null;
    const [g, v] = p.split(':');
    const cal = CALIBRATION && CALIBRATION.checks && CALIBRATION.checks[key];
    let gate = g;
    if (g === 'hard' && cal && !(cal.n >= 100 && cal.agree === cal.n)) gate = 'soft';
    if (g === 'hard' && !cal && CALIBRATION) gate = 'soft';
    return { gate, ver: v === 'ver', n: cal ? cal.n : 0, agree: cal ? cal.agree : 0 };
  }
  const CHECKS = {};
  for (const k of Object.keys(GATE_PLAN)) { const [c, s] = k.split('@'); CHECKS[k] = gateOf(c, s); }

  const OPTIONAL_KEY_BASELINE = (CALIBRATION && CALIBRATION.optionalKeyBaseline) || { sellerUrl: 0.29, releaseNotes: 0.07, price: 0.0025 };
  const BLANK_BASELINE = (CALIBRATION && CALIBRATION.blankBaseline) || {};
  const ANCHOR_BASELINE = (CALIBRATION && CALIBRATION.anchorBaseline) || {};
  // Structural markers of the page blocks (presence fraction on the corpus). A marker that vanishes while a fallback
  // anchor still verifies the value is reported (advisory drift), never blocking: no value is left unverified.
  const STRUCT_BASELINE = (CALIBRATION && CALIBRATION.structBaseline) || {};
  // Version disagreement rate per source on the corpus (cdn_age is rare: ~1%). A source whose version disagrees on many
  // rows has a relocated version anchor, which would otherwise demote every hard check to drift.
  const VERSION_MISMATCH_BASELINE = (CALIBRATION && CALIBRATION.versionMismatchBaseline) || { webPage: 0.01, productDv: 0.01, lockup: 0.01 };
  // Baseline-relative drift tests need a sample-size guard: on a k=10 sample, 3 missing releaseNotes (baseline 9%) is
  // chance (p~0.06), not drift. Flag only when the count also has binomial upper-tail probability < DRIFT_ALPHA.
  const DRIFT_ALPHA = 1e-4;
  // Stratified baselines: releaseNotes is absent on 89% of apps whose current version shipped < 2 days after the first
  // release (first-version apps: new-app charts are full of them) but on 0.02% of the others. Testing the stratum where
  // the key is expected removes the new-apps-chart false positive and makes a dropped key visible on any chart.
  const STRATA = {
    releaseNotes: (r) => { const d = Date.parse(r.currentVersionReleaseDate) - Date.parse(r.releaseDate); return isFinite(d) && d >= 2 * 864e5 ? 'updated' : 'new'; },
  };
  // '<key>.<missing|blank>.<stratum>' -> {row, unit} corpus rates (calibrated by shapeRates over every cached lookup).
  const SHAPE_BASELINE = (CALIBRATION && CALIBRATION.shapeBaseline) || {};
  // FS-05 allow-list (legacy lookup scale -> 2025 page scale). Warn only; never overwrite.
  const AGE_ALLOW = { '4+': ['4+', '9+', '13+'], '9+': ['9+', '13+'], '12+': ['13+', '16+', '18+'], '17+': ['16+', '18+'] };
  const LEGACY_AGE = ['4+', '9+', '12+', '17+'], NEW_AGE = ['4+', '9+', '13+', '16+', '18+'];
  const EXIT = { finished: 0, stopped: 1, usage: 2, incomplete: 3, locked: 4, crash: 5 };
  const NEXT_KINDS = ['DELIVER', 'RESUME', 'REFETCH', 'FIX_ANCHOR', 'STOP'];

  // ---------------------------------------------------------------------------------------------- small helpers
  const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
  const J = (s) => { if (typeof s !== 'string') return isObj(s) || Array.isArray(s) ? s : null; try { return JSON.parse(s); } catch (e) { return null; } };
  const grab = (s, re) => { const m = typeof s === 'string' ? s.match(re) : null; return m ? m[1] : null; };
  const idOf = (u) => { const m = String(u == null ? '' : u).match(/\/id(\d+)/); return m ? m[1] : null; };
  const ccOf = (u) => { const m = String(u == null ? '' : u).match(/^https?:\/\/[^/]+\/([a-z]{2})\//i); return m ? m[1].toLowerCase() : null; };
  const dirOf = (u) => (u ? String(u).replace(/^https?:\/\/is\d+(-ssl)?\.mzstatic\.com/, '').replace(/\/[^/]*$/, '') : null);
  const osNorm = (v) => (v == null ? null : String(v).trim().replace(/(\.0)+$/, ''));
  const isoSec = (s) => { if (s == null || s === '') return null; const t = Date.parse(s); return isNaN(t) ? null : new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z'); };
  const nl = (v) => str(v).replace(/\r\n?/g, '\n');
  const blank = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
  const str = (v) => (v === undefined || v === null ? '' : String(v));
  const inc = (m, k, n) => { m[k] = (m[k] || 0) + (n == null ? 1 : n); return m; };
  const isGzip = (b) => typeof b === 'string' && b.length > 1 && b.charCodeAt(0) === 0x1f && (b.charCodeAt(1) === 0x8b || b.charCodeAt(1) === 0xfffd);
  const garbled = (b) => { if (typeof b !== 'string' || !b) return true; if (isGzip(b)) return true; const s = b.slice(0, 2000); let bad = 0; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c === 0xfffd || (c < 9) || (c > 13 && c < 32)) bad++; } return bad > s.length * 0.05; };

  // ------------------------------------------------------------------------------------------ anchor extractors
  // Locale-independent anchors (bench-obscure SE-D, 2026-10-03). The information-shelf titles ("Size", "Compatibility",
  // "Age Rating"), the "Version " prefix and the "Developer Website" link text are translated on every non-English
  // storefront page (JP サイズ / バージョン9.1.88 / デベロッパウェブサイト, DE Größe / Entwicklerwebsite), which made every
  // JP/DE run a false FIX_ANCHOR. English titles are still read first (the calibrated path, unchanged on en-* pages);
  // otherwise each anchor is found by structure or value shape, and only when exactly one row fits:
  //   version  the version-history page data (its primarySubtitle is the bare version on every page), else the
  //            subtitle without its leading localized word
  //   website  the link whose metrics targetId is DeveloperWebsite (actionDetails.type 'developer')
  //   age      the row holding a textEncapsulation "<n>+"
  //   minOs    the row whose summary names an Apple OS and a version ("iOS 16.1以降が必要です。")
  //   size     the row whose summary is a number and a size unit ("313,4 MB"), normalised to "313.4 MB"
  // a.lang = pageFields.language (or <html lang>); a.localized = a non-English page. On a localized page an anchor that
  // cannot be found is "not cross-checkable" (expected absence 'localized_page', reported as an unverified cell), and a
  // translated display name (genre names) is not compared: never anchor drift, never a false stop.
  const OS_VER = /(?:^|[^A-Za-z])(?:iOS|iPadOS|macOS|watchOS|tvOS|visionOS)\s*(\d+(?:\.\d+)*)/;
  const SIZE_UNIT = { kb: 'KB', ko: 'KB', 'кб': 'KB', mb: 'MB', mo: 'MB', 'мб': 'MB', gb: 'GB', go: 'GB', 'гб': 'GB' };
  function localSize(s) { // "313,4 MB" / "1,2 Go" / "28 KB" -> "313.4 MB"; null when the text is no plain size
    const m = typeof s === 'string' ? s.match(/^\s*(\d{1,4}(?:[.,]\d{1,2})?)[\s  ]*([^\d\s]{1,4})\s*$/) : null;
    const u = m && SIZE_UNIT[m[2].toLowerCase()];
    return u ? m[1].replace(',', '.') + ' ' + u : null;
  }
  const one = (L) => (L.length === 1 ? L[0] : null);
  function histVersion(mrv) { // the newest entry of the version-history page data: the bare version string
    const sa = mrv && mrv.seeAllAction, pd = sa && sa.pageData, sh = pd && Array.isArray(pd.shelves) ? pd.shelves[0] : null;
    const it = sh && Array.isArray(sh.items) ? sh.items[0] : null;
    return it && typeof it.primarySubtitle === 'string' && it.primarySubtitle ? it.primarySubtitle : null;
  }
  function pageVersion(mrv) {
    const sub = String((mrv && mrv.primarySubtitle) || '');
    if (/^Version\s+/.test(sub) || !sub) return sub.replace(/^Version\s+/, '') || undefined; // English: the calibrated path
    // the subtitle's version token, wherever the localized word sits ("バージョン9.1.88", "9.1.88 verzió"), as the
    // English path reads the subtitle; the version-history entry only when the subtitle holds no digit at all
    const h = histVersion(mrv), tok = (sub.match(/(\d\S*)/) || [])[1];
    return tok || h || sub;
  }
  // the other links of that shelf on the 334 cached pages (with DeveloperWebsite: 270): privacy policy 336, licence 58
  const OTHER_LINKS = { LinkToPrivacyPolicy: 1, LicenseAgreement: 1 };
  const linkTarget = (it) => { // 'developer' | another targetId (LinkToPrivacyPolicy, LicenseAgreement, ...) | null
    const ca = it && it.clickAction, am = ca && ca.actionMetrics, D = am && Array.isArray(am.data) ? am.data : [];
    let other = null;
    for (const d of D) {
      const f = d && d.fields; if (!f) continue;
      if (f.targetId === 'DeveloperWebsite' || (f.actionDetails && f.actionDetails.type === 'developer')) return 'developer';
      if (typeof f.targetId === 'string' && f.targetId) other = f.targetId;
    }
    return other;
  };
  function infoText(it) {
    // FS-06: both information-shelf schemas. summary -> items[].text -> items[]/items_V3[] linkableText rawText.
    if (!it) return null;
    if (typeof it.summary === 'string' && it.summary) return it.summary;
    const L = [].concat(it.items || [], it.items_V3 || []);
    for (const x of L) {
      if (x && typeof x.text === 'string' && x.text) return x.text;
      const rt = x && x.linkableText && x.linkableText.styledText && x.linkableText.styledText.rawText;
      if (typeof rt === 'string' && rt) return rt.replace(/^\*\*[^*]*\*\*\n/, '');
    }
    return null;
  }
  function anchorsFromWebPage(html) {
    const out = { ok: false, variant: null, a: {} };
    if (typeof html !== 'string' || garbled(html)) { out.why = 'garbled'; return out; }
    const ld = J(grab(html, /<script id=software-application type="application\/ld\+json">([\s\S]*?)<\/script>/));
    const bc = J(grab(html, /<script id=schema:breadcrumb-list[^>]*>([\s\S]*?)<\/script>/));
    const ssd = J(grab(html, /<script type="application\/json" id="serialized-server-data">([\s\S]*?)<\/script>/));
    const d = ssd && ssd.data && ssd.data[0] && ssd.data[0].data;
    const a = out.a;
    if (!ld && !d) { out.why = 'no_anchor_blocks'; return out; }
    const pt = d && d.pageMetrics && d.pageMetrics.pageFields && d.pageMetrics.pageFields.pageType;
    if (pt && pt !== 'Software') { out.why = 'not_software_page:' + pt; return out; }
    out.ok = true; out.hasLd = !!ld; out.hasSsd = !!d; out.hasBreadcrumb = !!bc;
    { // structural markers (drift advisory; see STRUCT_BASELINE)
      const sm0 = (d && d.shelfMapping) || {};
      a.struct = { ld: !!ld, 'ld.name': !!(ld && ld.name), 'ld.image': !!(ld && ld.image), 'ld.author': !!(ld && ld.author && ld.author.name),
        'ld.offers': !!(ld && ld.offers), 'ld.genre': !!(ld && ld.genre != null), ssd: !!d, 'ssd.titleOfferDisplayProperties': !!(d && d.titleOfferDisplayProperties),
        'ssd.canonicalURL': !!(d && d.canonicalURL), 'ssd.developerAction': !!(d && d.developerAction), 'ssd.information': !!(sm0.information && sm0.information.items),
        'ssd.mostRecentVersion': !!(sm0.mostRecentVersion && sm0.mostRecentVersion.items), 'ssd.productRatings': !!(sm0.productRatings && sm0.productRatings.items),
        'ssd.notPurchasedLinks': !!sm0.notPurchasedLinks, breadcrumb: !!bc };
    }
    if (ld) {
      a.name = ld.name; a.iconDir = dirOf(ld.image);
      if (ld.offers) { a.price = ld.offers.price; a.currency = ld.offers.priceCurrency; }
      if (ld.author) { a.artistName = ld.author.name; a.artistUrl = ld.author.url; a.artistId = idOf(ld.author.url); }
      a.genres = Array.isArray(ld.genre) ? ld.genre : ld.genre != null ? [ld.genre] : undefined;
      if (ld.aggregateRating) a.ldRating = ld.aggregateRating.ratingValue;
    }
    if (bc && Array.isArray(bc.itemListElement)) {
      const g = bc.itemListElement.find((x) => /\/charts\/\d+/.test((x && x.item) || ''));
      if (g) { a.primaryGenreId = g.item.match(/\/charts\/(\d+)/)[1]; a.primaryGenreName = g.name; }
    }
    if (d) {
      const sm = d.shelfMapping || {}, tod = d.titleOfferDisplayProperties || {}, lk = d.lockup || {};
      out.variant = 'ssd';
      a.id = tod.adamId != null ? String(tod.adamId) : lk.adamId != null ? String(lk.adamId) : undefined;
      a.bundleId = tod.bundleId || lk.bundleId;
      a.url = d.canonicalURL; a.cc = ccOf(d.canonicalURL);
      a.isPreorder = tod.isPreorder; a.appPlatforms = d.appPlatforms;
      if (!a.artistId && d.developerAction && d.developerAction.pageUrl) { a.artistId = idOf(d.developerAction.pageUrl); a.artistUrl = a.artistUrl || d.developerAction.pageUrl; }
      if (!a.artistName && d.developerAction && d.developerAction.title) a.artistName = d.developerAction.title;
      const pf = d.pageMetrics && d.pageMetrics.pageFields;
      a.lang = String((pf && pf.language) || grab(html, /<html[^>]*\slang="([^"]+)"/) || '').toLowerCase() || undefined;
      a.localized = !!a.lang && !/^en\b/.test(a.lang);
      const info = {};
      const items = (sm.information && sm.information.items) || [];
      if (items.some((it) => it && it.items_V3)) out.variant = 'ssd_v3';
      for (const it of items) if (it && it.title) info[it.title] = it;
      a.infoFound = items.length > 0;
      // English titles first; otherwise the one row whose structure or value fits (see "Locale-independent anchors")
      const rows = a.localized ? items.filter((it) => it && typeof it === 'object') : []; // en-* pages: titles only (calibrated)
      const sumOf = (it) => (typeof it.summary === 'string' ? it.summary : infoText(it) || '');
      const compatRow = info.Compatibility || one(rows.filter((it) => OS_VER.test(sumOf(it))));
      const compat = infoText(compatRow);
      a.minOsText = compat;
      a.minOs = compat ? (info.Compatibility ? (compat.match(/(\d+(?:\.\d+)*)/) || [])[1] : (compat.match(OS_VER) || [])[1]) : undefined;
      if (info.Size) a.sizeText = infoText(info.Size) || undefined;
      else { const sz = one(rows.map((it) => localSize(it.summary)).filter(Boolean)); a.sizeText = sz || undefined; }
      const ageRow = info['Age Rating'] || one(rows.filter((it) => (it.items || []).some((x) => x && x.$kind === 'textEncapsulation' && /^\d+\+$/.test(String(x.text || '').trim()))));
      a.ageRating = infoText(ageRow) || undefined;
      if (a.ageRating) a.ageRating = (a.ageRating.match(/(\d+\+)/) || [])[1] || a.ageRating;
      const mrv = sm.mostRecentVersion && sm.mostRecentVersion.items && sm.mostRecentVersion.items[0];
      if (mrv) {
        a.version = pageVersion(Object.assign({}, mrv, { seeAllAction: sm.mostRecentVersion.seeAllAction }));
        a.lastUpdated = isoSec(mrv.secondarySubtitle) || undefined;
        a.releaseNotes = typeof mrv.text === 'string' ? mrv.text : undefined;
      }
      const pr = sm.productRatings && sm.productRatings.items && sm.productRatings.items[0];
      if (pr) a.hist = { total: pr.totalNumberOfRatings, counts: pr.ratingCounts, ratingAverage: pr.ratingAverage };
      if (sm.notPurchasedLinks) {
        a.website = null;
        let found = false, untagged = 0;
        for (const it of (sm.notPurchasedLinks.items || [])) {
          const tg = linkTarget(it); if (!tg || (tg !== 'developer' && !OTHER_LINKS[tg])) untagged++;
          if (!it || !(it.text === 'Developer Website' || tg === 'developer')) continue;
          a.website = (it.clickAction && it.clickAction.url) || null; found = true;
        }
        // a localized page: "no website" only when every link is a known other link (privacy policy, licence) and
        // none is the developer's; a link it cannot recognise leaves the column not cross-checkable (never a false "none")
        if (!found && a.localized && untagged) a.website = undefined;
      }
      let phone = null, pad = null;
      for (const k of Object.keys(sm)) {
        if (!/^product_media_/.test(k) || !sm[k] || !sm[k].items) continue;
        const n = sm[k].items.filter((x) => x && x.screenshot).length;
        if (/phone/i.test(k)) phone = (phone || 0) + n; else if (/pad/i.test(k)) pad = (pad || 0) + n;
      }
      a.phoneShots = phone; a.padShots = pad;
    }
    return out;
  }
  function anchorsFromPlatform(o, opts) {
    if (!isObj(o)) return null;
    const off = Array.isArray(o.offers) ? o.offers[0] || {} : {};
    const a = { id: o.id != null ? String(o.id) : undefined, bundleId: o.bundleId, name: o.name, artistId: o.artistId != null ? String(o.artistId) : undefined,
      artistName: o.artistName, artistUrl: o.artistUrl, url: o.url, cc: (opts && opts.cc) || ccOf(o.url), minOs: o.minimumOSVersion,
      version: off.version && off.version.display, price: off.price, releaseDate: o.releaseDate,
      genreIdsIncl: Array.isArray(o.genres) ? o.genres.map((g) => String(g.genreId)) : undefined };
    if (o.userRating) { a.ratingCount = o.userRating.ratingCount; a.ratingValueRounded = o.userRating.value; }
    return a;
  }
  function anchorsFromSimilarPage(body, id) {
    const out = { ok: false, decodable: !garbled(body), keyFound: false, cc: null, a: null };
    if (!out.decodable) { out.why = 'gzip_or_garbled'; return out; }
    out.keyFound = /customersAlsoBoughtApps":/.test(body);
    const sd = J(grab(body, /its\.serverData\s*=\s*(\{[\s\S]*?\})\s*<\/script>/));
    const pd = sd && sd.storePlatformData && sd.storePlatformData['product-dv-product'];
    if (!pd || !pd.results) { out.why = 'no_product_dv'; return out; }
    out.cc = pd.meta && pd.meta.storefront && pd.meta.storefront.cc ? String(pd.meta.storefront.cc).toLowerCase() : null;
    const r = id != null ? pd.results[String(id)] : pd.results[Object.keys(pd.results)[0]];
    if (!r) { out.why = 'id_not_in_product_dv'; return out; }
    out.ok = true; out.a = anchorsFromPlatform(r, { cc: out.cc || ccOf(r.url) });
    return out;
  }
  function anchorsFromLockups(body) {
    const b = J(body), out = { ok: false, cc: null, byId: {} };
    const L = b && b.storePlatformData && b.storePlatformData['native-search-lockup-search'];
    if (!L || !L.results) return out;
    out.ok = true; out.cc = L.meta && L.meta.storefront && L.meta.storefront.cc ? String(L.meta.storefront.cc).toLowerCase() : null;
    for (const [k, v] of Object.entries(L.results)) { const a = anchorsFromPlatform(v, { cc: out.cc }); if (a) out.byId[String(v.id || k)] = a; }
    return out;
  }
  function anchorsFromChartRss(body) {
    const b = J(body), out = { ok: false, kind: null, byId: {}, order: [] };
    if (!b || !b.feed) return out;
    out.ok = true;
    const e = b.feed.entry, L = Array.isArray(e) ? e : isObj(e) ? [e] : [];
    out.kind = Array.isArray(e) ? 'list' : isObj(e) ? 'one' : 'empty';
    L.forEach((x, i) => {
      const ida = x && x.id && x.id.attributes || {}, art = x && x['im:artist'] || {}, pr = x && x['im:price'] && x['im:price'].attributes || {};
      const cat = x && x.category && x.category.attributes || {};
      const link = [].concat(x && x.link || []).map((l) => l && l.attributes && l.attributes.href).find((h) => /\/app\//.test(h || ''));
      const a = { rank: i + 1, id: ida['im:id'], bundleId: ida['im:bundleId'], name: x && x['im:name'] && x['im:name'].label,
        artistName: art.label, artistId: idOf(art.attributes && art.attributes.href), artistUrl: art.attributes && art.attributes.href,
        price: pr.amount != null ? Number(pr.amount) : undefined, currency: pr.currency, primaryGenreId: cat['im:id'], primaryGenreName: cat.label,
        releaseDate: x && x['im:releaseDate'] && x['im:releaseDate'].label, url: link || (x && x.id && x.id.label), cc: ccOf(link || (x && x.id && x.id.label)) };
      if (a.id) { out.byId[String(a.id)] = a; out.order.push(String(a.id)); }
    });
    return out;
  }
  function parseMzReviews(body) {
    const b = J(body);
    if (!b || !Array.isArray(b.userReviewList)) return { ok: false, list: [] };
    return { ok: true, list: b.userReviewList.map((m) => ({ id: String(m.userReviewId), rating: m.rating != null ? String(m.rating) : undefined, body: m.body,
      title: m.title, name: m.name, profileId: (String(m.viewUsersUserReviewsUrl || '').match(/userProfileId=(\d+)/) || [])[1] || null, date: m.date })) };
  }

  // ------------------------------------------------------------------------------------------- comparators
  // Each returns undefined (anchor absent -> not cross-checkable) or {ok, got, want, why?}.
  const R = (ok, got, want, why) => ({ ok: !!ok, got, want, why });
  // Expected anchor absences (gate-r1, RA5): an app-store page omits a block for a reason the lookup itself shows. These
  // absences are clustered (new-app charts are full of 1.0 apps; Apple's own apps share one page layout), so counting them
  // in the anchor-liveness test raised FIX_ANCHOR on unperturbed data. Measured on the 334 cached pages:
  //   lookup has no releaseNotes  <-> page has no "What's New" block (34/34 non-Apple; 1 unexplained page has the key)
  //   Apple first party (artistId 284417353): 16/27 pages have no version block, 16/27 no Size row
  //   visionOS-only apps (every supportedDevices entry AppleVision*): no breadcrumb genre, no iPhone screenshot shelf
  //   "Up to <size>" Size rows (on-demand resources) are not comparable to fileSizeBytes
  //   pre-order pages (1 cached) have no version block and no ratings; a zeroed ratings histogram = degraded render
  // -> {why, expected}: why 'nothing_to_verify' (the lookup value is empty too: no cell is left unverified) or
  //    'anchor_absent' + expected:<reason> (the cell is still unverified, but the absence is not anchor drift).
  const APPLE_ARTIST = '284417353';
  const visionOnly = (L) => Array.isArray(L.supportedDevices) && L.supportedDevices.length > 0 && L.supportedDevices.every((d) => /^AppleVision/i.test(String(d)));
  function expectedAbsent(col, src, L, a) {
    if (src !== 'webPage' || !L) return null;
    const apple = String(L.artistId) === APPLE_ARTIST;
    // a pre-order page (titleOfferDisplayProperties.isPreorder) has no version history and no ratings yet
    if (a && a.isPreorder === true && (col === 'lastUpdated' || col === 'releaseNotes' || col === 'totalReviews' || col === 'avgRating')) return { why: 'anchor_absent', expected: 'preorder_page' };
    if (col === 'lastUpdated' || col === 'releaseNotes') {
      if (L.releaseNotes == null || L.releaseNotes === '') return { why: 'nothing_to_verify', expected: 'no_release_notes' };
      if (apple) return { why: 'anchor_absent', expected: 'apple_first_party_page' };
    }
    if (col === 'appSizeInBytes') {
      if (a && a.sizeText && /up to/i.test(a.sizeText)) return { why: 'anchor_absent', expected: 'size_range_text' };
      if (apple) return { why: 'anchor_absent', expected: 'apple_first_party_page' };
    }
    if (col === 'appScreenshots' && Array.isArray(L.screenshotUrls) && L.screenshotUrls.length === 0) return { why: 'nothing_to_verify', expected: 'no_iphone_screenshots' };
    if ((col === 'genreIDs' || col === 'primaryGenre' || col === 'primaryGenreId' || col === 'appScreenshots') && visionOnly(L)) return { why: 'anchor_absent', expected: 'vision_only_app' };
    if ((col === 'genreIDs' || col === 'primaryGenre' || col === 'primaryGenreId' || col === 'appScreenshots' || col === 'supportedDeviceList') && apple && (L.kind === 'mac-software' || visionOnly(L))) return { why: 'anchor_absent', expected: 'apple_first_party_page' };
    if (col === 'supportedDeviceList' && L.kind === 'mac-software') return { why: 'anchor_absent', expected: 'mac_app' };
    // a zeroed ratings histogram while the lookup has ratings = a degraded page render (avgRating reports the same class)
    if (col === 'totalReviews' && a && a.hist && Math.round(a.hist.total || 0) === 0 && (L.userRatingCount || 0) > 0) return { why: 'anchor_absent', expected: 'page_degraded_zeroed_histogram' };
    // a non-English page whose translated row or link could not be recognised: unverified, never anchor drift (SE-D)
    if (a && a.localized && LOCALIZED_LABEL[col]) return { why: 'anchor_absent', expected: 'localized_page' };
    return null;
  }
  // columns read from a translated label (info-shelf title, link text) / compared as translated display text
  const LOCALIZED_LABEL = { appSizeInBytes: 1, requiredOsVersion: 1, developerWebsite: 1, contentRating: 1 };
  const LOCALIZED_TEXT = { genres: 1, primaryGenre: 1 };
  const COMPARE = {
    id: (L, a) => a.id == null ? undefined : R(String(L.trackId) === String(a.id), a.id, L.trackId),
    appId: (L, a) => a.bundleId == null ? undefined : R(String(a.bundleId).toLowerCase() === String(L.bundleId || '').toLowerCase(), a.bundleId, L.bundleId, a.bundleId !== L.bundleId && String(a.bundleId).toLowerCase() === String(L.bundleId || '').toLowerCase() ? 'case_only' : undefined),
    appName: (L, a) => a.name == null ? undefined : R(a.name === L.trackName, a.name, L.trackName),
    url: (L, a, ctx) => {
      if (a.url == null && a.id == null) return undefined;
      const lid = idOf(L.trackViewUrl), lcc = ccOf(L.trackViewUrl);
      const ok = lid === String(L.trackId) && (a.url == null || idOf(a.url) === lid) && (a.cc == null || lcc == null || a.cc === lcc);
      return R(ok, a.url, L.trackViewUrl);
    },
    icon: (L, a) => a.iconDir == null ? undefined : R(a.iconDir === dirOf(L.artworkUrl512 || L.artworkUrl100 || L.artworkUrl60), a.iconDir, dirOf(L.artworkUrl512 || L.artworkUrl100 || L.artworkUrl60)),
    genres: (L, a) => {
      if (!Array.isArray(a.genres) || !Array.isArray(L.genres)) return undefined;
      const ids = (L.genreIds || []).map(String), game = ids.map((g, i) => [g, L.genres[i]]).filter(([g]) => +g >= 7001 && +g <= 7019).map(([, n]) => n);
      const want = game.length ? game : L.genres;
      return R(want.join(',') === a.genres.join(','), a.genres.join(','), want.join(','));
    },
    genreIDs: (L, a) => {
      const inc2 = [].concat(a.genreIdsIncl || [], a.primaryGenreId != null && !a.genreIdsIncl ? [a.primaryGenreId] : []);
      if (!inc2.length) return undefined;
      const have = (L.genreIds || []).map(String);
      return R(inc2.every((g) => have.includes(String(g))), inc2.join(','), have.join(','));
    },
    // the same genre id under Apple's two spellings (the lookup's "Book", the feed's and the page's "Books": stress rerender
    // of a live Magazines & Newspapers chart, 20 of 50 rows) is the same value, compared by id and canonical name
    primaryGenre: (L, a) => {
      if (a.primaryGenreName == null) return undefined;
      if (a.primaryGenreName === L.primaryGenreName) return R(true, a.primaryGenreName, L.primaryGenreName);
      const variant = a.primaryGenreId != null && String(a.primaryGenreId) === String(L.primaryGenreId) && PRIMARY_GENRE[String(L.primaryGenreId)] === L.primaryGenreName;
      return R(variant, a.primaryGenreName, L.primaryGenreName, variant ? 'genre_name_variant' : undefined);
    },
    primaryGenreId: (L, a) => a.primaryGenreId == null ? undefined : R(String(a.primaryGenreId) === String(L.primaryGenreId), a.primaryGenreId, L.primaryGenreId),
    requiredOsVersion: (L, a) => a.minOs == null ? undefined : R(osNorm(a.minOs) === osNorm(L.minimumOsVersion), a.minOs, L.minimumOsVersion),
    originalReleaseDate: (L, a) => {
      if (a.releaseDate == null || L.releaseDate == null) return undefined;
      const g = String(a.releaseDate);
      // RSS im:releaseDate is Pacific wall clock with a hard-coded -07:00 (like review dates): compare wall clocks.
      if (/T\d\d:\d\d:\d\d-07:00$/.test(g)) return R(g.slice(0, 19) === pacificWall(L.releaseDate), g, L.releaseDate);
      // platform objects give a calendar date: accept the UTC or the Pacific date of the lookup instant.
      if (/^\d{4}-\d{2}-\d{2}$/.test(g)) return R(g === String(L.releaseDate).slice(0, 10) || g === String(pacificWall(L.releaseDate)).slice(0, 10), g, L.releaseDate);
      return R(Date.parse(g) === Date.parse(L.releaseDate), g, L.releaseDate);
    },
    // The page and the lookup date the SAME version to the second: 263 of 266 distinct same-version pairs of the page
    // cache and 750 of 752 of the saved campaign runs. The 5 others have the page EARLIER, by 0.7 days to 2 years, and all
    // 5 are a storefront's availability date: the lookup dates the version at the app's arrival there, so its release
    // date equals it (NR: Smolov 1.2 built 2018-06-16, lookup 2020-05-30T07:00:00Z = its NR release date). Never later.
    // So, at the same version (checkRow), a gross miss (hard) is: the page more than an hour AFTER the lookup (the lookup
    // date moved back: stress round 3, 5 days back shipped READY), or more than a day BEFORE it while the lookup's update
    // date is not its release date (moved forward). A page date with no time of day (00:00:00Z) gets 36 hours either way.
    lastUpdated: (L, a) => {
      if (a.lastUpdated == null) return undefined;
      const want = L.currentVersionReleaseDate || L.releaseDate, ok = a.lastUpdated === isoSec(want);
      const d = Date.parse(a.lastUpdated) - Date.parse(want), dayOnly = /T00:00:00Z$/.test(a.lastUpdated);
      const avail = Date.parse(L.releaseDate) === Date.parse(want);
      const gross = !ok && isFinite(d) && (d > (dayOnly ? 36 : 1) * 3600e3 || (-d > (dayOnly ? 36 : 24) * 3600e3 && !avail));
      return Object.assign(R(ok, a.lastUpdated, want, gross ? 'date_grossly_differs' : undefined), gross ? { gross: true } : {});
    },
    // The page serves CRLF where the lookup has LF (SMAR's cleanText flattens both): compare with line endings unified.
    releaseNotes: (L, a) => a.releaseNotes === undefined ? undefined : R(nl(a.releaseNotes) === nl(L.releaseNotes), (a.releaseNotes || '').slice(0, 60), (L.releaseNotes || '').slice(0, 60)),
    price: (L, a) => a.price == null || a.price === '' ? undefined : (L.price === undefined ? R(true, a.price, undefined, 'lookup_price_absent') : R(Math.abs(Number(a.price) - Number(L.price)) < 1e-9, a.price, L.price)),
    currency: (L, a) => a.currency == null ? undefined : R(a.currency === L.currency, a.currency, L.currency),
    developerId: (L, a) => a.artistId == null ? undefined : R(String(a.artistId) === String(L.artistId), a.artistId, L.artistId),
    developer: (L, a) => a.artistName == null ? undefined : R(a.artistName === L.artistName, a.artistName, L.artistName),
    developerAppStorePageURL: (L, a) => a.artistUrl == null ? undefined : R(idOf(a.artistUrl) === idOf(L.artistViewUrl) && idOf(L.artistViewUrl) === String(L.artistId), a.artistUrl, L.artistViewUrl),
    developerWebsite: (L, a) => a.website === undefined ? undefined : R(str(a.website) === str(L.sellerUrl), a.website, L.sellerUrl),
    totalReviews: (L, a) => {
      const n = a.hist ? a.hist.total : a.ratingCount;
      if (n == null || (a.hist && Math.round(n) === 0 && (L.userRatingCount || 0) > 0)) return undefined;
      const want = L.userRatingCount || 0, d = Math.abs(Math.round(n) - want);
      const ok = d <= Math.max(50, 0.005 * want);
      // a page histogram total and a lookup count off by more than a factor 0.8 is no counter lag (lowest real ratio on
      // the 276 cached page/lookup pairs with a non-zero histogram: 0.96): the count was rescaled or moved (stress FI-01)
      const gross = !ok && (Math.min(Math.round(n), want) + 1) / (Math.max(Math.round(n), want) + 1) < 0.8;
      return Object.assign(R(ok, Math.round(n), want, gross ? 'count_grossly_differs' : d ? 'counter_differs' : undefined), gross ? { gross: true } : {});
    },
    supportedDeviceList: (L, a) => {
      if (!Array.isArray(a.appPlatforms) || !Array.isArray(L.supportedDevices)) return undefined;
      if (!a.appPlatforms.includes('pad')) return R(true);
      return R(L.supportedDevices.some((x) => /^iPad/i.test(x)), 'pad', 'no iPad device');
    },
    appScreenshots: (L, a) => a.phoneShots == null || !Array.isArray(L.screenshotUrls) ? undefined : R(a.phoneShots === L.screenshotUrls.length, a.phoneShots, L.screenshotUrls.length),
    appSizeInBytes: (L, a) => {
      if (!a.sizeText || /up to/i.test(a.sizeText) || L.fileSizeBytes == null) return undefined;
      const b = Number(L.fileSizeBytes); if (!isFinite(b)) return undefined;
      const f = (x, u) => { const s = x.toFixed(1).replace(/\.0$/, ''); return s + ' ' + u; };
      const cand = b >= 1e9 ? [f(b / 1e9, 'GB')] : b >= 1e6 ? [f(b / 1e6, 'MB')] : [f(b / 1e3, 'KB')];
      const got = a.sizeText.replace(/\s/g, ' ');
      return R(cand.includes(got), a.sizeText, cand[0]);
    },
  };
  const SRC_COLS = {
    webPage: ['id', 'appId', 'appName', 'url', 'icon', 'genres', 'genreIDs', 'primaryGenre', 'primaryGenreId', 'contentRating', 'appSizeInBytes',
      'requiredOsVersion', 'lastUpdated', 'releaseNotes', 'price', 'currency', 'developerId', 'developer', 'developerAppStorePageURL',
      'developerWebsite', 'avgRating', 'totalReviews', 'supportedDeviceList', 'appScreenshots'],
    // userRating.ratingCount on product-dv / lockups agreed with the lookup on only 86% / 65% of pairs: dropped (PLAN 3.5).
    productDv: ['id', 'appId', 'appName', 'url', 'genreIDs', 'requiredOsVersion', 'originalReleaseDate', 'price', 'developerId', 'developer', 'developerAppStorePageURL'],
    lockup: ['id', 'appId', 'appName', 'url', 'genreIDs', 'requiredOsVersion', 'originalReleaseDate', 'price', 'developerId', 'developer', 'developerAppStorePageURL'],
    rss: ['id', 'appId', 'appName', 'url', 'genreIDs', 'primaryGenre', 'primaryGenreId', 'originalReleaseDate', 'price', 'currency', 'developerId', 'developer'],
  };

  // ------------------------------------------------------------------------------------------- FS-08 ratings
  const ROUND_LO = -0.6e-5, ROUND_HI = 1.6e-5;
  function checkRatings(o) {
    const L = o.lookup || {}, out = [];
    // a lookup rating or count that is not a number cannot be compared (it is quarantined by the type contract, typeCells)
    for (const k of ['averageUserRating', 'userRatingCount']) {
      if (L[k] !== undefined && !TYPE_OK[LOOKUP_TYPES[k]](L[k])) return { status: 'not_comparable', checks: [{ status: 'not_comparable', cls: 'lookup_' + k + '_not_' + LOOKUP_TYPES[k], got: describe(L[k]) }] };
    }
    const n = Number(L.userRatingCount) || 0, avg = Number(L.averageUserRating) || 0;
    if (o.delivered) {
      for (const [k, v] of [['avgRating', L.averageUserRating], ['totalReviews', L.userRatingCount], ['currentVersionAvgRating', L.averageUserRatingForCurrentVersion], ['currentVersionReviews', L.userRatingCountForCurrentVersion]]) {
        const got = str(o.delivered[k]), want = str(v);
        if (got === want) continue;
        let why = 'value_differs_from_lookup';
        if (/[KMB]$/i.test(got) || /,/.test(got)) why = 'copied_abbreviated_or_formatted_count';
        else if (/^\d(\.\d)?$/.test(got) && Math.abs(Number(got) - Math.round(Number(want) * 10) / 10) < 1e-9) why = 'copied_1dp_display_rating';
        out.push({ status: 'quarantine', cls: why, field: k, got, want });
      }
    }
    let page = o.hist;
    if (page && Array.isArray(page.counts) && page.counts.length === 5) {
      const c = page.counts.map((x) => Math.round(x)), t = c.reduce((s, x) => s + x, 0);
      page = { total: Math.round(page.total), histTotal: t, histMean: t ? c.reduce((s, x, i) => s + x * (5 - i), 0) / t : null };
    } else if (page) page = { total: Math.round(page.total), histTotal: null, histMean: null };
    if (!page) out.push({ status: 'not_comparable', cls: 'page_missing' });
    else if (page.total === 0 && n > 0) out.push({ status: 'not_comparable', cls: 'page_degraded_zeroed_histogram' });
    else if (page.histTotal !== page.total) out.push({ status: 'not_comparable', cls: 'page_internal_inconsistent' });
    else if (page.total === 0 && n === 0) out.push({ status: 'ok', cls: 'no_ratings' });
    else {
      const d = page.histMean - avg;
      if (page.total === n) out.push(d >= ROUND_LO && d <= ROUND_HI ? { status: 'ok', cls: 'hist_matches', d } : { status: 'quarantine', cls: 'rating_mismatch_same_count', d });
      else {
        const dn = Math.abs(page.total - n), bound = 1e-3 + 4 * dn / Math.max(1, Math.min(page.total, n));
        out.push(Math.abs(d) <= bound ? { status: 'drift', cls: 'page_snapshot_lag', d, dn } : { status: 'quarantine', cls: 'rating_mismatch_beyond_lag', d, dn });
      }
    }
    if (o.ldRating !== undefined && o.ldRating !== null && n > 0 && page && page.total === n) {
      if (Math.abs(Number(o.ldRating) - Math.round(avg * 10) / 10) > 1e-9) out.push({ status: 'quarantine', cls: 'ld_1dp_disagrees', ld: o.ldRating, avg });
    }
    const status = ['quarantine', 'drift', 'not_comparable', 'ok'].find((s) => out.some((x) => x.status === s)) || 'ok';
    return { status, checks: out };
  }

  // ------------------------------------------------------------------------------------------- FS-05 age rating
  // the BR storefront's lookup spells the legacy scale with a leading plus ("+4", "+12", "+17": 3/3 sampled apps in BR,
  // 0 in 25 other storefronts, live 2026-10-03; SMAR writes it as is). Only for BR, only for membership tests: the
  // value written is never changed, and a "+N" in any other store (or a BR value off the scale) still alerts.
  function legacyAge(v, cc) {
    return String(cc || '').toUpperCase() === 'BR' && typeof v === 'string' && /^\+\d{1,2}$/.test(v) ? v.slice(1) + '+' : v;
  }
  function checkContentRating(lv, pv, cc) {
    if (pv == null || pv === '') return { r: 'na' };
    if (lv == null || lv === '') return { r: 'na', flag: 'lookup_rating_absent' };
    lv = legacyAge(lv, cc);
    if (!LEGACY_AGE.includes(lv) || !NEW_AGE.includes(pv)) return { r: 'warn', flag: 'age_scale_unexpected', drift: true, got: pv, want: lv };
    return (AGE_ALLOW[lv] || []).includes(pv) ? { r: 'pass' } : { r: 'warn', flag: 'age_scale_unexpected', got: pv, want: lv };
  }

  // ------------------------------------------------------------------------------------------- invariants
  function invariants(L, ctx) {
    ctx = ctx || {};
    const out = [], cc = ctx.cc ? String(ctx.cc).toLowerCase() : null;
    const add = (col, ok, why) => out.push({ col, ok: !!ok, why });
    add('url', idOf(L.trackViewUrl) === String(L.trackId), 'url_has_id');
    if (cc) add('url', ccOf(L.trackViewUrl) === cc, 'url_has_cc');
    add('developerAppStorePageURL', L.artistViewUrl == null || idOf(L.artistViewUrl) === String(L.artistId), 'artist_url_has_artist_id');
    if (ctx.expectCurrency) add('currency', L.currency === ctx.expectCurrency, 'storefront_currency');
    add('id', L.kind === 'software' || L.kind === 'mac-software', 'kind');
    const canary = L.averageUserRatingForCurrentVersion === L.averageUserRating && L.userRatingCountForCurrentVersion === L.userRatingCount;
    out.push({ col: 'currentVersionAvgRating', ok: true, canary: !canary, why: 'current_version_equals_overall' });
    return out;
  }
  // ------------------------------------------------------------------------------------------- semantic contract
  // Stress FI-01/FI-02 (2026-10-03): a value that trades places with another plausible value (ratings <-> price, genre
  // <-> seller, languages <-> devices, version <-> minimum OS, release <-> update date) passes every type check, and on a
  // 1-2 app run no population signal can see it. Each rendered lookup key therefore has a semantic validator that reads
  // only the same lookup record, and a few cross-field invariants tie keys together. Measured on every distinct cached
  // lookup record (35,667 records, eval/appstore/cache 2026-10-01..03, lane AB corpus_measure*.js): 0 violations of every
  // rule below (cur-version count <= count: 1 record off by 2, inside the tolerance). A failure is a HARD failure of
  // source 'semantic' (quarantined in default mode even when a page shows another version; reported as unverified in
  // compat), counts toward column drift like any hard check (>= max(3, 10%) of the rows that evaluated it), and names
  // its swap partner: a key B whose value passes A's validator while A's value does not fail B's is blamed with A.
  //   price            agrees with formattedPrice (no digit = free = 0; else the same digits, leading/trailing 0s aside)
  //   primaryGenreName the English name of primaryGenreId (PRIMARY_GENRE, one name per id in every storefront) or
  //                    genres[] at primaryGenreId's index;   primaryGenreId is one of genreIds
  //   genres           as many names as genreIds, none a language code / device id / URL
  //   contentAdvisory  a rating token (legacy 4+/9+/12+/17+, the 2025 13+/16+/18+, BR's "+4")
  //   languageCodes    2-letter upper-case codes            supportedDevices   Apple device ids (iPhone15-iPhone15, ...)
  //   minimumOsVersion an OS version: major 1..40, minor and patch <= 19 (corpus: majors 2..27, minor <= 15, patch <= 8;
  //                    visionOS-only apps require 1.0 / 1.1: stress rerender of live new-app charts)
  //   version          text with a digit, <= 40 chars, not a URL / date / rating token / price, not another name field
  //   icon             the rendered icon is Apple's 512x512 artwork URL (artworkUrl512 present on 35,667/35,667)
  //   sellerUrl        an http(s) URL that is not an mzstatic image
  //   screenshots      iPhone shots are taller than 10:7 (0.46-0.67), iPad shots are not (0.75-0.77)
  //   releaseNotes     not a lone URL / version / rating token / price word, not the developer's or the app's name
  //   fileSizeBytes    >= 100 kB (corpus minimum 361 kB), and >= 1 MB / 5 MB / 20 MB when the app has 10,000+ / 100,000+ /
  //                    1,000,000+ ratings (Apple's own apps aside)
  //   dates            releaseDate and currentVersionReleaseDate >= 2008-01-01 and releaseDate <= currentVersionReleaseDate
  //   ratings          averageUserRating > 0 exactly when userRatingCount > 0 (and 1..5 then); the same for the current
  //                    version; userRatingCountForCurrentVersion <= userRatingCount (+ max(3, 1%) counter lag)
  //   ids              trackViewUrl carries trackId and artistViewUrl carries artistId (both sides fail together)
  //   names            bundleId (letters/digits/. _ -, a letter, not a bare version), trackName and artistName (not a bare
  //                    version, URL, date or rating token)
  const PRIMARY_GENRE = { 6000: 'Business', 6001: 'Weather', 6002: 'Utilities', 6003: 'Travel', 6004: 'Sports', 6005: 'Social Networking',
    6006: 'Reference', 6007: 'Productivity', 6008: 'Photo & Video', 6009: 'News', 6010: 'Navigation', 6011: 'Music', 6012: 'Lifestyle',
    6013: 'Health & Fitness', 6014: 'Games', 6015: 'Finance', 6016: 'Entertainment', 6017: 'Education', 6018: 'Book', 6020: 'Medical',
    6021: 'Magazines & Newspapers', 6023: 'Food & Drink', 6024: 'Shopping', 6025: 'Stickers', 6026: 'Developer Tools', 6027: 'Graphics & Design' };
  const AGE_TOKENS = ['4+', '9+', '12+', '17+', '13+', '16+', '18+'];
  const AGE_LIKE = /^(\+\d{1,2}|\d{1,2}\+)$/; // a rating token ("12+", BR "+12"), never a bare number
  const LANG_RE = /^[A-Z]{2}$/;
  const DEVICE_RE = /^(iPhone|iPad|iPod|Watch|AppleTV|AppleVision|Mac)[A-Za-z0-9]*-[A-Za-z0-9-]+$/;
  const MZ_RE = /^https:\/\/is\d+(-ssl)?\.mzstatic\.com\//i;
  const ICON512_RE = /\/512x512bb\.(jpe?g|png|webp)$/i;
  const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T/;
  const EPOCH_2008 = Date.parse('2008-01-01T00:00:00Z');
  const COMPANY_RE = /(^|[\s,])(inc|llc|l\.l\.c|ltd|limited|gmbh|corp|corporation|co|company|s\.?a|s\.?l|s\.?r\.?l|pty|plc|ag|b\.?v|oy|ab|kg|kk|lp|l\.p)\.?$/i;
  const shotRatio = (u) => { const m = String(u).match(/\/(\d+)x(\d+)[a-z]*\.(?:jpe?g|png|webp)$/i); return m ? Math.min(+m[1], +m[2]) / Math.max(+m[1], +m[2]) : null; };
  const digitsCore = (s) => String(s).replace(/\D/g, '').replace(/^0+/, '').replace(/0+$/, '');
  const nameFields = (L) => [L.sellerName, L.artistName, L.trackName].filter((x) => typeof x === 'string' && x);
  // per-key validators: (value, record, cc) -> true | false | null (null = cannot tell: not evaluated)
  const SEM = {
    price: (v, L) => {
      if (typeof L.formattedPrice !== 'string' || v === undefined || v === null || v === '') return null;
      const n = asNum(v); if (!isFinite(n)) return false;
      const fd = digitsCore(L.formattedPrice);
      if (!/\d/.test(L.formattedPrice)) return n === 0;
      return n > 0 && fd === digitsCore(String(n));
    },
    primaryGenreName: (v, L) => {
      if (typeof v !== 'string' || !v) return v === undefined ? null : false;
      const id = String(L.primaryGenreId), known = PRIMARY_GENRE[id];
      const ids = Array.isArray(L.genreIds) ? L.genreIds.map(String) : [], alt = Array.isArray(L.genres) ? L.genres[ids.indexOf(id)] : undefined;
      if (v === known || v === alt) return true;
      if (known === undefined && alt === undefined) return !(isHttp(v) || AGE_LIKE.test(v) || nameFields(L).includes(v)) ? null : false;
      return false;
    },
    genres: (v, L) => {
      if (!Array.isArray(v)) return v === undefined ? null : false;
      if (Array.isArray(L.genreIds) && v.length !== L.genreIds.length) return false;
      return v.every((x) => typeof x === 'string' && x !== '' && !LANG_RE.test(x) && !DEVICE_RE.test(x) && !isHttp(x));
    },
    contentAdvisoryRating: (v, L, cc) => (v === undefined ? null : typeof v === 'string' && AGE_TOKENS.includes(legacyAge(v, cc))),
    languageCodesISO2A: (v) => (v === undefined ? null : Array.isArray(v) && v.every((x) => typeof x === 'string' && LANG_RE.test(x))),
    supportedDevices: (v) => (v === undefined ? null : Array.isArray(v) && v.every((x) => typeof x === 'string' && DEVICE_RE.test(x))),
    minimumOsVersion: (v) => {
      if (v === undefined) return null;
      const m = typeof v === 'string' ? v.match(/^(\d{1,2})(?:\.(\d{1,2}))?(?:\.(\d{1,2}))?$/) : null;
      return !!m && +m[1] >= 1 && +m[1] <= 40 && (m[2] == null || +m[2] <= 19) && (m[3] == null || +m[3] <= 19); // visionOS 1.x
    },
    // real versions: 35,664 of 35,667 hold a digit ("5.3.0 (21)", "v1.2", "Tarot 3.4.204+204"); 3 do not ("icon exp", one
    // app). So a version is refused only for what no version is: a URL, date, rating token, price, currency code, bundle
    // id, a genre or name field of the record, a company name, or 3+ words without a digit
    version: (v, L) => {
      if (v === undefined) return null;
      if (typeof v !== 'string' || !v.trim() || v.length > 40) return false;
      if (isHttp(v) || ISO_DATE_RE.test(v) || AGE_LIKE.test(v) || /^[$€£¥₹₩]/.test(v) || v === L.formattedPrice || /^free$/i.test(v.trim())) return false;
      if (/^[A-Z]{3}$/.test(v) || (/^[a-z][\w-]*(\.[a-z][\w-]*){2,}$/i.test(v) && !/\d/.test(v))) return false;
      if (nameFields(L).concat([L.primaryGenreName]).includes(v) || Object.values(PRIMARY_GENRE).includes(v) || (Array.isArray(L.genres) && L.genres.includes(v))) return false;
      if (!/\d/.test(v) && (COMPANY_RE.test(v.trim()) || v.trim().split(/\s+/).length >= 3)) return false;
      return true;
    },
    // not rendered, validated only to name a swap partner (a version or a date in the seller slot points at its owner)
    sellerName: (v) => (v === undefined ? null : typeof v === 'string' && !!v.trim() && !/^v?\d+(\.\d+)+$/.test(v.trim()) && !isHttp(v) && !ISO_DATE_RE.test(v) && !AGE_LIKE.test(v.trim()) && !/^free$/i.test(v.trim())),
    trackContentRating: (v, L, cc) => (v === undefined ? null : typeof v === 'string' && AGE_TOKENS.includes(legacyAge(v, cc))),
    // not rendered: a description is prose (>= 13 characters on the corpus), never a lone name, URL, version, rating or price
    description: (v, L) => {
      if (v === undefined || v === null || v === '') return null;
      if (typeof v !== 'string') return false;
      const t = v.trim();
      return !(t.length < 12 || /^https?:\/\/\S+$/.test(t) || /^v?\d+(\.\d+)*$/i.test(t) || AGE_LIKE.test(t) || /^free$/i.test(t) || /^[$€£¥₹₩]\s?\d/.test(t)
        || nameFields(L).includes(v) || (t.length <= 40 && COMPANY_RE.test(t)));
    },
    artworkUrl100: (v) => (v === undefined ? null : typeof v === 'string' && MZ_RE.test(v) && /\/100x100bb\.(jpe?g|png|webp)$/i.test(v)),
    artworkUrl512: (v, L) => { const icon = L.artworkUrl512 || L.artworkUrl100 || L.artworkUrl60; return icon === undefined ? null : typeof icon === 'string' && MZ_RE.test(icon) && ICON512_RE.test(icon); },
    sellerUrl: (v) => (v === undefined || v === null ? null : isHttp(v) && !MZ_RE.test(v)),
    screenshotUrls: (v) => (!Array.isArray(v) ? (v === undefined ? null : false) : v.every((u) => { const q = shotRatio(u); return typeof u === 'string' && MZ_RE.test(u) && (q == null || q <= 0.7); })),
    ipadScreenshotUrls: (v) => (!Array.isArray(v) ? (v === undefined ? null : false) : v.every((u) => { const q = shotRatio(u); return typeof u === 'string' && MZ_RE.test(u) && (q == null || q >= 0.7); })),
    releaseNotes: (v, L) => {
      if (v === undefined || v === null || v === '') return null;
      if (typeof v !== 'string') return false;
      const t = v.trim();
      if (t.length < 4 || /^https?:\/\/\S+$/.test(t) || /^v?\d+(\.\d+){0,3}$/i.test(t) || AGE_LIKE.test(t) || /^free$/i.test(t) || t === L.formattedPrice) return false;
      return !nameFields(L).includes(v);
    },
    // and an app of under 1 MB never has 10,000 ratings: on 9,892 distinct cached apps the 56 under 1 MB have at most 550
    // (under 2 MB: 197 apps, at most 599). Apple's own apps are stubs (Journal 4.2 MB with 326,682 ratings) and exempt.
    // Catches a size rescaled /1000 (kB in the bytes slot) on a 1-2 app run with no page to compare (stress regression:
    // apps.apple.com down, Strava 460276 and Duolingo 515191 shipped READY). Two more floors (fix loop round 2: the same
    // run /100 shipped Strava 4.6 MB at 375,745 ratings and Duolingo 5.2 MB at 5.5M ratings READY): 5 MB at 100,000+
    // ratings and 20 MB at 1,000,000+. On the AB lookup corpus (10,598 app/storefront pairs of 9,756 apps, 13
    // storefronts) the smallest app with 100,000+ ratings is 22.0 MB (701 pairs, PayRange) and with 1,000,000+ 61.8 MB
    // (171 pairs, Temu): each floor sits 3-4x under the smallest real size. A rescale that stays at or above the floor
    // (Strava /50 = 9.2 MB) is a documented limit, not a floor to raise (schema Known limits; fix loop round 3 measured
    // that even a floor at the smallest real size passes /20 on 26% of the 100,000+ pairs).
    fileSizeBytes: (v, L) => {
      if (v === undefined) return null;
      const n = asNum(v);
      if (!(Number.isInteger(n) && n >= 1e5)) return false;
      if (String(L.artistId) === APPLE_ARTIST) return true;
      const c = asNum(L.userRatingCount);
      return !((n < 1e6 && c >= 1e4) || (n < 5e6 && c >= 1e5) || (n < 2e7 && c >= 1e6));
    },
    // identity: the store URLs carry the ids (0 violations); each side names the other as its swap partner
    trackId: (v, L) => (v === undefined || L.trackViewUrl === undefined ? null : String(v) === idOf(L.trackViewUrl)),
    trackViewUrl: (v, L) => (v === undefined || L.trackId === undefined ? null : isHttp(v) && idOf(v) === String(L.trackId)),
    artistId: (v, L) => (v === undefined || L.artistViewUrl == null ? null : String(v) === idOf(L.artistViewUrl)),
    artistViewUrl: (v, L) => (v == null || L.artistId === undefined ? null : isHttp(v) && idOf(v) === String(L.artistId)),
    // names: never a bare version number, a URL, a date or a rating token (0 of 35,667 records)
    bundleId: (v) => (v === undefined ? null : typeof v === 'string' && /^[A-Za-z0-9._-]+$/.test(v) && /[A-Za-z]/.test(v) && !/^v?\d+(\.\d+)+$/.test(v)),
    trackName: (v) => (v === undefined ? null : typeof v === 'string' && !!v.trim() && !/^v?\d+(\.\d+)+$/.test(v.trim()) && !isHttp(v) && !ISO_DATE_RE.test(v) && !AGE_LIKE.test(v.trim())),
    artistName: (v) => (v === undefined ? null : typeof v === 'string' && !!v.trim() && !/^v?\d+(\.\d+)+$/.test(v.trim()) && !isHttp(v) && !ISO_DATE_RE.test(v) && !AGE_LIKE.test(v.trim())),
    releaseDate: (v) => (v === undefined ? null : typeof v === 'string' && Date.parse(v) >= EPOCH_2008),
    currentVersionReleaseDate: (v) => (v === undefined ? null : typeof v === 'string' && Date.parse(v) >= EPOCH_2008),
    // the primary genre id is one of the record's genre ids (35,667/35,667); as a validator it also names the field that
    // holds the id when the two traded places (stress round 3: userRatingCountForCurrentVersion <-> primaryGenreId shipped
    // currentVersionReviews 6013, Strava's genre id, while the genre columns were blanked)
    primaryGenreId: (v, L) => (v === undefined || !Array.isArray(L.genreIds) ? null : (typeof v === 'number' || typeof v === 'string') && v !== '' && L.genreIds.map(String).includes(String(v))),
  };
  // lookup string fields an app page's version never equals (on the 334 cached pages the page version always equals the
  // lookup's own version, and no record's name/genre/rating/price field looks like a version): the page's version in
  // one of them is that field and version traded places (minimumOsVersion is tested separately, with its own guards)
  const VERSION_HOLDERS = ['sellerName', 'artistName', 'trackName', 'primaryGenreName', 'contentAdvisoryRating', 'trackContentRating', 'formattedPrice',
    'releaseNotes', 'description', 'bundleId', 'currency', 'sellerUrl'];
  // lookup fields whose text can look like a version: a lookup version EQUAL to one of them while an app page or a
  // platform object shows another version is that field copied into the version slot (stress round 2: version =
  // minimumOsVersion shipped '17.0' for Strava while its page showed 483.0.0). Real coincidences exist (50,108 distinct
  // records: version = minimumOsVersion 6, = averageUserRating 19, = userRatingCount 10), but on the 2,651 cached
  // page/lookup pairs none of them had a page version that differs, so a copy needs both.
  const VERSION_COPY_FROM = ['minimumOsVersion', 'averageUserRating', 'averageUserRatingForCurrentVersion', 'userRatingCount', 'userRatingCountForCurrentVersion',
    'price', 'fileSizeBytes', 'trackId', 'artistId', 'primaryGenreId'];
  const versionCopiedFrom = (L) => (L && L.version != null && L.version !== '' ? VERSION_COPY_FROM.find((k) => L[k] != null && L[k] !== '' && String(L[k]) === String(L.version)) || null : null);
  // columns whose comparator matches the VALUE itself (not a presence or platform test): a pass confirms the cell
  // (avgRating: the page histogram's mean at the same rating count, checkRatings 'hist_matches')
  const CONFIRMS = { currentAppVersion: 1, requiredOsVersion: 1, primaryGenre: 1, price: 1, releaseNotes: 1, lastUpdated: 1, originalReleaseDate: 1,
    appSizeInBytes: 1, genres: 1, developerWebsite: 1, totalReviews: 1, avgRating: 1 };
  // keys whose validator is specific enough to name a swap partner by value (see semanticCheck)
  // (version, releaseNotes, genres, sellerUrl accept most text / lists / URLs: they name a partner only when the
  // partner's own validator accepts their value)
  const SEM_STRONG = ['price', 'primaryGenreName', 'contentAdvisoryRating', 'languageCodesISO2A', 'supportedDevices', 'minimumOsVersion',
    'artworkUrl512', 'screenshotUrls', 'ipadScreenshotUrls', 'trackId', 'trackViewUrl', 'artistId', 'artistViewUrl', 'primaryGenreId'];
  // every key a swap partner may come from (rendered or not: a non-rendered partner such as sellerName is only reported)
  const SEM_POOL = ['price', 'userRatingCount', 'averageUserRating', 'userRatingCountForCurrentVersion', 'averageUserRatingForCurrentVersion', 'trackId',
    'artistId', 'primaryGenreId', 'version', 'minimumOsVersion', 'releaseDate', 'currentVersionReleaseDate', 'trackName', 'artistName', 'sellerName',
    'sellerUrl', 'artistViewUrl', 'trackViewUrl', 'artworkUrl512', 'artworkUrl100', 'artworkUrl60', 'currency', 'formattedPrice', 'contentAdvisoryRating',
    'trackContentRating', 'primaryGenreName', 'releaseNotes', 'description', 'fileSizeBytes', 'bundleId', 'genres', 'genreIds', 'languageCodesISO2A',
    'screenshotUrls', 'ipadScreenshotUrls', 'appletvScreenshotUrls', 'supportedDevices'];
  // semanticCheck(raw, {cc}) -> {fails:[{col, key, why, partnerOf?}], evaluated:[col]}  (cols are CSV column names)
  function semanticCheck(L, ctx) {
    const out = { fails: [], evaluated: [] };
    if (!isObj(L)) return out;
    const cc = ctx && ctx.cc, skip = (ctx && ctx.skipCols) || {};
    const seen = {};
    const fail = (col, key, why, partnerOf) => { if (!col || skip[col]) return; const k = col + '|' + why; if (seen[k]) return; seen[k] = 1; out.fails.push(Object.assign({ col, key, why }, partnerOf ? { partnerOf } : {})); };
    const evald = (col) => { if (col && !skip[col] && !out.evaluated.includes(col)) out.evaluated.push(col); };
    const failedKeys = [];
    for (const [key, f] of Object.entries(SEM)) {
      const col = LOOKUP_COL[key] || (key === 'artworkUrl512' ? 'icon' : null);
      let r; try { r = f(L[key], L, cc); } catch (e) { r = false; }
      if (r === null) continue;
      evald(col);
      if (r === false) { if (col) fail(col, key, 'semantic_' + key); else out.fails.push({ col: null, key, why: 'semantic_' + key, unrendered: true }); failedKeys.push(key); }
    }
    const pair = (ok, keys, why) => { for (const k of keys) evald(LOOKUP_COL[k]); if (!ok) for (const k of keys) fail(LOOKUP_COL[k], k, why); };
    const num = (k) => asNum(L[k]);
    if (L.userRatingCount !== undefined && L.averageUserRating !== undefined && isFinite(num('userRatingCount')) && isFinite(num('averageUserRating'))) {
      const n = num('userRatingCount'), a = num('averageUserRating');
      pair((n > 0) === (a > 0) && (n === 0 || (a >= 1 && a <= 5)), ['averageUserRating', 'userRatingCount'], 'rating_vs_count');
    }
    if (L.userRatingCountForCurrentVersion !== undefined && L.averageUserRatingForCurrentVersion !== undefined && isFinite(num('userRatingCountForCurrentVersion')) && isFinite(num('averageUserRatingForCurrentVersion'))) {
      const n = num('userRatingCountForCurrentVersion'), a = num('averageUserRatingForCurrentVersion');
      pair((n > 0) === (a > 0) && (n === 0 || (a >= 1 && a <= 5)), ['averageUserRatingForCurrentVersion', 'userRatingCountForCurrentVersion'], 'current_rating_vs_count');
    }
    if (L.userRatingCountForCurrentVersion !== undefined && L.userRatingCount !== undefined && isFinite(num('userRatingCountForCurrentVersion')) && isFinite(num('userRatingCount'))) {
      const c = num('userRatingCountForCurrentVersion'), n = num('userRatingCount'), tol = Math.max(3, Math.ceil(0.01 * n));
      pair(c <= n + tol, ['userRatingCountForCurrentVersion', 'userRatingCount'], 'current_count_above_count');
      // Apple's current-version ratings ARE the overall ratings today: count and average equal on 35,666 of 35,667 corpus
      // records (the other: a counter 2 above) and on 13,402/13,402 records of the saved campaign runs. A current-version
      // count below the total by more than the counter lag was rescaled or holds another field (stress round 3: /1000 and
      // a genre id shipped READY), and equal counts carry equal averages (the counter-lag bound of checkRatings).
      // Both columns are blamed unless an app page confirms one of them (totalReviews / avgRating, CONFIRMS).
      if (c < n - tol) pair(false, ['userRatingCountForCurrentVersion', 'userRatingCount'], 'current_count_below_count');
      const ca = num('averageUserRatingForCurrentVersion'), a = num('averageUserRating');
      if (Math.abs(c - n) <= tol && c > 0 && n > 0 && isFinite(ca) && isFinite(a) && L.averageUserRating !== undefined && L.averageUserRatingForCurrentVersion !== undefined) {
        pair(Math.abs(ca - a) <= 1e-3 + 4 * Math.abs(c - n) / Math.max(1, Math.min(c, n)), ['averageUserRatingForCurrentVersion', 'averageUserRating'], 'current_average_differs');
      }
    }
    if (typeof L.releaseDate === 'string' && typeof L.currentVersionReleaseDate === 'string' && !isNaN(Date.parse(L.releaseDate)) && !isNaN(Date.parse(L.currentVersionReleaseDate))) {
      pair(Date.parse(L.releaseDate) <= Date.parse(L.currentVersionReleaseDate), ['releaseDate', 'currentVersionReleaseDate'], 'released_after_updated');
    }
    // an app already released cannot date its current version after today (stress round 3: +365 d and +20 d shipped READY).
    // Future dates are real only on pre-orders, whose release date IS the current version's (29 corpus records, all equal)
    {
      const now = ctx && isFinite(ctx.now) ? Number(ctx.now) : Date.now(), u = typeof L.currentVersionReleaseDate === 'string' ? Date.parse(L.currentVersionReleaseDate) : NaN;
      if (!isNaN(u) && u > now + 864e5 && Date.parse(L.releaseDate) !== u) fail('lastUpdated', 'currentVersionReleaseDate', 'updated_in_the_future');
    }
    if (L.primaryGenreId !== undefined && Array.isArray(L.genreIds)) pair(L.genreIds.map(String).includes(String(L.primaryGenreId)), ['primaryGenreId', 'genreIds'], 'primary_genre_id_not_in_genre_ids');
    // swap partners: B holds what A should hold (A's validator accepts B's value, read as if the two traded back), and a
    // value-specific validator (SEM_STRONG) vouches for it: A's own (then B's validator must not refuse A's value), or
    // B's, accepting A's value. Two catch-all validators (a seller name and a track name both accept "Free") name nobody.
    for (const a of failedKeys) {
      for (const b of SEM_POOL) {
        // a blank value (an empty list, '') is no evidence of holding A's value (every() is true on [])
        if (b === a || blank(L[b]) || (/^artworkUrl/.test(a) && /^artworkUrl/.test(b))) continue;
        const back2 = Object.assign({}, L, { [a]: L[b], [b]: L[a] });
        let ok, back = null;
        try { ok = SEM[a](L[b], back2, cc); } catch (e) { ok = false; }
        if (ok !== true) continue;
        if (SEM[b]) { try { back = SEM[b](L[a], back2, cc); } catch (e) { back = false; } }
        const vouched = (SEM_STRONG.includes(a) && back !== false) || (SEM_STRONG.includes(b) && back === true);
        if (!vouched) continue;
        const colB = LOOKUP_COL[b] || null;
        if (colB) fail(colB, b, 'swap_partner_of_' + a, LOOKUP_COL[a] || a);
        else out.fails.push({ col: null, key: b, why: 'swap_partner_of_' + a, partnerOf: LOOKUP_COL[a] || a, unrendered: true });
      }
    }
    // an emptied sibling list: iPad shots that are iPhone-shaped next to NO iPhone shots (or the reverse) traded places
    // with an empty list (stress FI-02: the empty side rendered '' and passed every check)
    for (const [a, b] of [['ipadScreenshotUrls', 'screenshotUrls'], ['screenshotUrls', 'ipadScreenshotUrls']]) {
      if (failedKeys.includes(a) && Array.isArray(L[b]) && !L[b].length) fail(LOOKUP_COL[b], b, 'swap_partner_of_' + a, LOOKUP_COL[a]);
    }
    out.fails = out.fails.filter((x) => x.col || x.unrendered);
    return out;
  }
  function reviewInvariants(row, ctx) {
    ctx = ctx || {};
    if (row && row.id && row.id.label !== undefined) { // a raw RSS entry: map it to the SMAR columns
      const e = row; row = { reviewURL: e.link && e.link.attributes && e.link.attributes.href, userUrl: e.author && e.author.uri && e.author.uri.label,
        rating: e['im:rating'] && e['im:rating'].label, dateReviewed: e.updated && e.updated.label };
    }
    const cc = String(ctx.cc || '').toLowerCase(), out = [];
    out.push({ col: 'reviewURL', ok: row.reviewURL === `https://itunes.apple.com/${cc}/review?id=${ctx.trackId}&type=Purple%20Software`, why: 'review_url_constant' });
    out.push({ col: 'userUrl', ok: /\/reviews\/id\d+$/.test(str(row.userUrl)), why: 'user_url_shape' });
    out.push({ col: 'rating', ok: /^[1-5]$/.test(str(row.rating)), why: 'rating_1_5' });
    out.push({ col: 'dateReviewed', ok: !isNaN(Date.parse(row.dateReviewed)), why: 'date_parses' });
    return out;
  }

  // ------------------------------------------------------------------------------------------- checkRow
  function checkRow(L, sources, ctx) {
    ctx = ctx || {};
    const res = { hard: [], soft: [], warn: [], na: [], pass: [], flags: [], versionEqual: null, versionSources: {}, cdnAge: false, status: 'ok', refetch: false };
    if (!isObj(L)) { res.status = 'unverified'; res.flags.push('no_lookup'); return res; }
    const runCc = ctx.cc ? String(ctx.cc).toLowerCase() : null;
    // version detector (col 17): every anchor that shows a version votes. Two disagreements are not Apple's CDN age and
    // do not vote (so they never demote this row's hard checks): the lookup's version is the anchor's minimum OS (or its
    // minimumOsVersion is the anchor's version) = the two lookup fields traded places (stress FI-02: '17.0' shipped as
    // the app version), and a lookup version that fails its semantic check (it is no version at all).
    // A third: the lookup's version EQUALS another field of the same record (VERSION_COPY_FROM) while the anchor shows
    // another version = that field was copied into the version slot (hard: quarantined whatever the version vote).
    let anyV = false, allEq = true;
    const shown = ['webPage', 'productDv', 'lockup'].map((s) => sources && sources[s]).filter((a) => a && a.version != null && a.version !== '');
    // (a copy needs every anchor that shows a version to disagree: one that shows the same version confirms the cell)
    const verOk = SEM.version(L.version, L) !== false, swapSrc = [], copySrc = [];
    const copied = shown.some((a) => String(a.version) === String(L.version)) ? null : versionCopiedFrom(L);
    for (const src of ['webPage', 'productDv', 'lockup']) {
      const a = sources && sources[src]; if (!a || a.version == null || a.version === '') continue;
      const eq = String(a.version) === String(L.version);
      if (!eq && L.minimumOsVersion !== L.version && ((a.minOs != null && osNorm(L.version) === osNorm(a.minOs) && osNorm(L.minimumOsVersion) !== osNorm(a.minOs)) || String(L.minimumOsVersion) === String(a.version))) {
        res.versionSources[src] = 'swap'; swapSrc.push(src); continue;
      }
      const holder = !eq ? VERSION_HOLDERS.find((k) => typeof L[k] === 'string' && L[k] === String(a.version)) : null;
      if (holder) { res.versionSources[src] = 'swap'; swapSrc.push(src); res.swapWith = holder; continue; }
      if (!eq && copied) { res.versionSources[src] = 'copy'; copySrc.push(src); continue; }
      if (!eq && !verOk) { res.versionSources[src] = 'lookup_invalid'; continue; }
      anyV = true; res.versionSources[src] = eq; if (!eq) allEq = false;
    }
    for (const src of swapSrc) {
      const w = res.swapWith || 'minimumOsVersion', partner = LOOKUP_COL[w];
      res.hard.push({ col: 'currentAppVersion', src, why: w === 'minimumOsVersion' ? 'version_swapped_with_minimum_os' : 'version_swapped_with_' + w, got: L.version, want: sources[src].version, gate: 'hard', partnerOf: partner || w });
      if (partner && w !== 'minimumOsVersion') res.hard.push({ col: partner, src, why: 'version_swapped_with_' + w, gate: 'hard', partnerOf: 'currentAppVersion' });
    }
    for (const src of copySrc) res.hard.push({ col: 'currentAppVersion', src, why: 'version_copied_from_' + copied, got: L.version, want: sources[src].version, gate: 'hard' });
    if (swapSrc.length) res.flags.push('version_swap');
    if (copySrc.length) res.flags.push('version_copy:' + copied);
    res.versionEqual = anyV ? allEq : null;
    if (res.versionEqual === false) { res.cdnAge = true; res.flags.push('version_mismatch'); }
    // a column whose lookup value broke LOOKUP_TYPES is quarantined (typeCells) and cannot be compared: the comparators
    // assume the contract's types (releaseNotes {text} used to throw here and crash every --resume of the run)
    const typeQ = typeCells(L);
    let anyAnchor = false;
    for (const src of ['webPage', 'productDv', 'lockup', 'rss']) {
      const a = sources && sources[src]; if (!a) continue;
      anyAnchor = true;
      if (isObj(a.struct)) { res.struct = res.struct || {}; for (const [k, v] of Object.entries(a.struct)) res.struct[src + '.' + k] = !!v; }
      const crossStore = (sources.storeIndependentOnly && sources.storeIndependentOnly[src]) || (runCc && a.cc && a.cc !== runCc);
      for (const col of SRC_COLS[src]) {
        const g = CHECKS[col + '@' + src]; if (!g) continue;
        if (crossStore && STORE_DEPENDENT[col]) { res.na.push({ col, src, why: 'other_storefront' }); continue; }
        if (typeQ[col]) { res.na.push({ col, src, why: 'lookup_type_changed' }); continue; }
        let r;
        if (col === 'avgRating') {
          const rr = checkRatings({ lookup: L, hist: a.hist, ldRating: a.ldRating });
          const q = rr.checks.find((c) => c.status === 'quarantine');
          if (rr.status === 'not_comparable') { res.na.push({ col, src, why: rr.checks[0].cls }); continue; }
          if (rr.status === 'drift') { res.flags.push('rating_page_lag'); res.pass.push({ col, src, drift: true }); continue; }
          r = q ? R(false, q.d, null, q.cls) : R(true);
          if (q && q.cls === 'rating_mismatch_same_count') { // the only rating case that may quarantine (PLAN 3.2 row 24)
            if (res.versionEqual === false) res.soft.push({ col, src, why: q.cls, drift: true }); else res.hard.push({ col, src, why: q.cls, got: q.d, gate: 'hard' });
            continue;
          }
        } else if (col === 'contentRating') {
          const cr = checkContentRating(L.contentAdvisoryRating, a.ageRating, runCc);
          if (cr.r === 'na') { res.na.push(Object.assign({ col, src, why: cr.flag || 'anchor_absent' }, !cr.flag && a.localized ? { expected: 'localized_page' } : {})); continue; }
          if (cr.r === 'warn') { res.warn.push({ col, src, why: cr.flag, got: cr.got, want: cr.want, drift: !!cr.drift }); if (cr.drift) res.flags.push('age_scale_membership_break'); continue; }
          res.pass.push({ col, src }); continue;
        } else {
          try { r = COMPARE[col] ? COMPARE[col](L, a, ctx) : undefined; }
          // an unexpected anchor shape cannot be compared: counted as an absent anchor (unverified cell, anchor drift
          // when systematic), never a crash of the whole run
          catch (e) { res.flags.push('check_error_' + col); res.na.push({ col, src, why: 'anchor_absent' }); continue; }
        }
        if (r === undefined) { const ex = expectedAbsent(col, src, L, a); res.na.push(ex ? { col, src, why: ex.why, expected: ex.expected } : { col, src, why: 'anchor_absent' }); continue; }
        if (r.ok) { res.pass.push({ col, src, why: r.why }); continue; }
        // a genre name in the page's language vs the lookup's English name: not comparable (never a failure)
        if (a.localized && LOCALIZED_TEXT[col]) { res.na.push({ col, src, why: 'localized_page' }); continue; }
        const item = { col, src, got: r.got, want: r.want, why: r.why, gate: g.gate };
        const versionSensitive = g.ver || res.versionEqual === false;
        // the lookup dates the current version at its first release while the app page, at the SAME version, dates it
        // more than a day after that release: currentVersionReleaseDate holds the release date (stress round 2: copied on
        // 25 of 25 chart rows, READY). 0 of the 2,605 same-version cached page/lookup pairs (1 pair has equal lookup
        // dates and a page date two days BEFORE the release; not this rule)
        const samePageVersion = res.versionSources[src] === true;
        if (col === 'lastUpdated' && src === 'webPage' && samePageVersion && typeof L.releaseDate === 'string' && L.releaseDate === L.currentVersionReleaseDate
          && a.lastUpdated && Date.parse(a.lastUpdated) > Date.parse(L.releaseDate) + 864e5) res.hard.push(Object.assign(item, { gate: 'hard', why: 'updated_date_is_the_release_date' }));
        // a soft gate's gross miss (a date only when that page shows the lookup's own version)
        else if (r.gross && res.versionEqual !== false && (col !== 'lastUpdated' || samePageVersion)) {
          res.hard.push(Object.assign(item, { gate: 'hard' }));
          // the current-version count is the same unit from the same record (equal to the total on 76% of records): a
          // total rescaled by a factor is no evidence for it, so it is quarantined with the total (stress round 2: both
          // counts /1000 blanked totalReviews and shipped currentVersionReviews 376 for 375,852)
          // (only when the total is a count that is there: a renamed or retyped userRatingCount says nothing about the other)
          if (col === 'totalReviews' && L.userRatingCount !== undefined && TYPE_OK.count(L.userRatingCount) && asNum(L.userRatingCountForCurrentVersion) > 0) res.hard.push({ col: 'currentVersionReviews', src, why: 'count_scale_suspect', gate: 'hard', sameUnitAs: 'totalReviews' });
        }
        else if (g.gate === 'hard' && !(versionSensitive && res.versionEqual === false) && !(g.ver && res.versionEqual === null)) res.hard.push(item);
        else if (g.gate === 'warn') res.warn.push(item);
        else res.soft.push(Object.assign(item, res.versionEqual === false ? { drift: true } : {}));
      }
    }
    if (sources && sources.consistency) {
      const c = checkConsistency(L, sources.consistency, { sameStore: !(sources.storeIndependentOnly && sources.storeIndependentOnly.consistency) });
      for (const d of c.diffs) {
        if (d.cls === 'counter' || d.cls === 'version') { res.flags.push('consistency_' + d.cls); if (d.cls === 'version') res.cdnAge = true; continue; }
        const col = Object.keys(COL_LOOKUP_KEY).find((k) => COL_LOOKUP_KEY[k] === d.key) || d.key;
        (c.versionEqual ? res.hard : res.soft).push({ col, src: 'consistency', why: 'lookup_id_vs_bundle', gate: 'hard', drift: !c.versionEqual });
      }
      anyAnchor = true;
    }
    for (const iv of invariants(L, { cc: ctx.cc, expectCurrency: ctx.expectCurrency })) {
      if (iv.canary) res.flags.push('current_version_canary');
      if (!iv.ok) res.hard.push({ col: iv.col, src: 'invariant', why: iv.why, gate: 'hard' });
    }
    // semantic contract (see semanticCheck): hard, version-independent; type-violating columns are typeCells' job
    const sem = semanticCheck(L, { cc: ctx.cc, skipCols: typeQ, now: ctx.now });
    res.semEval = sem.evaluated;
    // a value an independent source shows by name (the same version, minimum OS, genre, price, notes, dates, size, count
    // on the app page / feed) is verified, whatever its shape ("icon exp" is a real version on its page)
    const confirmed = new Set(res.pass.filter((p) => CONFIRMS[p.col] && p.src !== 'invariant' && p.src !== 'semantic' && !p.drift).map((p) => p.col));
    if (Object.values(res.versionSources).some((x) => x === true)) confirmed.add('currentAppVersion');
    for (const f of sem.fails) {
      if (f.unrendered) { res.flags.push(f.partnerOf ? 'swap_partner_unrendered:' + f.key + '<->' + f.partnerOf : 'semantic_unrendered:' + f.key); continue; }
      if (confirmed.has(f.col)) { res.flags.push('semantic_confirmed_by_source:' + f.col); continue; }
      res.hard.push(Object.assign({ col: f.col, src: 'semantic', why: f.why, key: f.key, gate: 'hard' }, f.partnerOf ? { partnerOf: f.partnerOf } : {}));
    }
    if (L.price === undefined) res.flags.push('price_absent');
    res.status = res.hard.length ? 'hard_fail' : res.cdnAge ? 'drift' : !anyAnchor ? 'unverified' : 'ok';
    // PLAN 3.2 row 17: a version mismatch also triggers the one re-fetch (then it is classified cdn_age).
    res.refetch = res.hard.length > 0 || res.versionEqual === false;
    res.refetchReason = res.hard.length ? 'hard_fail' : res.versionEqual === false ? 'version_mismatch' : null;
    return res;
  }

  // Consistency: LOOKUP_ID('us') vs LOOKUP_BUNDLE(CC) raw objects of the same app (PLAN 3.4). Counters and version are drift.
  const COUNTER_KEYS = ['averageUserRating', 'userRatingCount', 'averageUserRatingForCurrentVersion', 'userRatingCountForCurrentVersion'];
  const STORE_FREE_KEYS = ['trackId', 'bundleId', 'artistId'];
  function checkConsistency(A, B, opts) {
    const same = !(opts && opts.sameStore === false), diffs = [];
    if (!isObj(A) || !isObj(B)) return { equal: false, versionEqual: null, diffs: [{ key: '*', cls: 'value' }] };
    const versionEqual = A.version === B.version;
    const keys = same ? Object.keys(Object.assign({}, A, B)) : STORE_FREE_KEYS;
    for (const k of keys) {
      if (JSON.stringify(A[k]) === JSON.stringify(B[k])) continue;
      diffs.push({ key: k, cls: COUNTER_KEYS.includes(k) ? 'counter' : k === 'version' ? 'version' : 'value' });
    }
    if (!versionEqual) for (const d of diffs) if (d.cls === 'value') d.cls = 'version';
    return { equal: !diffs.length, versionEqual, diffs };
  }

  // ------------------------------------------------------------------------------------------- FS-11 reviews
  // rss: raw RSS entries of one page (in feed order); mz: parseMzReviews(...).list for the same window.
  function pacificWall(iso) {
    const t = Date.parse(iso); if (isNaN(t)) return null;
    const y = new Date(t).getUTCFullYear();
    const nthSun = (m, n) => { const d = new Date(Date.UTC(y, m, 1)); const off = (7 - d.getUTCDay()) % 7; return Date.UTC(y, m, 1 + off + 7 * (n - 1)); };
    const dstStart = nthSun(2, 2) + 10 * 3600e3, dstEnd = nthSun(10, 1) + 9 * 3600e3; // 2am local in UTC
    const off = t >= dstStart && t < dstEnd ? -7 : -8;
    return new Date(t + off * 3600e3).toISOString().slice(0, 19);
  }
  function checkReviews(rss, mz, opts) {
    opts = opts || {};
    const out = { hard: [], soft: [], pass: 0, order: null, perRow: {}, n: 0 };
    const E = (Array.isArray(rss) ? rss : []).map((e) => ({ id: e && e.id && e.id.label, rating: e && e['im:rating'] && e['im:rating'].label,
      text: e && e.content && e.content.label, uri: e && e.author && e.author.uri && e.author.uri.label, updated: e && e.updated && e.updated.label,
      version: e && e['im:version'] && e['im:version'].label, name: e && e.author && e.author.name && e.author.name.label }));
    const M = Array.isArray(mz) ? mz : [];
    if (!M.length) { out.order = 'mz_absent'; return out; }
    const byId = new Map(M.map((m) => [m.id, m]));
    const rIds = E.map((e) => e.id), mIds = M.slice(0, E.length).map((m) => m.id);
    out.order = rIds.join() === mIds.join() ? 'same' : 'differs';
    if (out.order !== 'same') out.hard.push({ col: 'reviewID', why: 'id_set_or_order', rss: rIds.length, mz: M.length, firstDiff: rIds.findIndex((x, i) => x !== mIds[i]) });
    // a review id that is one of MZ's author ids, an author URL that carries one of MZ's review ids, or a review MZ holds
    // (same text, author name and rating) under another id is a swap or a moved field (stress FI-07: every reviewID was
    // the author's id and shipped READY). An id simply absent from MZ is not: the RSS feed is CDN-cached and MZ is live,
    // so new reviews shift MZ's window by any amount (the rows matched by content above still expose a moved id).
    const profiles = new Set(M.map((m) => m.profileId).filter(Boolean)), mzIds = new Set(M.map((m) => m.id));
    const ckey = (body, name, rating) => (body ? str(body) + '\u0000' + str(name) + '\u0000' + str(rating) : null);
    const byContent = new Map(); for (const m of M) { const k = ckey(m.body, m.name, m.rating); if (k && !byContent.has(k)) byContent.set(k, m); }
    const failRow = (id, cols, why) => { out.perRow[id] = Object.assign(out.perRow[id] || {}, { fails: [].concat((out.perRow[id] || {}).fails || [], cols) }); for (const c of cols) out.hard.push({ col: c, id, why }); };
    for (const e of E) {
      out.n++;
      const m = byId.get(e.id), f = [];
      if (!m) {
        const uid = (str(e.uri).match(/\/id(\d+)/) || [])[1];
        const same = byContent.get(ckey(e.text, e.name, e.rating));
        const cols = [], why = profiles.has(e.id) ? 'review_id_is_an_author_id' : same ? 'review_id_differs_from_mz_same_review' : 'user_url_holds_a_review_id';
        if (profiles.has(e.id) || same) cols.push('reviewID');
        if (uid && (mzIds.has(uid) || (same && same.profileId && uid !== same.profileId))) cols.push('userUrl');
        if (cols.length) failRow(e.id, cols, why);
        else out.perRow[e.id] = { fails: ['missing_in_mz'] };
        continue;
      }
      if (str(e.rating) !== str(m.rating)) f.push('rating');
      if (str(e.text) !== str(m.body)) f.push('reviewText');
      if (e.version && m.title && str(e.version) === str(m.title)) f.push('versionWhenReviewed');
      if (((str(e.uri).match(/\/id(\d+)/) || [])[1] || null) !== m.profileId) f.push('userUrl');
      const wall = pacificWall(m.date);
      // RSS and MZ show the same wall clock on 5,870 of 5,870 saved pairs: a day or more apart is a moved date (hard; the
      // cell is quarantined), less is soft (a rate far above the corpus's escalates to drift, driftReport (a2)). The SAME
      // instant under another wall clock (an MZ date that took the RSS's -07:00 label literally) is no disagreement in
      // value: soft as before, never escalated (sameInstant)
      const rw = str(e.updated).slice(0, 19), sameInstant = Date.parse(e.updated) === Date.parse(m.date);
      const gap = wall ? Math.abs(Date.parse(rw + 'Z') - Date.parse(wall + 'Z')) : 0;
      if (wall && rw !== wall && !sameInstant && !(gap < 864e5)) f.push('dateReviewed');
      else if (wall && rw !== wall) out.soft.push(Object.assign({ col: 'dateReviewed', id: e.id, why: 'wall_clock_differs' }, sameInstant ? { sameInstant: true } : {}));
      else if (wall && Date.parse(e.updated) !== Date.parse(m.date)) out.perRow[e.id] = Object.assign(out.perRow[e.id] || {}, { flag: 'rss_dst_offset' });
      if (f.length) { out.perRow[e.id] = Object.assign(out.perRow[e.id] || {}, { fails: f }); for (const c of f) out.hard.push({ col: c, id: e.id, why: 'mz_disagrees' }); } else out.pass++;
    }
    return out;
  }

  // reviewsChecks(rs): runs checkReviews on every MZ-cross-checked page of one as_reviews app state (rs.mz[p] +
  // rs.pageEntries[p]); pages whose MZ fetch failed are skipped (not cross-checkable, never a failure).
  // A precomputed rs.checks (array of checkReviews results) is returned as is.
  function reviewsChecks(rs) {
    if (!rs) return [];
    if (Array.isArray(rs.checks)) return rs.checks;
    if (rs.checks && typeof rs.checks === 'object' && rs.checks.hard) return [rs.checks];
    const out = [];
    for (const p of Object.keys(rs.mz || {}).map(Number).sort((a, b) => a - b)) {
      const m = rs.mz[p]; if (!m || m.ok === false || !Array.isArray(m.list) || !m.list.length) continue;
      const rss = (rs.pageEntries && rs.pageEntries[p]) || [];
      if (!rss.length) continue;
      const r = checkReviews(rss, m.list, { startIndex: (p - 1) * 50 }); r.p = p; out.push(r);
    }
    return out;
  }
  // reviewSemantics(rs) -> {n, hard:[{col, id, why}], perRow:{id:{fails[], why}}, blankVersion, versionIsRating}: per-row
  // checks on EVERY held RSS entry, MZ or not (stress FI-07). Measured on 4,631 distinct cached RSS reviews: every id is
  // numeric and differs from its author's profile id; no im:version equals the entry's title, author name or text; no
  // title is a bare version number; no im:version is blank or equals the rating. Hard per row: a non-numeric id, an id
  // that is its author's id, a version that holds the review's own text, a bare-version title next to a non-version
  // (version and title traded places). Population only (driftReport): blank versions, versions equal to the rating.
  // Round 3 (verifier of 6980ec1), measured on the 12,525 distinct RSS reviews of the saved campaign runs (+ 5,870 with an
  // MZ twin): every im:version holds a digit and is at most 20 characters; none is review text with spaces (6 versions
  // occur inside their review's text, all bare version numbers); no review is dated after its run; RSS and MZ dates
  // share the wall clock on 5,870/5,870. Hard per row: a version with no digit (unless it IS the app's version, rs.appVersion
  // when the lookup kept it), longer than 40 characters, or a phrase of its own text; a version whose leading number is
  // above the app's own by more than one AND at least twice it (a stale lookup is one release behind at most; date-like
  // versions 20261004 vs 20260930 are not twice); a date that does not parse, lies more than a day in the future, or before
  // the App Store opened (2008-07-10). (stress round 3: '999.0.0' on an app at 483.0.0, review text as a version, 2031
  // review dates all shipped READY.)
  // Fix loop round 2: a review on a version NEWER than the app's current one, dated more than a day before that current
  // version came out. App Store Connect only accepts a higher version than the last approved one, so the newer version
  // did not exist yet (a lookup one release behind dates its own version earlier still). Saved real feeds (152 app feeds,
  // 34,488 reviews with their lookup's version and date): not one review carries a version above its app's at all.
  // Per row it is hard; on max(3, 10%) of the rows it is column drift (driftReport (a)): stress regression '484.0.0' on
  // all 50 Strava reviews (app at 483.0.0, released 2026-09-30; 39 reviews dated earlier) shipped READY.
  const verParts = (v) => { const m = String(v).trim().match(/^v?(\d{1,9}(?:\.\d{1,9})*)(?=$|[\s(_-])/i); return m ? m[1].split('.').map(Number) : null; };
  const verCmp = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const x = a[i] || 0, y = b[i] || 0; if (x !== y) return x < y ? -1 : 1; } return 0; };
  const APP_STORE_OPENED = Date.parse('2008-07-10T00:00:00Z');
  const leadNum = (v) => { const m = String(v).trim().match(/^v?(\d{1,9})(?=$|[.\s(_-])/i); return m ? +m[1] : null; };
  function reviewSemantics(rs, opts) {
    const out = { n: 0, hard: [], perRow: {}, blankVersion: 0, versionIsRating: 0 };
    const pe = (rs && rs.pageEntries) || {};
    const lab = (o) => (o && o.label !== undefined && o.label !== null ? String(o.label) : undefined);
    const now = opts && isFinite(opts.now) ? Number(opts.now) : Date.now();
    const appV = rs && typeof rs.appVersion === 'string' && rs.appVersion ? rs.appVersion : null, appN = appV ? leadNum(appV) : null;
    const appP = appV ? verParts(appV) : null, appRel = rs && typeof rs.appVersionDate === 'string' ? Date.parse(rs.appVersionDate) : NaN;
    for (const p of Object.keys(pe)) for (const e of (Array.isArray(pe[p]) ? pe[p] : [])) {
      const id = lab(e && e.id); if (id === undefined) continue;
      out.n++;
      const v = lab(e['im:version']), t = lab(e.title), nm = lab(e.author && e.author.name), c = lab(e.content), r = lab(e['im:rating']);
      const uid = ((lab(e.author && e.author.uri) || '').match(/\/id(\d+)/) || [])[1];
      const tu0 = Date.parse(lab(e.updated));
      const f = [];
      if (!/^\d+$/.test(id)) f.push(['reviewID', 'review_id_not_numeric']);
      else if (uid && uid === id) f.push(['reviewID', 'review_id_is_author_id']);
      if (v === undefined || v === '') out.blankVersion++;
      else {
        const vt = v.trim(), vn = leadNum(v);
        if ((t && v === t) || (nm && v === nm) || (c && v === c)) f.push(['versionWhenReviewed', 'version_holds_review_text']);
        else if (t && /^\d+(\.\d+){1,3}$/.test(t.trim()) && !/\d\.\d/.test(v)) f.push(['versionWhenReviewed', 'version_and_title_swapped']);
        else if (vt.length >= 6 && /\s/.test(vt) && /\p{L}{2,}/u.test(vt) && ((c && c.includes(vt)) || (t && t.includes(vt)))) f.push(['versionWhenReviewed', 'version_holds_review_text']);
        else if (!/\d/.test(v) && v !== appV) f.push(['versionWhenReviewed', 'version_has_no_digit']);
        else if (v.length > 40) f.push(['versionWhenReviewed', 'version_too_long']);
        else if (appN != null && vn != null && vn > appN + 1 && vn >= 2 * Math.max(1, appN)) f.push(['versionWhenReviewed', 'version_above_app_version']);
        else if (appP && !isNaN(appRel) && !isNaN(tu0) && tu0 < appRel - 864e5) {
          const vp = verParts(v);
          if (vp && verCmp(vp, appP) > 0) f.push(['versionWhenReviewed', 'version_above_app_version_before_its_release']);
        }
        if (r !== undefined && v === r) out.versionIsRating++;
      }
      const u = lab(e.updated);
      if (u !== undefined) {
        const tu = Date.parse(u);
        if (isNaN(tu)) f.push(['dateReviewed', 'date_not_a_date']);
        else if (tu > now + 864e5) f.push(['dateReviewed', 'date_in_the_future']);
        else if (tu < APP_STORE_OPENED) f.push(['dateReviewed', 'date_before_the_app_store']);
      }
      if (f.length) { out.perRow[id] = { fails: f.map((x) => x[0]), why: f.map((x) => x[1]) }; for (const [col, why] of f) out.hard.push({ col, id, why }); }
    }
    return out;
  }
  // Per-review cells that failed a HARD review check (PLAN 3.3): {reviewID: {col: reason}}. Default mode blanks them
  // (A3); compat reports them as unverified. A whole-page reviewID ORDER failure quarantines nothing by itself (a few new
  // reviews shift MZ's window); ids that are author ids, or missing from MZ on a whole page, are per-row failures.
  // A cell is keyed by its CSV column, except versionWhenReviewed and dateReviewed: they are keyed 'version' and
  // 'updated', the review row's own keys, so the engine's blanking (column -> row key map without those columns) really
  // blanks them (stress round 2: a single version = title row was reported quarantined while the CSV kept 'stickers');
  // quarantineSummary reports them under their column names (REVIEW_ROW_COL).
  const REVIEW_CELL_KEY = { versionWhenReviewed: 'version', dateReviewed: 'updated' };
  const REVIEW_ROW_COL = { version: 'versionWhenReviewed', id: 'reviewID', score: 'rating', text: 'reviewText', url: 'reviewURL', updated: 'dateReviewed' };
  // own: the cells that failed a check of the review entry against itself (reviewSemantics: an id that is its author's,
  // a version holding the review's text, a date in the future...): --smar-compat blanks these too; an MZ disagreement
  // (a review edited since Apple's RSS copy was cached) stays SMAR's value there, listed in unverifiedCells.
  function reviewQuarantine(rs, opts) {
    const cells = {}, own = {};
    const put = (into, id, c, why) => { const k = REVIEW_CELL_KEY[c] || c; (into[id] = into[id] || {})[k] = (into[id] && into[id][k]) || why; };
    for (const r of reviewsChecks(rs)) for (const [id, x] of Object.entries(r.perRow || {})) for (const c of (x.fails || [])) {
      if (c === 'missing_in_mz') continue;
      put(cells, id, c, 'mzReviews:mz_disagrees');
    }
    const sem = reviewSemantics(rs);
    for (const [id, x] of Object.entries(sem.perRow)) x.fails.forEach((c, i) => { put(cells, id, c, 'reviewsRss:' + x.why[i]); put(own, id, c, 'reviewsRss:' + x.why[i]); });
    return { cells, own, kind: Object.keys(cells).length ? (opts && opts.compat ? 'unverified' : 'quarantined') : null };
  }

  // ------------------------------------------------------------------------------------------- shape / blank drift
  // Mac apps (kind mac-software) carry no iPad/TV screenshot keys and no supportedDevices: not a symptom there.
  const EXPECTED_ABSENT = { ipadScreenshotUrls: (r) => r.kind === 'mac-software', appletvScreenshotUrls: (r) => r.kind === 'mac-software', supportedDevices: (r) => r.kind === 'mac-software' };
  // shapeRates(list) -> {'<key>.<missing|blank>.<stratum>': {n, m, units, mUnits}} for every baseline-tested key.
  // Units are developers (artistId): a run full of one developer's apps (search "apple": 22 Apple apps have no
  // screenshots) is one unit, so clustering cannot fake drift; a relocated key hits every developer.
  function shapeRates(list) {
    const L = (Array.isArray(list) ? list : []).filter(isObj), out = {};
    const keys = new Set(Object.keys(OPTIONAL_KEY_BASELINE).concat(Object.keys(BLANK_BASELINE)));
    for (const k of keys) for (const what of ['missing', 'blank']) {
      const per = {}; // stratum -> {n, m, dev:{id:[n,m]}}
      for (const r of L) {
        if (EXPECTED_ABSENT[k] && EXPECTED_ABSENT[k](r)) continue;
        const z = STRATA[k] ? STRATA[k](r) : 'all', t = per[z] = per[z] || { n: 0, m: 0, dev: {} };
        const hit = what === 'missing' ? !(k in r) : blank(r[k]);
        t.n++; if (hit) t.m++;
        const dv = t.dev[String(r.artistId)] = t.dev[String(r.artistId)] || [0, 0]; dv[0]++; if (hit) dv[1]++;
      }
      for (const [z, t] of Object.entries(per)) {
        const D = Object.values(t.dev);
        out[k + '.' + what + '.' + z] = { n: t.n, m: t.m, units: D.length, mUnits: D.filter(([n, m]) => m * 2 > n).length };
      }
    }
    return out;
  }
  // typeCheck(raw) -> [{key, col, kind, got}]: every present lookup value outside LOOKUP_TYPES (see there).
  const describe = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array[' + v.length + ']' + (v.length && !isScalarV(v[0]) ? ' of ' + describe(v[0]) : '')
    : typeof v === 'string' ? 'text "' + v.slice(0, 24) + '"' : typeof v === 'object' ? 'object {' + Object.keys(v).slice(0, 3).join(',') + '}' : typeof v);
  const isScalarV = (v) => v == null || ['string', 'number', 'boolean'].includes(typeof v);
  function typeCheck(L) {
    const out = [];
    if (!isObj(L)) return out;
    for (const [key, kind] of Object.entries(LOOKUP_TYPES)) {
      // icon: the first artwork key PRESENT must be a URL (a present artworkUrl512 of null/false/{...} is a type change,
      // not an absent key: cleanApp would silently fall back to the 100 px URL)
      const v = key === 'artworkUrl512' ? [L.artworkUrl512, L.artworkUrl100, L.artworkUrl60].find((x) => x !== undefined) : L[key];
      if (v === undefined) continue;
      if (!TYPE_OK[kind](v)) out.push({ key, col: LOOKUP_COL[key], kind, got: describe(v) });
    }
    return out;
  }
  // typeCells(raw) -> {col: 'lookup.<key>:not_<kind>'}: the cells a type violation quarantines (blanked in both modes).
  function typeCells(L) {
    const cells = {};
    for (const v of typeCheck(L)) if (v.col) cells[v.col] = 'lookup.' + v.key + ':not_' + v.kind;
    return cells;
  }
  function lookupShape(list) {
    const L = (Array.isArray(list) ? list : []).filter(isObj), missing = {}, blankC = {};
    const keys = new Set(REQUIRED_LOOKUP_KEYS.concat(Object.keys(OPTIONAL_KEY_BASELINE), Object.keys(BLANK_BASELINE)));
    for (const r of L) for (const k of keys) { if (!(k in r)) inc(missing, k); if (blank(r[k])) inc(blankC, k); }
    return { n: L.length, missing, blank: blankC, rates: shapeRates(L) };
  }
  function reviewShape(entries) {
    const E = Array.isArray(entries) ? entries : [], malformed = [];
    E.forEach((e, i) => {
      const need = [['id', e && e.id && e.id.label], ['author.uri', e && e.author && e.author.uri && e.author.uri.label], ['im:version', e && e['im:version'] && e['im:version'].label],
        ['im:rating', e && e['im:rating'] && e['im:rating'].label], ['content', e && e.content && e.content.label], ['link', e && e.link && e.link.attributes && e.link.attributes.href], ['updated', e && e.updated && e.updated.label]];
      const miss = need.filter(([, v]) => v === undefined || v === null).map(([k]) => k);
      if (miss.length) malformed.push({ i, missing: miss });
    });
    return { n: E.length, malformed };
  }
  const driftThreshold = (n) => Math.max(3, Math.ceil(0.1 * n));
  // soft-check disagreement rates measured outside CALIBRATION (driftReport (a2))
  const SOFT_BASE = { 'dateReviewed@mzReviews': 0.002 };
  // P(X >= m) for X ~ Binomial(n, p), in log space (n is at most a few thousand rows).
  function binomTail(m, n, p) {
    if (m <= 0) return 1; if (m > n) return 0; if (p <= 0) return 0; if (p >= 1) return 1;
    let lf = [0]; for (let i = 1; i <= n; i++) lf[i] = lf[i - 1] + Math.log(i);
    let s = 0; for (let k = m; k <= n; k++) s += Math.exp(lf[n] - lf[k] - lf[n - k] + k * Math.log(p) + (n - k) * Math.log(1 - p));
    return Math.min(1, s);
  }
  // m of n rows show the symptom; base = the corpus rate of that symptom. PLAN 3.6: >= max(3,10%) and > base + 15 points,
  // plus the binomial guard (calibrated: removes every false positive on run-sized groups of the cached corpus).
  function significant(m, n, base) {
    base = base == null ? 0 : base;
    return m >= driftThreshold(n) && m / n > base + 0.15 && binomTail(m, n, base) < DRIFT_ALPHA;
  }

  // ------------------------------------------------------------------------------------------- quarantine (A3)
  // -> {cells:{col:reason}, kind:'quarantined'|'unverified'|null, anchorAbsent:{col:'<src>:anchor_absent'}}
  // anchorAbsent lists HARD-gated columns a sampled source could not verify (PLAN 3.6: anchor missing -> unverified);
  // they are reported (st.unverified), never blanked.
  // own: a failure of the lookup record against itself (semantic contract, internal invariants, a version that traded
  // places with or was copied from another field of the record). Such a value is wrong whatever any other source says
  // and whatever SMAR would write: --smar-compat blanks these cells too (as it blanks a type violation), while a
  // disagreement with another source (a page, a feed) stays SMAR's value there, listed in unverifiedCells.
  // (stress regression, --smar-compat: price <-> rating count, release <-> update date, genre <-> seller and 15 more
  // swaps shipped READY on 2-row id lists, where no column-drift threshold can fire.)
  const ownFailure = (h) => h.src === 'semantic' || h.src === 'invariant' || /^version_(swapped_with|copied_from)_/.test(h.why || '');
  function quarantineCells(result, opts) {
    const r = result && result.after ? result.after : result;
    const anchorAbsent = {};
    if (r && Array.isArray(r.na)) for (const n of r.na) {
      if (n.why !== 'anchor_absent') continue;
      const g = CHECKS[n.col + '@' + n.src];
      if (g && g.gate === 'hard' && !(r.pass || []).some((x) => x.col === n.col)) anchorAbsent[n.col] = anchorAbsent[n.col] || (n.src + ':' + (n.expected === 'localized_page' ? 'localized_page' : 'anchor_absent'));
    }
    if (!r || !r.hard || !r.hard.length) return { cells: {}, kind: null, anchorAbsent, own: {} };
    // a version mismatch (CDN age) explains a disagreement with a page, never a lookup record that contradicts itself:
    // semantic failures and a version/minimum-OS swap are quarantined whatever the page's version
    const H = r.versionEqual === false ? r.hard.filter(ownFailure) : r.hard;
    const cells = {}, own = {};
    for (const h of H) if (COL_LOOKUP_KEY[h.col] || h.col === 'avgRating') {
      cells[h.col] = cells[h.col] || (h.src + ':' + (h.why || 'mismatch'));
      if (ownFailure(h)) own[h.col] = own[h.col] || (h.src + ':' + (h.why || 'mismatch'));
    }
    for (const col of Object.keys(cells)) for (const p of COLUMN_FAMILY[col] || []) if (!cells[p]) cells[p] = 'with:' + col; // derived columns (COLUMN_FAMILY)
    for (const col of Object.keys(own)) for (const p of COLUMN_FAMILY[col] || []) if (!own[p]) own[p] = 'with:' + col;
    // own = the subset of cells --smar-compat blanks (cells = every failed cell: default blanks them all)
    return { cells, kind: Object.keys(cells).length ? (opts && opts.compat ? 'unverified' : 'quarantined') : null, anchorAbsent, own };
  }
  function applyQuarantine(row, cells, opts) {
    if (!row || (opts && opts.compat)) return row;
    for (const col of Object.keys(cells || {})) { const k = COL_CLEAN_KEY[col] || col; if (k in row || col in row) row[k in row ? k : col] = undefined; }
    return row;
  }

  // ------------------------------------------------------------------------------------------- aggregation
  function rowsOf(st) { return Array.isArray(st && st.rows) ? st.rows : []; }
  function checkOf(st, appId) {
    const C = (st && st.checks) || {};
    const c = C[appId] || C[String(appId).toLowerCase()];
    return c ? (c.after || c) : null;
  }
  function aggregateChecks(st) {
    // rowsChecked counts only rows that at least one SECOND Apple source evaluated (web page, product-dv, lockup, RSS,
    // the id-vs-bundle lookup consistency); a row with only internal invariants is unanchoredRows (SE-B: a 525-row
    // search had 58 anchored rows while rowsChecked said 525 and agents told users "all rows were cross-checked").
    const out = { rowsChecked: 0, unanchoredRows: 0, bySource: { productDv: 0, rss: 0, lockup: 0, webPage: 0, mzReviews: 0, consistency: 0 }, hardFailures: {}, softWarnings: {}, notCrossCheckable: {}, evaluated: {}, hardBy: {}, anchorMissing: {},
      softBy: {}, swaps: {}, sameUnit: {}, unrendered: {}, reviewShape: { n: 0, blankVersion: 0, versionIsRating: 0 } };
    const seen = new Set();
    const ids = rowsOf(st).length ? rowsOf(st).map((r) => r.appId) : Object.keys((st && st.checks) || {});
    for (const id of ids) {
      if (seen.has(id)) continue; seen.add(id);
      const c = checkOf(st, id); if (!c) { inc(out.notCrossCheckable, '*'); out.unanchoredRows++; continue; }
      // internal checks (invariants, the semantic contract) are no second source: they never make a row "cross-checked"
      const internal = (s) => s === 'invariant' || s === 'semantic';
      const srcs = new Set([].concat(c.pass || [], c.hard || [], c.soft || [], c.warn || []).map((x) => x.src).filter((s) => s && !internal(s)));
      if (srcs.size) out.rowsChecked++; else out.unanchoredRows++;
      for (const s of srcs) inc(out.bySource, s);
      const items = [].concat(c.pass || [], c.hard || [], c.soft || [], c.warn || []);
      for (const x of items) if (!internal(x.src)) inc(out.evaluated, x.col + '@' + x.src);
      // a column quarantined with another of the same unit (sameUnitAs) was evaluated wherever that column was, so its
      // drift share is measured on the same rows (currentVersionReviews with a page's grossly different totalReviews)
      for (const x of items) if (x.sameUnitAs && !internal(x.src)) inc(out.sameUnit, x.sameUnitAs + '->' + x.col);
      for (const s0 of new Set(items.filter((x) => x.col === 'totalReviews' && !internal(x.src)).map((x) => x.src))) {
        if (!items.some((x) => x.col === 'currentVersionReviews' && x.src === s0)) inc(out.evaluated, 'currentVersionReviews@' + s0);
      }
      for (const col of c.semEval || []) inc(out.evaluated, col + '@semantic');
      // one count per row and column/source (a cell failing two rules of one source is one failing row)
      const hk = new Set(), sw = new Set();
      for (const h of c.hard || []) { if (!hk.has(h.col + '@' + h.src)) { hk.add(h.col + '@' + h.src); inc(out.hardBy, h.col + '@' + h.src); } if (h.partnerOf && !sw.has(h.partnerOf + '<->' + h.col)) { sw.add(h.partnerOf + '<->' + h.col); inc(out.swaps, h.partnerOf + '<->' + h.col); } }
      for (const col of new Set((c.hard || []).map((h) => h.col))) inc(out.hardFailures, col);
      for (const s of [].concat(c.soft || [], c.warn || [])) { inc(out.softWarnings, s.col); if (!s.drift && s.gate === 'soft') inc(out.softBy, s.col + '@' + s.src); }
      for (const n of c.na || []) if (n.why === 'anchor_absent') { inc(out.notCrossCheckable, n.col); if (!n.expected) inc(out.anchorMissing, n.col + '@' + n.src); }
      for (const f of new Set((c.flags || []).filter((x) => /^semantic_unrendered:/.test(x)))) inc(out.unrendered, f.slice(20));
    }
    for (const app of Object.values((st && st.reviews) || {})) {
      const rc = reviewsChecks(app);
      // one count per review row and column: the page-level id ORDER failure (no review id) is no row (stress regression:
      // 'mzReviews.reviewID failed on 51/50 rows' counted it as a 51st)
      for (const pg of rc) {
        if (!pg) continue; out.bySource.mzReviews += pg.n || 0;
        const hk = new Set();
        for (const h of pg.hard || []) { if (h.id == null) continue; const k = h.col + '\u0000' + h.id; if (hk.has(k)) continue; hk.add(k); inc(out.hardFailures, h.col); inc(out.hardBy, h.col + '@mzReviews'); }
        for (const s of pg.soft || []) { inc(out.softWarnings, s.col); if (!s.sameInstant) inc(out.softBy, s.col + '@mzReviews'); }
        for (const c of ['reviewID', 'rating', 'reviewText', 'userUrl', 'versionWhenReviewed', 'dateReviewed']) inc(out.evaluated, c + '@mzReviews', pg.n || 0);
      }
      const sem = reviewSemantics(app);
      if (!sem.n) continue;
      for (const h of sem.hard) { inc(out.hardFailures, h.col); inc(out.hardBy, h.col + '@reviewsRss'); }
      for (const c of ['reviewID', 'versionWhenReviewed', 'dateReviewed']) inc(out.evaluated, c + '@reviewsRss', sem.n);
      out.reviewShape.n += sem.n; out.reviewShape.blankVersion += sem.blankVersion; out.reviewShape.versionIsRating += sem.versionIsRating;
    }
    return out;
  }

  function driftReport(st, ctx) {
    ctx = ctx || {};
    const compat = ctx.compat == null ? !!(st && st.opts && st.opts.compat) : !!ctx.compat;
    const agg = aggregateChecks(st), problems = [], fixAnchors = [];
    const anchorDrift = [], anchorDead = [], lookupDrift = [], blankDrift = [];
    // (a) hard checks failing on >= max(3, 10%) of the rows that evaluated them (after the one refetch) = anchor drift
    for (const [k, n] of Object.entries(agg.hardBy)) {
      const of = agg.evaluated[k] || n;
      if (n >= driftThreshold(of)) { const [col, src] = k.split('@'); anchorDrift.push({ anchor: src + '.' + col, failures: n, evaluated: of }); fixAnchors.push(src + '.' + col); }
    }
    // (a2) a SOFT check that fails on many more rows than its calibrated disagreement rate is drift too (stress FI-01:
    //      price@rss failed on 25 of 25 rows, a rate never seen on 2,588 corpus rows, and stayed a warning). Only
    //      failures at equal versions count (a version mismatch is CDN age, (e) handles a relocated version field).
    //      Only sources that evaluate (nearly) every row (feed, lockups, product-dv) and >= 10 rows: the sampled app pages
    //      are few and their soft disagreements cluster (device family, locale), so a page soft check never escalates.
    //      (review dates against MZ: 0 of 5,870 saved RSS/MZ pairs differ in wall clock, SOFT_BASE)
    for (const [k, m] of Object.entries(agg.softBy || {})) {
      const [col, src] = k.split('@'), n = agg.evaluated[k] || m, cal = CALIBRATION && CALIBRATION.checks && CALIBRATION.checks[k];
      if (src === 'webPage' || n < 10) continue;
      const base = SOFT_BASE[k] != null ? SOFT_BASE[k] : cal && cal.nAll ? 1 - cal.agreeAll / cal.nAll : cal && cal.n ? 1 - cal.agree / cal.n : 0.05;
      if (significant(m, n, Math.max(0.002, base)) && !fixAnchors.includes(src + '.' + col)) { anchorDrift.push({ anchor: src + '.' + col, failures: m, evaluated: n, why: 'soft_check_fails_on_many_rows', baseline: +base.toFixed(4) }); fixAnchors.push(src + '.' + col); }
    }
    // (b) anchor liveness: an anchor that is normally present vanishes (relocated field / changed page) = anchor drift
    for (const [k, miss] of Object.entries(agg.anchorMissing)) {
      const [col, src] = k.split('@');
      const tried = (agg.evaluated[k] || 0) + miss, base = ANCHOR_BASELINE[src + '.' + col];
      const baseMiss = base == null ? 0.5 : 1 - base;
      if (significant(miss, tried, baseMiss)) { anchorDead.push({ anchor: src + '.' + col, missing: miss, of: tried, baselineMissing: +baseMiss.toFixed(3) }); fixAnchors.push(src + '.' + col); }
    }
    // (c) lookup key drift + blank drift (PLAN 3.6 LOOKUP row)
    const raws = [];
    for (const r of rowsOf(st)) { const d = st.details && (st.details[String(r.appId).toLowerCase()] || st.details[r.appId]); if (d && d.raw) raws.push(d.raw); }
    if (!raws.length && Array.isArray(st && st.primaries)) raws.push(...st.primaries);
    const sh = lookupShape(raws);
    // (c0) type drift: a key whose present values break LOOKUP_TYPES on >= max(3, 10%) of the rows (or on every row of a
    //      run smaller than that). The corpus rate is 0, so this is significant at any size; the cells are already
    //      quarantined row by row (typeCells), and the column counts as drifted (blocking in both modes).
    // (c00) row identity (stress FI-02 matrix, bundleId swapped with formattedPrice / primaryGenreName / minimumOsVersion):
    //       rows, checks and quarantine are filed under the lookup's bundleId, so a bundleId that two different apps share,
    //       that is no bundle id, or (ids mode) that is not the one requested makes every column of those rows another
    //       app's. Never on real data (35,667 records); it blocks in both modes and is no single CSV column
    //       ('lookup.rowIdentity': --deliver-anyway refuses).
    const identity = [];
    { const byKey = {};
      for (const r of rowsOf(st)) { const k = String(r.appId); (byKey[k] = byKey[k] || new Set()).add(String(r.id != null ? r.id : '')); }
      const shared = Object.keys(byKey).filter((k) => byKey[k].size > 1);
      const short = (x) => (String(x).length > 40 ? String(x).slice(0, 37) + '...' : String(x)); // a list or text in the bundleId slot can be kBs long
      if (shared.length) identity.push(`${shared.length} bundle id(s) shared by different apps (${shared.slice(0, 3).map(short).join(', ')})`);
      const badIds = raws.filter((r) => SEM.bundleId(r.bundleId) === false).map((r) => String(r.bundleId));
      if (badIds.length) identity.push(`${badIds.length} row(s) whose bundleId is no bundle id (${badIds.slice(0, 3).map((x) => JSON.stringify(x.slice(0, 24))).join(', ')})`);
      const fo = st && st.idsw && st.idsw.found;
      if (fo && typeof fo === 'object') {
        const to = {}; let mism = 0;
        for (const [inp, k] of Object.entries(fo)) { if (!/^b:/.test(inp)) continue; (to[k] = to[k] || []).push(inp); if (String(k).toLowerCase() !== inp.slice(2).toLowerCase()) mism++; }
        const coll = Object.values(to).filter((L2) => L2.length > 1).length;
        if (mism) identity.push(`${mism} requested bundle id(s) answered with another bundleId`);
        if (coll) identity.push(`${coll} lookup record(s) answering several requested bundle ids`);
      }
      if (identity.length) fixAnchors.push('lookup.rowIdentity');
    }
    const typeDrift = [];
    if (raws.length) {
      const tv = {};
      for (const raw of raws) for (const v of typeCheck(raw)) { const t = tv[v.key] = tv[v.key] || { key: v.key, col: v.col, expected: TYPE_WORD[v.kind], violations: 0, got: v.got }; t.violations++; }
      for (const t of Object.values(tv)) if (t.violations >= Math.min(raws.length, driftThreshold(raws.length))) { typeDrift.push(Object.assign(t, { of: raws.length })); fixAnchors.push('lookup.' + t.key); }
    }
    if (sh.n) {
      for (const k of REQUIRED_LOOKUP_KEYS) { const m = sh.missing[k] || 0; if (m >= driftThreshold(sh.n)) { lookupDrift.push({ key: k, missing: m, of: sh.n, required: true }); fixAnchors.push('lookup.' + k); } }
      // optional-key and blank drift: significant against the corpus rate both per row and per developer
      for (const [tk, t] of Object.entries(sh.rates)) {
        const [k, what, z] = tk.split('.');
        const B = SHAPE_BASELINE[tk];
        if (!B) continue; // no corpus baseline for this stratum: informative only
        if (what === 'blank' && lookupDrift.some((x) => x.key === k)) continue;
        const rowBase = Math.max(0.002, B.row), unitBase = Math.max(0.002, B.unit);
        if (!significant(t.m, t.n, rowBase)) continue;
        // Common symptoms (base >= 1%) cluster by developer and by chart/genre (iPhone-only games: no iPad shots;
        // one developer's apps: no website), so they also need the per-developer test, and a key absent on a
        // large share of apps anyway (base >= 20%) only counts as drift when it is blank on >= 90% of the rows.
        if (B.row >= 0.01 && !significant(t.mUnits, t.units, unitBase)) continue;
        if (B.row >= 0.2 && t.m < 0.9 * t.n) continue;
        const rec = { key: k, of: t.n, baseline: rowBase, stratum: z, developers: t.mUnits + '/' + t.units };
        rec[what] = t.m;
        (what === 'missing' ? lookupDrift : blankDrift).push(rec); fixAnchors.push('lookup.' + k);
      }
    }
    // (c2) release notes longer than the app's description: 1.9% of apps and of developers on the corpus (9,159 apps, 7,903
    //      developers); on nearly every row when the two fields traded places (stress FI-02 matrix: a description in the
    //      releaseNotes column shipped READY whenever no sampled app page could compare the notes). Row and developer
    //      tests as for blank drift.
    {
      const per = { n: 0, m: 0, dev: {} };
      for (const r of raws) {
        // a description that is no description (it traded places with a name, URL or price) is not evidence about the notes
        if (!(isObj(r) && typeof r.releaseNotes === 'string' && r.releaseNotes && typeof r.description === 'string' && r.description) || SEM.description(r.description, r) === false) continue;
        const hit = r.releaseNotes.length > r.description.length; per.n++; if (hit) per.m++;
        const dv = per.dev[String(r.artistId)] = per.dev[String(r.artistId)] || [0, 0]; dv[0]++; if (hit) dv[1]++;
      }
      const D = Object.values(per.dev), mU = D.filter(([n, m]) => m * 2 > n).length;
      if (per.n && significant(per.m, per.n, 0.019) && significant(mU, D.length, 0.019)) {
        lookupDrift.push({ key: 'releaseNotes', missing: per.m, of: per.n, why: 'longer_than_description', developers: mU + '/' + D.length });
        fixAnchors.push('lookup.releaseNotes');
      }
    }
    // (c3) the lookup version EQUAL to another field of its record (VERSION_COPY_FROM: minimum OS, a rating, a count, ...)
    //      on a significant share of the rows (50,108 distinct records: 35 = 0.07%, 14 apps): a field copied into the version slot,
    //      visible on rows no app page sampled (a page that shows another version catches it per row, checkRow)
    {
      let m = 0; const from = {};
      for (const r of raws) { const k = versionCopiedFrom(r); if (k) { m++; inc(from, k); } }
      if (raws.length && significant(m, raws.length, 0.002)) {
        const top = Object.entries(from).sort((a, b) => b[1] - a[1])[0][0];
        lookupDrift.push({ key: 'version', missing: m, of: raws.length, why: 'equals_' + top }); fixAnchors.push('lookup.version');
      }
    }
    // (d) review page shape
    for (const [bid, app] of Object.entries((st && st.reviews) || {})) {
      if (!app) continue;
      // as_reviews state: malformed = [{p, index, field}] (field-level, several per entry) over rs.pageEntries;
      // a plain {rows, malformed:[{i, missing[]}]} object (reviewShape output) is accepted too.
      const M = Array.isArray(app.malformed) ? app.malformed : [];
      const mal = new Set(M.map((m) => (m.p != null ? m.p : '') + ':' + (m.index != null ? m.index : m.i))).size;
      let n = 0;
      if (app.pageEntries) for (const L of Object.values(app.pageEntries)) n += Array.isArray(L) ? L.length : 0;
      else n = (Array.isArray(app.rows) ? app.rows.length : 0) + mal;
      if (mal && mal >= driftThreshold(Math.max(n, mal))) { lookupDrift.push({ key: 'reviewsRss.entry', missing: mal, of: Math.max(n, mal), app: bid }); fixAnchors.push('reviewsRss.entry'); }
    }
    // (d2) the review version column (stress FI-07: blank on 50 of 50 rows with no flag): blank, or equal to the rating,
    //      on a significant share of the held reviews (corpus: 0 of 4,981 blank, 0 of 4,631 equal to the rating)
    const rsh = agg.reviewShape || { n: 0 };
    for (const [what, m] of [['blank', rsh.blankVersion || 0], ['equals_rating', rsh.versionIsRating || 0]]) {
      if (rsh.n && significant(m, rsh.n, 0.002)) {
        (what === 'blank' ? blankDrift : lookupDrift).push(Object.assign({ key: 'reviewsRss.versionWhenReviewed', of: rsh.n, baseline: 0.002 }, what === 'blank' ? { blank: m } : { missing: m, why: 'version_equals_rating' }));
        fixAnchors.push('reviewsRss.versionWhenReviewed');
      }
    }
    // (d3) one version on every held review, far below the app's own (leading number under half of it, the app's at
    //      least 4), while 3+ of those reviews are dated after the app's current version was released: the feed's version
    //      field holds a constant (stress regression: '1.0' on all 50 Strava reviews, app at 483.0.0, shipped READY).
    //      Saved real feeds (114 apps with their lookup's version and date): 0 apps, and not one review dated after its
    //      app's current release carries a version below half of the app's.
    for (const [bid, app] of Object.entries((st && st.reviews) || {})) {
      if (!app || !app.pageEntries || typeof app.appVersion !== 'string' || typeof app.appVersionDate !== 'string') continue;
      const appN = leadNum(app.appVersion), rel = Date.parse(app.appVersionDate);
      if (appN == null || appN < 4 || isNaN(rel)) continue;
      const E = [].concat(...Object.values(app.pageEntries).map((L) => (Array.isArray(L) ? L : []))).filter((e) => e && e.id);
      const vs = new Set(E.map((e) => (e['im:version'] ? e['im:version'].label : undefined)));
      if (E.length < 20 || vs.size !== 1) continue;
      const v = [...vs][0], vn = leadNum(v);
      const after = E.filter((e) => e.updated && Date.parse(e.updated.label) > rel).length;
      if (vn != null && vn < appN / 2 && after >= 3) {
        lookupDrift.push({ key: 'reviewsRss.versionWhenReviewed', missing: E.length, of: E.length, why: `constant_version_${v}_far_below_app_version_${app.appVersion}`, app: bid });
        fixAnchors.push('reviewsRss.versionWhenReviewed');
      }
    }
    // (e) version anchor drift: a source whose version disagrees with the lookup on many rows (baseline ~1%) has a
    //     relocated version field; left alone it would turn every row into cdn_age and demote its hard checks.
    // (f) structural markers of the page blocks (advisory: fallback anchors still verified the values).
    const vTot = {}, vBad = {}, sTot = {}, sMiss = {}, structDrift = [];
    for (const c0 of Object.values((st && st.checks) || {})) {
      if (!c0) continue; const x = c0.after || c0;
      for (const [src, eq] of Object.entries(x.versionSources || {})) { inc(vTot, src); if (eq === false) inc(vBad, src); }
      for (const [k, v] of Object.entries(x.struct || {})) { inc(sTot, k); if (!v) inc(sMiss, k); }
    }
    for (const [src, n] of Object.entries(vTot)) {
      const m = vBad[src] || 0, base = VERSION_MISMATCH_BASELINE[src] == null ? 0.01 : VERSION_MISMATCH_BASELINE[src];
      if (significant(m, n, base)) { anchorDrift.push({ anchor: src + '.version', failures: m, evaluated: n, why: 'version_disagrees_on_many_rows' }); fixAnchors.push(src + '.version'); }
    }
    { // FS-05: a page age rating outside the 2025 scale (or a lookup rating outside the legacy one) is an alert
      let ageN = 0, ageBad = 0;
      for (const c0 of Object.values((st && st.checks) || {})) { if (!c0) continue; const x = c0.after || c0;
        if ([].concat(x.pass || [], x.warn || []).some((y) => y.col === 'contentRating')) ageN++;
        if ((x.flags || []).includes('age_scale_membership_break')) ageBad++; }
      if (ageBad && significant(ageBad, ageN, 0)) structDrift.push({ marker: 'webPage.ageRating.scale', missing: ageBad, of: ageN, baselinePresent: 1 });
    }
    for (const [k, n] of Object.entries(sTot)) {
      const m = sMiss[k] || 0, pres = STRUCT_BASELINE[k];
      if (pres == null) continue; // markers without a corpus baseline are informative only
      if (significant(m, n, 1 - pres)) structDrift.push({ marker: k, missing: m, of: n, baselinePresent: pres });
    }
    // cdn_age (Apple's CDN served an older lookup) is claimed for a version mismatch only when the evidence allows it:
    // when the one cache-busted re-read returned the SAME version as the first read, the lookup was not stale, so the
    // mismatch is the page's (or its anchor's) and is counted as versionMismatchPersistent instead (SE-E, 2026-10-03).
    let cdnAgeRows = 0, versionMismatchRows = 0, versionMismatchPersistent = 0, refetched = 0;
    for (const c of Object.values((st && st.checks) || {})) {
      if (!c) continue; const x = c.after || c;
      if (c.refetched) refetched++;
      if (x.versionEqual === false) versionMismatchRows++;
      const notStale = !!c.refetched && c.refetchVersionChanged === false && x.versionEqual === false;
      if (notStale) versionMismatchPersistent++;
      if ((x.cdnAge && !notStale) || (x.flags || []).some((f) => /^consistency_counter|rating_page_lag/.test(f))) cdnAgeRows++;
    }
    const uniq = [...new Set(fixAnchors)];
    if (anchorDrift.length) problems.push('anchor drift: ' + anchorDrift.map((d) => `${d.anchor} failed on ${d.failures}/${d.evaluated} rows`).join('; '));
    // values that traded places: name both columns (FI-10: --deliver-anyway blanks every drifted column, partners included)
    const swaps = Object.entries(agg.swaps || {}).sort((a, b) => b[1] - a[1]);
    if (swaps.length) problems.push('swapped values suspected (both columns quarantined per row): ' + swaps.slice(0, 6).map(([p, n]) => `${p} on ${n} row(s)`).join('; '));
    const su = Object.entries(agg.sameUnit || {});
    if (su.length) problems.push('rescaled counts suspected (the app page\'s rating count differs by more than a factor 0.8; the same-unit column is quarantined too): ' + su.map(([k, n]) => `${k.split('->')[1]} with ${k.split('->')[0]} on ${n} row(s)`).join('; '));
    // a lookup field the CSV does not carry (sellerName, formattedPrice, trackContentRating, artworkUrl100) failing its
    // check on many rows: advisory (no column of this file holds it), but a sign the lookup layout moved
    const nRows = rowsOf(st).length, unr = Object.entries(agg.unrendered || {}).filter(([, n]) => nRows && n >= driftThreshold(nRows));
    if (unr.length) problems.push('lookup field(s) outside the CSV fail their semantic check (advisory): ' + unr.map(([k, n]) => `${k} on ${n}/${nRows} rows`).join('; '));
    if (anchorDead.length) problems.push('anchor missing: ' + anchorDead.map((d) => `${d.anchor} absent on ${d.missing}/${d.of}`).join('; '));
    if (identity.length) problems.push('row identity broken (the lookup\'s bundleId no longer identifies each app, so whole rows may be another app\'s): ' + identity.join('; '));
    if (typeDrift.length) problems.push('lookup type drift (cells quarantined): ' + typeDrift.map((d) => `${d.key} is not ${d.expected} on ${d.violations}/${d.of} rows (got ${d.got})`).join('; '));
    if (lookupDrift.length) problems.push('lookup shape drift: ' + lookupDrift.map((d) => `${d.key} ${d.why ? d.why.replace(/_/g, ' ') : 'missing'} on ${d.missing}/${d.of}`).join('; '));
    if (blankDrift.length) problems.push('blank drift: ' + blankDrift.map((d) => `${d.key} blank on ${d.blank}/${d.of} (baseline ${(d.baseline * 100).toFixed(1)}%)`).join('; '));
    if (structDrift.length) problems.push('page structure changed (advisory, values still verified by fallback anchors): ' + structDrift.map((d) => `${d.marker} absent on ${d.missing}/${d.of}`).join('; '));
    // review date labels in another shape than Apple's feed uses (33,650 of 33,650 saved labels are
    // YYYY-MM-DDTHH:MM:SS-07:00 or -08:00): the same instants (MZ agrees, sameInstant), so not a wrong value, but the
    // format changed (stress regression: an ISO 'Z' rewrite showed only in crossChecks.softWarnings). Advisory.
    {
      let n = 0, m = 0, ex = null;
      for (const app of Object.values((st && st.reviews) || {})) {
        if (!app || !app.pageEntries) continue;
        for (const L of Object.values(app.pageEntries)) for (const e of (Array.isArray(L) ? L : [])) {
          const l = e && e.updated && e.updated.label; if (typeof l !== 'string') continue;
          n++; if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d-0[78]:00$/.test(l)) { m++; if (!ex) ex = l; }
        }
      }
      if (m && m >= Math.min(n, driftThreshold(n))) problems.push(`review dates arrive in another format than Apple's reviews feed has used (advisory: the instants are unchanged; default mode writes each with the review's Pacific offset, --smar-compat as Apple sent it): ${m} of ${n} labels, e.g. "${String(ex).slice(0, 40)}"`);
    }
    if (versionMismatchPersistent) problems.push(`${versionMismatchPersistent} row(s): the app page shows another version than the lookup, and a cache-busted re-read returned the same lookup version, so this is not Apple's CDN age`);
    // a drifted column (a check failing on >= max(3, 10%) of the rows, a vanished anchor, a moved or blanked lookup key, a
    // type change) blocks in BOTH modes: it is an Apple source that changed, not one disputed cell, and SMAR's file would
    // carry the same wrong values (stress regression: 18 of 19 --smar-compat mutations shipped READY with price <-> count,
    // release <-> update date, review id = author id... on every row). Per-row disagreements stay compat's unverified cells.
    const blocking = uniq.length > 0 || typeDrift.length > 0 || identity.length > 0;
    return { anchorDrift, anchorDead, lookupDrift, blankDrift, typeDrift, identity, structDrift, cdnAgeRows, versionMismatchRows, versionMismatchPersistent, refetched, fixAnchors: uniq,
      advisory: structDrift.map((d) => d.marker), problems, blocking, checks: agg };
  }

  function quarantineSummary(st, ctx) {
    ctx = ctx || {};
    const qc = {}, apps = [], uv = [];
    // review cells keyed by the row's own key ('version', see reviewQuarantine) are reported under their CSV column
    const colOf = (id, c) => (/^review:/.test(id) && REVIEW_ROW_COL[c] ? REVIEW_ROW_COL[c] : c);
    for (const [id, cells] of Object.entries((st && st.quarantined) || {})) { if (!cells || !Object.keys(cells).length) continue; apps.push(id); for (const c of new Set(Object.keys(cells).map((k) => colOf(id, k)))) inc(qc, c); }
    for (const [id, cells] of Object.entries((st && st.unverified) || {})) for (const [c, why] of Object.entries(cells || {})) uv.push({ appId: id, col: colOf(id, c), why });
    const undef = {};
    for (const r of ctx.rows || []) for (const [k, v] of Object.entries(r)) if (v === undefined || v === 'undefined') inc(undef, k);
    return { quarantinedCells: qc, quarantinedApps: apps, unverifiedCells: uv, undefinedCounts: undef };
  }

  // anchorColumns(fixAnchors, layout) -> {cols:{column: anchor}, unmapped:[anchor]}: the CSV columns a drifted anchor
  // speaks for ('lookup.<key>' -> that key's column; '<source>.<column>' -> the column; 'writer.<column>' -> the column).
  // --deliver-anyway blanks EVERY cell of each mapped column; an anchor that is no single column (a source's version
  // field, the reviews feed entry shape) cannot be blanked away, so deliver-anyway refuses.
  // Columns that are derived from a drifted one in the same record (stress round 2: a consistent genre reassignment
  // drifted primaryGenreId/genreIDs against the feed, and deliver-anyway left 'genres' holding the reassigned names):
  // the genre id decides the primary genre name and belongs to genreIds, whose parallel list of names is genres. Also
  // per row (quarantineCells: a 1-2 app run quarantined primaryGenreId and shipped the reassigned genre names).
  const COLUMN_FAMILY = { primaryGenreId: ['primaryGenre', 'genreIDs', 'genres'], genreIDs: ['genres'] };
  function anchorColumns(anchors, layout) {
    const valid = layout === 'reviews' || layout === 'bulkReviews' ? COLUMNS_REVIEWS.concat(['appId']) : layout === 'chart' ? COLUMNS_CHART : COLUMNS_SEARCH;
    const cols = {}, unmapped = [];
    for (const a of [].concat(anchors || [])) {
      const i = String(a).indexOf('.'), src = String(a).slice(0, i), f = String(a).slice(i + 1);
      let col = null;
      if (src === 'lookup') col = LOOKUP_COL[f] || (/^artworkUrl(100|60)$/.test(f) ? 'icon' : null);
      else col = f;
      if (col && col !== 'dateScraped' && valid.includes(col)) { if (!cols[col]) cols[col] = a; } else unmapped.push(a);
    }
    for (const col of Object.keys(cols)) for (const p of COLUMN_FAMILY[col] || []) if (valid.includes(p) && !cols[p]) cols[p] = cols[col] + ' (with ' + col + ')';
    return { cols, unmapped };
  }

  // ------------------------------------------------------------------------------------------- compatExact / NEXT
  const NO_FILE = ['smar_http500'];
  // reviewTransport(st, facts) -> [{appId, empty:[p], healed:[p], parse:[p]}]: the review pages whose bytes depended on
  // transport (Akamai-empty mid-feed pages, healed or not; pages re-parsed after a garbled read), per app. facts.apps
  // (as_reviews.appSummary list) is used when the caller passes it; otherwise it is read from the app states.
  function reviewTransport(st, facts) {
    const out = [];
    if (facts && Array.isArray(facts.apps)) {
      for (const a of facts.apps) {
        const empty = (a && a.emptyMidFeedPages) || [], parse = (a && a.transportRisk && a.transportRisk.parseRetried) || [];
        if (empty.length || parse.length) out.push({ appId: a.appId, empty: empty.slice(), healed: (a.healed || []).slice(), parse: parse.slice() });
      }
      return out;
    }
    for (const rs of Object.values((st && st.reviews) || {})) {
      if (!rs || !Array.isArray(rs.pages)) continue;
      const healed = (rs.heal && Array.isArray(rs.heal.healed)) ? rs.heal.healed : [];
      const last = rs.pages.reduce((m, p) => (p && p.n > 0 ? Math.max(m, p.p) : m), 0);
      const empty = rs.pages.filter((p) => p && (healed.includes(p.p) || (p.n === 0 && p.p < last))).map((p) => p.p);
      const parse = Array.isArray(rs.transportParse) ? rs.transportParse : [];
      if (empty.length || parse.length) out.push({ appId: rs.appId || rs.appRef, empty, healed: healed.slice(), parse: parse.slice() });
    }
    return out;
  }
  function compatExact(st, facts) {
    facts = facts || {};
    // distinct reasons are kept (one code may carry two different details); only an identical reason is dropped
    const reasons = [], add = (code, detail) => { if (!reasons.some((r) => r.code === code && r.detail === detail)) reasons.push({ code, detail }); };
    const t = (st && st.transport) || {};
    // transport_dependent names what this run actually saw (stress SCALE-9: a reviews run with 24 apps' unhealed empty
    // pages said "0 gzip similar pages, 0 empty review pages" because it read the search-mode counters)
    // gzipPages / garbledPages / emptyPages are search counters: a reviews run never fills them, so its detail is built
    // from the review pages alone (appstore_core then merges the per-app details into one reason)
    const isReviews = !!(st && st.opts && st.opts.mode === 'reviews');
    const gz = isReviews ? 0 : new Set([].concat(t.gzipPages || [], t.garbledPages || [])).size, rv = reviewTransport(st, facts);
    const tEmpty = isReviews ? [] : (t.emptyPages || []);
    if (gz || tEmpty.length || rv.length || facts.transportDependent) {
      const parts = [];
      if (gz) parts.push(`${gz} similar page(s) arrived compressed or garbled (SMAR does not decode them)`);
      if (rv.length) {
        const E = rv.reduce((s, a) => s + a.empty.length, 0), U = rv.reduce((s, a) => s + a.empty.filter((p) => !a.healed.includes(p)).length, 0), P = rv.reduce((s, a) => s + a.parse.length, 0);
        const each = rv.map((a) => `${a.appId} p${a.empty.concat(a.parse.filter((p) => !a.empty.includes(p))).join(',')}${a.healed.length ? ' (healed ' + a.healed.join(',') + ')' : ''}`);
        let list = ''; let i = 0;
        for (; i < each.length; i++) { const add2 = (i ? '; ' : '') + each[i]; if (i && list.length + add2.length > 300) break; list += add2; }
        parts.push(`${E} empty mid-feed review page(s) on ${rv.length} app(s), ${U} unhealed${P ? `, ${P} re-parsed` : ''}: ${list}${i < each.length ? ` (+${each.length - i} more apps)` : ''}`);
      }
      if (tEmpty.length && !rv.length) parts.push(`${tEmpty.length} empty review page(s)`);
      add('transport_dependent', parts.join('; ') || 'responses that depended on Apple\'s transport (see transportRisk)');
    }
    if (facts.storefrontFallback) add('smar_storefront_fallback', facts.storefrontFallback);
    if (facts.siteTermApplied) add('site_term_applied', facts.siteTermApplied);
    const dr = facts.drift || driftReport(st, { compat: true });
    if (dr.cdnAgeRows) add('cdn_age', `${dr.cdnAgeRows} rows`);
    if (dr.lookupDrift.length || dr.blankDrift.length) add('lookup_key_missing', dr.lookupDrift.concat(dr.blankDrift).map((d) => d.key).join(','));
    if ((dr.typeDrift || []).length) add('lookup_type_changed', dr.typeDrift.map((d) => d.key).join(','));
    // similar_key_missing: the engine passes it only on a mass loss of customersAlsoBoughtApps (as_search.searchReport,
    // stress WI-9: a page without the list is SMAR's bytes too, since its similar() reads the same page and returns [])
    if (facts.similarKeyMissing) add('similar_key_missing', facts.similarKeyMissing);
    if (facts.bulk) add('bulk_frontend_not_reproduced', 'bulk reviews');
    if (facts.noSmarEquivalent) add('no_smar_equivalent', facts.noSmarEquivalent);
    if (facts.smarHttp500) add('smar_http500', facts.smarHttp500);
    if (facts.searchRankNondeterminism) add('search_rank_nondeterminism', facts.searchRankNondeterminism);
    return { ok: reasons.length === 0, reasons };
  }
  const next = {
    deliver: () => 'DELIVER',
    resume: (cmd) => 'RESUME: ' + cmd + (/\s--resume(\s|$)/.test(cmd) ? '' : ' --resume'),
    refetch: (cmd) => 'REFETCH: ' + cmd,
    fixAnchor: (list) => 'FIX_ANCHOR: ' + [].concat(list).join(', ') + ' (an Apple source changed shape; tell the user, edit nothing)',
    stop: (s) => 'STOP: ' + String(s).replace(/\s+/g, ' ').trim().replace(/([^.!?])$/, '$1.'),
  };
  function decide(st, facts, ctx) {
    facts = facts || {}; ctx = ctx || {};
    const compat = facts.compat == null ? !!(st && st.opts && st.opts.compat) : !!facts.compat;
    const drift = driftReport(st, { compat });
    const ce = compatExact(st, Object.assign({}, facts, { drift }));
    const problems = [].concat(facts.problems || [], drift.problems);
    const rows = facts.rows != null ? facts.rows : rowsOf(st).length;
    let NEXT, exitCode = EXIT.finished, READY = false;
    if (facts.crash) { NEXT = next.stop('the runner crashed; give the user error.message' + (ctx.cmd ? ' and the resume command' : '')); exitCode = EXIT.crash; }
    else if (facts.stop) { NEXT = next.stop(facts.stop.sentence || facts.stop.code); exitCode = EXIT.stopped; problems.push('stopped: ' + (facts.stop.code || facts.stop.sentence)); }
    else if (facts.incomplete || facts.finished === false) { NEXT = next.resume(ctx.cmd || '<same command>'); exitCode = EXIT.incomplete; problems.push('run not finished'); }
    else if (compat && ce.reasons.some((r) => NO_FILE.includes(r.code))) { NEXT = next.stop('smar-tool.org answers HTTP 500 for this request, so there is no file; tell the user'); exitCode = EXIT.stopped; problems.push('smar_http500'); }
    else if (facts.endpointDrift && !compat) { NEXT = next.stop('an Apple endpoint changed shape (' + facts.endpointDrift + '); tell the user and do not deliver'); exitCode = EXIT.stopped; problems.push('endpoint_drift: ' + facts.endpointDrift); }
    else if (facts.similarDrift && !compat) { NEXT = next.stop('the similar-app pages lost customersAlsoBoughtApps (similar_drift); tell the user and do not deliver'); exitCode = EXIT.stopped; problems.push('similar_drift'); }
    else if (!rows) { NEXT = next.stop(facts.noResults ? 'Apple returned no results for this request; tell the user' : 'the run produced no rows; tell the user'); exitCode = EXIT.stopped; problems.push('no rows'); }
    else if ((facts.fetchFailed || []).length) { NEXT = next.refetch(ctx.refetchCmd ? ctx.refetchCmd(facts.fetchFailed) : (ctx.cmd || '<refetch>')); problems.push(facts.fetchFailedText || `${facts.fetchFailed.length} app(s) failed to fetch after retries`); }
    else if (drift.blocking) { NEXT = next.fixAnchor(drift.fixAnchors); }
    else { READY = true; NEXT = next.deliver(); }
    // --resume --deliver-anyway (the user agreed): a finished run held back only by drift or failed fetches is
    // delivered, with the reason kept in problems. STOP / crash / incomplete / no rows / no-file never are.
    let deliveredAnyway = false;
    if (facts.deliverAnyway && !READY && exitCode === EXIT.finished && rows && /^(FIX_ANCHOR|REFETCH):/.test(NEXT)) {
      problems.push('delivered anyway at the user\'s request despite: ' + NEXT.split(' (')[0]); READY = true; NEXT = next.deliver(); deliveredAnyway = true;
    }
    return { READY_TO_DELIVER: READY, NEXT, problems, exitCode, compatExact: ce, drift, deliveredAnyway };
  }

  // ------------------------------------------------------------------------------------------- 4 KB cap
  // Per-app reviews table (stress SCALE-4): step 5 reports rows, target, ratingCount, duplicates and healed for EVERY
  // app, but halving the largest arrays used to cut reviews.apps to 1 of 31 apps (and its pages to [0]). When the
  // summary does not fit, reviews.apps becomes reviews.appsTable {cols, rows:[[...] per app]} (healed/unhealed as page
  // counts), which is kept whole while every other list is cut; only if it alone cannot fit are its rows cut, and
  // reviews.appsTableTruncated then names the file holding every app (summary.appsFile when the runner wrote one, else
  // summaryFile: its reviews.apps).
  const APP_COLS = ['appId', 'rows', 'target', 'ratingCount', 'duplicates', 'healed', 'unhealed', 'error'];
  function appsTable(apps) {
    return { cols: APP_COLS, rows: apps.map((a) => {
      const healed = Array.isArray(a.healed) ? a.healed : [], empty = Array.isArray(a.emptyMidFeedPages) ? a.emptyMidFeedPages : [];
      const unhealed = Array.isArray(a.unhealed) ? a.unhealed.length : empty.filter((p) => !healed.includes(p)).length;
      const row = [a.appId, a.rows, a.target, a.ratingCount, Array.isArray(a.duplicates) ? a.duplicates.length : (a.duplicates || 0), healed.length, unhealed, a.notFound ? 'not_found' : a.error || 0];
      return row.map((x) => (x === undefined ? null : x));
    }) };
  }
  function capSummary(s, maxBytes) {
    maxBytes = maxBytes || 4096;
    const o = JSON.parse(JSON.stringify(s));
    const size = () => Buffer_byteLength(JSON.stringify(o));
    const caps = [['unverifiedCells', 25], ['quarantinedApps', 10], ['problems', 8]];
    for (const [k, n] of caps) if (Array.isArray(o[k]) && o[k].length > n) { o[k] = o[k].slice(0, n); o.truncated = true; }
    if (o.smarWouldDrop && Array.isArray(o.smarWouldDrop.items) && o.smarWouldDrop.items.length > 25) { o.smarWouldDrop.items = o.smarWouldDrop.items.slice(0, 25); o.truncated = true; }
    if (size() <= maxBytes) return o;
    const hasApps = o.reviews && Array.isArray(o.reviews.apps) && o.reviews.apps.length;
    if (hasApps) { o.reviews.appsTable = appsTable(o.reviews.apps); delete o.reviews.apps; o.truncated = true; }
    const lists = () => { const L = []; (function walk(x, p) { if (Array.isArray(x)) { if (x.length > 1) L.push([p, x]); x.forEach((y, i) => walk(y, p.concat(i))); } else if (isObj(x)) for (const k of Object.keys(x)) walk(x[k], p.concat(k)); }(o, [])); return L; };
    // what the agent acts on is never shortened while anything else can be: NEXT, deliverAnyway (possible, why,
    // blankColumns), blankedColumns, compatExact.reasons (smar_storefront_fallback decides what step 5 may say),
    // drift.fixAnchors (the fields named to the user) and the per-app reviews table (step 5). Only if the rest cannot
    // make room are they cut too.
    // partialApps (reviews held back or delivered anyway: every incomplete app with rows, target, missing pages) is what
    // the agent tells the user before --deliver-anyway, so it is kept with them.
    const critical = (p) => p[0] === 'NEXT' || p[0] === 'deliverAnyway' || p[0] === 'blankedColumns' || p[0] === 'compatExact' || (p[0] === 'drift' && p[1] === 'fixAnchors')
      || (p[0] === 'reviews' && p[1] === 'appsTable') || p[0] === 'partialApps';
    const shrink = (keep) => {
      let guard = 0;
      while (size() > maxBytes && guard++ < 400) {
        const L = lists().filter(([p]) => p[0] !== 'NEXT' && !(keep && critical(p))); if (!L.length) break;
        L.sort((a, b) => JSON.stringify(b[1]).length - JSON.stringify(a[1]).length);
        const arr = L[0][1]; arr.splice(Math.max(1, Math.floor(arr.length / 2))); o.truncated = true;
      }
    };
    // long strings outside the paths and NEXT: a list or a description that landed in the bundleId slot makes every appId
    // kBs long (stress round 2: quarantinedApps alone took stdout to 6.9 kB after the lists were cut to one entry)
    const PATHS = { NEXT: 1, csv: 1, relog: 1, summaryFile: 1, appsFile: 1, progress: 1, pages: 1, emitBoth: 1, resumeWith: 1, perAppFiles: 1 };
    const clip = (n, keepCritical) => (function walk(x, p) {
      if (Array.isArray(x)) x.forEach((y, i) => { if (typeof y === 'string') { if (y.length > n && !(keepCritical && critical(p))) { x[i] = y.slice(0, n - 3) + '...'; o.truncated = true; } } else walk(y, p.concat(i)); });
      else if (isObj(x)) for (const k of Object.keys(x)) {
        const q = p.concat(k);
        if (typeof x[k] === 'string') { if (x[k].length > n && !(p.length === 0 && PATHS[k]) && !(k === 'file' && p[p.length - 1] === 'appsTableTruncated') && !(keepCritical && critical(q))) { x[k] = x[k].slice(0, n - 3) + '...'; o.truncated = true; } } else walk(x[k], q);
      }
    }(o, []));
    shrink(true);
    if (size() > maxBytes) clip(200, true);
    for (const k of ['problems']) if (size() > maxBytes && Array.isArray(o[k])) o[k] = o[k].map((x) => String(x).slice(0, 160));
    if (size() > maxBytes && o.compatExact && Array.isArray(o.compatExact.reasons)) o.compatExact.reasons = o.compatExact.reasons.map((r) => (isObj(r) && typeof r.detail === 'string' && r.detail.length > 240 ? Object.assign({}, r, { detail: r.detail.slice(0, 240) + '...' }) : r));
    if (size() > maxBytes && hasApps) { // fields step 5 never reports make room for the per-app table first
      // (notes are informative; partialApps stays: it names the incomplete apps for deliver-anyway)
      for (const k of ['pages', 'progress', 'requests', 'startedUTC', 'finishedUTC', 'seconds', 'notes']) { if (size() <= maxBytes) break; if (k in o) { delete o[k]; o.truncated = true; } }
      const bs = o.crossChecks && o.crossChecks.bySource;
      if (size() > maxBytes && isObj(bs)) for (const k of Object.keys(bs)) if (!bs[k]) delete bs[k];
      if (size() > maxBytes && isObj(o.defaultFixes) && !Object.keys(o.defaultFixes).length) delete o.defaultFixes;
      // then shorter texts (the full ones are in summaryFile)
      if (size() > maxBytes && o.compatExact && Array.isArray(o.compatExact.reasons)) o.compatExact.reasons = o.compatExact.reasons.map((r) => (isObj(r) && typeof r.detail === 'string' && r.detail.length > 160 ? Object.assign({}, r, { detail: r.detail.slice(0, 157) + '...' }) : r));
      if (size() > maxBytes && Array.isArray(o.problems)) o.problems = o.problems.map((x) => (String(x).length > 120 ? String(x).slice(0, 117) + '...' : x));
    }
    if (size() > maxBytes && hasApps) { // the table alone cannot fit: keep the first apps, name the file with all of them
      const T = o.reviews.appsTable, all = T.rows.length, file = o.appsFile || o.summaryFile || null;
      o.reviews.appsTableTruncated = { shown: all, of: all, file, key: o.appsFile ? 'apps' : 'reviews.apps' };
      const full = T.rows.slice();
      let lo = 1, hi = all; // the most leading apps that fit (binary search on the row count)
      while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); T.rows = full.slice(0, mid); o.reviews.appsTableTruncated.shown = mid; if (size() <= maxBytes) lo = mid; else hi = mid - 1; }
      T.rows = full.slice(0, lo); o.reviews.appsTableTruncated.shown = lo;
    }
    if (size() > maxBytes) shrink(false);
    if (size() > maxBytes) clip(120, false);
    if (size() > maxBytes) { // last resort: what the agent needs to act, and where the full summary is
      const keep = ['skill', 'version', 'mode', 'csv', 'csvName', 'rows', 'READY_TO_DELIVER', 'NEXT', 'deliverAnyway', 'blankedColumns', 'deliveredAnyway', 'problems', 'summaryFile', 'relog'];
      const m = {}; for (const k of keep) if (k in o) m[k] = o[k];
      if (Array.isArray(m.problems)) m.problems = m.problems.slice(0, 2);
      m.truncated = true; m.truncatedNote = 'stdout cap: only the fields to act on are shown; the full summary is summaryFile';
      return m;
    }
    return o;
  }
  function Buffer_byteLength(s) { if (typeof Buffer !== 'undefined') return Buffer.byteLength(s, 'utf8'); return unescape(encodeURIComponent(s)).length; }

  return { VERSION, COLUMNS_SEARCH, COLUMNS_CHART, COLUMNS_REVIEWS, COL_LOOKUP_KEY, COL_CLEAN_KEY, CHECKS, GATE_PLAN, CALIBRATION,
    REQUIRED_LOOKUP_KEYS, OPTIONAL_KEY_BASELINE, BLANK_BASELINE, ANCHOR_BASELINE, STRUCT_BASELINE, VERSION_MISMATCH_BASELINE, SHAPE_BASELINE, DRIFT_ALPHA, AGE_ALLOW, EXIT, NEXT_KINDS, SRC_COLS, COMPARE,
    anchorsFromWebPage, anchorsFromPlatform, anchorsFromSimilarPage, anchorsFromLockups, anchorsFromChartRss, parseMzReviews,
    checkRow, checkRatings, checkContentRating, legacyAge, checkConsistency, invariants, reviewInvariants, checkReviews, pacificWall,
    LOOKUP_TYPES, LOOKUP_COL, typeCheck, typeCells, anchorColumns,
    lookupShape, shapeRates, reviewShape, reviewsChecks, reviewQuarantine, quarantineCells, applyQuarantine, aggregateChecks, driftReport, quarantineSummary, compatExact, decide,
    SEM, PRIMARY_GENRE, semanticCheck, reviewSemantics, reviewTransport, appsTable,
    next, capSummary, garbled, binomTail, significant, _h: { idOf, ccOf, dirOf, osNorm, isoSec, blank } };
}));
