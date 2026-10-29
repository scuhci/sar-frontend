#!/usr/bin/env bash
# Verify the SMAR App Store skill against SMAR's real iOS scraper, live, for one request.
#   ./verify_appstore.sh "<keyword>"                                   (keyword search; same as: search "<keyword>")
#   ./verify_appstore.sh search "<keyword>" [--country US]
#   ./verify_appstore.sh chart <collection> <genreId|all> [--country US]   e.g. chart topfreeapplications 6013
#   ./verify_appstore.sh reviews <bundleId|trackId> [--country US]        e.g. reviews org.meditofoundation
# Env (all optional):
#   SKILL_DIR  folder holding the skill's SKILL.md. Default: ../smar-appstore-agent next to this folder, else unzip
#              smar-appstore-agent.skill found next to this script, in its parent folder or in the current folder.
#   SMAR_DIR   SAR-backend iOS checkout. Default $SMAR_CACHE/SAR-backend-ios (fresh clone of scuhci/SAR-backend,
#              branch ios-production, pinned commit). The pinned commit ships no package-lock.json, so its dependencies
#              are installed at the exact versions the skill was validated with (SAR_PINS below; npm install --no-save).
#   SMAR_REF   the pinned SAR-backend commit (default 95783af, the ios-production head the skill was built against).
#   SMAR_CACHE cache folder for the clone and the unzipped skill. Default ~/.cache/smar-team.
#   OUT_ROOT   where results go. Default ./smar-verify.
#   SETUP_ONLY=1  stop after the setup checks (clone, dependencies, skill) and print "setup OK"; no store traffic.
# Every setup failure prints "[verify] ERROR: ..." and exits non-zero (2); npm's own output goes to a log that is shown.
# Politeness: SMAR's pipeline and the skill share one cross-process Apple limiter (the skill's scripts/net_apple.js:
# <= 18 lookups and <= 30 other Apple requests a minute in total). Never point this at smar-tool.org: it runs SMAR's
# open-source iOS code locally.
set -euo pipefail   # no -E: the ERR trap below fires only when errexit would end this shell
trap 'rc=$?; echo "[verify] ERROR: verify_appstore.sh line $LINENO failed (exit $rc): $BASH_COMMAND" >&2' ERR
die() { echo "[verify] ERROR: $*" >&2; exit 2; }
MODE=search
case "${1:-}" in search|chart|reviews) MODE="$1"; shift;; "") echo 'usage: verify_appstore.sh [search] "<keyword>" | chart <collection> <genreId|all> | reviews <bundleId> [--country CC]' >&2; exit 2;; esac
ARGS=(); CC=US
while [ $# -gt 0 ]; do case "$1" in --country) [ $# -ge 2 ] || { echo '--country needs a two-letter code' >&2; exit 2; }; CC="$(echo "$2" | tr a-z A-Z)"; shift 2;; --*) echo "unknown flag $1" >&2; exit 2;; *) ARGS+=("$1"); shift;; esac; done
case "$MODE" in
  search)  [ ${#ARGS[@]} -eq 1 ] || { echo 'search needs one quoted keyword' >&2; exit 2; }; WHAT="keyword search \"${ARGS[0]}\" ($CC)";;
  chart)   [ ${#ARGS[@]} -eq 2 ] || { echo 'chart needs <collection> <genreId|all>' >&2; exit 2; }; WHAT="chart ${ARGS[0]} genre ${ARGS[1]} ($CC)";;
  reviews) [ ${#ARGS[@]} -eq 1 ] || { echo 'reviews needs one bundle id or track id' >&2; exit 2; }; WHAT="reviews of ${ARGS[0]} ($CC)";;
esac
[[ "$CC" =~ ^[A-Z]{2}$ ]] || { echo "--country must be two letters (got $CC)" >&2; exit 2; }
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CACHE="${SMAR_CACHE:-$HOME/.cache/smar-team}"; mkdir -p "$CACHE"
command -v node >/dev/null || { echo "need Node 18+" >&2; exit 2; }
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ] || { echo "need Node 18+" >&2; exit 2; }
command -v git >/dev/null || { echo "need git" >&2; exit 2; }
command -v npm >/dev/null || { echo "need npm (to install SMAR's own dependencies)" >&2; exit 2; }

# ---- 1. SMAR's iOS scraper: a fresh, pinned clone of SAR-backend ios-production
# The ground truth must not move under us: SMAR_REF is the commit the skill was validated against (the ios-production
# head on 2026-10-01). That commit has no package-lock.json (npm ci cannot run there), so the kit pins every direct
# dependency to the version it was validated with (app-store-scraper 0.18.0) and installs those with --no-save, which
# leaves package.json and the checkout untouched. If a later SMAR_REF does track a lockfile, npm ci installs exactly it.
SMAR_DIR="${SMAR_DIR:-$CACHE/SAR-backend-ios}"
SMAR_REF="${SMAR_REF:-95783af0550c0e0422a61c445132bdcb9bb6c91e}"; ASS_WANT="${ASS_WANT:-0.18.0}"
SAR_PINS="${SAR_PINS:-app-store-scraper@$ASS_WANT app-store-scraper-reviews@1.0.1 cors@2.8.6 express@4.22.3 express-useragent@1.0.15 log-timestamp@0.3.0 morgan@1.12.1 natural@6.12.0 node-ttl@0.2.0}"
if [ ! -f "$SMAR_DIR/controllers/searchController.js" ]; then
  [ ! -e "$SMAR_DIR" ] || [ -z "$(ls -A "$SMAR_DIR" 2>/dev/null)" ] || die "$SMAR_DIR exists but is not a SAR-backend checkout (no controllers/searchController.js); remove it or set SMAR_DIR"
  echo "[verify] cloning scuhci/SAR-backend (branch ios-production) into $SMAR_DIR" >&2
  git clone --quiet --branch ios-production https://github.com/scuhci/SAR-backend.git "$SMAR_DIR" \
    || die "git clone of https://github.com/scuhci/SAR-backend.git (branch ios-production) failed (network or GitHub access?). Clone it yourself, check out $SMAR_REF and set SMAR_DIR"
fi
if [ "$(git -C "$SMAR_DIR" rev-parse HEAD 2>/dev/null)" != "$(git -C "$SMAR_DIR" rev-parse "$SMAR_REF^{commit}" 2>/dev/null || echo none)" ]; then
  [ -z "$(git -C "$SMAR_DIR" status --porcelain --untracked-files=no)" ] || die "$SMAR_DIR has local edits; cannot pin it to $SMAR_REF (use a clean SMAR_DIR)"
  echo "[verify] checking out SAR-backend $SMAR_REF" >&2
  git -C "$SMAR_DIR" fetch --quiet origin ios-production 2>/dev/null || git -C "$SMAR_DIR" fetch --quiet origin || echo "[verify] warning: git fetch failed; trying the commits already in $SMAR_DIR" >&2
  git -C "$SMAR_DIR" -c advice.detachedHead=false checkout --quiet "$SMAR_REF" || die "cannot check out SAR-backend $SMAR_REF in $SMAR_DIR"
  rm -rf "$SMAR_DIR/node_modules"
fi
[ -f "$SMAR_DIR/utilities/jsonToCsv.js" ] && [ -f "$SMAR_DIR/controllers/listController.js" ] && [ -f "$SMAR_DIR/controllers/reviewsController.js" ] \
  || die "$SMAR_DIR is not SAR-backend's iOS code (controllers/listController.js, reviewsController.js, utilities/jsonToCsv.js missing)"
ass_ver() { node -p "require('$SMAR_DIR/node_modules/app-store-scraper/package.json').version" 2>/dev/null || echo none; }
has_natural() { node -e "require.resolve('natural', { paths: ['$SMAR_DIR'] })" >/dev/null 2>&1; }
if [ "$(ass_ver)" != "$ASS_WANT" ] || ! has_natural; then
  NPMLOG="$CACHE/npm-SAR-backend-ios.log"
  if git -C "$SMAR_DIR" ls-files --error-unmatch package-lock.json >/dev/null 2>&1; then
    NPMCMD=(npm ci --no-audit --no-fund); echo "[verify] npm ci in $SMAR_DIR (its lockfile; about a minute; log $NPMLOG)" >&2
  else
    # shellcheck disable=SC2206
    NPMCMD=(npm install --no-save --no-package-lock --no-audit --no-fund $SAR_PINS)
    echo "[verify] $SMAR_REF has no package-lock.json: installing pinned versions ($SAR_PINS) in $SMAR_DIR (about a minute; log $NPMLOG)" >&2
  fi
  rc=0; (cd "$SMAR_DIR" && "${NPMCMD[@]}") > "$NPMLOG" 2>&1 || rc=$?
  if [ "$rc" != 0 ]; then
    { echo "[verify] ERROR: '${NPMCMD[*]}' failed in $SMAR_DIR (exit $rc). Last lines of $NPMLOG:"; tail -n 25 "$NPMLOG" | sed 's/^/    /'
      echo "[verify] Check network access to the npm registry ($(npm config get registry 2>/dev/null || echo '?')) and your Node/npm versions, or set SMAR_DIR to a working SAR-backend iOS install."; } >&2
    exit 2
  fi
fi
[ "$(ass_ver)" = "$ASS_WANT" ] || die "SAR-backend has app-store-scraper $(ass_ver), expected $ASS_WANT (set ASS_WANT to override; npm log: ${NPMLOG:-none})"
has_natural || die "SAR-backend in $SMAR_DIR is missing the natural package its search controller needs (npm log: ${NPMLOG:-none})"

# ---- the skill
if [ -z "${SKILL_DIR:-}" ] && [ -f "$HERE/../smar-appstore-agent/scripts/run_appstore.js" ]; then SKILL_DIR="$(cd "$HERE/../smar-appstore-agent" && pwd)"; fi
if [ -z "${SKILL_DIR:-}" ]; then
  PKG=""; for p in "$HERE/smar-appstore-agent.skill" "$HERE/../smar-appstore-agent.skill" "$PWD/smar-appstore-agent.skill"; do [ -f "$p" ] && { PKG="$p"; break; }; done
  [ -n "$PKG" ] || die "no SKILL_DIR and no smar-appstore-agent.skill found next to verify_appstore.sh or in $PWD"
  SKILL_DIR="$CACHE/skill-appstore/smar-appstore-agent"
  SUM="$(shasum -a 256 "$PKG" | cut -c1-16)"
  if [ "$(cat "$CACHE/skill-appstore/.sha" 2>/dev/null)" != "$SUM" ]; then rm -rf "$CACHE/skill-appstore"; mkdir -p "$CACHE/skill-appstore"; (cd "$CACHE/skill-appstore" && unzip -q "$PKG") || die "cannot unzip $PKG"; echo "$SUM" > "$CACHE/skill-appstore/.sha"; fi
fi
[ -f "$SKILL_DIR/scripts/run_appstore.js" ] || die "SKILL_DIR=$SKILL_DIR has no scripts/run_appstore.js"
if [ "${SETUP_ONLY:-0}" = 1 ]; then echo "[verify] setup OK: SAR-backend $(git -C "$SMAR_DIR" rev-parse --short HEAD) in $SMAR_DIR, app-store-scraper $(ass_ver), skill $SKILL_DIR" >&2; exit 0; fi

# Folder name (team/slug.js): a plain request keeps the readable rule ("chart topfreeapplications 6013" ->
# chart_topfreeapplications_6013); any request the name cannot spell exactly gets a 6-hex hash of the exact text, so two
# requests never share a name: search 家計簿 -> search_家計簿_<hash>, search c++ / search c# -> search_c_<hash> (both used to
# be "search_c"), reviews org.meditofoundation -> reviews_org_meditofoundation_<hash>.
SLUG="$(node "$HERE/slug.js" "$MODE" "${ARGS[@]}")"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
W="$(mkdir -p "${OUT_ROOT:-$PWD/smar-verify}" && cd "${OUT_ROOT:-$PWD/smar-verify}" && pwd)/${SLUG}_$(echo "$CC" | tr A-Z a-z)_$STAMP"
mkdir -p "$W/logs"
echo "[verify] results -> $W" >&2

smar_run() { # $1 = out name; exit 0 ok, 3 = SMAR would answer HTTP 500, 4 = Apple rate limit
  local code=0
  node "$HERE/smar_harness_ios.js" "$SMAR_DIR" "$SKILL_DIR" "$MODE" "${ARGS[@]}" "$W/$1" --country "$CC" > "$W/logs/$1.log" 2>&1 || code=$?
  echo "$code" > "$W/logs/$1.exit"; return 0
}
skill_run() { # $1 = out name, rest = extra flags; loops on exit 3 (time-boxed chunks), max 30
  local out="$W/$1"; shift; local code=0 i=0
  node "$SKILL_DIR/scripts/run_appstore.js" "$MODE" "${ARGS[@]}" "$out" --country "$CC" --max-seconds 100 "$@" >> "$W/logs/$(basename "$out").log" 2>&1 || code=$?
  while [ "$code" = 3 ] && [ $i -lt 30 ]; do i=$((i+1)); code=0
    node "$SKILL_DIR/scripts/run_appstore.js" "$MODE" "${ARGS[@]}" "$out" --country "$CC" --max-seconds 100 "$@" --resume >> "$W/logs/$(basename "$out").log" 2>&1 || code=$?
  done
  echo "$code" > "$W/logs/$(basename "$out").exit"
}

# ---- 2. paired run: SMAR run 1 and the skill (compat, then default) start at the same moment
T0="$(date -u +%FT%TZ)"
smar_run smar_1.csv & P1=$!
( skill_run skill_compat.csv --smar-compat; skill_run skill_default.csv ) & P2=$!
wait $P1 || true
wait $P2 || true
T1="$(date -u +%FT%TZ)"
# ---- 3. noise baseline: SMAR again
smar_run smar_2.csv
T2="$(date -u +%FT%TZ)"
for n in smar_1.csv smar_2.csv; do c="$(cat "$W/logs/$n.exit")"; [ "$c" = 0 ] || echo "[verify] SMAR ${n%.csv} exit $c (3 = SMAR would answer HTTP 500; 4 = Apple rate limit; see logs/$n.log)" >&2; done

node - "$W" "$SMAR_DIR" "$SKILL_DIR" "$WHAT" "$CC" "$T0" "$T1" "$T2" <<'JS'
const [W, SD, SK, WHAT, CC, T0, T1, T2] = process.argv.slice(2), fs = require('fs'), cp = require('child_process'), path = require('path');
const sh = (c, d) => { try { return cp.execSync(c, { cwd: d, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { return 'n/a'; } };
const sha = (f) => { try { return require('crypto').createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16); } catch (e) { return 'n/a'; } };
const ver = (p) => { try { return JSON.parse(fs.readFileSync(path.join(SD, p, 'package.json'))).version; } catch (e) { return 'n/a'; } };
let skillVer = 'n/a'; try { skillVer = require(path.join(SK, 'scripts/appstore_core.js')).VERSION; } catch (e) {}
const ex = (n) => { try { return fs.readFileSync(path.join(W, 'logs', n + '.exit'), 'utf8').trim(); } catch (e) { return 'n/a'; } };
fs.writeFileSync(path.join(W, 'provenance.json'), JSON.stringify({
  request: WHAT, country: CC, host: require('os').hostname(), node: process.version,
  'SAR-backend commit (ios-production)': sh('git rev-parse --short HEAD', SD) + ' (' + sh('git log -1 --format=%cs', SD) + ')',
  'sar-backend version': ver(''), 'app-store-scraper': ver('node_modules/app-store-scraper'),
  'skill version': skillVer, 'skill appstore_core.js sha256/16': sha(path.join(SK, 'scripts/appstore_core.js')),
  'skill run_appstore.js sha256/16': sha(path.join(SK, 'scripts/run_appstore.js')),
  'paired start (SMAR run 1 + skill)': T0, 'paired end': T1, 'noise run end': T2,
  'exit codes (SMAR 1, SMAR 2, skill compat, skill default)': [ex('smar_1.csv'), ex('smar_2.csv'), ex('skill_compat.csv'), ex('skill_default.csv')].join(', '),
  'SMAR harness': 'team/smar_harness_ios.js = SAR-backend iOS controllers with SMAR\'s own app-store-scraper and jsonToCsv, TZ=UTC as on production, retries recorded (no silently dropped rows), detail lookups batched 50 bundle ids per request',
}, null, 1));
JS
node "$HERE/report_appstore.js" "$W" "$WHAT" > "$W/report.md"
echo "[verify] report: $W/report.md" >&2
cat "$W/report.md"
