'use strict';
// Node-only helpers (D9, C25), shared by run_play.js and reviews_play.js. Not part of any browser injection, so the
// browser bundles stay small: persistence, and the reviews runner's stdout line.
//   atomicWrite(path, data)     write <path>.<pid>.<rand>.tmp, fsync, rename: a reader never sees a partial file
//   atomicWriteJson(path, obj)
//   lock(outPath) -> release()  <out>.lock = {pid, host, started}; a dead-pid lock is taken over; a live one throws
//                               an Error with code 'LOCKED' (runners exit 4)
//   truncateJsonl(path, n, ok)  keep the first n complete JSON lines (reviews resume); returns how many were kept (fewer
//                               than n = the file is short or a line is cut/not JSON/rejected by ok(obj, i)); a missing
//                               file returns 0
//   rowsCheck(pages)            ok(obj, i) for truncateJsonl on a reviews rows file: line i is a row object on the page
//                               the state recorded for it (pages = [[rows, token]]), its id not repeated on that page
//                               (rows marked x or with a quarantined id are not counted)
//   eachJsonl(path, n, fn)      stream the first n lines, fn(obj, i) per line, in bounded memory -> {lines, end}: the
//                               complete JSON lines read (stops at a short file, a cut last line, a non-JSON line or
//                               fn returning false) and the byte offset after them
//   outFile(arg, da, notes)     reviews OUT.csv checks -> absolute path: no leading ~, not a folder, a name of at most
//                               OUT_NAME_MAX_BYTES; a missing folder is created (mkdir -p, noted) unless da
//                               (--deliver-anyway: nothing to deliver); throws code USAGE (bare: no usage line)
//   REVIEWS_NEXT, readReviewsState(f)  reviews_play.js exit-2 NEXT lines; its state file -> {run} | {bad: message}
//   rowsFile(out, id)           a reviews rows file: <OUT>.<appId>.rows.jsonl, or <OUT>.<sha1 of appId, 12 hex>.rows.jsonl
//                               when that name and its temp suffix would pass 255 bytes (stress WI-5)
//   atomicStream(path)          {write(str), end() -> path}: atomicWrite for output too large for one string (temp
//                               file written in 1 MB chunks, fsync, rename); write() takes whole lines
//   fitLine(obj, max)           a stdout object: READY_TO_DELIVER and NEXT first (never cut); a long error message,
//                               remainingApps, a resumeWith already inside NEXT and usage are shortened until <= max bytes
//   reviewsLine(summary, max)   reviews_play.js stdout of a finished run: what step 4 needs (summaryFile has the rest)
//   ticker(t0, now)             reviews --until-done: one short stderr progress line per minute; now() -> [apps left, rows]
//   reviewsArgs(argv)           reviews_play.js flags -> {pos, f, notes} | {bad: usage message, next?}; REVIEWS_USAGE
//   resumeCmd(file, argv)       the same command with --resume (no --force / --deliver-anyway), shell-quoted
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');

// File names (stress WI-5): every name must fit 255 bytes (ext4 counts bytes, APFS UTF-16 units: never more than bytes)
// with the temp suffix of a write (.<pid>.<time><rand>.tmp: at most 28 bytes). OUT's own name is at most 200 bytes, so
// its longest derived name (OUT.lock.stale temp, the hashed rows file temp: at most 252 bytes) fits.
const NAME_MAX = 255, TMP_MAX = 28, OUT_NAME_MAX_BYTES = 200;
const tmpName = (p) => `${p}.${process.pid}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.tmp`;
const TMP_RE = /\.(\d+)\.[a-z0-9]+\.tmp$/;

function writeAll(fd, data) {
  const b = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
  let off = 0;
  while (off < b.length) off += fs.writeSync(fd, b, off, b.length - off);
}
function atomicWrite(p, data) {
  const t = tmpName(p);
  let fd = null;
  try {
    fd = fs.openSync(t, 'w', 0o644);
    writeAll(fd, data);
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = null;
    fs.renameSync(t, p);
  } catch (e) {
    if (fd !== null) { try { fs.closeSync(fd); } catch (x) { /* ignore */ } }
    try { fs.unlinkSync(t); } catch (x) { /* ignore */ }
    throw e;
  }
}
const atomicWriteJson = (p, o) => atomicWrite(p, JSON.stringify(o));

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
function readHolder(lp) {
  let st;
  try { st = fs.statSync(lp); } catch (e) { return null; } // gone
  let h = null;
  try { h = JSON.parse(fs.readFileSync(lp, 'utf8')); } catch (e) { h = null; }
  return { h, young: Date.now() - st.mtimeMs < 5000 };
}
// A lock is live when its owner may still run: same host and the pid answers, another host (cannot be checked), or a
// lock file that is still being written (unreadable and younger than 5 s).
const isLive = (r, host) => (r.h && typeof r.h === 'object' ? (r.h.host && r.h.host !== host) || alive(r.h.pid) : r.young);
function lockedErr(r, lp) {
  const who = r && r.h ? `pid ${r.h.pid} on ${r.h.host} since ${r.h.started}` : 'a process that is starting';
  return Object.assign(new Error(`another run holds ${lp} (${who})`), { code: 'LOCKED', holder: r && r.h ? r.h : null });
}
// Create the lock atomically: a fully written temp file is hard-linked to <out>.lock (link fails with EEXIST), so the
// lock file is never seen half-written. File systems without hard links fall back to open('wx').
function tryCreate(lp, body) {
  const t = tmpName(lp); // written in full (fsync) before the link; never a temp of a temp (its name would pass 255 bytes)
  { const fd = fs.openSync(t, 'w', 0o644); try { writeAll(fd, body); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
  try { fs.linkSync(t, lp); return true; } catch (e) {
    if (e.code === 'EEXIST') return false;
    if (!/^(EPERM|ENOTSUP|EOPNOTSUPP|EXDEV|ENOSYS|EMLINK)$/.test(e.code || '')) throw e;
    let fd;
    try { fd = fs.openSync(lp, 'wx'); } catch (e2) { if (e2.code === 'EEXIST') return false; throw e2; }
    try { writeAll(fd, body); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    return true;
  } finally { try { fs.unlinkSync(t); } catch (x) { /* ignore */ } }
}
// Temp files left by killed writers (<name>.<pid>.<rand>.tmp next to the output) are removed once the lock is held: the
// files named after OUT (OUT.progress.json, OUT.state.json, rows files) and after OUT without .csv (<base>.summary.json,
// <base>_relog.txt, <base>.NOT_READY.csv).
function sweepTmp(out) {
  const dir = path.dirname(out), name = path.basename(out), stem = name.replace(/\.csv$/i, ''), pre = [name + '.', stem + '.summary.json.', stem + '_relog.txt.', stem + '.NOT_READY.csv.'];
  let names = [];
  try { names = fs.readdirSync(dir); } catch (e) { return; }
  for (const n of names) {
    if (!pre.some((p) => n.startsWith(p))) continue;
    const m = TMP_RE.exec(n);
    if (m && +m[1] !== process.pid && !alive(+m[1])) { try { fs.unlinkSync(path.join(dir, n)); } catch (e) { /* ignore */ } }
  }
}
function lock(outPath) {
  const out = path.resolve(outPath), lp = out + '.lock', host = os.hostname();
  const me = { pid: process.pid, host, started: new Date().toISOString() }, body = JSON.stringify(me);
  for (let i = 0; i < 6; i++) {
    if (tryCreate(lp, body)) {
      sweepTmp(out);
      let released = false;
      return function release() {
        if (released) return; released = true;
        try { const h = JSON.parse(fs.readFileSync(lp, 'utf8')); if (h.pid === me.pid && h.host === host && h.started === me.started) fs.unlinkSync(lp); } catch (e) { /* already gone */ }
      };
    }
    const r = readHolder(lp);
    if (!r) continue; // released meanwhile: try again
    if (isLive(r, host)) throw lockedErr(r, lp);
    // Stale (dead pid): move it aside atomically, then check that what moved is the stale lock we judged. If another
    // process took the lock over in between, put its lock back and report LOCKED.
    const aside = tmpName(lp + '.stale');
    try { fs.renameSync(lp, aside); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
    const moved = readHolder(aside);
    const same = moved && JSON.stringify(moved.h) === JSON.stringify(r.h);
    if (!same && moved && isLive(moved, host)) {
      try { fs.linkSync(aside, lp); } catch (e) { /* someone else holds it now */ }
      try { fs.unlinkSync(aside); } catch (e) { /* ignore */ }
      throw lockedErr(moved, lp);
    }
    try { fs.unlinkSync(aside); } catch (e) { /* ignore */ }
  }
  throw lockedErr(readHolder(lp), lp);
}

function eachJsonl(p, n, fn) {
  let fd;
  try { fd = fs.openSync(p, 'r'); } catch (e) { if (e.code === 'ENOENT') return { lines: 0, end: 0 }; throw e; }
  const buf = Buffer.allocUnsafe(1 << 22);
  let pend = [], k = 0, end = 0;
  try {
    for (let pos = 0, got; k < n && (got = fs.readSync(fd, buf, 0, buf.length, pos)) > 0; pos += got) {
      let s = 0, j;
      while (k < n && (j = buf.indexOf(10, s)) >= 0 && j < got) {
        pend.push(buf.subarray(s, j));
        const line = (pend.length === 1 ? pend[0] : Buffer.concat(pend)).toString('utf8');
        pend = [];
        let o;
        try { o = JSON.parse(line); } catch (e) { return { lines: k, end }; }
        if (fn && fn(o, k) === false) return { lines: k, end };
        k++; end = pos + j + 1; s = j + 1;
      }
      if (k < n && s < got) pend.push(Buffer.from(buf.subarray(s, got))); // a line continues in the next chunk (buf is reused)
    }
  } finally { fs.closeSync(fd); }
  return { lines: k, end };
}
function rowsCheck(pages) {
  let pi = 0, end = pages.length ? pages[0][0] : 0, ids = new Set();
  return (o, i) => {
    while (pi < pages.length && i >= end) { pi++; end += pi < pages.length ? pages[pi][0] : 0; ids = new Set(); }
    if (!o || typeof o !== 'object' || Array.isArray(o) || o.p !== pi) return false; // null / 123 / [..] / a line of another page
    if (!o.x && (o.q || []).indexOf('id') < 0) { if (ids.has(o.id)) return false; ids.add(o.id); } // a repeated line (stored duplicates carry x; a repeat Google sent inside one page has its id quarantined)
    return true;
  };
}
function truncateJsonl(p, n, ok) {
  const r = eachJsonl(p, n, ok ? (o, i) => ok(o, i) : null);
  let size = 0;
  try { size = fs.statSync(p).size; } catch (e) { if (e.code === 'ENOENT') return 0; throw e; }
  if (size > r.end) { // a line boundary: a cut tail or rows the state never recorded
    fs.truncateSync(p, r.end);
    const fd = fs.openSync(p, 'r+');
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  }
  return r.lines;
}
function outFile(arg, deliverAnyway, notes) {
  const bad = (m, bare) => Object.assign(new Error(m), { code: 'USAGE', bare });
  if (/^~(?:[/\\]|$)/.test(arg)) throw bad('OUT.csv "' + arg + '" starts with ~, which is not expanded here (it would create a folder named ~); use an absolute path');
  const out = path.resolve(arg), dir = path.dirname(out), nb = Buffer.byteLength(path.basename(out));
  if (nb > OUT_NAME_MAX_BYTES) throw bad(`the output file name is too long (${nb} bytes; at most ${OUT_NAME_MAX_BYTES}): for several apps use the first app id's slug plus _and_<number of other apps>_more (smar_reviews_<slug>_and_<N>_more_<cc>.csv)`);
  if (fs.existsSync(out) && fs.statSync(out).isDirectory()) throw bad('OUT.csv must be a file path, not a directory');
  if (!fs.existsSync(dir)) {
    if (deliverAnyway) throw bad('nothing to deliver: no finished run for ' + out + ' (its folder does not exist)', true);
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { throw bad('cannot create the output folder ' + dir + ' (' + (e.code || e.message) + ')'); }
    notes.push('created the output folder ' + dir);
  }
  if (!fs.statSync(dir).isDirectory()) throw bad('the output folder is not a folder: ' + dir);
  return out;
}
// reviews_play.js CLI only (kept out of the browser bundle): the exit-2 NEXT lines and the progress (state) file reader
const REVIEWS_NEXT = {
  usage: 'STOP: fix the command once from error.message; if it fails again, tell the user.',
  badState: (f) => 'STOP: the progress file of this run (' + path.basename(f) + ') cannot be used; never delete or edit it. Run the same command without --resume into a NEW output file (add _2 before .csv) and tell the user.',
};
function readReviewsState(f) {
  let run;
  try { run = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return { bad: 'the progress file ' + f + ' is unreadable (' + e.message + '); start a NEW output file' }; }
  if (!run || run.v !== 3 || run.kind !== 'reviews' || !run.opts || !run.apps) return { bad: 'the progress file ' + f + ' is from an older version or another kind of run; start a NEW output file' };
  return { run };
}
function rowsFile(out, id) {
  const p = out + '.' + id + '.rows.jsonl';
  return Buffer.byteLength(path.basename(p)) + TMP_MAX <= NAME_MAX ? p : out + '.' + crypto.createHash('sha1').update(String(id)).digest('hex').slice(0, 12) + '.rows.jsonl';
}
function atomicStream(p) {
  const t = tmpName(p);
  let fd = fs.openSync(t, 'w', 0o644), parts = [], size = 0;
  const fail = (e) => { if (fd !== null) { try { fs.closeSync(fd); } catch (x) { /* ignore */ } } fd = null; try { fs.unlinkSync(t); } catch (x) { /* ignore */ } throw e; };
  const flush = () => { if (parts.length) { writeAll(fd, parts.join('')); parts = []; size = 0; } };
  return {
    write(str) { try { parts.push(str); size += str.length; if (size >= 1 << 20) flush(); } catch (e) { fail(e); } },
    end() { try { flush(); fs.fsyncSync(fd); fs.closeSync(fd); fd = null; fs.renameSync(t, p); return p; } catch (e) { return fail(e); } },
  };
}

const big = (c, max) => Buffer.byteLength(JSON.stringify(c)) > max;
function fitLine(o, max) {
  if (!o || typeof o !== 'object') return o;
  const c = {}; for (const k of ['skill', 'version', 'runner', 'mode', 'READY_TO_DELIVER', 'NEXT']) if (o[k] !== undefined) c[k] = o[k];
  Object.assign(c, o);
  if (big(c, max) && c.error && String(c.error.message || '').length > 300) c.error = Object.assign({}, c.error, { message: String(c.error.message).slice(0, 300) + ' ...' });
  if (big(c, max) && Array.isArray(c.remainingApps)) c.remainingApps = c.remainingApps.slice(0, 5).concat(c.remainingApps.length > 5 ? ['... ' + (c.remainingApps.length - 5) + ' more'] : []);
  if (big(c, max) && c.resumeWith && String(c.NEXT || '').includes(c.resumeWith)) { delete c.resumeWith; c.resumeWithIs = 'the command after "RESUME: " in NEXT'; }
  if (big(c, max) && c.usage) delete c.usage;
  return c;
}
function reviewsLine(sm, max) {
  const c = { skill: sm.skill, version: sm.version, runner: sm.runner, mode: sm.mode };
  for (const k of ['READY_TO_DELIVER', 'NEXT', 'csv', 'rows', 'summaryFile', 'incomplete', 'deliveredAnyway']) if (sm[k] !== undefined) c[k] = sm[k];
  c.counts = { apps: sm.apps.length, problems: sm.problems.length, quarantinedCells: Object.values(sm.quarantinedCells || {}).reduce((x, y) => x + y, 0) };
  c.apps = sm.apps.map((a) => ({ appId: a.appId, count: a.count, fetched: a.fetched, stop: a.stop }));
  if (sm.notes) c.notes = sm.notes;
  c.details = 'every other field (step 6) is in summaryFile; read it there';
  for (const k of ['notes', 'apps', 'counts', 'details']) { if (!big(c, max)) break; delete c[k]; }
  return c;
}

const REVIEWS_USAGE = 'node <SKILL>/scripts/reviews_play.js <appId|id1,id2> OUT.csv [--bulk] [--from-results-table] [--country XX] [--smar-compat] [--limit N|--all] [--force] [--until-done] [--resume [--deliver-anyway]] [--max-seconds N] [--paths F]';
function reviewsArgs(argv) {
  const pos = [], f = {}, notes = [];
  const VAL = { country: 1, limit: 1, 'max-seconds': 1, paths: 1 }, BOOL = { bulk: 1, 'from-results-table': 1, 'smar-compat': 1, all: 1, force: 1, resume: 1, 'deliver-anyway': 1, 'until-done': 1, 'true-ms': 1, 'smar-pad': 1, bom: 1 };
  for (let i = 0; i < argv.length; i++) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(argv[i]);
    if (!m) { pos.push(argv[i]); continue; }
    if (VAL[m[1]]) { const v = m[2] !== undefined ? m[2] : argv[++i]; if (v === undefined) return { bad: '--' + m[1] + ' needs a value' }; f[m[1]] = v; }
    else if (BOOL[m[1]] && m[2] === undefined) f[m[1]] = true;
    else return { bad: 'unknown flag ' + argv[i], next: 'STOP: fix the command (see usage).' };
  }
  if (f['true-ms']) notes.push('--true-ms is deprecated: true milliseconds are now the default');
  if (f['smar-pad'] || f.bom) { notes.push('--smar-pad/--bom are deprecated: mapped onto --smar-compat'); f['smar-compat'] = true; }
  if (pos.length !== 2) return { bad: 'expected <appId|ids> and OUT.csv' };
  if (f['deliver-anyway'] && !f.resume) return { bad: '--deliver-anyway only works with --resume on a finished run' };
  if (f['max-seconds'] !== undefined && !(Number(f['max-seconds']) > 0)) return { bad: '--max-seconds must be a positive number' };
  return { pos, f, notes };
}
// the same command with --resume (never --force / --deliver-anyway), each argument quoted when the shell needs it
function resumeCmd(file, argv) { const a = argv.filter((x) => x !== '--force' && x !== '--deliver-anyway'); if (a.indexOf('--resume') < 0) a.push('--resume'); return ['node', file].concat(a.map((x) => (/^[\w./,=:-]+$/.test(x) ? x : JSON.stringify(x)))).join(' '); }

function ticker(t0, now) {
  const t = setInterval(() => {
    try {
      const sec = Math.round((Date.now() - t0) / 1000), [left, rows] = now();
      process.stderr.write(`[reviews_play] ${Math.floor(sec / 60)}m${String(sec % 60).padStart(2, '0')}s: still running (${left} app(s) left); ${rows} reviews so far; do not stop or background this command\n`);
    } catch (e) { /* never break the run */ }
  }, 60000);
  if (t.unref) t.unref();
  return t;
}

module.exports = { OUT_NAME_MAX_BYTES, REVIEWS_NEXT, readReviewsState, atomicWrite, atomicWriteJson, lock, truncateJsonl, rowsCheck, eachJsonl, outFile, rowsFile, atomicStream, fitLine, reviewsLine, ticker, REVIEWS_USAGE, reviewsArgs, resumeCmd };
