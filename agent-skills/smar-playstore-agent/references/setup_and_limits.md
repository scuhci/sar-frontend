# Setup, delivery, runtime and limits (v3.1.0)

## Setup
- Shell mode: Node 18 or newer (it uses the built-in `fetch`). No npm install. Every script lives in
  `scripts/` and is run with an absolute path, from any folder.
- Browser mode: Claude in Chrome on a `https://play.google.com` tab. Paste the prebuilt bundle verbatim, as
  the code of one JavaScript call (never inside `eval` or `new Function`: Play pages enforce Trusted Types), and
  check its fingerprint (SKILL.md, browser steps 2-3):
  - metadata, charts and ids: ONE file, `scripts/min/metadata.bundle.min.js` (about 134 KB; extract_play.js,
    chart_fetch.js and browser_driver.js minified by `team/build_min.sh`);
  - reviews: that file, then `scripts/min/reviews.bundle.min.js` (about 36 KB; reviews_play.js minified).
  The bundles behave byte-identically to the sources (offline suites R8, R10 and R16 run both and compare every
  CSV); `scripts/min/fingerprints.json` names the sources they were built from, and `fingerprint.js --check`
  fails when a source changed since. Shell mode is recommended, especially for smaller models: same pages, same
  bytes, nothing to paste.
- Every request is anonymous (no cookies; the browser uses `credentials:'omit'`), so a signed-in Chrome
  profile does not change the results. URLs always carry `hl=en` and `gl=<CC>`.
- Politeness, the same in both modes: one request at a time, at least 250 ms between app pages and 500 ms
  between searches, a 20 s timeout, up to 5 tries with backoff (Retry-After honoured). A reviews shell call
  starts no app after its `--max-seconds` (or 540 s cap) and no retry wait that would end after it: it saves
  and exits 3 near the cap, and the resume retries that request (not counted as a failed attempt of the app;
  HTTP 429 keeps its full backoff). A Google "unusual
  traffic" (`/sorry`) or consent page stops the run at once with no retry: exit 1, `NEXT` is a STOP sentence,
  and the run can be resumed later with the same command plus `--resume`.

## Files a run writes (OUT = your `.csv` path)
| File | What |
|---|---|
| `OUT` | the CSV, only when `READY_TO_DELIVER` is true (or after `--resume --deliver-anyway`) |
| `<OUT without .csv>.NOT_READY.csv` | the CSV when it is not ready; never deliver it as final |
| `<OUT without .csv>_relog.txt` | reproducibility log: tool and version, UTC time, store, country, mode, term or category and collection, app ids, compat, path overrides; it states it was not produced by smar-tool.org |
| `<OUT without .csv>.summary.json` | the full summary (uncapped lists, pretty-printed JSON); stdout holds only a short line (`READY_TO_DELIVER`, `NEXT`, `csv`, counts, `summaryFile`; at most about 1.5 KB) |
| `OUT.progress.json` (reviews: `OUT.state.json`, `OUT.<appId>.rows.jsonl`) | saved progress for `--resume`; never edit |
| `OUT.pages/` | up to 10 app pages plus every page with a failed check, for `heal.js --pages` |
| `$SMAR_SAVE_HTML/<appId>.html.gz` | only when the env var `SMAR_SAVE_HTML` names a folder: every app page fetched, for auditing each cell |
| `OUT.lock` | held while a run writes OUT; a second run on the same OUT exits 4 |

The folder of OUT is created when it does not exist. Reviews (`reviews_play.js`) write the same set: `OUT` or `<OUT without .csv>.NOT_READY.csv`, `<OUT without
.csv>_relog.txt`, `<OUT without .csv>.summary.json`, and the progress files `OUT.state.json` and
`OUT.<appId>.rows.jsonl` (one per app; `OUT.<12 hex of the app id's sha1>.rows.jsonl` when the name would pass 255
bytes). Every file is written atomically (temp file, then rename); temp files a killed run left are removed by the
next run on that OUT. An OUT name over 200 bytes is refused (exit 2). A progress file that cannot be read gives exit
2 and a STOP: re-run into a NEW output file.

Leftovers and `--fresh`: a run never discards a progress file. The same request continues with `--resume`. When
the CSV, summary, relog or pages of an earlier run into OUT exist but its progress file is missing, the run is
refused (exit 2, STOP). Only when the user asks to start that run over, add `--fresh`: it discards that OUT's
files first (never with `--resume` or `--deliver-anyway`). `--resume --deliver-anyway` on an unfinished run is
refused (exit 3, `refused`, NEXT RESUME) and writes nothing.

Reviews flags beyond SKILL.md step 3: `--force` starts over when a progress file exists (the old progress is
discarded) and also skips the `--from-results-table` eligibility check; `--limit N` stops each app after N
reviews. The reviews CSV is streamed to disk (a 2M-row `--all` run finalizes in about 150-190 MB of memory). On
`--resume`, a rows file that was cut, lost or holds a line that is not that page's stored row makes that app be
fetched again (summary `notes`) instead of crashing or shipping it. Deprecated: `--true-ms` (true milliseconds are now the default) and `--smar-pad`/`--bom` (both now
mean `--smar-compat`).

## Delivery
- Give the user the CSV path and the relog path, never the rows in chat.
- The skill writes SMAR's CSV only: no date-range or star filters, no Excel/xlsx or other formats (SKILL.md step 0).
- Excel: double-clicking a default file (no BOM) garbles non-English text, and Excel turns long `developerId`
  numbers, release dates and versions such as `8.0` into numbers. Open it with Data > From Text/CSV, File
  origin UTF-8, and set those columns to Text. Never alter cells to "fix" them.
- `--smar-compat` files carry SMAR's BOM (search, ids, rerun, reviews), as smar-tool.org downloads do.

## Runtime (measured live: about 0.55 s per app page)
| Request | Apps or pages | Time | Calls with `--until-done` |
|---|---|---|---|
| search, primary only | 20 apps + 1 search | 15-30 s | 1 |
| search with similar apps (default) | 150-330 apps + about 20 searches | 1.5-3 min (326 apps: 174 s) | 1 |
| chart | up to 200 apps + 1 chart request | about 2 min | 1 |
| reviews, one app | 150 reviews per request | 10,000 reviews: 35-50 s (measured live) | 1 |
| reviews `--all` | about 150-300 reviews a second | 125,402 reviews: 815 s (measured live, Nike) | 1 per 80,000-160,000 reviews |
| bulk reviews | per app as above | N times one app | 1 per 9 minutes |

`--all` on an app with more than about 800,000 reviews needs more than the 10 calls SKILL.md allows: say the
estimate (review count / 150 per second) before starting and offer `--limit N`. When the calls run out the run is
saved (`rowsSoFar`); the same command with `--resume` continues it later, and no CSV exists until it finishes.

`--until-done` (SKILL.md's default) is one foreground call: it keeps going inside the process (pages that failed
to load or came from another storefront are retried as `--resume` would, the apps a summary asks to re-fetch are
re-fetched once, a failed request is resumed from the saved progress) until `NEXT` is DELIVER, HEAL, FIX_ANCHOR
or STOP, or the 540 s cap (or `--max-seconds`) is reached: then exit 3 and `resumeWith` (which keeps
`--until-done`). While it runs it prints at most one short progress line per minute on stderr; stdout is still
exactly one short JSON line (never pipe or redirect the command: read `summaryFile` for everything else). Without `--until-done` a call stops at `--max-seconds` the same way. Progress is saved
after every app page (reviews: every page of 150). Browser mode has no `--until-done`: the driver keeps its
`step()` loop (each call is bounded by the tool's own timeout), so SKILL.md's browser steps are unchanged.

## Reproducing a run
`rerun` re-collects exactly the apps of an earlier CSV (ours or SMAR's): same ids, order, labels and
country. It reads only the appId, scrapedFrom and country columns, never the values, and accepts rows labelled
`app id list`. `ids` rows say scrapedFrom `app id list` unless `--source` (`"app id list"`, the default,
`"keyword search"` or `"similar app links"`) or `id=keyword`/`id=similar` labels them; `--smar-compat` writes
`keyword search`, as SMAR does for a package-id search.
```
node <SKILL>/scripts/run_play.js rerun <PREVIOUS.csv> <OUT_DIR>/smar_rerun_<slug>.csv --until-done
```

## Honest limits
- Numbers are live: ratings, review counts and installs change between minutes and between Google's
  servers. Compare only with a SMAR run from the same hour, and expect small counter differences.
- "related to <title>" searches are not deterministic: about 5% of the similar-app rows differ between two
  runs (or two clients) minutes apart. Use `rerun` to pin an app list. For the same reason a `--smar-compat` file
  whose `compatFileReproducible` is ok is built with SMAR's exact rows, formatting and bugs from the pages
  fetched; a SMAR run at another time can still differ.
- Countries other than US are supported (`--country`) but not yet verified against SMAR; their summaries say
  `countryVerified:false`.
- Search continuation pages (fewer than 20 results with a next-page token) and cluster pages were never seen
  live; they are tested offline against gps code, and a failure makes the run not ready, never silently short.
- `VARY` cells are reported as `derivedUnconfirmed` (written as the text VARY, never as `undefined`) until the
  page marker's rendering is confirmed.
- Reviews come only from `reviews_play.js` (Google's review RPC, newest first, 150 per request). The default
  is SMAR's set, the newest min(review count, 10000); `--all` fetches everything Google returns, and
  `moreAvailable` tells you when more exist. `versionWhenReviewed` is filled from the review record.
- A search or chart run whose results list or chart list shows other in-app ranges than the app pages (heal STOP
  `current-path-ok` on offersIAPRange) means Google's list and details disagree; the values are not delivered as
  ready.
- One slot holding a plausible value of its own kind, with no second copy anywhere the skill fetches, cannot be
  detected (examples in `references/smar_schema.md`, Metadata cell checks: a version "8.0" on the only app of an
  id list that has one, a release record moved 400 days together with its own timestamp, a changed in-app range on
  an id list, a review's text swapped with the reply text under it). Small runs withhold cells they cannot
  tell from a moved path (`smallRunQuarantine`).
- A US page whose visible "Updated on" turns day-first ("1 Oct 2026") over its own "Mon D, YYYY" record is read
  as the same date (not another storefront); a page whose record dates are day-first too is another locale's page
  and is withheld (`wrongStorefront`).
- Not supported: the permissions columns, the Apple App Store, date-range or star filters, and other file formats.
  When a run stops or refuses, the answer is one of SKILL.md's options, never a workaround outside the scripts.
