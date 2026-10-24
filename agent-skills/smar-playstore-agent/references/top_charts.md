# Top charts: collections and category ids

SMAR's top chart is gps `list({collection, category, num: 1000000, fullDetail: true})`: Google Play's
ranked chart from the `vyAe2` top-chart request, which `scripts/chart_fetch.js` sends byte-for-byte. Every
rank Google returns is kept, in rank order (at most 200). Never build a chart from category pages
(`/store/apps/category/...`) or from the screen: those are recommendation shelves that share only 12-25%
of their apps with the chart.

```
node <SKILL>/scripts/run_play.js chart GAME_BOARD <OUT_DIR>/smar_chart_game_board_top_free_us.csv --collection TOP_FREE --country US --until-done
```

## Collection (`--collection`, required)
| The user says | Use |
|---|---|
| top free, free | TOP_FREE |
| top paid, paid | TOP_PAID |
| top grossing, highest-grossing, best-selling by revenue | GROSSING |

Old names `topselling_free`, `topselling_paid` and `topgrossing` are accepted and mapped (the summary notes it).

## Category (the first argument)
SMAR's "No Category" (`""`) is turned into APPLICATION by the library: the chart of **non-game** apps. It
is not "everything including games"; for games use GAME or a GAME_* id. An id not in this table stops the
run with exit 2 before any request.

| Name | Id | Name | Id |
|---|---|---|---|
| No Category / overall apps | APPLICATION | Medical | MEDICAL |
| Wear OS (Android Wear) | ANDROID_WEAR | Music & Audio | MUSIC_AND_AUDIO |
| Art & Design | ART_AND_DESIGN | News & Magazines | NEWS_AND_MAGAZINES |
| Auto & Vehicles | AUTO_AND_VEHICLES | Parenting | PARENTING |
| Beauty | BEAUTY | Personalization | PERSONALIZATION |
| Books & Reference | BOOKS_AND_REFERENCE | Photography | PHOTOGRAPHY |
| Business | BUSINESS | Productivity | PRODUCTIVITY |
| Comics | COMICS | Shopping | SHOPPING |
| Communication | COMMUNICATION | Social | SOCIAL |
| Dating | DATING | Sports | SPORTS |
| Education | EDUCATION | Tools | TOOLS |
| Entertainment | ENTERTAINMENT | Travel & Local | TRAVEL_AND_LOCAL |
| Events | EVENTS | Video Players & Editors | VIDEO_PLAYERS |
| Finance | FINANCE | Watch faces | WATCH_FACE |
| Food & Drink | FOOD_AND_DRINK | Weather | WEATHER |
| Health & Fitness | HEALTH_AND_FITNESS | Kids / Family | FAMILY |
| House & Home | HOUSE_AND_HOME | All games | GAME |
| Libraries & Demo | LIBRARIES_AND_DEMO | Action games | GAME_ACTION |
| Lifestyle | LIFESTYLE | Adventure games | GAME_ADVENTURE |
| Maps & Navigation | MAPS_AND_NAVIGATION | Arcade games | GAME_ARCADE |
| Board games | GAME_BOARD | Card games | GAME_CARD |
| Casino games | GAME_CASINO | Casual games | GAME_CASUAL |
| Educational games | GAME_EDUCATIONAL | Music games | GAME_MUSIC |
| Puzzle games | GAME_PUZZLE | Racing games | GAME_RACING |
| Role playing games | GAME_ROLE_PLAYING | Simulation games | GAME_SIMULATION |
| Sports games | GAME_SPORTS | Strategy games | GAME_STRATEGY |
| Trivia games | GAME_TRIVIA | Word games | GAME_WORD |

## What smar-tool.org's own page offers
SMAR's Top Charts page lists only these combinations (sar-frontend `topListCategories.js`):
- TOP_FREE: No Category, GAME_BOARD, GAME_CARD, GAME_PUZZLE
- TOP_PAID: No Category, BEAUTY, COMICS, EVENTS, HOUSE_AND_HOME, PARENTING
- GROSSING: No Category, APPLICATION, GAME_CARD, GAME_CASINO

Any other combination still runs (SMAR's backend accepts it), but tell the user that SMAR's website does not
offer it, so there is no SMAR export to compare with.

## Sizes and empty charts
- The No Category charts held 200 (TOP_FREE), about 120 (TOP_PAID) and 200 (GROSSING) ranks on 2026-09-30.
- Many paid category charts are short or empty in the US: TOP_PAID COMICS had 1 app, and TOP_PAID BEAUTY,
  EVENTS, HOUSE_AND_HOME, PARENTING and SOCIAL were empty. An empty chart is reported
  (`emptyReason` `empty_chart`, no CSV, not ready); it is never filled from anywhere else.
- If any ranked app's page would make gps `app()` throw, SMAR's whole chart request fails with HTTP 500
  (`smarChartWouldHttp500`; `smarChartHttp500Apps.count` is how many apps break it; see `smar_schema.md`).
  The default CSV still holds every rank.
- The chart CSV has 30 columns, no `country` and no `scrapedFrom` (`smar_schema.md`).
