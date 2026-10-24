---
name: smar-playstore-agent
description: >
  Reproduce SMAR's (smar-tool.org) Google Play keyword search with similar-app expansion, top charts and
  app reviews as SMAR's CSV files, with deterministic scripts. Use for Google Play data "in SMAR format",
  agent-vs-SMAR benchmarks, "pull fitness apps from Play", "top free board games", "reviews for an app".
  Google Play only (not the Apple App Store). Shell with Node 18+, or Claude in Chrome on play.google.com.
---

# SMAR Play Store Agent (v3.1.0): checklist

The scripts fetch, cross-check and write every value. You run one command per step, read the one short JSON
line it prints, and do what it says, in order. Details: `references/smar_schema.md` (columns, SMAR
quirks), `references/top_charts.md` (category ids), `references/setup_and_limits.md` (runtime, limits).

## Hard rules
- Never type, copy, round, estimate or edit a data value. Never edit or delete a CSV, `*.progress.json`,
  `*.state.json` or `*.summary.json` file. A value the scripts could not verify stays `undefined`.
- Never read page content into your context (no curl, get_page_text or screenshots of app pages) and
  never read the files in `scripts/`. In browser mode you only paste the files in `scripts/min/`.
- Never choose a JSON path or label yourself; copy one only from a heal line with `"decision":"USE"`.
  Run only the commands written here or printed in `NEXT` (the one exception: a derived file, step 0).
- When the skill stops, refuses or cannot do something, never work around it, even if the user asks for "some
  other way": no scraping, curl, store endpoints, tokens or a scraper of your own. Explain the limit and offer
  what the skill supports: the same command with ` --resume` later, `--deliver-anyway` with its blank columns
  ("Not ready"), or another mode (ids, rerun, `--all`, `--smar-compat`).

## Step 0. Scope and mode
- Apple App Store request: reply "This skill covers Google Play only; App Store needs a separate skill." and stop.
- Permissions columns: reply "Permissions columns are not supported by this skill." Never improvise either.
- Filters or formats the scripts do not offer (a date range such as "last 30 days", a star or word filter,
  Excel/xlsx, tallies): say the skill writes SMAR's CSV only, deliver that CSV (Excel: `references/setup_and_limits.md`,
  Delivery). Only if the user then asks, make a derived file with a short script that reads the CSV and writes a
  NEW file named `<OUT without .csv>_derived_<what>.<ext>` (never typed or hand-computed values, never edit the
  CSV); report only what that script prints, and say the file is derived and not cross-checked by the skill.
- Mode: shell if `node --version` prints v18 or higher, otherwise browser mode (end of this file). If the
  user asked for "the browser" but you have a shell, use the shell and say so: same pages, same bytes.

## Step 1. Set three values (every command uses absolute paths and runs from any folder)
- SKILL = the absolute path of the folder that holds this SKILL.md.
- OUT_DIR = an absolute folder for the results, outside SKILL (the user's working folder unless they name one).
  The scripts create it if it does not exist; never create or clean it yourself.
- CC = the store country, two letters upper case (default US).

## Step 2. Resolve the inputs (never guess)
- TERM (keyword search) = the exact string a user would type into SMAR's search box. The script applies the
  rule; pass it the words of the request that name what to search, copied exactly as the user wrote them:
  ```
  node <SKILL>/scripts/run_play.js term "<user phrase>"
  ```
  Use its `term` as TERM and its `slug` as `<slug>`. If `term` is null, show `candidates` and ask the user.
  The rule (browser mode: apply it yourself): quoted or labelled terms verbatim ("meditation apps", keyword:
  budget app); otherwise drop a trailing generic "app"/"apps" ("fitness tracking apps" gives fitness tracking)
  unless it is part of a name (a capitalised "App" after a capitalised word: "Cash App"). Never add, reorder,
  pluralise, translate or spell-correct words. A package id (com.hevy) is used as the TERM. An emoji or symbol
  (🧘, &, %) is a term, passed as written; only a phrase of quote marks or invisible characters has none.
- An app named in words (for reviews or an id list) is resolved by the script:
  ```
  node <SKILL>/scripts/run_play.js lookup "<app name>" --country <CC>
  ```
  Use `candidates[0].appId` only if `match` is not `none` and `unique` is true. Otherwise show the
  candidates (title and appId) and ask the user. Never type an app id from memory.
- Top charts: "top free" is TOP_FREE, "top paid" TOP_PAID, "top grossing"/"highest-grossing" GROSSING.
  CATEGORY = the id from `references/top_charts.md` ("overall"/"No Category" is APPLICATION, non-game apps;
  not in the table: show the closest rows and ask). A pair missing from that file's "What smar-tool.org's
  own page offers" list still runs; tell the user SMAR's website does not offer it.
- `<slug>` = the term command's `slug`: a plain term (a-z, 0-9, single spaces) is lower case with `_` for spaces;
  any other term (c++, to-do, emoji, non-Latin letters, over 80 bytes) is cut to 80 bytes, loses invisible
  characters and edge punctuation, and gets a short hash, so two terms never share a file (a v3.0.0 run under an
  older name is not resumed). For app ids: lower case, every run of characters other than a-z/0-9 replaced by
  `_`. An OUT file name over 200 bytes is refused (exit 2); reviews of many apps then use the first id's slug plus
  `_and_<number of other apps>_more`.
  `<cc>`, `<category>` and `<collection>` in file names are CC, CATEGORY and the collection in lower case.

## Step 3. Run exactly one of these commands, ONE call, in the foreground (fill only the <...> placeholders)
Run it exactly as written: never pipe or redirect it (no `|`, `tail`, `head`, `tee`, `>` or `2>&1`). Its
stdout is one short JSON line; the full summary is the file `summaryFile`. A cut, missing or unreadable line is
never a reason to run the command again: read `summaryFile` (`<OUT>.summary.json`) instead.
```
node <SKILL>/scripts/run_play.js search "<TERM>" <OUT_DIR>/smar_play_<slug>_<cc>.csv --country <CC> --until-done
node <SKILL>/scripts/run_play.js chart <CATEGORY> <OUT_DIR>/smar_chart_<category>_<collection>_<cc>.csv --collection <TOP_FREE|TOP_PAID|GROSSING> --country <CC> --until-done
node <SKILL>/scripts/run_play.js ids <id1,id2,...> <OUT_DIR>/smar_ids_<slug>_<cc>.csv --country <CC> --until-done
node <SKILL>/scripts/run_play.js rerun <PREVIOUS.csv> <OUT_DIR>/smar_rerun_<slug>.csv --until-done
node <SKILL>/scripts/reviews_play.js <appId> <OUT_DIR>/smar_reviews_<slug>_<cc>.csv --country <CC> --until-done
```
- Add `--smar-compat` only if the user wants SMAR's exact file (SMAR's rows, bytes and known bugs). The
  default writes the page's true values. Add `--primary-only` (search) only if the user asks for no
  similar apps; SMAR always adds them.
- Reviews: several apps = a comma list plus `--bulk`; "every review Google has" = add `--all` (default:
  SMAR's set, the newest min(review count, 10000)). `--all` runs about 150-300 reviews a second (125,000 reviews:
  about 14 minutes, 2 calls), so an app with more than about 800,000 reviews needs more than the 10 calls of exit 3:
  tell the user the estimate first and offer `--limit N`. `rerun` re-collects the apps of an earlier CSV.

Runtime: `--until-done` keeps working inside this one call (it resumes, retries failed pages and re-fetches by
itself, saving progress after every app) until the run is finished, for at most 9 minutes. Give the call a tool
timeout of 600000 ms; if your tool allows less, add `--max-seconds <your limit in seconds minus 60>`. Never run it in the background and never
end your turn while a run is in progress: wait for the call to return. A chart or an id list takes 1-3 minutes,
a full search (150-330 apps) 2-8 minutes, 10,000 reviews longer. While it runs it prints at most one short
progress line per minute; that is normal, keep waiting. The last line it prints is the one short JSON line you read
(`READY_TO_DELIVER`, `NEXT`, `csv`, row counts and `summaryFile`).

Exit codes (every one is defined; nothing else is possible):
- `0`: finished. Go to step 4 (read `READY_TO_DELIVER` and `NEXT`; it can be false with exit 0).
- `3`: not finished yet (the 9-minute cap or your tool's timeout stopped this call; progress is saved). Run the
  printed `resumeWith` command exactly, again as one foreground call with the same timeout; repeat while the exit
  code is 3, at most 10 times. If your tool killed the command and printed nothing, run the same command again
  with ` --resume` added. After 10, stop: tell the user the run is saved (no CSV until it finishes; `remaining`
  apps, or `rowsSoFar` reviews so far) and that `resumeWith` continues it later.
- `1`: stopped early. If `NEXT` starts with `STOP:`, tell the user that sentence and stop. Otherwise run
  the command after the first `: ` of `NEXT` once (it counts toward the 10).
- `2`: usage or setup error. Fix the command once from `error.message`. If `NEXT` says a progress file or files of
  an earlier run exist, never delete them: continue with ` --resume` when it is the same request, otherwise add `_2`
  before `.csv`. Never add `--fresh` unless the user asks to start that same run over. If it fails again, stop
  and tell the user.
- `4`: another run is writing this OUT file (its lock file guards this; never look for processes
  yourself). Stop and tell the user; never start a second one.
- `5`: the script crashed. Stop and give the user `error.message` and `resumeWith`.

## Step 4. Read the summary and follow NEXT
Read `READY_TO_DELIVER` and `NEXT` from the printed line. Every other field is in `summaryFile` (a JSON file):
read it with your file-reading tool for step 6, never edit it. Every command you run from `NEXT` is one
foreground call that uses the step-3 exit codes.
- `DELIVER`: if the summary has `refetchOnce`, run that command once and use its summary. Go to step 6.
- `RESUME: <command>` or `RETRY_WITHHELD: <command>`: run the command exactly (at most 2 times), then re-read.
- `REFETCH: <command>`: run it once (it re-downloads only those apps), then re-read.
- `HEAL: <command> ; <command>`: go to step 5.
- `FIX_ANCHOR: <anchor>`: a cross-check source on the page changed. Tell the user; do not heal; see "Not ready".
- `STOP: <sentence>`: tell the user the sentence (no results, page or chart drift, a chart list that repeats
  apps, an inconsistent progress file: re-run into a NEW file, empty chart, wrong storefront, rate limit or
  consent page, or a compat request SMAR answers with no file); see "Not ready".
- `DELIVERED_ANYWAY: <sentence>`: printed after `--deliver-anyway` wrote OUT.csv (`READY_TO_DELIVER` stays false):
  deliver it as not cross-checked and name every blanked column with its reason; never heal or re-run.

Not ready: when `READY_TO_DELIVER` is false the CSV exists only as `<OUT>.NOT_READY.csv` (path in `csv`;
no file when `csv` is null). Never deliver it as final. Only on a FINISHED run (never while exit 3 or `NEXT`
RESUME; such a request is refused) and only if the user agrees, run the command that produced this summary with
` --resume --deliver-anyway` added: it rewrites OUT.csv from the saved progress, without network, with every
cell of a drifted column set to `undefined`, and of every column blanked with it (one holding the drifted
column's values, or sharing its record). `deliverAnywayBlanked` (reviews: `blankedColumns`, per app, reason in
brackets; a blank reviewID blanks reviewURL too) names each column and why: tell the user every one. Those
cells join `quarantinedCells`. It is refused (`deliverAnywayRefused`) when the progress file is inconsistent.

## Step 5. Heal (only when NEXT starts with HEAL; at most 2 rounds)
1. Split the text after `HEAL: ` at ` ; ` and run each `node .../heal.js ...` command separately, in order.
2. If a command prints a line starting `save as <FILE>`, write everything after the first `): ` on that
   line (a JSON object) into `<FILE>`, replacing its content, before you run the next command.
3. Every decision line says `"decision":"USE"`: run your step-3 command again into a NEW file (`_heal1.csv`,
   then `_heal2.csv`) with `--paths <OUT_DIR>/paths.override.json` (replacing any earlier `--paths`), and
   `--labels <OUT_DIR>/labels.override.json` if heal saved that file. Never `--resume` here.
4. Any line says `"decision":"STOP"`, or heal exits 1, 2 or 5: stop healing, tell the user the field and
   its `reason`, and see "Not ready". Still asked to HEAL after round 2: same. `path-in-use`: two columns'
   data moved together (name both). `current-path-ok` on offersIAPRange: Google's results or chart list and the
   app pages disagree on in-app ranges.

## Step 6. Report (copy values from the last run's `summaryFile`; compute nothing; never paste the CSV)
- Request: mode, the exact TERM (or category and collection, or app ids with their lookup titles), country,
  default (page values) or `--smar-compat` (SMAR's file format and bugs), and `primaryOnly` if present.
- Files: `csv` with `csvRows` data rows (reviews: `rows`), `relog`, `summaryFile`.
- Rows: `bySource` (search) or `chart` ranks (and `requested`); `notFound`; `fetchFailed`; `wrongStorefront`
  withheld; every `problems` line starting `note:` (a chart shorter than requested, an app listed twice). Id-list and
  rerun rows say scrapedFrom `app id list` (SMAR and a compat file: `keyword search`; `appIdListLabel`).
- Cells: `undefinedCounts` as counts per column; `undefinedSample` names up to 5 of those apps per column: name an
  app as blank only if it is listed there. `quarantinedCells`, `quarantinedApps` (failed a cross-check, written `undefined`); `unverifiedCells`;
  `shortDetailPages` when present (Google's page shows no version, Android version or release date);
  `derivedUnconfirmed.cells` (written as the text VARY, not blank; never listed with `undefined` cells);
  `ratingBlanksConfirmed` (no rating on the page, seen again on a second fetch) with `unratedByDeveloper` copied
  as numbers (never "most" or "mainly"); `ratingBlanksUnconfirmed` when not empty (rating may exist).
- `smallRunQuarantine`: cells withheld because too few apps of the run carry that field to tell a real value
  from a moved path (counted in `quarantinedCells`, never layout drift): withheld, not known to be wrong; running
  those apps with more apps that carry the field keeps them.
- With `--smar-compat` these counts and lists describe the delivered file (`countsDescribe`): SMAR's rows only
  and SMAR's cells; `rows` = apps fetched, `csvRows` = rows in the file. After `--deliver-anyway`, only cells of
  the file's rows that went from a value to blank are added to `quarantinedCells`.
- `softSignals` are informative checks whose cells were kept: never call their `sample` apps blank or wrong,
  and never link them to `undefinedCounts`.
- Differences from SMAR's file. Default mode always differs from SMAR's file by design: report
  `defaultVsSmarDifferences` (`developerAddressFilled` cells SMAR leaves `undefined`, `quotesDoubledBySmar`,
  `rowsSmarDrops`, `smarRelabels`) and never say the file otherwise matches SMAR's; when it says `smarReturnsNoFile`,
  report only that SMAR returns no file (no cell or row differences). `smarWouldDrop` count
  ("SMAR's file would not contain these rows"; reasons in `summaryFile`). `compatFileReproducible` describes a
  `--smar-compat` run only: ok, or each reason code. ok means built with SMAR's exact rows, formatting and
  known bugs from the pages fetched; never call it byte-identical or an exact match (Google's data changes
  between fetches, so a SMAR run at another time can differ). Charts with `smarChartWouldHttp500` true: "smar-tool.org
  returns no file for this chart: `smarChartHttp500Apps.count` apps break it" (that count, never a list length).
  When present: `smarSearchWouldHttp500`, `appIdQuery`, `smarSiteTerm`, `countryVerified` false ("not yet
  verified for this country"). Healed paths: `pathOverrides`, `labelOverrides`.
- Reviews: per app from `apps`: count, fetched, moreAvailable, smarPadRows, smarDroppedRows, msQuirkRows; the
  file's date range `oldestReview` to `newestReview` and `newestReviewDaysOld` (days from the newest review Google
  served to the end of the run; say it when over 7); never state a review date range from anything else. When
  present: `legacyScore0Rows`, `blankedColumns` and `notes` (a damaged rows file was fetched again). An app
  with no ratings or reviews gives a plain STOP: relay it, do not heal.
- Say: "Values are read from Google Play and cross-checked on the same page; counts are live, so compare
  only with a SMAR run from the same hour." If asked why SMAR has other rows, quote `references/smar_schema.md`.

## Browser mode (Claude in Chrome, only when you have no shell; there is no `--until-done` here)
1. Navigate this tab to `https://play.google.com/store/search?q=<TERM, URL-encoded>&c=apps&hl=en&gl=<CC>`
   (charts, ids, reviews: `https://play.google.com/store/apps?hl=en&gl=<CC>`).
2. If `typeof SMAR_RUN === 'undefined'`, paste the full text of ONE file, `scripts/min/metadata.bundle.min.js`,
   verbatim as the code of one JavaScript call. Run it directly: never wrap it in `eval`, `new Function` or a
   script tag (Play pages block evaluating strings). It returns `SMAR_RUN ready`.
3. `await SMAR_RUN.verify('99bf960b2d329cd7c553b0ec8adc68a1fb8f1c9c9ccc62d3257a90650b52d969')` must return `ok:true`. Otherwise reload the tab and redo
   steps 2-3; after 2 failures stop and suggest shell mode.
4. App names: `await SMAR_RUN.lookup('<app name>')`, same rule as step 2. Start once:
   `await SMAR_RUN.start({mode:'search', term:'<TERM>', country:'<CC>'})`; charts `{mode:'chart', category:'<CATEGORY>',
   collection:'<COLLECTION>', country:'<CC>'}`; ids `{mode:'ids', ids:['<id1>','<id2>'], country:'<CC>'}`. Add
   `compat:true` for SMAR's exact file, `similar:false` for primary results only. It returns `remaining:1`
   until the first step. Thrown `CONFLICT`: another unfinished or undownloaded run is stored; tell the user,
   and only with their OK start again with `force:true`. Thrown `WRONG_ORIGIN`: go back to browser step 1.
5. Repeat `await SMAR_RUN.step(15)` until it returns `remaining:0`. `busy`: wait 5-10 s, then step again.
   `superseded`: step again. `fatal`: follow its `NEXT`. Page reloaded (`SMAR_RUN` undefined): redo
   browser steps 2-4 with the identical start options; the run resumes.
6. `SMAR_RUN.report()` (in browser mode this object is the summary), then steps 4 and 6 using the `await SMAR_RUN...` calls printed in `NEXT`. Heal: run
   each `await SMAR_RUN.heal('<field>')`; if every result is USE, call start once with the identical options
   plus `force:true` and `paths` = the run's `pathOverrides` plus `{<overrideKey>: <path>}` of each USE (label
   USE: `labels` with `{<overrideKey>: [<label>]}`), then step until done. Any STOP result: as shell step 5 item 4.
7. Ask the user, then `SMAR_RUN.download('<file>.csv')` and `SMAR_RUN.downloadRelog('<file>_relog.txt')`.
   When `READY_TO_DELIVER` is false, only with the user's OK: `SMAR_RUN.download('<file>.csv', {deliverAnyway:true})`;
   its `deliveredAnyway` names the blanked columns, as `deliverAnywayBlanked` above.

Reviews in the browser: paste two files as in browser step 2, one JavaScript call each: `scripts/min/metadata.bundle.min.js`
(skip it if `SMAR_RUN` is already defined), then `scripts/min/reviews.bundle.min.js` (returns `SMAR_REVIEWS ready`).
Check `await SMAR.verify('c40c8f40fa19a6f7ad9d53b9662ba2597a8061e7514bae562919649e24d0c284')` (not `ok`: reload the tab, paste both again), then `await SMAR_REVIEWS.start({appId:'<appId>', country:'<CC>'})`
(several apps: `{ids:['<id1>','<id2>'], bulk:true, country:'<CC>'}`; add `compat:true` for SMAR's file).
Repeat `await SMAR_REVIEWS.step(10)` until `done:true`, read `await SMAR_REVIEWS.status()` as in step 4,
ask the user, then `await SMAR_REVIEWS.download('<file>.csv')`.
