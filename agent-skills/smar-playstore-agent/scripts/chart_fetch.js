// SMAR top charts v3: gps 9.2.0 list()'s vyAe2 request + ranked ids; transport = S.makePost.
(function smarChart(root) {
  'use strict';
  const VERSION = '3.1.0';
  const CLUSTER = { TOP_FREE: 'topselling_free', TOP_PAID: 'topselling_paid', GROSSING: 'topgrossing' };
  const LEGACY = {}; for (const k in CLUSTER) LEGACY[CLUSTER[k]] = k;
  // gps categories; '' = APPLICATION
  const CATEGORIES = ('APPLICATION ANDROID_WEAR ART_AND_DESIGN AUTO_AND_VEHICLES BEAUTY BOOKS_AND_REFERENCE BUSINESS COMICS ' +
    'COMMUNICATION DATING EDUCATION ENTERTAINMENT EVENTS FINANCE FOOD_AND_DRINK HEALTH_AND_FITNESS HOUSE_AND_HOME ' +
    'LIBRARIES_AND_DEMO LIFESTYLE MAPS_AND_NAVIGATION MEDICAL MUSIC_AND_AUDIO NEWS_AND_MAGAZINES PARENTING PERSONALIZATION ' +
    'PHOTOGRAPHY PRODUCTIVITY SHOPPING SOCIAL SPORTS TOOLS TRAVEL_AND_LOCAL VIDEO_PLAYERS WATCH_FACE WEATHER GAME').split(' ')
    .concat(('ACTION ADVENTURE ARCADE BOARD CARD CASINO CASUAL EDUCATIONAL MUSIC PUZZLE RACING ROLE_PLAYING SIMULATION SPORTS ' +
      'STRATEGY TRIVIA WORD').split(' ').map((g) => 'GAME_' + g), 'FAMILY');
  const MAX_APPS_COUNT = 1000000;
  // list.js getBodyForRequests, byte-identical
  const FIELD_MASK = [64,1,195,71,8,72,9,10,11,139,12,16,145,148,150,151,152,27,30,31,96,32,34,163,100,165,104,169,108,110,113,55,56,57,122];
  const G_IDS = [1,31,104,9,8,27,12,65,110,88,11,56,55,96,10,122,72,71,64,113,139,150,169,165,151,163,32,16,108,100];
  const G_FIELDS = [[7,[1,73,96,103,97,58,50,92,52,112,69,19,31,101,123,74,49,80,38,20,10,14,79,43,42,139]],
    [9,[1,7,9,24,12,31,5,15,27,8,13,10]], [17,[1,7,9,25,13,31,5,41,27,8,14,10]], [10,[1,7,6,9]],
    [1,[1,5,14,38,19,29,34,4,12,11,6,30,43,40,42,16,10,7]], [4,[1,3,5,4,7,6,11,19,21,17,15,12,16,20]],
    [3,[1,5,14,4,10,17]], [2,[1,5,7,4,13,16,12,18]]];
  const B2 = '[[[true],null,[[null,[]]],null,null,null,null,[null,2],null,null,null,null,null,null,[1],null,null,null,null,null,null,null,[1]],' +
    '[null,[[null,[]]]],[null,[[null,[]]],null,[true]],[null,[[null,[]]]],null,null,null,null,[[[null,[]]]],[[[null,[]]]]]';
  const GPS_AT = 'AFSRYlx8XZfN8-O-IKASbNBDkB6T:1655531200971'; // stale
  const PATH = '/_/PlayStoreUi/data/batchexecute?rpcids=vyAe2&source-path=%2Fstore%2Fapps&f.sid=-4178618388443751758' +
    '&bl=boq_playuiserver_20220612.08_p0&authuser=0&soc-app=121&soc-platform=1&soc-device=1&_reqid=82003&rt=c';
  const PATHS = { apps: [0, 1, 0, 28, 0], appId: [0, 0, 0], title: [0, 3], iap: [0, 29, 0] }; // list.js; iap: each rank's in-app range (listing anchor)

  const get = (o, p) => { let x = o; for (const k of p) { if (x == null) return undefined; x = x[k]; } return x; };
  const isPkg = (s) => typeof s === 'string' && /^[A-Za-z]\w*(\.\w+)+$/.test(s);
  const hasPkg = (x) => (Array.isArray(x) ? x.some(hasPkg) : isPkg(x));
  function fail(msg, code) { const e = new Error(msg); e.code = code; if (code === 'SORRY' || code === 'CONSENT') e.name = 'RateLimited'; return e; }

  // USAGE before any network call
  function normalize(opts) {
    const o = Object.assign({}, opts || {});
    const c = String(o.collection == null || o.collection === '' ? 'TOP_FREE' : o.collection).trim();
    o.collection = LEGACY[c.toLowerCase()] || c.toUpperCase();
    if (!CLUSTER[o.collection]) throw fail('Invalid collection ' + c + ' (TOP_FREE|TOP_PAID|GROSSING)', 'USAGE');
    o.category = String(o.category || 'APPLICATION').trim().toUpperCase();
    if (CATEGORIES.indexOf(o.category) < 0) throw fail('Invalid category ' + o.category + ' (references/top_charts.md)', 'USAGE');
    o.num = o.num == null || o.num === '' ? MAX_APPS_COUNT : Number(o.num);
    if (!Number.isInteger(o.num) || o.num < 1) throw fail('Invalid num ' + opts.num, 'USAGE');
    o.country = String(o.country || 'US').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(o.country)) throw fail('Invalid country ' + opts.country, 'USAGE');
    return o;
  }

  const url = (o) => PATH + '&hl=en&gl=' + o.country;
  function buildBody(o) {
    const groups = [];
    for (const [g, f] of G_FIELDS) for (const id of G_IDS) groups.push([[g, id], [f]]);
    const inner = '[[null,[[8,[20,' + o.num + ']],true,null,' + JSON.stringify(FIELD_MASK) + ',[null,null,' + B2 + ',[' +
      JSON.stringify(groups) + ']],null,null,[[[1,2],[10,8,9],[],[]]]],' + JSON.stringify([2, CLUSTER[o.collection], o.category]) + ']]';
    const at = o.at === undefined ? GPS_AT : o.at; // false omits
    return 'f.req=' + encodeURIComponent(JSON.stringify([[['vyAe2', inner, null, 'generic']]])) + (at ? '&at=' + encodeURIComponent(at) + '&' : '');
  }

  // false, or why SMAR's list() throws (HTTP 500)
  function smarListWouldThrow(text) {
    let d;
    try { d = JSON.parse(JSON.parse(String(text).split('\n')[3])[0][2]); } catch (e) { return 'list_parse'; }
    const apps = get(d, PATHS.apps);
    return apps == null ? 'no_app_list' : (typeof apps.map !== 'function' ? 'app_list_not_array' : false);
  }

  // ok:false = drift/RPC error, not empty; healed => not READY
  function parseResponse(text) {
    const res = (o) => Object.assign({ ok: false, empty: false, ids: [], titles: [], iap: [], pathUsed: 'none', healed: false, smarListWouldThrow: smarListWouldThrow(text) }, o);
    const done = (items, o) => res(Object.assign({ ok: true, ids: items.map((it) => get(it, PATHS.appId)), titles: items.map((it) => get(it, PATHS.title)), iap: items.map((it) => get(it, PATHS.iap)) }, o));
    let env;
    for (const line of String(text).split('\n')) {
      if (line[0] !== '[') continue;
      let j; try { j = JSON.parse(line); } catch (e) { continue; }
      if (Array.isArray(j)) for (const e of j) if (Array.isArray(e) && e[0] === 'wrb.fr' && e[1] === 'vyAe2') env = e;
    }
    if (!env) return res({ why: 'no wrb.fr/vyAe2 envelope' });
    if (env[2] == null) return res({ why: env[5] != null ? 'RPC error ' + JSON.stringify(env[5]).slice(0, 160) : 'null vyAe2 payload' });
    let d; try { d = JSON.parse(env[2]); } catch (e) { return res({ why: 'vyAe2 payload is not JSON' }); }
    const ok = (a) => Array.isArray(a) && a.length > 0 && a.every((it) => isPkg(get(it, PATHS.appId)));
    if (ok(get(d, PATHS.apps))) return done(get(d, PATHS.apps), { pathUsed: 'PATHS.apps' });
    // 'no chart': [[null,null,null,[],false,[tok]]]
    if (get(d, [0, 1]) == null && !hasPkg(d)) return res({ ok: true, empty: true, pathUsed: 'empty' });
    let best = null; // heal: longest id array
    (function walk(x, p) {
      if (!Array.isArray(x)) return;
      if (ok(x) && (!best || x.length > best.items.length)) best = { items: x, path: p };
      x.forEach((y, i) => walk(y, p.concat(i)));
    })(d, []);
    if (!best) return res({ why: 'cluster present, no app list at PATHS.apps or by heal (layout drift)' });
    return done(best.items, { healed: true, pathUsed: 'healed:' + JSON.stringify(best.path) });
  }

  function guardResponse(r) {
    const text = r && typeof r.text === 'string' ? r.text : '', u = String((r && r.url) || '');
    if (!r || r.status !== 200) throw fail('vyAe2 HTTP ' + (r && r.status), 'HTTP_' + (r && r.status));
    if (/^\s*\)\]\}'/.test(text)) return text;
    if (/\/sorry\//.test(u) || /unusual traffic/i.test(text)) throw fail('Google /sorry page', 'SORRY');
    if (/consent\.google\./.test(u) || /action="https:\/\/consent\.google\./i.test(text)) throw fail('Google consent page', 'CONSENT');
    return text;
  }

  async function fetchChart(opts) {
    const o = normalize(opts);
    if (typeof (opts && opts.post) !== 'function') throw fail('fetchChart needs post = S.makePost(...)', 'USAGE');
    const p = parseResponse(guardResponse(await opts.post(url(o), buildBody(o), {})));
    p.ranksReturned = p.ids.length; p.allIds = p.ids.slice(); // all ranks gps list() loads
    if (p.ids.length > o.num) { p.ids = p.ids.slice(0, o.num); p.titles = p.titles.slice(0, o.num); p.iap = p.iap.slice(0, o.num); }
    return Object.assign(p, { collection: o.collection, category: o.category, num: o.num, country: o.country });
  }

  const api = { VERSION, CLUSTER, LEGACY, CATEGORIES, PATHS, GPS_AT, MAX_APPS_COUNT, normalize, url, buildBody, parseResponse,
    smarListWouldThrow, fetchChart, source: () => smarChart.toString() };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SMAR_CHART = api;
})(typeof window !== 'undefined' ? window : globalThis);
