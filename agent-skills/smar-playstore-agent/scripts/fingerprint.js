#!/usr/bin/env node
'use strict';
// Browser injection fingerprints (PLAN B8 / X15).   node fingerprint.js [--check | --update]
// Evaluates each injection set verbatim in a vm context, as the Chrome javascript tool does, and asks the injected
// code itself (SMAR.fingerprint, the code path behind verify()) for the hash, so docs and runtime can never disagree.
// The browser pastes the prebuilt minified bundles in scripts/min/ (team/build_min.sh):
//   metadata set = min/metadata.bundle.min.js                         -> await SMAR_RUN.verify('<hash>')
//   reviews set  = min/metadata.bundle.min.js + min/reviews.bundle.min.js -> await SMAR.verify('<hash>')
// (without scripts/min/ the sets fall back to the sources: extract_play + chart_fetch + browser_driver, and
// extract_play + reviews_play). The source-set hashes are printed too (metadataSource, reviewsSource).
// Prints one JSON line {metadata, reviews, metadataSource, reviewsSource, bytes}.
// --check : exit 1 if SKILL.md or references/*.md still holds a placeholder (<METADATA_HASH>, <REVIEWS_HASH>) or a
//           stale hash in a SMAR_RUN.verify('...') (metadata) or SMAR.verify('...') (reviews) call, if SKILL.md
//           publishes no SMAR_RUN.verify hash at all (the reviews hash is required once the docs mention
//           SMAR_REVIEWS), or if a bundle in scripts/min/ was built from other sources than the current ones
//           (min/fingerprints.json `sources`; rebuild with team/build_min.sh <SKILL>).
// --update: (Gate only) rewrite the placeholders and stale hashes in place (never rebuilds a bundle).
const fs = require('fs'), path = require('path'), vm = require('vm');
const DIR = __dirname, SKILL = path.join(DIR, '..');
const SOURCES = { metadata: ['extract_play.js', 'chart_fetch.js', 'browser_driver.js'], reviews: ['extract_play.js', 'reviews_play.js'] };
const BUNDLES = { metadata: ['min/metadata.bundle.min.js'], reviews: ['min/metadata.bundle.min.js', 'min/reviews.bundle.min.js'] };
const hasBundles = Object.values(BUNDLES).every((l) => l.every((f) => fs.existsSync(path.join(DIR, f))));
const SETS = hasBundles ? BUNDLES : SOURCES;
const sha = (f) => require('crypto').createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function bundleStale() { // a bundle built from older sources (or a fingerprints.json that does not match the bundles)
  if (!hasBundles) return [];
  let man; try { man = JSON.parse(fs.readFileSync(path.join(DIR, 'min', 'fingerprints.json'), 'utf8')); } catch (e) { return [{ file: 'scripts/min/fingerprints.json', set: 'bundles', has: 'missing or unreadable', want: 'run team/build_min.sh <SKILL>' }]; }
  const out = [];
  for (const f of ['extract_play.js', 'chart_fetch.js', 'browser_driver.js', 'reviews_play.js']) { const h = sha(path.join(DIR, f)); if (!man.sources || man.sources[f] !== h) out.push({ file: 'scripts/' + f, set: 'bundles', has: (man.sources || {})[f] || 'none', want: h, fix: 'source changed since the bundles were built: run team/build_min.sh <SKILL>' }); }
  for (const f of ['metadata.bundle.min.js', 'reviews.bundle.min.js']) { const h = sha(path.join(DIR, 'min', f)); if (!man.bundles || !man.bundles[f] || man.bundles[f].sha256 !== h) out.push({ file: 'scripts/min/' + f, set: 'bundles', has: ((man.bundles || {})[f] || {}).sha256 || 'none', want: h, fix: 'bundle edited by hand or fingerprints.json stale: run team/build_min.sh <SKILL>' }); }
  return out;
}

async function hashOf(files) {
  const ctx = { crypto: require('crypto').webcrypto, TextEncoder, URL, console, setTimeout, clearTimeout };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), ctx, { filename: f });
  return ctx.SMAR.fingerprint();
}
const docs = () => [path.join(SKILL, 'SKILL.md')].concat(fs.existsSync(path.join(SKILL, 'references')) ? fs.readdirSync(path.join(SKILL, 'references')).filter((f) => f.endsWith('.md')).sort().map((f) => path.join(SKILL, 'references', f)) : []).filter((f) => fs.existsSync(f));
const RE = { metadata: /(SMAR_RUN\.verify\(\s*['"])([0-9a-f]{64}|<METADATA_HASH>)(['"]\s*\))/g, reviews: /(\bSMAR\.verify\(\s*['"])([0-9a-f]{64}|<REVIEWS_HASH>)(['"]\s*\))/g };

(async () => {
  const want = {}, bytes = {}, src = {};
  for (const [k, files] of Object.entries(SETS)) {
    if (!files.every((f) => fs.existsSync(path.join(DIR, f)))) continue;
    want[k] = await hashOf(files);
    bytes[k] = files.reduce((n, f) => n + fs.statSync(path.join(DIR, f)).size, 0);
  }
  for (const [k, files] of Object.entries(SOURCES)) if (files.every((f) => fs.existsSync(path.join(DIR, f)))) { src[k + 'Source'] = await hashOf(files); bytes[k + 'Source'] = files.reduce((n, f) => n + fs.statSync(path.join(DIR, f)).size, 0); }
  const mode = process.argv.includes('--update') ? 'update' : process.argv.includes('--check') ? 'check' : 'print';
  if (mode === 'print') { console.log(JSON.stringify(Object.assign({ metadata: want.metadata, reviews: want.reviews, bundles: hasBundles }, src, { bytes }))); return; }
  const bstale = bundleStale(), stale = bstale.slice(), changed = [];
  let metaSeen = false, reviewsMentioned = false, reviewsSeen = false;
  for (const f of docs()) {
    const rel = path.relative(SKILL, f), text = fs.readFileSync(f, 'utf8');
    let out = text;
    if (/SMAR_REVIEWS/.test(text)) reviewsMentioned = true;
    for (const k of ['metadata', 'reviews']) {
      out = out.replace(RE[k], (all, a, h, b) => {
        if (k === 'metadata') metaSeen = true; else reviewsSeen = true;
        if (h !== want[k]) stale.push({ file: rel, set: k, has: h, want: want[k] });
        return a + want[k] + b;
      });
      const ph = k === 'metadata' ? '<METADATA_HASH>' : '<REVIEWS_HASH>';
      if (out.includes(ph)) { stale.push({ file: rel, set: k, has: ph, want: want[k] }); out = out.split(ph).join(want[k]); if (k === 'metadata') metaSeen = true; else reviewsSeen = true; }
    }
    if (mode === 'update' && out !== text) { const tmp = f + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, out); fs.renameSync(tmp, f); changed.push(rel); }
  }
  const missing = [];
  if (!metaSeen) missing.push("SKILL.md publishes no SMAR_RUN.verify('<hash>')");
  if (reviewsMentioned && want.reviews && !reviewsSeen) missing.push("docs mention SMAR_REVIEWS but publish no SMAR.verify('<hash>')");
  const ok = mode === 'update' ? !missing.length && !bstale.length : !stale.length && !missing.length;
  console.log(JSON.stringify({ ok, metadata: want.metadata, reviews: want.reviews, stale, missing, updated: mode === 'update' ? changed : undefined }));
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.log(JSON.stringify({ ok: false, error: String(e && e.stack || e).slice(0, 400) })); process.exit(1); });
