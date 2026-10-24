# Stress-test fixes: smar-playstore-agent 3.1.0, smar-appstore-agent 2.1.0 (2026-10-05)

A stress test on 2026-10-03/04 ran six tracks (messy requests, failure injection, scale, weird inputs, Play
countries, independent truth) and confirmed 45 issues (7 high, 19 medium, 19 low). All 45 are fixed and re-checked.
A six-way regression on the fixed branch then found 38 smaller issues (6 medium, 32 low, some duplicates); a fix
loop with an independent recheck after each round closed them. A few cases that no check can tell apart from real
data are written down as known limits instead (see each skill's `references/`). Evidence:
`eval/stress-2026-10-03/RESULTS.md` and `eval/stress-2026-10-03/fixes/FINAL_REPORT.md`.

## Empty review feeds (App Store)
- Apple's reviews feed often answers with empty pages. That is now a failed fetch, never "no reviews": empty
  pages are re-read (cache-busted), apps left short are listed in `partialApps` and the run is REFETCH, never READY
  with 0 rows. An app is said to have no written reviews only when it has no ratings or Apple's second review source
  (MZ) lists none; when that cannot be told, the STOP says so.
- Bulk reviews run apps in parallel, so empty-page runs take about 40 s per app instead of 2.4 min.
- `--deliver-anyway` text says exactly which apps and pages are short. A later `--resume` that withdraws a delivered
  file says so and prints the command to write it again.
- The MZ second source gives up after two failures instead of stalling the run.
- Unhealed pages count as incomplete in `--smar-compat` too; incomplete apps are no longer called "failed".

## Swapped and rescaled values
- Both skills check every cell against its own record and the other fields on the page: a value of the wrong kind
  (a genre id as a review count, a seller name as a genre, a date as a version, a rescaled size or price, a review
  id that is the author id, reply text that is the developer name) is blanked, and the swap partner is blanked
  with it, also after `--deliver-anyway`.
- Small id lists (1-3 apps) withhold cells they cannot tell from a moved path; a column that drifts on many rows
  stops the run (HEAL / FIX_ANCHOR), in `--smar-compat` too.
- heal.js no longer accepts a path that another field already uses.
- Play keeps real versions that happen to equal another number on the page (a price, a 3-digit count).
- App Store: sizes under a rating-tier floor fail, a review version far above or below the app's fails, update
  dates in the future fail, chart apps missing from the batch lookup are looked up one by one instead of dropped.

## Review dates and time zone
- App Store default mode writes each review date with its own Pacific offset (Apple labels every date with today's
  offset, so PST reviews were an hour early); `--smar-compat` keeps Apple's label. Labels in another shape are named
  in `problems`, and an all-zero fraction (`.000`) is dropped so the file keeps Apple's format.
- Play reviews summary gives `oldestReview`, `newestReview` and `newestReviewDaysOld`; the model copies that range
  and never states one from anything else.

## Non-US prices (Play)
- In-app ranges and sale ("Was") prices are read in every storefront number form: separators, suffix currencies,
  decimal commas, Indian grouping, no-break spaces (ID, TR, CH, KR and 25 more surveyed storefronts were false drift before).
- A day-first "Updated on" over a US record is read as the same date, not as a VPN/proxy storefront.

## Scale and streamed CSV
- Play reviews stream the CSV instead of building one string: 2,006,432 rows finalize in 14 s at about 190 MB.
- Long terms and recipe file names are hashed or refused before any folder is made (no ENAMETOOLONG).
- Measured runtimes are in `setup_and_limits.md` (10,000 Play reviews 35-50 s; `--all` about 150-300 reviews/s),
  with what to tell the user before a run that needs more than 10 calls.

## Runner and summary polish
- Progress files are checked against their rows, done list and queue; a damaged or foreign file stops with a
  new-file step instead of resuming to a short READY. Temp files of every derived file are swept after a kill.
- `DELIVERED_ANYWAY:` replaces the old NEXT after a Play deliver-anyway; Play reviews `--max-seconds` holds during
  retry waits.
- `--smar-compat` summaries count only the delivered file's rows; no claim of byte identity with SMAR.
- Emoji, symbol and non-Latin terms are accepted; `c++` and `c#` get different file names; unknown App Store country
  codes are refused offline; `ids` rows say `app id list`; short charts and repeated search ids get a `note:`.
- Capped stdout summaries keep a per-app table and every incomplete app; progress lines move during the run.

## Team kit
- `verify_appstore.sh` and `verify.sh` fail loudly on setup problems and install pinned dependencies when the
  pinned SAR-backend commit has no lockfile (`SETUP_ONLY=1` checks setup only; `NOISE=0` skips SMAR's second run).
- `report.js` explains rows that follow from a different search list Google served, using the lists both sides
  fetched (the SMAR harness now records them); a real dropped row is still flagged.
- Folder names are hashed whenever the name cannot spell the request; `doc_sizes.js` checks every quoted bundle size.

## Docs rules
- Unsupported filters and formats (date ranges, stars, permissions, Excel) are refused or written as a labelled
  derived file by a script, never computed by the model.
- After a STOP the model offers only the skill's own options and never works around the scripts (no curl, no other
  scraper, no reading store responses). No pipes on the runner. App Store `--all` is offered only where it helps.

---

# smar-playstore-agent — v1 → v2 changelog

**v1** (original) · **v2** (revision) · compared with `diff -ru`

## Summary

v2 is a revision of v1, not a new skill: same goal, same three functions, same SMAR output format.
In v1 the LLM read each Play Store page and wrote every value itself; in v2 the LLM runs a deterministic extractor (`scripts/extract_play.js`) that reads Play's embedded `AF_initDataCallback` JSON, cross-checks each field against a second source on the page, and self-heals when Google changes its layout.
The three prompts in `prompts/` are unchanged, so the same copy-paste prompts drive both versions.

## Files

| File | Status | Lines (v1 → v2) |
|---|---|---|
| `SKILL.md` | Rewritten | 81 → 104 |
| `references/smar_schema.md` | Rewritten | 39 → 48 |
| `references/setup_and_limits.md` | Edited (reviews section kept verbatim) | 53 → 32 |
| `prompts/keyword_search.md` | Unchanged | 7 → 7 |
| `prompts/top_charts.md` | Unchanged | 8 → 8 |
| `prompts/bulk_reviews.md` | Unchanged | 7 → 7 |
| `scripts/extract_play.js` | New | — → 191 |
| `scripts/run_play.js` | New | — → 57 |
| `scripts/heal.js` | New | — → 38 |
| `scripts/browser_driver.js` | New | — → 55 |
| **Total** | | **195 → 547** |

## Results (scored against SMAR's real scraper)

| Trial | Matches scraper | Wrong values | Blanks where scraper had a value |
|---|---|---|---|
| v1, 9/25 browser run | 75% | 22 | 120 |
| v1, "fitness tracking" | 76% | 36 | 101 |
| v1, "meditation" | 74% | 53 | 115 |
| v2, "fitness tracking" | 100% | 0 | 0 |
| v2, "meditation" | 100% | 0 | 0 |
| v2, simulated Play update (4 corrupted paths) | 100% | 0 | 0 |
| v2, full run with similar apps (208 rows) | 96% | 4 | 0 |

Most of the full-run gap is not an extraction error. It comes from three things:
- Which apps Google's "related to <title>" search returned between the two runs (7 of the scraper's 190 were missing from ours).
- Live numbers (ratings, installs) that changed between the two runs.
- SMAR's own quote double-escaping bug.

---

## Changed sentences — `SKILL.md`

Format: **v1** (verbatim) → **v2** → *why* (the failure we measured).

**1. Who writes the values**
> v1: "This skill lets a browser-controlling agent reproduce three functions of the SMAR tool (smar-tool.org) on the **U.S. Google Play Store**, returning data in SMAR's exact schema"

v2: "You are the *operator and repair technician* of a deterministic extractor — **not** the extractor."
*Why:* when the LLM wrote the values, only 74–76% of cells matched the scraper.

**2. New rule: never type a value (no v1 equivalent)**
> v1: "then scrape each app's detail page into the 32-field schema."

v2: "**Never type a data value.** Every cell in the CSV must be copied by `scripts/extract_play.js` from the page's embedded data."
*Why:* v1 wrote `approximateInstalls` as the bucket "5M+" instead of SMAR's exact `maxInstalls` integer.

**3. Field coverage**
> v1: "**Field coverage is partial.** ~23 of 32 app fields and 9 of 10 review fields are obtainable from the web UI; the rest exist only in Google's backend (see the schema file for exactly which are always blank)."

v2: "**All 32 SMAR columns are in it**, including the exact install count, review count, release date, version, "what's new", developer website/address and IAP price range."
*Why:* the "9 backend-only fields" claim was false. All 32 are in the page's embedded JSON.

**4. How many search results to collect**
> v1: "collect the ranked package IDs (Google caps at ~30)"

v2: "Keyword search = the first **20** ranked results (SMAR's `search()` default) … `--similar` adds a `"related to <title>"` search per primary result, deduped by appId"
*Why:* v1 collected ~30 results. SMAR takes the first 20, then adds similar apps from a "related to" search.

**5. scrapedFrom label**
> v1: "Set `scrapedFrom` = "Keyword search results"."

v2: "Primary rows are labelled `keyword search`." (similar apps: `similar app links`)
*Why:* the real SMAR export writes "keyword search", not "Keyword search results".

**6. Region parameter**
> v1: "The user's Chrome pointed at the U.S. Play Store (`gl=US&hl=en_US`)."

v2: "Region/language: `gl=US&hl=en`; `country` column = `US`."
*Why:* SMAR's `url` column uses `hl=en&gl=US` and its `country` column is `US`, not `us`.

**7. Pages stay out of the LLM's context (new)**
> v1: "Scrape in small batches (~3 apps) to avoid timeouts; accumulate rows in the page."

v2: "**Never pull page content into your context.** … The scripts fetch, parse, validate and store everything; you only read their short JSON summaries."
*Why:* copying rows through the chat used up the context window.

**8. Reporting**
> v1: "Report how many rows you collected and which fields came back empty."

v2: "rows collected · primary vs similar counts · apps that 404'd · any validation failures … Don't paste the CSV."
*Why:* copying rows through the chat used up the context window.

**9. Reproducibility**
> v1: "Re-running the same prompt yields the same columns and coverage, but the exact apps/rows, ordering, and numbers differ each run, because the agent is non-deterministic and Google's data is live."

v2: "Live data: numbers drift minute to minute; compare against SMAR runs from the same hour." (and a `run_play.js ids` mode for pinned re-runs)
*Why:* the extraction is now deterministic (two terms scored 100%), so the remaining variation comes from Google's live data.

**10. Reliability**
> v1: "**Reliability.** Expect manual steps, slowness, and occasional browser-agent disconnects."

v2: "re-run the same command with `--resume`" / "rows persist in `localStorage`, so a disconnect loses nothing"
*Why:* a run that stopped halfway had to start over. Progress is now saved to disk (shell mode) or `localStorage` (browser mode).

**11. Self-healing section (new)**
> v1: none.

v2: "**A validation failure means the page layout drifted — repair the path, never the value.**" (plus a four-step `heal.js` procedure)
*Why:* a fixed JSON path breaks when Google changes its layout. In the test with 4 corrupted paths, v2 still scored 100%.

**12. Requirements**
> v1: "Requires a browser agent such as Claude in Chrome."

v2: "Works with a shell (Claude Code) or a browser agent (Claude in Chrome)."
*Why:* in shell mode, fetched pages never reach the model's context.

**13. Removed from SKILL.md** (no measured failure; these instructions moved elsewhere)
- The top-charts category mapping ("Board games → `GAME_BOARD`, …"). The runner now takes the category ID directly.
- The bulk-reviews steps. The method is still in `setup_and_limits.md`, and the 100k-review rule is still in `smar_schema.md`.
- "The web UI surfaces roughly a few hundred reviews and ~45 chart apps". The reviews cap is still listed in `setup_and_limits.md`.

---

## Changed sentences — `references/smar_schema.md`

| # | v1 (verbatim) | v2 | Why |
|---|---|---|---|
| 1 | `appName, appID, url, icon, developer, developerID, currency, …, genreID, …` | `appName,appId,url,icon,developer,currency,…,androidMinVersion,developerId,…,genreId,…` | v1's header didn't match the real SMAR export: `appID`/`appId`, `genreID`/`genreId`, and `developerID` in the wrong position |
| 2 | "Empty when unavailable — do not drop columns." | "Missing values are the literal string `undefined`" | SMAR writes the string `undefined`, not an empty cell |
| 3 | "**Reliably obtainable from the web UI (23):** …" | removed; replaced by a table giving each column's JSON source | All 32 fields are in the embedded JSON |
| 4 | "**Almost always blank (9) — not rendered on the public page (SMAR gets these from backend):** …" | removed | The claim was false. These fields are in the page JSON |
| 5 | "`scrapedFrom` — set to the source: e.g. `Keyword search results`, or `Top free (<Category>)`." | "`keyword search` / `similar app links`" | Didn't match the label SMAR writes |
| 6 | "`country` — `us`." | "`US`" | SMAR writes `US` |
| 7 | "`downloadable`, `inAppPurchases`, `inAppAdvertisements` — booleans (TRUE/FALSE)." | "lowercase `true`/`false`" | SMAR writes lowercase `true`/`false` |
| 8 | "`dateScraped` — ISO date of the run." | "JS `new Date().toString()`" | Didn't match SMAR's date format |
| 9 | "`avgRating` / `totalRatings` — from JSON-LD `aggregateRating`" | "score … raw float (no rounding)"; JSON-LD is now used only to cross-check | A second, independent source is what catches layout drift |
| 10 | (none; v1 filled installs from the "… Downloads" bucket) | "approximateInstalls ← **maxInstalls**, **exact integer** … never `5M+`" | v1 wrote "5M+" |
| 11 | (none; v1 read `totalReviews` from the "… reviews" text) | "totalRatings / totalReviews ← ratings / reviews, integers (reviews ≤ ratings)" | v1 wrote the rounded rating count ("686K") where the true review count was 29,760 |
| 12 | (none; v1 used the full description) | "description ← **summary** (short description, not the long one)" | SMAR exports the short summary |
| 13 | (none) | "privacyPolicyURL … never `policies.google.com`/`myactivity.google.com`" | v1 put Google's footer link on every row |
| 14 | (none) | New "Known SMAR-scraper quirks" list (`developerAddress` always `undefined`; apps with a short detail array (no `[118]` categories slot) dropped; rate-limited requests dropped) | Explains differences that are bugs in SMAR's scraper, so they aren't counted as v2 errors. (v2's text blamed "too few ratings"; the cause was corrected in v3, see below) |

The review schema (10 columns, no reviewer names, <100k-review rule) keeps the same content in fewer lines.

---

## Changed sentences — `references/setup_and_limits.md`

**Setup**

| v1 (verbatim) | v2 | Why |
|---|---|---|
| "append `?gl=US&hl=en_US` (or `&gl=US&hl=en_US`)." | "All URLs force `hl=en&gl=US`." | Matches the URL format SMAR writes |
| "Use a browser agent (validated with **Claude in Chrome**)." | "Shell mode: Node 18+ … Browser mode: … inject the two scripts." | Shell mode keeps page content out of the model's context |

**App-metadata extraction.** v1's whole section is replaced by: "Handled entirely by `scripts/extract_play.js` — do not re-implement it with DOM text / JSON-LD scraping". Each v1 instruction and the failure it caused:

| v1 fragment (verbatim) | Why it was removed |
|---|---|
| "install bucket ("... Downloads")" | Gave "5M+" instead of the exact `maxInstalls` integer |
| "review count ("... reviews")" | Gave the rounded rating count ("686K") instead of the review count (29,760) |
| "privacy policy link" | The selector matched the first "Privacy Policy" link: Google's footer, on every row |
| "In-app purchases / Contains ads flags" | `inAppPurchases` was wrong on 5 of 23 apps |
| "the full description (`[data-g-id="description"]`)" | SMAR's `description` is the short summary |
| "navigate to its detail page, wait ~2s, then run a script in the page" | Now a same-origin `fetch` with no page navigation, and nothing is read into the context |
| "Process in small batches (≈3 apps per batch)" | Now `SMAR_RUN.step(15)` or the shell runner, both resumable |

**Reviews extraction:** unchanged (verbatim).

**Delivery**

| v1 (verbatim) | v2 | Why |
|---|---|---|
| "avoids corrupting large payloads by transcribing them" | "Never transcribe rows through the chat — that is where values get corrupted and context runs out." | Copying rows through the chat used up the context window |

**Limits**

| v1 (verbatim) | v2 | Why |
|---|---|---|
| "**Field coverage:** 9 app fields + `versionWhenReviewed` are backend-only and stay blank." | removed | False: all 32 app fields are in the embedded JSON |
| "**No "similar apps" expansion** (SMAR follows similar-app links past the 30-result cap)" | Implemented (`--similar`); only "Permissions columns not implemented." remains | SMAR uses 20 results plus the "related to" expansion |
| "**Reproducibility:** … the exact apps, order, and numbers differ every run (agent is non-deterministic; …)" | "pin a run with `run_play.js ids <comma list>` for exact re-collection" | Extraction is deterministic now; only the live data varies |
| "**Scale:** web UI gives ~a few hundred reviews and ~45 chart apps …" | "Reviews are capped by what the web UI's infinite scroll will load (hundreds, not SMAR's 10k)." | The chart-app cap no longer applies to the fetch runner; the reviews cap still does |
| "**Reliability:** many manual steps, slow, occasional browser-agent disconnects" | removed | Runs are now scripted and resumable |
| "Pin runs to a fixed list of package IDs and a fixed sort order rather than re-searching." | Implemented as `run_play.js ids` | — |

---

## New files

**`scripts/extract_play.js`**: the extractor.
- Finds the app's record in the page's embedded `AF_initDataCallback` JSON (matched by content, not by its `ds:N` key) and reads each field by path.
- Checks each field against a second source on the page: JSON-LD, the visible Privacy Policy and support-email links, and the IAP and ads labels.
- Writes the result in SMAR's exact CSV format. Runs in both Node and the browser.

**`scripts/run_play.js`**: runner for shell mode.
- Modes: `search` (with optional `--similar`), `chart`, and `ids`.
- Writes progress to `<out>.progress.json` so a stopped run can continue with `--resume`.
- Prints only a short JSON summary: rows, 404s, drift report, and `READY_TO_DELIVER`.

**`scripts/heal.js`**: self-healing helper.
- For a field that fails validation, it prints candidate JSON paths found by anchoring on a known value (JSON-LD, a visible link, or a neighboring field).
- The agent chooses a path and passes it to the runner with `--paths`. It never types a value.

**`scripts/browser_driver.js`**: driver for browser mode (Claude in Chrome), exposing `SMAR_RUN.start/step/report/download`.
- Fetches pages from the same origin with no navigation, and keeps rows in `localStorage` so they survive a disconnect.
- Each call returns only a short status object.

---
---

# smar-playstore-agent — v2 → v3 changelog

**v2** (HEAD `5cfff54`) · **v3** (this revision) · plan: `eval/v3/PLAN.md` · evidence: `eval/probes/` (Workflow A, 104 verified findings)

## Summary

v3 keeps v2's design (the LLM runs deterministic scripts; it never writes a value) and fixes what Workflow A found wrong when the output was compared byte for byte with SMAR's real scraper (SAR-backend with google-play-scraper 9.2.0).
- One shared engine: everything both runners need (search parsing, cross-checks, heal, CSV writing, SMAR predicates, storefront and error-page guards, the run loop) lives in `scripts/extract_play.js`. `run_play.js`, `browser_driver.js` and `heal.js` are thin wrappers, so shell and browser output is the same bytes.
- Two output modes. The default writes only true page values. `--smar-compat` reproduces SMAR's file: its row set, its bugs, its header order and its BOM.
- New modes: top charts through Google's own chart request (`chart_fetch.js`), bulk reviews (`reviews_play.js`), `lookup`, `rerun`, `refetch`, `--country`.
- Every summary now ends in one `NEXT` instruction, and `SKILL.md` is a short checklist that a 30B local model can follow.

## Policy (owner decisions D1–D10)

| # | Decision | Where it shows |
|---|---|---|
| D1 | Default = page truth; `--smar-compat` = SMAR's bytes (row drops, `developerAddress` `undefined`, double-escaped quotes, data-dependent header, BOM). Default still reports what SMAR would drop | `smarWouldDrop`, `compatExact` in every summary; `references/smar_schema.md` |
| D2 | Keyword search expands like SMAR by default: 20 primary results plus one "related to <title>" search per primary card (hero card and failed apps included); `--primary-only` opts out | `run_play.js search`; `bySource`; `primaryOnly` note |
| D3 | A cell that fails a hard cross-check against an independent page anchor is written `undefined` and listed; a missing anchor is reported, never a silent pass; drift makes the run not ready | `quarantinedCells`, `unverified`, `validationFailures`, `READY_TO_DELIVER`, `.NOT_READY.csv` |
| D4 | One shared implementation in `extract_play.js`; thin runners; targeted (not wholesale) browser driver changes | run engine `newState/seed/advance/outputs/summarize` |
| D5 | Top charts via the `vyAe2` request that gps `list()` sends (all three collections, 30-column layout); reviews via the `UsvDTd` request (11 columns), incremental and resumable | `chart_fetch.js`, `reviews_play.js` |
| D6 | `--country XX` (default US) in every URL, the `country` column, chart/review requests and the storefront guard; `hl=en` always | `run.country`, `countryVerified` |
| D7 | Error pages, `/sorry`, consent, "not available", removed apps and HTTP-200 error pages never produce rows; zero results never produce READY true | `emptyReason`, `wrongStorefront`, exit 1 + STOP |
| D8 | `SKILL.md` = a short deterministic checklist, one command per step, absolute paths, exit codes, `--max-seconds` loop; App Store requests are declined | `SKILL.md` |
| D9 | Progress written atomically (tmp + rename) under a lock file; concurrent resumes exit 4 | `fsutil.js`, `OUT.lock` |
| D10 | No default masks missing data: `VARY` only from the page's own empty marker, price and downloadable never defaulted | `derivedUnconfirmed`; `undefined` cells |

## Files

| File | Status | Lines (v2 → v3) |
|---|---|---|
| `SKILL.md` | Rewritten as a checklist | 104 → 152 |
| `references/smar_schema.md` | Rewritten | 48 → 205 |
| `references/setup_and_limits.md` | Rewritten (review scrolling method removed) | 32 → 76 |
| `references/top_charts.md` | New | — → 73 |
| `prompts/*.md` | Unchanged (the top-charts prompt's "top paid / top grossing" option now works) | 22 → 22 |
| `scripts/extract_play.js` | Rewritten: shared engine | 191 → 1329 |
| `scripts/run_play.js` | Rewritten: thin CLI over the engine | 57 → 370 |
| `scripts/heal.js` | Rewritten: thin CLI over `healField` | 38 → 231 |
| `scripts/browser_driver.js` | Targeted changes (same `SMAR_RUN` members, new ones added) | 55 → 143 |
| `scripts/chart_fetch.js` | New | — → 115 |
| `scripts/reviews_play.js` | New | — → 631 |
| `scripts/fsutil.js` | New (atomic writes and lock; installed at the Gate) | — → 118 |
| `scripts/fingerprint.js` | New (browser injection hashes; installed at the Gate) | — → 59 |

## CLI changes

- `search` now runs SMAR's similar-app expansion by default; `--primary-only` opts out (summary says "not a SMAR deliverable"); `--similar` is a no-op.
- A package id as the search term (e.g. `com.hevy`) gives SMAR's one-row answer (`appIdQuery`).
- New flags: `--smar-compat`, `--country XX`, `--max-seconds N`, `--deliver-anyway` (with `--resume`, after the user agrees), `--labels F`; chart `--collection TOP_FREE|TOP_PAID|GROSSING` (required) and `--num N`; ids `--source` and `--layout chart`.
- New modes: `lookup "<app name>"` (the script decides whether a name matches uniquely), `rerun <previous.csv>` (re-collects the exact app list of any SMAR or skill CSV), `refetch <ids>` (re-downloads apps whose cells failed a check), `reviews` (passes through to `reviews_play.js`).
- `reviews_play.js <appId|id1,id2> OUT [--bulk] [--from-results-table] [--all|--limit N] [--smar-compat] [--country XX]`; `--true-ms`, `--smar-pad` and `--bom` are deprecated and map onto the default / `--smar-compat`.
- `heal.js <field> --pages <OUT>.pages` prints one `USE` or `STOP` decision per field and, for USE, the complete override file to save. The agent never picks a path.
- Exit codes for every runner: `0` finished, `1` fatal (read `NEXT`), `2` usage, `3` incomplete (repeat with `--resume`), `4` locked, `5` crash. stdout is always exactly one JSON summary.
- Files: `OUT.csv` only when `READY_TO_DELIVER` is true, otherwise `<OUT>.NOT_READY.csv`; always `<OUT>_relog.txt` and `<OUT>.summary.json`; no CSV at all for zero rows.

## Changed sentences — `SKILL.md`

Format: **v2** (verbatim) → **v3** → *why* (finding).

1. > v2: "`node run_play.js search "<term>" smar_play_<term>_us.csv            # primary results only`"

   v3: the default search runs SMAR's "related to <title>" expansion; "Add `--primary-only` (search) only if the user asks for no similar apps; SMAR always adds them."
   *Why:* SMAR always expands; v2's default delivered 20 of ~200 rows (agent-behavior/similar-default-contradicts-smar, search-parity/default-omits-similar).

2. > v2: "`cd <skill>/scripts`"

   v3: "SKILL = the absolute path of the folder that holds this SKILL.md", and every command is `node <SKILL>/scripts/...` with an absolute OUT path.
   *Why:* v2's commands and file paths only worked from one folder (agent-behavior/cwd-path-inconsistency).

3. > v2: "If it stops (network, context compaction, you were interrupted) re-run the same command with `--resume`"

   v3: every command carries `--max-seconds 100`; exit `3` means "run the printed `resumeWith` command", and all six exit codes are defined.
   *Why:* full runs took longer than a 2-minute tool timeout (agent-behavior/no-runtime-timeout-guidance).

4. > v2: "Pick the candidate whose value is right for that field."

   v3: "Never choose a JSON path or label yourself; copy one only from a heal line with `"decision":"USE"`."
   *Why:* agents chose paths by eye (agent-behavior/heal-candidate-judgment, drift-robustness/heal-js-anchor-defects).

5. > v2: "Write `{"<field>": [path...]}` to `scripts/paths.override.json`"

   v3: heal prints `save as <OUT_DIR>/paths.override.json ...: {...}`, the whole file to write; the healed run goes into a NEW output file.
   *Why:* hand-assembled override files used wrong field names (agent-behavior/heal-name-mismatch-blob-dump).

6. > v2: "A failure on **one or two** apps (not drift) is usually real missing data (e.g. an app with too few ratings has no score). Leave those cells `undefined`"

   v3: the script writes a failed cell as `undefined` itself, lists it in `quarantinedCells`, and `NEXT`/`refetchOnce` give one `refetch`.
   *Why:* v2 kept the failing value in the CSV, and unrated apps never failed (agent-behavior/one-app-failure-guidance-wrong).

7. > v2: "Don't ship a CSV that has `likelyLayoutDrift: true` on any field."

   v3: when `READY_TO_DELIVER` is false the CSV exists only as `<OUT>.NOT_READY.csv`; the real name needs `--resume --deliver-anyway` after the user agrees.
   *Why:* D3; the rule depended on the agent reading nested fields.

8. > v2: "Inject `scripts/extract_play.js`, then `scripts/browser_driver.js`, with the JavaScript tool."

   v3: paste `extract_play.js`, `chart_fetch.js`, `browser_driver.js`, then `await SMAR_RUN.verify('<hash>')` must return `ok:true`.
   *Why:* nothing checked that a model retyped the scripts faithfully (browser-parity/injection-fidelity-unchecked).

9. > v2: "`await SMAR_RUN.start({mode:'search', term:'<term>', similar:false})`"

   v3: `similar` defaults on; calling `start` again with the same options resumes; a different unfinished run makes `start` throw `CONFLICT` unless `force:true`.
   *Why:* a second `start` erased saved rows (browser-parity/start-wipes-unfinished-run, agent-behavior/browser-mode-traps).

10. > v2: "`node run_play.js chart GAME_BOARD smar_play_board_games_topfree_us.csv`"

    v3: `chart <CATEGORY> OUT --collection TOP_FREE|TOP_PAID|GROSSING`, from Google's ranked chart request; category ids in `references/top_charts.md`.
    *Why:* v2 scraped category-page shelves (12-25% overlap with the chart) and ignored the collection (top-charts/chart-scrapes-category-shelves, chart-ignores-collection).

11. > v2: "Reviews: see `references/setup_and_limits.md` (still browser-scroll based; `versionWhenReviewed` isn't shown on the web)."

    v3: `reviews_play.js` reads Google's review request: SMAR's newest min(count, 10000), `--all` for everything, `versionWhenReviewed` filled.
    *Why:* no review extractor existed, and the version is in the review record (bulk-reviews/no-review-extractor, version-when-reviewed-claimed-unavailable).

12. > v2: "You reproduce SMAR (smar-tool.org) on the **U.S. Google Play Store**."

    v3: `CC` = the store country (default US), passed as `--country`; App Store requests are declined.
    *Why:* D6 and D8.

13. New, no v2 equivalent: the TERM rules (quoted terms verbatim; drop a trailing generic "apps"; never correct spelling), `lookup` for app names, and a report built only from summary keys.
    *Why:* "apps" added to a term changed 4-6 of the 20 results (agent-behavior/term-resolution-ambiguity); agents guessed package ids (CRITIC gap 6) and read scripts to improvise checks (agent-behavior/agents-read-scripts-and-improvise-checks).

## Changed sentences — `references/smar_schema.md`

| # | v2 (verbatim) | v3 | Why |
|---|---|---|---|
| 1 | "Apps with too few ratings (e.g. `app.raout`, `com.dashfit.app`) make `app()` throw and SMAR silently drops them" | SMAR drops apps whose gps `app()` throws; the main cause is a detail array without index 118 (categories); a `null` or `[]` slot is kept; not a ratings rule (ch.protonvpn.android, com.deezer.analytics, com.selfhealing.chakrasnumber1 are dropped) | 5 findings: field-accuracy/smar-drop-cause-misdocumented, search-parity/drop-reason-doc-wrong, format-fidelity/schema-doc-drop-cause, agent-behavior/unrated-drop-claim-imprecise, production-parity/drop-cause-doc-wrong |
| 2 | "SMAR fires all detail requests at once; rate-limited ones are silently dropped." | kept, narrowed: keyword search only, none seen in two production runs; a chart fails whole (HTTP 500) | production-parity/drop-cause-doc-wrong, top-charts/smar-chart-http500-extractcategories |
| 3 | "Every cell double-quoted" | every cell except a bare `dateScraped` | format-fidelity/datescraped-quoted, agent-behavior/schema-quoting-quirks-undocumented |
| 4 | "`dateScraped` … JS `new Date().toString()`" | UTC `Date#toString()`, stamped when the CSV is written | production-parity/datescraped-timezone-semantics, format-fidelity/datescraped-locale-and-download-time |
| 5 | "Review metadata — 10 columns" | 11 columns (`country` before `dateScraped`); bulk prepends `appId` | bulk-reviews/review-schema-missing-country |
| 6 | "Only run for apps with < 100,000 reviews (SMAR rule)." | that rule belongs to SMAR's results-table button only; the count is `ds:5[1][2][51][3][1]`, not the visible "N reviews" | bulk-reviews/eligibility-count-ambiguous |
| 7 | "androidMinVersion, currentAppVersion … often `VARY`" | `VARY` only from the page's own empty marker, reported as `derivedUnconfirmed`; a missing slot is `undefined` | drift-robustness/defaults-mask-missing-values, field-accuracy/jspb-sparse-tail-vary |
| 8 | (none) | the 30-column chart layout, the appId-query header, the four compat header orders, BOM rules, the top-result card drop, double cleaning, unencoded website query, zero results, gps `search()` throws, review quirks, `compatExact` codes | top-charts/chart-csv-layout, format-fidelity/appid-query-header-order, search-parity/hero-card-dropped, format-fidelity/double-escaped-quotes, search-parity/frontend-unencoded-query, search-parity/zero-results, bulk-reviews cluster |

## Changed sentences — `references/setup_and_limits.md`

| v2 (verbatim) | v3 | Why |
|---|---|---|
| "**Pagination requires REAL mouse-wheel scrolling** inside the dialog" (and the rest of the review scrolling method) | removed; reviews come only from `reviews_play.js` | bulk-reviews/no-review-extractor |
| "Reviews are capped by what the web UI's infinite scroll will load (hundreds, not SMAR's 10k)." | "the default is SMAR's set, the newest min(review count, 10000); `--all` fetches everything Google returns" | bulk-reviews/smar-exports-subset |
| "All URLs force `hl=en&gl=US`." | `hl=en` always, `gl=<CC>` | D6 |
| "Reproducibility: pin a run with `run_play.js ids <comma list>`" | `rerun <previous.csv>` reads ids, order, labels and country from any SMAR or skill CSV | format-fidelity/ids-mode-single-source |
| (none) | files a run writes, Excel import note, runtime table, honest limits (live counters, ~5% related-search variation, unverified countries, anonymous requests) | production-parity/download-bom-and-relog, format-fidelity/excel-open-hazards-no-bom, the 9 nondeterminism notes |

## Results (offline regression suite, `node eval/regress/run.js`)

v2 column: `eval/regress/baseline/v2_report.json` (full run, 2026-10-01). v3 column: the Gate's full run (2026-10-01, 15,461 R4 cases, 596 s; all 14 suites pass).

| Suite | Metric | v2 | v3 | Pass bar |
|---|---|---|---|---|
| R0 unchanged-correct | unexplained cell changes | 0 | 0 | 0 |
| R1 same-bytes agreement with gps | other_diff · drop-predicate agreement | 4,365 · 0% | 0 · 100% | 0 · 100% |
| R2 provenance | traceable non-`undefined` cells | 98.7% (3,473 not traceable) | 100% (0 not traceable) | 100% |
| R3 validator false positives | hard errors on real pages · false NOT-READY | 59 · 0 of 168 runs | 0 · 0 of 168 runs | 0 · 0 |
| R4 perturbation matrix | silent wrong · unlisted wrong · silent blank | 8,010 · 408 · 68 | 0 · 0 · 0 | 0 · 0 · 0 |
| R4 heal | USE-correct rate · drill byte-identical | 0% · no | 97.3% (2,544 of 2,615; 0 USE-wrong) · yes | ≥80% · yes |
| R5 search parity | ids · throw parity | 96.3% · 98.3% | 100% · 100% | 100% · 100% |
| R6 chart parity | id order vs gps `list()` | no chart fetcher | 100% | 100% |
| R7 compat byte identity | identical replayable runs | 0 of 20 | 20 of 20 | 100% |
| R8 browser ≡ shell | identical · failed scenarios | yes · 8 | yes (13 of 13) · 0 | yes · 0 |
| R9 CSV format | violations | 4,064 | 0 (141 CSVs) | 0 |
| R10 reviews | compat identity | no review extractor | 100% | 100% |
| R11 persistence | corruption · lost rows | 1 · 1,050 | 0 · 0 | 0 · 0 |
| R12 errors, storefront, zero results | failed assertions | 59 | 0 | 0 |
| R13 docs/contract lint | lint_skill violations | 13 | 0 | 0 |

Gate notes (round 1):
- R4 false alarms: 0 on the holdout families (bar 781) and 0% per family. The JSON-LD-removal cases (c_page `removeJsonLd`, 1 case; c_combo `removeJsonLd+*`, 6 cases) are classified `CAUGHT_ANCHOR_DRIFT`, not `FALSE_ALARM`: D3 requires a run to block when an independent anchor is missing on most rows, and those runs block citing exactly that anchor (`unverified.jsonLd`, `NEXT: FIX_ANCHOR: jsonLd`). Every other READY-false case with unchanged cells still counts as a false alarm.
- R6: a cached vyAe2 answer with a null payload and RPC status `[3]` is an RPC error, not an empty chart; chart_fetch answers `ok:false` for it (`chart_rpc_drift`), and R6 now checks that separately.
- Browser injection size: `extract_play.js` is 132,966 bytes (budget 49,152) and the metadata set is 153,424 bytes (budget 69,632). Accepted: the injection is fingerprint-verified (fail closed), and shell mode is recommended, especially for the 30B model. `chart_fetch.js` was trimmed to 8,191 bytes (budget 8,192).
- Live smoke (2026-10-01, US, same minutes): `search "meditation"` gave 142 default rows (20 keyword + 122 similar; READY true, 0 quarantined); scored against the V6 `eval/gt_harness.js` run it was 0 wrong, 0 blank, 8 live-counter nondeterminism cells, and the 25 extra rows are exactly SMAR's documented drops (`smarWouldDrop`). `--smar-compat` gave 117 rows with SMAR's header; 116 equal the ground-truth rows apart from the 8 live counters, and one extra row is the last entry of a "related to" list (related-search nondeterminism). Chart GAME_BOARD TOP_FREE (20 ranks) and reviews (com.hevycoach.app) ran READY true.

Live acceptance (Claude and qwen3-coder:30b on search, charts, reviews, an app-name request, the drift drill and an App Store request) runs after the commit; see `eval/v3/PLAN.md` §5.

---

# smar-appstore-agent — v1 → v2 changelog (App Store skill v2)

**v1** (`baseline_v1_appstore/smar-appstore-agent`) · **v2** (this revision, `smar-appstore-agent/`) · plan:
`eval/appstore/PLAN.md` · evidence: `eval/appstore/workflow_result.json` (verified findings; ids in brackets),
`eval/appstore/probes/`, `eval/appstore/regress/`

## Summary

v2 puts the App Store skill on the Play v3 architecture: the LLM runs deterministic scripts and never reads or
writes a value.
- v1 had the LLM read Apple's JSON and type every cell, used the wrong search endpoint (the public iTunes Search
  API instead of SMAR's MZStore search) and had no similar-app expansion, so a keyword search returned 190 rows
  against SMAR's 698 (8.1% strict over SMAR's rows) [v1-search-wrong-endpoint, v1-search-no-similar-expansion].
- v2 reproduces SMAR's three iOS pipelines step for step (SAR-backend ios-production `95783af`, app-store-scraper
  0.18.0): MZStore search plus the `customersAlsoBought` expansion, the legacy chart feed, the customer-reviews
  RSS. Every value is copied by script from the iTunes Lookup response or the review feed.
- Two renderings of one fetch: the default (SMAR's columns and rules without SMAR's transport losses and writer
  bugs) and `--smar-compat` (SMAR's bytes, quirks and the website's BOM).
- Cross-checks against independent Apple sources (the apps.apple.com page, the legacy store page, the MZStore
  lockups, the chart feed, the MZStore review list), a quarantine, drift detectors, and one `NEXT` instruction
  per run, as in Play v3.
- Built-in rate limits (18 lookups and 30 other requests a minute, shared across processes), a response
  journal, `--resume`, `--max-seconds` and a lock.
- `SKILL.md` is a short checklist a 30B local model can follow. The three prompts are unchanged.

## Policy (owner decisions A1–A12, `eval/appstore/PLAN.md` §1)

| # | Decision | Where it shows |
|---|---|---|
| A1 | Scripts copy every value, from the lookup JSON (apps) and the review RSS (reviews); the LLM never reads a response | `scripts/appstore_core.js`, SKILL.md hard rules |
| A2 | One fetch, two renderings: default and `--smar-compat`; transport-dependent losses (gzip similar pages, burst-failed lookups, empty review pages) reproduced in neither | `compatExact`, `transportRisk` |
| A3 | Hard cross-check failure at equal version → one cache-busted re-read → default writes `undefined` and lists the cell, compat keeps SMAR's value and lists it; counter or version differences are `cdn_age`, never corrected; anchor drift → `FIX_ANCHOR` (default only) | `quarantinedCells`, `unverifiedCells`, `drift` |
| A4 | One UMD engine with thin runners; a browser driver only if Gate B passes (it was not run: no browser mode in this release) | `appstore_core.js`, `run_appstore.js` |
| A5 | Rate limits built in; inside the campaign the skill defers to the campaign limiter | `net_apple.js` |
| A6 | `--country XX` upper case, as SMAR's website sends it; compat uses SMAR's storefront map with its US fallback | `run.storefront`, `countryVerified` |
| A7 | Default never writes a 0-row CSV (STOP); compat writes SMAR's file only where SMAR answers 200 | exit 1 + STOP; the 13-byte `"dateScraped"` file |
| A8 | SKILL.md is a Play-v3 checklist; Google Play requests are declined | SKILL.md step 0 |
| A9 | Atomic progress under a lock; every response journaled; `--resume` never re-fetches | `fsutil.js`, `OUT.pages/`, `OUT.lock` |
| A10 | `dateScraped` = `Date#toString()` in UTC at write time | every CSV |
| A11 | App names are resolved by script only (`lookup`), never `results[0]` blindly | `lookup` → `decision` USE / ASK |
| A12 | All campaign Apple traffic through the shared limiter; no smar-tool.org calls | `eval/appstore/lib/ratelimit.js` |

## Files

| File | Status | Lines (v1 → v2) |
|---|---|---|
| `SKILL.md` | Rewritten as a checklist | 92 → 124 |
| `references/smar_appstore_schema.md` | Rewritten: headers, per-column sources and cross-checks, byte rules, quirks Q1–Q25, `compatExact` codes | 68 → 198 |
| `references/setup_and_limits.md` | Rewritten: files, rate limits and durations, countries, eval-only flags, honest limits | 89 → 127 |
| `references/top_charts.md` | New, generated from `scripts/as_chart.js` (13 collections, 42 genre rows, liveness) | — → 110 |
| `prompts/*.md` | Unchanged (byte-identical) | 22 → 22 |
| `scripts/appstore_core.js` | New: the §6.1 API and run engine (UMD) | — → 759 |
| `scripts/run_appstore.js` | New: CLI `search | chart | reviews | ids | rerun | refetch | lookup` | — → 334 |
| `scripts/as_writer.js` | New: SMAR's jsonToCsv and cleanText, both renderings | — → 345 |
| `scripts/as_search.js` | New: MZStore search, bundle-id probe, similar pages, details | — → 601 |
| `scripts/as_chart.js` | New: legacy chart feed, collections and genres, SMAR's HTTP 500 rules | — → 526 |
| `scripts/as_reviews.js` | New: customer-reviews RSS, target, heal, de-dup, MZ cross-check | — → 514 |
| `scripts/as_checks.js` | New: cross-checks, calibration, quarantine, drift, `NEXT` | — → 934 |
| `scripts/net_apple.js` | New: Apple-only transport, limiter, backoff, journal and replay | — → 494 |
| `scripts/fsutil.js` | New: copied from smar-playstore-agent (atomic writes, lock) | — → 118 |

## CLI

```
node scripts/run_appstore.js search "<TERM>" OUT.csv [--primary-only] [--country XX] [--smar-compat] [--resume [--deliver-anyway]] [--max-seconds N]
node scripts/run_appstore.js chart <collection> <genreId|all> OUT.csv [--num N] [common flags]
node scripts/run_appstore.js reviews <bundleId|trackId>[,...] OUT.csv [--bulk] [--per-app] [--all] [common flags]
node scripts/run_appstore.js ids <id|bundleId[=keyword|=similar],...> OUT.csv [--source "keyword search"|"similar app links"] [--layout chart] [common flags]
node scripts/run_appstore.js rerun <previous.csv> OUT.csv [common flags]
node scripts/run_appstore.js refetch <id,...> OUT.csv
node scripts/run_appstore.js lookup "<app name>" [--country XX]
```
- stdout is always exactly one JSON summary of at most 4 KB (uncapped copy in `<OUT>.summary.json`).
- Exit codes as Play v3: `0` finished (read `READY_TO_DELIVER`), `1` stopped (read `NEXT`), `2` usage, `3`
  incomplete (repeat `resumeWith`), `4` locked, `5` crash.
- `NEXT` is one of `DELIVER`, `RESUME: <cmd>`, `REFETCH: <cmd>`, `FIX_ANCHOR: <source.field>`, `STOP: <sentence>`;
  `lookup` answers `USE: <bundleId>`, `ASK: ...` or `STOP: ...`.
- Files: `OUT.csv` only when ready, otherwise `<OUT>.NOT_READY.csv`; `<OUT>_relog.txt` (finished runs),
  `<OUT>.summary.json`, `OUT.progress.json`, `OUT.pages/` (journal), `OUT.lock`.
- Eval only (documented in `references/setup_and_limits.md`, never in SKILL.md): `--record DIR`, `--replay DIR`,
  `--emit-both`, `--sample K`. The planned `--tz` was not built: `dateScraped` is always UTC.

## Results

**v1 against SMAR** (live, paired; `eval/appstore/PLAN.md` §0, trials `eval/appstore/trial-v1-*`):

| Function | v1 rows vs SMAR | v1 strict (lenient) | v1 on the same bytes, its own mapping run verbatim |
|---|---|---|---|
| Keyword search "fitness tracking" | 190 vs 698 (76 shared, 622 missing, 114 extra) | 8.1% (10.2%) over SMAR's rows | 75.3% ("meditation" 74.5%) |
| Top free Health & Fitness | 50 vs 50 | 79.4% (96.8%) | 78.5% |
| Reviews, Medito | 500 vs 500 | 86.1% (100%) | 84.5% (441 of 450) |

The same-bytes column is re-measured offline by regression suite RA12
(`eval/appstore/regress/baseline/v1_baseline.json`: 75.2%, 74.4%, 78.3%, 84.5%, all within 0.2 points).

**v2 on the same bytes as SMAR** (offline regression suite `node eval/appstore/regress/run.js`; SMAR's own
controllers replayed over the recorded responses as the oracle; `dateScraped` normalised):

| Suite | Measure | v2 |
|---|---|---|
| RA1 writer | compat lines byte-identical to SMAR's jsonToCsv, every recorded lookup record (13,787) plus the cleanText edge cases | 100% |
| RA2 search | replayable runs byte-identical / SMAR-500 cases with no file | 16 of 16 / 1 of 1 |
| RA3 charts | replayable feeds byte-identical / SMAR-500 cases with no file | 18 of 18 / 24 of 24 |
| RA4 reviews | replayable runs byte-identical (duplicates, cap, zero ratings, healed page) | 16 of 16 |
| RA6 perturbations | silent wrong · unlisted wrong · silent blank (178 cases, both modes) | 1 · 3 · 0 (open, see below) |
| RA8 persistence | CSV after `kill -9` and `--resume` | byte-identical |
| RA11 docs lint | SKILL.md commands, flags, exit codes, `NEXT` tokens, summary keys, top_charts.md | 0 violations |

**v2 live smoke** (2026-10-01, US, through the campaign limiter; `eval/appstore/build_notes/core-runner.md`):
chart `topfreeapplications 6013` 50 rows, 8 requests, 13 s, DELIVER; reviews `co.fapulous.app` 21 rows, MZ
cross-check 21 of 21; `lookup` "Medito" and "Strong" resolved to the intended apps; search "habit tracker"
killed with `kill -9` after 70 s and resumed: 501 rows, 17 iTunes API and 110 other requests, DELIVER.

**Pending (Stage S4, `eval/appstore/PLAN.md` §11):** L1 paired CLI runs against `gt_ios.js` (search, charts,
reviews; compat strict and default classification) and L2 agent trials (Claude and qwen3-coder:30b) fill in a
v1-against-v2 table here: _search strict TBD, charts TBD, reviews TBD, turns TBD_.

## Changed sentences — `SKILL.md`

Format: **v1** (verbatim) → **v2** → *why* (finding).

1. > v1: "The App Store has **no scrapable web page** like Google Play."

   v2: the apps.apple.com page carries JSON-LD and server data; v2 reads it only to cross-check values
   ("Never a value source": `references/smar_appstore_schema.md` §2).
   *Why:* the page cross-checks 24 of the 31 lookup-derived columns, with 100% agreement on every hard check (calibration in `scripts/as_checks.js`) [FS-06].

2. > v1: "Apple exposes **public JSON/RSS endpoints** — the same mechanism SMAR uses: Keyword search → iTunes Search API"

   v2: search runs SMAR's MZStore search (first 50 ids of any kind) plus one legacy store page per primary for
   its `customersAlsoBoughtApps` list.
   *Why:* only about half of v1's primaries were SMAR's, 4 in the same position, and the similar apps are about
   90% of SMAR's rows [v1as-search-wrong-endpoint, v1as-no-similar-expansion].

3. > v1: "the agent can recover **essentially all** of SMAR's 33 App Store fields"

   v2: 34 search columns, 32 chart columns, 9 review columns (10 for bulk), listed in
   `references/smar_appstore_schema.md` §1.
   *Why:* no `id` column, wrong `appID`/`developerID` case, 2 extra chart columns [v1as-schema-header, v1as-overclaims].

4. > v1: "**Scale:** keyword search returns up to **200** results"

   v2: SMAR takes 50 primaries and adds their similar apps (about 700 rows for a common term).
   *Why:* the limit contradicted itself (50 vs 200) and SMAR's row set is not a limit [v1as-limit-contradiction].

5. > v1: "Skip `feed.entry[0]` (app info) on each page"

   v2: "Every `feed.entry` is a review; nothing is skipped."
   *Why:* in 2026 `entry[0]` is the newest review; the rule drops one review per page [FS-04, rev-05-v1-entry0,
   v1as-skip-entry0-drops-reviews].

6. > v1: "Set `scrapedFrom` = "Keyword search results"." and "Set `scrapedFrom` = "Top free (<Genre>)"."

   v2: `keyword search` / `similar app links` (search layout only); charts have no `scrapedFrom` column.
   *Why:* invented labels, also used for paid and grossing charts [v1as-scrapedfrom-labels].

7. > v1: "take each `entry["im:id"].label` in rank order"

   v2: the chart is read by script (`id.attributes['im:id']`), rank = feed order, one lookup for all ids.
   *Why:* `entry["im:id"]` does not exist in the feed [v1as-chart-id-path-missing].

8. > v1: "map the category name to its Apple genre ID (Health & Fitness 6013, Games 6014, ...)" (9 genres, 3 collections)

   v2: `references/top_charts.md`: 13 collections with liveness, 41 genres plus `all`, generated from SMAR's
   website lists.
   *Why:* no "No Category", 9 of 43 categories, 3 of 12 collections, an unbounded `limit` [v1as-chart-coverage].

9. > v1: "resolve its numeric `trackId` via the search endpoint (`results[0].trackId`)"

   v2: `run_appstore.js lookup "<app name>"` answers USE (unique title match, or a dominant first result) or ASK
   with up to 5 candidates.
   *Why:* `results[0]` has no uniqueness check (a second app is literally named "Medito"); the rule resolved 8 of
   10 names correctly and asked on 2, with 0 wrong [v1as-name-resolution-results0].

10. > v1: "If the browser blocks Apple's domain ... open the endpoint URL and paste the JSON."

    v2: shell only; the agent never reads a response ("Never read an Apple response ... into your context").
    *Why:* the fallbacks put 0.5–2 MB of JSON into the context and invited transcription [v1as-browser-context-blowup].

11. > v1: "**Coverage is high:** ~all 33 app fields and 8 of 9 review fields come straight from the endpoints."

    v2: all 9 review columns come from the RSS; app columns from one lookup; the report lists `undefinedCounts`,
    `quarantinedCells` and `unverifiedCells`.
    *Why:* overclaim [v1as-overclaims, FS-11].

12. > v1: "Report how many rows you collected."

    v2: step 5 copies the summary's rows, cells and differences from SMAR (`bySource`, `undefinedCounts`,
    `quarantinedCells`, `smarWouldDrop`, `transportRisk`, `compatExact`, ...).
    *Why:* no rate limit, resume, cross-check or READY gate; the report was only a count [v1as-no-ratelimit-resume-verify].

## Changed sentences — `references/smar_appstore_schema.md` and `references/setup_and_limits.md`

| v1 (verbatim) | v2 | Why |
|---|---|---|
| "`appID, appName, url, ...`" (header without `id`) | the three headers plus the bulk header, verbatim from SMAR | v1as-schema-header |
| "\| appID \| bundleId \|" | `appId` (SMAR's casing) | v1as-schema-header |
| "\| contentRating \| trackContentRating (fallback contentAdvisoryRating) \|" | `contentAdvisoryRating` only (legacy scale), never the page's 2025 scale | FS-05 |
| "\| scrapedFrom \| "Keyword search results" or "Top free (<Genre>)" etc. \|" | `keyword search` / `similar app links` | v1as-scrapedfrom-labels |
| "skip `entry[0]`, which is app info" | every entry is a review | rev-05-v1-entry0 |
| "`const j = a => Array.isArray(a) ? a.join(', ') : (a==null ? '' : String(a));`" | lists join with `,`; an absent key prints `undefined` | v1as-list-join-space, v1as-blank-vs-undefined |
| "`country:'us'`" | `US` (upper case, as SMAR's website sends it) | v1as-country-case, rev-06-v1-format |
| "`dateScraped:new Date().toISOString().slice(0,10)`" | unquoted UTC `Date#toString()`, the same on every row | v1as-datescraped-format, prod-tz-utc |
| (no cleanText) | SMAR's cleanText reproduced in compat; default strips real tags only | v1as-no-cleantext, cleantext-quirks |
| "`https://itunes.apple.com/search?term=<TERM>&country=US&entity=software&limit=<N up to 200>`" | used only by `lookup` (name → candidates), never for rows | v1as-search-wrong-endpoint |
| "Open the endpoint URL yourself and paste the JSON to the agent" | removed; scripts fetch and journal every response | v1as-browser-context-blowup |
| (none) | files a run writes, rate limits and durations, countries (US and GB verified), eval-only flags, honest limits (CDN-cached counters, ranking noise, endpoint retirement, 500-review cap, legacy age scale) | FS-02, FS-10, ios-search-parity, rev-08-apple-caps, FS-05 |
| (none) | quirks Q1–Q25 of SMAR's iOS pipeline, each with what default and compat do | `eval/appstore/PLAN.md` §8 |

## Open items at the time of writing

- RA5 calibration: 13 of about 180 simulated runs end NOT_READY on anchor-liveness drift for clusters of new
  apps and Apple's own apps (`eval/appstore/build_notes/eval.md`); `as_checks.js` owns the fix.
- RA6: one silent and three unlisted cases remain: a rank swap inside a `new*` chart (no second feed to compare
  with) and SMAR's own filter dropping non-software lookup results (counted, not named).
- Live runs outside the US, live `--per-app` bulk runs and a browser mode were not tested.
