# Chrome-only Play skills (Google Play, nothing to install)

> **EXPERIMENTAL.** Feedback is welcome: [open an issue](https://github.com/scuhci/sar-frontend/issues).

Three small skills for Claude in Chrome that collect Google Play data in SMAR's CSV format without installing
anything. Each skill holds one JavaScript extractor. Claude opens a play.google.com tab, pastes the extractor into
it, waits while it runs in the page, then downloads the CSV to your Downloads folder.

| Skill | What it does | Output file | Download |
|---|---|---|---|
| `smar-playstore-keyword-search` | Keyword search (first 20 results) plus similar apps, as on SMAR | `smar_play_<term>_<cc>.csv`, SMAR's 32 columns | [smar-tool.org/agent-skills/chrome-only/smar-playstore-keyword-search.skill](https://smar-tool.org/agent-skills/chrome-only/smar-playstore-keyword-search.skill) ([repo copy](../../public/agent-skills/chrome-only/smar-playstore-keyword-search.skill)) |
| `smar-playstore-top-charts` | Top free, Top paid or Top grossing chart for any category (up to 200 ranks) | `smar_chart_<category>_<list>_<cc>.csv`, SMAR's 30 columns, rank order | [smar-tool.org/agent-skills/chrome-only/smar-playstore-top-charts.skill](https://smar-tool.org/agent-skills/chrome-only/smar-playstore-top-charts.skill) ([repo copy](../../public/agent-skills/chrome-only/smar-playstore-top-charts.skill)) |
| `smar-playstore-bulk-reviews` | Newest reviews for one or more apps (up to 10,000 per app, newest first) | `smar_play_reviews_<app or bulk>_<cc>.csv`, appId plus SMAR's 11 review columns | [smar-tool.org/agent-skills/chrome-only/smar-playstore-bulk-reviews.skill](https://smar-tool.org/agent-skills/chrome-only/smar-playstore-bulk-reviews.skill) ([repo copy](../../public/agent-skills/chrome-only/smar-playstore-bulk-reviews.skill)) |

The unzipped `SKILL.md` of each skill is in this folder, so you can read the extractor before installing:
[`smar-playstore-keyword-search/`](smar-playstore-keyword-search/),
[`smar-playstore-top-charts/`](smar-playstore-top-charts/),
[`smar-playstore-bulk-reviews/`](smar-playstore-bulk-reviews/).

## Install and use

1. Install the Claude in Chrome extension and sign in.
2. In Claude.ai, go to Settings > Capabilities > Skills > Upload skill and pick the `.skill` file. Repeat for each
   skill you want.
3. Open play.google.com in Chrome and ask in plain English, for example:
   - "Keyword search the US Play Store for fitness tracking apps in SMAR format."
   - "Get the Top free Puzzle games chart from Google Play."
   - "Download the newest reviews for com.duolingo."

Each skill has two modes. The default writes the store's true values. Ask for "SMAR's exact file" (compat mode) to
get SMAR's file shape, including its known quirks.

## How the values are checked

The extractor reads each value from the app's Google Play page, never from the model. For keyword search and top
charts, several columns (name, description, icon, developer, category, content rating, price, rating, ratings count
and the installs badge) are compared with a second copy of the same data on the page; a cell that fails is written
`undefined`. Reviews are checked for the right format (ids, dates, star ratings, vote counts). In our benchmark the
cell values matched SMAR's on normal data, and a keyword search took about 23 to 53 seconds.

## Limits

- **Google Play only.** No App Store, no app-ID lookup, no permissions columns.
- **Lighter checking than the full skills.** Fewer columns are cross-checked, so an unexpected change in Google's
  page format is less likely to be caught. There is no automatic repair when the format changes.
- **No resume.** The run lives in the browser tab; reloading or closing the tab loses it, and the run starts again
  from the beginning.
- **Similar-app lists can differ from SMAR's** and can include more apps, because the related-app search is not
  deterministic.
- **Verified mainly on US runs.** Other countries run but are reported as not yet verified.
- Chrome allows one automatic download per site per session. If a second file does not appear, allow automatic
  downloads for play.google.com (icon in the address bar) and ask Claude to download again.

For quick exploratory pulls these skills are the fastest option. For research data you will publish, or for larger
runs, check important results with the [full skills](../README.md), which cross-check every value, resume
interrupted runs and also cover the App Store.
