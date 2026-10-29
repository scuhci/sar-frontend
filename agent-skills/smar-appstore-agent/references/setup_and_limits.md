# Setup, files, runtime and limits (v2.1)

## Setup
- Node 18 or newer. No npm install: every script uses Node's core modules only and lives in `scripts/`. Run
  them with an absolute path, from any folder.
- Shell mode is preferred. Browser mode (Claude in Chrome, SKILL.md "Browser mode") pastes ONE file,
  `scripts/min/appstore.bundle.min.js` (the 7 modules and `browser_driver.js`, minified by
  `team/build_min_appstore.sh`: about 260 KB instead of 490 KB in 8 pastes), into an itunes.apple.com tab and runs
  charts, reviews, app-id lists and name lookup.
  Gate B (headless CORS/CSP probes, PLAN §6.6) passed for the lookup API, the RSS feeds and the reviews feed
  and failed for MZStore search, the legacy similar-app page and apps.apple.com, so keyword search and `rerun`
  answer STOP in the browser and the app-page cross-check sample is off there. The chart feed is read from
  `https://itunes.apple.com/<cc>/rss/...` because SMAR's `http://ax.itunes.apple.com` feed is mixed content in
  a page (its https host serves another certificate); `compatExact` lists this as `transport_dependent`.
  Progress is kept in IndexedDB (localStorage as a fallback) and survives a reload. The driver refuses every
  call until `verify(<hash>)` matches the hash in SKILL.md; `node scripts/fingerprint.js --bundle` prints the
  bundle's hash (`node scripts/fingerprint.js` the 8-file one) and `--check` fails when a source changed since the
  bundle was built (rebuild it, then update SKILL.md). The offline page emulator runs every browser case on the 8
  files and on the bundle: CSV bytes identical to the shell for both.
- Every request is anonymous (no cookies, no account) and goes only to Apple hosts; any other host is refused.
  Requests carry exactly the headers SMAR's library sends (no User-Agent, except the review cross-check, which
  needs an iTunes one). Responses are always decoded (gzip, deflate, br), even where SMAR's library would read
  the compressed bytes as text and lose the page (Q11 in `smar_appstore_schema.md`).
- Values come only from Apple's iTunes Lookup API (apps) and the customer-reviews RSS feed (reviews). The
  apps.apple.com page, the MZStore lockups, the legacy store page and Apple's chart feed are used only to
  cross-check those values; a page value is never written (it is rounded, "121K" or "4.9"). The apps.apple.com sample
  is optional: when it answers 5xx or is unreachable twice in a row, refuses once (403/429), or answers 404 for every
  sampled page, the run stops asking it and still delivers on the other sources (`problems` names it;
  `crossChecks.webPageUnavailable` {why, failed, skipped}). An `ids` or `rerun` run has no other second source: then no
  row was cross-checked (`problems` says so) and only each record's own value checks ran. Apple's second review source
  (MZ `userReviewsRow`) is optional the same way: at most one retry per request, none after a failure, and after two
  5xx / unanswered requests in a row or one 403/429 the run stops asking it for the rest of that call (each later call
  asks again); those reviews are not cross-checked (`crossChecks.mzUnavailable` {why, skipped}, named in `problems`).

## Files a run writes (OUT = your `.csv` path)
| File | When / what |
|---|---|
| `OUT` | the CSV, only when `READY_TO_DELIVER` is true (or after `--resume --deliver-anyway`) |
| `<OUT without .csv>.NOT_READY.csv` | the CSV when it is not ready; never deliver it as final |
| `<OUT without .csv>_relog.txt` | reproducibility log of a finished run: tool and version, UTC time, "iOS App Store", country and storefront, mode and inputs, compat, every option that changes the file (`options:` --all, --primary-only, --smar-compat, --bulk, --per-app, --num, --layout and labels, --deliver-anyway with its blanked columns), the exact `command:` (shell), rows, NEXT, request counts, and "produced by smar-appstore-agent, not by smar-tool.org". Not written while a run is unfinished (exit 1 or 3) |
| `<OUT without .csv>.summary.json` | the full summary (uncapped lists); stdout carries the same object capped at 4 KB, with `truncated: true` when something was cut: then read the fields from this file (the one run file the agent may read; never edit it) |
| `OUT.progress.json` | saved state for `--resume`; never delete, move or edit it (the runner refuses to throw it away) |
| `OUT.pages/<host>/<key>.json.gz` | the journal: every Apple response of this run. `--resume` never re-fetches a journaled response (except a 403, 429 or 5xx). The search rank re-read is kept under its own key, so the search that produced the primaries stays replayable |
| `OUT.lock` | held while a run writes OUT; a second run on the same OUT exits 4. A lock left by a dead process is taken over |
| `<OUT without .csv>_<bundleId>.csv` | reviews with `--bulk --per-app`: one extra file per app (listed in `perAppFiles`) |

OUT's folder is created when it does not exist (mkdir -p; noted in `notes`); a leading `~` or `~/` means your home
folder (`~name/...` is refused: give an absolute path). Every file is written atomically
(temp file, then rename); a temp file (`*.<pid>.<random>.tmp`) left by a killed run, of any of these files, is removed
by the next run on the same OUT. Never delete, move or edit these files yourself. The same
command on the same OUT refuses to start while `OUT.progress.json` exists (exit 2: continue that run with `--resume`,
or write to a new OUT name), and files of an earlier run whose progress file is missing are refused too (exit 2,
STOP). Only when the user asks to start that run over, add `--fresh`: it discards that OUT's files first (never
together with `--resume`).

## Delivery
- Give the user the CSV path and the relog path, never the rows in chat.
- Default files have no BOM. Excel: open them with Data > From Text/CSV, File origin UTF-8, and set `id`,
  `developerId`, `appSizeInBytes`, the dates and `currentAppVersion` to Text, or Excel rewrites them.
- `--smar-compat` files carry SMAR's BOM on search, ids, rerun and reviews files, as smar-tool.org downloads do;
  chart files never have one.

## Rate limits and runtime (PLAN §5)
Apple's public endpoints throttle per IP address. The scripts keep two budgets, shared by every run of the same
user on the machine (a file-locked schedule in `<os.tmpdir()>/smar-appstore-agent/rl/`):

| Bucket | Hosts | Limit |
|---|---|---|
| itunes_api | `itunes.apple.com/search`, `itunes.apple.com/lookup`, `search.itunes.apple.com` | 18 per minute (one every 3.34 s) |
| apple_other | the chart and review feeds, `apps.apple.com`, the review cross-check | 30 per minute (one every 2.0 s) |

A 403 or 429 starts a shared cooldown of 15 s that doubles up to 5 minutes (Retry-After wins when longer); a
5xx or network error does the same up to 60 s. Each request is retried at most 6 times. When one bucket has
spent more than 6 minutes cooling down, the run saves its state and exits 1 with
`STOP: Apple is limiting requests from this network. Wait 15 minutes, then run: <command> --resume`.

| Command | itunes_api | apple_other | Time, uncontended | Calls with `--until-done` |
|---|---|---|---|---|
| search, US, 50 primaries (~700 rows) | ~22 | ~110 | ~4 min | 1 (2-4 when other runs share Apple's budget) |
| search `--primary-only` | 3-4 | 0-10 | ~30 s | 1 |
| chart (50 rows; `new*` 110) | 1 | 2 + up to 5 page checks | ~20 s | 1 |
| reviews, one app, 500 rows | 1 | 10-13 healthy; up to ~25 when Apple's feed serves empty pages | ~30 s healthy (measured live 2026-10-04: 49 s with other runs sharing the limit); up to ~1 min when pages are empty | 1 |
| reviews `--bulk`, n apps (3 read at once) | n | ~12n healthy, up to ~25n | ~25 s x n healthy (live: 3 x 500 rows in 71 s); ~50 s x n when Apple serves empty pages (offline replay with the real limiter: 2 apps 109 s, 3 apps 147 s; 277 s per app before 2026-10-04) | about 1 call per 10-20 apps |
| ids / rerun, n apps | n/200 to n/50 | ~10 | n-dependent | n-dependent |
| lookup | 1 | 0 | ~4 s | 1 |

Measured live (2026-10-01): chart `topfreeapplications 6013` 50 rows in 13 s (8 requests); reviews of
co.fapulous.app 21 rows; search "habit tracker" 501 rows with 17 itunes_api and 110 apple_other requests
(`eval/appstore/build_notes/core-runner.md`). SMAR itself fires about 770 lookups at once for one search.

`--until-done` (SKILL.md's default) is one foreground call: it keeps resuming internally (saved progress, network
retries, one re-fetch of apps whose fetch failed) until the run is finished (DELIVER, FIX_ANCHOR or STOP) or its
cap of 540 s (inside a 600 s tool timeout; `--max-seconds` overrides it) is reached, then exits 3 with `resumeWith`
(which keeps `--until-done`). While it runs it prints at most one short progress line per minute on stderr (reviews:
apps left, rows so far and an estimate; search and ids: a moving row count); stdout is still exactly one JSON
summary. A reviews summary with exit 3 carries `pace` {appsDone, apps, rowsSoFar, secondsPerApp, minutesLeft}.
Without `--until-done` a call stops at `--max-seconds` the same way. Under `kill -9` at any point, `--resume` finishes the run with a byte-identical CSV (regression suite RA8).

Empty review pages. Apple's customer-reviews RSS intermittently answers HTTP 200 with no entries. A page that should
hold reviews is re-read: the lower-case URL, then a cache-busted URL, then once more after one 15 s wait per app.
"Should hold reviews" means mid-feed, at or below an earlier page's rel=last, or every page of an app whose lookup
shows ratings. Each app gets at most 20 re-reads per pass. A pass stops re-reading an app after 3 pages in a row
stayed empty (after 1 in a re-fetch pass). An app whose every page stays empty is checked against Apple's second
review source (MZ `userReviewsRow`). It counts as having no written reviews only when the lookup shows 0 ratings, or
when both sources are empty and the app has fewer than 1,000 ratings. Otherwise it is a failed fetch: bulk ->
REFETCH, with the app named in `problems` and `deliverAnyway.why`; single app -> "STOP: Apple's reviews feed returned
only empty pages ... try again later"; `--smar-compat` -> REFETCH, with SMAR's 13-byte file only as NOT_READY.csv.
When the second source could not be read and the app has fewer than 1,000 ratings, the sentence says it cannot be
confirmed either way whether the app has written reviews (never "a temporary failure, not a lack of reviews").
Mid-feed pages that stay empty leave the app incomplete (rows below its target) in both modes, `--smar-compat` too:
REFETCH, `problems` says "N app(s) incomplete after retries".
`--resume` on the finished run (= REFETCH) re-reads only those pages; the progress line then names the re-fetch pass
and its apps-left count does not go back up. A re-fetch pass that reaches the 540 s cap ends
with what it has (still REFETCH, deliverable with `--deliver-anyway`, which keeps the partial rows and lists every
incomplete app in `partialApps`) instead of leaving the run unfinished. After a delivery with `--deliver-anyway`, a later
`--resume` re-reads what is missing; if the run is still not ready then, OUT.csv goes back to `<OUT>.NOT_READY.csv`
(`notes` says so), and `--resume --deliver-anyway` (with the user's OK) writes it again as it stands.

Saved progress that disagrees with itself. If the saved rows disagree with the run's own bookkeeping (cut, reordered or
rolled back, even when the counts were edited too), `--resume` and the browser runner (report/step/download) repair
the run before using it: they rebuild from saved lookups (search, ids), restart the chart from the saved responses,
or re-read the affected review apps. The run is never delivered short or reordered; `notes` (browser:
`report().notes`) says "the saved progress did not match its own bookkeeping (...)", and in the browser the run must
then be stepped and downloaded again.

`--resume --deliver-anyway` (only with the user's OK) refuses an unfinished run (exit 3, `NEXT` RESUME). On a
finished run held back by drift it blanks every cell of each drifted column, not only the cells a sampled
cross-check caught (summary `blankedColumns`, counted in `quarantinedCells`); a drifted anchor that is not one CSV
column (for example `webPage.version`) makes it refuse with STOP. The summary of a held-back run says which case
applies before anyone asks: `deliverAnyway: {possible, blankColumns, why}`, and a `FIX_ANCHOR` that cannot be
delivered says "cannot be delivered, not even with --deliver-anyway" in `NEXT` itself. A lookup value whose type changed (an object where a number belongs) is never
written as "[object Object]": the cell is `undefined`, listed in `typeViolations`, and the column is drift.

## Countries
- `--country XX` (default US) is used upper case, as SMAR's website sends it: in every lookup, the review feed
  path and the `country` column. Unknown codes are refused offline, before any request (exit 2; "UK" gets "use GB";
  XX, KP, GU and ZZ are unknown). Accepted: SMAR's 222 menu codes, Apple storefronts in MARKETS (MU), and XK
  (Kosovo) and MR (Mauritania), live Apple storefronts that SMAR's menu lacks.
- Marked verified in this release: US and GB (both compared with SMAR's own code in the Stage-1 probes:
  `eval/appstore/probes/ios-search-parity/runs.jsonl`, `eval/appstore/probes/ios-charts/runs/topfree_all_GB`).
  Every other country runs with `countryVerified:false` and a note in `problems`.
- The default storefront table is app-store-scraper's 115-country map. A search for a country outside it stops
  with a STOP sentence (no known storefront); a chart reads that country's own feed
  (`itunes.apple.com/<cc>/rss/...`) and also measures SMAR's file for that request (SMAR's US-ranked feed and its
  lookup in that country, 2 requests): `compatExact` lists `smar_storefront_fallback` with the row counts and
  `smarWouldDrop` (with `basis`) counts the US-chart apps SMAR drops, so the summary never says it matches SMAR
  (GE: SMAR 34 rows, 16 of the US chart's 50 dropped); reviews read `itunes.apple.com/<CC>/rss/customerreviews/...` directly.
- Non-English storefronts (JP, DE, FR, KR, ...): the app pages are translated, so the page cross-check reads them by
  structure (version history data, link target ids, value shapes), not by English labels. A row it cannot recognise
  leaves that cell unverified (`unverifiedCells` reason `webPage:localized_page`), never a false `FIX_ANCHOR`.
  Translated genre names are not compared (their ids are). Verified live 2026-10-03: JP and DE Finance charts
  DELIVER, 50/50 rows, every byte except the scrape time equal to SMAR's own code run at the same moment.
- `--smar-compat` reproduces SMAR's fallback: 108 of the 222 countries in SMAR's menu are missing from that map,
  so SMAR searches and ranks against the US store but looks the apps up in the requested country (KZ chart: 35
  rows; MA priced in USD). The summary reports `smar_storefront_fallback`. A country with no App Store (AQ)
  stops; SMAR answers an error.
- "UK" is GB.

## Reproducing a run
`rerun` re-collects exactly the apps of an earlier CSV (the skill's or SMAR's, BOM or not): same ids, order,
`scrapedFrom` labels and country. It reads only the appId, scrapedFrom and country columns, never the values.
A chart CSV (no scrapedFrom column) is rerun in the chart layout.
```
node <SKILL>/scripts/run_appstore.js rerun <PREVIOUS.csv> <OUT_DIR>/smar_appstore_rerun_<slug>.csv --until-done
```
`ids` builds the same kind of file from a list: `ids <id|bundleId>,...` with `--source "similar app links"` to
label every row, a per-id label (`com.a.b=keyword,123=similar`), or `--layout chart` for the 32-column layout.
At most 1,000 apps.

## Evaluation-only flags (never used by an agent; not in SKILL.md)
- `--replay DIR`: read every response from DIR (a run's `.pages` journal, or a campaign cache day) and never
  touch the network; a missing response stops the run with `REPLAY_MISS`.
- `--record DIR`: also write the journal to DIR.
- `--emit-both`: also write the other mode's rendering beside OUT (`<OUT>.compat.csv` or `<OUT>.default.csv`) from
  the same responses; skipped with a reason when the two modes fetch different things (site term or storefront
  fallback).
- `--sample K`: the number of apps.apple.com pages fetched for the sampled cross-check (default 10 for search,
  ids and rerun, 5 for charts).
- Not implemented: `--tz`. `dateScraped` is always UTC, as on smar-tool.org.
- `SMAR_AS_PROGRESS_MS=<ms>` (environment): overrides the 60 s interval of the `--until-done` progress line.
- Inside the evaluation campaign, `NODE_OPTIONS="-r eval/appstore/lib/preload_ratelimit.js"` hands rate limiting
  to the campaign limiter (the skill then does no spacing of its own); `SMAR_APPLE_RL=<ratelimit.js>` uses that
  module directly; `APPLE_RL_LABEL` labels the run.

## Honest limits
- Counters are live. Apple's CDN caches each exact lookup URL for up to 24 hours, so `avgRating` and
  `totalReviews` can differ from a SMAR run made at another time, even minutes apart (FS-02, FS-10). The skill
  classifies those cells as `cdn_age` and never "corrects" them. Compare only with a SMAR run from the same hour.
  A version mismatch between the app page and the lookup is called `cdn_age` only when the cache-busted re-read
  could have shown a stale lookup; when the re-read returns the same version it is `versionMismatchPersistent`.
- `crossChecks.rowsChecked` counts the rows a second Apple source compared (the sampled app pages, the similar
  pages' product data, search lockups, the chart feed); `unanchoredRows` had only internal checks. In a long search
  most related apps are unanchored (a 525-row search: 58 anchored).
- Apple's ranking of head terms is noisy: two searches 30 s apart shared 39 of 50 results, and 3 of 30 paired
  live runs ordered the primaries differently (ios-search-parity). A second search at the end of each run
  reports `searchRankNondeterminism`. Similar-app lists were stable in 10 of 10 re-reads.
- Apple may retire the legacy endpoints SMAR depends on (MZStore search, the ax.itunes chart feed, the review
  RSS, `customersAlsoBoughtApps` on the legacy store page). SMAR then breaks the same way; the skill stops with
  a STOP or `FIX_ANCHOR` instead of writing partial data.
- Reviews: at most the newest 500 per app per country (10 pages of 50; Apple answers page 11 with HTTP 400), no
  developer replies, no titles or user names in SMAR's columns. SMAR's own target is min(ratings count, 500), so
  an app with more written reviews than ratings loses its older reviews in SMAR's file too; `--all` lifts that.
  A written review needs text and a rating needs none, so a small app can have ratings and no written reviews. The
  skill says so only when the lookup shows 0 ratings or both Apple review sources are empty (fewer than 1,000
  ratings). SMAR's target min(ratings, 500) means an app with 0 ratings has target 500 (SMAR's rule, kept).
- No date-range or star filter and no Excel output (SMAR has none): the skill delivers the SMAR CSV. A derived file
  is made only when the user asks, by a short script that selects rows or converts the format of the delivered CSV,
  under a `_derived_` name, and is reported as derived and not re-verified (SKILL.md step 0).
- `contentRating` is the lookup's legacy 4+/9+/12+/17+ scale; the App Store page shows Apple's 2025 scale. The
  skill copies the lookup value, as SMAR does (FS-05). The BR store's lookup spells the same scale `+4`, `+12`, `+17`
  (written as is, as SMAR writes it); only there is that spelling not lookup drift.
- Bulk reviews: SMAR's website export of a bulk job is broken (it keeps only the first app); the skill writes the
  intended combined file and reports `bulk_frontend_not_reproduced`.
- Browser mode has no keyword search, no `rerun`, no per-app review files and no app-page sample (Gate B). No
  Google Play (use smar-playstore-agent).
