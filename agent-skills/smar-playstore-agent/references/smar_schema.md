# SMAR CSV formats and SMAR's known quirks (v3.1.0)

Sources: SAR-backend `controllers/{searchController,listController,reviewsController}.js`,
`utilities/jsonToCsv.js`, google-play-scraper 9.2.0 (gps) as vendored there, and the 2026-09-30
verification runs. The scripts write these files; use this page to check and explain them, never to
build or edit rows by hand.

## The one policy
- **Default = page truth.** Every cell is the Google Play page's own value, cross-checked on the same page.
  A value that is missing, or fails its cross-check, is written `undefined`. Every row Google lists is kept.
- **`--smar-compat` (browser `compat:true`) = SMAR's bytes**, for metadata and reviews: SMAR's row set,
  SMAR's derived values and bugs, SMAR's header order and the BOM. It is pinned to gps 9.2.0; if SAR-backend
  upgrades the library, SMAR's output changes and compat must be re-verified.
- Every summary has `compatFileReproducible` = `{ok, reasons, means}` (named `compatExact` in earlier versions): whether
  a `--smar-compat` file is built with SMAR's exact rows, formatting and known bugs from the pages fetched, and if
  not, why (codes at the end). It is not a byte comparison with a live SMAR run: Google's data (and reviews) change
  between fetches, so a SMAR run at another time can differ.
  It never says that a default (page-truth) file matches SMAR's: a default summary carries
  `defaultVsSmarDifferences` for that (`developerAddressFilled`: cells SMAR leaves `undefined`;
  `quotesDoubledBySmar`: cells whose quotes SMAR doubles; `otherCells`; `rowsSmarDrops`; `smarRelabels`: rows
  both files hold under different `scrapedFrom` labels, such as a top-result card SMAR only reaches through a
  "related to" list; `appIdListLabel` = `{rows, here, smar, note}`: id-list rows labelled `app id list` here and
  `keyword search` by SMAR). When SMAR returns no file at all (`smarReturnsNoFile: true`), that is the only difference to
  report; the cell counts move under `ifSmarReturnedAFile`.

## Keyword search, ids and rerun export: 32 columns
```
appName,appId,url,icon,developer,currency,price,description,avgRating,country,scrapedFrom,
approximateInstalls,totalRatings,totalReviews,originalPrice,discountEndDate,downloadable,
inAppPurchases,inAppPurchasesPriceRange,androidMinVersion,developerId,developerEmail,
developerWebsite,developerAddress,privacyPolicyURL,genreId,contentRating,inAppAdvertisements,
originalReleaseDate,currentAppVersion,currentVersionChanges,dateScraped
```
| Column | Page source (gps name) | Format |
|---|---|---|
| appName | title | text |
| url | (built) | `https://play.google.com/store/apps/details?id=<id>&hl=en&gl=<CC>` |
| price | price | `0` for free apps (the page stores an explicit 0), else the price, e.g. `4.99` |
| description | **summary** (the short description, not the long one) | cleaned text |
| avgRating | score | raw float as stored, e.g. `4.880715` (no rounding) |
| country, scrapedFrom | (run) | e.g. `US`; `keyword search`, `similar app links`, or `app id list` (default-mode ids and rerun rows without a label; SMAR has no id-list mode, and a `--smar-compat` file writes `keyword search`, SMAR's label for a package-id search; `--source` overrides it) |
| approximateInstalls | **maxInstalls** | exact integer, e.g. `8293672`; the visible "5M+" is only its bucket |
| totalRatings | ratings | integer |
| totalReviews | reviews, `ds:5[1][2][51][3][1]` | integer; the visible "N reviews" text is the ratings count, not this |
| originalPrice, discountEndDate | originalPrice, discountEndDate | only during a sale: the pre-sale price, and the sale-end text as the page words it (relative, not a date). originalPrice is checked against the visible "Was <price>" in any storefront form (₩4,400, Rp 15.000, 1.599,99 PLN, CHF 1'299.00): a number with one `.` or `,` before 3 digits is thousands, except in a 3-decimal currency (BHD, KWD); a value that does not match that single reading is blanked and flagged |
| downloadable, inAppPurchases, inAppAdvertisements | available, offersIAP, adSupported | `true` / `false` |
| inAppPurchasesPriceRange | IAPRange | e.g. `$0.99 - $99.99 per item`, in the storefront's own number and currency form (`CHF 0.99 - CHF 350.00 per item`, `Rp 12.000 - Rp 5.500.000 per item`, `21,24 CZK - 9 999,99 CZK if billed through Play`, with no-break spaces) |
| androidMinVersion, currentAppVersion | androidVersion, version | e.g. `8.0`, `3.1.15`, or `VARY` (see VARY); checks below |
| developerId | developerId | the `id=` value of the developer link: a number or a `+`-encoded name |
| developerAddress | developerAddress | the address under "About the developer"; compat writes `undefined` |
| privacyPolicyURL | privacyPolicy | the app's own policy link (checked against the page's "Privacy Policy" link) |
| originalReleaseDate | released | e.g. `Jun 29, 2019` |
| currentVersionChanges | recentChanges | cleaned text |

**appId query (compat only).** When the search term is itself a package id that gps can load, SMAR returns
that one app, labelled `keyword search`, with no similar expansion, and its header follows `app()`'s key order:
`appName,description,approximateInstalls,avgRating,totalRatings,totalReviews,price,originalPrice,discountEndDate,currency,downloadable,inAppPurchases,inAppPurchasesPriceRange,androidMinVersion,developer,developerId,developerEmail,developerWebsite,developerAddress,privacyPolicyURL,genreId,icon,contentRating,inAppAdvertisements,originalReleaseDate,currentAppVersion,currentVersionChanges,appId,url,country,scrapedFrom,dateScraped`.
Default mode returns the same single row with the 32-column header above (summary `appIdQuery:true`).

## Top-chart export: 30 columns (both modes)
```
appName,description,approximateInstalls,avgRating,totalRatings,totalReviews,price,originalPrice,
discountEndDate,currency,downloadable,inAppPurchases,inAppPurchasesPriceRange,androidMinVersion,
developer,developerId,developerEmail,developerWebsite,developerAddress,privacyPolicyURL,genreId,icon,
contentRating,inAppAdvertisements,originalReleaseDate,currentAppVersion,currentVersionChanges,appId,url,dateScraped
```
No `country` and no `scrapedFrom`; rows in rank order; never a BOM. Pinned to gps 9.2.0's `app()` key order.

## Review export: 11 columns
```
reviewID,dateReviewed,rating,reviewURL,reviewText,developerReplyDate,developerReplyText,
versionWhenReviewed,helpfulVotes,country,dateScraped
```
- Dates are ISO 8601 UTC with milliseconds (`2026-09-29T14:07:29.059Z`); rating 1-5; helpfulVotes integer;
  versionWhenReviewed comes from the review record itself (present on most reviews). A review with no
  developer reply or no version has the text `"null"` there, as in SMAR's file. Reviewer names and images
  are never collected (SMAR excludes them too).
- Bulk files (`--bulk`) prepend a `"appId"` column (labelled with the requested id) and end every app's block
  with a newline; in compat an app with zero reviews adds an empty line, as SMAR's Bulk page does.
- The review count SMAR uses is gps `app().reviews` = `ds:5[1][2][51][3][1]`, never the visible "N reviews".
- Review cell checks (each against the record's own fields; a failing cell is `undefined`, in `quarantinedCells`):
  - reviewID starts with a UUID (`gp:` allowed) and is never the reviewer's account id.
  - rating is 1-5. Google's pre-2013 no-star score 0 is counted in `legacyScore0Rows`: default writes `undefined`,
    compat SMAR's `"0"`. helpfulVotes is an integer from 0 to 999,999.
  - versionWhenReviewed: one non-blank line, at most 64 characters and 8 words, with a digit. A digit-free name
    passes only when it is exactly the app's details-page version (e.g. `APNA`), never "Varies with device". Never
    only zeros (`0`, `0.0`), never a date (`2025-03-14`, `2025/03/14`, `14/3/2025`, `Mar 14, 2025`), a URL, UUID,
    account id, reviewer name or developer name; `0`, `''` and `false` fail.
  - reviewText is not blank, not the reviewer's name and never the row's version. developerReplyText is never the
    reply author, the developer, a bare version number or the row's version. A version number in the text or reply
    next to a non-version in the version slot fails both cells; a reply slot that is not [author, text, date] fails
    both reply cells.
- Review layout drift (`stop` `layout-drift:<columns>`, not ready): a column's failing cells reach 2 on a page of
  at most 4 reviews, else 5% and at least 3 of a page or of the app so far (reply columns count against replies,
  legacy no-star reviews not at all); or a page repeats a review id (the repeated row is kept with its id
  quarantined; reviewURL is blanked with reviewID); or review texts equal their own reply on 2+ rows and half the
  replies; or, on pages of 20+ (some 50+) rows: versions 95% distinct, 80% null versions, 25% null texts, one text
  on 80% of rows, one 2/3/4-star value on 90%, vote counts that are not counts, 0-star reviews with no 5-star.
  `drift` and `layout-drift:` may name a column blanked with it (a swap partner such as helpfulVotes holding star
  values, the other half of one reply, or the reply columns when the record layout shifted).
- Not detectable without an independent copy of the value: star values remapped inside 1-5, or text and reply
  (or date and reply date) traded only on reviews that have a reply.

## Format rules (all layouts)
- Every cell is double-quoted (`"` inside is doubled) except `dateScraped`, which is bare. In compat only, a
  column that SMAR's row object lacks is a bare empty cell, exactly as jsonToCsv writes it.
- Rows are joined with `\n` (LF). Metadata, chart and single-app review files have no trailing newline.
- BOM (`EF BB BF`): compat search, ids, rerun and review files only. Charts never; default never.
- `dateScraped` = JavaScript `Date#toString()` in UTC, e.g. `Wed Sep 30 2026 22:34:44 GMT+0000 (Coordinated
  Universal Time)`, the same on every row, stamped when the CSV is written. SMAR stamps the download-click
  time (it keeps results for a week), so it is restamped on every download.
- Header order in compat is data-dependent (`Object.keys` of SMAR's first row). Four known orders: keyword
  search (above), appId query (above), chart (above), and a first row from a top-result card that carries a
  developer id, where `developerId` moves to 6th place, right after `developer`.
- `undefined` = no verified value. `""` = the page holds an empty string (SMAR writes it the same way); both
  are counted in `undefinedCounts`. In reviews, `null` is the record's own null.
- A cell that failed its cross-check is `undefined` (booleans included) and is listed in `quarantinedCells`. Under
  `--smar-compat`, `quarantinedCells`, `undefinedCounts` and `undefinedSample` count only the delivered file's rows
  and SMAR's cell rendering (developerAddress included), as `countsDescribe` says.
- pandas: `pd.read_csv(path, na_values=['undefined'])` (reviews: `['undefined', 'null']`).
- `<OUT>.NOT_READY.csv`: written instead of OUT.csv when `READY_TO_DELIVER` is false. OUT.csv appears only
  after the user agrees and the run is finished with `--resume --deliver-anyway`; then every cell of a
  drifted column, and of each column blanked with it, is `undefined` (`deliverAnywayBlanked` below).

## Values that are derived, not copied
- **VARY**: written only when the page's own version box (`[1,2,140,0]`) or Android box (`[1,2,140,1,1]`) holds
  a known no-value shape: the empty marker `[null,[]]`; a version box `[null,null,[]]` inside a present block
  with a valid targetSdk; or an Android box holding only an API level above 31 with no text (Wear OS apps).
  SMAR writes VARY for all of these. A missing box gives `undefined`. That these render as "Varies with
  device" is still unconfirmed, so every VARY cell is reported under `derivedUnconfirmed` (`{writtenAs: 'VARY',
  cells: {column: n}, total}`); VARY cells are not `undefined` and are not in `undefinedCounts`.
- gps derives `VARY`, price `0` and downloadable `false` when the slot is missing; default never does (D10);
  compat re-applies those derivations to cells that are not quarantined.
- appId, url, country, scrapedFrom and dateScraped are built by the run.

## SMAR quirks (verified 2026-09-30; default reports them, compat reproduces them)
- **Drop rule.** SMAR silently drops every app whose gps `app()` call throws (searchController catches it and
  filters the null). The main cause is a short detail array: on some pages Google serves `ds:5[1][2]` with
  104 or 113 entries instead of 155+, so index 118 (categories) is absent and `extractCategories(undefined)`
  throws. A `[118]` that is present but `null` or `[]` is fine and the row is kept. The full union of gps
  throw points is replayed by `smarLibWouldThrow` (reasons `categories`, `description`, `histogram`,
  `android_version`, `developer_link`, `screenshots`, `comments`, `blob_json`, `service_requests`).
  It is not a ratings rule: dropped apps include ch.protonvpn.android (1,354,544 ratings),
  com.deezer.analytics (957) and com.selfhealing.chakrasnumber1 (3,170), while unrated apps whose
  page has slot 118 are kept. Rates seen: 6-33% of rows per query. Summary: `smarWouldDrop` items
  with reason `lib_throws:<reason>`.
- **Charts fail whole.** gps `list()` loads every ranked app with `Promise.all`, so one such app makes
  SMAR's entire chart request an HTTP 500 with no file (`smarChartWouldHttp500`, `compatFileReproducible`
  `smar_http500_chart`). `smarChartHttp500Apps` = `{count, items}` holds every such app (`count` is the number
  to report; `summaryFile` lists them all). Charts never drop single rows.
- **Top-result card.** gps reads the top card's id at a stale path, gets `undefined`, and `app()` throws
  "appId missing": SMAR drops the searched brand app (spotify loses com.spotify.music) from the primary
  list and from every "related to" list, unless the same id also appears in that page's regular list.
  Default keeps it as keyword row 1 (`smarWouldDrop` reason `hero_card`, with the search `q`). Its title
  still seeds a related search, as in SMAR.
- **developerAddress** is `undefined` in every SMAR row (gps path `[69,2,0]` is stale; the address is at
  `[69,4,2,0]`). Default writes the page's address.
- **Double cleaning.** searchController cleans summary and recentChanges, then jsonToCsv cleans again, so a
  quote in description or currentVersionChanges is written `""""` (two quotes after parsing) and
  `&amp;quot;` becomes `"`. Compat reproduces this; default cleans once.
- **Line breaks glued.** cleanText deletes real `<br>` tags before its `<br>`-to-space step, so two lines join
  with no space ("line1line2"). Default currently does the same (an open owner decision).
- **Unencoded website query.** smar-tool.org puts the term into its API URL without encoding: `&`, `+` and `#`
  change what is searched ("AT&T" searches "AT"; "c++" searches "c  "; `#` cuts the term and drops the
  country). Default searches the literal term and reports `smarSiteTerm`. A run started with `--smar-compat`
  searches SMAR's mangled term; otherwise `compatFileReproducible` says `site_term_mangled`.
- **Zero results** make SMAR return HTTP 500 with no file. v3 writes no CSV in any mode (`emptyReason`).
- **gps `search()` throws** on a page with only a top card and no titled section, and on a multi-word
  no-results page (its banner check compares against the URL-encoded term). SMAR then returns HTTP 500 with
  no file, even when the term is a valid app id. Summary `smarSearchWouldHttp500`; compat writes no CSV.
- **App-id terms.** SMAR runs the search first, then tries the term as an app id: success gives the 1-row
  file above. If that app's page would throw in gps, SMAR keyword-searches the id string
  (`appIdQueryFellThrough`).
- **Requests fired at once.** SMAR sends all detail requests together; one that still fails is dropped from a
  keyword search (none seen in two production runs) and fails a whole chart. Charts also always fetch
  permissions, because `includePermissions='false'` is a truthy string (slower, CSV unchanged).
- **Reviews.**
  - Milliseconds: gps does not zero-pad nanoseconds, so a time with ms < 100 is written wrong (`.059Z` becomes
    `.590Z`; about 10% of rows). Default writes the true time; compat SMAR's; summary `msQuirkRows`.
  - Padding: when Google's stream ends before the count, SMAR re-requests the last page and repeats it until
    it has `count` rows. Default writes each review once (`smarPadRows`); compat repeats them.
  - Empty stream: count 0 (the Bulk page has no eligibility check) or a persistent RPC error makes SMAR loop
    forever with no file (`smarWouldHang`). Default: no CSV and not ready.
  - Subset: SMAR exports only the newest min(count, 10000); Google often holds 2-3 times more, older ones.
    Default does the same; `--all` fetches everything (`moreAvailable`).
  - SMAR's results table offers reviews only for 0 < count < 100,000 (`--from-results-table` applies this);
    the Bulk page has no limit. The sort dropdown is ignored: always newest first.
  - Bulk labels: SMAR's Bulk page labels blocks by position; after one failed app every later block carries
    the previous app's id (`compatFileReproducible` `bulk_label_shift`; v3 labels by the requested id).
  - Short pages: gps drops reviews when a page has under 150 but still a token (latent; `smarDroppedRows`).

## Metadata cell checks (default and compat)
- currentAppVersion fails (written `undefined`, quarantined) when it holds HTML or an entity, a content-rating word,
  a URL or email, starts or ends with a symbol, is over 50 characters or has a sentence break, is a formatted count,
  has no digit and 2+ characters (one word in capitals that is no store label passes: `APNA`), is a date with the
  year last (`29-6-2019`, `29.06.2019`, `6.29.2019`), equals one of the page's counts of 1,000+ or another field (appId, developer,
  title, genre, content rating, dates, IAP range, summary, What's new, email, address, currency, installs text), is page text containing a space, reads as a timestamp (10 or 13 digits, Oct 2008 to
  now + 5 years), is an ISO, slash or `14 Mar 2025` date, is two amounts joined by a spaced dash, equals its
  record's target SDK or API level, equals the rating at 2+ decimals (`4.72` or `4,72`), or equals any other scalar of its own record
  (1-3 digit versions excluded). The Android text and the score text stay soft signals (`versionEqAndroid`). A
  version equal to the price or to a 100-999 count of its page passes: real versions do (live 2026-10-05: `2.6` at
  CHF 2.60, `360` equal to a 2-star count), and no page data holds those as version text.
- inAppPurchasesPriceRange needs a digit and must end in `per item` or `if billed through Play` (80 characters at
  most). Listing anchor: on search and chart runs, the range the results list or chart list shows for an app must
  equal its page's range. One app off: only its range is withheld (`quarantinedCells`; inAppPurchases stays). Many
  apps off: offersIAPRange drift, NEXT HEAL offersIAPRange; heal answers STOP `current-path-ok` (it cannot see the
  list): Google's list and app pages disagree. ids and rerun runs have no listing.
- totalReviews of 1,000+ equal to a star-histogram bucket fails (100-999: soft signal `reviewsIsHistBucket`).
- originalReleaseDate must be in the page's own date form; within 3 days of "Updated on" while a review card is
  more than a year older, it fails (HEAL released). A day-first release date beside a `Mon D, YYYY` "Updated on" is
  layout drift of originalReleaseDate, not a storefront problem. A day-first visible "Updated on" over a record whose
  own date texts read `Mon D, YYYY` is compared with it as a date (a changed visible form on a US page, not a
  storefront problem); record and visible text both day-first is another locale's page (`wrongStorefront`).
- Two PATHS entries reading overlapping data fail the unanchored or moved member.
- Run-level: `versionSharedAcrossApps` (one version on 3+ apps of 3+ developers and half the apps with a version:
  drift); `iapRangeSharedAcrossApps` (one range on 75% of 6+ apps of 3+ developers: drift; on 3-5 such apps it is
  withheld; apps whose range the listing verified are skipped, so in practice only ids and rerun runs withhold);
  `releasedEqUpdated` and blank fields need 3+ apps to count as drift.
- `smallRunQuarantine` = `{cells, items: [{appId, column, signal}], note}`: when fewer than 3 apps of the run carry
  a field, a cell with a drift signature (version = score text, version = Android text, totalReviews = a 100-999
  star bucket, release date more than a year after a shown review) is withheld: written `undefined`, counted in
  `quarantinedCells`, listed in `validationFailures` with `smallRun: true`, never in `softSignals`; READY is
  unchanged. Withheld, not known to be wrong; a run with more apps that carry the field keeps real values.
- Limit: one slot holding a plausible value of its own kind, with no copy anywhere the skill fetches, cannot be
  detected: a release date moved earlier together with its timestamp (text and timestamp shifted alike, e.g. 400
  days), a version like `8.0` or `12` on the only app of a run that has a version, the version slot holding the price
  text or a 1-3 digit count of its page, a version written as its own update date in a form real versions use
  (`20250914`, `2025.09.14`), a changed in-app price on an ids run (no listing), and in reviews a review's text
  swapped with the reply text under it (both free text). On search and chart runs the in-app range is
  cross-checked, and one version on many apps is drift.

## Summary codes
- `smarWouldDrop` reasons: `hero_card`, `lib_throws:<reason>`, `search_http500`, `not_in_smar_lists`.
- `compatFileReproducible` reasons (no SMAR file: the first four): `smar_http500_search`, `smar_http500_chart`,
  `smar_http500_empty` (every row is one SMAR drops), `smar_http400_empty_query`, `site_term_mangled`,
  `smar_would_include` (a page v3 withholds, e.g. "not available", that gps would load),
  `smar_chart_ranks_unchecked` (Google returned more ranks than `num`; SMAR loads all of them and returns
  HTTP 500 if any one fails; start the chart with `--smar-compat` so the extra ranks are checked), and for a
  `--smar-compat` file `quarantined_cells` (`count`; cells written `undefined` where SMAR's file has the value as
  read from the page: a failed check, `smallRunQuarantine` or `--deliver-anyway`).
- `problems` lines starting `note:` never block delivery; tell the user: a chart list shorter than the `--num` asked
  for (`chart.requested`; the file has every ranked app), an app id listed twice in Google's search results (one row
  per app), or most rows being apps google-play-scraper cannot read.
- Reviews `compatFileReproducible` reasons: `smar_http500_reviews` (SMAR's reviews request fails: no file),
  `smar_would_hang` (count 0 or a persistent RPC error: SMAR loops forever), `smar_count0_export`,
  `smar_replay_incomplete` (the run stopped before SMAR's row count), `limit_below_smar` (`--limit` is under
  SMAR's count), `smar_pad_inexact` (SMAR's padding cannot be replayed exactly), `smar_not_offered` (SMAR's
  results table does not offer reviews for this app), `smar_unknown` (the review count is unreadable),
  `layout_drift`, `bulk_label_shift`, `quarantined_cells` (cells written `undefined` where SMAR writes Google's
  value, counts per column).
- `validationFailures` is keyed by field. Each entry has `apps`, `of`, `informative`, `likelyLayoutDrift`,
  `cause` (`value` the cell disagrees with its anchor, `anchor` the anchor itself is missing or changed,
  `blank` the value is missing on most rows, `signal` a soft drift signal, `page` the page shape changed,
  `noSale` sale fields outside a sale), plus `anchor` or `signal`, `columns` (the CSV columns it feeds),
  `causes[]` when several apply, and `sample` (up to 5 app ids). An informative signal that is not drift
  (every cell kept as read) is listed under `softSignals` instead, with the same fields; with `--smar-compat` its
  `apps`, `of` and `sample` count only apps in the file (`countsDescribe`).
- `undefinedCounts` = `{column: n}` and `undefinedSample` = `{column: [up to 5 app ids]}`: the apps whose cell in
  that column is `undefined`. Only these lists say which app is blank.
- `shortDetailPages` = `{count, sample, columns}`: apps whose page is the short "Updated on"-only variant (no
  version, Android version or release date anywhere on it; JSPB-sparse, mostly new clone apps; SMAR drops them). Those
  cells are `undefined` as on the page, and the pages do not count toward layout drift of those three fields, unless
  they are half or more of a run of 20+ apps (never seen; max 10 of 29): then they count again and the three fields
  are reported as layout drift (`note` starts `shortMajority`), since Google has probably stopped sending them.
- `unratedApps` (ids, first 25) and `unratedByDeveloper` = `{developer: n}`: the confirmed unrated apps.
- `pageDrift`: `{detailPage, chartHealed, chartOrder, chartDuplicates, progressRows}`: drift that belongs to no
  single field (the details page wrapper, a healed chart path, a chart order that disagrees with the page, a chart
  list that repeats app ids so later ranks are shifted, a progress file whose rows are lost, extra, duplicated or
  unlisted, or that has rows before its run was seeded; a run killed before it queued its apps is not one: its
  resume queues them, and neither is a search for an app id cut while its withheld search was retried: the id's own
  row is kept). Any entry means not ready. `progressRows` stops `--resume` from crawling further and refuses
  `--deliver-anyway` (`deliverAnywayRefused`): re-run into a NEW output file, never edit progress files.
- `deliverAnywayBlanked` = `{column: reason}` after `--deliver-anyway`: `drifted: <field>`, `drifted (anchor
  gone)`, `swap partner of drifted <field> (holds its anchor value)`, `linked to drifted <field> by the <signal>
  signal`, or `linked to drifted version by their shared record` (the version and Android version columns
  are withheld together). A signal link never blanks an anchor-verified column. Those cells are added to `quarantinedCells`
  (compat: only cells of the file's rows that went from a value to blank). `NEXT` is then `DELIVERED_ANYWAY: ...`
  and `READY_TO_DELIVER` stays false (reviews: the same, with `blankedColumns`).
- Heal statuses beyond USE: `current-path-ok` (the path is fine: not path drift), `ambiguous`, `none`, `no-anchor`,
  `path-in-use` (the only path matching the anchor is read by another field, or a USE would overlap a path already
  in the override file: two fields' data moved together; heal does not repair this, report both columns),
  `combined-check-failed`. Every candidate path is re-checked on every page; no other field may start to fail.
- `compatNullCells`: `{column: n}`, cells `--smar-compat` writes as `null` because the page holds an
  explicit JSON null at gps's path (SMAR renders it that way).

## Reviews summary (reviews_play.js)
Same `READY_TO_DELIVER`, `NEXT`, `problems` and `compatFileReproducible` keys as the metadata summary, plus `apps`, one
entry per requested app:
| Field | Meaning |
|---|---|
| `count` | the app's review count (gps `app().reviews`) |
| `smarLimit` | how many reviews SMAR would export: min(count, 10000) |
| `fetched` | distinct reviews written |
| `stop` | why the app finished: `limit`, `end-of-stream`, `page-cap`, `not-found`, `ineligible`, `wrong-storefront`, `page:<kind>`, `layout-drift:<what>`, `error:<code>`, ... |
| `msQuirkRows` | rows whose time SMAR writes wrong (ms < 100, see Reviews above) |
| `smarPadRows`, `smarPadExact` | rows SMAR would add by repeating the last page, and whether that replay is exact |
| `smarDroppedRows`, `smarDroppedIds` | reviews gps would drop on short pages (all ids in `summaryFile`) |
| `smarWouldHang` | SMAR would loop forever for this app (no file) |
| `smarParity` | the default rows are exactly SMAR's rows (same reviews, same order) |
| `moreAvailable` | Google holds older reviews beyond the export (`--all` fetches them) |
| `supersetOfSmar` | the run's limit covers SMAR's whole set (no `--limit` below `smarLimit`) |
| `smarHttp500` | SMAR's request for this app fails with HTTP 500 |
| `note` | a sentence for the user, when needed |
| `oldestReview`, `newestReview` | the oldest and newest `dateReviewed` of the app's rows in the file, as written there (the file's date range; copy it, never compute one) |
| `newestReviewDaysOld` | whole days from `newestReview` to the end of the run: how fresh the newest review Google served is (Google's newest-first list can end weeks before the run) |
| `unrated` | two details fetches showed no rating at all: count and ratings are 0, a plain STOP, not drift |
| `rowsMissing` | the browser store lost rows: READY false |
| `invalidCells` | failing cells per column |
| `drift` | drifted columns, which may include a column blanked with them |
Bulk summaries (`--bulk`) add `smarWouldDownload`: whether SMAR's Bulk page would produce a file at all. Summary
fields: `blankedColumns` = `{appId: ['column', 'column (holds X values)', 'column (same reply as Y)', 'column (record
layout shifted)']}` for NOT_READY and deliver-anyway files; `legacyScore0Rows`; `notes` (`<app>: the rows file had
k of N rows; fetched that app again`: a rows file was cut, lost or held a line that is not that page's stored row).
The run state's apps[] also keeps `cv`, the details-page version the version check compares against.

## Error codes (`error.code` in a summary; thrown `err.code` in the browser)
`RATE_LIMITED`, `SORRY` (Google's "unusual traffic" page), `CONSENT` (consent page), `INTERSTITIAL` (browser
redirect to either), `SUPERSEDED` (another step or start changed the run), `LOCKED` (another run holds
OUT.lock; exit 4), `USAGE`, `TIMEOUT`, `HTTP_<status>`, `STORAGE_FULL` (browser storage), `RPC_ERROR`
(reviews: Google's review RPC kept failing after retries of 2, 4 and 8 s; per app, resumable), `APP_FAILED`
(reviews: some apps failed this pass; exit 1, `NEXT` is `RESUME`). `chart_fetch.js` raises `USAGE`,
`HTTP_<status>`, `SORRY` and `CONSENT`; its result carries `ranksReturned` (ranks Google returned before the
`num` cut) and `smarListWouldThrow` (gps `list()` itself would throw on this payload).
