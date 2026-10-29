#!/usr/bin/env node
'use strict';
// Shell runner (v3): a thin CLI over the extract_play.js run engine (newState/seed/advance/outputs). Nothing fetched
// enters the agent's context: stdout is exactly ONE compact JSON line (at most COMPACT_MAX bytes: READY_TO_DELIVER, NEXT,
// csv, row and key counts, summaryFile) so a cut or tailed output never loses it; the full summary is summaryFile
// (pretty-printed). Rows and progress live on disk (atomic writes, lock).
//
//   node run_play.js search "<term>" OUT.csv [--primary-only] [--country XX] [--smar-compat] [--paths F] [--labels F]
//                                             [--until-done] [--resume [--deliver-anyway]] [--fresh] [--max-seconds N]
//   node run_play.js chart <CATEGORY|APPLICATION|""> OUT.csv --collection TOP_FREE|TOP_PAID|GROSSING [--num N] [common flags]
//   node run_play.js ids <id[,id=similar|id=keyword]...> OUT.csv [--source "keyword search"] [--layout chart] [common flags]
//     (rows say scrapedFrom "app id list" unless --source or =keyword/=similar labels them; --smar-compat: "keyword search")
//   node run_play.js rerun <previous.csv> OUT.csv [common flags]
//   node run_play.js refetch <id,...> OUT.csv
//   node run_play.js lookup "<app name>" [--country XX]
//   node run_play.js term "<user phrase>"        (SKILL.md step 2's TERM rule, applied deterministically; no network)
//   node run_play.js reviews <appId|id1,id2> OUT.csv [reviews_play.js flags]   (runs reviews_play.js)
//
// --until-done (SKILL.md's default): ONE call that keeps going inside the process (failed or withheld pages retried as a
//   --resume would, the summary's REFETCH / refetchOnce re-read once, a failed request resumed from the saved progress)
//   until NEXT is DELIVER, HEAL, FIX_ANCHOR or STOP, or the hard cap (--max-seconds, default UNTIL_DONE_CAP_S = 540 s,
//   inside a 600 s tool timeout) is reached (exit 3: run resumeWith). stderr gets at most one short progress line per
//   minute; stdout stays exactly one JSON summary.
// The progress file is never discarded: a leftover run is continued with --resume; files of an earlier run whose progress
//   file is missing are refused (exit 2) unless --fresh (the user asked to start that OUT over; never with --resume).
// --deliver-anyway refuses an unfinished run (exit 3, NEXT RESUME, nothing written).
// exit 0 finished (read READY_TO_DELIVER) | 1 fatal, resumable (read NEXT) | 2 usage/config | 3 incomplete
// (--max-seconds; repeat with --resume) | 4 locked (another run writes OUT; stop) | 5 crash (summary still printed).
// Files: OUT.csv only when READY_TO_DELIVER (or --resume --deliver-anyway), else <OUT>.NOT_READY.csv; <OUT>_relog.txt,
// <OUT>.summary.json (full summary), OUT.csv.progress.json (state), OUT.csv.pages/ (pages for heal.js), OUT.csv.lock.
// The output folder is created (mkdir -p) when it does not exist.
const fs = require('fs'), path = require('path');

const SKILL = path.dirname(__dirname);
const RP = 'node <SKILL>/scripts/run_play.js';
const USAGE = [
  RP + ' search "<term>" OUT.csv [--primary-only] [--country XX] [--smar-compat] [--paths F] [--labels F] [--until-done] [--resume [--deliver-anyway]] [--fresh] [--max-seconds N]',
  RP + ' chart <CATEGORY|APPLICATION> OUT.csv --collection TOP_FREE|TOP_PAID|GROSSING [--num N] [--country XX] [--smar-compat] [--paths F] [--labels F] [--until-done] [--resume [--deliver-anyway]] [--fresh] [--max-seconds N]',
  RP + ' ids <id[,id=similar|id=keyword]...> OUT.csv [--source "app id list"|"keyword search"|"similar app links"] [--layout chart] [--country XX] [--smar-compat] [--paths F] [--labels F] [--until-done] [--resume [--deliver-anyway]] [--fresh] [--max-seconds N]',
  RP + ' rerun <previous.csv> OUT.csv [--country XX] [--smar-compat] [--paths F] [--labels F] [--until-done] [--resume [--deliver-anyway]] [--fresh] [--max-seconds N]',
  RP + ' refetch <id,...> OUT.csv',
  RP + ' lookup "<app name>" [--country XX]',
  RP + ' term "<user phrase>"',
  RP + ' reviews <appId|id1,id2> OUT.csv [reviews_play.js flags]',
  'exit: 0 finished (see READY_TO_DELIVER) | 1 fatal, resumable (read NEXT) | 2 usage/config | 3 incomplete (repeat with --resume) | 4 locked | 5 crash',
];
const VAL = { country: 1, paths: 1, labels: 1, collection: 1, num: 1, source: 1, layout: 1, 'max-seconds': 1 };
const BOOL = { 'primary-only': 1, similar: 1, 'smar-compat': 1, resume: 1, 'deliver-anyway': 1, 'until-done': 1, fresh: 1 };
const UNTIL_DONE_CAP_S = 540; // --until-done default hard cap: one call fits a 600 s tool timeout
const PROGRESS_MS = 60000;    // --until-done: at most one stderr progress line per minute
const ERR_RETRIES = 3;        // --until-done: a failed request (not a rate limit) resumed from the saved progress
const ROUNDS = 2;             // --until-done: internal RESUME / RETRY_WITHHELD rounds after the crawl
const MODES = ['search', 'chart', 'ids', 'rerun', 'refetch', 'lookup', 'term', 'reviews'];
const COMPACT_MAX = 1500;     // stdout budget (bytes): survives `| tail -c 6000` and the like; details live in summaryFile
const SRC = { keyword: 'keyword search', similar: 'similar app links' };
const STOPS = { SORRY: 1, CONSENT: 1, INTERSTITIAL: 1, RATE_LIMITED: 1 };
// ids rows carry no search: unless the command labels them, they say where they came from (stress F8). Older engines
// labelled them "keyword search"; --smar-compat still writes that (SMAR labels a package-id search so).
const IDS_LABEL = 'app id list';
// a search term needs one visible character; the term step also ignores quote marks (stress WI-1)
const VISIBLE = /[^\s\p{Cc}\p{Cf}\p{M}\p{Default_Ignorable_Code_Point}\u2800]/u;
const VISIBLE_TERM = /[^\s"'`“”„‘’«»「」『』\p{Cc}\p{Cf}\p{M}\p{Default_Ignorable_Code_Point}\u2800]/u;
// file names (stress WI-5): the term step's slug is at most SLUG_MAX_BYTES (+ '_' and a 6-hex hash); OUT's own name is at
// most OUT_NAME_MAX_BYTES, so its longest derived name (OUT.lock.stale temp, OUT.progress.json temp: about +45 bytes)
// fits a 255-byte file-name limit (ext4 counts bytes, APFS UTF-16 units)
const SLUG_MAX_BYTES = 80, OUT_NAME_MAX_BYTES = 200;

let printed = false, release = null, st = null, P = null, S = null, F = null, mode = null, saveState = null, ticker = null;
const notes = [];
const stopTicker = () => { if (ticker) { clearInterval(ticker); ticker = null; } };
function emit(o, code) {
  if (!printed) {
    printed = true;
    stopTicker();
    if (notes.length && o && typeof o === 'object' && !o.notes && !o.details) o.notes = notes; // a compact line keeps notes only if they fit
    if (release) { try { release(); } catch (e) { /* ignore */ } release = null; }
    process.exitCode = code;
    process.stdout.write(JSON.stringify(o) + '\n', () => process.exit(code));
  }
}
const err = (msg, code, extra) => Object.assign(new Error(msg), { code }, extra || {});
const usageErr = (msg) => err(msg, 'USAGE');
const head = () => ({ skill: 'smar-playstore-agent', version: S ? S.VERSION : '3.1.0', runner: 'shell', mode });
function fail(e, code, extra) {
  const o = Object.assign(head(), { error: { code: (e && e.code) || 'ERROR', message: String((e && e.message) || e).slice(0, 400) } }, extra || {});
  if (code === 2 && !o.NEXT) o.NEXT = 'STOP: fix the command once from error.message (usage lists every form); if it fails again, tell the user.';
  if (code === 2 && !o.usage) { const u = USAGE.filter((l) => l.startsWith(RP + ' ' + mode + ' ')); o.usage = (u.length ? u.concat(USAGE.slice(-1)) : USAGE).join('\n'); }
  emit(o, code);
}
function crash(e) {
  if (printed) return;
  try { if (st && saveState) saveState(st); } catch (x) { /* best effort */ }
  fail(e, 5, { crash: true, resumeWith: st && st.shell ? st.shell.resumeWith : undefined, NEXT: 'STOP: the runner crashed; give the user error.message' + (st ? ' and resumeWith' : '') + '.' });
}
process.on('uncaughtException', crash);
process.on('unhandledRejection', crash);

// ---------------------------------------------------------------- arguments
const argv = process.argv.slice(2);
mode = argv[0];
if (mode === 'reviews') { // thin pass-through: reviews have their own runner (D5, C24)
  const cp = require('child_process');
  const r = cp.spawnSync(process.execPath, process.execArgv.concat([path.join(__dirname, 'reviews_play.js')], argv.slice(1)), { stdio: 'inherit' });
  if (r.error) { fail(r.error, 5, { crash: true, NEXT: 'STOP: could not start reviews_play.js; tell the user.' }); return; }
  if (r.signal) process.kill(process.pid, r.signal);
  process.exit(r.status == null ? 5 : r.status);
}
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
  if (!MODES.includes(mode)) return fail(usageErr(mode ? `unknown mode "${mode}"` : 'no mode given'), 2);
  if (parseError) return fail(usageErr(parseError), 2);
  try { S = require('./extract_play.js'); } catch (e) { return fail(err('cannot load extract_play.js: ' + e.message, 'USAGE'), 2); }
  if (!S || S.VERSION !== '3.1.0' || typeof S.advance !== 'function') return fail(usageErr('extract_play.js v3 (3.1.0) with the run engine is required next to run_play.js'), 2);

  // ---- per-mode flag rules (exit 2 before any network or state) ----
  const allowed = {
    search: ['country', 'paths', 'labels', 'max-seconds', 'primary-only', 'similar', 'smar-compat', 'resume', 'deliver-anyway', 'until-done', 'fresh'],
    chart: ['country', 'paths', 'labels', 'max-seconds', 'collection', 'num', 'smar-compat', 'resume', 'deliver-anyway', 'until-done', 'fresh'],
    ids: ['country', 'paths', 'labels', 'max-seconds', 'source', 'layout', 'smar-compat', 'resume', 'deliver-anyway', 'until-done', 'fresh'],
    rerun: ['country', 'paths', 'labels', 'max-seconds', 'smar-compat', 'resume', 'deliver-anyway', 'until-done', 'fresh'],
    refetch: ['country', 'paths', 'labels', 'smar-compat'],
    lookup: ['country'],
    term: [],
  }[mode];
  const bad = Object.keys(f).filter((k) => !allowed.includes(k));
  if (bad.length) return fail(usageErr(`--${bad[0]} does not apply to ${mode}`), 2);
  const wantPos = mode === 'lookup' || mode === 'term' ? 1 : 2;
  if (pos.length !== wantPos) return fail(usageErr(mode === 'lookup' ? 'lookup expects exactly one quoted app name' : mode === 'term' ? 'term expects exactly one quoted phrase (the words of the request that name what to search)' : `${mode} expects ${mode === 'search' ? '"<term>"' : mode === 'chart' ? '<CATEGORY>' : mode === 'rerun' ? '<previous.csv>' : '<ids>'} and OUT.csv (got ${pos.length} positional argument(s); quote multi-word terms)`), 2);
  if (f['deliver-anyway'] && !f.resume) return fail(usageErr('--deliver-anyway only works together with --resume on a finished run'), 2);
  if (f.fresh && (f.resume || f['deliver-anyway'])) return fail(usageErr('--fresh starts this OUT over; it cannot be combined with --resume or --deliver-anyway'), 2);
  if (f['max-seconds'] !== undefined && !(Number(f['max-seconds']) > 0)) return fail(usageErr('--max-seconds must be a positive number of seconds'), 2);
  if (f.similar) notes.push('--similar is a no-op: search expands with "related to <title>" searches by default (SMAR); use --primary-only to opt out');
  let country;
  if (f.country !== undefined) {
    country = String(f.country).trim().toUpperCase();
    if (!S.COUNTRIES.includes(country)) return fail(usageErr(`unknown --country "${f.country}" (a two-letter code SMAR supports, e.g. US, GB, DE)`), 2);
  }

  // ---- term: SKILL.md step 2's TERM rule, deterministic; no network, no files ----
  if (mode === 'term') {
    try { return emit(Object.assign(head(), resolveTerm(pos[0], S)), 0); } catch (e) { return fail(e.code ? e : usageErr(String(e.message || e)), 2); }
  }

  const net = { base: 'https://play.google.com', init: { redirect: 'follow' } };
  if (typeof globalThis.fetch !== 'function') return fail(usageErr('Node 18 or newer is required (global fetch)'), 2);
  const sleep = (ms) => new Promise((z) => setTimeout(z, ms));
  const io = { get: S.makeGet(globalThis.fetch, net), post: S.makePost(globalThis.fetch, net), now: () => Date.now(), sleep };

  // ---- lookup: no files, no lock ----
  if (mode === 'lookup') {
    const name = String(pos[0] || '').trim();
    if (!name) return fail(usageErr('lookup needs a non-empty app name'), 2);
    try {
      const r = await S.lookup(io, name, { country: country || 'US' });
      return emit(Object.assign(head(), { name, country: country || 'US' }, r), 0);
    } catch (e) {
      if (e && e.code === 'USAGE') return fail(e, 2);
      return fail(e, 1, { NEXT: STOPS[e && e.code] ? `STOP: Google answered with a rate-limit or interstitial page (${e.code}); tell the user and try later.` : 'STOP: the lookup request failed; tell the user (error.message).' });
    }
  }

  // ---- the run options this command asks for (validated before any state) ----
  if (/^~(?:[/\\]|$)/.test(pos[1])) return fail(usageErr(`OUT.csv "${pos[1]}" starts with ~, which is not expanded here (it would create a folder named ~); use an absolute path`), 2);
  const out = path.resolve(pos[1]);
  // every file derived from OUT (OUT.progress.json, OUT.lock, .NOT_READY.csv, their temp files) must fit a 255-byte name
  const outBytes = Buffer.byteLength(path.basename(out));
  if (outBytes > OUT_NAME_MAX_BYTES) return fail(usageErr(`the output file name is too long (${outBytes} bytes; at most ${OUT_NAME_MAX_BYTES}): use a shorter name (the term command's slug is short enough)`), 2);
  if (fs.existsSync(out) && fs.statSync(out).isDirectory()) return fail(usageErr('OUT.csv must be a file path, not a directory'), 2);
  if (!fs.existsSync(path.dirname(out))) { // OUT_DIR is created here (mkdir -p), never by the agent
    if (mode === 'refetch' || f['deliver-anyway']) return fail(usageErr(`no finished run for ${out} (its folder ${path.dirname(out)} does not exist)`), 2, { NEXT: 'STOP: there is no finished run to deliver (its progress file is missing); tell the user. Never delete or edit progress files.' });
    try { fs.mkdirSync(path.dirname(out), { recursive: true }); notes.push('created the output folder ' + path.dirname(out)); } catch (e) { return fail(usageErr(`cannot create the output folder ${path.dirname(out)} (${e.code || e.message})`), 2); }
  }
  if (!fs.statSync(path.dirname(out)).isDirectory()) return fail(usageErr('the output folder is not a folder: ' + path.dirname(out)), 2);
  const base = out.replace(/\.csv$/i, '');
  const FILES = { final: out, not_ready: base + '.NOT_READY.csv', relog: base + '_relog.txt', summary: base + '.summary.json' };
  P = out + '.progress.json';
  const pagesDir = out + '.pages';
  const readJsonFile = (flag) => { try { return JSON.parse(fs.readFileSync(path.resolve(f[flag]), 'utf8')); } catch (e) { throw usageErr(`--${flag} ${f[flag]}: ${e.code === 'ENOENT' ? 'file not found' : 'not valid JSON (' + e.message + ')'}`); } };
  const ask = { mode: mode === 'refetch' ? null : mode }; // undefined = not given on this command line (inherited on --resume)
  try {
    if (f.paths !== undefined) ask.paths = readJsonFile('paths');
    if (f.labels !== undefined) ask.labels = readJsonFile('labels');
    if (mode === 'search') {
      ask.term = pos[0];
      if (!String(ask.term).trim()) throw usageErr('search needs a non-empty term');
      if (!VISIBLE.test(String(ask.term))) throw usageErr('search needs a visible term (this one holds only invisible characters); run term on the user\'s phrase first');
      if (f['primary-only']) ask.similar = false;
    } else if (mode === 'chart') {
      if (f.collection === undefined) throw usageErr('chart needs --collection TOP_FREE|TOP_PAID|GROSSING');
      let C;
      try { C = require('./chart_fetch.js'); } catch (e) { throw usageErr('chart mode needs chart_fetch.js next to run_play.js: ' + e.message); }
      const n = C.normalize({ collection: f.collection, category: pos[0], num: f.num, country: country || 'US' });
      if (/^(topselling|topgrossing)/i.test(String(f.collection))) notes.push(`--collection ${f.collection} read as ${n.collection}`);
      Object.assign(ask, { category: n.category, collection: n.collection });
      if (f.num !== undefined) ask.num = n.num;
    } else if (mode === 'ids') {
      if (f.source !== undefined && !Object.values(SRC).concat(IDS_LABEL).includes(f.source)) throw usageErr('--source must be "app id list" (the default), "keyword search" or "similar app links"');
      if (f.layout !== undefined && !['chart', 'search'].includes(f.layout)) throw usageErr('--layout must be chart or search');
      const src = f.source || IDS_LABEL, list = [];
      for (const tok of String(pos[0]).split(',').map((t) => t.trim()).filter(Boolean)) {
        const k = tok.indexOf('='), id = (k < 0 ? tok : tok.slice(0, k)).trim(), lab = k < 0 ? null : tok.slice(k + 1).trim();
        if (lab !== null && !SRC[lab]) throw usageErr(`unknown label "=${lab}" after ${id} (use =keyword or =similar)`);
        list.push([id, lab ? SRC[lab] : src]);
      }
      const badIds = list.filter(([id]) => !S.isAppId(id)).map(([id]) => id);
      if (badIds.length) throw usageErr('not app ids: ' + badIds.slice(0, 5).join(' '));
      if (!list.length) throw usageErr('ids: empty id list');
      ask.ids = list; if (f.source !== undefined) ask.source = f.source; if (f.layout !== undefined) ask.layout = f.layout;
    } else if (mode === 'rerun') {
      const r = readPrevious(path.resolve(pos[0]));
      if (country && r.country && r.country !== country) throw usageErr(`${pos[0]} was scraped for country ${r.country}, but --country is ${country}; drop --country or use the same one`);
      if (!country && r.country) country = r.country;
      Object.assign(ask, { ids: r.ids, layout: r.layout, from: path.resolve(pos[0]) });
      if (r.duplicates) notes.push(`${r.duplicates} duplicate appId row(s) in ${pos[0]} are fetched once`);
    } else if (mode === 'refetch') {
      ask.refetchIds = String(pos[0]).split(',').map((t) => t.trim()).filter(Boolean);
      if (!ask.refetchIds.length || ask.refetchIds.some((id) => !S.isAppId(id))) throw usageErr('refetch needs a comma-separated list of app ids');
    }
    if (country) ask.country = country;
    if (f['smar-compat']) ask.compat = true;
  } catch (e) { return fail(e.code ? e : usageErr(String(e.message || e)), 2); }

  // ---- lock, then load or create the progress file ----
  try { F = require('./fsutil.js'); } catch (e) { return fail(err('cannot load fsutil.js next to run_play.js: ' + e.message, 'USAGE'), 2); }
  try { release = F.lock(out); } catch (e) {
    if (e.code === 'LOCKED') return fail(e, 4, { NEXT: `STOP: another run is writing ${out}; do not start a second one; tell the user.` });
    throw e;
  }
  saveState = (s) => { s.rev = (s.rev || 0) + 1; F.atomicWriteJson(P, s); };
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
    const o = Object.assign({}, ask, { similar: ask.similar, country: ask.country || 'US' });
    delete o.refetchIds;
    try { st = S.newState(o); } catch (e) { return fail(e.code ? e : usageErr(String(e.message)), 2); }
  } else {
    const newFile = `STOP: the progress file of this run (${path.basename(P)}) cannot be used; never delete or edit it. Run the same command without --resume into a NEW output file (add _2 before .csv) and tell the user.`;
    try { st = JSON.parse(fs.readFileSync(P, 'utf8')); } catch (e) { st = null; return fail(usageErr(`the progress file ${P} is unreadable (${e.message}); start a NEW output file`), 2, { NEXT: newFile }); }
    if (!st || typeof st !== 'object' || st.v !== 3 || !st.opts) { st = null; return fail(usageErr(`the progress file ${P} is from an older version or another kind of run; start a NEW output file`), 2, { NEXT: newFile }); }
    const clash = signatureClash(st, ask);
    if (clash) { const o = st.opts; st = null; return fail(usageErr(`--resume with a different ${clash} than the saved run (${o.mode} ${JSON.stringify(o.term || o.category || (o.ids || []).length + ' ids')}, country ${o.country})`), 2, { NEXT: 'STOP: use the identical command, or a NEW output file.' }); }
    if (ask.compat && !st.opts.compat) st.opts.compat = true; // write-time only (C29 c runs keep their seed-time choice)
  }
  st.shell = Object.assign({}, st.shell || {}, {
    pathsFile: f.paths !== undefined ? path.resolve(f.paths) : (st.shell || {}).pathsFile,
    labelsFile: f.labels !== undefined ? path.resolve(f.labels) : (st.shell || {}).labelsFile,
  });
  if (mode !== 'refetch' || !st.shell.cmd) st.shell.cmd = runCmd();
  st.shell.resumeWith = st.shell.cmd + ' --resume';
  // NEXT's RESUME/RETRY commands are the identical command line (absolute paths) plus --resume
  const ctxBase = () => ({ runner: 'shell', out, skill: SKILL, cmd: st.shell.cmd, resumeWith: st.shell.resumeWith, pathsFile: st.shell.pathsFile, summaryFile: FILES.summary, compat: !!st.opts.compat });

  // ---- pages kept for heal.js (RUN3) ----
  let keptPages = 0;
  try { keptPages = fs.readdirSync(pagesDir).filter((n) => n.endsWith('.html')).length; } catch (e) { /* none yet */ }
  const saveHtml = process.env.SMAR_SAVE_HTML ? path.resolve(process.env.SMAR_SAVE_HTML) : null;
  io.keepHtml = (id, html, info) => {
    try {
      const file = path.join(pagesDir, id + '.html'), had = fs.existsSync(file);
      if (had || keptPages < 10 || (info && (info.errors || info.unverified))) {
        if (!fs.existsSync(pagesDir)) fs.mkdirSync(pagesDir, { recursive: true });
        F.atomicWrite(file, html); if (!had) keptPages++;
      }
      if (saveHtml) { fs.mkdirSync(saveHtml, { recursive: true }); F.atomicWrite(path.join(saveHtml, id + '.html.gz'), require('zlib').gzipSync(html)); }
    } catch (e) { /* pages are a convenience for heal.js; never fail the run over them */ }
  };
  io.save = saveState;
  if (st.opts.mode === 'chart') {
    const C = require('./chart_fetch.js');
    io.chart = (o) => C.fetchChart(Object.assign({}, o, { post: io.post }));
  }

  // ---- outputs (the engine's outputs() is the only byte producer) ----
  const removeStale = (keep) => { for (const p of [FILES.final, FILES.not_ready]) if (p !== keep && fs.existsSync(p)) { try { fs.unlinkSync(p); } catch (e) { /* ignore */ } } };
  const writeSummary = (sum) => F.atomicWrite(FILES.summary, JSON.stringify(sum, null, 1) + '\n'); // pretty: an agent reads it
  function finish(extra) {
    const o = S.outputs(st, Object.assign(ctxBase(), { deliverAnyway: !!f['deliver-anyway'] }));
    const sum = JSON.parse(o.summaryJson);
    let csvFile = null;
    if (o.csv != null) { csvFile = o.csvName === 'final' ? FILES.final : FILES.not_ready; F.atomicWrite(csvFile, o.csv); }
    removeStale(csvFile);
    F.atomicWrite(FILES.relog, o.relog);
    Object.assign(sum, { csv: csvFile, csvRows: o.rows, relog: FILES.relog, summaryFile: FILES.summary }, fs.existsSync(pagesDir) ? { pages: pagesDir } : {}, extra || {});
    if (csvFile === null && sum.rows && !sum.emptyReason) sum.csvNote = 'no CSV: ' + (o.compatExact && !o.compatExact.ok ? 'smar-tool.org returns no file for this request (compatExact)' : 'nothing to write');
    if (st.opts.mode === 'search' && !st.opts.similar) sum.primaryOnly = 'not a SMAR deliverable: SMAR always adds the "related to <title>" apps';
    if (notes.length) sum.notes = notes;
    writeSummary(sum);
    emit(compact(sum), 0);
  }
  function partial(code, extra) { // exit 1/3: no CSV for an unfinished run; stale outputs of this run are removed
    const sum = S.summarize(st, Object.assign(ctxBase(), extra && extra.error ? { error: extra.error } : {}));
    removeStale(null);
    Object.assign(sum, { csv: null, progress: P }, extra || {});
    if (!sum.resumeWith && !(sum.pageDrift || {}).progressRows) sum.resumeWith = st.shell.resumeWith; // an inconsistent progress file is never resumed
    if (notes.length) sum.notes = notes;
    try { writeSummary(sum); } catch (e) { delete sum.summaryFile; }
    emit(compact(sum), code);
  }
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { if (!printed) partial(3, { interrupted: sig }); });

  // ---- deliver-anyway / refetch: no new crawling ----
  if (f['deliver-anyway']) { // refuses an unfinished run: there is nothing to deliver until it finishes
    if (!S.isDone(st)) return partial(3, { incomplete: true, refused: '--deliver-anyway needs a finished run; this run is not finished, so nothing was written. Run resumeWith (without --deliver-anyway) until it finishes.' });
    return finish();
  }
  if (mode === 'refetch') {
    if (!st.rows.length) return fail(usageErr('the progress file has no rows to refetch'), 2);
    if (!S.isDone(st)) return fail(usageErr('the run is not finished; run the original command with --resume first'), 2);
    let res;
    try { res = await S.refetch(st, io, ask.refetchIds); } catch (e) { return handleRunError(e); }
    return finish({ refetchResults: res });
  }

  // ---- crawl ----
  // FI-12: a progress file whose rows disagree with its own bookkeeping (apps marked done without a row, duplicate rows, listed
  // apps neither done nor queued: edited, rolled back or copied) is never crawled further; the summary's NEXT is STOP
  // (pageDrift.progressRows) and nothing is delivered.
  if (haveProgress && typeof S.progressCheck === 'function' && S.progressCheck(st).bad) return finish();
  // RUN5: --resume (and --until-done, internally) retries pages that failed to load or came from another storefront
  const retryLeftovers = () => {
    let n = 0;
    if (st.fetchFailed.length && st.fetchFailed.some((q) => (st.failRounds[q[0]] || 0) < 2)) { const k = S.requeue(st, 'fetchFailed'); n += k; notes.push(`retrying ${k} app page(s) that failed to load`); }
    if (st.wrongStorefront.length && st.wrongStorefront.some((w) => (st.withheldRounds[w.id || 'search:' + w.q] || 0) < 1)) { const k = S.requeue(st, 'wrongStorefront'); n += k; notes.push(`retrying ${k} withheld page(s) (wrong storefront or not available)`); }
    return n;
  };
  if (haveProgress && st.seeded) retryLeftovers();
  saveState(st);
  const untilDone = !!f['until-done'], t0 = Date.now();
  const endAt = t0 + (f['max-seconds'] !== undefined ? Number(f['max-seconds']) * 1000 : untilDone ? UNTIL_DONE_CAP_S * 1000 : Infinity);
  const left = () => endAt - Date.now();
  if (untilDone) { // at most one short progress line per minute on stderr (stdout stays one JSON object)
    ticker = setInterval(() => { try { process.stderr.write(progressLine(st, t0) + '\n'); } catch (e) { /* never break the run */ } }, PROGRESS_MS);
    if (ticker.unref) ticker.unref();
  }
  let r, errRetries = 0, rounds = 0, refetched = false;
  for (;;) {
    try { r = await S.advance(st, io, { deadlineMs: left() }); } catch (e) {
      // --until-done: a failed request (after makeGet's own retries; never a rate limit or interstitial) resumes from the
      // saved progress, as --resume would
      if (!untilDone || !e || STOPS[e.code] || e.code === 'USAGE' || errRetries >= ERR_RETRIES || left() < 45000) return handleRunError(e);
      errRetries++; notes.push(`resumed after a failed request (${e.code || 'ERROR'})`);
      await sleep(15000);
      try { const keep = st.shell; st = JSON.parse(fs.readFileSync(P, 'utf8')); st.shell = keep; } catch (x) { return handleRunError(e); }
      continue;
    }
    if (!r.done) return partial(3, { incomplete: true, seconds: Math.round((Date.now() - t0) / 1000) });
    if (!untilDone || left() < 30000) break;
    // what NEXT would have the agent run, done here: RESUME / RETRY_WITHHELD (retry rounds), REFETCH / refetchOnce (once)
    const sm = S.summarize(st, ctxBase()), nx = String(sm.NEXT || '');
    if (/^(RESUME|RETRY_WITHHELD):/.test(nx) && rounds < ROUNDS) { rounds++; await sleep(10000); if (retryLeftovers()) { saveState(st); continue; } break; }
    const rf = /^REFETCH:/.test(nx) ? nx : /^DELIVER/.test(nx) && sm.refetchOnce ? sm.refetchOnce : '', ids = (/run_play\.js refetch (\S+) /.exec(rf) || [])[1];
    if (ids && !refetched) {
      refetched = true;
      try { await S.refetch(st, io, ids.split(',').slice(0, 50)); notes.push('re-fetched once the app(s) the summary asked to re-fetch'); } catch (e) { return handleRunError(e); }
      continue;
    }
    break;
  }
  stopTicker();
  return finish();

  function handleRunError(e) {
    try { saveState(st); } catch (x) { /* keep the original error */ }
    const code = (e && e.code) || 'ERROR', error = { code, message: String((e && e.message) || e).slice(0, 300) };
    if (code === 'USAGE') return fail(e, 2);
    return partial(1, { fatal: error.message, error });
  }
  function runCmd() { // this command without --resume/--deliver-anyway, every path absolute
    const q = (x) => (/^[\w./,=:@+-]+$/.test(x) ? x : `"${String(x).replace(/(["\\$`])/g, '\\$1')}"`);
    const a = [mode, mode === 'rerun' ? path.resolve(pos[0]) : pos[0], out];
    for (const k of Object.keys(VAL)) if (f[k] !== undefined) a.push('--' + k, k === 'paths' || k === 'labels' ? path.resolve(f[k]) : f[k]);
    for (const k of ['primary-only', 'smar-compat', 'until-done']) if (f[k]) a.push('--' + k);
    return ['node', __filename].concat(a.map(q)).join(' ');
  }
})().catch(crash);

// ---------------------------------------------------------------- helpers
// The stdout line of a run (exit 0, 1 or 3): what step 4 needs, at most COMPACT_MAX bytes; NEXT is never cut. Everything
// else (step 6) is in summaryFile. Optional parts are dropped in order until the line fits.
function compact(s) {
  const total = (v) => (Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.values(v).reduce((a, b) => a + (Number(b) || 0), 0) : v);
  const c = { skill: s.skill, version: s.version, runner: s.runner, mode: s.mode };
  for (const k of ['READY_TO_DELIVER', 'NEXT', 'csv', 'csvRows', 'rows', 'summaryFile', 'resumeWith', 'refetchOnce', 'incomplete', 'remaining', 'refused', 'interrupted', 'error', 'crash', 'csvNote', 'emptyReason', 'noResults', 'deliveredAnyway']) if (s[k] !== undefined) c[k] = s[k];
  const k = {};
  if (s.bySource) k.bySource = s.bySource;
  if (s.chart) k.chartRanks = s.chart.ranks;
  if (s.uniqueAppIds !== undefined) k.uniqueAppIds = s.uniqueAppIds;
  for (const [name, v] of [['notFound', s.notFound], ['fetchFailed', s.fetchFailed], ['wrongStorefront', s.wrongStorefront && s.wrongStorefront.withheld], ['undefinedCells', s.undefinedCounts], ['quarantinedCells', s.quarantinedCells], ['problems', s.problems], ['smarWouldDrop', s.smarWouldDrop && s.smarWouldDrop.count], ['smarChartHttp500Apps', s.smarChartHttp500Apps && s.smarChartHttp500Apps.count]]) if (v !== undefined && v !== null) k[name] = total(v);
  c.counts = k;
  if (s.run) c.run = s.run;
  if (s.notes) c.notes = s.notes;
  c.details = s.summaryFile ? 'every other field (step 6) is in summaryFile; read it there' : 'no summaryFile was written';
  const size = () => Buffer.byteLength(JSON.stringify(c));
  const drop = [() => { if (c.notes) c.notes = c.notes.map((n) => String(n).slice(0, 80)); }, () => delete c.notes, () => delete c.run, () => delete k.bySource, () => delete c.csvNote,
    () => { if (c.error) c.error = { code: c.error.code, message: String(c.error.message || '').slice(0, 160) }; }, () => delete c.counts, () => { if (c.resumeWith && String(c.NEXT || '').includes(c.resumeWith)) delete c.resumeWith; },
    () => { if (c.refetchOnce) { delete c.refetchOnce; c.refetchOnceIn = 'summaryFile'; } }, () => delete c.details];
  for (const f of drop) { if (size() <= COMPACT_MAX) break; f(); }
  return c;
}
// SKILL.md step 2's TERM rule, applied to the words of the request that name what to search (copied as the user wrote
// them): a labelled term (keyword: X, term: X, search term: X, query: X) or a quoted term ("X", “X”) is used verbatim;
// a package id is the term; otherwise trailing sentence punctuation and a trailing generic "app"/"apps" are dropped,
// except a capitalised "App" after a capitalised word (part of a name: Cash App). Words are never added, reordered,
// pluralised, translated or spell-corrected.
function resolveTerm(phrase, S) {
  const raw = String(phrase == null ? '' : phrase), p = raw.trim();
  if (!p) throw usageErr('term needs a non-empty phrase');
  // A term is anything with a visible character: emoji and symbol-only searches (🧘, &, %) are searches the store and
  // SMAR's search box both answer (stress WI-1). Only quote marks, spaces and invisible characters hold no term.
  const out = (term, rule, x) => {
    if (!VISIBLE_TERM.test(term)) throw usageErr(`the phrase ${JSON.stringify(raw)} holds only quote marks or invisible characters: there is no term to search for`);
    return Object.assign({ phrase: raw, term, slug: slugOf(term), rule }, x || {});
  };
  const PAIR = { '"': '"', '“': '”', "'": "'", '‘': '’', '`': '`' };
  const unwrap = (t) => { const m = /^(["“'‘`])([\s\S]*)(["”'’`])$/.exec(t); return m && PAIR[m[1]] === m[3] && m[2].trim() && !(m[1] !== "'" && m[2].includes(m[3])) ? m[2] : null; };
  // every quoted term in the text: double/curly quotes anywhere; single quotes only around whole words of 2+
  // characters ('yoga' or 'pilates'), so apostrophes (Don't, Tom's, rock 'n' roll) never count
  const quotedIn = (t) => { const q = []; const re = /"([^"]+)"|“([^”]+)”|(?:^|[\s(])['‘]([^'‘’\s][^'‘’]*?[^'‘’\s])['’](?=$|[\s).,;:!?])/g; let m;
    while ((m = re.exec(t))) q.push(m[1] != null ? m[1] : m[2] != null ? m[2] : m[3]);
    return q; };
  const ask = (q) => ({ phrase: raw, term: null, candidates: q, rule: 'more than one quoted term', NEXT: 'STOP: the phrase holds ' + q.length + ' quoted terms; show candidates and ask the user which one to search.' });
  if (/^(?:search\s+terms?|keywords?|terms?|query|search)\s*[:=]\s*$/i.test(p)) throw usageErr(`the phrase ${JSON.stringify(raw)} is a label with no term after it`);
  const lab = /^(?:search\s+terms?|keywords?|terms?|query|search)\s*[:=]\s*([\s\S]+)$/i.exec(p);
  if (lab) { const t = lab[1].trim(), lq = quotedIn(t); if (lq.length > 1) return ask(lq); const u = unwrap(t); return out(u != null ? u : t, 'labelled term, used verbatim'); }
  const all = quotedIn(p);
  if (all.length > 1) return ask(all);
  if (all.length === 1) return out(all[0], 'quoted term, used verbatim');
  const w = unwrap(p);
  if (w != null) return out(w, 'quoted term, used verbatim');
  if (S.isAppId(p)) return out(p, 'package id, used as the term');
  const q = p.replace(/[.,;:!?。、，；：！？…]+$/u, '').trim() || p;
  const g = /^(.*\S)\s+(apps?)$/i.exec(q);
  if (g) {
    const prev = g[1].split(/\s+/).pop(), name = /^App$|^APP$/.test(g[2]) && /^[A-Z0-9]/.test(prev);
    if (name) return out(q, 'kept "' + g[2] + '": a capitalised App after a capitalised word is part of a name');
    return out(g[1], 'dropped the trailing generic "' + g[2] + '"');
  }
  return out(q, q === p ? 'used as written' : 'used as written (trailing punctuation dropped)');
}
// The file-name slug of a term (SKILL.md step 2 `<slug>`). A plain term (a-z, 0-9 and single spaces, any case) keeps the
// earlier rule: lower case, each space -> '_' ("Fitness Tracking" -> fitness_tracking). Anything else is lossy and gets a
// short hash of the exact term, so "c++", "c#" and "c", "a,b" and "a b", "to-do list" and "to do list" never share an
// output file and its resume state (stress WI-6); a non-Latin term keeps its Unicode letters (and, as before, its hash);
// a term with no letter or digit (🧘, &) is 'x' plus the hash. A long term is cut to SLUG_MAX_BYTES and hashed (WI-5).
function slugOf(term) {
  const t = String(term).normalize('NFC'), lower = t.toLowerCase(), ascii = /^[\x20-\x7e]*$/.test(t);
  let base = (ascii ? lower.replace(/[^a-z0-9]+/g, '_') : lower.replace(/(?:[^\p{L}\p{N}\p{M}]|\p{Default_Ignorable_Code_Point})+/gu, '_').replace(/(^|_)\p{M}+/gu, '$1'))
    .replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'x';
  let lossy = !ascii || !/^[a-z0-9]+(?: [a-z0-9]+)*$/.test(lower);
  if (Buffer.byteLength(base) > SLUG_MAX_BYTES) {
    let cut = '', n = 0;
    for (const ch of base) { const k = Buffer.byteLength(ch); if (n + k > SLUG_MAX_BYTES) break; cut += ch; n += k; }
    base = cut.replace(/\p{M}+$/u, '').replace(/_+$/, '') || 'x';
    lossy = true;
  }
  return lossy ? base + '_' + require('crypto').createHash('sha256').update(t).digest('hex').slice(0, 6) : base;
}
function isEmptyDir(p) { try { return fs.statSync(p).isDirectory() && fs.readdirSync(p).length === 0; } catch (e) { return false; } }
function progressLine(s, t0) { // one short line: elapsed time, what is left, rows so far
  const sec = Math.round((Date.now() - t0) / 1000), q = (s.queue || []).length + (s.recheck || []).length;
  return `[run_play] ${Math.floor(sec / 60)}m${String(sec % 60).padStart(2, '0')}s: still running (${s.seeded ? q + ' app page(s) queued' : 'starting'}); ${Array.isArray(s.rows) ? s.rows.length : 0} rows so far; do not stop or background this command`;
}
// The saved run vs this command line: positional arguments must match; flags must match when given, else inherited.
function signatureClash(st, ask) {
  const o = st.opts, J = JSON.stringify;
  if (ask.mode && ask.mode !== o.mode) return 'mode (' + ask.mode + ')';
  const fresh = (k) => ask[k] !== undefined;
  if (fresh('term') && ask.term !== o.term) return 'search term';
  if (fresh('category') && ask.category !== o.category) return 'category';
  if (fresh('collection') && ask.collection !== o.collection) return 'collection';
  if (fresh('num') && ask.num !== o.num) return '--num';
  if (fresh('ids') && J(ask.ids) !== J(o.ids)) {
    // a run started before ids rows got their own label saved the default as "keyword search": same command, same run
    const legacy = ask.ids.map(([id, lab]) => [id, lab === IDS_LABEL ? SRC.keyword : lab]);
    if (ask.mode !== 'ids' || ask.source !== undefined || J(legacy) !== J(o.ids)) return 'id list';
    ask.ids = o.ids;
  }
  if (fresh('layout') && ask.layout !== o.layout) return 'layout';
  if (fresh('country') && ask.country !== o.country) return '--country';
  if (fresh('similar') && ask.similar !== o.similar) return 'similar-app expansion (--primary-only)';
  if (fresh('paths') && S.canonPaths(ask.paths) !== J(o.paths)) return '--paths';
  if (fresh('labels') && J(S.newState({ mode: 'ids', ids: ['a.b'], labels: ask.labels }).opts.labels) !== J(o.labels)) return '--labels';
  return null;
}
function parseCsv(t) { // RFC 4180: quoted cells, "" escapes, commas and newlines inside quotes; BOM stripped
  const rows = []; let row = [], cell = '', q = false;
  t = t.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (q) throw usageErr('unterminated quoted cell');
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}
// rerun: reads ONLY appId, scrapedFrom and country (never data values) from a SMAR or skill export.
function readPrevious(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { throw usageErr(`cannot read ${file}: ${e.code || e.message}`); }
  let rows;
  try { rows = parseCsv(text); } catch (e) { throw usageErr(`${file} is not a readable CSV: ${e.message}`); }
  if (!rows.length) throw usageErr(`${file} is empty`);
  const h = rows[0].map((x) => x.trim()), ai = h.indexOf('appId'), si = h.indexOf('scrapedFrom'), ci = h.indexOf('country');
  if (ai < 0) throw usageErr(`${file} has no appId column (header: ${h.slice(0, 6).join(',')}...)`);
  const ids = [], seen = new Set(), badId = [], badLab = [], countries = new Set();
  let dup = 0;
  rows.slice(1).forEach((r, i) => {
    const id = String(r[ai] == null ? '' : r[ai]).trim();
    if (!S.isAppId(id)) { badId.push(`row ${i + 2}: "${id.slice(0, 40)}"`); return; }
    const lab = si < 0 ? 'chart' : String(r[si] == null ? '' : r[si]).trim();
    if (si >= 0 && !Object.values(SRC).concat(IDS_LABEL).includes(lab)) badLab.push(`row ${i + 2}: "${lab.slice(0, 30)}"`);
    if (ci >= 0 && String(r[ci] || '').trim()) countries.add(String(r[ci]).trim().toUpperCase());
    if (seen.has(id)) { dup++; return; }
    seen.add(id); ids.push([id, lab]);
  });
  if (badId.length) throw usageErr(`${file}: ${badId.length} row(s) without a valid appId (${badId.slice(0, 3).join('; ')})`);
  if (badLab.length) throw usageErr(`${file}: scrapedFrom must be "keyword search", "similar app links" or "app id list" (${badLab.slice(0, 3).join('; ')})`);
  if (!ids.length) throw usageErr(`${file} has no app rows`);
  if (countries.size > 1) throw usageErr(`${file} mixes countries (${[...countries].join(',')}); rerun needs one country`);
  const country = countries.size ? [...countries][0] : null;
  if (country && !S.COUNTRIES.includes(country)) throw usageErr(`${file}: unknown country "${country}"`);
  return { ids: ids.map(([id, lab]) => (si < 0 ? [id, SRC.keyword] : [id, lab])), layout: si < 0 ? 'chart' : 'search', country, duplicates: dup };
}
