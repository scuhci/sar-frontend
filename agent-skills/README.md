# SMAR agent skills (Google Play + Apple App Store)

> **EXPERIMENTAL.** These skills are new and still changing. We are actively seeking feedback from researchers and
> developers: what worked, what broke, what you need next. Please
> [open an issue in this repo](https://github.com/scuhci/sar-frontend/issues).

## Two versions

There are two versions of the SMAR agent skills. Both write CSVs in SMAR's format.

- **Full skills** (`smar-playstore-agent` 3.1.0, `smar-appstore-agent` 2.1.0): Google Play and the App Store.
  Scripts run on your computer, every value is cross-checked against a second source, and long runs can resume.
  Described in the rest of this page.
- **Chrome-only Play skills** (`smar-playstore-keyword-search`, `smar-playstore-top-charts`,
  `smar-playstore-bulk-reviews`): Google Play only, nothing to install. Claude in Chrome pastes one extractor into a
  play.google.com tab and downloads the CSV. Details: [`chrome-only/README.md`](chrome-only/README.md).

### Which version should I use?

| | Full skills | Chrome-only Play skills |
|---|---|---|
| Stores | Google Play and Apple App Store | Google Play only |
| Features | Keyword search + similar apps, app-ID lookup, country selection, top charts, single and bulk reviews | Keyword search + similar apps, top charts, bulk reviews |
| Install | Claude Code: unzip into `~/.claude/skills/` (Node 18+). Claude.ai: upload the `.skill` file | Claude.ai: upload the `.skill` files; needs the Claude in Chrome extension |
| Where it runs | Scripts on your computer (Claude Code), or the bundled browser mode in Claude in Chrome (App Store keyword search still needs a terminal) | In a play.google.com tab in your Chrome |
| Speed | Depends on run size; built for larger runs | Fast: a keyword search took about 23 to 53 seconds in our tests |
| Checking | Every value cross-checked against a second source; cells that can't be verified are blanked and flagged. Stress-tested (45 issues fixed); 0 wrong values against SMAR's scraper | Values matched SMAR on normal data in our benchmark; fewer columns are cross-checked, so an unexpected store format change is less likely to be caught |
| Resume | Saves progress; interrupted runs resume | No; reloading the tab loses the run |
| Best for | Research data collection, larger runs, the App Store, reproducibility | Quick exploratory pulls, users without a terminal |

Similar-app lists from the Chrome-only skills can include more apps than SMAR's, and they were verified mainly on
US runs. For important results, check with the full skills.

### Downloads

| Version | Skill | Download | Repo copy |
|---|---|---|---|
| Full | `smar-playstore-agent` 3.1.0 | [smar-tool.org/agent-skills/smar-playstore-agent.skill](https://smar-tool.org/agent-skills/smar-playstore-agent.skill) | [`public/agent-skills/smar-playstore-agent.skill`](../public/agent-skills/smar-playstore-agent.skill) |
| Full | `smar-appstore-agent` 2.1.0 | [smar-tool.org/agent-skills/smar-appstore-agent.skill](https://smar-tool.org/agent-skills/smar-appstore-agent.skill) | [`public/agent-skills/smar-appstore-agent.skill`](../public/agent-skills/smar-appstore-agent.skill) |
| Chrome-only | `smar-playstore-keyword-search` | [smar-tool.org/agent-skills/chrome-only/smar-playstore-keyword-search.skill](https://smar-tool.org/agent-skills/chrome-only/smar-playstore-keyword-search.skill) | [`public/agent-skills/chrome-only/smar-playstore-keyword-search.skill`](../public/agent-skills/chrome-only/smar-playstore-keyword-search.skill) |
| Chrome-only | `smar-playstore-top-charts` | [smar-tool.org/agent-skills/chrome-only/smar-playstore-top-charts.skill](https://smar-tool.org/agent-skills/chrome-only/smar-playstore-top-charts.skill) | [`public/agent-skills/chrome-only/smar-playstore-top-charts.skill`](../public/agent-skills/chrome-only/smar-playstore-top-charts.skill) |
| Chrome-only | `smar-playstore-bulk-reviews` | [smar-tool.org/agent-skills/chrome-only/smar-playstore-bulk-reviews.skill](https://smar-tool.org/agent-skills/chrome-only/smar-playstore-bulk-reviews.skill) | [`public/agent-skills/chrome-only/smar-playstore-bulk-reviews.skill`](../public/agent-skills/chrome-only/smar-playstore-bulk-reviews.skill) |

The rest of this page describes the **full skills**.

## What this is

Two skills you add to your own AI agent so it can do what [smar-tool.org](https://smar-tool.org) does and give you
SMAR-format CSVs:

| Skill | Store | Version | Download |
|---|---|---|---|
| `smar-playstore-agent` | Google Play | 3.1.0 | [smar-tool.org/agent-skills/smar-playstore-agent.skill](https://smar-tool.org/agent-skills/smar-playstore-agent.skill) ([repo copy](../public/agent-skills/smar-playstore-agent.skill)) |
| `smar-appstore-agent` | Apple App Store | 2.1.0 | [smar-tool.org/agent-skills/smar-appstore-agent.skill](https://smar-tool.org/agent-skills/smar-appstore-agent.skill) ([repo copy](../public/agent-skills/smar-appstore-agent.skill)) |

They were built and tested with Claude (Claude Code, Claude.ai and Claude in Chrome).

- **Values come from scripts, not from the model.** The agent only runs the skill's scripts. The scripts copy every
  value from Google's or Apple's own data and check it against a second source on the page.
- **Cells that can't be verified are left blank and flagged** in the run's report, never guessed.
- The columns are the same as SMAR's, so files work with anything you already built around SMAR's output.

A `.skill` file is a zip. Its contents are also in this folder, unzipped, so you can read them before installing:
[`smar-playstore-agent/`](smar-playstore-agent/) and [`smar-appstore-agent/`](smar-appstore-agent/) (start with
each `SKILL.md`).

## What's supported

This table describes the **full skills**. The Chrome-only Play skills cover Google Play keyword search (with similar
apps), top charts and bulk reviews, with CSV download in SMAR's columns.

22 SMAR workflows: 16 supported, 3 partly supported, 3 not supported yet.

| Workflow | Status |
|---|---|
| **Google Play** | |
| Keyword search | Supported |
| Similar apps (included with keyword search, as on SMAR) | Supported |
| App-ID lookup | Supported |
| Country selection | Supported |
| Top charts | Supported |
| Reviews for one app (newest 10,000) | Supported |
| Bulk reviews (several apps) | Supported |
| Permissions (with search) | Not yet supported |
| Top charts + permissions | Not yet supported |
| **Apple App Store** | |
| Keyword search (needs a terminal/shell, not browser-only mode) | Supported |
| Similar apps | Supported |
| App-ID lookup (bundle ID, track ID or App Store link) | Supported |
| Top charts (iPhone, iPad, Mac) | Supported |
| Reviews for one app (up to 500, Apple's feed limit) | Supported |
| Bulk reviews (several apps) | Supported |
| **Both stores** | |
| CSV download (optional exact-SMAR file with `--smar-compat`) | Supported |
| Column definitions same as SMAR | Supported |
| Bulk reviews always newest first | Supported |
| Reproducibility log | Partial: written as a separate file; its field names differ from SMAR's log |
| Results preview | Partial: a short written report instead of a table |
| Top-charts reviews + download | Partial: two steps; the CSV and the log are separate files, not zipped |
| Email when done | Not yet supported |

## Install

**Claude Code.** Needs Node 18 or newer.

```
mkdir -p ~/.claude/skills
unzip smar-playstore-agent.skill -d ~/.claude/skills/
unzip smar-appstore-agent.skill  -d ~/.claude/skills/
```

**Claude.ai / Claude Desktop / Claude in Chrome.** Settings > Capabilities > Skills > Upload skill, then pick the
`.skill` file. If Claude has a code or shell tool, it runs the scripts there. With only Claude in Chrome (no shell)
it uses browser mode:

- Play: open a play.google.com tab and ask. Everything above works.
- App Store: open an itunes.apple.com tab and ask. Charts, reviews and app lookups work; **keyword search needs a
  shell**, so use Claude Code or Claude Desktop with a code tool for that.

**Chrome-only Play skills.** In Claude.ai / Claude in Chrome: Settings > Capabilities > Skills > Upload skill, then
pick each `.skill` file from `chrome-only/`. They need the Claude in Chrome extension. Open a play.google.com tab and
ask; the CSV lands in your Downloads folder. See [`chrome-only/README.md`](chrome-only/README.md).

**Other agents (local models etc.).** Unzip the skill, paste its `SKILL.md` into the system prompt and give the
model a shell tool. See "Known limits" for which models worked.

## Using it

Ask in plain English. For example:

- "Keyword search the US Play Store for meditation apps in SMAR format."
- "Get the top free Health & Fitness chart from the App Store."
- "All App Store reviews for Medito."
- "Pull the newest Play reviews for these three app IDs: ..."
- "Search the UK Play Store for budgeting apps, exactly what SMAR's site would give me." (uses `--smar-compat`)

What you get, in the folder you name:

- **the CSV**, in SMAR's columns;
- **a reproducibility log** (`..._relog.txt`) recording what was run, when, and with which settings;
- **a short report** in the chat: rows written, whether the file is ready, any blank cells and why, and apps SMAR's
  own scraper would have dropped.

By default the CSV holds the store's true values. `--smar-compat` instead reproduces SMAR's file exactly, including
its known quirks.

**NOT_READY means it stopped on purpose.** If the store changed its page format or Apple's review feed came back
empty, the skill will not hand over a file it cannot vouch for. The partial file is kept as `<name>.NOT_READY.csv`
and the report says why. Usually the fix is to try again later. The agent offers only the skill's own options and
will not work around the scripts.

## How well it works

All comparisons are against SMAR's own scraper code, run at the same moment as the skill (benchmark of Play 3.1.0
and App Store 2.1.0, October 2026):

- **0 wrong values** in any file the skill wrote, across about 100 hosted trials and 25 local-model trials.
- **Play, 17-genre benchmark:** 2,276 rows (68,700 cells) shared with SMAR, 0 skill errors.
- **App Store, obscure-apps benchmark (16 cases):** 3,538 search and chart rows, 100% match, none missing or extra.
- **Repeat runs:** the skill's results vary from run to run by the same amount as SMAR's (the stores themselves
  reshuffle results).
- **Interrupted runs:** 48 of 48 randomly killed runs resumed with the right rows.

A handful of correct cells were blanked by over-strict checks (see below). Those are always disclosed in the
report, never written wrong.

## Known limits

- **Not supported yet:** permissions columns (Play) and email when done. Also no date-range or star filters; CSV
  only.
- **App Store reviews** are capped at the newest 500 per app (Apple's limit, same as SMAR). Apple's review feed
  sometimes returns empty pages for hours; the skill then stops instead of handing over a short file. Retry later.
- **Model choice matters.** Claude Sonnet-class models and above were reliable. Among local models, qwen3.6
  (35B-A3B) completed every test case; smaller or older local models (e.g. qwen3-coder 30B) and Claude Haiku were
  not reliable and are not recommended.
- **Countries other than the US** work (Play was checked against SMAR in 13 storefronts with no wrong values) but
  are still marked "not yet verified" in the report.
- **Open issues you may notice:**
  - App Store reviews: after empty pages, the retry re-reads only the first empty page, so a run can come back
    shorter than it could be.
  - App Store: the report can say no other cells are blank when some are empty. Check the CSV itself.
  - App Store: the correct size of a very popular but small app can be blanked as suspicious.
  - Play: a correct version number or total-review count is occasionally blanked when it happens to equal a rating
    count on the same page.
  - Play app-ID lookup: the column order differs from SMAR's app-ID file, even with `--smar-compat`, and the report
    does not say so.
  - App Store: a lookup of a single bundle ID says SMAR has no equivalent, but SMAR's search box does return that
    app.

## Check a run yourself

[`verify/`](verify/) runs SMAR's open-source scraper
([scuhci/SAR-backend](https://github.com/scuhci/SAR-backend), pinned to a fixed commit, run locally; smar-tool.org
is never called) and the skill at the same moment, then writes a report of every difference. Needs Node 18+, git and
npm.

```
agent-skills/verify/verify.sh "meditation"                  # Google Play keyword search
agent-skills/verify/verify_appstore.sh "meditation"         # App Store keyword search
```

Details, options and how to read the report: [`verify/README.md`](verify/README.md).

## Versions

Play skill 3.1.0 and App Store skill 2.1.0 (released 2026-10-05). What changed and why: [`CHANGELOG.md`](CHANGELOG.md).

Feedback, bugs and requests: [open an issue](https://github.com/scuhci/sar-frontend/issues).
