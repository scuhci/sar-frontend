// browser_driver.js: smar-appstore-agent browser mode (Claude in Chrome), PLAN §6.6. Shell mode is preferred.
// Tab https://itunes.apple.com/us/rss/topfreeapplications/limit=1/json; inject verbatim, one javascript_tool call each:
// as_writer as_search as_chart as_reviews as_checks net_apple appstore_core browser_driver; then SMAR_AS_RUN.verify(hash)
// (all else fails closed until ok). start({mode:'chart'|'reviews'|'ids', ...CLI options, force}); step(20) until
// remaining:0 ({busy}/{superseded} are not completion); report(); download(name?, {deliverAnyway, relog}); refetch(ids);
// retryFailed(); lookup(name, {country}). Gate B (eval/appstore/build_notes/browser_gateB*): no keyword search, no
// web-page sample; charts read the storefront's itunes.apple.com feed (ax.itunes is http), flagged in compatExact.
(function smarAsDriver() {
  'use strict';
  const W = window, A = W.SMAR_AS, N = W.SMAR_AS_NET, O = 'https://itunes.apple.com', K = 'smar_as_run', STEP = 'await SMAR_AS_RUN.step()';
  const MODS = ['SMAR_AS_WRITER', 'SMAR_AS_SEARCH', 'SMAR_AS_CHART', 'SMAR_AS_REVIEWS', 'SMAR_AS_CHECKS', 'SMAR_AS_NET', 'SMAR_AS', 'SMAR_AS_RUN'];
  if (!A || A.VERSION !== '2.1.0' || MODS.slice(0, 7).some((m) => !W[m])) throw new Error('SMAR_AS: inject the 7 module files first');
  const err = (code, m) => Object.assign(new Error('SMAR_AS: ' + m), { code });
  let ok = false, busy = false, dbp, B;
  const vfy = () => {
    if (location.origin !== O) throw err('WRONG_ORIGIN', `tab is on ${location.href}; open ${O}/us/rss/topfreeapplications/limit=1/json, inject, verify()`);
    if (!ok) throw err('UNVERIFIED', 'call SMAR_AS_RUN.verify(<hash from SKILL.md>) first; ok:false = inject the 8 files again, verbatim');
  };
  // storage: one record {runId, rev, sig, run, done, rows, downloaded, st:json}. put() compares runId+rev and writes in
  // ONE transaction, so a step() orphaned by a tool timeout stops without writing once another call has saved.
  const stale = (o, c) => c && (!o || o.runId !== c[0] || o.rev !== c[1]);
  const db = () => dbp || (dbp = new Promise((y, n) => { const r = indexedDB.open(K, 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => y(r.result); r.onerror = () => n(r.error); }));
  const tx = async (mode, fn) => { const d = await db(); return new Promise((y, n) => { const t = d.transaction('kv', mode), s = t.objectStore('kv'), q = s.get(K); let r;
    q.onsuccess = () => { r = fn(s, q.result); }; t.oncomplete = () => y(r); t.onerror = t.onabort = () => n(t.error); }); };
  const IDB = { load: () => tx('readonly', (s, v) => v || null), put: (w, c) => tx('readwrite', (s, v) => (stale(v, c) ? 0 : (s.put(w, K), 1))) };
  const LS = { load: async () => JSON.parse(localStorage.getItem(K) || 'null'),
    put: async (w, c) => (stale(JSON.parse(localStorage.getItem(K) || 'null'), c) ? 0 : (localStorage.setItem(K, JSON.stringify(w)), 1)) };
  const be = async () => B || (B = W.indexedDB ? await IDB.load().then(() => IDB, () => LS) : LS);
  const load = async () => (await be()).load();
  async function put(st, c) {
    const w = { runId: st.runId, rev: st.rev, sig: sigOf(st.opts), run: runOf(st.opts), done: A.isDone(st), downloaded: st.downloaded || null, st: JSON.stringify(st),
      rows: (st.rows || []).length + Object.values(st.reviews || {}).reduce((n, r) => n + ((r && r.rows) || []).length, 0) };
    let r; try { r = await (await be()).put(w, c); } catch (e) { throw /quota/i.test(e && e.name + e.message) ? err('STORAGE_FULL', 'browser storage is full; use shell mode') : e; }
    if (!r) throw err('SUPERSEDED', 'superseded');
  }
  async function save(st, req) { if (req) st.requests = req(); st.rev++; try { await put(st, [st.runId, st.rev - 1]); } catch (e) { st.rev--; throw e; } }
  const need = async () => { const w = await load(); if (!w) throw err('NO_RUN', 'no run stored here; call start() with the same options'); return JSON.parse(w.st); };
  const sigOf = (o) => JSON.stringify([o.mode, o.country, o.collection, o.genre, o.num, o.apps, o.all, o.bulk, o.ids, o.layout, o.mode === 'chart' && o.compat]);
  const runOf = (o) => Object.assign({ mode: o.mode, country: o.country, compat: o.compat }, o.mode === 'chart' ? { collection: o.collection, genre: o.genre } : { n: (o.apps || o.ids).length });
  // transport: same-origin only. SMAR's http ax.itunes chart feed (mixed content) -> that storefront's itunes.apple.com feed.
  const AX = /^http:\/\/ax\.itunes\.apple\.com\/WebObjects\/MZStoreServices\.woa\/ws\/RSS\/(\w+)\/+(?:genre=(\d+)\/+)?limit=(\d+)\/json\?s=(\d+)$/;
  function swap(st, u) {
    const m = AX.exec(u), M = A.MARKETS, c = m && (M[st.opts.country] === +m[4] ? st.opts.country : Object.keys(M).find((k) => M[k] === +m[4]));
    return c ? `${O}/${c.toLowerCase()}/rss/${m[1]}/limit=${m[3]}${m[2] ? '/genre=' + m[2] : ''}/json` : null;
  }
  async function tfetch(F, u, init) { // F[url] = failed attempts, kept in the run (st.bf)
    const h = {}, ac = new AbortController(), t = setTimeout(() => ac.abort(), 30000);
    for (const k in init.headers || {}) if (!/^(user-agent|accept-encoding|host|origin|referer|cookie)$/i.test(k)) h[k] = init.headers[k]; // a page cannot set these
    try {
      const r = await fetch(u, Object.assign({}, init, { headers: h, credentials: 'omit', signal: ac.signal }));
      if (N.isRetryable(r.status)) F[u] = (F[u] || 0) + 1; else delete F[u];
      return { status: r.status, headers: r.headers, text: () => r.text().finally(() => clearTimeout(t)) };
    } catch (e) { clearTimeout(t); F[u] = (F[u] || 0) + 1; throw e; }
  }
  const L0 = N.memoryLimiter({}), pages = new Map(); let cool = 0; // pacing, Apple cooldown and responses of this page load
  const L = { mode: 'memory', acquire: L0.acquire, report: async (u, x, o) => { const cd = await L0.report(u, x, o); if (cd) cool = Math.max(cool, Date.now() + cd); return cd; } };
  const add = (a, b) => { const o = {}; for (const k of ['itunes_api', 'apple_other', 'journalHits', 'retries', 'waitedSeconds', 'rateLimited']) o[k] = ((a && a[k]) || 0) + ((b && b[k]) || 0); return o; };
  function mkIo(st, dl) {
    const F = st.bf || (st.bf = {}), base = st.requests; // a retry series cut by a deadline or reload resumes: 1 + maxRetries tries in all
    const io = N.makeBrowserIo({ fetch: (u, i) => tfetch(F, u, i), limiter: L, deadlineMs: dl, store: { get: (k) => pages.get(k) || null, put: (k, r) => pages.set(k, r) } });
    // saves run one after another: reviews advance several apps at once, and two overlapping put()s would see each
    // other's rev as a newer writer (SUPERSEDED)
    let chain = Promise.resolve();
    const queued = (s) => { const p = chain.then(() => save(s, () => add(base, io.stats()))); chain = p.catch(() => {}); return p; };
    return Object.assign({}, io, { save: queued, get(q) {
      q = Object.assign({}, q); const u = swap(st, q.url);
      if (u) st.browserFeed = q.url = u;
      q.maxRetries = Math.max(0, (q.maxRetries != null ? q.maxRetries : N.BACKOFF.maxRetries) - (F[q.url] || 0));
      return q.url.indexOf(O + '/') ? Promise.reject(err('BROWSER_BLOCKED', q.url.slice(0, 80) + ' cannot be fetched from this tab; use shell mode')) : io.get(q);
    } });
  }
  // summaries: the engine's, with browser commands in NEXT
  const ctx = (st, x) => Object.assign({ runner: 'browser', cmd: STEP, refetchCmd: (ids) => (st.opts.mode === 'reviews' ? 'await SMAR_AS_RUN.retryFailed()' : `await SMAR_AS_RUN.refetch(${JSON.stringify(ids.slice(0, 50))})`) }, x);
  function fix(s, st) {
    const c = s.compatExact;
    if (s.NEXT) s.NEXT = s.NEXT.replace(/^RESUME: [\s\S]*/, 'RESUME: ' + STEP);
    if (st.browserFeed && c && !c.reasons.some((r) => /^browser/.test(r.detail))) {
      c.ok = false; c.reasons.push({ code: 'transport_dependent', detail: `browser: chart feed read from ${st.browserFeed}, not SMAR's http://ax.itunes.apple.com (same ids and order in 9 of 9 paired reads)` });
    }
    if (st.opts.mode !== 'reviews') s.browser = { webPageSample: 'off (apps.apple.com refuses this tab)' };
    if (st.repaired) s.notes = (s.notes || []).concat(st.repaired);
    return s;
  }
  const summ = (st, x) => fix(A.summarize(st, ctx(st, x)), st);
  const brief = (st) => { const s = summ(st); return Object.assign({ run: runOf(st.opts), rows: s.rows }, s.incomplete ? { remaining: s.remaining || 1, NEXT: s.NEXT } : { remaining: 0, READY_TO_DELIVER: s.READY_TO_DELIVER, NEXT: s.NEXT }); };
  function fail(e, st) {
    const c = (e && e.code) || 'ERROR', m = String((e && e.message) || e).slice(0, 300);
    if (c === 'SUPERSEDED') return { superseded: true, note: 'another call took over this run and this one stopped without writing; call step() again' };
    if (c === 'STORAGE_FULL' || c === 'BROWSER_BLOCKED' || !st) return { fatal: m, code: c, NEXT: 'STOP: tell the user: ' + m };
    const spent = c === 'NETWORK' && Object.values(st.bf || {}).some((x) => x > N.BACKOFF.maxRetries); // the shell's retry budget is used up
    const stop = c === 'RATE_LIMITED' ? `Apple is limiting requests from this network. Wait 15 minutes, then call ${STEP} again.` : c !== 'NETWORK' ? `the run failed (${c}); give the user this message`
      : spent ? `requests from this tab keep failing (network error, ${N.BACKOFF.maxRetries + 1} tries); tell the user to check the connection, then call ${STEP} again` : undefined;
    return { fatal: m, code: c, run: runOf(st.opts), NEXT: summ(st, { error: { code: c, message: m }, stopSentence: stop, incomplete: !stop }).NEXT };
  }
  const lock = (fn) => {
    const BUSY = { busy: true, retryAfterMs: 5000, note: 'an earlier call is still running; wait 5 s and call again. NOT completion.' }, Lk = W.navigator && navigator.locks;
    if (Lk) return Lk.request(K, { ifAvailable: true }, (l) => (l ? fn() : BUSY));
    if (busy) return Promise.resolve(BUSY);
    busy = true; return Promise.resolve().then(fn).finally(() => { busy = false; });
  };
  // a stored run whose rows disagree with its own bookkeeping (rolled back or edited) is repaired before any call uses
  // it, as the shell's --resume does (stress FI-12); the note stays in the run for report()
  async function checked(st) {
    const ig = A.integrity && A.integrity(st);
    if (!ig) return st;
    const n = A.repair(st, ig);
    if (n !== st) Object.assign(n, { rev: st.rev, bf: st.bf, browserFeed: st.browserFeed });
    delete n.downloaded;
    n.repaired = `the saved progress did not match its own bookkeeping (${ig.why}); ${ig.fix === 'rebuild' ? 'the rows were rebuilt from the saved lookups and checked again' : ig.fix === 'restart_apps' ? 'those apps were read again' : 'the run was started over from the saved responses'}`;
    await save(n);
    return n;
  }
  const withRun = (fn) => lock(async () => { let st = await need(); try { st = await checked(st); return await fn(st); } catch (e) { // keep st.bf: never a fresh retry series
    if (e && e.code !== 'SUPERSEDED') try { await save(st); } catch (x) { /* a newer save wins */ }
    return fail(e, st);
  } });
  const file = (name, text, type) => { // exactly A.outputs()'s string, BOM included
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  };
  async function fingerprint() { // a module's source() when it has one, else its exported surface
    const p = MODS.map((n) => { const m = W[n]; return n + ':' + (!m ? '-' : typeof m.source === 'function' ? m.source()
      : Object.keys(m).sort().map((k) => k + '=' + (typeof m[k] === 'function' ? String(m[k]) : JSON.stringify(m[k]))).join('\n')); });
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p.join('\n')));
    return Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');
  }
  const STOPS = { search: 'Keyword search needs shell mode (Claude Code); charts, reviews and app-id lists work in the browser.', rerun: "rerun and per-app files need shell mode (Claude Code); use {mode:'ids', ids:[...]} or the bulk file." };

  W.SMAR_AS_RUN = {
    async start(o) {
      vfy(); o = Object.assign({}, o);
      if ('smarCompat' in o) o.compat = !!o.smarCompat;
      for (const k of ['apps', 'ids']) if (typeof o[k] === 'string') o[k] = o[k].split(',').map((x) => x.trim()).filter(Boolean);
      const no = o.mode === 'search' ? 'search' : o.mode === 'rerun' || o.perApp ? 'rerun' : '';
      if (no) return { refused: o.mode, NEXT: 'STOP: ' + STOPS[no] };
      let st;
      try { st = A.newState(Object.assign({}, o, { sample: 0 })); } catch (e) { return { fatal: e.message, code: e.code || 'USAGE', NEXT: 'STOP: fix the options once from this message; if it fails again, tell the user.' }; }
      st.rev = 0;
      const old = await load(), live = old && (!old.done || (old.rows > 0 && !old.downloaded));
      if (live && !o.force) {
        if (old.sig !== sigOf(st.opts)) return { fatal: `an ${old.done ? 'undownloaded' : 'unfinished'} run ${JSON.stringify(old.run)} is stored`, code: 'CONFLICT', NEXT: "STOP: finish and download it, or with the user's OK start({...options, force:true})." };
        return withRun(async (s) => { if (!!s.opts.compat !== st.opts.compat) { s.opts.compat = st.opts.compat; await save(s); } return Object.assign({ resumed: true }, brief(s)); });
      }
      await put(st, null); pages.clear(); // one write before any request: the new runId stops orphan steps
      return Object.assign({ started: true }, brief(st), live ? { discarded: old.run } : {});
    },
    step(n) {
      vfy();
      return withRun(async (st) => {
        if (A.isDone(st)) return brief(st);
        const dl = Date.now() + 1000 * Math.min(25, Math.max(3, +n || 20)), io = mkIo(st, dl);
        await A.seed(st, io); const r = await A.advance(st, io, { deadlineMs: dl }); await io.save(st);
        const wait = Math.min(300000, Math.max(5000, cool - Date.now()));
        return Object.assign(brief(st), r.done || io.stats().hops ? {} : { retryAfterMs: wait, note: `an Apple cooldown is pending: wait ${Math.ceil(wait / 1000)} s, then step() again` });
      });
    },
    async report() {
      vfy(); const st0 = await need();
      const rep = (st) => { const d = st.downloaded; return A.capSummary(Object.assign(summ(st), d ? { downloaded: d.name, dateScraped: A.smarDate(d.at) } : {}), 4096); };
      return A.integrity && A.integrity(st0) ? withRun(async (st) => rep(st)) : rep(st0); // a run that needs repair is repaired first
    },
    download(name, opt) { // opt.relog: the relog of the CSV downloaded last
      vfy(); opt = opt || {};
      return withRun(async (st) => {
        const d = st.downloaded, da = !!opt.deliverAnyway, now = Date.now();
        if (opt.relog) return d ? (file(name = name || d.name.replace(/\.csv$/i, '') + '_relog.txt', A.outputs(st, ctx(st, { deliverAnyway: d.deliverAnyway, now: d.at })).relog, 'text/plain'), { downloaded: name }) : { refused: 'download the CSV first' };
        if (!A.isDone(st)) return { refused: 'run not finished: step() until remaining is 0' };
        const out = A.outputs(st, ctx(st, { deliverAnyway: da, now })), s = fix(out.summary, st);
        if (out.csv == null) return { refused: 'no file: ' + (st.opts.compat && s.compatExact.reasons.some((r) => r.code === 'smar_http500') ? 'smar-tool.org returns none for this request' : 'no rows'), NEXT: s.NEXT };
        if (out.csvName !== 'final') return { refused: 'READY_TO_DELIVER is false: tell the user report().problems; only with their OK: download(name, {deliverAnyway:true})', NEXT: s.NEXT };
        file(name = name || s.smarFileName || 'smar_appstore.csv', out.csv, 'text/csv');
        st.downloaded = { name, at: now, deliverAnyway: da, rows: out.rows }; await save(st);
        return { downloaded: name, rows: out.rows, compatExact: s.compatExact, deliveredAnyway: da || undefined };
      });
    },
    refetch(ids) {
      vfy();
      return withRun(async (st) => {
        const io = mkIo(st, Infinity), res = await A.refetch(st, io, [].concat(ids)); delete st.downloaded; await io.save(st);
        const s = summ(st); return { results: res.slice(0, 25), READY_TO_DELIVER: s.READY_TO_DELIVER, NEXT: s.NEXT };
      });
    },
    retryFailed() { vfy(); return withRun(async (st) => { const n = A.requeue(st); if (n) { delete st.downloaded; await save(st); } return { requeued: n, NEXT: n ? STEP : summ(st).NEXT }; }); },
    async lookup(name, o) {
      vfy(); const cc = String((o && o.country) || 'US').toUpperCase();
      try {
        const r = await A.lookup(mkIo({ opts: { country: cc } }, Infinity), name, { country: cc });
        return Object.assign(r, { NEXT: r.decision === 'USE' ? 'USE: ' + r.match.bundleId : r.candidates.length ? 'ASK: show the user the candidates; never pick one yourself' : `STOP: no app matches "${name}" in ${cc}; ask the user for the exact name or link.` });
      } catch (e) { return fail(e); }
    },
    async verify(hash) { const fp = await fingerprint(); ok = fp === hash; return { ok, fingerprint: fp, loaded: MODS.filter((n) => W[n]) }; },
    fingerprint, source: () => smarAsDriver.toString(),
  };
  return 'SMAR_AS_RUN ready';
})();
