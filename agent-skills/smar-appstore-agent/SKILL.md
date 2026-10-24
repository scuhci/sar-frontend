---
name: smar-appstore-agent
description: >
  Reproduce SMAR's (smar-tool.org) Apple App Store keyword search with similar-app expansion, top charts and
  app reviews as SMAR's CSV files, with deterministic scripts. Use for App Store data "in SMAR format",
  agent-vs-SMAR benchmarks, "pull fitness apps from the App Store", "top free Health & Fitness apps",
  "reviews for an iPhone app". Apple App Store only (not Google Play). Shell with Node 18+.
---

# SMAR App Store Agent (v2.1): checklist

The scripts fetch, cross-check and write every value. You run one command per step, read the one JSON
object it prints, and do what it says, in order. A run is ONE foreground command that waits until it is done.
Details: `references/smar_appstore_schema.md` (columns, SMAR quirks), `references/top_charts.md` (collections
and genre ids), `references/setup_and_limits.md` (runtime, rate limits, files, countries).

## Hard rules
- Never type, copy, round, estimate or edit a data value. A value the scripts could not verify stays `undefined`.
- Never delete, move, rename, edit or open a run's files: the CSVs, `*.progress.json`, `*.summary.json`, `*.lock`,
  `*.pages/`. Never `rm` anything. The scripts keep these files; you read the JSON a command prints, and
  `summaryFile` only when step 4 says so (read it, never edit it).
- Run every command in the foreground and wait for it. Never add `&`, `nohup`, `run_in_background`, a shell loop,
  `sleep`, a monitor or a watcher. Never send your final reply while a run is unfinished (the last exit code was 3,
  or `NEXT` starts with RESUME): run the next command instead.
- Never read an Apple response, an App Store page or the files in `scripts/` into your context (no curl,
  no web fetch, no page text or screenshots of app pages). In browser mode you only paste the scripts.
- Run only the commands written here or printed in `NEXT`. Never pick an app id yourself.
- When the skill stops or cannot do something, never work around it, even if the user asks for "some other way":
  no scraper or fetching script of your own, no Apple endpoint, page, site token or other tool. Explain the limit
  and offer only what the skill supports: trying again later (`--resume`), `--deliver-anyway` with its caveats
  when `deliverAnyway.possible` is true, or another mode that changes the result (`ids`, another country or
  collection; `--all` only for an app with fewer than 500 ratings, where it reads up to the newest 500 instead of
  the ratings count; with 500+ ratings it gives the same rows). Never offer `--all` after an empty-feed STOP: it
  reads the same empty feed.

## Step 0. Scope and mode
- Google Play request: reply "This skill covers the Apple App Store only; Google Play needs smar-playstore-agent." and stop.
- Permissions columns: reply "SMAR's App Store export has no permissions columns." Never improvise either.
- Filters or formats SMAR has no option for (a date range such as "last 30 days", a star filter, Excel/xlsx):
  say so, run the closest supported request and deliver the SMAR CSV (Excel: give the import steps in
  `references/setup_and_limits.md`, Delivery). Offer nothing more. Only if the user then asks for a derived file:
  write one short script that only selects rows from the delivered CSV by an exact rule you state (e.g.
  `dateReviewed` on or after 2026-09-05) or converts its format, writing a new file with `_derived_` in its name
  (never over the CSV or a run file). Call it "derived from the SMAR CSV, not a SMAR file, not re-verified" and
  quote counts only from that script's printed output. Never compute, tally or type a value yourself.
- Mode: shell if `node --version` prints v18 or higher, otherwise browser mode (end of this file; charts,
  reviews, app-id lists and name lookup only). If the user asked for "the browser" but you have a shell, use
  the shell and say so: same Apple endpoints, same bytes. Keyword search or `rerun` with no shell: reply
  "Keyword search needs shell mode (Claude Code); charts, reviews and app-id lists work in the browser." and stop.

## Step 1. Set three values (every command uses absolute paths and runs from any folder)
- SKILL = the absolute path of the folder that holds this SKILL.md.
- OUT_DIR = an absolute folder for the results, outside SKILL (the user's working folder unless they name one).
  The runner creates it when it does not exist; never create or clean it yourself.
- CC = the store country, two letters upper case (default US; "UK" means GB). The runner refuses an unknown
  code before any request (exit 2; for UK it says to use GB). It accepts SMAR's 222 menu codes, Apple's other
  storefronts in its market list (MU), and XK (Kosovo) and MR (Mauritania), live storefronts SMAR's menu lacks.

## Step 2. Resolve the inputs (never guess)
- TERM (keyword search): the script applies the TERM rule. Pass the user's words for what to search, exactly as
  they wrote them (keep their quotes and labels, e.g. `"meditation apps"`, `keyword: budget app`, `fitness tracking apps`):
  ```
  node <SKILL>/scripts/run_appstore.js term "<user phrase>" --country <CC>
  ```
  (A phrase that holds a double quote goes in single quotes instead: `term '"meditation apps"'`.)
  Use its `TERM` exactly as printed and its `file` as the output file name (step 3). The rule it applies: quoted or
  labelled terms verbatim; otherwise a trailing generic "app"/"apps" is dropped unless it is part of a name
  ("Cash App"); a bundle id (com.calm.calmapp) or a number stays as it is (SMAR then returns that one app, or searches
  the number as text; to fetch apps by id use `ids`). Never add, reorder, pluralise, translate or spell-correct words,
  and never change the printed TERM. Emoji and symbol phrases ('🧘', '&', '%') are valid terms. A phrase with nothing
  visible (only quote marks, spaces, zero-width or format characters, a lone variation selector or combining mark,
  a filler such as U+3164) is refused with exit 2, by `term` and by `search`: ask the user what to search.
- An app named in words (for reviews or an id list) is resolved by the script:
  ```
  node <SKILL>/scripts/run_appstore.js lookup "<app name>" --country <CC>
  ```
  `decision` "USE": use `match.bundleId` (its `NEXT` starts with `USE:`). `decision` "ASK": show the user
  every candidate (title, developer, ratings) and ask which app they mean. A `NEXT` starting with `STOP:`:
  tell the user that sentence. Never type an app id from memory. An App Store link
  (`apps.apple.com/.../id<digits>`) gives the trackId `<digits>`; use it as the app id.
- Top charts: "top free" is topfreeapplications, "top paid" toppaidapplications, "top grossing" or
  "highest-grossing" topgrossingapplications (iPhone). iPad, Mac and "new apps" collections are listed in
  `references/top_charts.md`. GENRE = the genre id from that file (Health & Fitness 6013, Games 6014), or
  `all` for "overall", "all categories" or no category. Not in the file: show the closest rows and ask.
- `<slug>` (reviews, ids, rerun) = the app id(s) in lower case, every run of characters other than a-z/0-9 replaced
  by `_`. A search's file name is the `file` printed by `term` (it keeps non-Latin letters such as 家計簿 and adds a
  short hash when characters were dropped, so two terms never share a file). `<cc>` is CC in lower case.

## Step 3. Run exactly one of these commands, ONE call, in the foreground (fill only the <...> placeholders)
Run it exactly as written: no `|`, `tail`, `head`, `tee`, `2>&1`, `>` or other redirect, and no wrapper. Its own exit
code and the last line it prints are what this step reads (behind a pipe the exit code is the pipe's last command).
```
node <SKILL>/scripts/run_appstore.js search "<TERM>" <OUT_DIR>/<file> --country <CC> --until-done
node <SKILL>/scripts/run_appstore.js chart <COLLECTION> <GENRE> <OUT_DIR>/smar_appstore_chart_<COLLECTION>_<GENRE>_<cc>.csv --country <CC> --until-done
node <SKILL>/scripts/run_appstore.js reviews <bundleId> <OUT_DIR>/smar_appstore_reviews_<slug>_<cc>.csv --country <CC> --until-done
node <SKILL>/scripts/run_appstore.js ids <id1,id2,...> <OUT_DIR>/smar_appstore_ids_<slug>_<cc>.csv --country <CC> --until-done
node <SKILL>/scripts/run_appstore.js rerun <PREVIOUS.csv> <OUT_DIR>/smar_appstore_rerun_<slug>.csv --until-done
```
- Add `--smar-compat` only if the user wants SMAR's exact file (SMAR's rows, bytes, known quirks and the
  website's BOM). The default writes SMAR's columns without SMAR's transport losses and writer bugs.
- Add `--primary-only` (search) only if the user asks for no similar apps; SMAR always adds them.
- Reviews: several apps = a comma list plus `--bulk` (add `--per-app` for one extra file per app); "every
  review Apple has" = add `--all` (Apple serves at most the newest 500; the default is SMAR's set, the newest
  min(ratings count, 500)). `ids` takes trackIds or bundle ids; `rerun` re-collects the apps of an earlier CSV.

Runtime: `--until-done` keeps working inside this one call (it resumes, retries and re-fetches by itself) until
the run is finished, for at most 9 minutes. Give the call a tool timeout of 600000 ms (the longest your tool
allows if that is less). A chart, one app's reviews or an id list takes under a minute; a full keyword search
(about 700 apps) about 4 minutes when no other run shares Apple's rate limit, longer when one does. Reviews take
about 30 s per app when Apple's review feed is healthy and up to about a minute per app when it serves empty pages
(the script re-reads them; Apple does this intermittently). `--bulk` reads 3 apps at a time inside the same rate
limit, so 20 apps take roughly 8-20 minutes (1-3 calls). While it runs it prints at most one short progress line
per minute (apps left, rows so far and an estimate for reviews; a moving row count for search and ids); that is
normal, keep waiting. The last line it prints is the one JSON summary you read.

Exit codes (every one is defined; nothing else is possible):
- `0`: finished. Go to step 4 (read `READY_TO_DELIVER` and `NEXT`; it can be false with exit 0).
- `3`: not finished yet (the 9-minute cap or your tool's timeout stopped this call; progress is saved). Run the
  printed `resumeWith` command exactly, again as one foreground call with the same timeout; repeat while the exit
  code is 3, at most 10 times. If your tool killed the command and printed nothing, run the same command again
  with ` --resume` added. A reviews summary with exit 3 carries `pace` {appsDone, apps, rowsSoFar, secondsPerApp,
  minutesLeft}: tell the user how far it got and the estimate, then resume.
- `1`: stopped early. If `NEXT` starts with `STOP:`, tell the user that sentence and stop. Otherwise run
  the command after the first `: ` of `NEXT` once (it counts toward the 10).
- `2`: usage or setup error (a missing OUT_DIR is created, so it is never that). Fix the command once from `error.message`. If `NEXT` says a progress file or files of
  an earlier run exist, never delete them: continue with ` --resume` when it is the same request, otherwise add `_2`
  before `.csv`. If it fails again, stop and tell the user.
- `4`: another run is writing this OUT file (its lock file guards this; never look for processes
  yourself). Stop and tell the user; never start a second one.
- `5`: the script crashed. Stop and give the user `error.message` and `resumeWith`.

## Step 4. Read the summary and follow NEXT
The JSON the command printed is the summary, capped at 4 KB; the uncapped copy is `summaryFile`. Read
`READY_TO_DELIVER` and `NEXT`. When the printed summary has `truncated: true`, read every other field you need
(steps 4-5) from `summaryFile`; never run a command again to see a field. Every command you run from `NEXT` is one
foreground call that uses the step-3 exit codes.
- `DELIVER`: go to step 5.
- `RESUME: <command>`: run the command exactly (at most 2 times), then re-read.
- `REFETCH: <command>`: run it once (it re-reads only what failed: lookups of failed apps, or for reviews the empty
  review pages and the apps whose feed came back empty), then re-read; if `NEXT` still starts with REFETCH, treat
  the run as "Not ready".
- `FIX_ANCHOR: <source.field>`: an Apple source changed shape (a field moved, vanished or changed type; its
  cells are `undefined`), or a value check failed on many rows (in both modes: `--smar-compat` is held too, since
  SMAR's file would carry the same wrong values). Tell the user every listed field; edit nothing;
  see "Not ready". When `NEXT` says the run "cannot be delivered" (`deliverAnyway.possible` false), say so and why
  (`deliverAnyway.why`); never offer it. What each value anchor (`semantic.*`, `webPage.lastUpdated`,
  `reviewsRss.*`, `mzReviews.*`) means is in `references/smar_appstore_schema.md`, "Value checks".
- `STOP: <sentence>`: tell the user the sentence (no results, app not in this store, no written reviews (said
  only when Apple's lookup shows 0 ratings, or both of Apple's review sources are empty), Apple's reviews feed
  returning only empty pages (a temporary Apple failure: tell the user to try again later and give the command in
  the sentence; never tell them the app has no reviews; when the sentence says it could not be confirmed either
  way, say exactly that, neither "no reviews" nor "a temporary failure"), empty or dead chart, no App Store for the
  country, endpoint drift (a chart whose lookup no longer carries the feed's app ids), rate limit, or a
  `--smar-compat` request that SMAR answers with an error and no file); see "Not ready".

Not ready: when `READY_TO_DELIVER` is false the CSV exists only as `<OUT>.NOT_READY.csv` (path in `csv`;
no file when `csv` is null). Never deliver it as final. `deliverAnyway` says whether it can still be delivered:
`possible` false = tell the user this run cannot be delivered and `why` (a drifted anchor that is no single column
cannot be blanked), and stop; never offer or try deliver-anyway then. Only when `possible` is true, only on a
FINISHED run (exit 0 or 1, never while exit 3 or `NEXT` RESUME) and only if the user agrees, run the command that
produced this summary with
` --resume --deliver-anyway` added: it rewrites OUT.csv from the saved progress, without network, and blanks EVERY
cell of each drifted column named in `FIX_ANCHOR` (listed in `blankedColumns`, written `undefined`), not only the
cells a sampled check caught. Tell the user which columns are blank. If it prints `STOP:` or that summary still
says `READY_TO_DELIVER` false, tell the user and stop. Never use `--fresh` unless the user asks to start the
same run over from scratch. For reviews, `deliverAnyway.why` and `partialApps` name every incomplete app (rows of
target, which pages are missing, or "every page came back empty"); `--deliver-anyway` keeps those partial rows and
does not drop the apps. Tell the user exactly that. If you offer to try again later after delivering anyway, say first
that the retry (`<command> --resume`) moves OUT.csv back to `<OUT>.NOT_READY.csv` when the run is still incomplete
then (its `notes` say so); with the user's OK, `--resume --deliver-anyway` writes it again as it stands.

Repaired runs: a note "the saved progress did not match its own bookkeeping (...)" in `notes` (browser:
`report().notes`) means `--resume` or the browser runner found the saved rows cut, reordered or rolled back and
repaired the run (rebuilt from saved lookups, restarted the chart, or re-read those review apps) before using it; it
is never delivered short. In the browser, step and download it again (browser steps 5-7).

## Step 5. Report (copy values from the last summary, or `summaryFile` when it says `truncated`; compute nothing; never paste the CSV)
- Request: mode, the exact TERM (or collection and genre, or app ids with their lookup titles), country,
  default or `--smar-compat` (SMAR's exact file), and `primaryOnly` if present.
- Files: `csv` with `rows` data rows, `relog` (reproducibility log), `summaryFile`.
- Rows: `bySource` (search: keyword search / similar app links), `chart` (rssRows, rows, dropped), or per app
  from `reviews` (rows, target, ratingCount, duplicates, healed: `reviews.apps`, or `reviews.appsTable`, cols plus
  one row per app, when the printed summary was shortened; with `reviews.appsTableTruncated`, read `reviews.apps`
  in `summaryFile`).
- Cross-checks: `crossChecks.rowsChecked` rows were compared with a second Apple source; `crossChecks.unanchoredRows`
  rows had no second source (internal checks only). Say "N of M rows were cross-checked" with these numbers; never
  say "all rows" unless `unanchoredRows` is 0. `crossChecks.webPageUnavailable` {why, failed, skipped}: the optional
  apps.apple.com check gave up (5xx or no answer twice in a row, one 403/429, or 404 on every page) and the run
  delivered on its other sources (an `ids` run has none: then no row was cross-checked); say so (`problems` names it).
  `crossChecks.mzUnavailable` {why, skipped}: Apple's second review source gave up the same way; those reviews were
  not cross-checked; say so.
- Cells: `undefinedCounts` (SMAR also writes `undefined` there); `quarantinedCells` and `quarantinedApps`
  (failed a cross-check or a value check, written `undefined`; `--smar-compat` keeps SMAR's value where only another
  source disagrees and lists it in `unverifiedCells`, but writes `undefined` where the value fails a check of its own
  record, listed in `quarantinedCells` and in `compatExact` as `quarantined_cells`; which checks:
  `references/smar_appstore_schema.md`, "Value checks"); `typeViolations` (an Apple field changed type, written
  `undefined`); `blankedColumns` (deliver-anyway); `unverifiedCells` (`localized_page`: a translated app page that
  could not verify that cell); `drift` (`cdnAgeRows`: Apple's CDN served an older copy; `versionMismatchPersistent`:
  the app page shows another version than the lookup and a re-read confirmed the lookup, so it is not CDN age).
- Differences from SMAR's file: `smarWouldDrop` (rows SMAR's file would not contain; with `basis` when SMAR's file is
  another chart: quote `basis`), `transportRisk`,
  `compatExact` (ok, or each reason code), and when present `smarSiteTerm`, `smarSearchWouldHttp500`,
  `smarChartWouldHttp500`, `smarReviewsWouldHttp500`, `smarUiWouldReject`, `smarFileName` (SMAR's download
  name) and `countryVerified` false ("not yet verified for this country").
- Say: "Values are copied by script from Apple's lookup and RSS responses; <rowsChecked> of <rows> rows were
  cross-checked against a second Apple source; ratings counts are live (and cached by Apple's CDN for up to a day),
  so compare only with a SMAR run from the same hour." When `compatExact` lists `smar_storefront_fallback`, also
  say SMAR's file would differ (quote its detail): never say this file matches SMAR's. If asked why SMAR has other
  rows, quote `references/smar_appstore_schema.md`.
- Deliver the paths of the CSV and the relog. Never paste rows into the chat.

## Browser mode (Claude in Chrome, only when you have no shell)
1. Navigate this tab to `https://itunes.apple.com/us/rss/topfreeapplications/limit=1/json` (any country).
2. If `typeof SMAR_AS_RUN === 'undefined'`, paste the full text of ONE file, `scripts/min/appstore.bundle.min.js`
   (all 8 scripts, minified, about 260 KB): verbatim, in one JavaScript call. It returns `SMAR_AS_RUN ready`.
3. `await SMAR_AS_RUN.verify('87ea2c8ad807cfc0b3c62fcf64205edeff3d623c45d771f1bb75ae54b7fdd129')` must return `ok:true`.
   Otherwise reload the tab and redo steps 2-3; after 2 failures stop and suggest shell mode.
4. App names: `await SMAR_AS_RUN.lookup('<app name>', {country:'<CC>'})`, same rule as step 2. Start once:
   charts `await SMAR_AS_RUN.start({mode:'chart', collection:'<COLLECTION>', genre:'<GENRE>', country:'<CC>'})`;
   reviews `{mode:'reviews', apps:['<bundleId>'], country:'<CC>'}` (several apps: add `bulk:true`; `all:true`
   as in step 3); ids `{mode:'ids', ids:['<id1>','<id2>'], country:'<CC>'}`. Add `compat:true` for SMAR's exact
   file. A result with code `CONFLICT` means another unfinished or undownloaded run is stored; tell the user,
   and only with their OK start again with `force:true`. Code `WRONG_ORIGIN`: go back to browser step 1.
5. Repeat `await SMAR_AS_RUN.step(20)` until it returns `remaining:0`. `busy` or `retryAfterMs`: wait that
   long, then step again. `superseded`: step again. `fatal`: follow its `NEXT`. Page reloaded (`SMAR_AS_RUN`
   undefined): redo browser steps 2-4 with the identical start options; the run resumes.
6. `await SMAR_AS_RUN.report()`, then step 4 using the `await SMAR_AS_RUN...` calls printed in `NEXT`, and step 5.
7. Ask the user, then `await SMAR_AS_RUN.download()` (SMAR's file name) and
   `await SMAR_AS_RUN.download(null, {relog:true})`. When `READY_TO_DELIVER` is false, only with the user's OK:
   `await SMAR_AS_RUN.download(null, {deliverAnyway:true})`. The browser reads charts from the storefront's
   itunes.apple.com feed (SMAR reads the http ax.itunes feed; same ids and order in 9 of 9 paired reads) and
   skips the app-page sample; `compatExact` says so.
