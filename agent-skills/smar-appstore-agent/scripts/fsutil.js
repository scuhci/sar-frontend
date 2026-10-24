'use strict';
// Node-only persistence helpers (D9, C25), shared by run_play.js and reviews_play.js. Not part of any browser injection.
//   atomicWrite(path, data)     write <path>.<pid>.<rand>.tmp, fsync, rename: a reader never sees a partial file
//   atomicWriteJson(path, obj)
//   lock(outPath) -> release()  <out>.lock = {pid, host, started}; a dead-pid lock is taken over; a live one throws
//                               an Error with code 'LOCKED' (runners exit 4); once held, dead writers' temp files of
//                               every file derived from OUT are removed (sweepTmp)
//   truncateJsonl(path, n)      keep the first n complete lines (reviews resume); a missing file returns 0
const fs = require('fs'), os = require('os'), path = require('path');

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
  const t = tmpName(lp);
  atomicWrite(t, body);
  try { fs.linkSync(t, lp); return true; } catch (e) {
    if (e.code === 'EEXIST') return false;
    if (!/^(EPERM|ENOTSUP|EOPNOTSUPP|EXDEV|ENOSYS|EMLINK)$/.test(e.code || '')) throw e;
    let fd;
    try { fd = fs.openSync(lp, 'wx'); } catch (e2) { if (e2.code === 'EEXIST') return false; throw e2; }
    try { writeAll(fd, body); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    return true;
  } finally { try { fs.unlinkSync(t); } catch (x) { /* ignore */ } }
}
// Temp files left by killed writers (<file>.<pid>.<rand>.tmp) are removed once the lock is held, for every file the
// runner derives from OUT: OUT itself and OUT.progress.json / OUT.lock (prefix "<OUT>."), <base>.NOT_READY.csv,
// <base>.summary.json, <base>_relog.txt, the --emit-both twin <base>.compat.csv / <base>.default.csv, the --per-app
// files <base>_<appId>.csv, and the page journal OUT.pages/<host>/. A per-app-shaped name that is itself another run's
// OUT (its own .lock exists) is that run's business. (stress #18: a kill while the summary or the relog was written left
// o.summary.json.<pid>.<rand>.tmp after a successful --resume)
function sweepIn(dir, want) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch (e) { return; }
  for (const n of names) {
    if (!want(n, names)) continue;
    const m = TMP_RE.exec(n);
    if (m && +m[1] !== process.pid && !alive(+m[1])) { try { fs.unlinkSync(path.join(dir, n)); } catch (e) { /* ignore */ } }
  }
}
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function sweepTmp(out) {
  const dir = path.dirname(out), name = path.basename(out), stem = name.replace(/\.csv$/i, '');
  const pre = [name + '.', stem + '.NOT_READY.csv.', stem + '.summary.json.', stem + '_relog.txt.', stem + '.compat.csv.', stem + '.default.csv.'];
  const perApp = new RegExp('^(' + reEsc(stem) + '_[\\w.-]+\\.csv)\\.\\d+\\.[a-z0-9]+\\.tmp$', 'i');
  sweepIn(dir, (n, names) => {
    if (pre.some((p) => n.startsWith(p))) return true;
    const m = perApp.exec(n);
    return !!m && !names.includes(m[1] + '.lock');
  });
  const pages = out + '.pages';
  let hosts = [];
  try { hosts = fs.readdirSync(pages, { withFileTypes: true }); } catch (e) { return; }
  sweepIn(pages, () => true);
  for (const h of hosts) if (h.isDirectory()) sweepIn(path.join(pages, h.name), () => true);
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

function truncateJsonl(p, n) {
  let s;
  try { s = fs.readFileSync(p, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return 0; throw e; }
  let i = 0, k = 0;
  while (k < n) { const j = s.indexOf('\n', i); if (j < 0) break; i = j + 1; k++; }
  if (i !== s.length) atomicWrite(p, s.slice(0, i));
  return k;
}

module.exports = { atomicWrite, atomicWriteJson, lock, truncateJsonl };
