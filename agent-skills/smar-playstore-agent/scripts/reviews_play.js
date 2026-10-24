// SMAR Google Play reviews (v3): the UsvDTd batchexecute stream SMAR's reviewsController reads through
// google-play-scraper 9.2.0 reviews() (sort NEWEST, lang en, 150 per page), written as SMAR's 11-column review CSV.
// Default = page truth: newest min(count, 10000) unique reviews, true milliseconds, no BOM.
// --smar-compat = SMAR's bytes: its millisecond quirk, its duplicate padding / dropped rows, BOM.
// Needs extract_play.js (Node: same folder; browser: paste it first, then this file -> window.SMAR_REVIEWS).
//   node reviews_play.js <appId|id1,id2,...> OUT.csv [--bulk] [--from-results-table] [--country XX] [--smar-compat]
//        [--limit N|--all] [--force] [--until-done] [--resume [--deliver-anyway]] [--max-seconds N] [--paths F]
//   --until-done: ONE call that keeps going (failed apps retried after a pause) until finished or the hard cap
//   (--max-seconds, default 540 s); at most one short stderr progress line per minute. --deliver-anyway refuses an
//   unfinished run (exit 3, NEXT RESUME).
//   exit 0 finished (read READY_TO_DELIVER) | 1 fatal, resumable (read NEXT) | 2 usage | 3 incomplete (repeat with
//   --resume) | 4 locked | 5 crash. stdout = exactly one JSON summary.
//   Browser: await SMAR_REVIEWS.start({appId}|{ids, bulk}); repeat await SMAR_REVIEWS.step(10) until done;
//   SMAR_REVIEWS.status(); (user agrees) await SMAR_REVIEWS.download('<name>.csv').
(function smarReviews(root) {
  'use strict';
  const VERSION = '3.1.0';
  const RPC = 'UsvDTd', NEWEST = 2, PAGE_SIZE = 150, MAX_REVIEWS = 10000, ELIGIBLE_BELOW = 100000;
  const EMPTY_TOKEN_MAX = 5, RPC_RETRY_MS = [2000, 4000, 8000], ERROR_PAGE_RETRY_MS = [2000, 4000, 8000], APP_ATTEMPTS = 3;
  const HEADER = ['reviewID', 'dateReviewed', 'rating', 'reviewURL', 'reviewText', 'developerReplyDate', 'developerReplyText',
    'versionWhenReviewed', 'helpfulVotes', 'country', 'dateScraped'];
  const KEYS = ['id', 'date', 'score', 'url', 'text', 'replyDate', 'replyText', 'version', 'thumbsUp', 'country'];
  const COL = {}; KEYS.forEach((k, i) => { COL[k] = HEADER[i]; });
  const DONE_OK = { limit: 1, 'end-of-stream': 1 };
  let S = null; // extract_play.js api
  const NEEDS = ['extractApp', 'checkApp', 'usePaths', 'smarDate', 'smarCleanText', 'bomFor', 'makeGet', 'makePost', 'urls',
    'COUNTRIES', 'pageKind', 'storefront', 'RateLimited'];
  function bind(s) {
    const miss = NEEDS.filter((k) => !s || s[k] == null);
    if (miss.length) throw usage('extract_play.js v3 is required (missing ' + miss.join(', ') + ')');
    if (s.bomFor('reviews', true) !== '\uFEFF' || s.bomFor('reviews', false) !== '') throw usage('extract_play.js bomFor(\'reviews\') does not follow C14');
    S = s;
  }
  function err(msg, code, extra) { const e = new Error(msg); e.code = code; return Object.assign(e, extra || {}); }
  const usage = (msg) => err(msg, 'USAGE');
  function rateLimited(msg, code) { let e; try { e = new S.RateLimited(msg); } catch (x) { e = new Error(msg); e.name = 'RateLimited'; } e.code = code; return e; }
  const rpath = (o, p) => { let v = o; for (const k of p) { if (v == null) return undefined; v = v[k]; } return v; }; // ramda 0.21 R.path
  const smarLimit = (count) => (count && count < MAX_REVIEWS ? count : MAX_REVIEWS); // reviewsController expression

  // ---------------- request / response (gps lib/reviews.js) ----------------
  const endpoint = (country) => '/_/PlayStoreUi/data/batchexecute?rpcids=qnKhOb&f.sid=-697906427155521722' +
    '&bl=boq_playuiserver_20190903.08_p0&hl=en&gl=' + country + '&authuser&soc-app=121&soc-platform=1&soc-device=1&_reqid=1065213';
  function body(appId, token) { // byte-identical to gps getBodyForRequests (initial / paginated)
    const inner = '[null,null,[2,' + NEWEST + ',[' + PAGE_SIZE + ',null,' + (token ? JSON.stringify(token) : 'null') + '],null,[]],' + JSON.stringify([appId, 7]) + ']';
    return 'f.req=' + encodeURIComponent(JSON.stringify([[[RPC, inner, null, 'generic']]]));
  }
  // -> {reviews, token, end?} | {rpcError} | {bad}. gps ends the stream on null data / [] / no token.
  function parseBatch(text) {
    const t = String(text);
    if (!/^\s*\)\]\}'/.test(t)) return { bad: 'not a batchexecute response' };
    let env = null, first = null;
    const scan = (j) => { if (Array.isArray(j)) for (const e of j) if (Array.isArray(e) && e[0] === 'wrb.fr') { first = first || e; if (e[1] === RPC && !env) env = e; } };
    try { scan(JSON.parse(t.slice(t.indexOf('[')))); } catch (e) { for (const l of t.split('\n')) if (l[0] === '[') { try { scan(JSON.parse(l)); } catch (e2) { /* chunk */ } } }
    env = env || first;
    if (!env) return { bad: 'no wrb.fr envelope' };
    if (env[2] == null) return env[5] != null ? { rpcError: JSON.stringify(env[5]).slice(0, 200) } : { reviews: [], token: null, end: 'null_payload' };
    let d; try { d = JSON.parse(env[2]); } catch (e) { return { bad: 'payload is not JSON' }; }
    if (d === null) return { reviews: [], token: null, end: 'null_data' };
    if (!Array.isArray(d)) return { bad: 'payload is not an array' };
    if (!d.length) return { reviews: [], token: null, end: 'empty_data' };
    if (d[0] != null && !Array.isArray(d[0])) return { bad: 'review list is not an array' };
    const tok = rpath(d, [1, 1]);
    if (tok != null && typeof tok !== 'string') return { bad: 'token is not a string' };
    return { reviews: d[0] || [], token: tok || null };
  }

  // ---------------- one raw review -> stored row (raw values; formatted at write time) ----------------
  const nanosOk = (a) => a[1] == null || (Number.isInteger(a[1]) && a[1] >= 0 && a[1] < 1e9 && a[1] % 1e6 === 0);
  const dateOk = (a, now) => Array.isArray(a) && Number.isInteger(a[0]) && a[0] > 1.2e9 && a[0] < now / 1000 + 86400 && nanosOk(a);
  // semantic checks (real corpus: 447k stored reviews, 16k full raw records; 9621 real version names from reviews and
  // details pages): ids start with a UUID (gps-era "gp:..." also allowed), never an account id / name / text; a version
  // is one non-blank line, <= 64 chars, <= 8 words, with a digit (real: "3.1.16", "Cirrus Uncinus 3.0.5", "7.1 – Onn
  // Roku TV Remote Update", "OG (2.5.2.149)", 19-digit names; <= 47 chars, <= 7 words; 0 of 287,888 real review
  // versions lack a digit: a digit-free name ("APNA", seen only on details pages) passes only when it is the details
  // page's own version, cv), never only zeros, a date, a URL, a UUID or an account id (21 digits); a review text that
  // is only a version number, blank or an id never occurred, nor a reply text that is a version (0 of 48,944);
  // thumbsUp < 1e6 (real max 1775); names <= 47 chars, one line
  const ID_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|gp:[\w-]{8})[\w-]*$/i;
  const verOk = (v, cv) => typeof v === 'string' && v.length <= 64 && !/[\x00-\x1f]|:\/\/|[0-9a-f]{8}-[0-9a-f]{4}-|^\s*(\d{20,}|0+(\.0+)*|\d{4}[-/]\d\d[-/]\d\d([T ][\d:.]+Z?)?|\d\d?\/\d\d?\/\d{4}|[A-Z][a-z]{2} \d\d?, \d{4})?\s*$/i.test(v) && v.trim().split(/\s+/).length <= 8 && (/\d/.test(v) || (v === cv && !/^Varies with device$/i.test(v)));
  const verLike = (t) => typeof t === 'string' && /^v?\d+(\.\d+){1,4}$/.test(t.trim());
  const rating = (s) => Number.isInteger(s) && s >= 1 && s <= 5;
  const old0 = (r) => r[2] === 0 && rpath(r, [5, 0]) < 1356998400; // Google's legacy no-star review (score 0, before 2013)
  const sameAt = (a, b) => Array.isArray(a) && Array.isArray(b) && a[0] === b[0] && a[1] === b[1];
  const isReply = (x) => Array.isArray(x) && typeof x[1] === 'string' && Number.isInteger(rpath(x, [2, 0]));
  // per-cell checks (gps keys); a failing cell is written "undefined" (D3); many failing cells = drift (stepApp).
  // Values are also checked against the same-named value elsewhere in the record / on the details page: no value
  // column holds one of the record's identity values (review id, reviewer name r[1][0]/r[9][1], account id r[9][0],
  // avatar URL, reply author r[7][0]); the version is not the review's own date; the reply text is not the developer
  // (dev: details page developer / JSON-LD author); the review and reply dates are never the same instant; the reply
  // sits in r[7], nowhere else, and is always [author, text, date] (real: 3695 of 3695). Cross-cell: a failing star
  // value with a 1..5 helpfulVotes, a version-only text or reply text next to a non-version, a long multi-line value in
  // the name slot: the two traded places on this row (both cells fail). A text or reply text equal to the version was
  // copied from it. A reply slot holding anything but a reply: both reply cells fail, and so do the row's empty text /
  // version cells (the slot that gave r[7] its value got r[7]'s null).
  function checkRaw(r, now, dev, cv) {
    if (!Array.isArray(r)) return ['id', 'date', 'score', 'text', 'replyDate', 'replyText', 'version', 'thumbsUp'];
    dev = dev || [];
    const bad = [], t = r[4], v = r[10], re = r[7], rt = rpath(re, [1]), nm = rpath(r, [1, 0]), sBad = !rating(r[2]), odd = re != null && !isReply(re), tv = verLike(t) && !verLike(v);
    const who = [r[0], nm, rpath(r, [9, 0]), rpath(r, [9, 1]), rpath(r, [1, 1, 3, 2]), rpath(re, [0])], isWho = (s) => !!s && who.indexOf(s) >= 0;
    const vBad = tv || (verLike(rt) && !verLike(v)) || (v != null ? !verOk(v, cv) || isWho(v) || dev.indexOf(v) >= 0 || (!Number.isInteger(r[6]) && /^\d+$/.test(v)) || [rpath(r, [5, 0]), rpath(r, [5, 1]), rpath(re, [2, 0])].some((x) => x != null && v === String(x)) : odd);
    if (typeof r[0] !== 'string' || !ID_RE.test(r[0]) || r[0] === rpath(r, [9, 0])) bad.push('id');
    if (sBad) bad.push('score');
    if (!dateOk(r[5], now) || sameAt(r[5], rpath(re, [2]))) bad.push('date');
    if (t != null ? typeof t !== 'string' || !t.trim() || isWho(t) || tv || t === v || /^\s*(https?:\/\/\S+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[\w-]*|gp:[\w-]{8,})\s*$/i.test(t) || (typeof nm === 'string' && (nm.length > 80 || /[\r\n]/.test(nm))) : vBad || odd) bad.push('text');
    if (!Number.isInteger(r[6]) || r[6] < 0 || r[6] >= 1e6 || (sBad && rating(r[6]) && !old0(r))) bad.push('thumbsUp');
    if (vBad) bad.push('version');
    if (odd) bad.push('replyText', 'replyDate');
    else if (re != null) {
      if (rt && (isWho(rt) || dev.indexOf(rt) >= 0 || verLike(rt) || rt === v)) bad.push('replyText');
      if (!dateOk(re[2], now) || sameAt(r[5], re[2])) bad.push('replyDate');
    } else if (r.some((x, i) => i !== 7 && isReply(x))) bad.push('replyText', 'replyDate'); // the reply moved out of r[7]
    return bad;
  }
  function storeRow(r, p, dup, bad) { // null vs undefined kept exactly as gps maps them (JSON drops undefined)
    const a = Array.isArray(r) ? r : [];
    const o = { p, id: a[0], s: a[2], t: a[4], d: a[5] || null, rd: rpath(a, [7, 2]) || null, rt: rpath(a, [7, 1]) || null, v: a[10] || null, u: a[6] };
    if (dup) o.x = 1;
    if (bad.length) o.q = bad;
    return o;
  }
  function fmtDate(a, quirk) { // quirk = gps generateDate (nanos not zero-padded: .059 -> .590)
    if (!a) return null;
    if (quirk) { const ms = String(a[1] || '000'); return new Date(Number(`${a[0]}${ms.substring(0, 3)}`)).toJSON(); }
    return new Date(a[0] * 1000 + Math.floor((a[1] || 0) / 1e6)).toJSON();
  }
  const msQuirk = (o) => fmtDate(o.d, true) !== fmtDate(o.d, false) || fmtDate(o.rd, true) !== fmtDate(o.rd, false);
  // stored row -> the object gps + reviewsController build ({...review, country}), in jsonToCsv key order
  function gpsReview(o, appId, country, quirk, blank) {
    const g = { id: o.id, date: fmtDate(o.d, quirk), score: o.s, url: `https://play.google.com/store/apps/details?id=${appId}&reviewId=${o.id}`,
      text: o.t, replyDate: fmtDate(o.rd, quirk), replyText: o.rt, version: o.v, thumbsUp: o.u, country };
    for (const k of (o.q || []).concat(blank || [])) { g[k] = 'undefined'; if (k === 'id') g.url = 'undefined'; }
    return g;
  }
  const headerLine = () => HEADER.map((h) => `"${h}"`).join(',');
  function rowLine(g, dateCell, compat) { // jsonToCsv: every cell "cleanText(v)", dateScraped bare
    return KEYS.map((k) => {
      const c = `"${S.smarCleanText(g[k])}"`;
      if (compat && c === '"primary search"') return '"keyword search"'; // jsonToCsv quirk, any column
      if (compat && c === '"related app"') return '"similar app links"';
      return c;
    }).join(',') + ',' + dateCell;
  }

  // ---------------- SMAR's loop, replayed on the page log ----------------
  // pages = [[rowsOnPage, hasToken]]. gps reviews() (paginate:false, num 150) keeps requesting while it has < 150 rows
  // and a token, slices to 150 (the overflow is lost) and returns the last token; reviewsController loops until it has
  // smarLimit rows, re-sending the stale token after the stream ends (= repeats the last call: duplicate padding);
  // a last call with 0 rows loops forever. Returns stored-line indexes of SMAR's rows.
  function smarReplay(pages, num) {
    const seq = [], dropped = []; let li = 0, i = 0, total = 0, firstPass = 0, ended = false, last = [];
    while (total < num) {
      if (ended) {
        if (!last.length) return { hang: true, seq, dropped, firstPass, pad: 0 };
        for (const x of last) seq.push(x);
        total += last.length; continue;
      }
      const acc = [];
      for (;;) {
        if (i >= pages.length) { // call still open: its first rows are already fixed
          if (total + Math.min(acc.length, PAGE_SIZE) < num) return { needMore: true, seq, dropped, firstPass, pad: 0 };
          for (const x of acc.slice(0, PAGE_SIZE)) seq.push(x);
          return { seq: seq.slice(0, num), dropped, firstPass: num, pad: 0 };
        }
        const [n, tok] = pages[i++];
        for (let k = 0; k < n; k++) acc.push(li++);
        if (!(tok && acc.length < PAGE_SIZE)) { ended = !tok; break; }
      }
      last = acc.slice(0, PAGE_SIZE);
      for (const x of acc.slice(PAGE_SIZE)) dropped.push(x);
      for (const x of last) seq.push(x);
      total += last.length; firstPass = total;
    }
    return { seq: seq.slice(0, num), dropped, firstPass, pad: Math.max(0, num - firstPass) };
  }
  function smarHave(pages) { // SMAR's row counter after the pages fetched so far
    let total = 0, acc = 0;
    for (const [n, tok] of pages) { acc += n; if (!(tok && acc < PAGE_SIZE)) { total += Math.min(acc, PAGE_SIZE); acc = 0; } }
    return total + Math.min(acc, PAGE_SIZE);
  }

  // ---------------- run state ----------------
  function normOpts(o) {
    o = o || {};
    const raw = o.ids != null ? o.ids : o.appId;
    const ids = (Array.isArray(raw) ? raw : String(raw || '').split(',')).map((s) => String(s).trim()).filter(Boolean);
    const re = S.APPID_RE || /^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)+$/;
    if (!ids.length) throw usage('no appId given');
    const badIds = ids.filter((id) => !re.test(id));
    if (badIds.length) throw usage('not a Play package id: ' + badIds.join(', ') + ' (use run_play.js lookup "<name>" first)');
    const country = String(o.country || 'US').trim().toUpperCase();
    if (S.COUNTRIES.indexOf(country) < 0) throw usage('unknown country ' + o.country);
    let limit = null;
    if (o.limit != null && o.limit !== false) { limit = Number(o.limit); if (!Number.isInteger(limit) || limit < 1) throw usage('--limit must be a positive integer'); }
    if (limit != null && o.all) throw usage('use --limit or --all, not both');
    if (o.paths != null && (typeof o.paths !== 'object' || Array.isArray(o.paths))) throw usage('paths must be a JSON object');
    const uniq = ids.filter((id, i) => ids.indexOf(id) === i);
    return { ids: uniq, bulk: !!o.bulk || uniq.length > 1, country, limit, all: !!o.all, fromResultsTable: !!o.fromResultsTable,
      force: !!o.force, compat: !!o.compat, paths: o.paths || {}, duplicateIds: ids.length - uniq.length };
  }
  const sig = (o) => JSON.stringify([o.ids, o.bulk, o.country, o.limit, o.all, o.fromResultsTable, o.paths]);
  function newRun(opts, now) {
    const run = { v: 3, kind: 'reviews', skill: 'smar-playstore-agent', version: VERSION, runId: Math.random().toString(16).slice(2, 10) + now.toString(16),
      rev: 0, opts, startedUTC: new Date(now).toISOString(), finishedUTC: null, apps: {} };
    for (const id of opts.ids) run.apps[id] = { appId: id, phase: 'init', stop: null, attempts: 0, count: null, ratings: null, smarLimit: null,
      limit: null, token: null, pages: [], lines: 0, uniq: 0, dupes: 0, shortPages: 0, emptyRun: 0, invalid: {}, replies: 0, drift: [], smarHttp500: false,
      storefront: null, countCheck: null, error: null, rpcErrors: 0, rpcPersistent: false, ms: 0 };
    return run;
  }
  const finish = (a, stop) => { a.phase = 'done'; a.stop = stop; a.error = a.error && stop.indexOf('error') === 0 ? a.error : null; };
  function enough(a) {
    if (a.limit == null || a.uniq < a.limit) return false;
    return a.limit < a.smarLimit || smarHave(a.pages) >= a.smarLimit; // also hold SMAR's rows for --smar-compat
  }
  const seenSet = (rows, lines) => { const s = new Set(rows.map((x) => x.id)); s.lines = lines; return s; }; // valid for `lines` stored rows
  const pageCap = (a) => (a.limit == null ? 20000 : 3 * Math.ceil(Math.max(a.limit, a.smarLimit) / PAGE_SIZE) + 10);

  // No rating anywhere on the page (JSON-LD aggregateRating, star badge, score/ratings data): extract_play's unratedPage.
  const unrated = (x) => !(x.ld && x.ld.aggregateRating) && !(x.dom || {}).ratingBadge && x.raw.score == null && x.raw.ratings == null && x.raw.reviews == null;
  // details page -> SMAR's review count (gps app().reviews = extract_play raw.reviews), with its cross-checks
  async function initApp(run, a, io) {
    const country = run.opts.country, u = S.urls(country).details(a.appId);
    let r, kind, x;
    for (let i = 0, again = 1; ; i++) {
      r = await io.get(u, {});
      kind = r.status === 404 ? 'not_found' : S.pageKind(r.text, { status: r.status, url: r.url, appId: a.appId });
      if (kind === 'sorry' || kind === 'consent') throw rateLimited('Google ' + kind + ' page on ' + a.appId, kind.toUpperCase());
      if (kind === 'error_page' && i < ERROR_PAGE_RETRY_MS.length) { await io.sleep(ERROR_PAGE_RETRY_MS[i]); continue; }
      if (kind === 'app') x = S.extractApp(r.text, a.appId, { country });
      // Google sometimes serves a rated app's page without its rating: an unrated page counts only when a second fetch agrees
      if (x && unrated(x) && again--) { await io.sleep(3000); continue; }
      break;
    }
    if (kind === 'not_found') return finish(a, 'not-found');
    if (kind !== 'app') return finish(a, 'page:' + kind);
    a.dev = [x.raw.developer, rpath(x.ld, ['author', 'name'])].filter((s) => typeof s === 'string' && s);
    a.cv = typeof x.raw.version === 'string' ? x.raw.version : null; // the details page's own version (checkRaw: a digit-free name must be it)
    const sf = x.storefront || S.storefront(r.text, x.ld, country);
    a.storefront = { ok: !!sf.ok, why: sf.why };
    if (!sf.ok) return finish(a, 'wrong-storefront');
    const chk = S.checkApp(x);
    a.countCheck = { errors: (chk.errors || []).filter((e) => e.field === 'reviews' || e.field === 'ratings').map((e) => e.field + ': ' + e.why),
      unverified: (chk.unverified || []).filter((e) => /rating|review/i.test(JSON.stringify(e))) };
    if (unrated(x) && !a.countCheck.errors.length) a.unrated = true; // two fetches agree: no ratings, so 0 reviews (not drift)
    a.count = x.raw.reviews === undefined ? (a.unrated ? 0 : null) : x.raw.reviews;
    a.ratings = x.raw.ratings === undefined ? (a.unrated ? 0 : null) : x.raw.ratings;
    a.smarHttp500 = x.smarLib !== undefined ? x.smarLib : (S.smarLibWouldThrow ? S.smarLibWouldThrow(r.text) : false);
    if (a.countCheck.errors.length || !Number.isInteger(a.count) || a.count < 0 || (Number.isInteger(a.ratings) && a.count > a.ratings)) {
      a.drift = ['reviewCount']; return finish(a, 'layout-drift:reviewCount');
    }
    a.smarLimit = smarLimit(a.count);
    if (run.opts.fromResultsTable && !(a.count > 0 && a.count < ELIGIBLE_BELOW) && !run.opts.force) return finish(a, 'ineligible');
    a.limit = run.opts.all ? null : run.opts.limit != null ? run.opts.limit : Math.min(a.count, MAX_REVIEWS);
    a.phase = 'fetch'; // count 0: limit 0, one page is still read to predict SMAR (which uses limit 10000 then)
  }

  async function fetchPage(run, a, io) {
    for (let i = 0; ; i++) {
      const r = await io.post(endpoint(run.opts.country), body(a.appId, a.token), {});
      if (!r || r.status !== 200) throw err('UsvDTd HTTP ' + (r && r.status), 'HTTP_' + (r && r.status));
      if (!/^\s*\)\]\}'/.test(String(r.text))) {
        const k = S.pageKind(r.text, { status: r.status, url: r.url });
        if (k === 'sorry' || k === 'consent') throw rateLimited('Google ' + k + ' page on the review RPC', k.toUpperCase());
        return { bad: 'non-RPC response (' + k + ')' };
      }
      const pg = parseBatch(r.text);
      if (!pg.rpcError) return pg;
      a.rpcErrors++;
      if (i >= RPC_RETRY_MS.length) { a.rpcPersistent = true; throw err('review RPC error after ' + (i + 1) + ' tries: ' + pg.rpcError, 'RPC_ERROR'); }
      await io.sleep(RPC_RETRY_MS[i]);
    }
  }

  async function stepApp(run, a, io, store, budget) {
    const seen = await store.seen(run, a.appId);
    while (a.phase === 'fetch') {
      if (budget.pages <= 0 || io.now() >= budget.deadline) return false;
      const t0 = io.now(), reqToken = a.token, pg = await fetchPage(run, a, io);
      budget.pages--;
      if (pg.bad) { a.drift = ['payload']; finish(a, 'layout-drift:payload (' + pg.bad + ')'); await store.save(run); break; }
      const snap = JSON.stringify(a), p = a.pages.length, now = Date.now(), rows = [], bad = {}, mine = new Set(), vv = new Set(), vd = new Set(), tc = new Map(), sc = [0, 0, 0, 0, 0, 0];
      let nullV = 0, nullT = 0, nR = 0, rq = 0, ip = 0, tr = 0, te = 0, tv = 0, t = 0, tR = 0, d = 0, dR = 0, u0 = 0, u10 = 0, u1k = 0, z0 = 0, s5 = 0, old = 0, vn = 0, vs = 0, vu = 0, s9 = 0;
      for (const r of pg.reviews) {
        const b = checkRaw(r, now, a.dev, a.cv), id = Array.isArray(r) ? r[0] : undefined, dup = seen.has(id);
        if (mine.has(id)) { ip++; if (b.indexOf('id') < 0) b.push('id'); } else if (!dup) mine.add(id); // a repeat inside one page: kept, its id quarantined
        for (const k of b) bad[k] = (bad[k] || 0) + 1;
        if (!Array.isArray(r) || r[10] == null) nullV++;
        if (!Array.isArray(r) || r[4] == null) nullT++;
        else { t++; if (r[7] != null) tR++; }
        if (Array.isArray(r)) {
          if (r[7] != null || b.indexOf('replyDate') >= 0) nR++;
          if (typeof r[4] === 'string' && r[4] === rpath(r, [7, 1])) rq++; // review text = its reply text
          if (rating(r[6])) { tr++; if (r[6] === r[2]) te++; }
          if (r[6] === 0) u0++; else if (r[6] >= 10) { u10++; if (r[6] >= 1000) u1k++; }
          if (old0(r)) old++; else if (r[2] === 0) z0++;
          if (r[2] === 5) s5++;
          if (rating(r[2])) sc[r[2]]++;
          if (typeof r[4] === 'string') tc.set(r[4], (tc.get(r[4]) || 0) + 1);
          if (verLike(r[4])) tv++;
          if (typeof r[9] === 'string') s9++; // r[9] is always the reviewer record (real: 16246 of 16246)
          if (dateOk(r[5], now)) { d++; if (r[7] != null) dR++; }
          const v = r[10]; // a bare-number version equal to this row's stars / helpfulVotes (real pages: <= 2.2%)
          if (typeof v === 'string') { vn++; vd.add(v); if (/^\d+$/.test(v)) { if (v === String(r[2])) { vs++; vv.add(v); } else if (v === String(r[6])) { vu++; vv.add(v); } } }
        }
        rows.push(storeRow(r, p, dup, b));
      }
      const fresh = mine.size;
      const n = rows.length;
      for (const k in bad) a.invalid[k] = (a.invalid[k] || 0) + bad[k];
      a.replies = (a.replies || 0) + nR; a.rq = (a.rq || 0) + rq;
      a.old0 = (a.old0 || 0) + old;
      // drift: 2 cells of a page of <= 4, else 5% and 3 (real pages: 0; legacy no-star reviews are not counted) of a
      // page's cells fail, or of the app's so far; reply cells count against replies
      const lim = (k, x, all, rep, o) => { const N = /^reply/.test(k) ? rep : all; return x - (k === 'score' ? o : 0) >= Math.max(2, Math.min(N / 2, Math.max(3, N / 20))); };
      const drift = Object.keys(bad).filter((k) => lim(k, bad[k], n, nR, old) || lim(k, a.invalid[k], a.lines + n, a.replies, a.old0));
      if (n >= 50 && nullV / n > 0.8 && drift.indexOf('version') < 0) drift.push('version'); // max seen on real pages: 23%
      if (n >= 50 && nullT / n > 0.25 && drift.indexOf('text') < 0) drift.push('text'); // real pages (3004 of >= 50 rows): <= 3.3%
      if (vn >= 20 && vd.size >= 0.95 * vn && drift.indexOf('version') < 0) drift.push('version'); // one version per review (real pages: <= 69% distinct)
      if (n >= 20 && (u1k >= n / 2 || (!u0 && u10 >= n / 2)) && drift.indexOf('thumbsUp') < 0) drift.push('thumbsUp'); // not vote counts (real pages: >= 1000 <= 0.7%, >= 10 <= 29%, a 0 on all 3004 of >= 50 rows, some with only 1)
      if (n >= 20 && z0 && !s5 && drift.indexOf('score') < 0) drift.push('score'); // 0-star reviews since 2013 and no 5-star: the star scale moved
      // one value copied into (nearly) every row (real pages of >= 50 rows: one text <= 19%, 2/3/4 stars each <= 33%)
      if (n >= 50 && Math.max(sc[2], sc[3], sc[4]) >= 0.9 * n && drift.indexOf('score') < 0) drift.push('score');
      if (n >= 50 && Math.max(0, ...tc.values()) >= 0.8 * n && drift.indexOf('text') < 0) drift.push('text');
      if (ip && drift.indexOf('id') < 0) drift.push('id'); // a page repeats a review id (real: 0 of 3,239 pages): ids moved between records
      // the review text copied from its reply (real: 5 of 48,944 replies, at most 2 of a page's 143 and 1 of 6)
      if (((rq >= 2 && rq >= nR / 2) || (a.rq >= 2 && a.rq >= a.replies / 2)) && drift.indexOf('text') < 0) drift.push('text');
      // swap partners: the drifted column's values sit in another column that passes its own checks (blanked with it)
      const has = (k) => drift.indexOf(k) >= 0, imp = {};
      if (has('score') && tr >= 0.8 * n) imp.thumbsUp = 'score';
      if (n >= 50 && te >= 0.9 * n) imp.thumbsUp = 'score'; // helpfulVotes copies the stars (real pages: <= 49%)
      if (n >= 30 && !u0 && tr >= 0.95 * n) { imp.thumbsUp = 'score'; if (te < 0.9 * n) imp.score = 'thumbsUp'; } // stars in helpfulVotes (every real page has a 0); not a copy: the stars' own column is suspect too
      if (vs + vu >= Math.max(3, vn / 2) && (vv.size > 1 || vv.has('0'))) imp.version = vs >= vu ? 'score' : 'thumbsUp';
      if (has('version') && tv >= Math.max(2, n / 2)) imp.text = 'version';
      if (has('text') && t && tR === t) imp.replyText = 'text'; // the only texts left are on replied reviews
      if (has('date') && d && dR === d) imp.replyDate = 'date';
      if (has('version') && s9 >= n / 2) Object.assign(imp, { replyText: 'record layout shifted', replyDate: 'record layout shifted' }); // version values one slot down: r[7] may hold r[8]
      for (const [k, j] of [['replyText', 'replyDate'], ['replyDate', 'replyText']]) if ((has(k) || imp[k]) && !has(j) && !imp[j]) imp[j] = 'same reply as ' + COL[k]; // one reply record: never half of it
      for (const k in imp) { if (!has(k)) drift.push(k); (a.partners = a.partners || {})[k] = imp[k]; } // labelled even when it drifted by itself
      if (a.unrated && n) drift.push('reviewCount'); // a page with no rating anywhere, yet reviews exist
      a.pages.push([n, pg.token ? 1 : 0]); a.lines += n; a.uniq += fresh + ip; a.dupes += n - fresh - ip;
      if (n && n < PAGE_SIZE && pg.token) a.shortPages++;
      a.emptyRun = !n && pg.token ? a.emptyRun + 1 : 0;
      a.token = pg.token; a.ms += io.now() - t0;
      if (drift.length) { a.drift = drift; finish(a, 'layout-drift:' + drift.map((k) => COL[k] || k).join(',')); }
      else if (!pg.token) finish(a, 'end-of-stream');
      else if (a.emptyRun >= EMPTY_TOKEN_MAX) finish(a, 'empty-token-loop');
      else if (n && !fresh && pg.token === reqToken) finish(a, 'token-loop');
      else if (enough(a)) finish(a, 'limit');
      else if (a.pages.length >= pageCap(a)) finish(a, 'page-cap');
      try { await store.commit(run, a.appId, p, rows); } catch (e) { Object.assign(a, JSON.parse(snap)); e.store = true; throw e; } // keep memory == storage
      for (const id of mine) seen.add(id); // only after the page is stored
      seen.lines = a.lines;
    }
    return true;
  }

  // One pass over the apps. Rate limits / interstitials abort the run (resumable); other transport failures
  // are per app (retried on resume, given up after APP_ATTEMPTS). -> {done}
  async function advance(run, io, store, budget) {
    S.usePaths(run.opts.paths || {});
    for (const id of run.opts.ids) {
      const a = run.apps[id];
      if (a.phase === 'done') continue;
      if (io.now() >= budget.deadline) return { done: false, budget: true }; // no app is started past the deadline
      try {
        if (a.phase === 'init') { await initApp(run, a, io); await store.save(run); }
        if (a.phase === 'fetch' && !(await stepApp(run, a, io, store, budget))) return { done: false, budget: true };
      } catch (e) {
        if (e.store) throw e; // storage failed: never save a state the rows file does not match
        // a request whose retries would run past --max-seconds (Node io.deadline): not a failed attempt; resumed later
        if (e.code === 'DEADLINE') { await store.save(run); return { done: false, budget: true }; }
        if (/^(SORRY|CONSENT|INTERSTITIAL|RATE_LIMITED|SUPERSEDED|STORAGE_FULL|USAGE)$/.test(e.code || '')) { await store.save(run).catch(() => {}); throw e; }
        a.attempts++; a.error = { code: e.code || 'ERROR', message: String(e.message || e).slice(0, 300) };
        if (a.attempts >= APP_ATTEMPTS) finish(a, 'error:' + a.error.code);
        await store.save(run);
      }
    }
    const pending = run.opts.ids.filter((id) => run.apps[id].phase !== 'done');
    if (!pending.length && !run.finishedUTC) { run.finishedUTC = new Date(io.now()).toISOString(); await store.save(run); }
    return { done: !pending.length, failed: pending };
  }

  // ---------------- outputs: the single byte producer for both runners ----------------
  // rows: an array (browser, tests) or a source {n, each(fn)} that streams the stored rows in order (Node: the rows
  // file, so a 2M-row --all run never holds every row in memory)
  const source = (rows) => (Array.isArray(rows) ? { n: rows.length, each: (fn) => rows.forEach(fn) } : rows);
  // Google's legacy no-star reviews (score 0, before 2013): default writes rating "undefined", --smar-compat SMAR's "0"
  const legacy0 = (o, k) => k === 'score' && o.s === 0 && !!o.d && o.d[0] < 1356998400;
  const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
  const cols = (ks) => ks.map((k) => COL[k] || k);
  function appReport(run, a, rows) {
    const rep = { appId: a.appId, stop: a.stop, count: a.count, ratings: a.ratings, unrated: a.unrated || undefined, smarLimit: a.smarLimit, limit: run.opts.all ? 'all' : a.limit,
      fetched: 0, pages: a.pages.length, duplicatesSkipped: a.dupes, shortPages: a.shortPages, invalidCells: a.invalid, drift: a.drift.length ? cols(a.drift) : undefined,
      sort: 'NEWEST', storefront: a.storefront || undefined, countCheck: a.countCheck && (a.countCheck.errors.length || a.countCheck.unverified.length) ? a.countCheck : undefined,
      error: a.error || undefined, secondsFetching: +(a.ms / 1000).toFixed(1) };
    if (a.count == null) return { rep, n: 0, smar: null, ok: false };
    const src = source(rows), r = smarReplay(a.pages, a.smarLimit), cap = a.limit == null ? Infinity : a.limit, drop = r.dropped.slice(0, 50);
    const need = new Set(r.hang || r.needMore ? drop : r.seq.concat(drop)), keep = new Map(), ids = [];
    let n = 0, ms = 0;
    if (src.n < a.lines) rep.rowsMissing = a.lines - src.n; // the stored rows are shorter than the run recorded
    else src.each((o, i) => { if (need.has(i)) keep.set(i, o); if (!o.x && n < cap) { n++; if (msQuirk(o)) ms++; if (ids.length <= MAX_REVIEWS) ids.push(o.id); } });
    const smar = r.hang || r.needMore || rep.rowsMissing ? null : r.seq.map((i) => keep.get(i));
    rep.fetched = n;
    rep.msQuirkRows = ms;
    rep.smarWouldHang = !!(r.hang || a.rpcPersistent);
    rep.smarPadRows = r.pad;
    rep.smarPadExact = r.pad ? a.shortPages === 0 && a.dupes === 0 : undefined;
    rep.smarDroppedRows = r.dropped.length;
    if (r.dropped.length) rep.smarDroppedIds = drop.map((i) => keep.get(i) && keep.get(i).id);
    rep.smarParity = smar ? n === smar.length && smar.every((o, i) => o.id === ids[i]) : false;
    rep.smarHttp500 = a.smarHttp500 || undefined;
    rep.moreAvailable = a.stop === 'limit' && !!a.token;
    rep.supersetOfSmar = a.limit == null || a.limit > a.smarLimit;
    if (a.count === 0) rep.note = r.hang ? 'Google stream is empty; SMAR would loop forever (no file)' : 'count is 0 but the stream is not: SMAR would export up to 10000 rows';
    const ok = !!DONE_OK[a.stop] && !a.drift.length && (n > 0 || a.count === 0) && !rep.rowsMissing;
    return { rep, n, smar, ok, replay: r, src, cap };
  }

  // o: {compat, deliverAnyway, now, runner, open(csvName) -> {write(s), end()}}. Without open the CSV comes back as a
  // string (csv); with it (Node) the bytes are streamed to that sink and csv is null.
  function outputs(run, rowsByApp, o) {
    o = o || {};
    const compat = o.compat != null ? !!o.compat : !!run.opts.compat, now = o.now || Date.now(), bulk = run.opts.bulk, country = run.opts.country;
    const finished = run.opts.ids.every((id) => run.apps[id].phase === 'done');
    const problems = [], reasons = [], apps = [], parts = [], smarFail = [];
    let READY = finished;
    for (const id of run.opts.ids) {
      const a = run.apps[id], x = appReport(run, a, rowsByApp[id] || []);
      apps.push(x.rep);
      const st = a.stop || 'pending';
      if (st === 'not-found') { problems.push(id + ': app not found (404)'); smarFail.push(id); reasons.push({ code: 'smar_http500_reviews', detail: id + ': not found, gps app() throws' }); }
      else if (st === 'ineligible') { problems.push(id + ': skipped, ' + a.count + ' reviews is outside SMAR\'s results-table rule 0 < count < 100000'); smarFail.push(id); reasons.push({ code: 'smar_not_offered', detail: id + ': SMAR\'s results table offers no review button for ' + a.count + ' reviews' }); }
      else if (a.count === 0 && finished && !(a.unrated && a.drift.length)) { problems.push(id + (a.unrated ? ': this app has no ratings or reviews on Google Play (' + country + '); nothing to export' : ': 0 reviews in ' + country + ' (' + x.rep.note + ')')); if (!bulk) READY = false; smarFail.push(id); }
      else if (!x.ok && st !== 'pending') { READY = false; problems.push(id + ': ' + st + (a.error ? ' (' + a.error.code + ': ' + a.error.message + ')' : '') + (x.rep.rowsMissing ? ' (' + x.rep.rowsMissing + ' stored rows are missing)' : DONE_OK[st] && !x.n ? ' with 0 reviews (count ' + a.count + ')' : '')); }
      else if (st === 'end-of-stream' && a.limit != null && x.n < a.limit) problems.push(id + ': Google\'s review stream ended after ' + x.n + ' of the ' + a.limit + ' reviews requested (page count ' + a.count + ')');
      // what SMAR would do with this app (compatExact describes --smar-compat in every mode)
      if (st === 'not-found' || st === 'ineligible') { /* reason recorded above */ }
      else if (x.rep.smarHttp500) { reasons.push({ code: 'smar_http500_reviews', detail: id + ': gps app() throws (' + a.smarHttp500 + '), SMAR returns HTTP 500' }); smarFail.push(id); }
      else if (/^(page:|wrong-storefront|error)/.test(st)) { reasons.push({ code: 'smar_unknown', detail: id + ': ' + st }); smarFail.push(id); }
      else if (x.replay && x.replay.hang) { reasons.push({ code: 'smar_would_hang', detail: id + ': SMAR loops forever (empty stream), no file' }); smarFail.push(id); }
      else if (x.replay && x.replay.needMore && a.count !== 0) reasons.push({ code: a.limit != null && a.limit < a.smarLimit ? 'limit_below_smar' : 'smar_replay_incomplete', detail: id + ': stopped (' + st + ') before SMAR\'s ' + a.smarLimit + ' rows' });
      else if (a.count === 0 && x.replay && x.replay.needMore) { reasons.push({ code: 'smar_count0_export', detail: id + ': ' + x.rep.note }); smarFail.push(id); }
      if (x.rep.smarPadRows && !x.rep.smarPadExact) reasons.push({ code: 'smar_pad_inexact', detail: id + ': padding replayed across short pages/duplicates' });
      if (a.drift.length) reasons.push({ code: 'layout_drift', detail: id + ': ' + x.rep.drift.join(',') });
      // a cell that failed its checks is written "undefined" in --smar-compat too, where SMAR writes Google's value
      const qc = {}; for (const r of x.smar || []) for (const k of r.q || []) if (!legacy0(r, k)) qc[COL[k]] = (qc[COL[k]] || 0) + 1;
      if (Object.keys(qc).length && smarFail.indexOf(id) < 0) reasons.push({ code: 'quarantined_cells', detail: id + ': cells written "undefined" where SMAR writes Google\'s value (' + Object.keys(qc).map((k) => k + ':' + qc[k]).join(',') + ')' });
      if (x.rep.smarDroppedRows) problems.push(id + ': SMAR\'s own export would omit ' + x.rep.smarDroppedRows + ' review(s) (gps short-page drop); this file keeps them');
      if (x.rep.smarPadRows && !compat) problems.push(id + ': SMAR\'s export would repeat ' + x.rep.smarPadRows + ' row(s) as padding; this file has each review once');
      parts.push({ id, a, x });
    }
    if (bulk && smarFail.length) reasons.push({ code: 'bulk_label_shift', detail: 'SMAR\'s Bulk page cannot fetch ' + smarFail.filter((x, i) => smarFail.indexOf(x) === i).join(',') + ': it would shift appId labels or download nothing' });
    const anyRows = parts.some((p) => p.x.n);
    if (!anyRows) READY = false;
    // a drifted column is blanked in every row; so is a column that holds its values (swap partner, stepApp)
    const blank = (p) => (!READY || o.deliverAnyway ? p.a.drift.filter((k) => k !== 'reviewCount' && k !== 'payload') : []);
    const quarantinedCells = {}, blankedColumns = {};
    const ds = S.smarDate(new Date(now)), dateCell = /[",\r\n]/.test(ds) ? '"' + ds.replace(/"/g, '""') + '"' : ds;
    const blocks = [];
    if (finished && (anyRows || compat)) {
      for (const p of parts) {
        if ((smarFail.indexOf(p.id) >= 0 && compat) || (compat ? !p.x.smar : p.x.rep.rowsMissing)) continue;
        blocks.push({ p, n: compat ? p.x.smar.length : p.x.n, bl: blank(p) });
      }
    }
    const rowsOut = blocks.reduce((s, b) => s + b.n, 0);
    const hasFile = !!blocks.length && !!(!bulk ? blocks[0].n || compat : compat || rowsOut) && !(compat && !bulk && smarFail.length); // no SMAR file for this app
    if (finished && compat && !hasFile && anyRows) { READY = false; problems.unshift('--smar-compat: SMAR produces no file here (' + reasons.map((r) => r.code).join(',') + '); without --smar-compat the page-truth file is available'); }
    if (!finished) READY = false;
    const csvName = !hasFile ? null : READY || o.deliverAnyway ? 'final' : 'not_ready';
    let csv = null, lone = 0, legacyScore0Rows = 0;
    if (hasFile) {
      const buf = [], out = o.open ? o.open(csvName) : { write: (s) => buf.push(s), end: () => buf.join('') };
      out.write(S.bomFor('reviews', compat) + (bulk ? '"appId",' + headerLine() + '\n' : headerLine()));
      for (const b of bulk ? blocks : blocks.slice(0, 1)) {
        if (bulk && !compat && !b.n) continue;
        const p = b.p, pre = bulk ? `"${p.id}",` : '';
        if (b.bl.length) blankedColumns[p.id] = b.bl.map((k, w) => COL[k] + ((w = (p.a.partners || {})[k]) ? ' (' + (COL[w] ? 'holds ' + COL[w] + ' values' : w) + ')' : ''));
        let first = true, k = 0, lo = null, hi = null;
        const line = (r) => {
          if (compat && r.s === 0 && (r.q || []).some((c) => legacy0(r, c)) && b.bl.indexOf('score') < 0) { r = Object.assign({}, r, { q: r.q.filter((c) => !legacy0(r, c)) }); legacyScore0Rows++; }
          for (const c of new Set((r.q || []).concat(b.bl))) quarantinedCells[COL[c]] = (quarantinedCells[COL[c]] || 0) + 1;
          const g = gpsReview(r, p.id, country, compat, b.bl), s = rowLine(g, dateCell, compat), t = g.date;
          if (typeof t === 'string' && t !== 'undefined') { if (lo === null || t < lo) lo = t; if (hi === null || t > hi) hi = t; }
          lone += (s.match(LONE) || []).length;
          out.write((bulk && first ? '' : '\n') + pre + s); first = false;
        };
        if (compat) p.x.smar.forEach(line); else p.x.src.each((r) => { if (!r.x && k < p.x.cap) { k++; line(r); } });
        if (bulk) out.write('\n');
        // the file's review date range (stress F9): its oldest and newest dateReviewed as written, so a report copies it
        // (never computes it); newestReviewDaysOld = whole days from the newest review to the end of the run
        if (hi) Object.assign(p.x.rep, { oldestReview: lo, newestReview: hi }, run.finishedUTC ? { newestReviewDaysOld: Math.max(0, Math.floor((Date.parse(run.finishedUTC) - Date.parse(hi)) / 864e5)) } : {});
      }
      csv = out.end();
      if (o.open) csv = null;
    }
    const compatExact = { ok: !reasons.length, reasons };
    if (lone) problems.push(lone + ' lone surrogate character(s) are written as U+FFFD');
    for (const id in blankedColumns) if (o.deliverAnyway && !READY) problems.push(id + ': --deliver-anyway wrote "undefined" in every row of ' + blankedColumns[id].join(', '));
    const summary = { skill: 'smar-playstore-agent', version: VERSION, runner: o.runner || 'shell', mode: 'reviews',
      run: { ids: run.opts.ids, bulk, country, compat, limit: run.opts.limit, all: run.opts.all, fromResultsTable: run.opts.fromResultsTable, sort: 'NEWEST' },
      rows: rowsOut, READY_TO_DELIVER: READY, incomplete: finished ? undefined : true, problems, NEXT: '', apps, compatFileReproducible: Object.assign({}, compatExact, { means: compat ? 'whether this --smar-compat file was built with SMAR\'s exact formatting/quirks; live store churn between fetches can still differ' : 'whether a --smar-compat run would reproduce SMAR\'s file; it does NOT mean this default file matches SMAR\'s (see apps: smarPadRows, smarDroppedRows, msQuirkRows)' }), csvName,
      smarWouldDownload: bulk ? !smarFail.length && parts.every((p) => p.a.stop !== 'ineligible') : undefined,
      quarantinedCells, blankedColumns: Object.keys(blankedColumns).length ? blankedColumns : undefined, legacyScore0Rows: legacyScore0Rows || undefined,
      deliveredAnyway: o.deliverAnyway && !READY ? true : undefined, pathOverrides: run.opts.paths,
      startedUTC: run.startedUTC, finishedUTC: run.finishedUTC };
    Object.defineProperty(summary, 'fileWritten', { value: hasFile }); // nextStep: a deliver-anyway that wrote a file (not serialized)
    return { csv, csvName, rows: rowsOut, summary, compatExact, READY };
  }
  // NEXT token (PLAN sec. 3.6) from a summary; cmd = {resume, heal(ids), deliver} built by the runner
  function nextStep(sm, cmd) {
    const drifted = sm.apps.filter((a) => a.drift), countDrift = drifted.filter((a) => a.drift.indexOf('reviewCount') >= 0);
    if (sm.incomplete) return 'RESUME: ' + cmd.resume;
    if (sm.READY_TO_DELIVER) return 'DELIVER';
    if (sm.deliveredAnyway && sm.fileWritten !== false) return 'DELIVERED_ANYWAY: blankedColumns are "undefined"; deliver it as not cross-checked, name each and why; do not heal or re-run.';
    if (countDrift.length) return 'HEAL: ' + cmd.heal(countDrift.map((a) => a.appId));
    if (drifted.length) return 'STOP: Google changed the review data layout (' + drifted.map((a) => a.appId + ': ' + a.drift.join(',')).join('; ') + '); tell the user and do not deliver without their OK.';
    const ws = sm.apps.filter((a) => a.stop === 'wrong-storefront');
    if (ws.length) return 'STOP: Google served the wrong storefront for ' + ws.map((a) => a.appId).join(',') + ' (not ' + sm.run.country + '); tell the user.';
    if (sm.apps.some((a) => /^error/.test(a.stop || ''))) return 'STOP: ' + sm.problems.join('; ');
    return 'STOP: ' + (sm.problems[0] || 'no reviews to deliver') + '.';
  }
  function relogText(run, sm, out) {
    return ['Reproducibility log - written by the smar-playstore-agent skill (reviews_play.js ' + VERSION + '), not by smar-tool.org',
      'date_time (UTC): ' + run.finishedUTC, 'store: Google Play Store', 'country: ' + run.opts.country, 'appIds: ' + run.opts.ids.join(','),
      'sort: NEWEST (Recency)', 'request: google-play-scraper 9.2.0 reviews() equivalent (batchexecute UsvDTd, 150 per page, hl=en)',
      'num_reviews: ' + sm.apps.map((a) => a.appId + '=' + a.fetched + ' (count ' + a.count + ', SMAR limit ' + a.smarLimit + ')').join(', '),
      'smar_compat: ' + !!sm.run.compat, 'path_overrides: ' + JSON.stringify(run.opts.paths || {}), 'csv: ' + (out || '-')].join('\n') + '\n';
  }

  const api = { VERSION, RPC, PAGE_SIZE, MAX_REVIEWS, ELIGIBLE_BELOW, HEADER, KEYS, bind, endpoint, body, parseBatch, checkRaw, storeRow, fmtDate,
    gpsReview, headerLine, rowLine, smarReplay, smarHave, smarLimit, normOpts, sig, newRun, initApp, stepApp, advance, appReport, outputs,
    nextStep, relogText, source: () => smarReviews.toString() };

  // ================= Node CLI =================
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    if (require.main === module) main();
    else try { bind(require('./extract_play.js')); } catch (e) { /* library use: call api.bind(S) */ }
  } else if (typeof window !== 'undefined') root.SMAR_REVIEWS = browserApi();

  function main() {
    const fs = require('fs'), path = require('path');
    let printed = false, release = null, run = null, statePath = null, out = null;
    const F = require('./fsutil.js'), fit = (o) => F.fitLine(o, 1500); // Node-only helpers (not in the browser bundle)
    const emit = (o, code) => { if (!printed) { printed = true; process.stdout.write(JSON.stringify(fit(o)) + '\n'); } if (release) { try { release(); } catch (e) { /* ignore */ } } process.exit(code); };
    const fail = (e, code, extra) => { const o = Object.assign({ skill: 'smar-playstore-agent', version: VERSION, mode: 'reviews', error: { code: e.code || 'ERROR', message: String(e.message || e).slice(0, 2000) } }, extra); if (code === 2 && !o.NEXT) o.NEXT = F.REVIEWS_NEXT.usage; return emit(o, code); };
    const crash = (e) => { try { if (run && statePath) F.atomicWriteJson(statePath, run); } catch (x) { /* best effort */ }
      fail(e, 5, { crash: true, resumeWith: run ? resumeCmd() : undefined, NEXT: 'STOP: the reviews script crashed; give the user error.message' + (run ? ' and resumeWith' : '') + '.' }); };
    process.on('uncaughtException', crash); process.on('unhandledRejection', crash);
    const compact = (sm) => F.reviewsLine(sm, 1500); // stdout of a finished run (step 4); the rest is in summaryFile
    const USAGE = F.REVIEWS_USAGE, argv = process.argv.slice(2), A = F.reviewsArgs(argv), { pos, f, notes } = A;
    if (A.bad) return fail(usage(A.bad), 2, { usage: USAGE, NEXT: A.next });
    try { bind(require('./extract_play.js')); } catch (e) { return fail(e, 2); }
    try { out = F.outFile(pos[1], f['deliver-anyway'], notes); } catch (e) { return fail(e, 2, e.bare ? undefined : { usage: USAGE }); } // OUT_DIR: mkdir -p here, never by the agent
    const base = out.replace(/\.csv$/i, ''), rowsPath = (id) => F.rowsFile(out, id);
    statePath = out + '.state.json';
    let opts;
    try {
      let paths = {};
      if (f.paths) paths = JSON.parse(fs.readFileSync(path.resolve(f.paths), 'utf8'));
      opts = normOpts({ ids: pos[0], bulk: f.bulk, country: f.country, limit: f.limit, all: f.all, fromResultsTable: f['from-results-table'], force: f.force, compat: f['smar-compat'], paths });
      S.usePaths(opts.paths);
    } catch (e) { return fail(e.code ? e : usage(String(e.message || e)), 2, { usage: USAGE, NEXT: 'STOP: fix the command (' + (e.message || e) + ').' }); }
    const resumeCmd = () => F.resumeCmd(__filename, argv);
    try { release = F.lock(out); } catch (e) {
      if (e.code === 'LOCKED') return fail(e, 4, { NEXT: 'STOP: another run is writing ' + out + '; do not start a second one.' });
      throw e;
    }
    const untilDone = !!f['until-done'], t0 = Date.now(), deadline = f['max-seconds'] ? t0 + Number(f['max-seconds']) * 1000 : untilDone ? t0 + 540000 : Infinity;
    // at most one short progress line per minute on stderr (stdout stays one JSON object)
    if (untilDone) F.ticker(t0, () => [run.opts.ids.filter((id) => run.apps[id].phase !== 'done').length, run.opts.ids.reduce((k, id) => k + run.apps[id].uniq, 0)]);
    if (fs.existsSync(statePath) && !f.resume && !f.force) return fail(usage('a progress file exists for ' + out), 2, { NEXT: 'STOP: add --resume to continue that run, or use a new OUT file.' });
    if (f.resume && fs.existsSync(statePath)) {
      const rs = F.readReviewsState(statePath); // unreadable, older or foreign: exit 2, STOP to a NEW output file
      if (rs.bad) return fail(usage(rs.bad), 2, { NEXT: F.REVIEWS_NEXT.badState(statePath) });
      run = rs.run;
      if (sig(run.opts) !== sig(opts)) { const o2 = run.opts; run = null; return fail(usage('--resume with different ids/country/limit/paths than the saved run (' + sig(o2) + ')'), 2, { NEXT: 'STOP: use the identical command, or a fresh output file.' }); }
      for (const id of run.opts.ids) {
        const kept = F.truncateJsonl(rowsPath(id), run.apps[id].lines, F.rowsCheck(run.apps[id].pages));
        if (kept < run.apps[id].lines) { // rows lost, cut or damaged outside this run's writes: that app is fetched again from the start
          notes.push(id + ': the rows file had ' + kept + ' of ' + run.apps[id].lines + ' rows; fetched that app again');
          run.apps[id] = newRun(run.opts, t0).apps[id]; run.finishedUTC = null;
          F.atomicWrite(rowsPath(id), ''); F.atomicWriteJson(statePath, run);
        }
      }
    } else {
      if (f['deliver-anyway']) return fail(usage('nothing to deliver: no finished run for ' + out), 2);
      if (f.resume) notes.push('no progress file found: started a new run');
      run = newRun(opts, t0);
      for (const id of run.opts.ids) F.atomicWrite(rowsPath(id), '');
      F.atomicWriteJson(statePath, run);
    }
    const seenCache = {};
    // the stored rows, streamed from the rows file (never all in memory); a file shorter than the state is an error
    const rowsSrc = (id) => ({ n: run.apps[id].lines, each: (fn) => { const k = F.eachJsonl(rowsPath(id), run.apps[id].lines, fn).lines; if (k < run.apps[id].lines) throw err(rowsPath(id) + ' has ' + k + ' of ' + run.apps[id].lines + ' rows', 'ROWS_SHORT'); } });
    const store = {
      save: async (r) => { r.rev++; F.atomicWriteJson(statePath, r); },
      commit: async (r, id, p, rows) => { if (rows.length) fs.appendFileSync(rowsPath(id), rows.map((x) => JSON.stringify(x) + '\n').join('')); r.rev++; F.atomicWriteJson(statePath, r); },
      seen: async (r, id) => { if (seenCache[id] && seenCache[id].lines === r.apps[id].lines) return seenCache[id]; const s = seenSet([], r.apps[id].lines); rowsSrc(id).each((o) => s.add(o.id)); return (seenCache[id] = s); },
    };
    const net = Object.assign({ base: 'https://play.google.com', init: { redirect: 'follow' } }, Number.isFinite(deadline) ? { deadline } : {}); // retries never sleep past the cap
    const io = { get: S.makeGet(globalThis.fetch, net), post: S.makePost(globalThis.fetch, net), now: () => Date.now(), sleep: (ms) => new Promise((z) => setTimeout(z, ms)) };
    const cmd = { resume: resumeCmd(), heal: (ids) => 'node ' + path.join(__dirname, 'heal.js') + ' reviews --ids ' + ids.join(',') + ' --country ' + opts.country };
    const finalize = (extra) => {
      const rowsByApp = {}; for (const id of run.opts.ids) rowsByApp[id] = rowsSrc(id);
      const files = { final: out, not_ready: base + '.NOT_READY.csv' };
      const o = outputs(run, rowsByApp, { compat: opts.compat, deliverAnyway: !!f['deliver-anyway'], runner: 'shell', open: (name) => F.atomicStream(files[name]) });
      const sm = Object.assign(o.summary, extra || {});
      if (notes.length) sm.notes = notes;
      if (o.csvName) { sm.csv = files[o.csvName]; if (o.csvName === 'final' && fs.existsSync(files.not_ready)) fs.unlinkSync(files.not_ready); }
      sm.relog = base + '_relog.txt'; F.atomicWrite(sm.relog, relogText(run, sm, sm.csv));
      sm.summaryFile = base + '.summary.json';
      sm.seconds = +((Date.now() - t0) / 1000).toFixed(1);
      sm.NEXT = nextStep(sm, cmd);
      F.atomicWrite(sm.summaryFile, JSON.stringify(sm, null, 1) + '\n'); // pretty: an agent reads it
      emit(compact(sm), 0);
    };
    if (f['deliver-anyway']) { // an unfinished run has nothing to deliver: refused, nothing written
      if (!run.opts.ids.every((id) => run.apps[id].phase === 'done')) return emit({ skill: 'smar-playstore-agent', version: VERSION, mode: 'reviews', incomplete: true, refused: '--deliver-anyway needs a finished run; this run is not finished, so nothing was written. Run resumeWith (without --deliver-anyway) until it finishes.', resumeWith: resumeCmd(), NEXT: 'RESUME: ' + resumeCmd(), READY_TO_DELIVER: false, notes: notes.length ? notes : undefined }, 3);
      return finalize();
    }
    (async () => {
      for (;;) {
        let r;
        try { r = await advance(run, io, store, { pages: Infinity, deadline }); } catch (e) {
          const code = e.code || 'ERROR';
          return fail(e, 1, { resumeWith: resumeCmd(), NEXT: /^(SORRY|CONSENT|INTERSTITIAL|RATE_LIMITED)$/.test(code)
            ? 'STOP: Google is rate-limiting or showing an interstitial (' + code + '); tell the user; later run: ' + resumeCmd() : 'RESUME: ' + resumeCmd() });
        }
        if (r.done) return finalize();
        if (r.budget || Date.now() >= deadline) {
          const left = run.opts.ids.filter((id) => run.apps[id].phase !== 'done');
          return emit({ skill: 'smar-playstore-agent', version: VERSION, mode: 'reviews', incomplete: true, remaining: left.length,
            remainingApps: left, rowsSoFar: run.opts.ids.reduce((s, id) => s + run.apps[id].uniq, 0), resumeWith: resumeCmd(), NEXT: 'RESUME: ' + resumeCmd(), READY_TO_DELIVER: false, notes: notes.length ? notes : undefined }, 3);
        }
        if (untilDone && Date.now() + 45000 < deadline) { await new Promise((z) => setTimeout(z, 15000)); continue; } // failed apps: retried (each up to APP_ATTEMPTS)
        if (r.failed.every((id) => run.apps[id].attempts > 0)) {
          const errs = r.failed.map((id) => id + ': ' + JSON.stringify(run.apps[id].error));
          return fail(err('some apps failed this pass: ' + errs.join('; '), 'APP_FAILED'), 1, { resumeWith: resumeCmd(), NEXT: 'RESUME: ' + resumeCmd() });
        }
      }
    })();
  }

  // ================= Browser (Claude in Chrome on a play.google.com tab; IndexedDB) =================
  function browserApi() {
    const DB = 'smar_reviews_v3', OS = 'kv', ORIGIN = 'https://play.google.com', seenCache = {};
    const db = () => new Promise((res, rej) => { const q = indexedDB.open(DB, 1); q.onupgradeneeded = () => q.result.createObjectStore(OS); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    async function tx(mode, fn) {
      const d = await db();
      return new Promise((res, rej) => {
        const t = d.transaction(OS, mode), s = t.objectStore(OS); let out;
        Promise.resolve(fn(s, (v) => { out = v; })).catch((e) => { rej(e); try { t.abort(); } catch (x) { /* already finished */ } });
        t.oncomplete = () => res(out);
        t.onerror = t.onabort = () => rej(t.error && t.error.name === 'QuotaExceededError' ? err('browser storage is full', 'STORAGE_FULL') : t.error || err('IndexedDB transaction aborted', 'SUPERSEDED'));
      });
    }
    const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const getRun = () => tx('readonly', async (s, set) => set(await req(s.get('run'))));
    function guard() {
      if (typeof location === 'undefined' || location.origin !== ORIGIN) throw usage('open a https://play.google.com tab first (this tab: ' + (typeof location !== 'undefined' ? location.href : '?') + ')');
      bind(root.SMAR);
    }
    // CAS: write only if the stored run is the one this step loaded (an orphaned step can never overwrite)
    // plain string keys and single-key requests only (no key ranges / array keys): works on any IndexedDB
    const rowKey = (runId, id, p) => 'rows|' + runId + '|' + id + '|' + p;
    const casPut = (run, extra) => tx('readwrite', async (s) => {
      const cur = await req(s.get('run'));
      if (!cur || cur.runId !== run.runId || cur.rev !== run.rev) throw err('another step() or start() changed this run', 'SUPERSEDED');
      if (extra) s.put(extra.rows, rowKey(run.runId, extra.id, extra.p));
      run.rev++; s.put(run, 'run');
    });
    const loadRows = (run, id) => tx('readonly', async (s, set) => {
      const n = run.apps[id].pages.length, gets = [];
      for (let p = 0; p < n; p++) gets.push(req(s.get(rowKey(run.runId, id, p))));
      set([].concat.apply([], (await Promise.all(gets)).map((x) => x || [])).slice(0, run.apps[id].lines));
    });
    const store = {
      save: (run) => casPut(run),
      commit: (run, id, p, rows) => casPut(run, { id, p, rows }),
      seen: async (run, id) => { const k = run.runId + '|' + id, c = seenCache[k]; return c && c.lines === run.apps[id].lines ? c : (seenCache[k] = seenSet(await loadRows(run, id), run.apps[id].lines)); },
    };
    const net = { base: '', init: { credentials: 'omit', cache: 'no-store', redirect: 'manual' } };
    const io = () => ({ get: S.makeGet(root.fetch.bind(root), net), post: S.makePost(root.fetch.bind(root), net), now: () => Date.now(), sleep: (ms) => new Promise((z) => setTimeout(z, ms)) });
    const B = { resume: 'await SMAR_REVIEWS.step(10)', heal: (ids) => '(shell mode) node <SKILL>/scripts/heal.js reviews --ids ' + ids.join(',') };
    async function report(run, deliverAnyway) {
      const rowsByApp = {}; for (const id of run.opts.ids) rowsByApp[id] = await loadRows(run, id);
      const o = outputs(run, rowsByApp, { runner: 'browser', compat: run.opts.compat, deliverAnyway });
      o.summary.NEXT = nextStep(o.summary, B);
      return o;
    }
    return {
      VERSION, api,
      async start(o) {
        guard();
        const opts = normOpts(o);
        S.usePaths(opts.paths);
        const old = await getRun();
        if (old && old.v === 3 && sig(old.opts) === sig(opts) && !o.force) return { resumed: true, done: !!old.finishedUTC, run: { ids: old.opts.ids, country: old.opts.country } };
        if (old && old.v === 3 && (!old.finishedUTC || !old.downloaded) && !o.force) throw usage('another reviews run (' + old.opts.ids.join(',') + ') is unfinished or not downloaded; finish it, or pass force:true to discard it');
        const run = newRun(opts, Date.now());
        await tx('readwrite', async (s) => {
          if (old && old.runId && old.apps) for (const id of Object.keys(old.apps)) for (let p = 0; p < (old.apps[id].pages || []).length; p++) s.delete(rowKey(old.runId, id, p));
          s.put(run, 'run');
        });
        return { started: true, run: { ids: opts.ids, country: opts.country, compat: opts.compat } };
      },
      async step(n) {
        guard();
        const body = async () => {
          const run = await getRun();
          if (!run || run.v !== 3) return { error: 'call start() first' };
          try {
            const r = await advance(run, io(), store, { pages: n || 10, deadline: Date.now() + 20000 });
            const left = run.opts.ids.filter((id) => run.apps[id].phase !== 'done');
            return { done: r.done, remaining: left.length, rowsSoFar: run.opts.ids.reduce((s2, id) => s2 + run.apps[id].uniq, 0), NEXT: r.done ? 'await SMAR_REVIEWS.status()' : 'await SMAR_REVIEWS.step(' + (n || 10) + ')' };
          } catch (e) {
            if (e.code === 'SUPERSEDED') return { superseded: true, NEXT: 'call step() again' };
            if (e.code === 'STORAGE_FULL') return { fatal: 'storage full', hint: 'free browser storage or use shell mode' };
            return { fatal: e && e.message ? e.message : JSON.stringify(e), code: (e && e.code) || 'ERROR', NEXT: /^(SORRY|CONSENT|INTERSTITIAL|RATE_LIMITED)$/.test(e.code || '') ? 'STOP: Google is rate-limiting or showing an interstitial; tell the user.' : 'await SMAR_REVIEWS.step(' + (n || 10) + ')' };
          }
        };
        if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request('__smar_reviews_step', { ifAvailable: true }, (lock) => (lock ? body() : { busy: true, retryAfterMs: 5000, note: 'another step() is running' }));
        return body();
      },
      async status() { guard(); const run = await getRun(); if (!run) return null; return (await report(run)).summary; },
      async download(name, opt) {
        guard();
        const run = await getRun();
        if (!run || !run.finishedUTC) return { refused: 'the run is not finished: keep calling step()' };
        const deliverAnyway = !!(opt && opt.deliverAnyway), oo = await report(run, deliverAnyway);
        if (oo.csv == null) return { refused: 'no file: ' + (oo.summary.problems.join('; ') || JSON.stringify(oo.compatExact.reasons)), compatExact: oo.compatExact };
        if (!oo.READY && !deliverAnyway) return { refused: 'READY_TO_DELIVER is false; ask the user, then download(name, {deliverAnyway:true})', NEXT: oo.summary.NEXT };
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([oo.csv], { type: 'text/csv;charset=utf-8' }));
        a.download = name || (run.opts.bulk ? 'reviews_bulk' : run.opts.ids[0] + '_reviews') + '.csv';
        document.body.appendChild(a); a.click(); a.remove();
        run.downloaded = true; await casPut(run).catch(() => {});
        return { downloaded: a.download, rows: oo.rows, compatExact: oo.compatExact, run: { ids: run.opts.ids, country: run.opts.country } };
      },
      source: () => smarReviews.toString(),
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
