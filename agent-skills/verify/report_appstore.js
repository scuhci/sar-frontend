#!/usr/bin/env node
'use strict';
// Builds the verify_appstore.sh markdown report. Self-contained (Node core only).
//   node report_appstore.js <WORK_DIR> "<what was run>" > report.md
// WORK_DIR holds: smar_1.csv and smar_2.csv (SMAR's own iOS pipeline; run 1 paired with the skill, run 2 = noise
// baseline; <name>.smar500.json instead when SMAR would answer HTTP 500), skill_compat.csv and skill_default.csv
// (or their .NOT_READY.csv) with .summary.json, provenance.json. Also writes WORK_DIR/differences.json.
const fs = require('fs'), path = require('path');
const W = process.argv[2], WHAT = process.argv[3] || '';
const rd = (f) => { const p = path.join(W, f); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; };
const js = (f) => { const t = rd(f); try { return t ? JSON.parse(t) : null; } catch (e) { return null; } };

function parseCsv(t) {
  if (t == null) return null;
  t = t.replace(/^﻿/, '');
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const header = rows.shift() || [];
  const key = header.includes('reviewID') ? 'reviewID' : 'appId';
  const objs = rows.filter((r) => r.length > 1 || r[0] !== '').map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
  const byId = new Map(); let dups = 0;
  for (const o of objs) { const k = (header.includes('appId') && key === 'reviewID' ? o.appId + '/' : '') + o[key]; if (byId.has(k)) dups++; else byId.set(k, o); }
  return { header, key, rows: objs, byId, dups };
}
// dateScraped is the write time and differs on every run by construction; byte diffs normalise it and the BOM
// (the skill's --smar-compat file carries the website's BOM; SMAR's server body has none).
const DATE_RE = /[A-Z][a-z]{2} [A-Z][a-z]{2} \d{2} \d{4} \d{2}:\d{2}:\d{2} GMT[+-]\d{4} \([^)]*\)/g;
const norm = (t) => (t == null ? null : t.replace(/^﻿/, '').replace(DATE_RE, 'DATE').replace(/\r\n/g, '\n'));

const notReady = [];
const rdRun = (n) => { const t = rd(n + '.csv'); if (t != null) return t; const t2 = rd(n + '.NOT_READY.csv'); if (t2 != null) notReady.push(n); return t2; };
const g1t = rd('smar_1.csv'), g2t = rd('smar_2.csv'), ct = rdRun('skill_compat'), dt = rdRun('skill_default');
const G1 = parseCsv(g1t), G2 = parseCsv(g2t), C = parseCsv(ct), D = parseCsv(dt);
const cs = js('skill_compat.summary.json'), ds = js('skill_default.summary.json'), prov = js('provenance.json') || {};
const s500 = [js('smar_1.smar500.json'), js('smar_2.smar500.json')];
const COUNTERS = new Set(['avgRating', 'totalReviews', 'currentVersionAvgRating', 'currentVersionReviews']);
const VERSION_LINKED = new Set(['lastUpdated', 'releaseNotes', 'currentAppVersion', 'appSizeInBytes', 'requiredOsVersion', 'appScreenshots', 'appIpadScreenshots', 'supportedDeviceList', 'icon', 'supportedLanguages']);

function byteDiff(a, b) {
  if (a == null || b == null) return { identical: false, missing: a == null ? 'SMAR' : 'skill' };
  const la = norm(a).split('\n'), lb = norm(b).split('\n');
  let same = 0, first = -1; const n = Math.max(la.length, lb.length);
  for (let i = 0; i < n; i++) { if (la[i] === lb[i]) same++; else if (first < 0) first = i; }
  return { identical: first < 0, linesA: la.length, linesB: lb.length, sameLines: same, firstDiffLine: first < 0 ? null : first + 1 };
}
const listOf = (x) => (Array.isArray(x) ? x : x && Array.isArray(x.items) ? x.items : []).map((v) => (typeof v === 'string' ? v : v.appId || v.id || v.reviewID));
function transportIds(s) {
  const t = (s && s.transportRisk) || {}, out = new Set();
  for (const v of Object.values(t)) if (Array.isArray(v)) for (const x of v) out.add(typeof x === 'string' ? x : x && (x.appId || x.id));
  return out;
}
// Classify every difference between skill file R and SMAR run 1, with SMAR run 2 as the noise baseline.
function classify(R, rs, mode) {
  const out = []; if (!R || !G1) return out;
  const drop = new Set(listOf(rs && rs.smarWouldDrop)), tr = transportIds(rs);
  const quar = new Set((rs && rs.quarantinedApps) || []);
  const fixes = (rs && rs.defaultFixes) || {};
  const add = (o) => out.push(o);
  for (const id of G1.byId.keys()) if (!R.byId.has(id)) {
    const inG2 = G2 && G2.byId.has(id);
    if (G2 && !inG2) add({ kind: 'row', id, what: 'in SMAR run 1 only', cls: 'Apple nondeterminism', why: 'SMAR run 2 lacks it too' });
    else if (mode === 'default' && G1.key === 'reviewID' && rs && rs.reviews) add({ kind: 'row', id, what: 'in SMAR run 1 only', cls: 'skill error?', why: 'review in both SMAR runs' });
    else add({ kind: 'row', id, what: 'in SMAR run 1 only', cls: 'skill error?', why: G2 ? 'stable in both SMAR runs' : 'no SMAR run 2 to compare' });
  }
  for (const id of R.byId.keys()) if (!G1.byId.has(id)) {
    const inG2 = G2 && G2.byId.has(id), bare = String(id).split('/').pop();
    if (drop.has(bare)) add({ kind: 'row', id, what: 'in skill only', cls: 'scraper bug', why: 'skill summary smarWouldDrop: SMAR loses this row' });
    else if (tr.has(bare)) add({ kind: 'row', id, what: 'in skill only', cls: 'transport', why: 'skill summary transportRisk: SMAR\'s request library loses it (gzip page or empty review page)' });
    else if (inG2) add({ kind: 'row', id, what: 'in skill only', cls: 'Apple nondeterminism', why: 'SMAR run 2 has it' });
    else add({ kind: 'row', id, what: 'in skill only', cls: 'skill error?', why: 'absent from both SMAR runs' });
  }
  const cols = G1.header.filter((h) => h !== 'dateScraped');
  for (const [id, g] of G1.byId) {
    const r = R.byId.get(id); if (!r) continue; const g2 = G2 && G2.byId.get(id);
    for (const c of cols) {
      const a = g[c], b = r[c]; if (a === b) continue;
      let cls, why;
      if (g2 && g2[c] !== a) { cls = 'Apple nondeterminism'; why = 'SMAR run 1 and run 2 disagree on this cell'; }
      else if (COUNTERS.has(c) && g.currentAppVersion === r.currentAppVersion) { cls = 'drift'; why = 'cdn_age: same app version, a live counter read from a differently aged CDN copy'; }
      else if (VERSION_LINKED.has(c) && g.currentAppVersion !== r.currentAppVersion) { cls = 'drift'; why = `the app updated between the two reads (${g.currentAppVersion} vs ${r.currentAppVersion})`; }
      else if (mode === 'default' && b === 'undefined' && quar.has(String(id))) { cls = 'quarantined'; why = 'the skill withheld this cell after a failed cross-check (summary quarantinedCells)'; }
      else if (mode === 'default' && fixes[c]) { cls = 'scraper bug'; why = 'SMAR\'s writer damages this text (Q4-Q6); default writes it intact (summary defaultFixes)'; }
      else { cls = 'skill error?'; why = g2 ? 'stable in both SMAR runs' : 'no SMAR run 2 to compare'; }
      add({ kind: 'cell', id, col: c, smar: trunc(a), skill: trunc(b), cls, why });
    }
  }
  return out;
}
const trunc = (s) => (s == null ? s : s.length > 70 ? s.slice(0, 67) + '...' : s);
const tally = (l) => l.reduce((m, x) => ((m[x.cls] = (m[x.cls] || 0) + 1), m), {});
const esc = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const CLASSES = ['Apple nondeterminism', 'drift', 'scraper bug', 'transport', 'quarantined', 'skill error?'];

const cbd = byteDiff(g1t, ct), noise = byteDiff(g1t, g2t), noiseCls = classify(G2, null, 'noise');
const cc = classify(C, cs, 'compat'), dc = classify(D, ds, 'default');
const L = [];
L.push(`# SMAR App Store verification: ${WHAT}`, '');
L.push(`Generated ${new Date().toISOString()} by team/verify_appstore.sh. SMAR run 1 and the skill (\`--smar-compat\`, then default) started together; SMAR run 2 started after run 1 finished (noise baseline). SMAR's code ran locally from a SAR-backend ios-production checkout; smar-tool.org was never called.`, '');
if (notReady.length) L.push(`**Note:** ${notReady.join(', ')} finished NOT READY; the report uses its .NOT_READY.csv (see its summary \`NEXT\`).`, '');
if (!g1t) L.push(`**SMAR run 1 produced no file**${s500[0] ? ': SMAR would answer HTTP 500 (' + esc(s500[0].smar500) + ')' : ' (see logs/smar_1.log)'}. The skill should then stop too (compat: no file; summary \`compatExact\` lists \`smar_http500\`).`, '');
L.push('## 1. Compat byte diff (skill `--smar-compat` vs SMAR run 1; dateScraped and BOM normalised)', '');
L.push(cbd.identical ? `**Byte-identical.** ${cbd.linesA} lines.` : `**Not identical.** SMAR ${cbd.linesA ?? '-'} lines, skill ${cbd.linesB ?? '-'} lines, ${cbd.sameLines ?? 0} identical lines, first difference at line ${cbd.firstDiffLine ?? '-'}${cbd.missing ? ` (missing file: ${cbd.missing})` : ''}. Live counters moving between the two reads are the usual cause; section 3 classifies every cell.`);
if (cs) L.push('', `Skill compat summary: READY_TO_DELIVER=${cs.READY_TO_DELIVER}, NEXT=${esc(cs.NEXT)}, rows=${cs.rows}, compatExact=\`${JSON.stringify(cs.compatExact)}\`.`);
if (ds) L.push('', `Skill default summary: READY_TO_DELIVER=${ds.READY_TO_DELIVER}, NEXT=${esc(ds.NEXT)}, rows=${ds.rows}, quarantinedCells=\`${JSON.stringify(ds.quarantinedCells || {})}\`, smarWouldDrop=${(ds.smarWouldDrop && ds.smarWouldDrop.count) || 0}.`);
L.push('', '## 2. Noise baseline (SMAR run 1 vs SMAR run 2, same code, minutes apart)', '');
L.push(noise.identical ? 'Byte-identical: SMAR reproduced itself exactly.' : `${noise.sameLines ?? 0} of ${noise.linesA ?? '-'} lines identical; ${noiseCls.filter((x) => x.kind === 'row').length} row-set differences, ${noiseCls.filter((x) => x.kind === 'cell').length} cell differences. This is how much SMAR disagrees with itself; skill-vs-SMAR differences of the same kind are not skill errors.`);
if (G1 && G1.dups) L.push('', `SMAR run 1 has ${G1.dups} duplicate row(s) (Apple's feed repeats a review across pages; SMAR keeps it, the default removes it: Q18).`);
L.push('', '## 3. Classified differences', '');
L.push('| comparison | ' + CLASSES.join(' | ') + ' | total |', '|---|' + CLASSES.map(() => '---').join('|') + '|---|');
for (const [n, l] of [['compat vs SMAR run 1', cc], ['default vs SMAR run 1', dc]]) { const t = tally(l); L.push(`| ${n} | ${CLASSES.map((c) => t[c] || 0).join(' | ')} | ${l.length} |`); }
L.push('', 'Classes: *Apple nondeterminism* = SMAR\'s own two runs disagree there too; *drift* = same app version but a live counter differs (Apple\'s CDN serves lookup copies up to a day old: cdn_age), or the app updated between the reads; *scraper bug* = a documented SMAR loss or writer bug (default mode avoids it; `references/smar_appstore_schema.md` §5); *transport* = SMAR\'s request library loses it on a gzip page or an empty review page; *quarantined* = the skill withheld a cell that failed a cross-check; *skill error?* = stable across both SMAR runs and unexplained: look at these first.', '');
for (const [n, l] of [['compat', cc], ['default', dc]]) {
  const bad = l.filter((x) => x.cls === 'skill error?');
  L.push(`### ${n}: unexplained differences (${bad.length})`, '');
  if (!bad.length) { L.push('None.', ''); continue; }
  L.push('| row | column | SMAR | skill | note |', '|---|---|---|---|---|');
  for (const x of bad.slice(0, 40)) L.push(`| ${esc(x.id)} | ${esc(x.col || x.what)} | ${esc(x.smar)} | ${esc(x.skill)} | ${esc(x.why)} |`);
  if (bad.length > 40) L.push(`| ... | ${bad.length - 40} more in differences.json | | | |`);
  L.push('');
}
fs.writeFileSync(path.join(W, 'differences.json'), JSON.stringify({ compat: cc, default: dc, noise: noiseCls }, null, 1));
L.push('## 4. Provenance', '');
for (const [k, v] of Object.entries(prov)) L.push(`- **${k}**: ${typeof v === 'object' ? '`' + JSON.stringify(v) + '`' : v}`);
L.push(`- **files**: \`${W}\` (smar_1.csv, smar_2.csv, skill_compat.csv, skill_default.csv, *.summary.json, differences.json, logs/; the skill's Apple responses are journaled in skill_*.csv.pages/)`);
process.stdout.write(L.join('\n') + '\n');
