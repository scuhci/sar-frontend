// Browser-mode driver (Claude in Chrome). Inject extract_play.js first, then this file, into a tab that is
// already on https://play.google.com (same-origin fetch — no page navigation, no DOM text in the context).
// Every call returns only a SHORT status object. Rows live in localStorage and survive reconnects.
//   await SMAR_RUN.start({mode:'search', term:'fitness tracking'})   // SMAR's similar expansion; similar:false opts out
//   await SMAR_RUN.step(15)        // process up to 15 apps; repeat until {remaining:0}
//   {busy} / {superseded} from step() is NOT completion: wait retryAfterMs, call step() again
//   SMAR_RUN.report()              // validation/drift summary
//   SMAR_RUN.download('smar_play_fitness_tracking_us.csv')   // ask the user first
// Charts: inject chart_fetch.js between the two. The engine is extract_play.js; this file stores the run and locks step().
(function smarDriver() {
  const K = '__smar_state', S = window.SMAR, LOCK = '__smar_step', HOME = 'https://play.google.com';
  if (!S || !/^3\./.test(String(S.VERSION))) throw new Error('SMAR: inject extract_play.js (v3) first, then browser_driver.js');
  const err = (code, m) => Object.assign(new Error('SMAR: ' + m), { code });
  // Stored as {"runId":..,"rev":..,"st":{..}}: the compare-and-swap reads two fields without parsing the rows.
  const head = () => /^\{"runId":"(\w*)","rev":(\d+),/.exec(localStorage.getItem(K) || '') || [];
  const load = () => JSON.parse(localStorage.getItem(K) || 'null');
  const cur = () => { const w = load(); return w && (w.st || { v: 2 }); }; // no .st: v2
  const put = (st) => {
    try { localStorage.setItem(K, `{"runId":"${st.runId}","rev":${st.rev},"st":${JSON.stringify(st)}}`); } catch (e) {
      throw /quota/i.test(e.name + e.message) || e.code === 22 ? err('STORAGE_FULL', 'storage full: ' + e.message) : e;
    }
  };
  // A step() orphaned by a tool timeout keeps running; once another call has written, its runId/rev no longer match
  // and it stops WITHOUT writing its stale copy (synchronous check+write: atomic in the tab).
  const save = (st) => { const h = head(); if (h[1] !== st.runId || +h[2] !== st.rev) throw new S.Superseded(); st.rev++; try { put(st); } catch (e) { st.rev--; throw e; } };
  const guard = () => { if (location.origin !== HOME) throw err('WRONG_ORIGIN', `this tab is on ${location.href}, not ${HOME}. Open ${HOME} in this tab, inject the scripts again, then call start().`); };
  const need = () => { const st = cur(); if (!st) throw err('NO_RUN', 'no run in this tab (start() not called, or storage cleared). Call start() with the same options.'); return st; };
  const V2 = () => ({ fatal: 'v2 progress file; start a fresh output', NEXT: 'await SMAR_RUN.start({...same options, force:true})' });
  const chart = () => window.SMAR_CHART || (() => { throw err('USAGE', 'charts need chart_fetch.js: inject extract_play.js, chart_fetch.js, browser_driver.js'); })();
  const ring = new Map(); // last 10 pages, for heal()
  const keep = (id, html) => { ring.delete(id); ring.set(id, html); if (ring.size > 10) ring.delete(ring.keys().next().value); };
  let IO = null;
  const io = () => IO || (IO = (() => {
    const init = { credentials: 'omit', cache: 'no-store', redirect: 'manual' }, f = (u, i) => fetch(u, i);
    const get = S.makeGet(f, { base: '', init }), post = S.makePost(f, { base: '', init }); // shared POLICY; opaqueredirect = INTERSTITIAL
    return { get, post, chart: (o) => chart().fetchChart(Object.assign({}, o, { post })), now: () => Date.now(), sleep: (ms) => new Promise((z) => setTimeout(z, ms)), save, keepHtml: keep };
  })());
  const BUSY = () => ({ busy: true, retryAfterMs: 5000, note: 'an earlier call is still running; wait 5 s and call again. NOT completion.' });
  const withLock = (fn) => { const L = navigator.locks; return L ? L.request(LOCK, { ifAvailable: true }, (l) => (l ? fn() : BUSY())) : fn(); };
  const runOf = (o) => Object.assign({ mode: o.mode }, o.mode === 'search' ? { term: o.term, similar: o.similar } : o.mode === 'chart' ? { category: o.category, collection: o.collection } : { ids: o.ids.length }, { country: o.country, compat: o.compat });
  const sum = (st, x) => S.summarize(st, Object.assign({ runner: 'browser' }, x));
  const fail = (e, st) => {
    if (e && e.code === 'SUPERSEDED') return { superseded: true, note: 'another call took over this run; this one stopped without writing. Call step() again.' };
    if (e && e.code === 'STORAGE_FULL') return { fatal: 'storage full', code: e.code, hint: 'tell the user; run this request in shell mode (run_play.js)' };
    const s = st && st.v === 3 ? sum(st, { error: { code: e && e.code, message: String(e && e.message) } }) : null;
    return { fatal: String(e && e.message || e).slice(0, 300), code: (e && e.code) || 'ERROR', run: s ? runOf(st.opts) : undefined, NEXT: s ? s.NEXT : 'STOP: tell the user what failed.' };
  };
  const brief = (st) => { const s = sum(st); return Object.assign({ run: runOf(st.opts), rows: s.rows }, s.incomplete ? { remaining: Math.max(1, s.remaining), NEXT: s.NEXT } : { remaining: 0, READY_TO_DELIVER: s.READY_TO_DELIVER, NEXT: s.NEXT }); };
  // Request signature: all options but compat (write-time only, unless SMAR's site mangles the term).
  const sig = (o) => JSON.stringify(Object.assign({}, o, { compat: o.mode === 'search' && S.smarSiteTerm(o.term) !== o.term ? o.compat : null }));
  const requeue = (which) => { if (need().v !== 3) return V2(); return withLock(async () => { const st = need(); try { const n = S.requeue(st, which); save(st); return { run: runOf(st.opts), requeued: n, NEXT: n ? 'await SMAR_RUN.step(15)' : sum(st).NEXT }; } catch (e) { return fail(e, st); } }); };
  const file = (name, text, type) => { // exactly S.outputs()'s string, BOM included
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  };
  window.SMAR_RUN = {
    async start(o) {
      guard(); o = Object.assign({}, o);
      if (o.mode === 'reviews') { // own injection set and API
        if (!window.SMAR_REVIEWS) throw err('USAGE', 'reviews: inject extract_play.js then reviews_play.js, and use SMAR_REVIEWS.start({appId}), step(), status(), download()');
        delete o.mode; return window.SMAR_REVIEWS.start(o);
      }
      if (o.primaryOnly) o.similar = false;
      if ('smarCompat' in o) o.compat = !!o.smarCompat;
      if (o.mode === 'chart') { const c = chart().normalize({ collection: o.collection, category: o.category, num: o.num, country: o.country }); o.collection = c.collection; o.category = c.category; if (o.num != null) o.num = c.num; }
      const st = S.newState(o), old = cur(); // throws USAGE; nothing has changed yet
      if (old && !o.force) {
        const v3 = old.v === 3, pending = !v3 || !S.isDone(old), undl = v3 && old.rows.length > 0 && !old.downloaded;
        if (v3 && (pending || undl) && sig(old.opts) === sig(st.opts)) { // same request again (e.g. after a reconnect): resume, never wipe
          if (old.opts.compat !== st.opts.compat) { old.opts.compat = st.opts.compat; save(old); }
          S.usePaths(old.opts.paths); S.useLabels(old.opts.labels);
          return Object.assign({ resumed: true }, brief(old));
        }
        if (!v3) throw err('CONFLICT', 'a v2 progress state is stored; v3 cannot resume it. Call start({...sameOptions, force:true}) to discard it.');
        if (pending || undl) throw err('CONFLICT', `${pending ? 'an unfinished' : 'a finished, NOT downloaded'} run ${JSON.stringify(runOf(old.opts))} (${old.rows.length} rows) is stored. Finish and download it, or call start({...sameOptions, force:true}) to discard it.`);
      }
      const gone = old && old.v === 3 && (!S.isDone(old) || (old.rows.length && !old.downloaded)) ? runOf(old.opts) : undefined;
      put(st); ring.clear(); // ONE synchronous write before any await: no half-started run; the new runId stops orphan steps
      S.usePaths(st.opts.paths); S.useLabels(st.opts.labels); // rebuilt from the frozen defaults: no override leaks between runs
      return Object.assign({ started: true }, brief(st), gone ? { discarded: gone } : {}); // step() does all requests
    },
    async step(n = 15) {
      guard();
      if (need().v !== 3) return V2();
      return withLock(async () => {
        const st = need();
        try { await S.advance(st, io(), { budget: Math.max(1, +n || 15), deadlineMs: 20000 }); save(st); } catch (e) { return fail(e, st); }
        return brief(st);
      });
    },
    report() {
      const st = need();
      if (st.v !== 3) return V2();
      return Object.assign(sum(st), st.downloaded ? { downloaded: st.downloaded.name, dateScraped: S.smarDate(st.downloaded.at) } : {});
    },
    // Bytes from S.outputs() (as the shell's files).
    download(name, opt) {
      const st = need(), da = !!(opt && opt.deliverAnyway), run = st.v === 3 && runOf(st.opts);
      if (st.v !== 3) return V2();
      if (!S.isDone(st)) return { refused: 'run not finished: call step() until remaining is 0', run };
      const now = Date.now(), out = S.outputs(st, { compat: st.opts.compat, deliverAnyway: da, now, runner: 'browser' }), s = JSON.parse(out.summaryJson);
      if (out.csv == null) return { refused: st.rows.length ? 'no file: smar-tool.org returns none for this request' : 'no rows: ' + (st.emptyReason || 'nothing was collected'), run, compatExact: out.compatExact, NEXT: s.NEXT };
      if (out.csvName !== 'final') return { refused: 'READY_TO_DELIVER is false: tell the user report().problems; only with their OK: download(name, {deliverAnyway:true})', run, NEXT: s.NEXT };
      file(name, out.csv, 'text/csv');
      st.downloaded = { name, at: now, deliverAnyway: da, rows: out.rows }; try { save(st); } catch (e) { /* the file is already saved */ }
      return { downloaded: name, rows: out.rows, run, compatExact: out.compatExact, deliveredAnyway: da ? s.deliverAnywayBlanked || true : undefined };
    },
    downloadRelog(name) {
      const st = need(), d = st.downloaded;
      if (!d) return { refused: 'download the CSV first' };
      const out = S.outputs(st, { compat: st.opts.compat, deliverAnyway: d.deliverAnyway, now: d.at, runner: 'browser' });
      file(name, out.relog, 'text/plain'); return { downloaded: name };
    },
    // USE or STOP from the heal core on kept pages + the field's sample apps
    async heal(field) {
      guard(); const st = need(); if (st.v !== 3) return V2();
      const o = { paths: st.opts.paths, labels: st.opts.labels, runner: 'browser' }, k = S.fieldKey(field);
      if (!k) return S.healField([], field, o);
      const vf = (sum(st).validationFailures[k] || {}).sample || [], want = vf.filter((id) => !ring.has(id));
      for (const r of st.rows) if (ring.size + want.length >= 6) break; else if (!ring.has(r.appId) && !want.includes(r.appId)) want.push(r.appId);
      const pages = Array.from(ring, ([id, html]) => ({ id, html }));
      try { for (const id of want) { const r = await io().get(S.urls(st.opts.country).details(id)); if (r.status === 200 && r.text) pages.push({ id, html: r.text }); } } catch (e) { return fail(e, st); }
      return S.healField(pages, field, o);
    },
    async refetch(ids) {
      guard(); if (need().v !== 3) return V2();
      return withLock(async () => {
        const st = need();
        try {
          const res = await S.refetch(st, io(), [].concat(ids)), s = sum(st);
          if (st.downloaded && res.some((r) => r.result === 'replaced')) { delete st.downloaded; save(st); } // rows changed: download again
          return { run: runOf(st.opts), results: res, READY_TO_DELIVER: s.READY_TO_DELIVER, NEXT: s.NEXT };
        } catch (e) { return fail(e, st); }
      });
    },
    async retryFailed() { return requeue('fetchFailed'); },
    async retryWithheld() { return requeue('wrongStorefront'); },
    async lookup(name, o) { guard(); const st = cur(); return S.lookup(io(), name, { country: (o && o.country) || (st && st.opts && st.opts.country) || 'US' }).catch(fail); },
    verify(hash) { return S.verify(hash); },
    source() { return smarDriver.toString(); },
  };
  return 'SMAR_RUN ready';
})();
