#!/usr/bin/env node
'use strict';
// run_appstore.js -- smar-appstore-agent v2 shell runner: a thin CLI over appstore_core.js (newState/advance/outputs).
// Nothing fetched enters the agent's context: stdout is exactly ONE JSON summary (<= 4 KB); rows, progress and the
// response journal live on disk (atomic writes, lock). PLAN.md §6.3-6.4.
//
//   node run_appstore.js search "<TERM>" OUT.csv [--primary-only] [--country XX] [--smar-compat] [--until-done] [--resume [--deliver-anyway]] [--fresh] [--max-seconds N]
//   node run_appstore.js chart <collection> <genreId|all> OUT.csv [--num N] [common flags]
//   node run_appstore.js reviews <bundleId|trackId>[,<...>] OUT.csv [--bulk] [--per-app] [--all] [common flags]
//   node run_appstore.js ids <id|bundleId[=keyword|=similar],...> OUT.csv [--source "keyword search"|"similar app links"] [--layout chart] [common flags]
//   node run_appstore.js rerun <previous.csv> OUT.csv [common flags]
//   node run_appstore.js refetch <id,...> OUT.csv
//   node run_appstore.js lookup "<app name>" [--country XX]          -> {decision:'USE'|'ASK', match, candidates}
//   node run_appstore.js term "<user phrase>" [--country XX]          -> {TERM, rule, slug, file}: SKILL.md's TERM rule,
//        applied by script (no network, no files): quoted/labelled terms verbatim, a trailing generic "app(s)" dropped
//        unless part of a name; slug keeps Unicode letters (+ a short hash when other characters are dropped)
//   eval only: --record DIR  --replay DIR  --emit-both  --sample K
//
// --until-done (SKILL.md's default): ONE call that keeps resuming internally (saved progress, network retries, one
//   internal re-fetch of failed apps) until the run is finished (DELIVER / FIX_ANCHOR / STOP) or a hard cap
//   (--max-seconds, default UNTIL_DONE_CAP_S = 540 s, inside a 600 s tool timeout) is reached (exit 3: run resumeWith).
//   stderr gets at most one short progress line per minute; stdout stays exactly one JSON summary.
// The progress file is never discarded: a leftover run is continued with --resume; files of an earlier run whose
//   progress file is missing are refused (exit 2) unless --fresh (start that OUT over; never with --resume).
// --deliver-anyway refuses an unfinished run (exit 3, NEXT RESUME) and, on a finished one, blanks EVERY cell of every
//   drifted column (or refuses with STOP when a drifted anchor is not one CSV column).
//
// exit 0 finished (read READY_TO_DELIVER) | 1 stopped (read NEXT) | 2 usage | 3 incomplete (repeat with --resume)
//      4 locked (another run writes OUT) | 5 crash (summary still printed)
// OUT's folder is created when missing (mkdir -p). Files: OUT only when READY_TO_DELIVER (or --resume --deliver-anyway),
// else <OUT>.NOT_READY.csv; <OUT>_relog.txt,
// <OUT>.summary.json (uncapped), OUT.progress.json (state), OUT.pages/ (response journal), OUT.lock while running.
const fs = require('fs'), path = require('path');

const SRC = { keyword: 'keyword search', similar: 'similar app links' };
const VAL = { country: 1, num: 1, source: 1, layout: 1, 'max-seconds': 1, record: 1, replay: 1, sample: 1 };
const BOOL = { 'primary-only': 1, 'smar-compat': 1, resume: 1, 'deliver-anyway': 1, bulk: 1, 'per-app': 1, all: 1, 'emit-both': 1, 'until-done': 1, fresh: 1 };
const COMMON = ['country', 'max-seconds', 'smar-compat', 'resume', 'deliver-anyway', 'until-done', 'fresh', 'record', 'replay', 'emit-both', 'sample'];
const UNTIL_DONE_CAP_S = 540; // --until-done default hard cap: one call fits a 600 s tool timeout
const PROGRESS_MS = Number(process.env.SMAR_AS_PROGRESS_MS) > 0 ? Number(process.env.SMAR_AS_PROGRESS_MS) : 60000; // --until-done: at most one stderr progress line per minute (env: eval only)
const NET_RETRIES = 5;        // --until-done: NETWORK failures resumed from the saved progress before exit 3
const OUT_NAME_MAX_BYTES = 200; // OUT's file name; the longest derived name adds '.progress.json' and a temp suffix (< 255 bytes)
const ALLOWED = {
  search: COMMON.concat(['primary-only']), chart: COMMON.concat(['num']), reviews: COMMON.concat(['bulk', 'per-app', 'all']),
  ids: COMMON.concat(['source', 'layout']), rerun: COMMON.slice(), refetch: ['country', 'smar-compat', 'record', 'replay'], lookup: ['country', 'record', 'replay'],
  term: ['country'],
};
const POS = { search: 2, chart: 3, reviews: 2, ids: 2, rerun: 2, refetch: 2, lookup: 1, term: 1 };
const POS_HELP = { search: '"<TERM>" OUT.csv', chart: '<collection> <genreId|all> OUT.csv', reviews: '<bundleId|trackId>[,...] OUT.csv', ids: '<id,...> OUT.csv', rerun: '<previous.csv> OUT.csv', refetch: '<id,...> OUT.csv', lookup: '"<app name>"', term: '"<user phrase>"' };
const USAGE = Object.keys(POS).map((m) => `node ${__filename} ${m} ${POS_HELP[m]} ${ALLOWED[m].filter((k) => !['record', 'replay', 'emit-both', 'sample'].includes(k)).map((k) => '[--' + k + (VAL[k] ? ' X' : '') + ']').join(' ')}`)
  .concat(['exit: 0 finished (see READY_TO_DELIVER) | 1 stopped (read NEXT) | 2 usage | 3 incomplete (repeat with --resume) | 4 locked | 5 crash']).join('\n');

let printed = false, release = null, st = null, A = null, mode = null, saveState = null, io = null, reqBase = null, ticker = null;
let refetchBackup = null; // the finished state while --until-done re-fetches internally (restored on any interruption)
let progressStart = null, crawlT0 = null; // reviews pace of this call (progress line, partial summary)
const stopTicker = () => { if (ticker) { clearInterval(ticker); ticker = null; } };
const notes = [];
function emit(o, code) {
  if (printed) return;
  printed = true;
  stopTicker();
  if (notes.length && o && typeof o === 'object' && !o.notes) o.notes = notes;
  if (release) { try { release(); } catch (e) { /* ignore */ } release = null; }
  let out = o;
  try { if (A && A.capSummary) out = A.capSummary(o, 4096); } catch (e) { /* uncapped */ }
  process.exitCode = code;
  process.stdout.write(JSON.stringify(out) + '\n', () => process.exit(code));
}
const err = (msg, code, extra) => Object.assign(new Error(msg), { code }, extra || {});
const usageErr = (msg) => err(msg, 'USAGE');
const head = () => ({ skill: 'smar-appstore-agent', version: A ? A.VERSION : '2.1.0', runner: 'shell', mode });
function fail(e, code, extra) {
  const o = Object.assign(head(), { error: { code: (e && e.code) || 'ERROR', message: String((e && e.message) || e).slice(0, 400) } }, extra || {});
  if (code === 2 && !o.NEXT) o.NEXT = 'STOP: fix the command once from error.message (usage lists every form); if it fails again, tell the user.';
  if (code === 2 && !o.usage) o.usage = USAGE;
  emit(o, code);
}
function crash(e) {
  if (printed) return;
  if (refetchBackup) { try { st = JSON.parse(refetchBackup); } catch (x) { /* keep st */ } refetchBackup = null; }
  try { if (st && saveState) saveState(st); } catch (x) { /* best effort */ }
  fail(e, 5, { crash: true, resumeWith: st && st.shell ? st.shell.resumeWith : undefined, NEXT: 'STOP: the runner crashed; give the user error.message' + (st ? ' and resumeWith' : '') + '.' });
}
process.on('uncaughtException', crash);
process.on('unhandledRejection', crash);

// ---------------------------------------------------------------- arguments
const argv = process.argv.slice(2);
mode = argv[0];
const pos = [], f = {};
let parseError = null;
for (let i = 1; i < argv.length; i++) {
  const m = /^--([a-z-]+)(?:=([\s\S]*))?$/.exec(argv[i]);
  if (!m) { pos.push(argv[i]); continue; }
  if (VAL[m[1]]) { const v = m[2] !== undefined ? m[2] : argv[++i]; if (v === undefined) { parseError = '--' + m[1] + ' needs a value'; break; } f[m[1]] = v; }
  else if (BOOL[m[1]] && m[2] === undefined) f[m[1]] = true;
  else { parseError = 'unknown flag ' + argv[i]; break; }
}

(async function main() {
  if (!POS[mode]) return fail(usageErr(mode ? `unknown mode "${mode}"` : 'no mode given'), 2);
  if (parseError) return fail(usageErr(parseError), 2);
  try { A = require('./appstore_core.js'); } catch (e) { return fail(err('cannot load appstore_core.js: ' + e.message, 'USAGE'), 2); }
  let N, F;
  try { N = require('./net_apple.js'); F = require('./fsutil.js'); } catch (e) { return fail(err('cannot load net_apple.js / fsutil.js next to run_appstore.js: ' + e.message, 'USAGE'), 2); }
  const bad = Object.keys(f).filter((k) => !ALLOWED[mode].includes(k));
  if (bad.length) return fail(usageErr(`--${bad[0]} does not apply to ${mode}`), 2);
  if (pos.length !== POS[mode]) return fail(usageErr(`${mode} expects ${POS_HELP[mode]} (got ${pos.length} positional argument(s); quote multi-word terms)`), 2);
  if (f['deliver-anyway'] && !f.resume) return fail(usageErr('--deliver-anyway only works together with --resume on a finished run'), 2);
  if (f.fresh && (f.resume || f['deliver-anyway'])) return fail(usageErr('--fresh starts this OUT over; it cannot be combined with --resume or --deliver-anyway'), 2);
  if (f['max-seconds'] !== undefined && !(Number(f['max-seconds']) > 0)) return fail(usageErr('--max-seconds must be a positive number of seconds'), 2);
  if (f.num !== undefined && !/^\d+$/.test(String(f.num))) return fail(usageErr('--num must be a whole number'), 2);
  if (f.sample !== undefined && !/^\d+$/.test(String(f.sample))) return fail(usageErr('--sample must be a whole number'), 2);
  if (f['per-app'] && !f.bulk) return fail(usageErr('--per-app only works with --bulk'), 2);
  if (f.replay !== undefined && !fs.existsSync(path.resolve(f.replay))) return fail(usageErr('--replay folder not found: ' + f.replay), 2);
  let country;
  if (f.country !== undefined) {
    country = String(f.country).trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) return fail(usageErr(`--country must be a two-letter country code such as US, GB or DE (got "${f.country}")`), 2);
    // unknown codes (XX, UK, KP) are refused here, before any request (stress WI-7)
    const ccBad = A.checkCountry ? A.checkCountry(country) : null;
    if (ccBad) return fail(usageErr(ccBad), 2);
  }
  const untilDone = !!f['until-done'];
  const deadlineMs = f['max-seconds'] !== undefined ? Date.now() + Number(f['max-seconds']) * 1000 : untilDone ? Date.now() + UNTIL_DONE_CAP_S * 1000 : Infinity;
  const ioOpts = { replay: f.replay !== undefined ? path.resolve(f.replay) : undefined, record: f.record !== undefined ? path.resolve(f.record) : undefined, label: process.env.APPLE_RL_LABEL };

  // ---- term: SKILL.md's TERM rule by script (no network, no files) ----
  if (mode === 'term') {
    let r;
    try { r = A.resolveTerm(pos[0]); } catch (e) { return fail(e.code ? e : usageErr(String(e.message)), 2); }
    const cc = country || 'US', slug = A.slugOf(r.TERM);
    return emit(Object.assign(head(), { phrase: pos[0], TERM: r.TERM, rule: r.rule, changed: r.changed, slug, country: cc, file: `smar_appstore_${slug}_${cc.toLowerCase()}.csv`,
      NEXT: `USE: search with TERM exactly as printed (${JSON.stringify(r.TERM)}) into <OUT_DIR>/${`smar_appstore_${slug}_${cc.toLowerCase()}.csv`}` }), 0);
  }

  // ---- lookup: no files, no lock ----
  if (mode === 'lookup') {
    io = N.makeIo(Object.assign({}, ioOpts, { deadlineMs: Infinity }));
    try {
      const r = await A.lookup(io, pos[0], { country: country || 'US' });
      const next = r.decision === 'USE' ? `USE: ${r.match.bundleId} (trackId ${r.match.trackId})`
        : r.candidates.length ? 'ASK: show the user the candidates (title, developer, ratings) and ask which app they mean; never pick one yourself'
          : `STOP: no App Store app matches "${pos[0]}" in ${country || 'US'}; ask the user for the exact name, the App Store link or the bundle id.`;
      return emit(Object.assign(head(), { name: pos[0], country: country || 'US' }, r, { NEXT: next, requests: { itunes_api: io.stats().itunes_api, apple_other: io.stats().apple_other } }), 0);
    } catch (e) {
      if (e && e.code === 'USAGE') return fail(e, 2);
      return fail(e, 1, { NEXT: e && e.code === 'RATE_LIMITED' ? 'STOP: Apple is limiting requests from this network. Wait 15 minutes, then run the same lookup again.' : 'STOP: the lookup request failed; tell the user (error.message).' });
    }
  }

  // ---- the run this command asks for (validated before any state) ----
  // a quoted "~/x/OUT.csv" reaches us unexpanded: path.resolve would create a folder literally named "~" in the cwd
  // (and, now that a missing folder is created, deliver there silently). "~" and "~/..." mean the home folder;
  // "~name/..." is refused.
  const rawOut = String(pos[pos.length - 1]);
  if (/^~[^/\\]/.test(rawOut)) return fail(usageErr(`OUT starts with "${rawOut.split(/[/\\]/)[0]}": give an absolute path (no ~user)`), 2);
  const out = path.resolve(/^~(?=$|[/\\])/.test(rawOut) ? require('os').homedir() + rawOut.slice(1) : rawOut);
  if (!/\.csv$/i.test(out)) return fail(usageErr('OUT must end in .csv'), 2);
  // every file derived from OUT (OUT.progress.json, .NOT_READY.csv, temp files) must fit a 255-byte file name (WI-5)
  if (Buffer.byteLength(path.basename(out)) > OUT_NAME_MAX_BYTES) return fail(usageErr(`the output file name is too long (${Buffer.byteLength(path.basename(out))} bytes; at most ${OUT_NAME_MAX_BYTES}): use a shorter name (the term command prints one)`), 2);
  if (fs.existsSync(out) && fs.statSync(out).isDirectory()) return fail(usageErr('OUT.csv must be a file path, not a directory'), 2);
  // a missing output folder is created (mkdir -p); every agent used to improvise this after an exit 2 (SE-A)
  if (!fs.existsSync(path.dirname(out))) {
    try { fs.mkdirSync(path.dirname(out), { recursive: true }); notes.push('created the output folder ' + path.dirname(out)); } catch (e) { return fail(usageErr(`the output folder ${path.dirname(out)} does not exist and could not be created (${e.code || e.message})`), 2); }
  }
  if (!fs.statSync(path.dirname(out)).isDirectory()) return fail(usageErr('the output folder is not a folder: ' + path.dirname(out)), 2);
  const base = out.replace(/\.csv$/i, '');
  const FILES = { final: out, not_ready: base + '.NOT_READY.csv', relog: base + '_relog.txt', summary: base + '.summary.json' };
  const P = out + '.progress.json', pagesDir = out + '.pages';
  const ask = { mode: mode === 'refetch' ? null : mode };
  try {
    if (mode === 'search') { ask.term = pos[0]; if (!String(ask.term).trim()) throw usageErr('search needs a non-empty term'); if (f['primary-only']) ask.primaryOnly = true; }
    else if (mode === 'chart') {
      ask.collection = pos[0]; ask.genre = String(pos[1]).toLowerCase() === 'all' || pos[1] === '' ? 'all' : String(pos[1]);
      if (!A.COLLECTIONS[ask.collection]) throw usageErr(`unknown collection "${pos[0]}" (one of ${Object.keys(A.COLLECTIONS).join(', ')})`);
      if (ask.genre !== 'all' && !/^\d+$/.test(ask.genre)) throw usageErr(`genre must be a numeric App Store genre id or "all" (got "${pos[1]}"); references/top_charts.md lists them`);
      if (f.num !== undefined) ask.num = Number(f.num);
    } else if (mode === 'reviews') {
      ask.apps = String(pos[0]).split(',').map((t) => t.trim()).filter(Boolean);
      const badIds = ask.apps.filter((a) => !A.isNumId(a) && !A.isBundleId(a));
      if (badIds.length) throw usageErr(`not a bundle id or numeric App Store id: "${badIds[0]}" (resolve an app name with: node ${__filename} lookup "<name>")`);
      if (!ask.apps.length) throw usageErr('reviews needs a bundleId or trackId');
      if (ask.apps.length > 1 && !f.bulk) throw usageErr('several apps need --bulk');
      if (f.bulk) ask.bulk = true; if (f['per-app']) ask.perApp = true; if (f.all) ask.all = true;
    } else if (mode === 'ids') {
      if (f.source !== undefined && !Object.values(SRC).includes(f.source)) throw usageErr('--source must be "keyword search" or "similar app links"');
      if (f.layout !== undefined && !['chart', 'search'].includes(f.layout)) throw usageErr('--layout must be chart or search');
      const src = f.source || SRC.keyword, list = [];
      for (const tok of String(pos[0]).split(',').map((t) => t.trim()).filter(Boolean)) {
        const k = tok.indexOf('='), id = (k < 0 ? tok : tok.slice(0, k)).trim(), lab = k < 0 ? null : tok.slice(k + 1).trim();
        if (lab !== null && !SRC[lab]) throw usageErr(`unknown label "=${lab}" after ${id} (use =keyword or =similar)`);
        list.push([id, lab ? SRC[lab] : src]);
      }
      if (!list.length) throw usageErr('ids: empty id list');
      ask.ids = list; ask.layout = f.layout || 'search';
    } else if (mode === 'rerun') {
      const r = readPrevious(path.resolve(pos[0]), A);
      if (country && r.country && r.country !== country) throw usageErr(`${pos[0]} was scraped for country ${r.country}, but --country is ${country}; drop --country or use the same one`);
      if (!country && r.country) country = r.country;
      Object.assign(ask, { ids: r.ids, layout: r.layout, from: path.resolve(pos[0]) });
      if (r.duplicates) notes.push(`${r.duplicates} duplicate appId row(s) in ${pos[0]} are fetched once`);
    } else if (mode === 'refetch') {
      ask.refetchIds = String(pos[0]).split(',').map((t) => t.trim()).filter(Boolean);
      if (!ask.refetchIds.length || ask.refetchIds.some((id) => !A.isNumId(id) && !A.isBundleId(id))) throw usageErr('refetch needs a comma-separated list of app ids');
    }
    if (country) ask.country = country;
    if (f['smar-compat']) ask.compat = true;
    if (f.sample !== undefined) ask.sample = Number(f.sample);
  } catch (e) { return fail(e.code ? e : usageErr(String(e.message || e)), 2); }

  // ---- lock, then load or create the progress file ----
  try { release = F.lock(out); } catch (e) {
    if (e.code === 'LOCKED') return fail(e, 4, { NEXT: `STOP: another run is writing ${out}; do not start a second one; tell the user.` });
    throw e;
  }
  const leftovers = () => [FILES.final, FILES.not_ready, FILES.summary, FILES.relog, pagesDir].filter((p) => fs.existsSync(p) && !(p === pagesDir && isEmptyDir(p)));
  if (f.fresh) { // the user asked to start this OUT over: the earlier run's progress and files are discarded, nothing else
    const gone = [P].concat(leftovers()).filter((p) => fs.existsSync(p));
    for (const p of gone) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) { return fail(usageErr(`--fresh could not remove ${p} (${e.code || e.message})`), 2); } }
    if (gone.length) notes.push(`--fresh: discarded the earlier run of ${path.basename(out)} (${gone.map((p) => path.basename(p)).join(', ')})`);
  }
  const haveProgress = fs.existsSync(P);
  const resumeLike = f.resume || mode === 'refetch';
  if (haveProgress && !resumeLike) return fail(usageErr(`a progress file exists for ${out}`), 2, { NEXT: 'STOP: add --resume to the identical command to continue that run, or write to a NEW output file; never delete or edit the progress file.' });
  if (!haveProgress) {
    if (mode === 'refetch' || f['deliver-anyway']) return fail(usageErr(`no finished run for ${out} (${P} is missing)`), 2, { NEXT: 'STOP: there is no finished run to deliver (its progress file is missing); tell the user. Never delete or edit progress files.' });
    const stale = leftovers();
    if (stale.length) return fail(usageErr(`${path.basename(stale[0])} of an earlier run into ${out} exists but its progress file is missing`), 2, { NEXT: `STOP: the progress file of an earlier run into ${path.basename(out)} is missing (progress files must never be deleted or edited). Write to a NEW output file (add _2 before .csv); only if the user asks to start that run over, add --fresh.` });
    if (f.resume) notes.push('no progress file found: started a new run');
    try { st = A.newState(Object.assign({}, ask, { country: ask.country || 'US' })); } catch (e) { return fail(e.code ? e : usageErr(String(e.message)), 2); }
  } else {
    try { st = JSON.parse(fs.readFileSync(P, 'utf8')); } catch (e) { return fail(usageErr(`the progress file ${P} is unreadable (${e.message}); start a NEW output file`), 2); }
    if (!st || st.v !== 1 || st.skill !== 'smar-appstore-agent') { st = null; return fail(usageErr('not a smar-appstore-agent v2 progress file; start a NEW output file'), 2); }
    const clash = signatureClash(st, ask);
    if (clash) { st = null; return fail(usageErr(`--resume with a different ${clash} than the saved run`), 2, { NEXT: 'STOP: use the identical command, or a NEW output file.' }); }
    if (ask.compat && !st.opts.compat) st.opts.compat = true; // write-time only for reviews/ids/rerun (search/chart clash above)
    // a progress file whose rows disagree with its own bookkeeping (rolled back or edited) is never resumed as is
    // (stress FI-12): its rows are rebuilt from the saved lookups, or the crawl starts over from the response journal
    const ig = A.integrity ? A.integrity(st) : null;
    if (ig) {
      try { st = A.repair(st, ig); } catch (e) { st = null; return fail(e.code ? e : usageErr(String(e.message)), 2, { NEXT: 'STOP: the saved run cannot be repaired (' + String(e.message).slice(0, 120) + '); write to a NEW output file.' }); }
      notes.push(`the saved progress did not match its own bookkeeping (${ig.why}); ${ig.fix === 'rebuild' ? 'the rows were rebuilt from the saved lookups and checked again' : ig.fix === 'restart_apps' ? 'those apps were read again' : 'the run was started over from the saved responses'}`);
    }
  }
  st.shell = Object.assign({}, st.shell || {});
  if (mode !== 'refetch' || !st.shell.cmd) st.shell.cmd = runCmd(out);
  st.shell.resumeWith = st.shell.cmd + ' --resume';
  if (mode === 'reviews' || st.opts.mode === 'reviews') st.opts.healWaitMs = f.replay !== undefined ? 0 : undefined;

  // ---- transport (journal under OUT.pages/, campaign limiter when present) ----
  try { fs.mkdirSync(pagesDir, { recursive: true }); } catch (e) { /* the journal writer retries */ }
  io = N.makeIo(Object.assign({}, ioOpts, { out, resume: !!(haveProgress || f.resume), deadlineMs }));
  reqBase = st.requests || null;
  const reqNow = () => { const s = io.stats(); return addReq(reqBase, { itunes_api: s.itunes_api, apple_other: s.apple_other, journalHits: s.journalHits, retries: s.retries, waitedSeconds: Math.round((s.waitedMs || 0) / 1000), rateLimited: s.rateLimited }); };
  saveState = (s) => { s.requests = reqNow(); s.rev = (s.rev || 0) + 1; F.atomicWriteJson(P, s); };
  io.save = saveState;

  const removeStale = (keep) => { for (const p of [FILES.final, FILES.not_ready]) if (p !== keep && fs.existsSync(p)) { try { fs.unlinkSync(p); } catch (e) { /* ignore */ } } };
  // a file delivered earlier with --deliver-anyway (recorded in the progress file, or, for a run delivered by an older
  // release, in its summary): a later call that finds the run still not ready takes OUT.csv back and says so, with the
  // way to deliver it again (stress regression: the file the user had accepted vanished without a word)
  const delivered0 = (() => {
    if (!fs.existsSync(FILES.final)) return null;
    if (st.deliveredAnyway) return st.deliveredAnyway;
    try { const p0 = JSON.parse(fs.readFileSync(FILES.summary, 'utf8')); if (p0 && p0.deliveredAnyway === true) return { at: p0.finishedUTC, rows: p0.rows }; } catch (e) { /* none */ }
    return null;
  })();
  const withdrawnNote = (why) => `${path.basename(FILES.final)}, delivered anyway at ${delivered0.at} (${delivered0.rows} rows), was withdrawn: ${why}; with the user's OK, ${st.shell.cmd} --resume --deliver-anyway writes it again as it stands${why.startsWith('this run is not finished') ? ' once the run has finished' : ''}`;
  const refetchCmd = (ids) => (st.opts.mode === 'reviews' ? st.shell.resumeWith : ['node', __filename, 'refetch', ids.slice(0, 50).join(','), out].map(q).join(' '));
  function finish(extra) {
    st.requests = reqNow();
    const o = A.outputs(st, { deliverAnyway: !!f['deliver-anyway'], cmd: st.shell.cmd, refetchCmd, runner: 'shell', emitBoth: !!f['emit-both'] });
    const sum = o.summary;
    let csvFile = null;
    if (o.csv != null) { csvFile = o.csvName === 'final' ? FILES.final : FILES.not_ready; F.atomicWrite(csvFile, o.csv); }
    removeStale(csvFile);
    if (sum.deliveredAnyway) {
      st.deliveredAnyway = { at: sum.finishedUTC, rows: sum.rows };
      notes.push(`delivered anyway: a later --resume of this command re-reads what is missing; if the run is still not ready then, it moves ${path.basename(FILES.final)} back to ${path.basename(FILES.not_ready)}, and --resume --deliver-anyway (with the user's OK) writes it again as it stands then`);
    } else if (delivered0) {
      if (sum.READY_TO_DELIVER) notes.push(`the run is complete now: ${path.basename(FILES.final)} replaces the file delivered anyway at ${delivered0.at}`);
      else notes.push(withdrawnNote(`this run is still not ready${csvFile ? ` (now ${path.basename(csvFile)})` : ''}`));
      delete st.deliveredAnyway;
    }
    F.atomicWrite(FILES.relog, o.relog);
    if (o.other) {
      if (o.other.csv != null) { const p = `${base}.${o.other.compat ? 'compat' : 'default'}.csv`; F.atomicWrite(p, o.other.csv); sum.emitBoth = p; }
      else sum.emitBoth = o.other.skipped || 'no rows in the other mode';
    }
    if (st.opts.perApp && csvFile === FILES.final) sum.perAppFiles = writePerApp(st, base, F, sum.blankedColumns);
    Object.assign(sum, { csv: csvFile, relog: FILES.relog, summaryFile: FILES.summary, pages: pagesDir, progress: P }, extra || {});
    if (csvFile === null && !sum.READY_TO_DELIVER) sum.csvNote = 'no CSV: ' + (o.compatExact && o.compatExact.reasons.some((r) => r.code === 'smar_http500') && st.opts.compat ? 'smar-tool.org returns no file for this request' : 'nothing to write');
    if (st.opts.mode === 'search' && st.opts.primaryOnly) sum.primaryOnly = 'not a SMAR deliverable: SMAR always adds the similar apps of every primary result';
    if (notes.length) sum.notes = notes;
    delete sum.exitCode;
    F.atomicWriteJson(FILES.summary, sum);
    try { saveState(st); } catch (e) { /* progress is a convenience once finished */ }
    emit(sum, o.exitCode);
  }
  function partial(code, extra) { // exit 1/3: no CSV for an unfinished run; stale outputs of this run are removed
    try { saveState(st); } catch (e) { /* keep going */ }
    const sum = A.summarize(st, Object.assign({ runner: 'shell', cmd: st.shell.cmd, requests: null }, extra && extra.ctx ? extra.ctx : {}));
    removeStale(null);
    if (delivered0 && !notes.some((n) => /was withdrawn/.test(n))) notes.push(withdrawnNote('this run is not finished (it is re-reading what was missing)'));
    delete sum.exitCode;
    Object.assign(sum, { csv: null, progress: P, summaryFile: FILES.summary, relog: null, resumeWith: st.shell.resumeWith }, extra && extra.fields ? extra.fields : {});
    if (st.opts.mode === 'reviews' && crawlT0) { // how far a reviews run got, and a realistic estimate for the rest (SCALE-5)
      const p = pace(st, crawlT0);
      if (p && p.apps != null) sum.pace = { appsDone: p.appsDone, apps: p.apps, rowsSoFar: p.rows, secondsPerApp: p.secondsPerApp, minutesLeft: p.etaMinutes };
    }
    if (notes.length) sum.notes = notes;
    try { F.atomicWriteJson(FILES.summary, sum); } catch (e) { /* ignore */ }
    emit(sum, code);
  }
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => {
    stopTicker();
    if (refetchBackup) { st = JSON.parse(refetchBackup); refetchBackup = null; } // never save a half-done re-fetch
    if (!printed) partial(3, { fields: { interrupted: sig } });
  });

  // ---- deliver-anyway / refetch: no new crawling ----
  if (f['deliver-anyway']) { // refuses an unfinished run: there is nothing to deliver until it finishes
    // a reviews run that had finished and was cut during a re-fetch pass (only re-reads pending) is settled as it stands
    if (!A.isDone(st) && A.settle && A.settle(st)) notes.push('the interrupted re-fetch pass was ended; the apps are delivered as they stood');
    if (!A.isDone(st)) return partial(3, { ctx: { incomplete: true }, fields: { incomplete: true, refused: '--deliver-anyway needs a finished run; this run is not finished, so nothing was written. Run resumeWith (without --deliver-anyway) until it finishes.' } });
    return finish();
  }
  if (mode === 'refetch') {
    if (!A.isDone(st)) return fail(usageErr('the run is not finished; run the original command with --resume first'), 2);
    let res;
    try { res = await A.refetch(st, io, ask.refetchIds); } catch (e) { return handleRunError(e); }
    return finish({ refetchResults: res.slice(0, 25) });
  }
  if (haveProgress && A.isDone(st)) { const n = A.requeue(st); if (n) notes.push(`retrying the unhealed empty review page(s) of ${n} app(s)`); }
  if (st.mzx) delete st.mzx; // each call asks Apple's optional second review source again (it may have recovered)

  // ---- crawl ----
  saveState(st);
  const t0 = Date.now();
  try { progressStart = A.progress ? A.progress(st) : null; } catch (e) { progressStart = null; }
  crawlT0 = t0;
  let r, netRetries = 0;
  if (untilDone) { // at most one short progress line per minute on stderr (stdout stays one JSON object)
    ticker = setInterval(() => { try { process.stderr.write(progressLine(st, t0) + '\n'); } catch (e) { /* never break the run */ } }, PROGRESS_MS);
    if (ticker.unref) ticker.unref();
  }
  try {
    await A.seed(st, io);
    for (;;) {
      try { r = await A.advance(st, io, { deadlineMs, settle: true }); break; } catch (e) {
        // --until-done: a network failure (after net_apple's own retries) resumes from the saved progress, as --resume would
        if (!untilDone || !e || e.code !== 'NETWORK' || netRetries >= NET_RETRIES || Date.now() + 30000 > deadlineMs) throw e;
        netRetries++;
        await new Promise((res) => setTimeout(res, 15000));
        st = JSON.parse(fs.readFileSync(P, 'utf8'));
        reqBase = st.requests || null;
        io = N.makeIo(Object.assign({}, ioOpts, { out, resume: true, deadlineMs }));
        io.save = saveState;
      }
    }
    if (netRetries) notes.push(`resumed ${netRetries} time(s) after a network failure`);
    if (r.done && untilDone) await autoRefetch();
  } catch (e) { stopTicker(); return handleRunError(e); }
  stopTicker();
  if (!r.done) return partial(3, { ctx: { incomplete: true }, fields: { incomplete: true, seconds: Math.round((Date.now() - t0) / 1000) } });
  return finish();

  // --until-done: a finished run whose NEXT would be REFETCH re-reads the failed apps once, here (the same work the
  // printed REFETCH command does); so does a single-app reviews run stopped because Apple's feed returned only empty
  // pages (feed_empty). Any failure restores the finished state, so the summary still says REFETCH / STOP.
  async function autoRefetch() {
    let pre;
    try { pre = A.outputs(JSON.parse(JSON.stringify(st)), { cmd: st.shell.cmd, refetchCmd, runner: 'shell' }).summary; } catch (e) { return; }
    const feedEmpty = st.opts.mode === 'reviews' && /^STOP:/.test(String(pre.NEXT || '')) && (pre.problems || []).includes('stopped: feed_empty');
    if (!/^REFETCH:/.test(String(pre.NEXT || '')) && !feedEmpty) return;
    const backup = refetchBackup = JSON.stringify(st);
    try {
      if (st.opts.mode === 'reviews') {
        if (!A.requeue(st)) return;
        const x = await A.advance(st, io, { deadlineMs, settle: true });
        if (x && x.done && !x.units) { st = JSON.parse(backup); notes.push('no time was left in this call for the internal re-fetch of the failed apps'); return; }
      }
      else if (st.opts.mode !== 'chart') {
        const ids = (st.dropped || []).filter((d) => d.reason === 'lookup_failed').map((d) => d.appId);
        if (!ids.length) return;
        await A.refetch(st, io, ids.slice(0, 50));
      } else return;
      if (!A.isDone(st)) throw new Error('re-fetch did not finish');
      notes.push('re-fetched once the app(s) whose first fetch failed');
    } catch (e) {
      st = JSON.parse(backup);
      notes.push('the internal re-fetch of the failed apps did not complete (' + ((e && e.code) || (e && e.message) || e) + ')');
    } finally { refetchBackup = null; }
  }

  function handleRunError(e) {
    const code = (e && e.code) || 'ERROR', error = { code, message: String((e && e.message) || e).slice(0, 300) };
    if (code === 'USAGE') return fail(e, 2);
    if (code === 'DEADLINE') return partial(3, { ctx: { incomplete: true }, fields: { incomplete: true } });
    if (code === 'RATE_LIMITED') return partial(1, { ctx: { error, stopSentence: `Apple is limiting requests from this network. Wait 15 minutes, then run: ${st.shell.resumeWith}` }, fields: { error } });
    if (code === 'REPLAY_MISS') return partial(1, { ctx: { error, stopSentence: 'a response is missing from the --replay folder (REPLAY_MISS); this run cannot be replayed offline' }, fields: { error } });
    if (code === 'NETWORK') return partial(3, { ctx: { incomplete: true, error }, fields: { error, incomplete: true } });
    return partial(1, { ctx: { error, stopSentence: 'the run failed (' + code + '); give the user error.message and resumeWith' }, fields: { error } });
  }
})().catch(crash);

// ---------------------------------------------------------------- helpers
function q(x) { return /^[\w./,=:@+-]+$/.test(String(x)) ? String(x) : `"${String(x).replace(/(["\\$`])/g, '\\$1')}"`; }
function runCmd(out) { // this command without --resume/--deliver-anyway, every path absolute
  const a = [mode].concat(pos.slice(0, -1).map((p, i) => (mode === 'rerun' && i === 0 ? path.resolve(p) : p)), [out]);
  for (const k of Object.keys(VAL)) if (f[k] !== undefined) a.push('--' + k, k === 'record' || k === 'replay' ? path.resolve(f[k]) : f[k]);
  for (const k of ['primary-only', 'smar-compat', 'bulk', 'per-app', 'all', 'emit-both', 'until-done']) if (f[k]) a.push('--' + k);
  return ['node', __filename].concat(a.map(q)).join(' ');
}
function isEmptyDir(p) { try { return fs.statSync(p).isDirectory() && fs.readdirSync(p).length === 0; } catch (e) { return false; } }
// reviews pace of THIS call: apps finished since it started (progressStart = counts when the crawl began)
function pace(s, t0) {
  let p = null;
  try { p = A && A.progress ? A.progress(s) : null; } catch (e) { return null; }
  if (!p || p.apps == null) return p;
  // work fraction done in this call (apps finished + pages held of the apps in progress; several apps run at once)
  const sec = (Date.now() - t0) / 1000, dw = (p.fraction || 0) - (progressStart && progressStart.fraction != null ? progressStart.fraction : 0);
  if (dw > 0.02 && sec >= 10) { p.secondsPerApp = Math.round(sec / (dw * p.apps)); p.etaMinutes = Math.max(1, Math.round(((1 - p.fraction) * sec / dw) / 60)); }
  return p;
}
function progressLine(s, t0) { // one short line: elapsed time, what is left, rows so far (reviews: apps done, pace)
  const sec = Math.round((Date.now() - t0) / 1000);
  let left = '';
  try { left = A && A.remaining ? A.remaining(s) : ''; } catch (e) { /* partial state */ }
  const p = pace(s, t0);
  const rows = p ? p.rows : (Array.isArray(s.rows) ? s.rows.length : 0);
  const eta = p && p.etaMinutes != null && p.appsDone < p.apps ? `; about ${p.etaMinutes} min left at ~${p.secondsPerApp} s per app` : '';
  return `[run_appstore] ${Math.floor(sec / 60)}m${String(sec % 60).padStart(2, '0')}s: still running (${left || s.phase}); ${rows} rows so far${eta}; do not stop or background this command`;
}
function addReq(a, b) {
  const o = { itunes_api: 0, apple_other: 0, journalHits: 0, retries: 0, waitedSeconds: 0, rateLimited: 0 };
  for (const k of Object.keys(o)) o[k] = ((a && a[k]) || 0) + ((b && b[k]) || 0);
  return o;
}
// The saved run vs this command line: given fields must match; seed-time choices (compat for search/chart) too.
function signatureClash(s, ask) {
  const o = s.opts, J = JSON.stringify;
  if (ask.mode && ask.mode !== o.mode) return 'mode (' + ask.mode + ' vs ' + o.mode + ')';
  const given = (k) => ask[k] !== undefined;
  for (const [k, label] of [['term', 'search term'], ['collection', 'collection'], ['genre', 'genre'], ['num', '--num'], ['layout', '--layout'], ['country', '--country']]) if (given(k) && ask[k] !== o[k]) return label;
  if (given('apps') && J(ask.apps) !== J(o.apps)) return 'app list';
  if (given('ids') && J(ask.ids) !== J(o.ids)) return 'id list';
  if (!!ask.primaryOnly !== !!o.primaryOnly && ask.mode === 'search') return '--primary-only';
  if (ask.mode === 'reviews' && (!!ask.all !== !!o.all || !!ask.bulk !== !!o.bulk)) return '--all/--bulk';
  if (ask.compat && !o.compat && (o.mode === 'search' || o.mode === 'chart')) return '--smar-compat (it changes what is fetched for search and chart)';
  if (!ask.compat && o.compat && ask.mode) return '--smar-compat (the saved run used it; add it)';
  return null;
}
// blanked = summary.blankedColumns of a --deliver-anyway run: the per-app files blank the same drifted columns as OUT
function writePerApp(s, base, F, blanked) {
  const W = require('./as_writer.js'), R = require('./as_reviews.js'), files = [];
  const ROW_KEY = { reviewID: 'id', rating: 'score', reviewText: 'text', reviewURL: 'url', dateReviewed: 'updated', versionWhenReviewed: 'version' };
  const blank = Object.keys(blanked || {}).map((c) => ROW_KEY[c] || c);
  for (const ref of s.opts.apps) {
    const rs = s.reviews && s.reviews[ref];
    if (!rs || !rs.appId) continue;
    let rows = R.appRows(rs, { compat: !!s.opts.compat }).rows;
    if (blank.length) rows = rows.map((r) => { const x = Object.assign({}, r); for (const k of blank) if (k in x) x[k] = undefined; return x; });
    const ff = W.renderFile(rows, { layout: 'reviews', compat: !!s.opts.compat });
    if (ff.text == null) continue;
    const p = `${base}_${String(rs.appId).replace(/[^\w.-]/g, '_')}.csv`;
    F.atomicWrite(p, ff.text); files.push(p);
  }
  return files;
}
// rerun: reads ONLY appId, scrapedFrom and country (never data values) from a SMAR iOS or skill export.
function readPrevious(file, A) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { throw usageErr(`cannot read ${file}: ${e.code || e.message}`); }
  let rows;
  try { rows = A.parseCsv(text); } catch (e) { throw usageErr(`${file} is not a readable CSV: ${e.message}`); }
  if (!rows || !rows.length) throw usageErr(`${file} is empty`);
  const h = rows[0].map((x) => String(x).trim()), ai = h.indexOf('appId'), si = h.indexOf('scrapedFrom'), ci = h.indexOf('country');
  if (ai < 0) throw usageErr(`${file} has no appId column (a reviews CSV cannot be rerun; header: ${h.slice(0, 6).join(',')}...)`);
  const ids = [], seen = new Set(), badId = [], badLab = [], countries = new Set();
  let dup = 0;
  rows.slice(1).forEach((r, i) => {
    if (r.length === 1 && r[0] === '') return;
    const id = String(r[ai] == null ? '' : r[ai]).trim();
    if (!A.isBundleId(id) && !A.isNumId(id)) { badId.push(`row ${i + 2}: "${id.slice(0, 40)}"`); return; }
    const lab = si < 0 ? SRC.keyword : String(r[si] == null ? '' : r[si]).trim();
    if (si >= 0 && !Object.values(SRC).includes(lab)) badLab.push(`row ${i + 2}: "${lab.slice(0, 30)}"`);
    if (ci >= 0 && String(r[ci] || '').trim()) countries.add(String(r[ci]).trim().toUpperCase());
    if (seen.has(id.toLowerCase())) { dup++; return; }
    seen.add(id.toLowerCase()); ids.push([id, lab]);
  });
  if (badId.length) throw usageErr(`${file}: ${badId.length} row(s) without a valid appId (${badId.slice(0, 3).join('; ')})`);
  if (badLab.length) throw usageErr(`${file}: scrapedFrom must be "keyword search" or "similar app links" (${badLab.slice(0, 3).join('; ')})`);
  if (!ids.length) throw usageErr(`${file} has no app rows`);
  if (countries.size > 1) throw usageErr(`${file} mixes countries (${[...countries].join(',')}); rerun needs one country`);
  return { ids, layout: si < 0 ? 'chart' : 'search', country: countries.size ? [...countries][0] : null, duplicates: dup };
}
