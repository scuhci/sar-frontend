# SMAR App Store CSV: columns, sources, byte rules and quirks (v2.1)

Ground truth: SMAR's iOS server, SAR-backend branch ios-production at `95783af` (sar-backend 1.1.0) with
app-store-scraper 0.18.0 and `utilities/jsonToCsv.js`; the website is sar-frontend revision 3a2b10e. Evidence
ids in brackets are verified findings in `eval/appstore/workflow_result.json`; `EA` = `eval/appstore`.

## 1. Headers (what the first line of each file is)
Every header name is quoted. `dateScraped` is the last column in every layout.

- Search, `ids` and `rerun` (34 columns):
  `"id","appId","appName","url","icon","genres","genreIDs","primaryGenre","primaryGenreId","contentRating","supportedLanguages","appSizeInBytes","requiredOsVersion","originalReleaseDate","lastUpdated","releaseNotes","currentAppVersion","price","currency","developerId","developer","developerAppStorePageURL","developerWebsite","avgRating","totalReviews","currentVersionAvgRating","currentVersionReviews","appScreenshots","appIpadScreenshots","appletvScreenshots","supportedDeviceList","country","scrapedFrom","dateScraped"`
- Charts (32 columns): the same without `country` and `scrapedFrom`.
- Reviews (9 columns): `"reviewID","userUrl","versionWhenReviewed","rating","reviewText","reviewURL","dateReviewed","country","dateScraped"`
- Bulk reviews (10 columns): `"appId"` first, then the 9 review columns, one block per app in input order.

Column order is key order: app-store-scraper's `cleanApp` keys minus SMAR's exclusion list (`free`,
`description`), then `country` and `source` (renamed `scrapedFrom`). Reviews: the `cleanList` keys minus
`userName` and `title`, then `country`. The renames are jsonToCsv's `fixColumns` (`title`→`appName`,
`genreIds`→`genreIDs`, `score`→`avgRating`, `reviews`→`totalReviews`, `id`→`reviewID`, `score`→`rating`, ...).

## 2. App columns: SMAR's source and the skill's cross-checks
Every value is copied from one iTunes Lookup result (the only source SMAR copies) [FS-02]. Search rows use
`lookup?bundleId=...&country=<CC>`, chart rows `lookup?id=...&country=<CC>`. Cross-check sources only vote on
that value; a value is never taken from them (A1/A3 in `EA/PLAN.md`).

Sources: `webPage` = apps.apple.com page (JSON-LD and serialized server data; sampled, about 10 rows per run);
`productDv` = the legacy store page every search primary's similar list comes from (free); `lockup` = the first
~8 results of the MZStore search response (free); `rss` = the chart feed entry (every chart row, free). Gate =
`hard` (a failure quarantines the cell in default mode), `soft` (warning), `warn`, `ver` (only when the page
shows the same app version). Agreement is the calibration on the cached corpus at equal versions
(`scripts/as_checks.js` CALIBRATION, 2026-10-02: 334 pages, 142 product pages, 349 lockups, 2,588 chart entries,
4,645 apps); a check is hard only at 100% on at least 100 pairs.

| Column | SMAR copies (lookup key) | Cross-checks (gate, agreement) |
|---|---|---|
| id | `trackId` | webPage, productDv, lockup, rss: hard (332/332, 141/141, 349/349, 2,588/2,588); `url` contains `/id<id>` |
| appId | `bundleId` (row and de-dup key) | webPage, productDv, lockup, rss: hard (all 100%) |
| appName | `trackName`, cleanText | webPage, productDv, lockup, rss: hard (all 100%) |
| url | `trackViewUrl` as is (`?uo=4`; Mac apps `?mt=12&uo=4`) | webPage, productDv, lockup, rss: hard; `/<cc>/` path segment |
| icon | `artworkUrl512` or `artworkUrl100` or `artworkUrl60` | webPage: hard, ver (332/332) |
| genres | `genres[]` joined with `,` (no space) | webPage: soft (331/332) |
| genreIDs | `genreIds[]` joined with `,` | webPage, rss: soft |
| primaryGenre | `primaryGenreName` | webPage: soft (325/327); rss: soft (2,577/2,588) |
| primaryGenreId | `primaryGenreId` | webPage, rss: hard (327/327, 2,588/2,588) |
| contentRating | `contentAdvisoryRating` (legacy 4+/9+/12+/17+ scale) | webPage: warn only, through the FS-05 allow-list (the page uses the 2025 scale); a value outside the legacy scale on many rows raises `FIX_ANCHOR: lookup.contentAdvisoryRating` |
| supportedLanguages | `languageCodesISO2A` | none (the page lists languages, not ISO codes) |
| appSizeInBytes | `fileSizeBytes` (a string) | webPage: soft, ver (312/312) |
| requiredOsVersion | `minimumOsVersion` | webPage, lockup: hard (332/332, 349/349) |
| originalReleaseDate | `releaseDate` | rss: soft (2,578/2,588); productDv, lockup: soft |
| lastUpdated | `currentVersionReleaseDate` or `releaseDate` | webPage, ver: equal to the page's date (hard when the page is more than 1 h later, or more than 24 h earlier unless releaseDate == currentVersionReleaseDate, the storefront's availability date); semantic: not after today on a released app (hard; pre-orders exempt) |
| releaseNotes | `releaseNotes`, cleanText; absent key → `undefined` | webPage: hard, ver (281/281) |
| currentAppVersion | `version` | drift detector: a mismatch triggers a cache-busted re-read and is classed `cdn_age` |
| price | `price` (JS number; absent for Arcade and pre-order apps → `undefined`) | webPage, rss, lockup: soft |
| currency | `currency` | webPage, rss: hard (storefront guard) |
| developerId | `artistId` | webPage, productDv, lockup, rss: hard (all 100%) |
| developer | `artistName`, cleanText (not sellerName) | webPage, productDv, lockup, rss: hard (all 100%) |
| developerAppStorePageURL | `artistViewUrl` | webPage: hard (332/332); contains `/id<artistId>` |
| developerWebsite | `sellerUrl`; absent in about 31% of apps → `undefined` | webPage: hard (332/332; absent on both sides passes) |
| avgRating | `averageUserRating` | webPage rating histogram: soft (289/289) [FS-08] |
| totalReviews | `userRatingCount` (a count of ratings, not written reviews) | webPage: soft (320/324); counter differences are `cdn_age` |
| currentVersionAvgRating | `averageUserRatingForCurrentVersion` | semantic: equal to avgRating within the counter lag (hard; 35,666 of 35,667 cached records) |
| currentVersionReviews | `userRatingCountForCurrentVersion` | semantic: equal to totalReviews within max(3, 1%) and the lag bound (hard; same records) |
| appScreenshots | `screenshotUrls` | webPage media count: soft (289/319) |
| appIpadScreenshots | `ipadScreenshotUrls` (`[]` prints empty) | none |
| appletvScreenshots | `appletvScreenshotUrls` | none (empty for every cached app) |
| supportedDeviceList | `supportedDevices` (Mac apps → `undefined`) | webPage: soft (330/330) |
| country | the run's CC, upper case (search layout only) | invariant |
| scrapedFrom | `keyword search` (MZStore search result) or `similar app links` (customersAlsoBought list) | engine provenance |
| dateScraped | UTC `Date#toString()`, the same on every row | format check |

Every row is also checked for free: `url` contains `/id<id>` and `/<cc>/`; `developerAppStorePageURL` contains
`/id<artistId>`; `currency` matches the storefront; `kind` is software or mac-software; the current-version
counters equal the overall ones. In search runs each primary's lookup by numeric id (the one that reads the search
results) is compared with its detail lookup by bundle id ("consistency"). In non-US searches the US store pages
check only store-independent columns (id, appId, developerId).

**Quarantine (default mode).** A row that fails a hard check at equal versions is looked up once more with a
cache-buster. If it still fails, those cells are written `undefined` and counted in `quarantinedCells` and
`quarantinedApps`; `--smar-compat` keeps SMAR's value and lists the cell in `unverifiedCells`. A version
mismatch or a counter-only difference is drift (`cdn_age`), never quarantined; a version mismatch the cache-busted
re-read confirms (same lookup version twice) is `versionMismatchPersistent`, not `cdn_age`. A missing anchor is reported as
unverified, never a silent pass. A hard check failing on at least max(3, 10%) of the rows it evaluated means the
source changed shape: default mode answers `FIX_ANCHOR: <source.field>` and is not ready. An anchor that goes
missing counts as drift only when it is missing on at least max(3, 10%) of the rows, more than 15 points above
its corpus rate, with binomial tail probability below 1e-4; absences the lookup itself explains are not counted:
no "What's New" block when the lookup has no `releaseNotes`, Apple's own apps (no Size row, no version block),
visionOS-only apps (no genre breadcrumb, no iPhone screenshots), "Up to" sizes, pre-order pages and zeroed
rating histograms, and translated pages (non-English storefronts) where a row could not be recognised by structure
(`localized_page`: the cell is unverified). Lookup keys and blanks are tested the same way against their corpus rates (releaseNotes by
version age; common symptoms also per developer). A changed page structure alone is a non-blocking warning.

### Value checks
Besides the second sources, every row is checked against its own record (source `semantic`, hard whatever the page
version). A value its own record contradicts is wrong whatever SMAR would write, so it is written `undefined` in BOTH
modes (`--smar-compat` lists those cells in `compatExact` as `quarantined_cells`, as it does a type violation); a
disagreement with another source (an app page, the chart feed, Apple's second review source) keeps SMAR's value in
`--smar-compat` and lists the cell in `unverifiedCells`. Each rule had 0 failures on 35,667 cached lookup records and
35,775 saved review entries (18,025 with an MZ copy). A rule failing on many rows is drift and names its anchor in
`FIX_ANCHOR`, in both modes (a drifted column is an Apple source that changed, and SMAR's file would carry the same
wrong values; `--deliver-anyway` blanks that column):
- `semantic.<column>`: a value of the wrong kind for its column, or one that equals another field of the same record
  (a swap; both columns are named and quarantined). A version equal to another field (minimum OS, a rating, a count)
  while a page shows another version is `version_copied_from_<key>`.
- `semantic.currentVersionReviews` / `semantic.totalReviews`, `semantic.currentVersionAvgRating` /
  `semantic.avgRating`: Apple's current-version ratings equal the overall ones today, so a current-version value
  outside max(3, 1%) and the counter lag means one of the pair was rescaled or moved. Both cells are quarantined
  unless a page confirms one.
- `semantic.lastUpdated`: a released app's update date more than a day after today (pre-orders exempt).
- `semantic.appSizeInBytes`: a size under 100 kB, or under 1 MB / 5 MB / 20 MB for an app with 10,000+ / 100,000+ /
  1,000,000+ ratings (of 9,892 cached apps the 56 under 1 MB have at most 550 ratings; on 10,598 cached app/storefront
  pairs the smallest app with 100,000+ ratings is 22.0 MB and with 1,000,000+ 61.8 MB; Apple's own apps, stubs of a few
  MB, are exempt): a size rescaled to kB, or by a factor that takes it under its tier's floor (Known limits).
- `webPage.lastUpdated`: at the same version the app page dates the update more than 1 h later, or more than 24 h
  earlier, than the lookup (exempt when releaseDate == currentVersionReleaseDate, the storefront's availability date).
- `reviewsRss.dateReviewed`: a review dated after the run or before 2008-07-10 (the App Store's opening).
- `mzReviews.dateReviewed`: RSS and MZ wall clocks differ on many rows (one row a day or more apart is hard alone).
- `reviewsRss.versionWhenReviewed`: versions that are empty, equal to the rating, with no digit (unless it is the app's own
  version), longer than 40 characters, copied from the review's text, or far above the app's version (the lookup's
  `version`, read with the reviews), or above the app's version on a review dated more than a day before the app's current
  version was released (App Store Connect only accepts increasing versions; 201 saved real feeds, 38,950 reviews: none);
  and one version on every held review (20+) that is far below the app's (under half its leading number) while 3+ of
  those reviews are dated after the app's current version was released (114 saved real feeds: no review dated after its
  app's release carries such a version).
- Advisory, never blocking: review dates that arrive in another shape than Apple's feed uses
  (`YYYY-MM-DDTHH:MM:SS-07:00`/`-08:00` on 33,650 of 33,650 saved labels) are named in `problems`; the instants are the
  same (MZ agrees), default mode writes each in Apple's shape with the review's Pacific offset (an all-zero fraction
  such as `.000` dropped), `--smar-compat` as Apple sent it.

Known limits (no rule can tell these from real data without false alarms; measured on the cached corpus):
- A size rescaled to kB on an app with fewer than 10,000 ratings and over 100 kB after rescaling, with no app page to
  compare (pages down, browser mode, or a row outside the page sample): real apps of 361 kB to 1 MB exist (0.5%). The
  same holds, on any app, for a size divided by any factor that leaves it at or above its floor (1 MB at 10,000+
  ratings, 5 MB at 100,000+, 20 MB at 1,000,000+): Strava (460 MB, 375,852 ratings) passes divided by up to 92 (/50
  reads 9.2 MB), Duolingo (515 MB, 5.5M ratings) by up to 25. On the cached corpus /20 stays above the floor on 90% of
  the apps with 100,000+ ratings and 44% of those with 1,000,000+ (/100: 20% and 1%). A higher floor does not close
  this: one at the tier's smallest real size (22.0 MB, 61.8 MB) still passes /20 on 26% and 1%, and leaves no margin
  for small real apps the corpus lacks (3.6 MB with 13,000 ratings exist). `crossChecks.unanchoredRows` and `problems`
  say when no page compared a row.
- A constant review version that is not far below the app's (e.g. the previous release on every review): a paused
  phased release keeps most reviewers on the previous version for weeks (on saved feeds as few as 23% of the reviews
  dated a day after a release were on it), so it is not drift. A version just above the app's on reviews dated after the
  app's current release is what a lookup one release behind shows, so it is not caught either (only the reviews dated
  more than a day before that release are).
- On a 1-2 row run a value that disagrees with an app page but passes every check of its own record is quarantined
  (default) or listed in `unverifiedCells` (`--smar-compat`); column drift needs max(3, 10%) of the rows.

## 3. Review columns (9)
Source: Apple's customer-reviews RSS, `itunes.apple.com/<CC>/rss/customerreviews/page=<1..10>/id=<trackId>/sortby=mostRecent/json`
[rev-01-endpoint]. Every `feed.entry` is a review; nothing is skipped [rev-05-v1-entry0].
Cross-check: Apple's MZStore review list (`userReviewsRow`) for page 1, the last page and every healed page
(150/150 ids, order, ratings and text on the corpus [FS-11]).

| Column | SMAR copies | Cross-check (gate) |
|---|---|---|
| reviewID | `entry.id.label` | MZ review id, same order (hard) |
| userUrl | `entry.author.uri.label` | MZ profile id (hard) |
| versionWhenReviewed | `entry['im:version'].label` | per row (hard): holds a digit (or is the app's own version), at most 40 characters, not a phrase of the review, not far above the app's version |
| rating | `entry['im:rating'].label` | MZ rating (hard) |
| reviewText | `entry.content.label`, cleanText | MZ body (hard) |
| reviewURL | `entry.link.attributes.href` (the app-level link, the same on every row) | invariant |
| dateReviewed | `entry.updated.label` (default: the same wall clock with the review's own Pacific offset, counted in `defaultFixes.dateReviewed`; compat: Apple's label byte for byte) | MZ date compared on the Pacific wall clock: the same wall clock is normal (the instant may be 3,600 s off Apple's label); a day or more apart is hard (cell quarantined); smaller differences on many rows are drift (`mzReviews.dateReviewed`). Per row (hard): not after the run, not before 2008-07-10 |
| country | the run's CC, upper case | invariant |
| dateScraped | UTC `Date#toString()` | format check |

The target is SMAR's: min(`userRatingCount`, 500), or 500 when the count is 0 [rev-03-ratingcount-cap]. Pages
1-10 are read until the target is reached; empty pages do not stop the loop. `--all` (default mode) targets
500 whatever the ratings count.

## 4. Byte rules
Both modes:
- Every header and cell is wrapped in `"…"`, except `dateScraped`, which is unquoted and identical on every row,
  e.g. `Thu Oct 01 2026 20:26:33 GMT+0000 (Coordinated Universal Time)` (production runs in UTC and stamps the
  time when the CSV is written [prod-tz-utc]).
- `\n` line ends, no trailing newline, UTF-8.
- Values print the way JavaScript prints them: `0`, `4.99`, `5`, `4.71834`, `undefined` for an absent key,
  `null` for null, an empty cell for `[]` [js-number-and-literal-format]. Lists join with `,`, no space.

`--smar-compat` = SMAR's `` `"${cleanText(v)}"` `` exactly [cleantext-quirks]:
- cleanText runs on strings only: strip `/<[^>]+>/g`; decode `&quot; &amp; &apos; &lt; &gt; &#39;` in that
  order; double every `"`; replace `<br>` forms with a space; replace each `\r\n`, `\n` or `\r` with a space.
  Tabs and U+2028 survive.
- Arrays bypass cleanText: no tag stripping, no quote doubling, newlines kept.
- Any cell equal to `primary search` or `related app` becomes `keyword search` or `similar app links`.
- Search, `ids`, `rerun` and review files start with a BOM (U+FEFF), as the website download adds; chart files
  do not [frontend-bom-naming].
- Where SMAR answers HTTP 200 with no rows (0 written reviews; a chart lookup that returns no apps), the file is
  `"dateScraped"` (13 bytes; reviews files add the BOM). Where SMAR answers HTTP 500, there is no file.

Default = the same, except where SMAR's writer damages data (each difference is counted in `defaultFixes`; 0 on
every cached record, `EA/build_notes/writer.md`):
- only real tags (`<\/?[A-Za-z][^<>]*>`) are stripped, so "I <3 it > ok" survives (Q4);
- array elements are cleaned and their quotes doubled (Q5);
- the label rewrite applies only to `scrapedFrom` (Q6);
- no BOM, and never a 0-row file.

SMAR's download file name is reported as `smarFileName`: `<query>_<M><D><YYYY>.csv` for search (UTC; month and
day not zero-padded), `<collection><categoryName><CC>_<M><D><YYYY>.csv` for charts, `<bundleId>_reviews.csv`
for reviews. The skill writes OUT as given.

## 5. SMAR iOS quirks
"Compat" = what `--smar-compat` does; "Default" = what the default does. Findings in brackets.

| # | SMAR behaviour | Default | Compat |
|---|---|---|---|
| Q1 | No `description` and no `free` column (the exclusion list was written for Play) | same | same |
| Q2 | `totalReviews` = userRatingCount, a ratings count; the currentVersion* columns equal the overall values (3,254 of 3,254) [FS-08] | same | same |
| Q3 | A missing lookup key prints the literal `undefined`: developerWebsite (~31%), releaseNotes, price for Arcade and pre-order apps, Mac apps' device and screenshot lists; `[]` prints empty, `null` prints `null` [FS-07] | same | same |
| Q4 | cleanText strips non-tags too ("I <3 it > ok" → "I  ok") and decodes entities after stripping, so `&lt;b&gt;` survives as `<b>` [cleantext-quirks] | real tags only (`defaultFixes`) | reproduced |
| Q5 | List cells skip cleanText: a `"` inside an element breaks the CSV; newlines inside elements are kept | escaped | reproduced |
| Q6 | Any cell equal to `primary search` or `related app` is rewritten to the scrapedFrom labels | `scrapedFrom` only | reproduced |
| Q7 | Every cell quoted except `dateScraped`; LF; no trailing newline; the website adds a BOM to search and review downloads, not charts, and zips them with a `_relog.txt` [frontend-bom-naming] | no BOM | BOM by layout |
| Q8 | `dateScraped` = `Date#toString()` in UTC, stamped at download time, the same on every row [prod-tz-utc] | UTC at write | same |
| Q9 | Search takes the first 50 MZStore ids of any kind; app bundles then vanish in the lookup (49 primaries for "Alpha Photo Editor Kit"). After the search, the term is tried as a bundle id: a hit gives exactly 1 row; any error sends it down the keyword path; a term with a character above U+00FF is never tried. Numbers are searched as text [edge-cases-bundle-numeric-empty-appbundle] | same; a transport error on the probe is retried | same |
| Q10 | Similar apps: one US legacy store page per primary (header `X-Apple-Store-Front: 143441,32`), the `customersAlsoBoughtApps` list (up to 15 ids), and a US lookup, whatever the country. About 90% of rows [v1-search-no-similar-expansion, non-us-similar-us-only] | same | same |
| Q11 | SMAR's request library does not decode gzip: while Apple served gzip pages (20:59-21:14 UTC, 2026-10-01) primaries lost all their similar apps ("medication reminders": 85 rows against 427) [smar-similar-gzip-silent-loss] | decoded; `transportRisk.similarGzip` | decoded; `transport_dependent` |
| Q12 | About 770 concurrent per-row lookups, where a failure drops the row silently; production dropped 0 in its one probe [prod-burst-drops-zero] | not reproduced (batched, retried) | not reproduced |
| Q13 | Rows are de-duplicated by bundle id, keeping the first (primaries first, then similar apps per primary). 0 rows → HTTP 500 | same; STOP | no file; STOP |
| Q14 | The website sends the term unencoded: `&`, `#`, `+` and `%` change it; "diet & nutrition" becomes "diet " (5-6 of 50 shared apps) [frontend-term-mangling] | literal term; `smarSiteTerm` | the mangled term; `site_term_applied` |
| Q15 | 108 of the 222 menu countries are missing from app-store-scraper's storefront map: search and charts use the US store while lookups use CC (KZ chart 35 rows; MA priced in USD); a country with no store (AQ) → 500 [country-storefront-fallback, ios-charts-02] | the country's own store, or STOP (search with no known storefront) | reproduced; `smar_storefront_fallback` |
| Q16 | Charts use the legacy http feed (double slash), always 50 rows (`num` is never sent); `new*` feeds give 110 and ignore the genre; `topmacapps` always 500; `top{grossing,paid}macapps` with no genre 500; a one-entry feed 500; `--num` below the row count 500 [ios-charts-03, -04, -08] | `--num` slices; dead or one-entry feed → STOP | reproduced (no file) |
| Q17 | The chart download is cached for 7 days under collection + categoryName + country, so a later scrape of another genre with the same empty categoryName can overwrite it; `dateScraped` is the download time [ios-charts-07] | documented | documented, not reproduced |
| Q18 | Reviews: target min(userRatingCount, 500) (500 at 0), so an app with more written reviews than ratings loses its older reviews (i-Qi clock: 151 → 98); a failed page → 500; duplicates across pages are kept (MyFitnessPal pages 4 and 5) [rev-03-ratingcount-cap, rev-04-feed-duplicate] | same target; duplicates removed and counted; `--all` | reproduced |
| Q19 | Apple's CDN sometimes serves an empty page for SMAR's exact review URL while the origin has the reviews (Pocket Meditation Timer, page 8: 450 rows instead of 500); a cache-busted re-read gets the real page [rev-08-apple-caps] | healed | healed; `transport_dependent` |
| Q20 | 0 ratings: 10 empty pages and the 13-byte file `"dateScraped"`; an app not in the store → 500 (PayPay in the US) [FS-12] | STOP | the 13-byte file; STOP |
| Q21 | `reviewURL` is the app-level link on every row; `userUrl` survives because the exclusion list says `userURL`; `title` and `userName` are excluded; `dateReviewed` is Apple's RSS label, which carries today's Pacific offset on every review, so a review from PST months is one hour early | same, except `dateReviewed` keeps the wall clock and writes the review's own offset (-08:00 PST, -07:00 PDT; `defaultFixes.dateReviewed`); the fall-back hour and the spring-forward gap keep Apple's label | Apple's label byte for byte |
| Q22 | The website's review button is disabled for 0 ratings or at least 100,000; its bulk form rejects ids with `-` or no `.`; its bulk export keeps only the first app's rows [rev-07-frontend-artifacts] | `smarUiWouldReject`; a correct bulk file | same, plus `bulk_frontend_not_reproduced` |
| Q23 | Apple's CDN caches each exact lookup URL for up to 86,400 s, so SMAR's per-row URLs can return counters hours old or an older release [FS-02, FS-10] | batched URLs (fresh); `cdn_age` | same |
| Q24 | contentRating uses the legacy 4+/9+/12+/17+ scale; the web page uses the 2025 scale (116 of 306 differ) [FS-05] | the lookup value | same |
| Q25 | Mac apps (`mac-software`) are kept when reached by bundle id; Arcade and pre-order apps have no price key; pre-orders carry future dates [FS-07] | same | same |

## 6. `compatExact` reason codes
`compatExact.ok` is true when the `--smar-compat` file should equal SMAR's byte for byte (apart from
`dateScraped` and live counters). Otherwise each reason says why it may not:

| Code | Meaning |
|---|---|
| `transport_dependent` | the run recovered a gzip similar page or an empty review page; SMAR's own server may or may not have lost it |
| `smar_storefront_fallback` | the country is outside app-store-scraper's map: SMAR uses the US storefront (reproduced in `--smar-compat`; in default mode the detail gives SMAR's row count and the US-chart apps it drops, and this file is NOT SMAR's) |
| `site_term_applied` | SMAR's website changes this term before searching (reproduced in compat) |
| `cdn_age` | Apple's CDN served some lookups older than an hour; SMAR reads its own edge (never claimed when the cache-busted re-read returned the same version) |
| `lookup_key_missing` | a lookup key went missing on many rows; SMAR writes `undefined` there too |
| `similar_key_missing` | similar pages lacked `customersAlsoBoughtApps`; SMAR loses those apps too |
| `bulk_frontend_not_reproduced` | bulk reviews: the website's broken bulk export is not reproduced |
| `no_smar_equivalent` | `ids`, `rerun`, `--all`, `--num` or `--primary-only`: SMAR has no such request |
| `smar_http500` | SMAR answers HTTP 500 here, so there is no SMAR file |
| `search_rank_nondeterminism` | a second search at the end of the run ordered Apple's results differently |

## 7. Reading differences from a SMAR file
Compare only files made in the same hour, and classify every difference:
- skill_error: a cell or row differs with no explanation below. Should be 0; report it.
- scraper_bug: SMAR's file is wrong by its own rules (Q4-Q6 writer damage, Q18 duplicates, Q14 term mangling,
  Q15 storefront fallback). Default mode avoids these; `--smar-compat` reproduces them.
- drift (`cdn_age`): same `currentAppVersion`, but a counter or rating differs because one side read an older
  CDN copy; or the app shipped an update between the two reads (version-linked columns differ).
- nondeterminism: Apple answered two identical requests differently (search ranking of head terms, counters
  between replicas). A second SMAR run made at the same time shows how much.
- transport_dependent: rows SMAR lost to gzip pages (Q11), failed burst lookups (Q12) or empty review pages
  (Q19), listed in the skill's `transportRisk`.

Rows the skill writes in default mode that SMAR's file lacks are listed in `smarWouldDrop` with a stage and a
reason. `team/verify_appstore.sh` runs SMAR's own iOS code next to the skill and writes this classification.
