#!/usr/bin/env node
// fingerprint.js -- prints the browser-mode fingerprint of this skill's 8 injected files (PLAN §2, §6.6).
//
//   node scripts/fingerprint.js [--json]
//   node scripts/fingerprint.js --bundle [--json]   the hash of scripts/min/appstore.bundle.min.js (the ONE file SKILL.md's
//                                                    browser mode pastes; built by team/build_min_appstore.sh)
//   node scripts/fingerprint.js --check             exit 1 when the bundle is stale: a source changed since it was built,
//                                                    or its hash differs from min/fingerprints.json or from SKILL.md
//
// Browser mode injects as_writer, as_search, as_chart, as_reviews, as_checks, net_apple, appstore_core and
// browser_driver verbatim into an itunes.apple.com tab, then calls SMAR_AS_RUN.verify(<hash>); the driver refuses every
// other call until the hash matches (fails closed). This script loads the same 8 files, in the same order, into a
// Node vm page and asks the driver itself for the hash, so the value SKILL.md publishes is computed by the exact code the
// page runs. Any edit to any of the 8 files changes it: re-run this and update SKILL.md after every change.
// stdout: the 64-hex SHA-256 (or {fingerprint, files:[{file, bytes}]} with --json). Exit 0, or 1 when a file is missing
// or the driver fails to load. No network, no file writes.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILES = ['as_writer.js', 'as_search.js', 'as_chart.js', 'as_reviews.js', 'as_checks.js', 'net_apple.js', 'appstore_core.js', 'browser_driver.js'];

async function fingerprint(dir) {
  dir = dir || __dirname;
  const ctx = {
    console, TextEncoder, TextDecoder, URL, AbortController, setTimeout, clearTimeout, Promise,
    crypto: require('crypto').webcrypto,
    location: { origin: 'https://itunes.apple.com', href: 'https://itunes.apple.com/us/rss/topfreeapplications/limit=1/json' },
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  const files = [];
  for (const f of FILES) {
    const p = path.join(dir, f);
    const src = fs.readFileSync(p, 'utf8');
    files.push({ file: f, bytes: Buffer.byteLength(src) });
    vm.runInContext(src, ctx, { filename: f });
  }
  if (!ctx.SMAR_AS_RUN || typeof ctx.SMAR_AS_RUN.fingerprint !== 'function') throw new Error('browser_driver.js did not define SMAR_AS_RUN.fingerprint');
  return { fingerprint: await ctx.SMAR_AS_RUN.fingerprint(), files };
}

// the bundle: one file in the same vm page; its completion value must be 'SMAR_AS_RUN ready'
async function bundleFingerprint(dir) {
  dir = dir || __dirname;
  const p = path.join(dir, 'min', 'appstore.bundle.min.js');
  const ctx = {
    console, TextEncoder, TextDecoder, URL, AbortController, setTimeout, clearTimeout, Promise,
    crypto: require('crypto').webcrypto,
    location: { origin: 'https://itunes.apple.com', href: 'https://itunes.apple.com/us/rss/topfreeapplications/limit=1/json' },
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  const src = fs.readFileSync(p, 'utf8');
  const ret = vm.runInContext(src, ctx, { filename: 'appstore.bundle.min.js' });
  if (ret !== 'SMAR_AS_RUN ready') throw new Error('the bundle returned ' + JSON.stringify(ret) + ' instead of SMAR_AS_RUN ready');
  return { fingerprint: await ctx.SMAR_AS_RUN.fingerprint(), file: 'min/appstore.bundle.min.js', bytes: Buffer.byteLength(src) };
}
// stale-bundle check: every source sha256 recorded in min/fingerprints.json still matches, the bundle's own hash equals the
// recorded one, and SKILL.md quotes it -> {ok, problems[]}
async function check(dir) {
  dir = dir || __dirname;
  const crypto = require('crypto'), problems = [];
  let fp = null;
  try { fp = JSON.parse(fs.readFileSync(path.join(dir, 'min', 'fingerprints.json'), 'utf8')); } catch (e) { return { ok: false, problems: ['min/fingerprints.json missing or unreadable: run team/build_min_appstore.sh'] }; }
  for (const [f, h] of Object.entries(fp.sources || {})) {
    let now = null; try { now = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, f))).digest('hex'); } catch (e) { /* missing */ }
    if (now !== h) problems.push(`${f} changed since the bundle was built: run team/build_min_appstore.sh`);
  }
  for (const f of FILES) if (!(fp.sources || {})[f]) problems.push(`${f} is not in the bundle`);
  let b = null; try { b = await bundleFingerprint(dir); } catch (e) { problems.push('bundle: ' + e.message); }
  if (b && b.fingerprint !== fp.bundle) problems.push('the bundle hash differs from min/fingerprints.json');
  try { const md = fs.readFileSync(path.join(dir, '..', 'SKILL.md'), 'utf8'); if (b && !md.includes(b.fingerprint)) problems.push('SKILL.md does not quote the bundle hash ' + b.fingerprint); } catch (e) { /* no SKILL.md beside */ }
  return { ok: !problems.length, problems, bundle: b && b.fingerprint };
}

if (require.main === module) {
  const dir = process.argv.includes('--dir') ? process.argv[process.argv.indexOf('--dir') + 1] : undefined;
  const json = process.argv.includes('--json');
  const job = process.argv.includes('--check') ? check(dir).then((r) => { process.stdout.write(JSON.stringify(r) + '\n'); if (!r.ok) process.exitCode = 1; })
    : (process.argv.includes('--bundle') ? bundleFingerprint(dir) : fingerprint(dir)).then((r) => { process.stdout.write((json ? JSON.stringify(r) : r.fingerprint) + '\n'); });
  job.catch((e) => { process.stderr.write('fingerprint: ' + (e && e.message || e) + '\n'); process.exit(1); });
}
module.exports = { fingerprint, bundleFingerprint, check, FILES };
