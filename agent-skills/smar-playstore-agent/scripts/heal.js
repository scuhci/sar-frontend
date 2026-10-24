#!/usr/bin/env node
// heal.js v3: a thin CLI over extract_play.js healField() (PLAN H1/H2, C22). Run exactly the command that NEXT prints:
//   node heal.js <field>[,<field>...] (--pages <OUT.csv>.pages | --ids a,b,c | --html <appId>=<file>) [--country XX] [--paths F] [--labels F]
//   node heal.js <appId>[,<appId>...] <field>          (legacy form, same as --ids)
// <field> is a PATHS key (maxInstalls) or a CSV column (approximateInstalls). Every decision is made by the shared
// healField() core; this file gathers pages (files, or a polite live fetch through S.makeGet for --ids not found in
// --pages), screens out error/interstitial/unavailable/removed/wrong-storefront pages, and prints. Output on stdout:
//   - "save as <file> (the whole file...): {...}" when at least one field is USE: the complete override file to write
//     (the keys already in <file>, your --paths/--labels F, plus every USE below). Printed first.
//   - exactly ONE JSON line per field, under 700 bytes: {"decision":"USE"|"STOP","status","field","overrideKey",
//     "path"?|"label"?,"reason","next","skipped"?}. Copy a path only from a "decision":"USE" line. STOP: tell the user;
//     never pick a path or a value by eye. Statuses from healField: recommended (USE), label-drift (USE or STOP),
//     current-path-ok, ambiguous, none, path-in-use (the only matching path is read by another field), no-anchor,
//     anchor-missing, wrapper-drift, unknown-field. Added here: usage, rate-limited, combined-check-failed, heal-error, and
//     path-in-use for a USE that would overlap a path already in the saved override file; a label-drift USE whose text is not a
//     real relabel becomes STOP. healField re-checks every field of every page with the new path (no other field may start to fail).
// Exit: 0 decisions printed (see each line) ; 1 Google rate limit or consent page (stop, try later) ; 2 usage, unknown
// field or page-wrapper drift ; 5 crash.
'use strict';
const fs = require('fs'), path = require('path');
const S = require('./extract_play.js');

const USAGE = 'node heal.js <field>[,<field>...] (--pages <OUT.csv>.pages | --ids a,b,c | --html <appId>=<file>) [--country XX] [--paths F] [--labels F]';
const VALUE_FLAGS = ['--pages', '--ids', '--html', '--country', '--paths', '--labels'];
const FATAL = { SORRY: 1, CONSENT: 1, INTERSTITIAL: 1, RATE_LIMITED: 1 };
const MAX_LINE = 700; // H2: each decision line stays under 700 bytes
const NEXT_STOP = 'STOP: tell the user which column could not be repaired and why; do not deliver it without their OK; never pick a path or value by eye';
const fail = (msg) => Object.assign(new Error(msg), { code: 'USAGE' });

function parseArgs(argv) {
  const a = { fields: [], ids: [], pages: [], html: [], country: null, paths: null, labels: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--help' || t === '-h') { a.help = true; continue; }
    if (/^--/.test(t)) {
      const eq = t.indexOf('='), flag = eq > 0 ? t.slice(0, eq) : t;
      if (!VALUE_FLAGS.includes(flag)) throw fail(`unknown option ${flag}`);
      const v = eq > 0 ? t.slice(eq + 1) : argv[++i];
      if (v == null || v === '' || (eq < 0 && /^--/.test(v))) throw fail(`${flag} needs a value`);
      if (flag === '--pages') a.pages.push(v);
      else if (flag === '--ids') a.ids.push(...v.split(',').map((s) => s.trim()).filter(Boolean));
      else if (flag === '--html') a.html.push(v);
      else if (flag === '--country') a.country = v;
      else if (flag === '--paths') a.paths = v;
      else a.labels = v;
      continue;
    }
    for (const s of t.split(',').map((x) => x.trim()).filter(Boolean)) {
      if (/[\/\\]|\.(csv|json|html?|pages|txt)$/i.test(s)) throw fail(`"${s}" looks like a file, not a field or app id; pass saved pages as --pages <OUT.csv>.pages and overrides as --paths F`);
      (s.includes('.') ? a.ids : a.fields).push(s); // ids always contain a dot, field names never do
    }
  }
  for (const id of a.ids) if (!S.isAppId(id)) throw fail(`"${id}" is not an app id (like com.example.app)`);
  a.ids = [...new Set(a.ids)];
  return a;
}

function readJson(file, what) {
  let txt;
  try { txt = fs.readFileSync(file, 'utf8'); } catch (e) { throw fail(`cannot read ${what} file ${file}`); }
  try { return JSON.parse(txt.replace(/^\uFEFF/, '')); } catch (e) { throw fail(`${what} file ${file} is not valid JSON`); }
}
const canonPaths = (o) => JSON.parse(S.canonPaths(o)); // throws USAGE on an invalid override
function canonLabels(o) { try { return S.useLabels(o); } finally { S.useLabels(null); } } // throws USAGE on invalid labels

// A page is handed to healField unless it is plainly not this app's details page (error, interstitial, unavailable,
// removed, wrong storefront). A page with no data blobs at all stays in (and is listed), so healField can tell
// wrapper drift from path drift.
function screen(pg, country) {
  const P = S.parsePage(pg.html, { status: pg.status, url: pg.url, appId: pg.id, country: country || 'US' });
  const noBlobs = !P.blobCount;
  if (P.kind !== 'app' && !(noBlobs && P.kind === 'error_page' && !/<title[^>]*>Error \d{3} \(/.test(pg.html) && !(pg.status >= 500))) return { why: P.kind };
  if (country && !P.storefront.ok) return { why: 'wrong_storefront' };
  return { keep: true, why: noBlobs ? 'no-blobs' : null };
}

async function gather(a, country, skipped) {
  const pages = [], have = new Set(), want = a.ids.length ? new Set(a.ids) : null;
  const add = (pg, checkCountry) => {
    if (have.has(pg.id)) return;
    have.add(pg.id);
    const s = screen(pg, checkCountry);
    if (s.why) skipped.push(pg.id + ':' + s.why);
    if (s.keep) pages.push({ id: pg.id, html: pg.html });
  };
  for (const dir of a.pages) {
    let names;
    try { if (!fs.statSync(dir).isDirectory()) throw new Error(); names = fs.readdirSync(dir); } catch (e) { throw fail(`--pages ${dir} is not a directory`); }
    for (const f of names.filter((n) => /\.html$/.test(n)).sort()) {
      const id = f.slice(0, -5);
      if (want && !want.has(id)) continue;
      add({ id, html: fs.readFileSync(path.join(dir, f), 'utf8') }, a.country ? country : null);
    }
  }
  for (const spec of a.html) {
    const eq = spec.indexOf('='), file = eq > 0 ? spec.slice(eq + 1) : spec, id = eq > 0 ? spec.slice(0, eq) : path.basename(file).replace(/\.html?$/, '');
    if (!S.isAppId(id)) throw fail(`--html needs <appId>=<file> (got "${spec}")`);
    let html;
    try { html = fs.readFileSync(file, 'utf8'); } catch (e) { throw fail(`cannot read --html file ${file}`); }
    add({ id, html }, a.country ? country : null);
  }
  const live = a.ids.filter((id) => !have.has(id));
  if (live.length) {
    if (typeof globalThis.fetch !== 'function') throw fail('--ids needs Node 18 or newer (global fetch)');
    const get = S.makeGet((u, init) => globalThis.fetch(u, init), {}), U = S.urls(country);
    for (const id of live) {
      let r;
      try { r = await get(U.details(id)); } catch (e) { if (FATAL[e && e.code]) throw e; skipped.push(`${id}:fetch-failed(${(e && e.code) || 'error'})`); have.add(id); continue; }
      if (r.status === 404 || r.text == null) skipped.push(id + ':not_found');
      else if (r.status !== 200) skipped.push(id + ':http_' + r.status);
      else { add({ id, html: r.text, status: r.status, url: r.url }, country); continue; }
      have.add(id);
    }
  }
  return pages;
}

// A label-drift USE is only a reworded label when (1) the new text is not the other field's label, (2) it still names
// the same thing (ads / in-app purchases), and (3) the data at the field's path is still that field's data on every
// page where it is set (IAP: a "<price> - <price> per item" range, GB "... if billed through Play"; ads: one short label text, the same on every page).
// Otherwise a PATH moved onto other data that merely correlates with a visible text ("star", "Everyone", the IAP label).
const LABEL_WORD = { ads: /\bads?\b|advert/i, iap: /purchas|in[- ]app/i };
function labelUseProblem(r, key, pages, basePaths, baseLabels) {
  const t = String(r.label || '').trim().toLowerCase();
  for (const k of Object.keys(S.LABELS)) if (k !== r.overrideKey && S.LABELS[k].concat(baseLabels[k] || []).some((l) => String(l).trim().toLowerCase() === t)) return `"${r.label}" is the ${k} label`;
  if (LABEL_WORD[r.overrideKey] && !LABEL_WORD[r.overrideKey].test(String(r.label))) return `"${r.label}" does not name ${r.overrideKey === 'ads' ? 'ads' : 'in-app purchases'}`;
  S.usePaths(basePaths);
  try {
    const vals = pages.map((p) => S.extractApp(p.html, p.id).raw[key]).filter((v) => v).map((v) => (Array.isArray(v) && v.length === 1 ? v[0] : v));
    const ok = key === 'offersIAPRange' ? vals.every(S.iapShapeOk) : vals.every((v) => typeof v === 'string' && v.length <= 40 && !/\d|https?:/i.test(v) && v === vals[0]);
    return ok && vals.length >= 2 ? null : `the data at the ${key} path is not ${key} data`;
  } finally { S.usePaths({}); }
}

// Fit one decision line under MAX_LINE bytes: trim the skipped list first, then over-long free text (a user-supplied
// file name or field in a usage message), never the decision, status or path.
function fit(line) {
  const size = () => Buffer.byteLength(JSON.stringify(line));
  const all = Array.isArray(line.skipped) ? [...new Set(line.skipped)] : [];
  delete line.skipped;
  for (let k = all.length; all.length && k >= 0; k--) {
    line.skipped = k === all.length ? all : all.slice(0, k).concat(`+${all.length - k} more`);
    if (size() < MAX_LINE) return line;
  }
  delete line.skipped;
  for (const k of ['field', 'overrideKey']) if (size() >= MAX_LINE && typeof line[k] === 'string' && line[k].length > 60) line[k] = line[k].slice(0, 57) + '...';
  if (size() >= MAX_LINE && typeof line.reason === 'string') line.reason = line.reason.slice(0, Math.max(40, line.reason.length - (size() - MAX_LINE) - 8)) + '...';
  return line;
}
const overlap = (p, q) => { for (let i = 0; i < Math.min(p.length, q.length); i++) if (p[i] !== q[i]) return false; return true; };
const order = (r) => { const o = {}; for (const k of ['decision', 'status', 'field', 'overrideKey', 'path', 'label', 'reason', 'next']) if (r[k] !== undefined) o[k] = r[k]; return Object.assign(o, r); };

async function main(argv, out) {
  out = out || ((s) => process.stdout.write(s + '\n'));
  let a, fields = [];
  const stopAll = (status, reason, next, extra) => { const fs2 = fields.length ? fields : [{ field: '', key: '' }]; for (const f of fs2) out(JSON.stringify(fit(order(Object.assign({ decision: 'STOP', status, field: f.field, overrideKey: f.key || f.field, reason, next }, extra || {}))))); };
  try {
    a = parseArgs(argv);
    if (a.help) { out('usage: ' + USAGE); return 0; }
    const seen = new Set();
    for (const f of a.fields) { const key = S.fieldKey(f); const k = key || f; if (!seen.has(k)) { seen.add(k); fields.push({ field: f, key }); } }
    if (!fields.length) throw fail('name at least one field (a PATHS key or a CSV column)');
    if (fields.some((f) => !f.key)) { // H1: an unknown field exits 2 before any page is read or fetched
      for (const f of fields) out(JSON.stringify(f.key ? order({ decision: 'STOP', status: 'usage', field: f.field, overrideKey: f.key, reason: 'not run: another field in this command is unknown; fix the command and run it again', next: 'usage: ' + USAGE }) : fit(order(S.healField([], f.field, { runner: 'shell' })))));
      return 2;
    }
    const country = String(a.country == null ? 'US' : a.country).trim().toUpperCase();
    if (!S.COUNTRIES.includes(country)) throw fail(`unknown --country "${a.country}" (a two-letter code SMAR supports, e.g. US, GB, DE)`);
    const basePaths = a.paths ? canonPaths(readJson(a.paths, '--paths')) : {};
    const baseLabels = a.labels ? canonLabels(readJson(a.labels, '--labels')) : {};
    if (!a.pages.length && !a.html.length && !a.ids.length) throw fail('give the pages to heal from: --pages <OUT.csv>.pages, --ids a,b,c or --html <appId>=<file>');
    const o = { paths: basePaths, labels: baseLabels, runner: 'shell' };
    // Fields healField settles without any page (no anchor exists): no reading or fetching for them.
    const res = fields.map((f) => { const r = S.healField([], f.field, o); return r.status === 'no-anchor' ? r : null; });
    const skipped = [];
    const pages = res.every(Boolean) ? [] : await gather(a, country, skipped);
    let code = 0;
    fields.forEach((f, i) => {
      if (res[i]) return;
      try { res[i] = S.healField(pages, f.field, o); } catch (e) { res[i] = { decision: 'STOP', status: 'heal-error', field: f.field, overrideKey: f.key, reason: 'heal crashed (' + String(e && e.message).slice(0, 120) + '); report it, do not edit paths', next: NEXT_STOP }; code = 5; }
      if (res[i].status === 'wrapper-drift' && code < 2) code = 2;
    });
    // Label-drift USE guard (mirrors the healField patch proposed to the Gate; it can only turn a USE into a STOP).
    res.forEach((r, i) => {
      const why = r.decision === 'USE' && r.status === 'label-drift' ? labelUseProblem(r, fields[i].key, pages, basePaths, baseLabels) : null;
      if (why) res[i] = { decision: 'STOP', status: 'label-drift', field: r.field, overrideKey: r.overrideKey, reason: `${why}: the ${fields[i].key} path moved; this is not a new label`, next: NEXT_STOP };
    });
    const dirOf = () => (a.pages.length ? path.dirname(path.resolve(a.pages[0])) : a.paths ? path.dirname(path.resolve(a.paths)) : a.labels ? path.dirname(path.resolve(a.labels)) : null);
    // Several USE paths in one command: they must also hold together, or none of the clashing ones is used.
    const uses = res.filter((r) => r.decision === 'USE');
    if (uses.length > 1) {
      const P = Object.assign({}, basePaths), L = Object.assign({}, baseLabels);
      for (const r of uses) if (r.status === 'label-drift') L[r.overrideKey] = [r.label]; else P[r.overrideKey] = r.path;
      res.forEach((r, i) => { // path USEs only: a label USE cannot be re-verified by healField (the JSON keeps the old text)
        if (r.decision !== 'USE' || r.status === 'label-drift') return;
        const r2 = S.healField(pages, fields[i].field, { paths: P, labels: L, runner: 'shell' });
        if (r2.status !== 'current-path-ok') res[i] = { decision: 'STOP', status: 'combined-check-failed', field: r.field, overrideKey: r.overrideKey, reason: 'this path fails once the other USE paths of this command are applied too; heal one field per command', next: NEXT_STOP };
      });
    }
    // The ready-to-save override files: what is already in the target file, then --paths/--labels, then every USE.
    const dir = dirOf();
    const snippet = (kind, base, flag, adds, canon) => {
      if (!adds.length) return null;
      const target = dir ? path.join(dir, kind + '.override.json') : 'OUT_DIR/' + kind + '.override.json';
      let prior = {}, note = '';
      if (dir && fs.existsSync(target)) { try { prior = canon(readJson(target, kind)); note = '; keeps the keys already in it'; } catch (e) { note = '; its current content is unreadable and is replaced'; } }
      const merged = canon(Object.assign({}, prior, base, ...adds));
      const empty = Object.keys(merged).length ? '' : '; {} means the built-in ' + kind;
      out(`save as ${target} (the whole file${note}${Object.keys(base).length ? '; includes your ' + flag + ' overrides' : ''}${empty}): ${JSON.stringify(merged)}`);
      return target;
    };
    // The file that will be saved must not make two fields read the same data (keys already in the target file are merged
    // in below and healField never saw them): a USE whose path overlaps another field's final path becomes STOP.
    const priorPaths = (() => { const t = dirOf() ? path.join(dirOf(), 'paths.override.json') : null; try { return t && fs.existsSync(t) ? canonPaths(readJson(t, 'paths')) : {}; } catch (e) { return {}; } })();
    res.forEach((r, i) => {
      if (r.decision !== 'USE' || r.status === 'label-drift') return;
      const fin = Object.assign({}, S.DEFAULT_PATHS, priorPaths, basePaths); for (const u of res) if (u.decision === 'USE' && u.status !== 'label-drift') fin[u.overrideKey] = u.path;
      const ov = Object.keys(fin).filter((g) => g !== r.overrideKey && overlap(fin[g], r.path));
      if (ov.length) res[i] = { decision: 'STOP', status: 'path-in-use', field: r.field, overrideKey: r.overrideKey, reason: `path ${JSON.stringify(r.path)} is also read by ${ov.join(', ')} in the override file this would be saved into; report both columns`, next: NEXT_STOP };
    });
    const finalUses = res.filter((r) => r.decision === 'USE');
    const pt = snippet('paths', basePaths, '--paths', finalUses.filter((r) => r.status !== 'label-drift').map((r) => ({ [r.overrideKey]: r.path })), canonPaths);
    const lt = snippet('labels', baseLabels, '--labels', finalUses.filter((r) => r.status === 'label-drift').map((r) => ({ [r.overrideKey]: [r.label] })), canonLabels);
    for (const r of res) {
      const line = order(r);
      if (skipped.length) line.skipped = skipped.concat(line.skipped || []);
      if (r.decision === 'USE') {
        const lab = r.status === 'label-drift', t = lab ? lt : pt;
        const nx = `write the JSON of the "save as" line above into that file (it already keeps your other overrides), then re-run your original command into a NEW output file with ${lab ? '--labels' : '--paths'} ${t}`;
        if (Buffer.byteLength(JSON.stringify(Object.assign({}, line, { next: nx, skipped: undefined }))) < MAX_LINE) line.next = nx;
      }
      out(JSON.stringify(fit(line)));
    }
    return code;
  } catch (e) {
    if (e && FATAL[e.code]) { stopAll('rate-limited', `Google answered with its rate-limit or consent page (${e.code}); nothing was healed`, 'STOP: stop now, tell the user, and run the same heal command again later'); return 1; }
    if (e && e.code === 'USAGE') { stopAll('usage', String(e.message), 'usage: ' + USAGE); return 2; }
    stopAll('heal-error', 'heal crashed (' + String(e && e.message).slice(0, 160) + '); report it, do not edit paths', NEXT_STOP);
    return 5;
  }
}

module.exports = { main, parseArgs, USAGE };
if (require.main === module) main(process.argv.slice(2)).then((c) => { process.exitCode = c; }, (e) => { process.stdout.write(JSON.stringify({ decision: 'STOP', status: 'heal-error', reason: String(e && e.message).slice(0, 200), next: NEXT_STOP }) + '\n'); process.exitCode = 5; });
