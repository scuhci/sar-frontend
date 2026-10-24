#!/usr/bin/env node
'use strict';
// Builds the verify.sh markdown report. Self-contained (no deps).
//   node report.js <WORK_DIR> <keyword> > report.md
// WORK_DIR holds: smar_1.csv, smar_2.csv (SMAR's pipeline, run 1 paired with the skill, run 2 = noise baseline),
// skill_compat.csv (+ .summary.json, .csv.progress.json), skill_default.csv (+ the same), provenance.json.
// The progress files (optional) give each skill run's fetched search lists, used to tell related-search churn from errors.
const fs = require('fs'), path = require('path');
const W = process.argv[2], KW = process.argv[3];
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
  const objs = rows.filter((r) => r.length > 1 || r[0] !== '').map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
  return { header, rows: objs, byId: new Map(objs.map((o) => [o.appId, o])) };
}
// dateScraped is the write time: it differs on every run by construction, so byte diffs normalise it.
const DATE_RE = /[A-Z][a-z]{2} [A-Z][a-z]{2} \d{2} \d{4} \d{2}:\d{2}:\d{2} GMT[+-]\d{4} \([^)]*\)/g;
const norm = (t) => (t == null ? null : t.replace(/^﻿/, '').replace(DATE_RE, 'DATE').replace(/\r\n/g, '\n'));

const notReady = [];
const rdRun = (n) => { const t = rd(n + '.csv'); if (t != null) return t; const t2 = rd(n + '.NOT_READY.csv'); if (t2 != null) notReady.push(n); return t2; };
const g1t = rd('smar_1.csv'), g2t = rd('smar_2.csv'), ct = rdRun('skill_compat'), dt = rdRun('skill_default');
const G1 = parseCsv(g1t), G2 = parseCsv(g2t), C = parseCsv(ct), D = parseCsv(dt);
const cs = js('skill_compat.summary.json'), ds = js('skill_default.summary.json'), prov = js('provenance.json') || {};
const cp = js('skill_compat.csv.progress.json'), dp = js('skill_default.csv.progress.json');
const searchEvidence = (p) => {
  if (!p || !Array.isArray(p.searches)) return null;
  const listed = new Set();
  for (const s of p.searches) if (s && Array.isArray(s.ids)) for (const id of s.ids) listed.add(id);
  return { listed, searches: p.searches };
};
const COUNTERS = new Set(['approximateInstalls', 'totalRatings', 'totalReviews', 'avgRating']);

// ---- search lists: every row comes from the primary search or from one "related to <app>" search (one per primary
// app). Lists are keyed 'primary' and 'related:<seed appId>'. Skill runs: their progress files. SMAR: smar_N.searches.json
// (team/smar_harness.js records every list it fetched); an older harness left only smar_N.primary_ids.json, so SMAR's
// related lists are unknown there (complete=false).
// A row that both skill runs agree on can still follow from a different list Google served: the primary lists swap an
// app near the end (then each side also runs a "related to" search the other never ran), or the same "related to" query
// returns a slightly different list minutes apart. That is churn only while the lists still share most apps (below
// these shares of the longer list the request itself may differ, or one side dropped entries) and the primary lists
// have the same length; otherwise the row stays "skill error?".
// Calibration (12 stress-test runs, 252 same-query list pairs fetched by the skill's two runs minutes apart): every
// primary pair shared 100% (skill vs SMAR: 20 of 20, once 19 of 20); related pairs shared at least 45% of the longer
// list (9 of 20 when Google returned only 10 to one run), 70% when both had 20.
// And while few related searches differ at all (skill vs skill: at most 5 of 20 per run): when more than half of the
// related searches both sides ran came back different, the difference is systematic (a request or parsing difference
// would hit every list), so same-query differences stay flagged.
const PRIMARY_MIN_SHARE = 0.75, RELATED_MIN_SHARE = 0.4, RELATED_MAX_DIFFERING = 0.5;
// A list's top "hero" card whose app id SMAR's library cannot read (the skill records heroId without heroGpsId) is a
// null in SMAR's copy of that list: list comparisons leave out both, and a row that comes from such a card is never
// called churn (default mode classes it as SMAR's hero_card drop; compat mode must drop it too).
function skillLists(p) {
  if (!p || !Array.isArray(p.searches)) return null;
  const prim = p.searches.find((s) => s && s.kind === 'primary' && Array.isArray(s.ids));
  if (!prim) return null;
  const entry = (s) => ({ q: s.q, ids: s.ids, hero: s.heroId && !s.heroGpsId ? s.heroId : null });
  const lists = new Map([['primary', entry(prim)]]);
  for (const s of p.searches) {
    if (!s || s.kind !== 'related' || !Array.isArray(s.ids) || !Number.isInteger(s.titleIdx)) continue;
    const seed = prim.ids[s.titleIdx];
    if (seed != null && !lists.has('related:' + seed)) lists.set('related:' + seed, entry(s));
  }
  return { lists, complete: true };
}
const cmpIds = (l) => l.ids.filter((x) => typeof x === 'string' && x && x !== l.hero); // ids both sides can compare
function smarLists(n) {
  const s = js(n + '.searches.json');
  if (s && Array.isArray(s.lists)) {
    if (s.appIdBranch) return null;
    const lists = new Map();
    for (const l of s.lists) if (l && l.kind === 'primary' && Array.isArray(l.ids) && !lists.has('primary')) lists.set('primary', { q: l.q, ids: l.ids });
    for (const l of s.lists) if (l && l.kind === 'related' && l.seed && !lists.has('related:' + l.seed)) lists.set('related:' + l.seed, { q: l.q, ids: Array.isArray(l.ids) ? l.ids : null, error: l.error });
    return lists.has('primary') ? { lists, complete: true, detailFailed: new Set(Array.isArray(s.detailFailed) ? s.detailFailed : []) } : null;
  }
  const p = js(n + '.primary_ids.json');
  return Array.isArray(p) ? { lists: new Map([['primary', { q: null, ids: p }]]), complete: false, detailFailed: new Set() } : null;
}
// churn swaps apps in and out of a full list; a primary list of another length means one side dropped or added entries
// (SMAR's library drops some search results, default mode keeps them; compat mode must drop the same ones)
const primaryGate = (rp, sp, ps) => (sp.some((x) => typeof x !== 'string' || !x)
  ? `SMAR run 1's primary list has an entry without an app id (its library lost that card's id), which churn does not explain`
  : rp.length !== sp.length
  ? `the primary search lists differ in length (this run ${rp.length}, SMAR run 1 ${sp.length}): one side dropped or added entries, which churn does not explain`
  : !ps || ps.r < PRIMARY_MIN_SHARE ? `the primary search lists share only ${ps ? ps.k + ' of ' + ps.n : 'no'} apps (this run vs SMAR run 1): too few shared for churn, compare the two search requests` : null);
const share = (a, b) => { const A = new Set(a), B = new Set(b), n = Math.max(A.size, B.size); if (!Math.min(A.size, B.size)) return null; let k = 0; for (const x of A) if (B.has(x)) k++; return { k, n, r: k / n }; };
const qtext = (l, key) => { const q = String((l && l.q) || (key === 'primary' ? 'primary search' : key)); return q.length > 50 ? q.slice(0, 47) + '...' : q; };
const S1 = smarLists('smar_1');
// how many of the related searches both this skill run and SMAR run 1 ran (SMAR's lists recorded) returned another set
function relatedDiffer(RLx) {
  if (!RLx || !S1 || !S1.complete) return null;
  let total = 0, differ = 0;
  for (const [key, l] of RLx.lists) {
    const sl = key !== 'primary' && S1.lists.get(key);
    if (!sl || !sl.ids) continue;
    total++; const a = new Set(cmpIds(l)), b = new Set(cmpIds(sl));
    if (a.size !== b.size || [...a].some((x) => !b.has(x))) differ++;
  }
  return { total, differ };
}

function byteDiff(a, b) {
  if (a == null || b == null) return { identical: false, missing: a == null ? 'left' : 'right' };
  const la = norm(a).split('\n'), lb = norm(b).split('\n');
  let same = 0; const n = Math.max(la.length, lb.length); let first = -1;
  for (let i = 0; i < n; i++) { if (la[i] === lb[i]) same++; else if (first < 0) first = i; }
  return { identical: first < 0, linesA: la.length, linesB: lb.length, sameLines: same, firstDiffLine: first < 0 ? null : first + 1 };
}

// Classify every difference between run R and the paired SMAR file G1, using G2 (a second SMAR run) as the noise baseline.
// O = the other skill run, prog = R's progress file: a row the two skill runs disagree about, consistent with the search
// pages R itself fetched (listed there when R has the row, not listed when R lacks it), is related-search churn.
function classify(R, rs, mode, O, prog) {
  const out = []; if (!R || !G1) return out;
  const drop = new Set(((rs && rs.smarWouldDrop && rs.smarWouldDrop.items) || []).map((x) => (typeof x === 'string' ? x : x.appId)));
  const evidence = searchEvidence(prog);
  const churnWhy = (id, missing) => {
    if (!evidence) return 'the other skill run disagrees (row-set churn between runs minutes apart); (no search-page evidence available)';
    const match = evidence.searches.find((s) => s && Array.isArray(s.ids) && s.ids.includes(id));
    if (missing) return `the other skill run disagrees (row-set churn between runs minutes apart); no search page this run fetched listed it`;
    const q = String(match.q || '').length > 50 ? String(match.q).slice(0, 47) + '...' : String(match.q || '');
    return `the other skill run disagrees (row-set churn between runs minutes apart); listed on a search page this run fetched (${match.kind || 'unknown'} "${q}")`;
  };
  const classifyChurn = (item, missing) => {
    if (item.cls !== 'skill error?' || !O || O.byId.has(item.appId) === R.byId.has(item.appId)) return item;
    if (!evidence) { item.cls = 'Google nondeterminism'; item.why = churnWhy(item.appId, missing); }
    else if (evidence.listed.has(item.appId) !== !missing) item.why = missing
      ? 'the other skill run disagrees, but this run\'s own search page listed it and the row is missing from its CSV'
      : 'the other skill run disagrees, but no search page this run fetched listed it and the row is in its CSV';
    else { item.cls = 'Google nondeterminism'; item.why = churnWhy(item.appId, missing); }
    return item;
  };
  // A row both skill runs agree on, consistent with this run's own search pages, that follows from a different search
  // list than SMAR run 1's (see PRIMARY_MIN_SHARE above). Returns { why } (churn), { fail } (a note; the row stays
  // flagged) or null (not this case).
  const RL = skillLists(prog), RD = relatedDiffer(RL);
  const listWhy = (id, missing) => {
    if (!RL || !S1) return null;
    const rp = RL.lists.get('primary').ids, sp = S1.lists.get('primary').ids, ps = share(rp, sp);
    const rpS = new Set(rp), spS = new Set(sp), parts = [];
    const pf = primaryGate(rp, sp, ps);
    if (pf) return { fail: pf };
    const sameQuery = () => (RD && RD.total >= 4 && RD.differ / RD.total > RELATED_MAX_DIFFERING ? `${RD.differ} of the ${RD.total} related searches both sides ran came back different: more than churn explains, compare the two search requests` : null);
    const dfail = `SMAR's search listed it but every SMAR detail fetch for it failed (logs/smar_1.csv.log): check whether SMAR would drop it (summary smarWouldDrop)`;
    if (!missing) { // skill-only row: SMAR has no list that kept it; each list of this run that listed it must be explained
      const src = [...RL.lists].filter(([, l]) => l.ids.includes(id));
      if (!src.length) return null; // no page of this run listed it: stays flagged (see classifyChurn)
      if (S1.detailFailed.has(id)) return { fail: dfail };
      if (S1.complete && [...S1.lists.values()].some((sl) => sl.ids && sl.ids.includes(id))) return null; // SMAR listed it too
      for (const [key, l] of src) {
        if (key === 'primary') { if (spS.has(id)) return null; parts.push(`this run's primary search listed it, SMAR's did not (${ps.k} of ${ps.n} primary apps shared)`); continue; }
        const seed = key.slice(8);
        if (!spS.has(seed)) { parts.push(`listed on "${qtext(l, key)}", a search SMAR never ran (${seed} was not in SMAR's primary list)`); continue; }
        if (!S1.complete) return { fail: `listed on "${qtext(l, key)}", which SMAR also ran; SMAR's copy of it was not recorded (older smar_harness.js: re-run with the current kit to classify this)` };
        const sl = S1.lists.get(key);
        if (!sl || !sl.ids) { parts.push(`listed on "${qtext(l, key)}"; SMAR's run of that search failed`); continue; }
        if (sl.ids.includes(id) || id === l.hero) return null; // SMAR listed it too / SMAR cannot read this hero card
        if (sameQuery()) return { fail: sameQuery() };
        const s = share(cmpIds(l), cmpIds(sl));
        if (!s || s.r < RELATED_MIN_SHARE) return { fail: `listed on "${qtext(l, key)}"; SMAR's copy of that search shares only ${s ? s.k + ' of ' + s.n : 'no'} apps with this run's: too few shared for churn` };
        parts.push(`listed on "${qtext(l, key)}"; SMAR's copy of the same search did not list it (${s.k} of ${s.n} apps shared)`);
      }
    } else { // SMAR-only row: no page of this run listed it; each SMAR list that did must be explained
      if ([...RL.lists.values()].some((l) => l.ids.includes(id))) return null; // listed but missing: stays flagged
      let src;
      if (S1.complete) src = [...S1.lists].filter(([, l]) => l.ids && l.ids.includes(id));
      else if (spS.has(id)) src = [['primary', S1.lists.get('primary')]];
      else {
        const unrun = sp.filter((x) => !rpS.has(x));
        return { fail: `SMAR found it on one of its "related to" searches (${unrun.length ? 'perhaps one this run never ran: ' + unrun.join(', ') : 'all of which this run also ran without listing it'}); SMAR's copies were not recorded (older smar_harness.js: re-run with the current kit to classify this)` };
      }
      if (!src.length) return null;
      for (const [key, sl] of src) {
        if (key === 'primary') { parts.push(`SMAR's primary search listed it, this run's did not (${ps.k} of ${ps.n} primary apps shared)`); continue; }
        const seed = key.slice(8), l = RL.lists.get(key);
        if (!rpS.has(seed)) { parts.push(`SMAR found it on "${qtext(sl, key)}", a search this run never ran (${seed} was not in this run's primary list)`); continue; }
        if (!l) return null; // this run had the seed but kept no copy of its search: not explained here
        if (sameQuery()) return { fail: sameQuery() };
        const s = share(cmpIds(l), cmpIds(sl));
        if (!s || s.r < RELATED_MIN_SHARE) return { fail: `SMAR found it on "${qtext(sl, key)}"; this run's copy of that search shares only ${s ? s.k + ' of ' + s.n : 'no'} apps with SMAR's: too few shared for churn` };
        parts.push(`SMAR found it on "${qtext(sl, key)}"; this run's copy of the same search did not list it (${s.k} of ${s.n} apps shared)`);
      }
    }
    return parts.length ? { why: 'Google served a different search list (this run\'s CSV matches its own pages): ' + parts.join('; ') + (parts.some((x) => /primary apps shared/.test(x)) ? '' : ` (${ps.k} of ${ps.n} primary apps shared)`) } : null;
  };
  const listChurn = (item, missing) => {
    if (item.cls !== 'skill error?') return item;
    const w = listWhy(item.appId, missing);
    if (w && w.fail) item.why += '; ' + w.fail;
    else if (w) { item.cls = 'Google nondeterminism'; item.why = w.why; }
    return item;
  };
  // scrapedFrom 'keyword search' vs 'similar app links': the app is on one primary list and not the other
  const sourceWhy = (id, smarVal, skillVal) => {
    if (!RL || !S1) return null;
    const rp = RL.lists.get('primary').ids, sp = S1.lists.get('primary').ids, ps = share(rp, sp);
    const inR = rp.includes(id), inS = sp.includes(id);
    if (inR === inS || (skillVal === 'keyword search') !== inR || (smarVal === 'keyword search') !== inS) return null;
    const pf = primaryGate(rp, sp, ps);
    if (pf) return { fail: pf };
    return { why: `Google served a different primary list: ${inS ? 'SMAR\'s primary search listed it, this run\'s did not (it came from a related search)' : 'this run\'s primary search listed it, SMAR\'s did not (SMAR found it on a related search)'} (${ps.k} of ${ps.n} primary apps shared)` };
  };
  const add = (o) => out.push(o);
  for (const id of G1.byId.keys()) if (!R.byId.has(id)) {
    const inG2 = G2 && G2.byId.has(id);
    const item = { kind: 'row', appId: id, what: 'in SMAR run 1, missing from skill', cls: G2 && !inG2 ? 'Google nondeterminism' : 'skill error?', why: G2 && !inG2 ? 'SMAR run 2 does not have it either (row set varies between runs)' : G2 ? 'stable in both SMAR runs' : 'in SMAR run 1; no SMAR run 2 to compare' };
    add(listChurn(classifyChurn(item, true), true));
  }
  for (const id of R.byId.keys()) if (!G1.byId.has(id)) {
    const inG2 = G2 && G2.byId.has(id);
    if (mode === 'default' && drop.has(id)) add({ kind: 'row', appId: id, what: 'in skill only', cls: 'scraper bug', why: 'skill summary smarWouldDrop: SMAR\'s scraper loses this row (page value kept by default mode)' });
    else add(listChurn(classifyChurn({ kind: 'row', appId: id, what: 'in skill only', cls: inG2 ? 'Google nondeterminism' : 'skill error?', why: inG2 ? 'SMAR run 2 has it (row set varies between runs)' : G2 ? 'absent from both SMAR runs' : 'absent from SMAR run 1; no SMAR run 2 to compare' }, false), false));
  }
  const cols = G1.header.filter((h) => h !== 'dateScraped');
  for (const [id, g] of G1.byId) {
    const r = R.byId.get(id); if (!r) continue; const g2 = G2 && G2.byId.get(id);
    for (const c of cols) {
      const a = g[c], b = r[c]; if (a === b) continue;
      let cls, why;
      if (g2 && g2[c] !== a) { cls = 'Google nondeterminism'; why = 'SMAR run 1 and run 2 disagree on this cell'; }
      else if (COUNTERS.has(c) && /^[\d.]+$/.test(a || '') && /^[\d.]+$/.test(b || '') && Math.abs(+a - +b) <= Math.max(2, 0.002 * Math.max(+a, +b), c === 'avgRating' ? 0.01 : 0)) { cls = 'drift'; why = 'live counter moved between fetches (within 0.2%)'; }
      else if (mode === 'default' && c === 'developerAddress' && (a === '' || a === 'undefined')) { cls = 'scraper bug'; why = 'SMAR leaves developerAddress blank; skill reads it from the page'; }
      else if (mode === 'default' && (c === 'description' || c === 'currentVersionChanges') && a.replace(/""/g, '"') === b) { cls = 'scraper bug'; why = 'SMAR double-escapes quotes (cleanText then CSV quoting)'; }
      else if (mode === 'default' && a === 'null' && b === 'undefined') { cls = 'scraper bug'; why = 'SMAR writes "null" for an absent leaf'; }
      else if (mode === 'default' && a !== b && b === 'undefined') { cls = 'skill error?'; why = 'skill withheld the value (check summary quarantinedCells/unverified)'; }
      else {
        cls = mode === 'default' ? 'skill error? (or SMAR formatting)' : 'skill error?'; why = G2 ? 'stable in both SMAR runs' : 'no SMAR run 2 to compare';
        const w = c === 'scrapedFrom' ? sourceWhy(id, a, b) : null;
        if (w && w.fail) why += '; ' + w.fail; else if (w) { cls = 'Google nondeterminism'; why = w.why; }
      }
      add({ kind: 'cell', appId: id, col: c, smar: trunc(a), skill: trunc(b), cls, why });
    }
  }
  return out;
}
const trunc = (s) => (s == null ? s : s.length > 70 ? s.slice(0, 67) + '...' : s);
const tally = (l) => l.reduce((m, x) => ((m[x.cls] = (m[x.cls] || 0) + 1), m), {});
const esc = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

const cbd = byteDiff(g1t, ct), noise = byteDiff(g1t, g2t), noiseCls = classify(G2, null, 'noise');
const cc = classify(C, cs, 'compat', D, cp), dc = classify(D, ds, 'default', C, dp);
const L = [];
L.push(`# SMAR verification: "${KW}"`, '');
L.push(`Generated ${new Date().toISOString()} by team/verify.sh. SMAR run 1 and both skill runs started together; SMAR run 2 started after run 1 finished (noise baseline).`, '');
if (notReady.length) L.push(`**Note:** ${notReady.join(', ')} finished NOT READY; the report uses its .NOT_READY.csv (see its summary NEXT).`, '');
if (!g1t) L.push('**SMAR run 1 produced no file** (see logs/smar_1.csv.log; exit 3 = SMAR would answer HTTP 500).', '');
L.push('## 1. Compat byte diff (skill `--smar-compat` vs SMAR run 1, dateScraped normalised)', '');
L.push(cbd.identical ? `**Byte-identical.** ${cbd.linesA} lines.` : `**Not identical.** SMAR ${cbd.linesA ?? '-'} lines, skill ${cbd.linesB ?? '-'} lines, ${cbd.sameLines ?? 0} identical lines, first difference at line ${cbd.firstDiffLine ?? '-'}${cbd.missing ? ` (missing file: ${cbd.missing === 'left' ? 'SMAR' : 'skill'})` : ''}.`);
if (cs) L.push('', `Skill summary: READY_TO_DELIVER=${cs.READY_TO_DELIVER}, compatFileReproducible=${JSON.stringify(cs.compatFileReproducible || cs.compatExact)}, rows=${cs.csvRows ?? cs.rows}.`);
L.push('', '## 2. Noise baseline (SMAR run 1 vs SMAR run 2, same code, minutes apart)', '');
L.push(!g2t ? `No SMAR run 2 (NOISE=0, or it produced no file: see logs/smar_2.csv.log), so there is no noise baseline; a difference SMAR might not reproduce itself is classed only from the skill's own runs and search lists.` : noise.identical ? `Byte-identical: SMAR reproduced itself exactly.` : `${noise.sameLines ?? 0} of ${noise.linesA ?? '-'} lines identical; ${noiseCls.filter((x) => x.kind === 'row').length} row-set differences, ${noiseCls.filter((x) => x.kind === 'cell').length} cell differences. This is how much SMAR disagrees with itself; skill-vs-SMAR differences of the same kind are not skill errors.`);
{
  const only = (a, b) => a.filter((x) => !b.includes(x));
  const lines = [['compat', cp], ['default', dp]].map(([n, p]) => {
    const RLn = skillLists(p); if (!RLn || !S1) return null;
    const rp = RLn.lists.get('primary').ids, sp = S1.lists.get('primary').ids, s = share(rp, sp);
    const rd = relatedDiffer(RLn);
    return `- skill ${n} vs SMAR run 1: ${s ? s.k + ' of ' + s.n : 'no'} primary search apps shared` + (only(rp, sp).length || only(sp, rp).length ? ` (skill only: ${only(rp, sp).join(', ') || '-'}; SMAR only: ${only(sp, rp).join(', ') || '-'})` : '')
      + (rd ? `; ${rd.differ} of the ${rd.total} related searches both ran came back with a different set of apps` : '');
  }).filter(Boolean);
  if (lines.length) L.push('', 'Search lists (a row comes from the primary search or from one "related to <app>" search):', '', ...lines,
    `- SMAR run 1's related lists: ${S1 && S1.complete ? 'recorded (smar_1.searches.json)' : 'not recorded (older smar_harness.js: primary list only)'}`);
}
L.push('', '## 3. Classified differences', '');
L.push('| comparison | ' + ['Google nondeterminism', 'drift', 'scraper bug', 'skill error?', 'skill error? (or SMAR formatting)'].join(' | ') + ' | total |', '|---|---|---|---|---|---|---|');
for (const [n, l] of [['compat vs SMAR run 1', cc], ['default vs SMAR run 1', dc]]) { const t = tally(l); L.push(`| ${n} | ${t['Google nondeterminism'] || 0} | ${t.drift || 0} | ${t['scraper bug'] || 0} | ${t['skill error?'] || 0} | ${t['skill error? (or SMAR formatting)'] || 0} | ${l.length} |`); }
L.push('', 'Classes: *Google nondeterminism* = SMAR\'s own two runs disagree there too, or the skill\'s own two runs disagree about a row that its fetched search pages did / did not list, or the row (or its scrapedFrom) follows from a search list Google served differently to the skill and to SMAR run 1 while the skill\'s CSV matches its own pages (an app swapped near the end of the primary list, so each side also ran a "related to" search the other never ran; or the same "related to" search returned a slightly different list), as long as the lists still share most apps; *drift* = a live counter moved by <=0.2% between fetches; *scraper bug* = a documented SMAR bug (default mode writes the page value instead); *skill error?* = stable across both SMAR runs and unexplained: look at these first.', '');
for (const [n, l] of [['compat', cc], ['default', dc]]) {
  const bad = l.filter((x) => x.cls.startsWith('skill error'));
  L.push(`### ${n}: unexplained differences (${bad.length})`, '');
  if (!bad.length) { L.push('None.', ''); continue; }
  L.push('| appId | column | SMAR | skill | note |', '|---|---|---|---|---|');
  for (const x of bad.slice(0, 40)) L.push(`| ${x.appId} | ${x.col || x.what} | ${esc(x.smar)} | ${esc(x.skill)} | ${esc(x.why)} |`);
  if (bad.length > 40) L.push(`| ... | ${bad.length - 40} more in differences.json | | | |`);
  L.push('');
}
fs.writeFileSync(path.join(W, 'differences.json'), JSON.stringify({ compat: cc, default: dc, noise: noiseCls }, null, 1));
L.push('## 4. Provenance', '');
for (const [k, v] of Object.entries(prov)) L.push(`- **${k}**: ${typeof v === 'object' ? '`' + JSON.stringify(v) + '`' : v}`);
L.push(`- **files**: \`${W}\` (smar_1.csv, smar_2.csv, skill_compat.csv, skill_default.csv, *.summary.json, differences.json, logs/)`);
process.stdout.write(L.join('\n') + '\n');
