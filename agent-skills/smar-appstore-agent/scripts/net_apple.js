'use strict';
// net_apple.js -- Apple transport for smar-appstore-agent (PLAN §5, §6.5). UMD: require() in Node, window.SMAR_AS_NET in
// a browser. Owner: net. Node core only (http/https/zlib/crypto/fs/os/path), never the global fetch in Node.
//
// EXPORTS
//   VERSION, LIMITS {itunesApiPerMin:18, appleOtherPerMin:30, intervalMs:{itunes_api, apple_other}},
//   BACKOFF {baseMs:15000, cap403:300000, cap5xx:60000, jitter:0.2, maxRetries:6, stopAfterMs:360000, maxRedirects:5,
//            timeoutMs:30000, garbledRetries:2}
//   isAppleHost(host), hostOf(url), bucketFor(url) -> 'itunes_api'|'apple_other', isRetryable(status)
//   journalKey(method, url, headers)   sha1(method+' '+url+'\n'+sorted 'lowercasename:value' lines) == EA/lib/ratelimit cacheKey
//   computeBackoff(fails, status, retryAfterMs, rand) -> ms        (pure; 15 s doubling, cap 5 min 403/429, 60 s 5xx/0)
//   parseRetryAfter(value, nowMs) -> ms|0
//   detectGarbled(text) -> {garbled, gzipMagic, reason}           (gzip magic as UTF-8 text, or >2% U+FFFD)
//   decodeBody(buf, contentEncoding) -> {text, decoded, undeclaredGzip, error}    (Node only: gzip/x-gzip/deflate/br)
//   netError(code, message, extra) -> Error with string .code
//   createGetter(deps) -> get(req)     shared retry/limiter/journal engine (Node and browser)
//   getChunks(io, idsOrChunks, buildReq, opts) -> {results:[{ids, res}], failed:[{ids, status}], splits}
//        (results holds every final response in request order, failed ones included; failed = single ids still 5xx)
//        5xx on a multi-id batch -> halve and retry both halves, down to single ids (PLAN §5.3). Each batch gets
//        opts.retry5xx (default 1) plain 5xx retries before it is split.
//   Node only:  makeIo(opts) -> io;  fileLimiter(opts);  nodeTransport(url, {method, headers, timeoutMs});
//               journalPath(dir, method, url, headers);  readRecord(dirs, req);  writeRecord(dir, rec)
//   Browser:    makeBrowserIo(opts) -> io  (fetch with credentials:'omit'; in-page pacing; optional journal store)
//
// makeIo({out, record, replay, resume, label, deadlineMs, rlDir, transport, limiter, now, sleep, maxRetries, allowHosts}) -> io
//   out        OUT csv path: journal under <out>.pages/<host>/<key>.json.gz, save(st) -> <out>.progress.json
//   record     extra journal dir (eval only, --record DIR)
//   replay     dir or array of dirs (--replay DIR): read only, fail closed with REPLAY_MISS. A dir may be a skill
//              journal (<host>/<key>.json.gz) or a campaign cache day (EA/cache/<date>/<host>/<key>.json).
//   resume     true: a journaled response under <out>.pages is returned without a request (never re-fetched), unless
//              its status is retryable (403/429/5xx), which is fetched again.
//   deadlineMs absolute epoch ms: a grant that would land past it throws code DEADLINE (runner exits 3).
//   transport  test hook replacing nodeTransport (same signature).
// Limiter selection (PLAN §5.7): globalThis.__APPLE_RL (campaign preload loaded via NODE_OPTIONS) -> 'preload': no own
//   spacing or cooldown, requests go through Node core https so the preload's http.Agent hook throttles each hop;
//   else env SMAR_APPLE_RL=<path to ratelimit.js> -> 'module': that module's acquire()/reportStatus();
//   else 'own': file-locked schedule in ${os.tmpdir()}/smar-appstore-agent/rl/ (state.json + mkdir lock, 15 s stale),
//   shared by every process of this user. APPLE_RL_LABEL labels journal records.
//
// io = { get(req), now(), sleep(ms), save(st), journal(rec), stats(), limiterMode, pagesDir }
//   req = {url, headers?, method?, maxRetries?, retry5xx?, noJournal?, fresh?, journalTag?}  (fresh:true = never answered
//   from the journal; replay still is. journalTag: a second read of the same URL kept under its own journal key, e.g.
//   the search rank re-read, so it never overwrites the first response and --resume/--replay see both)
//   get -> {status, body, headers, finalUrl, hops:[{url,status}], fromJournal, contentEncoding, undeclaredGzip,
//           gzipBody, garbled, attempts, fetchedAt}
//   gzipBody = the response bytes were gzip/deflate/br while the request sent no Accept-Encoding: SMAR's request
//   transport (no decoding) would have read garbage there (smar-similar-gzip-silent-loss, Q11 -> transportRisk).
//   get never throws on an HTTP status. Thrown errors carry .code: RATE_LIMITED (a bucket spent >6 min cooling down;
//   NEXT: STOP), NETWORK (network error after retries), REPLAY_MISS, DEADLINE, HOST_REFUSED.
// stats() -> {itunes_api, apple_other, journalHits, retries, waitedMs, rateLimited, hops, gzipPages:[url],
//            garbledPages:[url], batchSplits}
(function (root, factory) {
  // source(): the full module text for the browser fingerprint (browser_driver.js), not just the exported surface
  if (typeof module === 'object' && module.exports) module.exports = Object.assign(factory(true), { source: () => String(factory) });
  else root.SMAR_AS_NET = Object.assign(factory(false), { source: () => String(factory) });
})(typeof globalThis !== 'undefined' ? globalThis : this, function (IS_NODE) {
  const VERSION = '2.1.0';
  const LIMITS = { itunesApiPerMin: 18, appleOtherPerMin: 30, intervalMs: { itunes_api: Math.ceil(60000 / 18) + 10, apple_other: Math.ceil(60000 / 30) + 10 } };
  const BACKOFF = { baseMs: 15000, cap403: 5 * 60000, cap5xx: 60000, jitter: 0.2, maxRetries: 6, stopAfterMs: 6 * 60000, maxRedirects: 5, timeoutMs: 30000, garbledRetries: 2 };
  const KEEP_HEADERS = ['date', 'cache-control', 'age', 'x-cache', 'x-cache-remote', 'content-encoding', 'content-type', 'x-apple-request-uuid', 'retry-after', 'location'];

  function netError(code, message, extra) { const e = new Error(message || code); e.code = String(code); if (extra) Object.assign(e, extra); return e; }
  function hostOf(u) { try { return new URL(u).hostname.toLowerCase(); } catch (e) { return String(u || '').toLowerCase(); } }
  function isAppleHost(host) {
    host = String(host || '').toLowerCase().replace(/:\d+$/, '');
    return /(^|\.)(apple\.com|itunes\.com|mzstatic\.com|applemarketingtools\.com|apple-cloudkit\.com|cdn-apple\.com)$/.test(host);
  }
  function bucketFor(u) {
    let h = '', p = '';
    try { const x = new URL(u); h = x.hostname.toLowerCase(); p = x.pathname; } catch (e) { h = hostOf(u); }
    if (h === 'search.itunes.apple.com') return 'itunes_api';
    if (h === 'itunes.apple.com' && /^\/(search|lookup)\b/.test(p)) return 'itunes_api';
    return 'apple_other';
  }
  const isRetryable = (st) => st === 0 || st === 403 || st === 429 || (st >= 500 && st <= 599);
  function computeBackoff(fails, status, retryAfterMs, rand) {
    const cap = (status === 403 || status === 429) ? BACKOFF.cap403 : BACKOFF.cap5xx;
    let cd = Math.min(cap, BACKOFF.baseMs * Math.pow(2, Math.max(0, fails - 1)));
    const r = typeof rand === 'number' ? rand : Math.random();
    cd = Math.round(cd * (1 - BACKOFF.jitter + r * 2 * BACKOFF.jitter));
    if (retryAfterMs > cd) cd = retryAfterMs; // Retry-After wins when it is longer
    return cd;
  }
  function parseRetryAfter(v, nowMs) {
    if (v == null || v === '') return 0;
    const s = String(Array.isArray(v) ? v[0] : v).trim();
    if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s) * 1000);
    const t = Date.parse(s);
    return isNaN(t) ? 0 : Math.max(0, t - (nowMs || Date.now()));
  }
  // A gzip body read as UTF-8 starts with \x1f followed by U+FFFD (0x8b is not valid UTF-8) or \x1f\x8b (latin1).
  function detectGarbled(text) {
    const s = String(text == null ? '' : text);
    if (s.charCodeAt(0) === 0x1f && (s.charCodeAt(1) === 0xfffd || s.charCodeAt(1) === 0x8b)) return { garbled: true, gzipMagic: true, reason: 'gzip_magic' };
    if (s.length >= 64) {
      let bad = 0; const n = Math.min(s.length, 4096);
      for (let i = 0; i < n; i++) if (s.charCodeAt(i) === 0xfffd) bad++;
      if (bad / n > 0.02) return { garbled: true, gzipMagic: false, reason: 'replacement_chars' };
    }
    return { garbled: false, gzipMagic: false, reason: null };
  }
  function pickHeaders(h) {
    const o = {};
    for (const k of KEEP_HEADERS) { const v = h && (h[k] != null ? h[k] : h[k.toLowerCase()]); if (v != null) o[k] = Array.isArray(v) ? v.join(', ') : String(v); }
    return o;
  }
  function lowerKeys(h) { const o = {}; for (const k of Object.keys(h || {})) o[k.toLowerCase()] = h[k]; return o; }
  function sentAcceptEncoding(headers) { return Object.keys(headers || {}).some((k) => k.toLowerCase() === 'accept-encoding'); }
  const sleepMs = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

  // ---------------------------------------------------------------------------------------------------------------
  // createGetter: retries, redirects, limiter, journal. Environment-neutral; deps supply the platform parts.
  //   deps.transport(url, {method, headers, timeoutMs}) -> {status, headers(lowercase), text, contentEncoding,
  //        undeclaredGzip, decodeError}; throws on network failure
  //   deps.limiter = {mode, acquire(url, {deadlineMs}) -> {waitedMs}, report(url, status, {retryAfterMs}) -> cooldownMs}
  //   deps.journal = {find(req) -> rec|null, findReplay(req) -> rec|null|undefined (undefined = no replay), write(rec)}
  //   deps.now(), deps.sleep(ms), deps.deadlineMs, deps.label, deps.allowHost(host), deps.maxRetries
  function createGetter(deps) {
    const now = deps.now || (() => Date.now());
    const stats = deps.stats || { itunes_api: 0, apple_other: 0, journalHits: 0, retries: 0, waitedMs: 0, rateLimited: 0, hops: 0, gzipPages: [], garbledPages: [], batchSplits: 0 };
    const allowHost = deps.allowHost || isAppleHost;
    function checkHost(u) { if (!allowHost(hostOf(u))) throw netError('HOST_REFUSED', 'refusing non-Apple host ' + hostOf(u)); }
    function fromRecord(rec) {
      const g = detectGarbled(rec.body);
      const out = {
        status: rec.status, body: rec.body, headers: rec.headers || {}, finalUrl: rec.finalUrl || rec.url, hops: rec.hops || [{ url: rec.url, status: rec.status }],
        fromJournal: true, contentEncoding: rec.contentEncoding != null ? rec.contentEncoding : ((rec.headers && rec.headers['content-encoding']) || null),
        undeclaredGzip: !!rec.undeclaredGzip, gzipBody: !!rec.gzipBody || g.gzipMagic, garbled: rec.garbled != null ? (!!rec.garbled || g.garbled) : g.garbled,
        attempts: 0, fetchedAt: rec.fetchedAt || null,
      };
      if (out.gzipBody && stats.gzipPages.indexOf(out.finalUrl) < 0) stats.gzipPages.push(out.finalUrl);
      if (out.garbled && stats.garbledPages.indexOf(out.finalUrl) < 0) stats.garbledPages.push(out.finalUrl);
      return out;
    }
    // one logical request: follow redirects, each hop takes a grant
    async function once(req) {
      let cur = req.url; const hops = []; let method = req.method;
      for (let hop = 0; ; hop++) {
        checkHost(cur);
        const g = await deps.limiter.acquire(cur, { deadlineMs: deps.deadlineMs });
        if (g && g.waitedMs) stats.waitedMs += g.waitedMs;
        stats[bucketFor(cur)]++; stats.hops++;
        let r;
        try { r = await deps.transport(cur, { method, headers: req.headers, timeoutMs: BACKOFF.timeoutMs }); } catch (e) {
          hops.push({ url: cur, status: 0, error: String(e && e.message || e) });
          const cd = await deps.limiter.report(cur, 0, {});
          throw Object.assign(netError('NETWORK', 'network error on ' + cur + ': ' + (e && e.message || e)), { hops, cooldownMs: cd || 0, cause: e });
        }
        hops.push({ url: cur, status: r.status });
        const cd = await deps.limiter.report(cur, r.status, { retryAfterMs: parseRetryAfter(r.headers && r.headers['retry-after'], now()) });
        const loc = r.headers && r.headers.location;
        if (r.status >= 300 && r.status < 400 && loc && hop < BACKOFF.maxRedirects) {
          cur = new URL(loc, cur).toString();
          if (r.status === 303) method = 'GET';
          continue;
        }
        return Object.assign(r, { finalUrl: cur, hops, cooldownMs: cd || 0 });
      }
    }
    return async function get(reqIn) {
      const req = typeof reqIn === 'string' ? { url: reqIn } : Object.assign({}, reqIn);
      req.method = String(req.method || 'GET').toUpperCase();
      req.headers = req.headers || {};
      if (!req.url) throw netError('BAD_REQUEST', 'get(): url is required');
      checkHost(req.url);
      const replay = deps.journal && deps.journal.findReplay ? deps.journal.findReplay(req) : undefined;
      if (replay !== undefined) {
        if (!replay) throw netError('REPLAY_MISS', 'replay journal has no response for ' + req.method + ' ' + req.url, { url: req.url });
        stats.journalHits++; return fromRecord(replay);
      }
      if (deps.journal && deps.journal.find && !req.fresh) {
        const rec = deps.journal.find(req);
        if (rec && !isRetryable(rec.status) && !(rec.garbled)) { stats.journalHits++; return fromRecord(rec); }
      }
      const maxRetries = req.maxRetries != null ? req.maxRetries : (deps.maxRetries != null ? deps.maxRetries : BACKOFF.maxRetries);
      const retry5xx = req.retry5xx != null ? Math.min(req.retry5xx, maxRetries) : maxRetries;
      let tries = 0, tries5xx = 0, garbledTries = 0, streakMs = 0, firstFailAt = 0, last = null;
      for (;;) {
        let r = null, err = null;
        try { r = await once(req); } catch (e) {
          if (e && /^(DEADLINE|RATE_LIMITED|HOST_REFUSED|REPLAY_MISS)$/.test(e.code)) { if (e.code === 'RATE_LIMITED') stats.rateLimited++; throw e; }
          err = e;
        }
        const status = r ? r.status : 0;
        if (err || isRetryable(status)) {
          firstFailAt = firstFailAt || now();
          streakMs += (r ? r.cooldownMs : (err && err.cooldownMs)) || 0;
          const limited = status === 403 || status === 429;
          if (limited) stats.rateLimited++;
          const overBudget = streakMs > BACKOFF.stopAfterMs || (now() - firstFailAt) > BACKOFF.stopAfterMs;
          const is5xx = status >= 500;
          const canRetry = tries < maxRetries && (!is5xx || tries5xx < retry5xx);
          if (limited && overBudget) {
            throw netError('RATE_LIMITED', 'Apple kept refusing ' + bucketFor(req.url) + ' requests for more than 6 minutes', { url: req.url, status, bucket: bucketFor(req.url) });
          }
          if (canRetry && !overBudget) { tries++; if (is5xx) tries5xx++; stats.retries++; continue; } // the limiter's acquire() waits out the cooldown
          if (err) { err.code = 'NETWORK'; throw err; }
          if (limited) throw netError('RATE_LIMITED', 'HTTP ' + status + ' from ' + hostOf(req.url) + ' after ' + tries + ' retries', { url: req.url, status, bucket: bucketFor(req.url) });
          last = r; // a 5xx after retries: returned, never thrown (callers halve batches on it)
        } else {
          last = r;
          const g = detectGarbled(r.text);
          if ((g.garbled || r.decodeError) && garbledTries < BACKOFF.garbledRetries) { garbledTries++; stats.retries++; continue; }
        }
        break;
      }
      const r = last;
      const g = detectGarbled(r.text);
      const encoded = !!(r.contentEncoding && !/^identity$/i.test(r.contentEncoding)) || !!r.undeclaredGzip;
      const out = {
        status: r.status, body: r.text, headers: pickHeaders(r.headers), finalUrl: r.finalUrl, hops: r.hops, fromJournal: false,
        contentEncoding: r.contentEncoding || null, undeclaredGzip: !!r.undeclaredGzip,
        gzipBody: (encoded && !sentAcceptEncoding(req.headers)) || g.gzipMagic, garbled: g.garbled || !!r.decodeError,
        attempts: tries + garbledTries + 1, fetchedAt: new Date(now()).toISOString(),
      };
      if (out.gzipBody && stats.gzipPages.indexOf(out.finalUrl) < 0) stats.gzipPages.push(out.finalUrl);
      if (out.garbled && stats.garbledPages.indexOf(out.finalUrl) < 0) stats.garbledPages.push(out.finalUrl);
      if (deps.journal && deps.journal.write && !req.noJournal) {
        deps.journal.write({
          v: 1, method: req.method, url: req.url, reqHeaders: req.headers, status: out.status, headers: out.headers, body: out.body,
          finalUrl: out.finalUrl, hops: out.hops, fetchedAt: out.fetchedAt, contentEncoding: out.contentEncoding,
          undeclaredGzip: out.undeclaredGzip, gzipBody: out.gzipBody, garbled: out.garbled, label: deps.label || undefined,
          journalTag: req.journalTag || undefined,
        });
      }
      return out;
    };
  }

  // 5xx on a batch -> split in halves (first half = ceil), down to single ids (PLAN §5.3; a 200-bundleId URL -> 502).
  async function getChunks(io, ids, buildReq, opts) {
    opts = opts || {};
    const retry5xx = opts.retry5xx != null ? opts.retry5xx : 1;
    const results = [], failed = []; let splits = 0;
    async function run(chunk) {
      const req = Object.assign({}, buildReq(chunk));
      if (req.retry5xx == null) req.retry5xx = retry5xx;
      const res = await io.get(req);
      if (res.status >= 500 && chunk.length > 1) {
        splits++;
        const mid = Math.ceil(chunk.length / 2);
        await run(chunk.slice(0, mid)); await run(chunk.slice(mid));
        return;
      }
      if (res.status >= 500 || res.status === 0) failed.push({ ids: chunk, status: res.status });
      results.push({ ids: chunk, res });
    }
    const chunks = Array.isArray(ids[0]) ? ids : [ids];
    for (const c of chunks) if (c.length) await run(c);
    if (typeof io._addSplits === 'function') io._addSplits(splits);
    return { results, failed, splits };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Node
  let nodeApi = {};
  if (IS_NODE) {
    const fs = require('fs'), os = require('os'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');
    const http = require('http'), https = require('https');
    let F = null;
    try { F = require('./fsutil.js'); } catch (e) { F = null; }
    const atomicWrite = (p, d) => { if (F) return F.atomicWrite(p, d); const t = p + '.' + process.pid + '.tmp'; fs.writeFileSync(t, d); fs.renameSync(t, p); };

    function journalKey(method, u, headers, tag) {
      const h = Object.keys(headers || {}).map((k) => k.toLowerCase() + ':' + headers[k]).sort().join('\n');
      return crypto.createHash('sha1').update((method || 'GET') + ' ' + u + '\n' + h + (tag ? '\n#journalTag:' + tag : '')).digest('hex');
    }
    const hostDir = (u) => hostOf(u).replace(/[^a-z0-9.-]/g, '_');
    function journalPath(dir, method, u, headers, tag) { return path.join(dir, hostDir(u), journalKey(method, u, headers, tag) + '.json.gz'); }
    function readRecord(dirs, req) {
      const key = journalKey(req.method || 'GET', req.url, req.headers || {}, req.journalTag);
      for (const d of [].concat(dirs || [])) {
        const base = path.join(d, hostDir(req.url), key);
        try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(base + '.json.gz')).toString('utf8')); } catch (e) { /* next */ }
        try { return JSON.parse(fs.readFileSync(base + '.json', 'utf8')); } catch (e) { /* next */ }
      }
      return null;
    }
    function writeRecord(dir, rec) {
      const p = journalPath(dir, rec.method, rec.url, rec.reqHeaders, rec.journalTag);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      atomicWrite(p, zlib.gzipSync(Buffer.from(JSON.stringify(rec), 'utf8')));
      return p;
    }

    function decodeBody(buf, contentEncoding) {
      const enc = String(contentEncoding || '').toLowerCase().trim();
      const out = { text: null, decoded: false, undeclaredGzip: false, error: null };
      let b = buf;
      try {
        if (enc === 'gzip' || enc === 'x-gzip') { b = zlib.gunzipSync(buf); out.decoded = true; }
        else if (enc === 'deflate') { try { b = zlib.inflateSync(buf); } catch (e) { b = zlib.inflateRawSync(buf); } out.decoded = true; }
        else if (enc === 'br') { b = zlib.brotliDecompressSync(buf); out.decoded = true; }
        else if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) { b = zlib.gunzipSync(buf); out.decoded = true; out.undeclaredGzip = true; }
      } catch (e) { out.error = String(e.message || e); b = buf; }
      out.text = b.toString('utf8');
      return out;
    }

    // Sends exactly the given headers (no User-Agent, no Accept-Encoding added). Uses the global agent, so the campaign
    // preload's http.Agent hook (if loaded) throttles every hop.
    function nodeTransport(u, o) {
      o = o || {};
      return new Promise((resolve, reject) => {
        const mod = u.startsWith('https:') ? https : http;
        let done = false, hard = null;
        const finish = (fn, v) => { if (done) return; done = true; if (hard) clearTimeout(hard); fn(v); };
        const req = mod.request(u, { method: o.method || 'GET', headers: Object.assign({}, o.headers || {}) }, (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const d = decodeBody(Buffer.concat(chunks), res.headers['content-encoding']);
            finish(resolve, { status: res.statusCode, headers: res.headers, text: d.text, contentEncoding: res.headers['content-encoding'] || null, undeclaredGzip: d.undeclaredGzip, decodeError: d.error });
          });
          res.on('error', (e) => finish(reject, e));
        });
        const t = o.timeoutMs || BACKOFF.timeoutMs;
        req.setTimeout(t, () => req.destroy(new Error('timeout')));
        req.on('socket', () => { if (!hard) hard = setTimeout(() => req.destroy(new Error('timeout')), t); });
        req.on('error', (e) => finish(reject, e));
        req.end();
      });
    }

    // ---- own cross-process limiter (EA/lib/ratelimit.js semantics, Node core only) ----
    function fileLimiter(opts) {
      opts = opts || {};
      const dir = opts.rlDir || process.env.SMAR_AS_RL_DIR || path.join(os.tmpdir(), 'smar-appstore-agent', 'rl');
      const STATE = path.join(dir, 'state.json'), LOCK = path.join(dir, 'lock'), STALE = 15000;
      fs.mkdirSync(dir, { recursive: true });
      const now = opts.now || (() => Date.now());
      const sleep = opts.sleep || sleepMs;
      async function withLock(fn) {
        const t0 = Date.now();
        for (;;) {
          try { fs.mkdirSync(LOCK); break; } catch (e) {
            if (e.code !== 'EEXIST') throw e;
            try { if (Date.now() - fs.statSync(LOCK).mtimeMs > STALE) { fs.rmdirSync(LOCK); continue; } } catch (e2) { continue; }
            if (Date.now() - t0 > 60000) throw netError('NETWORK', 'limiter lock busy for 60 s: ' + LOCK);
            await sleepMs(10 + Math.random() * 30);
          }
        }
        try { return fn(); } finally { try { fs.rmdirSync(LOCK); } catch (e) { /* gone */ } }
      }
      function readState() { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { return { buckets: {} }; } }
      function writeState(s) { atomicWrite(STATE, JSON.stringify(s)); }
      const bk = (s, b) => s.buckets[b] || (s.buckets[b] = { last: 0, cooldownUntil: 0, fails: 0 });
      return {
        mode: 'own', dir,
        async acquire(u, o) {
          const bucket = bucketFor(u), interval = LIMITS.intervalMs[bucket], start = now();
          const deadline = o && o.deadlineMs;
          for (;;) {
            const slot = await withLock(() => {
              const s = readState(); const b = bk(s, bucket); const t0 = now();
              const t = Math.max(t0, b.last + interval, b.cooldownUntil || 0);
              if ((b.cooldownUntil || 0) - t0 > BACKOFF.stopAfterMs) return { stop: true, until: b.cooldownUntil };
              if (deadline && t > deadline) return { deadline: true, t };
              b.last = t; writeState(s); return { t };
            });
            if (slot.stop) throw netError('RATE_LIMITED', bucket + ' is cooling down until ' + new Date(slot.until).toISOString(), { bucket });
            if (slot.deadline) throw netError('DEADLINE', 'next ' + bucket + ' grant would pass the deadline', { bucket });
            await sleep(slot.t - now());
            const b = readState().buckets[bucket] || {};
            if ((b.cooldownUntil || 0) > now() + 50) continue; // another process set a cooldown after we reserved
            return { bucket, grantedAt: now(), waitedMs: now() - start };
          }
        },
        async report(u, status, o) {
          const bucket = bucketFor(u);
          if (!isRetryable(status)) { await withLock(() => { const s = readState(); const b = s.buckets[bucket]; if (b && b.fails) { b.fails = 0; writeState(s); } }); return 0; }
          let cd = 0;
          await withLock(() => {
            const s = readState(); const b = bk(s, bucket);
            b.fails = (b.fails || 0) + 1;
            cd = computeBackoff(b.fails, status, (o && o.retryAfterMs) || 0, opts.rand);
            b.cooldownUntil = Math.max(b.cooldownUntil || 0, now() + cd);
            writeState(s);
          });
          return cd;
        },
        state: readState,
      };
    }
    function preloadLimiter() { return { mode: 'preload', async acquire(u, o) { if (o && o.deadlineMs && Date.now() + LIMITS.intervalMs[bucketFor(u)] > o.deadlineMs) throw netError('DEADLINE', 'next grant would pass the deadline'); return { waitedMs: 0 }; }, async report() { return 0; } }; }
    function moduleLimiter(mod) {
      return {
        mode: 'module',
        async acquire(u, o) {
          if (o && o.deadlineMs && Date.now() + LIMITS.intervalMs[bucketFor(u)] > o.deadlineMs) throw netError('DEADLINE', 'next grant would pass the deadline');
          const g = await mod.acquire(u, { via: 'smar-appstore-agent' });
          if (mod.markPrepaid) mod.markPrepaid(u);
          return { waitedMs: (g && g.waitedMs) || 0 };
        },
        async report(u, status) { return mod.reportStatus(u, status, { via: 'smar-appstore-agent' }) || 0; },
      };
    }
    function pickLimiter(opts) {
      if (opts.limiter) return opts.limiter;
      if (globalThis.__APPLE_RL) return preloadLimiter();
      if (process.env.SMAR_APPLE_RL) return moduleLimiter(require(path.resolve(process.env.SMAR_APPLE_RL)));
      return fileLimiter(opts);
    }

    function makeIo(opts) {
      opts = opts || {};
      const out = opts.out ? path.resolve(opts.out) : null;
      const pagesDir = out ? out + '.pages' : null;
      const replayDirs = opts.replay ? [].concat(opts.replay).map((d) => path.resolve(d)) : null;
      const limiter = replayDirs ? { mode: 'replay', async acquire() { throw netError('REPLAY_MISS', 'replay mode never touches the network'); }, async report() { return 0; } } : pickLimiter(opts);
      const label = opts.label || process.env.APPLE_RL_LABEL || undefined;
      const stats = { itunes_api: 0, apple_other: 0, journalHits: 0, retries: 0, waitedMs: 0, rateLimited: 0, hops: 0, gzipPages: [], garbledPages: [], batchSplits: 0 };
      const journal = {
        findReplay: replayDirs ? (req) => readRecord(replayDirs, req) : () => undefined,
        find: opts.resume && pagesDir ? (req) => readRecord([pagesDir], req) : null,
        write(rec) {
          if (replayDirs) return;
          if (pagesDir) writeRecord(pagesDir, rec);
          if (opts.record) writeRecord(path.resolve(opts.record), rec);
        },
      };
      const get = createGetter({
        transport: opts.transport || nodeTransport, limiter, journal, stats, label, now: opts.now,
        deadlineMs: opts.deadlineMs, maxRetries: opts.maxRetries,
        allowHost: opts.allowHosts ? (h) => isAppleHost(h) || opts.allowHosts.indexOf(h) >= 0 : isAppleHost,
      });
      return {
        get, limiterMode: limiter.mode, pagesDir,
        now: opts.now || (() => Date.now()),
        sleep: opts.sleep || sleepMs,
        save(st) { if (!out) return null; const p = out + '.progress.json'; atomicWrite(p, JSON.stringify(st)); return p; },
        journal(rec) {
          if (!pagesDir || replayDirs) return;
          fs.mkdirSync(pagesDir, { recursive: true });
          fs.appendFileSync(path.join(pagesDir, '_notes.jsonl'), JSON.stringify(Object.assign({ ts: new Date().toISOString() }, rec)) + '\n');
        },
        stats: () => Object.assign({}, stats, { gzipPages: stats.gzipPages.slice(), garbledPages: stats.garbledPages.slice(), waitedSeconds: Math.round(stats.waitedMs / 100) / 10 }),
        _addSplits(n) { stats.batchSplits += n; },
      };
    }
    nodeApi = { journalKey, journalPath, readRecord, writeRecord, decodeBody, nodeTransport, fileLimiter, makeIo };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Browser: fetch (credentials omitted), in-page pacing with the same intervals and backoff. Forbidden headers
  // (Accept-Encoding, User-Agent) cannot be set by a page; the browser decodes bodies itself, so gzipBody is never
  // observable here (one reason compat reproduces no transport loss, PLAN A2).
  function memoryLimiter(opts) {
    const now = opts.now || (() => Date.now()), sleep = opts.sleep || sleepMs;
    const s = { itunes_api: { last: 0, cooldownUntil: 0, fails: 0 }, apple_other: { last: 0, cooldownUntil: 0, fails: 0 } };
    return {
      mode: 'memory',
      async acquire(u, o) {
        const bucket = bucketFor(u), b = s[bucket], start = now();
        const t = Math.max(now(), b.last + LIMITS.intervalMs[bucket], b.cooldownUntil);
        if (b.cooldownUntil - now() > BACKOFF.stopAfterMs) throw netError('RATE_LIMITED', bucket + ' cooling down', { bucket });
        if (o && o.deadlineMs && t > o.deadlineMs) throw netError('DEADLINE', 'next grant would pass the deadline');
        b.last = t; await sleep(t - now());
        return { waitedMs: now() - start };
      },
      async report(u, status, o) {
        const b = s[bucketFor(u)];
        if (!isRetryable(status)) { b.fails = 0; return 0; }
        b.fails++; const cd = computeBackoff(b.fails, status, (o && o.retryAfterMs) || 0);
        b.cooldownUntil = Math.max(b.cooldownUntil, now() + cd); return cd;
      },
    };
  }
  function makeBrowserIo(opts) {
    opts = opts || {};
    const f = opts.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    if (!f) throw netError('NETWORK', 'no fetch available');
    const transport = async (u, o) => {
      const r = await f(u, { method: o.method || 'GET', headers: o.headers || {}, credentials: 'omit', redirect: 'manual' === opts.redirect ? 'manual' : 'follow', cache: 'no-store' });
      const headers = {}; if (r.headers && r.headers.forEach) r.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
      return { status: r.status, headers, text: await r.text(), contentEncoding: null, undeclaredGzip: false, decodeError: null };
    };
    const store = opts.store || null; // {get(key)->rec|null, put(key, rec)} e.g. IndexedDB-backed, owned by browser_driver
    const keyOf = (req) => (req.method || 'GET') + ' ' + req.url + '\n' + Object.keys(req.headers || {}).map((k) => k.toLowerCase() + ':' + req.headers[k]).sort().join('\n') + (req.journalTag ? '\n#journalTag:' + req.journalTag : '');
    const stats = { itunes_api: 0, apple_other: 0, journalHits: 0, retries: 0, waitedMs: 0, rateLimited: 0, hops: 0, gzipPages: [], garbledPages: [], batchSplits: 0 };
    const get = createGetter({
      transport, limiter: opts.limiter || memoryLimiter(opts), stats, deadlineMs: opts.deadlineMs, now: opts.now,
      journal: store ? { findReplay: () => undefined, find: (req) => store.get(keyOf(req)), write: (rec) => store.put(keyOf({ method: rec.method, url: rec.url, headers: rec.reqHeaders, journalTag: rec.journalTag }), rec) } : null,
    });
    return {
      get, limiterMode: 'memory', pagesDir: null, now: () => Date.now(), sleep: sleepMs,
      save(st) { if (opts.save) return opts.save(st); return null; },
      journal(rec) { if (opts.onJournal) opts.onJournal(rec); },
      stats: () => Object.assign({}, stats, { waitedSeconds: Math.round(stats.waitedMs / 100) / 10 }),
      _addSplits(n) { stats.batchSplits += n; },
    };
  }

  return Object.assign({
    VERSION, LIMITS, BACKOFF, netError, hostOf, isAppleHost, bucketFor, isRetryable, computeBackoff, parseRetryAfter,
    detectGarbled, createGetter, getChunks, makeBrowserIo, memoryLimiter,
  }, nodeApi);
});
