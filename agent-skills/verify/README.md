# Verify kit

These scripts check the skills against SMAR's real scraper. Each run starts SMAR's open-source code
([scuhci/SAR-backend](https://github.com/scuhci/SAR-backend), run locally on your machine; smar-tool.org is never
called) and the skill at the same moment, then writes a report of every difference between the two files.

You need Node 18+, git and npm. Run the scripts from a clone of this repo; by default they use the unzipped skills in
`agent-skills/` next to this folder.

| File | What it does |
|---|---|
| `verify.sh` | Google Play check (keyword search) |
| `verify_appstore.sh` | App Store check (keyword search, top chart or reviews) |
| `smar_harness.js`, `smar_harness_ios.js` | run SMAR's own pipeline locally (with retries, so no rows are silently dropped) |
| `report.js`, `report_appstore.js` | write `report.md` from the two runs |
| `slug.js` | builds the results folder name |

## Google Play

```
agent-skills/verify/verify.sh "meditation"                 # US
agent-skills/verify/verify.sh "meditation" --country GB    # another storefront
```

## App Store

```
agent-skills/verify/verify_appstore.sh "meditation"                     # keyword search (or: search "meditation" --country GB)
agent-skills/verify/verify_appstore.sh chart topfreeapplications 6013   # top free Health & Fitness
agent-skills/verify/verify_appstore.sh reviews org.meditofoundation     # reviews (bundle ID or numeric track ID)
```

## What happens

1. **Setup (first run only, about a minute).** Clones SAR-backend into `~/.cache/smar-team/` (or `$SMAR_CACHE`) and
   checks out the commit the skill was validated against (Play: `32d0fecb`, google-play-scraper 9.2.0; App Store:
   branch `ios-production` at `95783af`, app-store-scraper 0.18.0). Dependencies are installed at pinned versions so
   the ground truth cannot drift. Any setup problem stops with `[verify] ERROR: ...` and exit code 2.
2. **Paired run.** SMAR's pipeline and the skill (first in `--smar-compat` mode, then default mode) start together.
3. **Noise run.** SMAR runs a second time, because the stores answer slightly differently from minute to minute.
   This shows how much two SMAR runs differ from each other.
4. **Report.** `smar-verify/<request>_<country>_<time>/report.md` in the folder you ran from. It has the byte diff of
   the `--smar-compat` file against SMAR's, the noise baseline, every difference sorted into a cause (store
   nondeterminism, live drift, a known SMAR scraper quirk, network, or "skill error?"), and the exact versions used.

**Read the "skill error?" rows first.** Everything else is explained in the report. Counts such as installs and
ratings move live, so only compare files from the same run.

## Options (environment variables)

| Variable | Effect |
|---|---|
| `SETUP_ONLY=1` | run only the setup checks and print `setup OK` (no store traffic) |
| `NOISE=0` | skip SMAR's second run (faster, but no noise baseline) |
| `SKILL_DIR=<folder>` | test a different copy of the skill (the folder holding `SKILL.md`) |
| `SMAR_CACHE=<folder>` | where the SAR-backend clone goes (default `~/.cache/smar-team`) |
| `OUT_ROOT=<folder>` | where results go (default `./smar-verify`) |

## How long it takes

- Play keyword search: about 20 to 25 minutes (SMAR's pipeline fetches about 350 app pages, twice; the skill
  finishes in about 4). `NOISE=0` saves about 8 minutes.
- App Store keyword search: about 15 minutes. A chart or reviews check: under a minute.

Both scripts are polite to the stores: at most 3 concurrent Google requests, and for Apple one shared rate limit
for SMAR and the skill together.

## Known limits

- Live store data: two runs minutes apart (even two SMAR runs) differ a little. The report shows how much.
- App Store reviews: Apple's review feed sometimes returns empty pages for hours, for SMAR as well. Retry later.
- The App Store report can misclassify some review differences, and it calls two header-only files
  "byte-identical". Check the row counts when a reviews run looks suspiciously clean.

## Not included here

The maintainers' scripts that rebuild the browser-mode bundles (`scripts/min/`) are not in this folder: the skills
ship those bundles prebuilt. To confirm a skill folder's bundles match its source files, run
`node agent-skills/smar-playstore-agent/scripts/fingerprint.js --check` (or the same for `smar-appstore-agent`).
