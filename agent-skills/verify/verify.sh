#!/usr/bin/env bash
# Verify the SMAR Play Store skill against SMAR's real scraper, live, for one keyword.
#   ./verify.sh "<keyword>" [--country US]
# Env (all optional):
#   SKILL_DIR  folder holding SKILL.md. Default: ../smar-playstore-agent next to this folder, else unzip
#              smar-playstore-agent.skill found next to this script, in its parent folder, or in the current folder, into ~/.cache/smar-team/skill.
#   SMAR_DIR   SAR-backend checkout. Default $SMAR_CACHE/SAR-backend (cloned, pinned to SMAR_REF and npm ci'd from its
#              lockfile if missing; pinned versions via npm install --no-save if a SMAR_REF has no lockfile).
#   SMAR_CACHE cache folder for the clone and the unzipped skill. Default ~/.cache/smar-team.
#   OUT_ROOT   where results go. Default ./smar-verify.
#   SETUP_ONLY=1  stop after the setup checks (clone, dependencies, skill) and print "setup OK"; no store traffic.
#   NOISE=0    skip SMAR run 2 (about 8 minutes faster; the report then has no noise baseline).
# Every setup failure prints "[verify] ERROR: ..." and exits non-zero (2); npm's own output goes to a log that is shown.
# Politeness: SMAR's pipeline runs 2 parallel detail fetches, the skill runs 1 => at most 3 concurrent Google requests,
# each stream spaced >= 250 ms. Never point this at smar-tool.org: it runs SMAR's open-source code locally.
set -euo pipefail   # no -E: the ERR trap below fires only when errexit would end this shell
trap 'rc=$?; echo "[verify] ERROR: verify.sh line $LINENO failed (exit $rc): $BASH_COMMAND" >&2' ERR
die() { echo "[verify] ERROR: $*" >&2; exit 2; }
KW="${1:?usage: verify.sh \"<keyword>\" [--country CC]}"; shift || true
CC=US; while [ $# -gt 0 ]; do case "$1" in --country) [ $# -ge 2 ] || { echo '--country needs a two-letter code' >&2; exit 2; }; CC="$(echo "$2" | tr a-z A-Z)"; shift 2;; *) echo "unknown arg $1" >&2; exit 2;; esac; done
[[ "$CC" =~ ^[A-Z]{2}$ ]] || { echo "--country must be two letters (got $CC)" >&2; exit 2; }
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CACHE="${SMAR_CACHE:-$HOME/.cache/smar-team}"; mkdir -p "$CACHE"
command -v node >/dev/null || { echo "need Node 18+" >&2; exit 2; }
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ] || { echo "need Node 18+" >&2; exit 2; }
command -v git >/dev/null || { echo "need git" >&2; exit 2; }
command -v npm >/dev/null || { echo "need npm (to install SMAR's own dependencies)" >&2; exit 2; }

# ---- 1. SMAR's scraper
# Pinned: the ground truth must not move under us. SMAR_REF is the SAR-backend commit the skill was validated
# against; npm ci installs exactly its package-lock.json (google-play-scraper 9.2.0), never a newer resolve. If a
# SMAR_REF without a tracked lockfile is chosen, the direct dependencies are installed at SAR_PINS (--no-save).
SMAR_DIR="${SMAR_DIR:-$CACHE/SAR-backend}"
SMAR_REF="${SMAR_REF:-32d0fecb782b66219ef3d7b1fc63b23a6d498645}"; GPS_WANT="${GPS_WANT:-9.2.0}"
SAR_PINS="${SAR_PINS:-google-play-scraper@$GPS_WANT cors@2.8.6 dotenv@17.2.4 express@4.22.1 express-useragent@1.0.15 googleapis@152.0.0 log-timestamp@0.3.0 morgan@1.10.1 natural@6.12.0 node-ttl@0.2.0 nodemailer@8.0.1}"
if [ ! -f "$SMAR_DIR/controllers/searchController.js" ]; then
  [ ! -e "$SMAR_DIR" ] || [ -z "$(ls -A "$SMAR_DIR" 2>/dev/null)" ] || die "$SMAR_DIR exists but is not a SAR-backend checkout (no controllers/searchController.js); remove it or set SMAR_DIR"
  echo "[verify] cloning scuhci/SAR-backend into $SMAR_DIR" >&2
  git clone --quiet https://github.com/scuhci/SAR-backend.git "$SMAR_DIR" \
    || die "git clone of https://github.com/scuhci/SAR-backend.git failed (network or GitHub access?). Clone it yourself, check out $SMAR_REF and set SMAR_DIR"
fi
if [ "$(git -C "$SMAR_DIR" rev-parse HEAD 2>/dev/null)" != "$SMAR_REF" ]; then
  [ -z "$(git -C "$SMAR_DIR" status --porcelain --untracked-files=no)" ] || die "$SMAR_DIR has local edits; cannot pin it to $SMAR_REF (use a clean SMAR_DIR)"
  echo "[verify] checking out SAR-backend $SMAR_REF" >&2
  git -C "$SMAR_DIR" fetch --quiet origin "$SMAR_REF" 2>/dev/null || git -C "$SMAR_DIR" fetch --quiet origin || echo "[verify] warning: git fetch failed; trying the commits already in $SMAR_DIR" >&2
  git -C "$SMAR_DIR" -c advice.detachedHead=false checkout --quiet "$SMAR_REF" || die "cannot check out SAR-backend $SMAR_REF in $SMAR_DIR"
  rm -rf "$SMAR_DIR/node_modules"
fi
[ -f "$SMAR_DIR/utilities/jsonToCsv.js" ] || die "$SMAR_DIR is not SAR-backend (utilities/jsonToCsv.js missing)"
gps_ver() { node -p "require('$SMAR_DIR/node_modules/google-play-scraper/package.json').version" 2>/dev/null || echo none; }
if [ "$(gps_ver)" != "$GPS_WANT" ]; then
  NPMLOG="$CACHE/npm-SAR-backend.log"
  if git -C "$SMAR_DIR" ls-files --error-unmatch package-lock.json >/dev/null 2>&1; then
    NPMCMD=(npm ci --no-audit --no-fund); echo "[verify] npm ci in $SMAR_DIR (lockfile versions only; log $NPMLOG)" >&2
  else
    # shellcheck disable=SC2206
    NPMCMD=(npm install --no-save --no-package-lock --no-audit --no-fund $SAR_PINS)
    echo "[verify] $SMAR_REF has no package-lock.json: installing pinned versions ($SAR_PINS) in $SMAR_DIR (log $NPMLOG)" >&2
  fi
  rc=0; (cd "$SMAR_DIR" && "${NPMCMD[@]}") > "$NPMLOG" 2>&1 || rc=$?
  if [ "$rc" != 0 ]; then
    { echo "[verify] ERROR: '${NPMCMD[*]}' failed in $SMAR_DIR (exit $rc). Last lines of $NPMLOG:"; tail -n 25 "$NPMLOG" | sed 's/^/    /'
      echo "[verify] Check network access to the npm registry ($(npm config get registry 2>/dev/null || echo '?')) and your Node/npm versions, or set SMAR_DIR to a working SAR-backend install."; } >&2
    exit 2
  fi
fi
[ "$(gps_ver)" = "$GPS_WANT" ] || die "SAR-backend has google-play-scraper $(gps_ver), expected $GPS_WANT (set GPS_WANT to override; npm log: ${NPMLOG:-none})"
cp "$HERE/smar_harness.js" "$SMAR_DIR/.team_smar_harness.js" || die "cannot copy smar_harness.js into $SMAR_DIR"   # needs ./utilities/jsonToCsv next to it

# ---- the skill
if [ -z "${SKILL_DIR:-}" ] && [ -f "$HERE/../smar-playstore-agent/scripts/run_play.js" ]; then SKILL_DIR="$(cd "$HERE/../smar-playstore-agent" && pwd)"; fi
if [ -z "${SKILL_DIR:-}" ]; then
  PKG=""; for p in "$HERE/smar-playstore-agent.skill" "$HERE/../smar-playstore-agent.skill" "$PWD/smar-playstore-agent.skill"; do [ -f "$p" ] && { PKG="$p"; break; }; done
  [ -n "$PKG" ] || die "no SKILL_DIR and no smar-playstore-agent.skill found next to verify.sh or in $PWD"
  SKILL_DIR="$CACHE/skill/smar-playstore-agent"
  SUM="$(shasum -a 256 "$PKG" | cut -c1-16)"
  if [ "$(cat "$CACHE/skill/.sha" 2>/dev/null)" != "$SUM" ]; then rm -rf "$CACHE/skill"; mkdir -p "$CACHE/skill"; (cd "$CACHE/skill" && unzip -q "$PKG") || die "cannot unzip $PKG"; echo "$SUM" > "$CACHE/skill/.sha"; fi
fi
[ -f "$SKILL_DIR/scripts/run_play.js" ] || die "SKILL_DIR=$SKILL_DIR has no scripts/run_play.js"
if [ "${SETUP_ONLY:-0}" = 1 ]; then echo "[verify] setup OK: SAR-backend $(git -C "$SMAR_DIR" rev-parse --short HEAD) in $SMAR_DIR, google-play-scraper $(gps_ver), skill $SKILL_DIR" >&2; exit 0; fi

# Folder name (team/slug.js): a plain keyword keeps the readable rule ("habit tracker" -> habit_tracker); any keyword the
# name cannot spell exactly gets a 6-hex hash of the exact text, as the skill's own slug does, so two keywords never
# share a name: 家計簿 -> 家計簿_125ecf, café -> café_850f7d, c++ -> c_cedb1b, c# -> c_951a4d (both used to be "c").
SLUG="$(node "$HERE/slug.js" "$KW")"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
W="$(mkdir -p "${OUT_ROOT:-$PWD/smar-verify}" && cd "${OUT_ROOT:-$PWD/smar-verify}" && pwd)/${SLUG}_$(echo "$CC" | tr A-Z a-z)_$STAMP"
mkdir -p "$W/logs"
echo "[verify] results -> $W" >&2

smar_run() { # $1 = out name; records the exit code (3 = SMAR would answer HTTP 500) and never fails the script
  local code=0
  (cd "$SMAR_DIR" && node .team_smar_harness.js "$KW" "$W/$1" --country "$CC") > "$W/logs/$1.log" 2>&1 || code=$?
  echo "$code" > "$W/logs/$1.exit"; return 0
}
skill_run() { # $1 = out name, rest = extra flags; loops on exit 3 (time-boxed chunks), max 30
  local out="$W/$1"; shift; local code=0 i=0
  export SMAR_SAVE_HTML="$W/pages_$(basename "$out" .csv)"   # every fetched page (gzip), for provenance checks
  node "$SKILL_DIR/scripts/run_play.js" search "$KW" "$out" --country "$CC" --max-seconds 100 "$@" >> "$W/logs/$(basename "$out").log" 2>&1 || code=$?
  while [ "$code" = 3 ] && [ $i -lt 30 ]; do i=$((i+1)); code=0
    node "$SKILL_DIR/scripts/run_play.js" search "$KW" "$out" --country "$CC" --max-seconds 100 "$@" --resume >> "$W/logs/$(basename "$out").log" 2>&1 || code=$?
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
# ---- 3. noise baseline: SMAR again (NOISE=0 skips it)
if [ "${NOISE:-1}" != 0 ]; then smar_run smar_2.csv; else echo "[verify] NOISE=0: no SMAR run 2 (the report has no noise baseline)" >&2; fi
T2="$(date -u +%FT%TZ)"
for n in smar_1.csv smar_2.csv; do [ -f "$W/logs/$n.exit" ] || continue; c="$(cat "$W/logs/$n.exit")"; [ "$c" = 0 ] || echo "[verify] SMAR ${n%.csv} exit $c (3 = SMAR would answer HTTP 500; see logs/$n.log)" >&2; done

node - "$W" "$SMAR_DIR" "$SKILL_DIR" "$KW" "$CC" "$T0" "$T1" "$T2" <<'JS'
const [W, SD, SK, KW, CC, T0, T1, T2] = process.argv.slice(2), fs = require('fs'), cp = require('child_process'), path = require('path');
const sh = (c, d) => { try { return cp.execSync(c, { cwd: d, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { return 'n/a'; } };
const sha = (f) => require('crypto').createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16);
const gps = (() => { try { return JSON.parse(fs.readFileSync(path.join(SD, 'node_modules/google-play-scraper/package.json'))).version; } catch (e) { return 'n/a'; } })();
let skillVer = 'n/a'; try { skillVer = require(path.join(SK, 'scripts/extract_play.js')).VERSION; } catch (e) {}
const ex = (n) => { try { return fs.readFileSync(path.join(W, 'logs', n + '.exit'), 'utf8').trim(); } catch (e) { return 'n/a'; } };
fs.writeFileSync(path.join(W, 'provenance.json'), JSON.stringify({
  keyword: KW, country: CC, host: require('os').hostname(), node: process.version,
  'SAR-backend commit': sh('git rev-parse --short HEAD', SD) + ' (' + sh('git log -1 --format=%cs', SD) + ')', 'google-play-scraper': gps,
  'skill version': skillVer, 'skill extract_play.js sha256/16': sha(path.join(SK, 'scripts/extract_play.js')),
  'skill run_play.js sha256/16': sha(path.join(SK, 'scripts/run_play.js')),
  'paired start (SMAR run 1 + skill)': T0, 'paired end': T1, 'noise run end': T2,
  'exit codes (SMAR 1, SMAR 2, skill compat, skill default)': [ex('smar_1.csv'), ex('smar_2.csv'), ex('skill_compat.csv'), ex('skill_default.csv')].join(', '),
  'SMAR harness': 'team/smar_harness.js = searchController pipeline + retries (no silently dropped rows), 2 parallel detail fetches',
}, null, 1));
JS
node "$HERE/report.js" "$W" "$KW" > "$W/report.md"
echo "[verify] report: $W/report.md" >&2
cat "$W/report.md"
