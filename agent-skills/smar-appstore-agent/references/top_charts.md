# App Store top charts: collections and genre ids

Generated from `scripts/as_chart.js` (`COLLECTIONS`, `IOS_CATEGORIES`), which copies SMAR's website lists
(sar-frontend `src/constants/topListCategories.js`: `iosCollections`, `iosCategories` and the
`iosCategories_<collection>` lists; production revision 3a2b10e, identical for these lists to the probe copy
d8dba57). Liveness and row counts were measured on Apple's legacy chart feed on 2026-10-01
(`eval/appstore/probes/ios-charts`, findings ios-charts-03, -04 and -08). Do not edit by hand.

Command: `chart <COLLECTION> <GENRE>`, where GENRE is a numeric id below or `all` (SMAR's "No Category",
the overall chart).

## Collections

| COLLECTION | SMAR's name | Device | Live on Apple's feed | Rows | `all` offered by SMAR's site |
|---|---|---|---|---|---|
| `topmacapps` | Top Mac Apps | MAC | no (always empty) | 0 (SMAR error) | no |
| `topfreemacapps` | Top Free Mac Apps | MAC | yes | 50 | yes |
| `topgrossingmacapps` | Top Grossing Mac Apps | MAC | only with a genre | 50 | no |
| `toppaidmacapps` | Top Paid Mac Apps | MAC | only with a genre | 50 | no |
| `newapplications` | New iOS Apps | IOS | yes, any genre (genre ignored) | 110 | yes |
| `newfreeapplications` | New Free iOS Apps | IOS | yes, any genre (genre ignored) | 110 | yes |
| `newpaidapplications` | New Paid iOS Apps | IOS | yes, any genre (genre ignored) | 110 | yes |
| `topfreeapplications` | Top Free iOS Apps | IOS | yes | 50 | yes |
| `toppaidapplications` | Top Paid iOS Apps | IOS | yes | 50 | yes |
| `topgrossingapplications` | Top Grossing iOS Apps | IOS | yes | 50 | yes |
| `topfreeipadapplications` | Top Free iPad Apps | IPAD | yes | 50 | yes |
| `toppaidipadapplications` | Top Paid iPad Apps | IPAD | yes | 50 | yes |
| `topgrossingipadapplications` | Top Grossing iPad Apps | IPAD | yes | 50 | yes |

Plain words to collection (iPhone unless the user says iPad or Mac):
- "top free" = `topfreeapplications`; "top paid" = `toppaidapplications`; "top grossing" / "highest-grossing" = `topgrossingapplications`.
- iPad: `topfreeipadapplications`, `toppaidipadapplications`, `topgrossingipadapplications`.
- Mac: `topfreemacapps`; `toppaidmacapps` and `topgrossingmacapps` need a genre; `topmacapps` (SMAR's default when
  Device = Mac) is always empty, so SMAR answers an error and the skill stops.
- "new apps" = `newapplications`, "new free apps" = `newfreeapplications`, "new paid apps" = `newpaidapplications`:
  110 rows, and Apple ignores the genre (use `all`).

Dead combinations stop the run in both modes with a STOP sentence (SMAR answers HTTP 500): `topmacapps` with any
genre; `toppaidmacapps` and `topgrossingmacapps` with `all`; a feed with no entries; and, in `--smar-compat`, a feed
with exactly one entry or `--num` below the feed's row count. Default mode treats a one-entry feed as endpoint
drift (Apple serves 50 or 110) and stops too; its single row stays in `<OUT>.NOT_READY.csv`.

## Genres (SMAR's website list)

| GENRE | Name | SMAR's file name part (`categoryName`) |
|---|---|---|
| `all` | No Category | (empty) |
| `6018` | Books | BOOKS |
| `6000` | Business | BUSINESS |
| `6017` | Education | EDUCATION |
| `6016` | Entertainment | ENTERTAINMENT |
| `6015` | Finance | FINANCE |
| `6023` | Food and Drink | FOOD_AND_DRINK |
| `6014` | Games | GAMES |
| `7001` | Action Games | GAMES_ACTION |
| `7002` | Adventure Games | GAMES_ADVENTURE |
| `7003` | Arcade Games | GAMES_ARCADE |
| `7004` | Board Games | GAMES_BOARD |
| `7005` | Card Games | GAMES_CARD |
| `7006` | Casino Games | GAMES_CASINO |
| `7007` | Dice Games | GAMES_DICE |
| `7008` | Educational Games | GAMES_EDUCATIONAL |
| `7009` | Family Games | GAMES_FAMILY |
| `7011` | Music Games | GAMES_MUSIC |
| `7012` | Puzzle Games | GAMES_PUZZLE |
| `7013` | Racing Games | GAMES_RACING |
| `7014` | Role Playing Games | GAMES_ROLE_PLAYING |
| `7015` | Simulation Games | GAMES_SIMULATION |
| `7016` | Sports Games | GAMES_SPORTS |
| `7017` | Strategy Games | GAMES_STRATEGY |
| `7018` | Trivia Games | GAMES_TRIVIA |
| `7019` | Word Games | GAMES_WORD |
| `6013` | Health and Fitness | HEALTH_AND_FITNESS |
| `6012` | Lifestyle | LIFESTYLE |
| `6021` | Magazines and Newspapers | MAGAZINES_AND_NEWSPAPERS |
| `6020` | Medical | MEDICAL |
| `6011` | Music | MUSIC |
| `6010` | Navigation | NAVIGATION |
| `6009` | News | NEWS |
| `6008` | Photo and Video | PHOTO_AND_VIDEO |
| `6007` | Productivity | PRODUCTIVITY |
| `6006` | Reference | REFERENCE |
| `6024` | Shopping | SHOPPING |
| `6005` | Social Networking | SOCIAL_NETWORKING |
| `6004` | Sports | SPORTS |
| `6003` | Travel | TRAVEL |
| `6002` | Utilities | UTILITIES |
| `6001` | Weather | WEATHER |

Per-collection lists on SMAR's website:
- `topmacapps`: 6014, 7001, 7002, 7003, 7004, 7005, 7009, 7011, 7012, 7015, 7017, 7019, 6003.
- `topfreemacapps`, `topfreeapplications`, `toppaidapplications`, `topgrossingapplications`, `topfreeipadapplications`, `toppaidipadapplications`, `topgrossingipadapplications`: `all` plus every genre above except 7007 and 7008.
- `topgrossingmacapps`, `toppaidmacapps`: every genre above except `all`, 7007 and 7008.
- `newapplications`, `newfreeapplications`, `newpaidapplications`: `all` only.

Genres 7007 (Dice Games) and 7008 (Educational Games) are in SMAR's genre list but in no collection's menu. The script accepts
any of the 70 genre ids app-store-scraper 0.18 knows (the list above plus 6022 Catalogs and the 13001-13030
magazine genres); any other id stops the run, because SMAR answers an error for it. A combination that SMAR's website
does not offer still runs; tell the user SMAR's site does not offer it.

## How a chart row set is built
- Apple's legacy feed (`ax.itunes.apple.com/.../RSS/<collection>//limit=50/json`) gives membership and rank; SMAR
  always asks for 50, never sends `num`, and Apple returns 110 for the `new*` feeds whatever the limit.
- One iTunes lookup of those ids (country = CC) gives every value. Ids the lookup does not return (not sold in
  that country) are dropped and listed in `chart.dropped`; rows stay in rank order.
- Countries outside app-store-scraper's 115-store map: SMAR reads the US chart and looks the apps up in CC
  (KZ and MA: 35 of 50 rows; MA priced in USD). `--smar-compat` reproduces this and reports
  `smar_storefront_fallback`; default mode reads that country's own chart from `itunes.apple.com/<cc>/rss/...`
  instead (`storefrontSource` "country_path", `countryVerified` false).
- Chart files have no BOM in either mode, as SMAR's website download.
