// SMAR Play Store extractor v3: ONE shared implementation for shell (Node: require) and browser (window.SMAR).
// Parsing, validation, heal, formatting, SMAR-compat, HTTP policy and the run engine all live here, so the
// runners stay thin. The agent never types a value: it runs the engine, reads summarize() and follows NEXT.
(function smarExtract(root) {
  'use strict';
  const VERSION = '3.1.0', BASE = 'https://play.google.com';
  // Evidence switches the Gate may flip (PLAN C10 / risk 5): VARY marker rendering, countries verified by V5.
  const VARY_STATUS = 'unconfirmed', VERIFIED_COUNTRIES = ['US'];
  // scrapedFrom of an ids/rerun row nobody labelled (stress F8): SMAR has no id-list mode, so these rows say where they
  // came from; a --smar-compat file writes "keyword search", the label SMAR gives a package-id search (appIdQuery)
  const IDS_LABEL = 'app id list';
  // compatFileReproducible.means of a --smar-compat summary (stress F10): never a byte-identity claim against a live SMAR run
  const COMPAT_MEANS = 'whether this --smar-compat file is built with SMAR\'s exact row set, formatting and known bugs from the pages this run fetched. It is not a comparison with a live SMAR run: Google\'s results and values change between fetches (about 5% of similar-app rows differ between runs minutes apart, and SMAR\'s own runs differ from each other), so a SMAR file made at another time can still differ in rows and cells.';

  // ---------------------------------------------------------------- errors (callers branch on err.code)
  class RateLimited extends Error { constructor(m, code) { super(m); this.name = 'RateLimited'; this.code = code || 'RATE_LIMITED'; } }
  class Superseded extends Error { constructor(m) { super(m || 'superseded: another step() owns this run'); this.name = 'Superseded'; this.code = 'SUPERSEDED'; } }
  const E = (code, m) => Object.assign(new Error(m), { code });

  // ---------------------------------------------------------------- X7 paths, labels
  const PATHS = {
    title: [1, 2, 0, 0], descriptionHTML: [1, 2, 72, 0, 1], summary: [1, 2, 73, 0, 1],
    installsText: [1, 2, 13, 0], minInstalls: [1, 2, 13, 1], maxInstalls: [1, 2, 13, 2],
    score: [1, 2, 51, 0, 1], ratings: [1, 2, 51, 2, 1], reviews: [1, 2, 51, 3, 1],
    price: [1, 2, 57, 0, 0, 0, 0, 1, 0, 0], currency: [1, 2, 57, 0, 0, 0, 0, 1, 0, 1],
    originalPrice: [1, 2, 57, 0, 0, 0, 0, 1, 1, 0], discountEndDate: [1, 2, 57, 0, 0, 0, 0, 14, 1],
    offersIAPRange: [1, 2, 19, 0], androidVersionText: [1, 2, 140, 1, 1, 0, 0, 1],
    developer: [1, 2, 68, 0], developerLink: [1, 2, 68, 1, 4, 2], developerEmail: [1, 2, 69, 1, 0],
    developerWebsite: [1, 2, 69, 0, 5, 2], developerAddress: [1, 2, 69, 4, 2, 0], privacyPolicy: [1, 2, 99, 0, 5, 2],
    genreId: [1, 2, 79, 0, 0, 2], icon: [1, 2, 95, 0, 3, 2], contentRating: [1, 2, 9, 0], adSupported: [1, 2, 48],
    released: [1, 2, 10, 0], version: [1, 2, 140, 0, 0, 0], recentChanges: [1, 2, 144, 1, 1], available: [1, 2, 18, 0],
    updatedText: [1, 2, 145, 0, 0],
  };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const freeze = (o) => { for (const v of Object.values(o)) if (v && typeof v === 'object') freeze(v); return Object.freeze(o); };
  const DEFAULT_PATHS = freeze(clone(PATHS));
  const DEFAULT_LABELS = freeze({ iap: ['In-app purchases'], ads: ['Contains ads'] });
  const LABELS = { iap: DEFAULT_LABELS.iap.slice(), ads: DEFAULT_LABELS.ads.slice() };
  const COL2PATH = { appName: 'title', description: 'summary', approximateInstalls: 'maxInstalls', avgRating: 'score', totalRatings: 'ratings', totalReviews: 'reviews', developerId: 'developerLink', privacyPolicyURL: 'privacyPolicy', originalReleaseDate: 'released', currentAppVersion: 'version', androidMinVersion: 'androidVersionText', currentVersionChanges: 'recentChanges', inAppPurchases: 'offersIAPRange', inAppPurchasesPriceRange: 'offersIAPRange', inAppAdvertisements: 'adSupported', downloadable: 'available' };
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const fieldKey = (n) => (own(DEFAULT_PATHS, n) ? n : own(COL2PATH, n) ? COL2PATH[n] : undefined);
  function canonOverride(o) {
    if (o == null) return {};
    if (typeof o !== 'object' || Array.isArray(o)) throw E('USAGE', 'paths override must be a JSON object {"<field>":[indices]}');
    const c = {};
    for (const k of Object.keys(o).sort()) {
      if (!own(DEFAULT_PATHS, k)) throw E('USAGE', `unknown PATHS key "${k}"; known: ${Object.keys(DEFAULT_PATHS).join(',')}`);
      const p = o[k];
      if (!Array.isArray(p) || !p.length || !p.every((i) => Number.isInteger(i) && i >= 0)) throw E('USAGE', `path for "${k}" must be a non-empty array of non-negative integers (no string keys)`);
      if (JSON.stringify(p) !== JSON.stringify(DEFAULT_PATHS[k])) c[k] = p.slice();
    }
    return c;
  }
  // Rebuilds PATHS in place from the frozen defaults plus the validated override (an override never leaks).
  function usePaths(o) {
    const c = canonOverride(o);
    for (const k of Object.keys(PATHS)) delete PATHS[k];
    for (const k of Object.keys(DEFAULT_PATHS)) PATHS[k] = (c[k] || DEFAULT_PATHS[k]).slice();
    return c;
  }
  const canonPaths = (o) => JSON.stringify(canonOverride(o));
  function canonLabels(o) {
    if (o == null) return {};
    if (typeof o !== 'object' || Array.isArray(o)) throw E('USAGE', 'labels override must be {"iap":[..],"ads":[..]}');
    const c = {};
    for (const k of Object.keys(o).sort()) {
      if (!own(DEFAULT_LABELS, k)) throw E('USAGE', `unknown label key "${k}"; known: iap, ads`);
      const v = [].concat(o[k]);
      if (!v.length || !v.every((s) => typeof s === 'string' && s.trim() && s.length <= 40 && !/[<>]/.test(s))) throw E('USAGE', `labels.${k} must be plain strings of 40 characters or fewer (never a regex)`);
      if (JSON.stringify(v) !== JSON.stringify(DEFAULT_LABELS[k])) c[k] = v.slice();
    }
    return c;
  }
  function useLabels(o) { const c = canonLabels(o); for (const k of Object.keys(DEFAULT_LABELS)) LABELS[k] = (c[k] || DEFAULT_LABELS[k]).slice(); return c; }

  // ---------------------------------------------------------------- X1 JSPB-aware paths (C1)
  // A sparse JSPB array ends with an object whose numeric keys (all >= length) are 1-based field numbers.
  const jspbTail = (a) => { const t = a.length ? a[a.length - 1] : undefined; return t && typeof t === 'object' && !Array.isArray(t) && Object.keys(t).every((k) => /^\d+$/.test(k) && +k >= a.length) ? t : null; };
  function getRaw(o, p) { let x = o; for (const k of p) { if (x == null) return undefined; const t = Array.isArray(x) && typeof k === 'number' && k >= x.length - 1 ? jspbTail(x) : null; x = t ? t[String(k + 1)] : x[k]; } return x; }
  const getPath = (o, p) => { const v = getRaw(o, p); return v === null ? undefined : v; };
  const rpath = (o, p) => { let x = o; for (const k of p) { if (x == null) return undefined; x = x[k]; } return x; }; // ramda 0.21 R.path
  function findPaths(tree, pred, o) {
    const max = typeof o === 'number' ? o : (o && o.maxHits) || Infinity, hits = [];
    (function walk(x, p) {
      if (hits.length >= max) return;
      if (Array.isArray(x)) { const t = jspbTail(x); (t ? x.slice(0, -1) : x).forEach((y, i) => walk(y, p.concat(i))); if (t) for (const k of Object.keys(t)) walk(t[k], p.concat(+k - 1)); return; }
      if (x && typeof x === 'object') return; // not addressable by an integer path
      try { if (pred(x, p)) hits.push({ path: p, value: x }); } catch (e) { /* predicate errors = no hit */ }
    })(tree, []);
    return hits;
  }
  const up = (p, n) => p.slice(0, p.length - n);

  // ---------------------------------------------------------------- text helpers (cross-checks vs output)
  const ENT = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: '\u00a0' };
  const decEnt = (s) => (s == null ? s : String(s).replace(/&(#\d+|#x[0-9a-f]+|amp|quot|apos|lt|gt|nbsp);/gi, (m, e) => { if (e[0] !== '#') return ENT[e.toLowerCase()] || m; try { return String.fromCodePoint(/x/i.test(e[1]) ? parseInt(e.slice(2), 16) : +e.slice(1)); } catch (x) { return m; } }));
  const unesc = (s) => (typeof s !== 'string' ? s : s.replace(/<[^>]+>/g, '').replace(/\r?\n|\r/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
  const norm = (s) => (s == null ? '' : unesc(String(s).replace(/<br\s*\/?>/g, ' ')).replace(/\s+/g, ' ').trim());
  const pctDec = (s) => String(s).replace(/(?:%[0-9a-f]{2})+/gi, (m) => { try { return decodeURIComponent(m); } catch (e) { return m; } });
  const blank = (v) => v == null || v === '';
  const sameUrl = (a, b) => (blank(a) || blank(b) ? blank(a) === blank(b) : pctDec(decEnt(a)) === pctDec(decEnt(b)));
  // Exact SAR-backend jsonToCsv cleanText() minus its quote doubling (single pass; default output, C11).
  const smarClean = (s) => (typeof s !== 'string' ? s : s.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/<br\s*\/?>/g, ' ').replace(/\r?\n|\r/g, ' '));
  // Verbatim cleanText() (with quote doubling): compat and reviews serializers only.
  function smarCleanText(text) {
    if (typeof text !== 'string') return text;
    let t = text.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");
    t = t.replace(/"/g, '""');
    t = t.replace(/<br\s*\/?>/g, ' ');
    return t.replace(/\r?\n|\r/g, ' ');
  }
  const brief = (v) => { if (v === undefined) return undefined; const s = typeof v === 'string' ? v : JSON.stringify(v); return s && s.length > 80 ? s.slice(0, 79) + '…' : v; };
  const has = (v) => v != null && v !== '';
  const EMPTY = (v) => Array.isArray(v) && v[0] == null && Array.isArray(v[1]) && !v[1].length;
  // Known no-value shapes (corpus, 10,125 pages), each read where gps derives "VARY": the version box holds the [null,[]]
  // marker, or [null,null,[]] inside a present [140] block whose targetSdk sibling is valid; the Android box holds the
  // marker, or only an API level > 31 with no text (Wear OS and other apps Google ships without "Requires Android").
  const sdkOk = (n) => Number.isInteger(n) && n >= 14 && n <= 60;
  const versionNone = (r, a) => EMPTY(a.versionBox) || (r.version === undefined && a.versionBlock !== undefined && JSON.stringify(a.versionBox) === '[null,null,[]]' && sdkOk(a.targetSdk));
  const androidNone = (r, a) => EMPTY(a.androidBox) || (r.androidVersionText === undefined && Number.isInteger(a.androidApi) && a.androidApi > 31 && !own(ANDROID_API_NAMES, a.androidApi) && !hasStr(a.androidBox));
  const hasStr = (v) => (typeof v === 'string' ? v.trim() !== '' : v && typeof v === 'object' ? Object.values(v).some(hasStr) : false);
  const badgeMin = (b) => { const m = /^([\d.,]+)([KMB]?)\+$/i.exec(b || ''); return m ? Math.round(parseFloat(m[1].replace(/,/g, '')) * { '': 1, K: 1e3, M: 1e6, B: 1e9 }[m[2].toUpperCase()]) : NaN; };
  const nextBucket = (n) => (n <= 0 ? 1 : String(n)[0] === '1' ? n * 5 : n * 2);
  // A visible price ("$1,299.99", "₩4,400", "Rp 15.000", "CHF 1'299.00", "21,24 CZK", "9 999,99 kr", "₹1,00,000") in micros:
  // every reading its separators allow (grouping by "," "." "'" or a [no-break] space in groups of 3, or Indian 2s; the last
  // "." or "," a decimal point before 1-3 digits). Two readings only when the text itself is ambiguous ("₩4,400" or 4.4).
  const PRICE_SEP = /[.,'\u2019\u00a0\u202f ]/;
  const priceMicros = (s) => {
    const m = /\d(?:[\d.,'\u2019\u00a0\u202f ]*\d)?/.exec(String(s || '')); if (!m) return [];
    const t = m[0], parts = t.split(PRICE_SEP), seps = t.replace(/\d/g, '').split('');
    if (parts.some((p) => p === '')) return [];
    const grouped = (ps, ss) => ps.length === 1 || (ss.every((c) => c === ss[0]) && /^\d{1,3}$/.test(ps[0]) && ps[0] !== '0' && ps[ps.length - 1].length === 3
      && (ps.slice(1, -1).every((g) => g.length === 3) || (ps.slice(1, -1).every((g) => g.length === 2) && ps[0].length <= 2)));
    const out = [];
    if (grouped(parts, seps)) out.push(Number(parts.join('')) * 1e6);
    const dec = seps[seps.length - 1], frac = parts[parts.length - 1], ip = parts.slice(0, -1), is = seps.slice(0, -1);
    if ((dec === '.' || dec === ',') && frac.length <= 3 && !is.includes(dec) && grouped(ip, is)) out.push(Math.round(parseFloat(ip.join('') + '.' + frac) * 1e6));
    return [...new Set(out)];
  };
  // The one sale price ("Was <price>") reading: two readings exist only for one "." or "," before exactly 3 digits
  // ("₩4,400", "$1,000", "Rp 15.000", "BHD 12.000"). The currency decides (a 3-letter code in the label, else the page's
  // JSON-LD currency, else its record's): only a 3-minor-digit currency (BHD, KWD, OMR, JOD, TND, LYD) reads it as a decimal
  // point. The sale part of the same label ("now reduced to KWD 0.990", "$0.99") must not prove the other convention; if it
  // does, nothing verifies. So a x1000 or /1000 JSON originalPrice never matches "₩4,400" or "BHD 12.000".
  const minorDigits = (c) => { try { return /^[A-Z]{3}$/.test(c || '') ? new Intl.NumberFormat('en', { style: 'currency', currency: c }).resolvedOptions().maximumFractionDigits : undefined; } catch (e) { return undefined; } };
  const decMark = (s) => { // the decimal mark a price text proves, else undefined
    const m = /\d(?:[\d.,'\u2019\u00a0\u202f ]*\d)?/.exec(String(s || '')); if (!m) return undefined;
    const ds = m[0].match(/[.,]/g) || []; if (!ds.length) return undefined;
    if (new Set(ds).size > 1) return ds[ds.length - 1];
    if (ds.length > 1) return ds[0] === '.' ? ',' : '.';
    const [ip, fr] = m[0].split(ds[0]); return fr.length !== 3 || /^0$/.test(ip) ? ds[0] : undefined;
  };
  const wasMicros = (was, button, cur) => {
    const R = priceMicros(was); if (R.length < 2) return R;
    const t = /\d(?:[\d.,'\u2019\u00a0\u202f ]*\d)?/.exec(String(was))[0], sep = (t.match(/[.,]/) || [])[0];
    const code = (/(?:^|[^A-Za-z])([A-Z]{3})(?![A-Za-z])/.exec(String(was)) || [])[1], md = minorDigits(code) !== undefined ? minorDigits(code) : minorDigits(cur);
    const sale = (/, now reduced to (.+?) Buy$/.exec(String(button || '')) || [])[1], mk = decMark(sale);
    const byCur = md === undefined ? undefined : md === 3 ? 'dec' : 'grp', bySale = mk === undefined ? undefined : mk === sep ? 'dec' : 'grp';
    if (!byCur || (bySale && bySale !== byCur)) return [];
    return [byCur === 'grp' ? Math.max(...R) : Math.min(...R)];
  };
  const normAndroid = (t) => { if (!t) return 'VARY'; const n = String(t).split(' ')[0]; return parseFloat(n) ? n : 'VARY'; }; // gps normalizeAndroidVersion
  const DATE_RE = /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/, GOOGLE_DEV_ID = '5700313618786177705'; // Google LLC's developer page id
  // Semantic shapes for the slots no page text vouches for (version, in-app range). A value that is another field's value,
  // or has another field's shape, is a moved path, never data (corpus: 0 of 7,998 versions; the IAP tail holds on 2,166 US
  // pages and in 13 storefronts, whatever the currency form: "$0.99", "CHF 5.00" and "Rp 15.000" with a no-break space, "21,24 CZK").
  const IAP_TAIL = /\s(?:per item|if billed through Play)$/;
  const iapShapeOk = (v) => typeof v === 'string' && v.length <= 80 && /\d/.test(v) && IAP_TAIL.test(v);
  // Every real version (7,998 on 9,140 en/US pages) starts with a letter or digit, ends with one or ")", has a digit
  // (the one exception is the single letter "F"), is at most 27 characters (50 allowed) with no sentence break or HTML, and is no
  // rating label: "$4.99", "Mature 17+", "1,000,000+", "Free", a genre or developer name, an app id, a relative link
  // "/store/apps/dev?id=...", What's-new or description text, or one of the page's own counts in the slot is a moved path.
  // others: same-page strings it must not equal; nums: same-page counts of 4+ digits (>= 1,000: 0 of 12,580 versions on
  // 14,222 corpus and live pages equal one; a 1-3 digit version is left out, as in the record check below: real versions
  // "2" and "3" equal a review count 7 times, and live "360" equals its page's 2-star count); texts: same-page prose a
  // version with a space must not come from. The price is not compared: a paid app's real version can equal its price
  // ("2.6" at CHF 2.60, live 2026-10-05), and no page data holds the price as that text (the record keeps micros and
  // "CHF 2.60"), so a moved path cannot put it in the version slot.
  // sib: the record's own numbers and scalars. No real version is a timestamp (10 or 13 digits read as a time since
  // Android's launch), an ISO or slash date, two amounts joined by a spaced dash (a price range without its currency or
  // tail), its own record's target SDK or API level, the rating at 2+ decimals, or any other scalar of the app's own
  // record (leaves: 0 of 7,998 real versions, besides the Android text and the score text, which stay soft signals;
  // a 1-3 digit version is left out, "2" or "3" equal small counts of real records).
  const T_ANDROID = Date.UTC(2008, 9, 1) / 1000;
  const isTimestamp = (t) => { if (!/^\d{10}(?:\d{3})?$/.test(t)) return false; const s = t.length === 13 ? +t / 1000 : +t; return s >= T_ANDROID && s <= Date.now() / 1000 + 5 * 365 * 86400; };
  function versionWhy(v, others, nums, texts, sib) {
    const raw = String(v), t = decEnt(raw).trim(), n = norm(t), S = sib || {};
    if (/&(?:#\d+|#x[0-9a-f]+|[a-z]+);|<\/?[a-z][^<>]*>/i.test(raw)) return 'holds HTML text';
    if (IAP_TAIL.test(t)) return 'holds an in-app price range';
    if (DATE_RE.test(t) || /^\d{1,2} [A-Z][a-z]{2,4}\.? \d{4}$/.test(t)) return 'holds a date';
    if (/^https?:\/\//i.test(t) || /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(t)) return 'holds a URL or an email address';
    if (/^(?:Everyone|Teen|Mature|Adults only|Parental guidance|Rated for|PEGI|USK|Unrated)\b/i.test(t)) return 'holds a content rating';
    if (!/^[\p{L}\p{N}]/u.test(t) || !/[\p{L}\p{N})]$/u.test(t)) return 'starts or ends with a symbol (a price, label or link)';
    if (t.length > 50 || /[.!?:]\s+\S|\n/.test(t)) return 'holds text';
    if (/^\d{1,3}(?:,\d{3})+$/.test(t)) return 'holds a formatted count';
    if (!/\d/.test(t) && t.length > 1 && (!/^\p{Lu}+$/u.test(t) || /^(?:FREE|PAID|BUY|SALE|INSTALL(?:ED)?|UPDATE|OPEN|ADS|NONE|NULL|UNDEFINED|TRUE|FALSE|NAN)$/.test(t)) && !/^Varies with device$/i.test(t)) return 'holds words or a name (no digit)'; // one capitals-only word that is no store label stays (real: "APNA", "F")
    for (const [k, x] of Object.entries(nums || {})) if (Number.isFinite(x) && x >= 1000 && t === String(x)) return `equals the page's ${k}`;
    for (const [k, o] of Object.entries(others || {})) if (typeof o === 'string' && o.trim() && norm(o) === n) return `equals the page's ${k}`;
    if (/\s/.test(t)) for (const [k, o] of Object.entries(texts || {})) if (typeof o === 'string' && norm(o).includes(n)) return `is text from the page's ${k}`;
    if (/^\D{0,4}\d+(?:[.,]\d+)?\s+[-–—]\s+\D{0,4}\d+(?:[.,]\d+)?\D{0,4}$/.test(t)) return 'holds a price range (two amounts joined by a dash)';
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(t) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(t) || /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(t)) return 'holds a date';
    { const m = /^(\d{1,2})([-.])(\d{1,2})\2(\d{4})$/.exec(t); if (m && Math.min(+m[1], +m[3]) <= 12 && Math.max(+m[1], +m[3]) <= 31 && +m[4] >= 2008 && +m[4] <= new Date().getUTCFullYear() + 5) return 'holds a date'; } // D-M-YYYY, D.M.YYYY, M.D.YYYY (real versions: 0 of 7,998)
    if (isTimestamp(t)) return 'holds a timestamp';
    for (const [k, x] of [['target SDK', S.targetSdk], ['Android API level', S.androidApi]]) if (Number.isInteger(x) && t === String(x)) return `equals its own record's ${k}`;
    { const m = /^[0-5][.,](\d{2,})$/.exec(t); if (m) for (const s of S.scores || []) if (Number.isFinite(s) && Math.abs(parseFloat(t.replace(',', '.')) - s) <= 0.5 * 10 ** -m[1].length + 1e-9) return 'equals the page\'s rating'; }
    if (S.leaves && !/^\d{1,3}$/.test(t) && !(S.soft || []).includes(t)) { const q = (S.leaves.get(t) || []).find((p) => p !== S.own); if (q) return `equals another value of its own record (at [${q}])`; }
    return '';
  }
  // Every scalar of an app's own record by logical path (a jspb tail key k is index k - 1, so the tail copy of [140] is
  // [140] itself): value text -> up to 4 paths. Cached per record (heal calls the version check on every leaf of a page).
  const SCALARS = new WeakMap();
  function recordScalars(rec) {
    if (!rec || typeof rec !== 'object') return new Map();
    if (SCALARS.has(rec)) return SCALARS.get(rec);
    const out = new Map();
    (function walk(x, p) {
      if (x == null) return;
      if (typeof x === 'string' || typeof x === 'number') { const s = String(x).trim(); if (s && s.length <= 60) { const L = out.get(s) || out.set(s, []).get(s); if (L.length < 4) L.push(p.join()); } return; }
      if (typeof x !== 'object') return;
      if (Array.isArray(x)) { const tl = jspbTail(x), m = tl ? x.length - 1 : x.length; for (let i = 0; i < m; i++) walk(x[i], p.concat(i)); if (tl) for (const k of Object.keys(tl)) walk(tl[k], p.concat(+k - 1)); } else for (const k of Object.keys(x)) walk(x[k], p.concat(k));
    })(rec, []);
    SCALARS.set(rec, out);
    return out;
  }
  // the version check's view of its own record: the record's scalars, and the version's own logical path in it
  const REC = [1, 2];
  const versionSib = (d, p) => { const inRec = p.length > 2 && p[0] === REC[0] && p[1] === REC[1]; return { leaves: d ? recordScalars(getRaw(d, REC)) : undefined, own: inRec ? p.slice(2).join() : undefined }; };
  // Two PATHS entries reading the same data (one path a prefix of the other) mean one of them moved: the default paths
  // never overlap. An unanchored field in such a pair fails (its value cannot be trusted); anchored ones are judged by anchor.
  const overlapP = (p, q) => { const k = Math.min(p.length, q.length); for (let i = 0; i < k; i++) if (p[i] !== q[i]) return false; return true; };
  const ANCHORED = new Set('title summary icon developer developerWebsite developerLink genreId contentRating price currency score ratings minInstalls installsText maxInstalls updatedText recentChanges developerEmail developerAddress privacyPolicy originalPrice discountEndDate'.split(' '));
  let OVL = { sig: null, pairs: [] };
  function pathOverlaps() {
    const ks = Object.keys(PATHS), sig = ks.map((k) => k + ':' + PATHS[k].join('.')).join('|');
    if (OVL.sig !== sig) { const pairs = []; for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) if (overlapP(PATHS[ks[i]], PATHS[ks[j]])) pairs.push([ks[i], ks[j]]); OVL = { sig, pairs }; }
    return OVL.pairs;
  }
  // A date text and its own record's [epochSeconds, nanos] sibling (Play renders the Pacific date; 8,964/8,964 US pages).
  const epochNear = (txt, ep) => typeof txt === 'string' && Number.isInteger(ep) && Math.abs(Date.parse(txt + ' UTC') - ep * 1000) < 129600000;
  // Corpus-derived (API levels seen >=3 times with one unique text, 8,820 pages).
  const ANDROID_API_NAMES = freeze({ 14: '4.0', 15: '4.0.3', 16: '4.1', 17: '4.2', 19: '4.4', 21: '5.0', 22: '5.1', 23: '6.0', 24: '7.0', 25: '7.1', 26: '8.0', 27: '8.1', 28: '9', 29: '10', 30: '11', 31: '12' });
  const COUNTRIES = Object.freeze('AFALDZADAOAIAQAGARAMAWAUATAZBSBHBDBBBYBEBZBJBMBTBOBQBABWBVBRIOBNBGBFBIKHCMCACVKYCFTDCLCNCXCCCOKMCGCDCKCRHRCUCWCYCZCIDKDJDMDOECEGSVGQEREEETFKFJFIFRTFGAGMGEDEGHGIGRGDGTGGGNGWGYHTHMHNHKHUISINIDIRIQIEIMILITJMJPJEJOKZKEKIKRKWKGLALVLBLSLRLYLILTLUMOMGMWMYMVMLMTMXFMMDMCMNMEMSMAMZMMNANRNPNLNZNINENGNUNFMKNOOMPKPWPSPAPGPYPEPHPNPLPTPRQARORURWSHKNLCVCWSSMSTSASNRSSCSLSGSKSISBSOZAGSESLKSDSRSZSECHTWTJTZTHTLTGTKTOTTTNTRTMTCTVUGUAAEGBUSUMUYUZVUVEVNVGEHYEZMZW'.match(/../g)); // sar-frontend countryCodes.js
  function normCountry(c) {
    const C = String(c == null || c === '' ? 'US' : c).trim().toUpperCase();
    if (!COUNTRIES.includes(C)) throw E('USAGE', `unknown --country "${c}" (use a two-letter code SMAR supports, e.g. US, GB, DE)`);
    return C;
  }

  // ---------------------------------------------------------------- X2 page parsing
  // Script-scoped, quote-tolerant: matches the exact `data` property and bracket-matches its JSON value.
  function parseBlobs(html) {
    const out = {};
    if (typeof html !== 'string') return out;
    const re = /AF_initDataCallback\s*\(\s*\{\s*['"]?key['"]?\s*:\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(html))) {
      let end = html.indexOf('</script>', m.index); if (end < 0) end = html.length;
      const seg = html.slice(m.index, end), dm = /[,{]\s*['"]?data['"]?\s*:\s*/.exec(seg); if (!dm) continue;
      const i = dm.index + dm[0].length; if (seg[i] !== '[' && seg[i] !== '{') continue;
      let depth = 0, inStr = false, j = i;
      for (; j < seg.length; j++) { const c = seg[j]; if (inStr) { if (c === '\\') j++; else if (c === '"') inStr = false; continue; } if (c === '"') inStr = true; else if (c === '[' || c === '{') depth++; else if (c === ']' || c === '}') { if (--depth === 0) break; } }
      if (depth !== 0) continue;
      try { out[m[1]] = JSON.parse(seg.slice(i, j + 1)); } catch (e) { /* not JSON: ignore */ }
    }
    return out;
  }
  // The detail blob is chosen by CONTENT (the ds:N number drifts); same rule as v2. Memoized per parsed page and
  // title path; a cached title match is re-validated, anything else is recomputed.
  const DBM = typeof WeakMap === 'function' ? new WeakMap() : null;
  function findDetailBlob(blobs, appId) {
    if (!blobs || typeof blobs !== 'object') return null;
    const tk = appId + '|' + PATHS.title.join(','), memo = DBM && DBM.get(blobs), hit = memo && memo.get(tk);
    if (hit && blobs[hit.key] === hit.data && typeof getPath(hit.data, PATHS.title) === 'string') return { key: hit.key, data: hit.data };
    let best = null, res = null;
    for (const [k, v] of Object.entries(blobs)) {
      const s = JSON.stringify(v);
      if (!s || !s.includes(appId)) continue;
      if (typeof getPath(v, PATHS.title) === 'string') { res = { key: k, data: v }; break; }
      if (!best || s.length > best.len) best = { key: k, data: v, len: s.length };
    }
    res = res || (best && { key: best.key, data: best.data });
    if (DBM && res && typeof getPath(res.data, PATHS.title) === 'string') { if (!memo) DBM.set(blobs, new Map([[tk, res]])); else memo.set(tk, res); }
    return res;
  }
  function jsonLd(html) {
    if (typeof html !== 'string') return null;
    for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
      try { const o = JSON.parse(m[1]); if (o && typeof o === 'object' && /Application|Game/.test(String(o['@type']))) return o; } catch (e) { /* next block */ }
    }
    return null;
  }
  const stripScripts = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '');
  const reEsc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // X4 independent page anchors: read from the page with every <script> removed, so the JSON never vouches for
  // itself. Entity-decoded short strings and booleans only (whatsNew stays raw inner HTML; compare with norm()).
  function domAnchors(html, visIn) {
    const raw = typeof html === 'string' ? html : '', vis = visIn != null ? visIn : stripScripts(raw);
    const m1 = (re, s) => { const m = (s == null ? vis : s).match(re); return m ? m[1] : undefined; };
    const D = (s) => (s === undefined ? undefined : decEnt(s));
    const lab = (ts) => ts.length > 0 && new RegExp('>\\s*(?:' + ts.map(reEsc).join('|') + ')\\s*<').test(vis);
    const h1 = m1(/<h1\b[^>]*>\s*<span\b[^>]*itemprop="name"[^>]*>([^<]*)<\/span>/), og = m1(/<meta property="og:title" content="([^"]*)"/);
    const wn = vis.match(/>What[’']s new<\/h2>[\s\S]{0,600}?<div itemprop="description">([\s\S]*?)<\/div>/);
    const ab = vis.match(/>About the developer<\/div><div[^>]*>((?:<div[^>]*>[^<]*<\/div>)+)<\/div>/);
    let addr;
    if (ab) { const ds = [...ab[1].matchAll(/<div[^>]*>([^<]*)<\/div>/g)].map((x) => x[1]), ml = ds.filter((t) => /\S\s*\n\s*\S/.test(t)); const a = ml.length === 1 ? ml[0] : ds.length === 4 ? ds[2] : undefined; if (a !== undefined) addr = norm(decEnt(a)); }
    const i1 = vis.indexOf('<h1'), dl = i1 < 0 ? undefined : m1(/<a href="(\/store\/apps\/dev(?:eloper)?\?id=[^"]*)"/, vis.slice(i1));
    const pb = m1(/aria-label="((?:Was [^"]+?, now reduced to )?(?:[^"\d]{0,8}\d[^"]{0,24}? Buy|Install))"/), badge = m1(/>([\d.,]+[KMBkmb]?\+)<\/div><div[^>]*>Downloads</);
    const updated = m1(/>Updated on<\/div><div[^>]*>([^<]*)</);
    return { // reviewDates: the dates of the review cards shown on the page (a date span closing the card header)
      reviewDates: [...vis.matchAll(/<span[^>]*>([A-Z][a-z]+ \d{1,2}, \d{4})<\/span><\/div><\/header>/g)].map((m) => m[1]),
      title: h1 !== undefined ? D(h1) : og !== undefined ? D(og).replace(/ - Apps on Google Play$/, '') : undefined,
      privacyPolicy: D(m1(/aria-label="Privacy Policy (https?:[^"\s]+) will open/) || m1(/<a [^>]*href="(https?:[^"]+)"[^>]*>\s*<i[^>]*>shield<\/i>/)),
      developerEmail: D(m1(/aria-label="Support email mailto:([^"\s]+) will open/) || m1(/<a [^>]*href="mailto:([^"?]+)"[^>]*>\s*<i[^>]*>email<\/i>/)),
      updatedOn: updated === undefined ? undefined : D(updated).trim(), installsBadge: badge,
      hasIAP: lab(LABELS.iap), containsAds: lab(LABELS.ads),
      preRegister: />\s*Pre-?register\s*</i.test(vis) || (!pb && !badge), // anonymous pre-register pages: no Install/Buy button, no Downloads badge
      hasWhatsNew: !!wn || />What[’']s new<\/h2>/.test(vis), whatsNew: wn ? wn[1] : undefined,
      developerAddress: addr, developerLinkId: dl === undefined ? undefined : D(dl).split('id=')[1],
      priceButton: D(pb), wasPrice: D(m1(/aria-label="Was ([^"]+?), now reduced to /)), offerEnds: D(m1(/>(Offer ends [^<]+)</)),
      ratingBadge: /itemprop="starRating"/.test(vis),
      lang: m1(/<html[^>]*\blang="([^"]+)"/, raw), fjF0tb: m1(/"fjF0tb":"([A-Z]{2})"/, raw),
    };
  }
  // C20 storefront: <html lang> in {en, en-US} and the WIZ storefront code must equal the run's country.
  // A day-first date ("6 Jan 2015") is another English locale's page (en-GB) even under lang="en": hl=en renders
  // "Jan 6, 2015" on US, GB and IN storefronts (corpus: 9,098 of 9,100 en pages; the 2 others are en-GB swaps).
  const DMY_RE = /^\d{1,2} [A-Z][a-z]{2,4}\.? \d{4}$/;
  // a date text in either form as a time (local midnight, as Date.parse reads "Mon D, YYYY"); NaN for anything else
  const dateOf = (t) => { t = String(t == null ? '' : t); if (DATE_RE.test(t)) return Date.parse(t); const m = /^(\d{1,2}) ([A-Z][a-z]{2,4})\.? (\d{4})$/.exec(t), k = m ? 'janfebmaraprmayjunjulaugsepoctnovdec'.indexOf(m[2].slice(0, 3).toLowerCase()) : -1; return k >= 0 && k % 3 === 0 ? new Date(+m[3], k / 3, +m[1]).getTime() : NaN; };
  // a record's "Mon D, YYYY" text shown as a day-first visible date of the same day (a changed date form of the anchor)
  const sameDayDmy = (rec, vis) => DATE_RE.test(String(rec)) && DMY_RE.test(String(vis)) && dateOf(rec) === dateOf(vis);
  function storefront(html, ld, country, dom) {
    const C = String(country || 'US').trim().toUpperCase(), d = typeof html === 'string' ? html : '';
    const lang = (d.match(/<html[^>]*\blang="([^"]+)"/) || [])[1], fj = (d.match(/"fjF0tb":"([A-Z]{2})"/) || [])[1];
    const off = ld && (Array.isArray(ld.offers) ? ld.offers[0] : ld.offers), cur = off ? off.priceCurrency : undefined, why = [];
    if (!/^en(-US)?$/i.test(lang || '')) why.push(`html lang=${lang}`);
    if (fj && fj !== C) why.push(`storefront ${fj}, expected ${C}`);
    if (C === 'US' && cur && cur !== 'USD') why.push(`JSON-LD priceCurrency=${cur}`);
    if (!fj && !(C === 'US' && cur)) why.push('storefront unverifiable (no "fjF0tb" storefront code)');
    if (dom && DMY_RE.test(dom.updatedOn || '')) why.push(`another English locale's page ("Updated on" ${dom.updatedOn})`);
    return { ok: !why.length, lang, country: fj, currency: cur, why: why.join('; ') };
  }
  const UNAVAIL_ANY = /(?:isn['’]t|is not|not)\s+(?:currently\s+)?available\s+in\s+your\s+(?:country|region)/i;
  // Evidence that a page is the details page of `id`: canonical/og:url/bundle id/JSON-LD url name it, or a blob holds the id
  // with a string at the title slot (0 of 14,472 id checks on search, cluster and category pages).
  function detailEvidence(h, id, blobs, ld) {
    const q = reEsc(id), u = new RegExp('/store/apps/details\\?id=' + q + '(?![\\w.])');
    for (const re of [/<link rel="canonical" href="([^"]*)"/, /<meta property="og:url" content="([^"]*)"/]) { const m = h.match(re); if (m && u.test(m[1])) return true; }
    if (h.includes('<meta name="appstore:bundle_id" content="' + id + '"')) return true;
    if (ld && typeof ld.url === 'string' && new RegExp('[?&]id=' + q + '(?![\\w.])').test(ld.url)) return true;
    for (const v of Object.values(blobs || {})) if ((typeof getPath(v, DEFAULT_PATHS.title) === 'string' || typeof getPath(v, PATHS.title) === 'string') && JSON.stringify(v).includes(JSON.stringify(id))) return true;
    return false;
  }
  const UNAVAIL_RE = />\s*(?:This (?:app|item|game) (?:is not|isn['’]t) (?:currently )?available(?: in your (?:country|region))?|(?:Not|Isn['’]t) available in your (?:country|region))[.!]?\s*</i;
  // X3: classifies every fetched page; non-app pages never produce rows (C19, D7).
  function pageKind(html, o) {
    o = o || {};
    const st = o.status, u = String(o.url || ''), h = typeof html === 'string' ? html : '', id = o.appId;
    if (st === 404) return 'not_found';
    if (/^https?:\/\/(?:[a-z]+\.)?google\.[a-z.]+\/sorry\//i.test(u)) return 'sorry';
    if (/^https?:\/\/consent\.(?:google|youtube)\.[a-z.]+\//i.test(u)) return 'consent';
    const isHtml = /^\s*(?:<!doctype html|<html)/i.test(h.slice(0, 300)), af = h.includes('AF_initDataCallback');
    if (isHtml && !af && /unusual traffic/i.test(h)) return 'sorry';
    if (isHtml && !af && /action="https:\/\/consent\.google\.[a-z.]+/i.test(h)) return 'consent';
    if (/<title[^>]*>Error \d{3} \(/.test(h) || (st && st >= 500)) return 'error_page';
    if (!h) return st && st !== 200 ? 'error_page' : 'unknown';
    if (id) {
      const vis = o.vis != null ? o.vis : stripScripts(h);
      if (UNAVAIL_RE.test(vis)) return 'unavailable';
      const blobs = o.blobs || parseBlobs(h), ld = o.ld !== undefined ? o.ld : jsonLd(h);
      // a page that is not THIS app's details page (search/store page, another app) never yields a row
      if (!detailEvidence(h, id, blobs, ld)) return UNAVAIL_ANY.test(vis) ? 'unavailable' : /play\.google\.com|"fjF0tb"/.test(h) ? 'removed' : 'unknown';
      return findDetailBlob(blobs, id) || ld ? 'app' : 'error_page';
    }
    if (/\/store\/(?:search|apps\/collection)/.test(u) || /<title id="main-title">[^<]* - Android Apps on Google Play<\/title>/.test(h) || /AF_initDataCallback\s*\(\s*\{\s*['"]?key['"]?\s*:\s*['"]ds:4['"]/.test(h)) return 'search';
    return 'unknown';
  }
  function parsePage(html, o) {
    o = o || {};
    const h = typeof html === 'string' ? html : '', vis = stripScripts(h), blobs = parseBlobs(h), ld = jsonLd(h), dom = domAnchors(h, vis);
    return { blobs, blobCount: Object.keys(blobs).length, ld, dom, kind: pageKind(h, { status: o.status, url: o.url, appId: o.appId, blobs, ld, vis }), storefront: storefront(h, ld, o.country, dom), smarLib: smarLibWouldThrow(h) };
  }
  function extractFrom(P, appId, o) {
    let blob = findDetailBlob(P.blobs, appId), via = 'title';
    // If the blob picked by PATHS.title does not carry the page's own title, PATHS.title may have drifted: pick the
    // blob carrying the most independent anchors instead, so one drifted path cannot swap every other cell.
    const tA = P.ld && P.ld.name != null ? P.ld.name : P.dom && P.dom.title;
    if (tA != null && !(blob && unesc(getPath(blob.data, PATHS.title)) === unesc(tA))) { const ab = anchorBlob(P, appId, anchorsOf(P)); if (ab && (!blob || ab.key !== blob.key)) { blob = ab; via = 'anchors'; } }
    const raw = {}, nullLeaves = [], d = blob && blob.data;
    // nullLeaves: JSON-null leaves at gps's own (default) path only; SMAR renders those "null" (compat quirk).
    if (d) for (const [f, p] of Object.entries(PATHS)) { const v = getRaw(d, p); if (v === null && own(DEFAULT_PATHS, f) && p.join() === DEFAULT_PATHS[f].join()) nullLeaves.push(f); raw[f] = v === null ? undefined : v; }
    const g = (p) => (d ? getPath(d, p) : undefined), gr = (p) => (d ? getRaw(d, p) : undefined);
    const aux = {
      versionBox: gr(up(PATHS.version, 2)), versionBlock: gr(up(PATHS.version, 3)), androidBox: gr(up(PATHS.androidVersionText, 3)), androidBlock: gr(up(PATHS.androidVersionText, 5)),
      androidApi: g(up(PATHS.androidVersionText, 1).concat(0)), targetSdk: g(up(PATHS.version, 3).concat(1, 0, 0, 0)),
      reviewsText: g(up(PATHS.reviews, 1).concat(0)), discountEndBanner: g(up(PATHS.discountEndDate, 1).concat(2)), releasedEpoch: g(up(PATHS.released, 1).concat(1, 0)),
      hist: [1, 2, 3, 4, 5].map((k) => g(up(PATHS.ratings, 2).concat(1, k, 1))), genreName: g(up(PATHS.genreId, 1).concat(0)),
      gpsAddress: d ? rpath(d, [1, 2, 69, 2, 0]) : undefined, // the stale path gps 9.2.0 reads (compat only)
      versionSib: versionSib(d, PATHS.version), // the record's scalars for the version check (never serialized)
      short: shortDetail(d, P.dom && P.dom.updatedOn),
    };
    let kind = P.kind; if ((kind === 'app' || kind === 'unknown') && !blob && !P.ld) kind = 'error_page';
    let sf = P.storefront;
    // A day-first release date is another locale's page only when nothing on the page reads as en-US: a visible
    // "Updated on" in "Mon D, YYYY" form (both corpus en-GB swaps had a day-first "Updated on" too) makes it layout drift
    // of the release field, judged by checkApp, never a storefront problem.
    // A day-first visible "Updated on" is another locale's page when its own record's dates are day-first too (both corpus
    // en-GB swaps: 2 of 14,222 pages, record and visible text alike); over a record whose date texts are all "Mon D, YYYY"
    // (update text, and release text when present) it is a changed date form of the visible anchor on a US page (checkApp
    // compares the two as dates), never a storefront problem (stress FI-14 variant).
    const vis = (P.dom && P.dom.updatedOn) || '', recUs = DATE_RE.test(typeof raw.updatedText === 'string' ? raw.updatedText : '') && !DMY_RE.test(typeof raw.released === 'string' ? raw.released : '');
    if (sf && recUs && DMY_RE.test(vis)) { const why = sf.why.split('; ').filter((w) => w && !/^another English locale's page \("Updated on"/.test(w)); sf = Object.assign({}, sf, { ok: !why.length, why: why.join('; ') }); }
    const mdy = DATE_RE.test(vis) || recUs;
    const loc = [/\u2013/.test(typeof raw.offersIAPRange === 'string' ? raw.offersIAPRange : '') && `in-app range "${raw.offersIAPRange}"`, !mdy && DMY_RE.test(typeof raw.released === 'string' ? raw.released : '') && `release date "${raw.released}"`].filter(Boolean);
    if (sf && loc.length && !/English locale/.test(sf.why)) sf = Object.assign({}, sf, { ok: false, why: (sf.why ? sf.why + '; ' : '') + `another English locale's page (${loc.join(', ')})` });
    return { appId, kind, blobKey: blob ? blob.key : undefined, blobVia: blob ? via : undefined, blobCount: P.blobCount, raw, aux, ld: P.ld, dom: P.dom, storefront: sf, smarLib: P.smarLib, nullLeaves };
  }
  // The short "Updated on"-only detail page (14 of 9,152 corpus pages, all JSPB-sparse clone apps SMAR drops): Google
  // serves no release record [10], no version/Android block [140] and no date but the visible "Updated on" anywhere in
  // the record. Read from the record's shape, never through PATHS, so a moved path is still drift.
  function shortDetail(d, upd) {
    const rec = d && Array.isArray(d[1]) ? d[1][2] : undefined, ext = Array.isArray(rec) ? rec[rec.length - 1] : undefined;
    if (typeof upd !== 'string' || !ext || typeof ext !== 'object' || Array.isArray(ext) || rec.length > 141 || rec[10] != null || ext['11'] != null || ext['141'] != null) return false;
    const dates = [], walk = (v) => { if (typeof v === 'string') { if (DATE_RE.test(v)) dates.push(v); } else if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v[k]); };
    walk(rec);
    return dates.length === 1 && (dates[0] === upd || sameDayDmy(dates[0], upd));
  }
  const extractApp = (html, appId, o) => extractFrom(parsePage(html, Object.assign({}, o, { appId })), appId, o);

  // ---------------------------------------------------------------- X5 validators (C8)
  // Hard checks compare exactly against an independent anchor; a failure quarantines the fed cells (FEEDS).
  // A value whose anchor is missing is `unverified` (reported; on most rows = drift). Soft signals only feed drift.
  function checkApp(x) {
    const r = x.raw || {}, ld = x.ld, L = ld || {}, d = x.dom || {}, a = x.aux || {};
    const errors = [], unverified = [], informative = [], verified = [], signals = {}, anchors = {}, anchorValues = {};
    const off = ld ? (Array.isArray(L.offers) ? L.offers[0] : L.offers) : undefined;
    // pre-register page: no Install/Buy button, no Downloads badge AND no JSON-LD offer (three independent absences);
    // its offer/installs/button anchors are legitimately absent, so they do not count against anchor liveness.
    const preReg = !!d.preRegister && !off, LEGIT = preReg ? { offers: 1, installsBadge: 1, priceButton: 1, preRegister: 1 } : { preRegister: 1 };
    const use = (A, ok) => { anchors[A] = anchors[A] === false || !ok ? false : true; };
    const unv = (f, A) => { unverified.push({ field: f, anchor: A }); if (!LEGIT[A]) use(A, false); };
    const chk = (f, ok, why) => { informative.push(f); if (ok) verified.push(f); else errors.push({ field: f, why, got: brief(r[f]) }); };
    const anchored = (f, A, av, eq, why) => { if (av == null) { if (has(r[f])) unv(f, A); } else { use(A, true); anchorValues[f] = av; chk(f, eq(r[f], av), why); } };
    anchored('title', 'title', L.name != null ? L.name : d.title, (v, w) => unesc(v) === unesc(w), 'must equal JSON-LD name (h1/og:title without JSON-LD)');
    const lda = (f, av, eq, why) => anchored(f, 'jsonLd', ld ? av : undefined, eq, why);
    lda('summary', L.description, (v, w) => norm(v) === norm(w), 'must equal JSON-LD description');
    lda('icon', L.image, (v, w) => v === w, 'must equal JSON-LD image');
    lda('developer', L.author && L.author.name, (v, w) => norm(v) === norm(w), 'must equal JSON-LD author.name');
    lda('genreId', L.applicationCategory, (v, w) => v === w, 'must equal JSON-LD applicationCategory');
    lda('contentRating', L.contentRating, (v, w) => unesc(v) === unesc(w), 'must equal JSON-LD contentRating');
    if (!ld || !L.author) { if (has(r.developerWebsite)) unv('developerWebsite', 'jsonLd'); } else {
      const au = L.author.url, want = /^https?:/i.test(au || '') ? au : undefined;
      if (has(r.developerWebsite) || want) { use('jsonLd', true); chk('developerWebsite', sameUrl(r.developerWebsite, want), 'must equal JSON-LD author.url (both absent when no website)'); }
    }
    anchored('developerLink', 'developerLink', d.developerLinkId, (v, w) => typeof v === 'string' && pctDec(v.split('id=')[1] || '') === pctDec(w), 'id= must equal the visible developer link under the title');
    anchored('price', 'offers', off && off.price !== undefined ? Math.round(Number(off.price) * 1e6) : undefined, (v, M) => Number.isInteger(v) && (v === M || r.originalPrice === M), 'micros must equal JSON-LD offers.price');
    anchored('currency', 'offers', off ? off.priceCurrency : undefined, (v, w) => v === w, 'must equal JSON-LD offers.priceCurrency');
    if (off && /InStock/.test(String(off.availability || ''))) { use('offers', true); chk('available', Number.isInteger(r.available) && r.available > 0, 'must be a positive integer when JSON-LD says InStock'); } else if (has(r.available)) unv('available', 'offers');
    const agg = L.aggregateRating;
    if (!agg) { if (has(r.score) || has(r.ratings) || d.ratingBadge) { if (has(r.ratings)) unv('ratings', 'rating'); if (has(r.score) || !has(r.ratings)) unv('score', 'rating'); } } else {
      use('rating', true); anchorValues.score = Number(agg.ratingValue); anchorValues.ratings = Number(agg.ratingCount);
      chk('score', typeof r.score === 'number' && Math.abs(r.score - Number(agg.ratingValue)) < 1e-6, 'must equal JSON-LD aggregateRating.ratingValue');
      chk('ratings', r.ratings === Number(agg.ratingCount), 'must equal JSON-LD aggregateRating.ratingCount');
    }
    // the reviews record has the shape of a star-histogram record: equal to a bucket count >= 1,000 is that bucket
    // (0 of 6,545 real pages with >= 1,000 ratings; below 1,000 real coincidences exist, so that stays a soft signal)
    if (has(r.reviews) || has(r.ratings)) { const fmt = Number.isInteger(r.reviews) && a.reviewsText === r.reviews.toLocaleString('en-US'), bucket = fmt && r.reviews >= 1000 && (a.hist || []).includes(r.reviews); chk('reviews', fmt && !bucket, bucket ? 'equals a star-histogram bucket count (the path moved onto the histogram)' : 'same-record formatted sibling must equal the count'); }
    if (!d.installsBadge) { if (has(r.maxInstalls) || has(r.minInstalls)) unv('maxInstalls', 'installsBadge'); } else {
      use('installsBadge', true); const bm = badgeMin(d.installsBadge);
      chk('minInstalls', r.minInstalls === bm, 'must equal the visible Downloads badge');
      chk('installsText', typeof r.installsText === 'string' && /\d/.test(r.installsText) && +r.installsText.replace(/\D/g, '') === r.minInstalls, 'digits must equal minInstalls');
      chk('maxInstalls', Number.isInteger(r.maxInstalls) && r.maxInstalls >= bm && r.maxInstalls < nextBucket(bm) && !(bm >= 1000 && r.maxInstalls === bm), 'must lie in [badge, next bucket) and differ from the badge minimum (0 of 8,820 pages at >= 1,000)');
    }
    anchored('updatedText', 'updatedOn', d.updatedOn, (v, w) => v === w || sameDayDmy(v, w), 'must equal the visible "Updated on" date (guards version, Android version, What’s new)');
    if (d.hasWhatsNew) { if (has(d.whatsNew)) anchorValues.recentChanges = d.whatsNew; chk('recentChanges', norm(r.recentChanges) === norm(d.whatsNew), 'must equal the visible "What’s new" text'); }
    else if (has(r.recentChanges)) chk('recentChanges', false, 'set in JSON but the page shows no "What’s new"');
    // version / Android: only the no-value shapes seen on real pages are legitimate (corpus: the [140] block absent,
    // [null,null,[]], an API-only Android box for API levels Google ships without text); anything else is a failure.
    const noBlock = a.versionBlock === undefined, vNone = noBlock || JSON.stringify(a.versionBox) === '[null,null,[]]';
    // no page text shows the version: besides its targetSdk sibling it must not be another field's value or shape
    // (corpus: 0 of 7,998 versions; androidVersionText and the score text are soft signals below: 5 and 2 real versions
    // equal them, e.g. "7.0", "4.4")
    const ag = L.aggregateRating || {}, hb = {}; (a.hist || []).forEach((h, i) => { hb[`${i + 1}-star count`] = h; });
    const vw = typeof r.version === 'string' && r.version.trim() ? versionWhy(r.version,
      { contentRating: r.contentRating, 'JSON-LD contentRating': L.contentRating, title: r.title, developer: r.developer, 'JSON-LD author': L.author && L.author.name, appId: x.appId, developerId: typeof r.developerLink === 'string' ? r.developerLink.split('id=')[1] : undefined, genreId: r.genreId, genre: a.genreName, released: r.released, updatedText: r.updatedText, offersIAPRange: r.offersIAPRange, summary: r.summary, developerEmail: r.developerEmail, developerAddress: r.developerAddress, currency: r.currency, installsText: r.installsText, recentChanges: r.recentChanges, 'What’s new': d.whatsNew },
      Object.assign({ maxInstalls: r.maxInstalls, minInstalls: r.minInstalls, ratings: r.ratings, 'JSON-LD ratingCount': Number(ag.ratingCount), reviews: r.reviews }, hb),
      { description: r.descriptionHTML, summary: r.summary, 'JSON-LD description': L.description, title: r.title, developer: r.developer, developerAddress: r.developerAddress },
      Object.assign({ targetSdk: a.targetSdk, androidApi: a.androidApi, scores: [r.score, Number(ag.ratingValue)], soft: [typeof r.androidVersionText === 'string' ? r.androidVersionText.trim() : undefined, agg ? Number(agg.ratingValue).toFixed(1) : undefined] }, a.versionSib)) : '';
    if (typeof r.version === 'string' && r.version.trim()) chk('version', sdkOk(a.targetSdk) && !vw, vw ? 'must be a version: it ' + vw : 'same-record targetSdk sibling must be an integer in 14..60');
    else if (versionNone(r, a)) chk('version', true);
    else if (vNone && r.version === undefined) { if (!a.short) signals.versionNoValue = true; } // short page: no version on it
    else chk('version', false, 'the version box is not a known no-value shape: the path misses the version');
    const at = r.androidVersionText, api = a.androidApi;
    if (typeof at === 'string' && at.trim()) chk('androidVersionText', Number.isInteger(api) && api > 0 && (!own(ANDROID_API_NAMES, api) || ANDROID_API_NAMES[api] === at) && (parseFloat(at) > 0 || /^Varies with device$/i.test(at.trim())), 'API-level sibling must be an integer whose known name equals the text, and the text a version number (or "Varies with device")');
    else if (androidNone(r, a)) chk('androidVersionText', true);
    else if (a.androidBlock === undefined && at === undefined) { if (!a.short) signals.androidNoValue = true; }
    else chk('androidVersionText', false, 'the Android box is not a known no-value shape: the path misses the text');
    anchored('developerEmail', 'developerEmail', d.developerEmail, (v, w) => v === w, 'must equal the visible support-email link');
    anchored('developerAddress', 'developerAddress', d.developerAddress, (v, w) => norm(v) === w, 'must equal the visible address under "About the developer"');
    anchored('privacyPolicy', 'privacyPolicy', d.privacyPolicy, sameUrl, 'must equal the visible Privacy Policy link');
    const iapWhy = 'must be a price range ending "per item" or "if billed through Play" (another shape is a moved path)';
    if (!preReg && (d.hasIAP || r.offersIAPRange)) { const same = !!r.offersIAPRange === !!d.hasIAP; chk('offersIAPRange', same && (!r.offersIAPRange || iapShapeOk(r.offersIAPRange)), !same ? (d.hasIAP ? 'label shown, JSON empty (path drift)' : 'JSON set, label missing (anchor drift?)') : iapWhy); }
    else if (preReg && d.hasIAP && !r.offersIAPRange) unv('offersIAPRange', 'preRegister'); // label shown, no JSON value yet: never write "false" (D10)
    else if (has(r.offersIAPRange) && !iapShapeOk(r.offersIAPRange)) chk('offersIAPRange', false, iapWhy);
    // the run's search results / chart list showed this app's in-app range (listingOf): the details page must show the same
    const LI = (x.listing || {}).iap;
    // (a mismatch withholds only the range when the visible "In-app purchases" label vouches for the boolean)
    if (LI && LI.length) {
      use('listing', true); anchorValues.offersIAPRange = LI[0];
      const ok = LI.length === 1 && r.offersIAPRange === LI[0];
      chk('offersIAPRange', ok, LI.length > 1 ? 'the search results show different in-app ranges for this app' : 'must equal the in-app range the search results or chart list show for this app');
      if (!ok && d.hasIAP && has(r.offersIAPRange) && !preReg) errors[errors.length - 1].cols = ['inAppPurchasesPriceRange'];
    }
    if (d.containsAds || r.adSupported) chk('adSupported', !!r.adSupported === !!d.containsAds, d.containsAds ? 'label shown, JSON empty (path drift)' : 'JSON set, label missing (anchor drift?)');
    if (!d.priceButton) { for (const f of ['originalPrice', 'discountEndDate']) if (has(r[f])) unv(f, 'priceButton'); } else {
      use('priceButton', true);
      if (d.wasPrice) chk('originalPrice', wasMicros(d.wasPrice, d.priceButton, off && off.priceCurrency ? off.priceCurrency : r.currency).includes(r.originalPrice) && r.originalPrice > (r.price || 0), 'must equal the visible "Was $X" price');
      else if (r.originalPrice) { chk('originalPrice', false, 'set in JSON but the page shows no sale (no "Was $X")'); errors[errors.length - 1].noSale = true; }
      if (d.offerEnds) chk('discountEndDate', typeof r.discountEndDate === 'string' && a.discountEndBanner === d.offerEnds, 'its record must carry the visible "Offer ends" banner');
      else if (r.discountEndDate != null) { chk('discountEndDate', false, 'set in JSON but the page shows no "Offer ends" banner'); errors[errors.length - 1].noSale = true; }
    }
    // released has no anchor in the static page: same-record identity with its own timestamp sibling (0 of 8,964 real
    // pages differ by more than 36 h), and not later than the visible "Updated on" (0 of 8,820 real pages are)
    // and in the page's own date form: "Mon D, YYYY" (hl=en in every storefront; corpus and 13 storefronts), or day-first
    // only on a page whose visible "Updated on" is day-first too (another locale's page: the storefront check withholds it)
    // A release date at (or just before) "Updated on" is the update record, not the release, when a review card on the page is
    // more than a year older: reviews come after the release, except from an early-access or earlier listing of the same app
    // (real pages: Bloons Blitz launched with early-access reviews 14 days older; a re-released radio app shows one 158 days
    // older; 0 of 7,706 corpus pages with reviews has one more than a year older). Any date that far after a review is a
    // soft signal (releasedAfterReview).
    if (has(r.released)) {
      const fmt = DATE_RE.test(String(r.released)) || (DMY_RE.test(String(r.released)) && DMY_RE.test(d.updatedOn || '')), ep = epochNear(r.released, a.releasedEpoch), rel = Date.parse(r.released), uo = dateOf(d.updatedOn);
      const older = (d.reviewDates || []).some((t) => Date.parse(t) < rel - 365 * 864e5), late = rel > uo, early = older && rel >= uo - 3 * 864e5;
      if ((d.reviewDates || []).length) signals.releasedAfterReview = older;
      chk('released', fmt && ep && !late && !early, !fmt ? 'must be a date in the page\'s own form ("Mon D, YYYY" like "Updated on"): another form is a moved path or a format change' : !ep ? 'must be the date of its own record\'s timestamp sibling (path moved?)' : late ? 'must not be later than the visible "Updated on" date' : 'a review on the page is more than a year older than this date: it is the "Updated on" record, not the release');
    }
    // two fields reading the same data (see pathOverlaps): an anchored member is judged by its anchor; an unanchored one fails
    // when the other is anchored, or when its own path is the moved one (overridden while the other is at its shipped path)
    const atDef = (f) => own(DEFAULT_PATHS, f) && PATHS[f].join() === DEFAULT_PATHS[f].join();
    for (const [f, g] of pathOverlaps()) for (const [h, o] of [[f, g], [g, f]]) if (!ANCHORED.has(h) && (FEEDS[h] || []).length && (has(r[h]) || has(r[o])) && (ANCHORED.has(o) || atDef(h) === atDef(o) || !atDef(h))) chk(h, false, `reads the same page data as ${o} (overlapping paths): a moved path`);
    // soft signals (run-level drift only; never blank a cell on a run of 3+ apps)
    if (has(r.released)) signals.releasedEqUpdated = r.released === d.updatedOn || sameDayDmy(r.released, d.updatedOn);
    if (typeof r.version === 'string' && agg) signals.versionEqScoreText = r.version === Number(agg.ratingValue).toFixed(1);
    if (typeof r.version === 'string' && typeof r.androidVersionText === 'string') signals.versionEqAndroid = r.version.trim() === r.androidVersionText.trim(); // 5 of 8,028 real pages
    if (Number.isInteger(r.reviews) && Number.isInteger(r.ratings)) { signals.reviewsGeRatings = r.reviews >= r.ratings && r.ratings >= 100; signals.reviewsIsHistBucket = r.reviews >= 100 && r.reviews < 1000 && (a.hist || []).includes(r.reviews); } // < 100 reviews: 14% coincide on real pages; 100-999: 0.1%; >= 1,000 is a hard failure above
    if (Number.isInteger(r.maxInstalls)) signals.maxEqMin = r.maxInstalls === r.minInstalls && r.minInstalls >= 1000;
    // a Google app is known by its developer (Google LLC's developer id or JSON-LD author), not by its package: Chrome
    // Beta/Dev/Canary (com.chrome.*) and com.android.chrome are Google's too
    const googleDev = [d.developerLinkId, typeof r.developerLink === 'string' ? r.developerLink.split('id=')[1] : undefined].includes(GOOGLE_DEV_ID) || norm(L.author && L.author.name) === 'Google LLC';
    if (has(r.privacyPolicy)) signals.googlePolicyOnNonGoogleApp = /myactivity\.google\.com|policies\.google\.com\/privacy/.test(String(r.privacyPolicy)) && !googleDev && !/^com\.google\./.test(x.appId);
    if (has(r.genreId)) signals.genreIdNotUpperSnake = !/^[A-Z_]+$/.test(String(r.genreId));
    if (has(r.developerEmail)) signals.emailNoAt = !/@/.test(String(r.developerEmail));
    if (Number.isInteger(r.available)) signals.downloadableFalse = !r.available;
    return { errors, unverified, signals, informative, verified, anchors, anchorValues, preRegister: preReg };
  }
  const validate = (x) => checkApp(x).errors;
  // X3 best-page choice: kind app > storefront ok > fewer hard errors > first.
  function pickBetter(a, b) {
    if (!a || !b) return a || b;
    const k = (c) => (c.x && c.x.kind === 'app' ? 1 : 0), s = (c) => (c.x && c.x.storefront && c.x.storefront.ok ? 1 : 0), e = (c) => (c.check ? c.check.errors.length : 1e9);
    if (k(a) !== k(b)) return k(a) > k(b) ? a : b;
    if (s(a) !== s(b)) return s(a) > s(b) ? a : b;
    return e(b) < e(a) ? b : a;
  }

  // ---------------------------------------------------------------- X6 rows (D10) and quarantine (C9)
  const FEEDS = freeze({ title: ['appName'], summary: ['description'], icon: ['icon'], developer: ['developer'], developerWebsite: ['developerWebsite'], developerLink: ['developerId'], genreId: ['genreId'], contentRating: ['contentRating'], price: ['price'], currency: ['currency'], available: ['downloadable'], score: ['avgRating'], ratings: ['totalRatings'], reviews: ['totalReviews'], minInstalls: ['approximateInstalls'], maxInstalls: ['approximateInstalls'], installsText: ['approximateInstalls'], updatedText: ['currentAppVersion', 'androidMinVersion', 'currentVersionChanges'], recentChanges: ['currentVersionChanges'], version: ['currentAppVersion'], androidVersionText: ['androidMinVersion'], developerEmail: ['developerEmail'], developerAddress: ['developerAddress'], privacyPolicy: ['privacyPolicyURL'], offersIAPRange: ['inAppPurchases', 'inAppPurchasesPriceRange'], adSupported: ['inAppAdvertisements'], originalPrice: ['originalPrice'], discountEndDate: ['discountEndDate'], released: ['originalReleaseDate'], descriptionHTML: [] });
  const RAW_PRESENT = ['title', 'icon', 'developer', 'summary', 'maxInstalls', 'developerLink', 'privacyPolicy', 'genreId', 'contentRating', 'released', 'price', 'currency', 'available', 'updatedText', 'developerAddress'];
  const VARY_OK = VARY_STATUS !== 'refuted';
  function toSmarRow(x, src, o) {
    const r = x.raw || {}, a = x.aux || {}, C = String((o && typeof o === 'object' && o.country) || 'US').toUpperCase();
    const U = (v) => (v == null ? 'undefined' : String(smarClean(v))), int = (v) => (Number.isInteger(v) ? String(v) : 'undefined');
    const at = r.androidVersionText;
    const row = {
      appName: U(r.title), appId: x.appId, url: `${BASE}/store/apps/details?id=${x.appId}&hl=en&gl=${C}`, icon: U(r.icon), developer: U(r.developer),
      currency: U(r.currency), price: Number.isInteger(r.price) ? String(r.price / 1e6) : 'undefined', description: U(r.summary),
      avgRating: typeof r.score === 'number' ? String(r.score) : 'undefined', country: C, scrapedFrom: src,
      approximateInstalls: int(r.maxInstalls), totalRatings: int(r.ratings), totalReviews: int(r.reviews),
      originalPrice: r.originalPrice ? String(r.originalPrice / 1e6) : 'undefined', discountEndDate: U(r.discountEndDate),
      downloadable: Number.isInteger(r.available) ? String(Boolean(r.available)) : 'undefined',
      inAppPurchases: String(!!r.offersIAPRange), inAppPurchasesPriceRange: U(r.offersIAPRange),
      androidMinVersion: typeof at === 'string' ? String(smarClean(normAndroid(at))) : androidNone(r, a) && VARY_OK ? 'VARY' : 'undefined',
      developerId: U(typeof r.developerLink === 'string' ? r.developerLink.split('id=')[1] : undefined), developerEmail: U(r.developerEmail),
      developerWebsite: U(r.developerWebsite), developerAddress: U(r.developerAddress), privacyPolicyURL: U(r.privacyPolicy),
      genreId: U(r.genreId), contentRating: U(r.contentRating), inAppAdvertisements: String(!!r.adSupported), originalReleaseDate: U(r.released),
      currentAppVersion: typeof r.version === 'string' ? String(smarClean(r.version)) : versionNone(r, a) && VARY_OK ? 'VARY' : 'undefined',
      currentVersionChanges: U(r.recentChanges),
    };
    // _smar: compat inner cell strings that differ from the default (SMAR's double clean, stale developerAddress,
    // 0/false/VARY derivations for missing slots, "null" for JSON-null leaves).
    const nl = new Set(x.nullLeaves || []), v = (k) => (nl.has(k) ? null : r[k]), I = (val) => String(smarCleanText(val));
    const sm = {
      appName: I(v('title')), icon: I(v('icon')), developer: I(v('developer')), currency: I(v('currency')), price: I(v('price') / 1e6 || 0),
      description: I(v('summary') ? smarCleanText(v('summary')) : v('summary')), avgRating: I(v('score')), approximateInstalls: I(v('maxInstalls')),
      totalRatings: I(v('ratings')), totalReviews: I(v('reviews')), originalPrice: I(v('originalPrice') ? v('originalPrice') / 1e6 : undefined),
      discountEndDate: I(v('discountEndDate')), downloadable: I(Boolean(v('available'))), inAppPurchases: I(Boolean(v('offersIAPRange'))),
      inAppPurchasesPriceRange: I(v('offersIAPRange')), androidMinVersion: I(typeof at === 'string' ? normAndroid(at) : 'VARY'),
      developerId: I(typeof r.developerLink === 'string' ? r.developerLink.split('id=')[1] : undefined), developerEmail: I(v('developerEmail')),
      developerWebsite: I(v('developerWebsite')), developerAddress: I(a.gpsAddress), privacyPolicyURL: I(v('privacyPolicy')), genreId: I(v('genreId')),
      contentRating: I(v('contentRating')), inAppAdvertisements: I(Boolean(v('adSupported'))), originalReleaseDate: I(v('released')),
      currentAppVersion: I(v('version') || 'VARY'), currentVersionChanges: I(v('recentChanges') ? smarCleanText(v('recentChanges')) : v('recentChanges')),
    };
    const smar = {};
    for (const k of Object.keys(sm)) if (sm[k] !== row[k].replace(/"/g, '""')) smar[k] = sm[k];
    Object.defineProperty(row, '_smar', { value: smar, enumerable: true, writable: true, configurable: true });
    return row;
  }
  // No rating anywhere on this page (JSON-LD aggregateRating, header star badge, score/ratings data). Google sometimes
  // serves a rated app's page without them for a while (trial 2026-10-01: com.bigcake.android.chess.offline and
  // com.mandala.pattern.happy.paint.by.number.coloring.game came back rated minutes later), so the run engine fetches
  // such a page again at the end of the run before it counts the blank as confirmed (st.ratingCheck).
  const unratedPage = (x) => !!x && !(x.ld && x.ld.aggregateRating) && !(x.dom || {}).ratingBadge && !has((x.raw || {}).score) && !has((x.raw || {}).ratings);
  function finalizeApp(x, src, o) {
    o = o || {};
    const row = toSmarRow(x, src, o), c = checkApp(x), quarantined = {}, r = x.raw || {};
    if (o.seq != null) row._seq = o.seq;
    // D10: a boolean derived from an unverifiable state is not a page value (pre-register: no InStock offer, IAP label without JSON).
    // Default writes "undefined" (listed as unverified); compat keeps SMAR's derivation.
    const suppress = (col) => { if (row[col] !== 'undefined') { if (!own(row._smar, col)) row._smar[col] = row[col].replace(/"/g, '""'); row[col] = 'undefined'; } };
    if (c.preRegister && c.unverified.some((u) => u.field === 'available')) suppress('downloadable'); // state code 1 = pre-register, not "available"
    if (c.unverified.some((u) => u.field === 'offersIAPRange' && u.anchor === 'preRegister')) suppress('inAppPurchases');
    // an error blanks every column its field feeds, or only the columns it names (cols: a listing mismatch keeps the label-verified boolean)
    for (const e of c.errors) for (const col of (c.errors.some((q) => q.field === e.field && !q.cols) ? null : e.cols) || FEEDS[e.field] || []) { row[col] = 'undefined'; delete row._smar[col]; quarantined[col] = e.field; }
    // pre-register pages legitimately lack these (corpus: all 18 pre-register pages); other rows are judged as usual
    const PRE = c.preRegister ? ['released', 'price', 'currency', 'versionNoValue', 'androidNoValue'] : [];
    const sig = Object.keys(c.signals).filter((k) => c.signals[k] && !PRE.includes(k));
    const audit = {
      failed: [...new Set(c.errors.map((e) => e.field))], informative: [...new Set(c.informative)], verified: [...new Set(c.verified)],
      unverified: c.unverified, anchors: c.anchors, signals: sig, rawEmpty: RAW_PRESENT.filter((f) => !has(r[f]) && !PRE.includes(f) && !(f === 'released' && (x.aux || {}).short)), preRegister: c.preRegister || undefined,
      shortDetail: (x.aux || {}).short || undefined,
      labelMissing: c.errors.filter((e) => /label missing/.test(e.why)).map((e) => e.field), noSale: c.errors.filter((e) => e.noSale).map((e) => e.field), labels: { iap: !!(x.dom || {}).hasIAP, ads: !!(x.dom || {}).containsAds },
      json: { iap: !!r.offersIAPRange, ads: !!r.adSupported }, noBlob: !x.blobKey,
      unrated: unratedPage(x),
    };
    if (c.errors.length) audit.why = c.errors.map((e) => ({ field: e.field, why: e.why, got: e.got }));
    // swap partners of each failed field: another field holding its anchor value, or whose anchor value it holds (a swap
    // moves a value into a slot that passes its own check); --deliver-anyway blanks these with the drifted column (C30).
    // A field its own independent anchor verified on this page is never a partner.
    // (a developer link is compared by its id=, so "/store/apps/dev?id=N" in another slot matches the anchor id N)
    const kv = (v) => (typeof v === 'string' ? norm(pctDec(/[?&]id=/.test(v) ? v.split('id=')[1] : v)) : v), sameV = (v, w) => has(v) && has(w) && kv(v) === kv(w);
    const AV = c.anchorValues || {}, partners = {}, proven = new Set(c.verified.filter((g) => ANCHORED.has(g) && !audit.failed.includes(g)));
    for (const f of audit.failed) {
      const ps = Object.keys(FEEDS).filter((g) => g !== f && !proven.has(g) && (FEEDS[g] || []).length && has(r[g]) && (sameV(r[g], AV[f]) || sameV(r[f], AV[g])));
      if (ps.length) partners[f] = ps;
    }
    if (Object.keys(partners).length) audit.partners = partners;
    return { row, quarantined, audit, check: c, smarDrop: x.smarLib || false };
  }

  // ---------------------------------------------------------------- X10 formatting
  const HEADER = ['appName', 'appId', 'url', 'icon', 'developer', 'currency', 'price', 'description', 'avgRating', 'country', 'scrapedFrom', 'approximateInstalls', 'totalRatings', 'totalReviews', 'originalPrice', 'discountEndDate', 'downloadable', 'inAppPurchases', 'inAppPurchasesPriceRange', 'androidMinVersion', 'developerId', 'developerEmail', 'developerWebsite', 'developerAddress', 'privacyPolicyURL', 'genreId', 'contentRating', 'inAppAdvertisements', 'originalReleaseDate', 'currentAppVersion', 'currentVersionChanges', 'dateScraped'];
  const CHART_HEADER = ['appName', 'description', 'approximateInstalls', 'avgRating', 'totalRatings', 'totalReviews', 'price', 'originalPrice', 'discountEndDate', 'currency', 'downloadable', 'inAppPurchases', 'inAppPurchasesPriceRange', 'androidMinVersion', 'developer', 'developerId', 'developerEmail', 'developerWebsite', 'developerAddress', 'privacyPolicyURL', 'genreId', 'icon', 'contentRating', 'inAppAdvertisements', 'originalReleaseDate', 'currentAppVersion', 'currentVersionChanges', 'appId', 'url', 'dateScraped'];
  const HEADER_APPID_QUERY = CHART_HEADER.slice(0, -1).concat('country', 'scrapedFrom', 'dateScraped');
  const wellFormed = (s) => s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g, (m) => (m.length === 2 ? m : '\uFFFD'));
  const csvCell = (v) => '"' + wellFormed(String(v)).replace(/"/g, '""') + '"';
  const dateCell = (v) => (/[,"\r\n]/.test(String(v)) ? csvCell(v) : String(v));
  // C13: SMAR's dateScraped = Date#toString() on a UTC host, stamped when the CSV is written, unquoted.
  function smarDate(d) {
    d = d == null ? new Date() : new Date(d);
    const W = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], p = (n) => String(n).padStart(2, '0');
    return `${W[d.getUTCDay()]} ${M[d.getUTCMonth()]} ${p(d.getUTCDate())} ${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} GMT+0000 (Coordinated Universal Time)`;
  }
  const csvWith = (header) => (rows, now) => { const stamp = dateCell(smarDate(now)); return [header.map(csvCell).join(',')].concat((rows || []).map((o) => header.map((h) => (h === 'dateScraped' ? stamp : csvCell(o[h]))).join(','))).join('\n'); };
  const toCsv = (rows, o) => csvWith(o && o.layout === 'chart' ? CHART_HEADER : HEADER)(rows, o && o.now);
  const bomFor = (layout, compat) => (compat && layout !== 'chart' ? '\uFEFF' : '');
  function toRelog(i) {
    i = i || {};
    const L = [['tool', `smar-playstore-agent ${VERSION}: an independent re-implementation of SMAR's Google Play scraper. This file was NOT produced by smar-tool.org.`], ['date_time_utc', i.finishedUTC], ['started_utc', i.startedUTC], ['store', 'Google Play Store'], ['country', i.country], ['mode', i.mode], ['search_query', i.term], ['searched_term', i.siteTerm], ['category', i.category], ['collection', i.collection], ['num_results', i.rows], ['similar_expansion', i.similar], ['smar_compat', i.compat], ['ready_to_deliver', i.ready], ['delivered_anyway', i.deliveredAnyway], ['path_overrides', i.pathOverrides], ['label_overrides', i.labelOverrides], ['app_ids', i.ids], ['smar_would_drop', i.smarWouldDrop], ['compat_exact', i.compatExact], ['info', 'Rows are values read from Google Play pages and cross-checked on the same page; a cell that failed its check is written "undefined". Re-run this exact list with: run_play.js rerun <this CSV>.']];
    return L.filter(([, v]) => v !== undefined && v !== null && v !== '' && !(typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n') + '\n';
  }

  // ---------------------------------------------------------------- X8 search parsing
  const APPID_RE = /^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)+$/;
  const isAppId = (s) => typeof s === 'string' && APPID_RE.test(s);
  // What smar-tool.org's backend receives for `term` (browser URL parse + Express qs decode; 21/21 terms).
  function smarSiteTerm(term) {
    const raw = new URL('https://smar-tool.org/api/search?query=' + term).search.slice('?query='.length).split('&')[0], plus = raw.replace(/\+/g, ' ');
    try { return decodeURIComponent(plus); } catch (e) { return plus; }
  }
  function urls(country) {
    const q = `hl=en&gl=${normCountry(country)}`;
    return {
      details: (id) => `/store/apps/details?id=${encodeURIComponent(id)}&${q}`,
      search: (t) => `/store/search?c=apps&q=${encodeURIComponent(t)}&${q}&price=0`,
      // gps 9.2.0 URLs: vyAe2 = list(); qnKhOb = search pagination and reviews (UsvDTd body).
      batchexecute: (rpc) => (rpc === 'vyAe2' ? `/_/PlayStoreUi/data/batchexecute?rpcids=vyAe2&source-path=%2Fstore%2Fapps&f.sid=-4178618388443751758&bl=boq_playuiserver_20220612.08_p0&authuser=0&soc-app=121&soc-platform=1&soc-device=1&_reqid=82003&rt=c&${q}` : `/_/PlayStoreUi/data/batchexecute?rpcids=${rpc === 'UsvDTd' ? 'qnKhOb' : rpc}&f.sid=-697906427155521722&bl=boq_playuiserver_20190903.08_p0&${q}&authuser&soc-app=121&soc-platform=1&soc-device=1&_reqid=1065213`),
    };
  }
  function idsFromHtml(html, exclude) {
    if (typeof html !== 'string') return [];
    const seen = [];
    for (const m of html.matchAll(/\/store\/apps\/details\?id=([\w.]+)/g)) if (m[1] !== exclude && !seen.includes(m[1])) seen.push(m[1]);
    return seen;
  }
  const searchNoResults = (html) => typeof html === 'string' && (/No results for <b>/.test(html) || /No results for \\u003cb\\u003e/.test(html));
  const BANNER = [25, 0, 0, 0, 1];
  // Frozen replay of gps 9.2.0 search() processFirstPage on the literal ds:4 blob: returns its app ids or why it throws (C28).
  function gpsSearchReplay(blobs, term) {
    const d4 = blobs['ds:4'], isS = (v) => typeof v === 'string';
    try {
      const s0 = rpath(d4, [0, 1]), secs = Array.isArray(s0) ? s0.slice() : s0; // gps shifts in place; replay on a copy
      if (isS(rpath(secs, [0, 31, 0]))) secs.shift();
      if (isS(rpath(secs, [0, 25, 0, 0, 1, 1]))) secs.shift();
      if (isS(rpath(secs, [0, 31, 0]))) secs.shift();
      const enc = encodeURIComponent(term);
      if (secs.some((s) => { const t = rpath(s, BANNER); return isS(t) && t.endsWith(`<b>${enc}</b>`); })) return { ids: [], noResults: true };
      const more = secs.filter((s) => isS(rpath(s, [22, 1, 0])))[0], list = rpath(more, [22, 0]), hero = rpath(secs, [0, 23]);
      if (!Array.isArray(list)) {
        const banner = secs.some((s) => { const t = rpath(s, BANNER); return isS(t) && t.endsWith(`<b>${term}</b>`); });
        return { throws: banner ? 'no_results_encoded_term' : 'no_titled_section' };
      }
      for (const app of list) new URL(rpath(app, [0, 10, 4, 2]), BASE);
      const ids = list.map((app) => rpath(app, [0, 0, 0]));
      if (hero) { const link = rpath(hero, [16, 2, 68, 1, 4, 2]); if (typeof link !== 'string') return { throws: 'hero_developer_link' }; new URL(rpath(hero, [17, 0, 0, 4, 2]), BASE); ids.unshift(rpath(hero, [16, 11, 0, 0])); }
      return { ids, token: rpath(more, [22, 1, 3, 1]) };
    } catch (e) { return { throws: d4 === undefined ? 'no_sections_blob' : 'gps_exception' }; }
  }
  // Content-anchored mirror of gps processFirstPage + removeUnneededSections (X8). Hero first; titles parallel.
  function searchResults(html, o) {
    o = o || {};
    const num = o.num || 20, term = o.term == null ? '' : String(o.term), h = typeof html === 'string' ? html : '';
    const blobs = parseBlobs(h), vis = stripScripts(h), isS = (v) => typeof v === 'string';
    const sf = storefront(h, null, o.country || 'US');
    const m = h.match(/href="\/store\/apps\/collection\/search_collection_more_results_cluster?(.*?)"/);
    const clusterUrl = m ? m[0].split(/"/)[1] : undefined;
    const base = { ok: false, ids: [], titles: [], developers: [], heroId: undefined, heroGpsId: undefined, heroDroppedBySmar: false, heroDeveloperId: undefined, smarIds: [], smarSearchThrows: false, token: undefined, needsMore: false, clusterUrl, storefront: { ok: sf.ok, lang: sf.lang, country: sf.country, why: sf.why } };
    let secs = null;
    for (const v of Object.values(blobs)) { const s = rpath(v, [0, 1]); if (Array.isArray(s) && s.some((x) => Array.isArray(x) && (x[22] || x[23] || x[25]))) { secs = s.slice(); break; } }
    const rep = gpsSearchReplay(blobs, term);
    base.smarSearchThrows = rep.throws || false; base.smarIds = (rep.ids || []).slice(0, num);
    const drift = (why) => Object.assign(base, { kind: 'drift', why });
    if (!secs) return Object.assign(base, { kind: Object.keys(blobs).length || pageKind(h, { url: o.url }) === 'search' ? 'drift' : 'not_search_page', why: 'no search-sections blob' });
    if (secs[0] && isS(rpath(secs[0], [31, 0]))) secs.shift();
    if (secs[0] && isS(rpath(secs[0], [25, 0, 0, 1, 1]))) secs.shift();
    if (secs[0] && isS(rpath(secs[0], [31, 0]))) secs.shift();
    const onPage = (id) => vis.includes('/store/apps/details?id=' + id);
    const noRes = secs.some((s) => { const t = rpath(s, BANNER); return isS(t) && /^No results for /.test(t); });
    const heroSec = secs[0] && secs[0][23];
    let heroId;
    if (heroSec) {
      heroId = rpath(heroSec, [16, 3, 12, 0, 0]);
      if (!isS(heroId)) { const link = rpath(heroSec, [17, 0, 0, 4, 2]); heroId = isS(link) ? (link.match(/[?&]id=([\w.]+)/) || [])[1] : undefined; }
      if (!isS(heroId) || !APPID_RE.test(heroId) || !onPage(heroId)) return drift('top-result card present but its appId path moved');
    }
    const res = secs.find((s) => Array.isArray(s) && isS(rpath(s, [22, 1, 0])));
    if (!res && secs.some((s) => Array.isArray(rpath(s, [22, 0])))) return drift('app list present but no titled results section (title path moved)');
    const apps = res ? rpath(res, [22, 0]) : [];
    if (!Array.isArray(apps)) return drift('results section found but [22][0] is not a list');
    const ids = apps.map((a) => rpath(a, [0, 0, 0]));
    if (ids.some((id) => !isS(id) || !APPID_RE.test(id) || !onPage(id))) return drift('results-section app id path moved');
    const all = (heroSec ? [heroId] : []).concat(ids), titles = (heroSec ? [rpath(heroSec, [16, 2, 0, 0])] : []).concat(apps.map((a) => rpath(a, [0, 3])));
    const devs = (heroSec ? [rpath(heroSec, [16, 2, 68, 0])] : []).concat(apps.map((a) => rpath(a, [0, 14])));
    // each result's in-app range as the results list shows it (listing anchor, see listingOf)
    const iap = (heroSec ? [rpath(heroSec, [16, 2, 19, 0])] : []).concat(apps.map((a) => rpath(a, [0, 29, 0]))).map((v) => (isS(v) ? v : null));
    if (!all.length && !noRes && idsFromHtml(vis).length) return drift('no results parsed but the page has app links');
    if (!all.length && !noRes) return drift('no results and no Google "No results" banner');
    const gpsHero = heroSec ? rpath(heroSec, [16, 11, 0, 0]) : undefined, token = res ? rpath(res, [22, 1, 3, 1]) : undefined;
    return Object.assign(base, {
      ok: true, kind: all.length ? 'results' : 'no_results', ids: all.slice(0, num), titles: titles.slice(0, num), developers: devs.slice(0, num), iap: iap.slice(0, num), heroId,
      heroGpsId: isS(gpsHero) ? gpsHero : undefined, heroDroppedBySmar: !!heroSec && !isS(gpsHero) && !ids.includes(heroId),
      heroDeveloperId: heroSec && isS(gpsHero) ? String(rpath(heroSec, [16, 2, 68, 1, 4, 2])).split('?id=')[1] : undefined,
      token: isS(token) ? token : undefined, needsMore: all.length < num && isS(token), why: undefined,
    });
  }
  // Verbatim gps processPages.getBodyForRequests (numberOfApps defaults to 100; the token is inserted raw).
  const nextPageBody = (token) => `f.req=%5B%5B%5B%22qnKhOb%22%2C%22%5B%5Bnull%2C%5B%5B10%2C%5B10%2C100%5D%5D%2Ctrue%2Cnull%2C%5B96%2C27%2C4%2C8%2C57%2C30%2C110%2C79%2C11%2C16%2C49%2C1%2C3%2C9%2C12%2C104%2C55%2C56%2C51%2C10%2C34%2C77%5D%5D%2Cnull%2C%5C%22${token}%5C%22%5D%5D%22%2Cnull%2C%22generic%22%5D%5D%5D`;
  // gps REQUEST_MAPPINGS (apps [0,0,0], token [0,0,7,1]) + appList MAPPINGS (appId [12,0], title [2]).
  function parseNextPage(text) {
    let data;
    try { const input = JSON.parse(String(text).substring(5)); data = JSON.parse(input[0][2]); } catch (e) { return { ok: false, why: 'unparseable qnKhOb response', ids: [], titles: [], smarThrows: 'pagination_json' }; }
    if (data === null) return { ok: true, ids: [], titles: [], token: undefined, end: true };
    const list = rpath(data, [0, 0, 0]);
    if (list === undefined) return { ok: true, ids: [], titles: [], token: rpath(data, [0, 0, 7, 1]) };
    if (!Array.isArray(list)) return { ok: false, why: 'qnKhOb app list is not an array', ids: [], titles: [], smarThrows: 'pagination_list' };
    const ids = list.map((a) => rpath(a, [12, 0])), titles = list.map((a) => rpath(a, [2]));
    let smarThrows = false;
    for (const a of list) { if (typeof rpath(a, [4, 0, 0, 1, 4, 2]) !== 'string') smarThrows = 'pagination_developer_link'; const pr = rpath(a, [7, 0, 3, 2, 1, 0, 2]); if (pr !== undefined && !(typeof pr === 'string' && /[0-9.,]+/.test(pr))) smarThrows = 'pagination_price'; try { new URL(rpath(a, [9, 4, 2]), BASE); } catch (e) { smarThrows = 'pagination_url'; } }
    if (ids.some((id) => !isAppId(id))) return { ok: false, why: 'qnKhOb app id path moved', ids: [], titles: [], smarThrows };
    const token = rpath(data, [0, 0, 7, 1]);
    return { ok: true, ids, titles, token: typeof token === 'string' ? token : undefined, smarThrows };
  }

  // ---------------------------------------------------------------- X9 SMAR compat (D1)
  // Frozen copy of gps 9.2.0 scriptData.parse (its own regexes, literal keys; JSON.parse failures throw).
  function gpsParse(html) {
    const out = {}, ms = html.match(/>AF_initDataCallback[\s\S]*?<\/script/g);
    for (const data of ms || []) { const k = data.match(/(ds:.*?)'/), v = data.match(/data:([\s\S]*?), sideChannel: {}}\);<\//); if (k && v) out[k[1]] = JSON.parse(v[1]); }
    return out;
  }
  // Syntax check of AF_dataServiceRequests, which gps eval()s (a parse failure there makes app() throw). Never evaluates it.
  function jsLiteralOk(s) {
    let i = 0;
    const ws = () => { while (/\s/.test(s[i] || '')) i++; }, fail = () => { throw 0; };
    const str = () => { const q = s[i++]; while (i < s.length && s[i] !== q) { if (s[i] === '\\') i++; i++; } if (s[i++] !== q) fail(); };
    const val = () => {
      ws(); const c = s[i];
      if (c === '{' || c === '[') { const close = c === '{' ? '}' : ']'; i++; ws(); while (s[i] !== close) { if (c === '{') { ws(); if (s[i] === '"' || s[i] === "'") str(); else { const m = /^[A-Za-z_$][\w$]*|^\d+/.exec(s.slice(i)); if (!m) fail(); i += m[0].length; } ws(); if (s[i++] !== ':') fail(); } val(); ws(); if (s[i] === ',') { i++; ws(); } else if (s[i] !== close) fail(); } i++; return; }
      if (c === '"' || c === "'") return str();
      const m = /^(?:-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|true|false|null|undefined)/.exec(s.slice(i)); if (!m) fail(); i += m[0].length;
    };
    try { val(); ws(); return i >= s.length; } catch (e) { return false; }
  }
  // C3: would google-play-scraper 9.2.0 app() throw on this page (SMAR silently drops the row)? Replays every
  // throw point of lib/app.js + mappingHelpers on the literal 'ds:5' key with R.path semantics. Never uses PATHS/heal.
  function smarLibWouldThrow(html) {
    if (typeof html !== 'string') return 'no_page';
    let p;
    try { p = gpsParse(html); } catch (e) { return 'blob_json'; }
    const sr = (html.match(/; var AF_dataServiceRequests[\s\S]*?; var AF_initDataChunkQueue/g) || [])[0], sv = sr && sr.match(/{'ds:[\s\S]*}}/g);
    if (sv && !jsLiteralOk(sv[0])) return 'service_requests';
    const d = rpath(p['ds:5'], [1, 2]), g = (q) => rpath(d, q);
    if (typeof (g([12, 0, 0, 1]) || g([72, 0, 1])) !== 'string') return 'description';
    const h = g([51, 1]); if (h) for (const i of [1, 2, 3, 4, 5]) if (h[i] == null) return 'histogram';
    for (const q of [[140, 1, 1, 0, 0, 1], [140, 1, 1, 0, 1, 1]]) { const t = g(q); if (t && typeof t !== 'string') return 'android_version'; }
    if (typeof g([68, 1, 4, 2]) !== 'string') return 'developer_link';
    const cat = (a) => { if (a === null || a.length === 0) return; if (a.length >= 4 && typeof a[0] === 'string') return; a.forEach((s) => cat(s)); };
    try { cat(g([118])); } catch (e) { return 'categories'; }
    const sc = g([78, 0]); if (sc !== null && !Array.isArray(sc)) return 'screenshots';
    const cm = rpath(p['ds:8'], [0]); if (cm && !Array.isArray(cm)) return 'comments';
    return false;
  }
  // Frozen gps 9.2.0 key orders + jsonToCsv exclusions/renames: compat headers are REPLAYED, never hard-coded.
  const GPS_APP_KEYS = 'title description descriptionHTML summary installs minInstalls maxInstalls score scoreText ratings reviews histogram price originalPrice discountEndDate free currency priceText available offersIAP IAPRange androidVersion androidVersionText androidMaxVersion developer developerId developerEmail developerWebsite developerAddress privacyPolicy developerInternalID genre genreId categories icon headerImage screenshots video videoImage previewVideo contentRating contentRatingDescription adSupported released updated version recentChanges comments preregister earlyAccessEnabled isAvailableInPlayPass appId url'.split(' ');
  const GPS_CARD_KEYS = { more: 'title appId url icon developer currency price free summary scoreText score'.split(' '), hero: 'title appId url icon developer developerId currency price free summary scoreText score'.split(' ') };
  const GPS_EXCLUDE = 'free scoreText installs genre androidMaxVersion previewVideo criterias userName userImage comments descriptionHTML updated contentRatingDescription videoImage video screenshots headerImage familyGenreID familyGenre developerInternalID androidVersionText histogram minInstalls priceText description categories preregister earlyAccessEnabled isAvailableInPlayPass similarityScore permissions'.split(' ');
  const fixColumn = (c) => c.replace('title', 'appName').replace('summary', 'description').replace('score', 'avgRating').replace('source', 'scrapedFrom').replace('maxInstalls', 'approximateInstalls').replace('ratings', 'totalRatings').replace('reviews', 'totalReviews').replace('available', 'downloadable').replace('offersIAP', 'inAppPurchases').replace('IAPRange', 'inAppPurchasesPriceRange').replace('androidVersion', 'androidMinVersion').replace('privacyPolicy', 'privacyPolicyURL').replace('adSupported', 'inAppAdvertisements').replace('released', 'originalReleaseDate').replace('version', 'currentAppVersion').replace('recentChanges', 'currentVersionChanges');
  // Key order of the object SMAR hands to jsonToCsv: {...searchCard, country, source, ...app()} | {...app(), country, source} | list() app (+permissions).
  function replayKeys(card) {
    if (card === 'chart') return GPS_APP_KEYS.concat('permissions');
    if (card === 'app') return GPS_APP_KEYS.concat('country', 'source');
    const c = GPS_CARD_KEYS[card] || GPS_CARD_KEYS.more;
    return c.concat('country', 'source', GPS_APP_KEYS.filter((k) => !c.includes(k)));
  }
  const replayColumns = (card) => replayKeys(card).filter((k) => !GPS_EXCLUDE.includes(k)).concat('dateScraped');
  [['more', HEADER], ['app', HEADER_APPID_QUERY], ['chart', CHART_HEADER]].forEach(([c, h]) => { if (replayColumns(c).map(fixColumn).join() !== h.join()) throw new Error(`extract_play: ${c} header replay != expected`); });
  const sortRows = (rows) => rows.slice().sort((a, b) => (a._seq == null ? Infinity : a._seq) - (b._seq == null ? Infinity : b._seq));
  // SMAR's row set and order (C4/C5): primary list then related lists in order; SMAR-dropped heroes and lib-throw
  // pages skipped; first occurrence wins; label by the list it first appears in. ids/rerun: queue order; chart: all.
  function smarCompatRows(rows, searches, o) {
    o = o || {};
    const mode = o.mode || 'search', drop = o.smarDrop || {}, by = {}, out = [];
    for (const r of sortRows(rows)) if (!by[r.appId]) by[r.appId] = r;
    const as = (r, card, src) => Object.assign({}, r, { scrapedFrom: src, _card: card });
    if (mode === 'chart') return sortRows(rows).map((r) => as(r, 'chart', r.scrapedFrom));
    if (mode !== 'search' || o.appIdQuery) {
      for (const r of sortRows(rows)) if (!drop[r.appId] && !out.some((x) => x.appId === r.appId)) out.push(as(r, o.appIdQuery ? 'app' : 'more', r.scrapedFrom === IDS_LABEL ? 'keyword search' : r.scrapedFrom));
      return out;
    }
    const seen = new Set();
    for (const s of searches || []) {
      if (s.smarSearchThrows || s.drift) continue; // primary: SMAR HTTP 500 (handled by compatExact); related: SMAR's inner try
      const src = s.kind === 'primary' ? 'keyword search' : 'similar app links';
      (s.ids || []).forEach((id, i) => {
        const hero = i === 0 && s.heroId != null;
        if (hero && !s.heroGpsId) return; // gps cannot read the hero's appId: app({appId:undefined}) throws
        const r = by[id];
        if (!r || drop[id] || seen.has(id)) return;
        seen.add(id); out.push(as(r, hero ? 'hero' : 'more', src));
      });
    }
    return out;
  }
  function smarWouldDrop(rows, searches, o) {
    o = o || {};
    const keep = new Set(smarCompatRows(rows, searches, o).map((x) => x.appId)), drop = o.smarDrop || {}, out = [], seen = new Set();
    const prim = (searches || [])[0];
    for (const r of sortRows(rows)) {
      if (keep.has(r.appId) || seen.has(r.appId)) continue; seen.add(r.appId);
      let reason = drop[r.appId] ? 'lib_throws:' + drop[r.appId] : prim && prim.smarSearchThrows && o.mode !== 'chart' && o.mode !== 'ids' && o.mode !== 'rerun' ? 'search_http500' : 'hero_card', q;
      if (reason === 'hero_card') { const s = (searches || []).find((x) => x.heroId === r.appId && !x.heroGpsId); q = s && s.q; if (!s) reason = 'not_in_smar_lists'; }
      out.push(q ? { appId: r.appId, reason, q } : { appId: r.appId, reason });
    }
    return out;
  }
  const NO_FILE = ['smar_http500_search', 'smar_http500_chart', 'smar_http500_empty', 'smar_http400_empty_query'];
  // Verbatim jsonToCsv port: header = keys of the FIRST compat row (replayed) minus exclusions + dateScraped,
  // renamed; each cell "${cleanText(v)}" (from _smar where SMAR differs); a key the row lacks is a bare ''.
  function toCsvCompat(rows, o) {
    o = o || {};
    const ex = o.compatExact || { ok: true, reasons: [] }, list = smarCompatRows(rows, o.searches, o);
    const dropped = smarWouldDrop(rows, o.searches, o);
    if (ex.reasons.some((r) => NO_FILE.includes(r.code)) || !list.length) return { csv: null, rows: 0, dropped, compatExact: ex };
    const chart = o.mode === 'chart' || o.layout === 'chart', cols = replayColumns(chart ? 'chart' : list[0]._card), stamp = String(smarDate(o.now));
    const lines = list.map((row) => {
      const keys = new Set(replayKeys(chart ? 'chart' : row._card));
      return cols.map((k) => {
        if (k === 'dateScraped') return stamp;
        if (!keys.has(k)) return '';
        const c = fixColumn(k);
        return `"${row._smar && own(row._smar, c) ? row._smar[c] : String(row[c]).replace(/"/g, '""')}"`;
      }).join(',');
    });
    const csv = bomFor(o.layout || o.mode || 'search', true) + [cols.map((k) => `"${fixColumn(k)}"`).join(',')].concat(lines).join('\n');
    return { csv, rows: list.length, dropped, compatExact: ex };
  }
  function toCsvFile(rows, o) {
    o = o || {};
    if (o.compat) return toCsvCompat(rows, o);
    return { csv: toCsv(sortRows(rows), { layout: o.layout === 'chart' ? 'chart' : 'search', now: o.now }), rows: rows.length, dropped: [], compatExact: o.compatExact || { ok: true, reasons: [] } };
  }

  // ---------------------------------------------------------------- X14 HTTP policy (shared by every request type)
  const POLICY = freeze({ gapMs: 250, searchGapMs: 500, timeoutMs: 20000, tries: 5, backoffBaseMs: 1500, backoffCapMs: 30000, jitter: [0.75, 1.25] });
  const CLOCK = { last: 0, chain: Promise.resolve() }; // shared by every makeGet/makePost: one request in flight, gap between all
  function makeReq(fetchImpl, o, method) {
    o = o || {};
    const P = Object.assign({}, POLICY, o.policy || {}), base = o.base == null ? BASE : o.base;
    const sleep = o.sleep || ((ms) => new Promise((z) => setTimeout(z, ms))), now = o.now || (() => Date.now()), rnd = o.random || Math.random;
    const clock = o.clock || CLOCK;
    const nodeHdr = typeof window === 'undefined' ? { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US' } : {};
    async function once(url, body, opt) {
      opt = opt || {};
      const abs = /^https?:/i.test(url) ? url : base + url, gap = opt.gap == null ? P.gapMs : opt.gap, tries = opt.tries || P.tries;
      let lastErr;
      for (let i = 0; i < tries; i++) {
        const wait = clock.last + gap - now(); if (wait > 0) await sleep(wait);
        const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), P.timeoutMs) : null;
        let res, text = null, status = 0, finalUrl = abs, retryAfter = 0;
        try {
          const init = Object.assign({}, o.init || {}, { method, signal: ac ? ac.signal : undefined, headers: Object.assign({}, nodeHdr, method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' } : {}, (o.init || {}).headers || {}) });
          if (body != null) init.body = body;
          res = await fetchImpl(abs, init);
          if (res.type === 'opaqueredirect') throw new RateLimited(`interstitial redirect on ${abs} (consent or /sorry page); stopping without retries`, 'INTERSTITIAL');
          status = res.status; finalUrl = res.url || abs;
          const ra = res.headers && typeof res.headers.get === 'function' ? res.headers.get('retry-after') : null;
          if (ra) retryAfter = /^\d+$/.test(ra) ? +ra * 1000 : Math.max(0, Date.parse(ra) - Date.now()) || 0;
          text = await res.text();
        } catch (e) {
          if (e && e.code === 'INTERSTITIAL') { clock.last = now(); throw e; }
          lastErr = e; status = 0;
        } finally { if (timer) clearTimeout(timer); clock.last = now(); }
        const kind = pageKind(text, { status, url: finalUrl });
        if (kind === 'sorry') throw new RateLimited(`Google answered with its "unusual traffic" (/sorry) page for ${abs}`, 'SORRY');
        if (kind === 'consent') throw new RateLimited(`Google redirected ${abs} to a consent page`, 'CONSENT');
        if (status === 404) return { status: 404, text: null, url: finalUrl };
        if (status && status !== 429 && status < 500) return { status, text, url: finalUrl };
        lastErr = lastErr || E('HTTP_' + status, `HTTP ${status} for ${abs}`);
        if (i < tries - 1) {
          const back = Math.min(120000, Math.max(retryAfter, Math.min(P.backoffCapMs, P.backoffBaseMs * 2 ** i) * (P.jitter[0] + rnd() * (P.jitter[1] - P.jitter[0]))));
          // o.deadline (the end of a Node call's --max-seconds): a backoff that would end past it is not slept; the
          // request stops with DEADLINE (the caller saves and exits 3; its resume retries the request). 429 keeps its ladder.
          if (o.deadline != null && status !== 429 && now() + back >= o.deadline) throw E('DEADLINE', `stopped retrying ${abs} at the time limit after ${i + 1} tries (${(lastErr && (lastErr.code || lastErr.message)) || 'HTTP ' + status})`);
          await sleep(back);
        }
      }
      if (lastErr && lastErr.name === 'AbortError') throw E('TIMEOUT', `timed out after ${P.timeoutMs} ms: ${abs}`);
      if (/^HTTP_429$/.test(lastErr && lastErr.code)) throw new RateLimited(`HTTP 429 after ${tries} tries: ${abs}`, 'RATE_LIMITED');
      throw lastErr && lastErr.code ? lastErr : E('HTTP_0', `network error after ${tries} tries: ${abs}: ${lastErr && lastErr.message}`);
    }
    // strictly sequential: one request in flight per fetch implementation
    const run = (url, body, opt) => { const p = clock.chain.then(() => once(url, body, opt)); clock.chain = p.catch(() => {}); return p; };
    return method === 'POST' ? (url, body, opt) => run(url, body, opt) : (url, opt) => run(url, null, opt);
  }
  const makeGet = (fetchImpl, o) => makeReq(fetchImpl, o, 'GET');
  const makePost = (fetchImpl, o) => makeReq(fetchImpl, o, 'POST');

  // ---------------------------------------------------------------- X11 run engine (both runners call only these)
  const STOPS = { SORRY: 1, CONSENT: 1, INTERSTITIAL: 1, RATE_LIMITED: 1 };
  function newState(o) {
    o = o || {};
    const mode = o.mode;
    if (!['search', 'chart', 'ids', 'rerun'].includes(mode)) throw E('USAGE', 'mode must be search, chart, ids or rerun');
    if (mode === 'search' && !(typeof o.term === 'string' && o.term.trim())) throw E('USAGE', 'search needs a non-empty term');
    const ids = [];
    if (mode === 'ids' || mode === 'rerun') {
      for (const e of o.ids || []) { const [id, src] = Array.isArray(e) ? e : [e]; if (!isAppId(String(id).trim())) throw E('USAGE', `not an app id: "${id}"`); ids.push([String(id).trim(), src || o.source || IDS_LABEL]); }
      if (!ids.length) throw E('USAGE', 'no app ids given');
    }
    const opts = {
      mode, term: mode === 'search' ? o.term : undefined, category: mode === 'chart' ? o.category : undefined, collection: mode === 'chart' ? o.collection : undefined, num: o.num,
      ids: ids.length ? ids : undefined, country: normCountry(o.country), similar: o.similar === undefined ? mode === 'search' : !!o.similar && mode === 'search',
      compat: !!o.compat, paths: canonOverride(o.paths), labels: canonLabels(o.labels), layout: o.layout || (mode === 'chart' ? 'chart' : 'search'), source: o.source, from: o.from,
    };
    return { v: 3, runId: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), rev: 0, opts, startedUTC: new Date().toISOString(), seeded: false, seq: 0, queue: [], done: {}, rows: [], errors: {}, audit: {}, quarantined: {}, unverified: {}, notFound: [], fetchFailed: [], failRounds: {}, wrongStorefront: [], withheldRounds: {}, smarDrop: {}, searches: [], expandIdx: 0, expanded: false, redo: [], appIdQuery: false, appIdQueryFellThrough: false, siteTerm: null, smarWouldInclude: [], chart: null, refetched: [], searchDrift: [], paginationFailed: [], emptyReason: null, recheck: [], ratingCheck: {} };
  }
  const applyRun = (st) => { if (!st || st.v !== 3) throw E('USAGE', 'v2 progress file; start a fresh output'); usePaths(st.opts.paths); useLabels(st.opts.labels); };
  const enqueue = (st, id, src) => { if (st.done[id] || st.queue.some((q) => q[0] === id)) return; st.queue.push([id, src, ++st.seq]); };
  async function runSearch(st, io, q, kind, extra) {
    const C = st.opts.country, U = urls(C), entry = Object.assign({ q, kind, ids: [], titles: [], heroId: undefined, heroGpsId: undefined, heroDroppedBySmar: false, heroDeveloperId: undefined, smarSearchThrows: false, token: undefined, pages: 0, noResults: false, drift: null, storefront: null }, extra || {});
    const page = async (url) => { // HTTP-200 error pages get the detail-page ladder (2 s, 4 s) before counting as drift
      let r, k;
      for (let i = 0; i < 3; i++) { if (i) await io.sleep(2000 * 2 ** (i - 1)); r = await io.get(url, { gap: POLICY.searchGapMs }); entry.pages++; k = pageKind(r.text, { status: r.status, url: r.url }); if (k !== 'error_page') break; }
      return [r, k];
    };
    const flag = (why, sf) => { entry.drift = why; st.searchDrift.push(sf ? { q, kind, why, storefront: true } : { q, kind, why }); return entry; };
    const wrongSf = (sr) => { st.wrongStorefront.push({ id: null, q, kind: 'search', searchKind: kind, titleIdx: entry.titleIdx, why: sr.storefront.why }); entry.storefront = sr.storefront; return flag('wrong storefront: ' + sr.storefront.why, true); };
    const check = (sr) => (sr.kind === 'not_search_page' || sr.why === 'no search-sections blob' ? flag('not a Google Play search page') : !sr.storefront.ok ? wrongSf(sr) : null);
    let [r, k] = await page(U.search(q));
    if (r.status !== 200 || (k !== 'search' && k !== 'unknown')) return flag(`search page kind ${k} (HTTP ${r.status})`);
    let sr = searchResults(r.text, { num: 20, term: q, country: C, url: r.url });
    if (check(sr)) return entry;
    if (sr.clusterUrl) {
      [r, k] = await page(sr.clusterUrl);
      if (r.status !== 200 || (k !== 'search' && k !== 'unknown')) return flag(`cluster page kind ${k} (HTTP ${r.status})`);
      sr = searchResults(r.text, { num: 20, term: q, country: C, url: r.url }); entry.cluster = true;
      if (check(sr)) return entry;
    }
    entry.storefront = sr.storefront;
    if (!sr.ok) return flag(sr.why);
    let ids = sr.ids.slice(), titles = sr.titles.slice(), iap = (sr.iap || []).slice(), token = sr.token, gthrow = sr.smarSearchThrows;
    while (ids.length < 20 && token) { // C18 gps checkFinished
      const pr = await io.post(U.batchexecute('qnKhOb'), nextPageBody(token), { gap: POLICY.searchGapMs }); entry.pages++;
      const np = parseNextPage(pr.text);
      if (np.smarThrows && !gthrow) gthrow = np.smarThrows;
      if (!np.ok) { st.paginationFailed.push({ q, kind, why: np.why }); entry.drift = 'pagination: ' + np.why; break; }
      ids = ids.concat(np.ids); titles = titles.concat(np.titles); iap = iap.concat(np.ids.map(() => null)); token = np.token;
    }
    return Object.assign(entry, { ids: ids.slice(0, 20), titles: titles.slice(0, 20), iap: iap.slice(0, 20), heroId: sr.heroId, heroGpsId: sr.heroGpsId, heroDroppedBySmar: sr.heroDroppedBySmar, heroDeveloperId: sr.heroDeveloperId, smarSearchThrows: gthrow || false, token, noResults: sr.kind === 'no_results' });
  }
  async function seed(st, io) {
    if (st.seeded) return;
    applyRun(st);
    const o = st.opts, C = o.country;
    if (o.mode === 'search') {
      let term = o.term;
      if (o.compat && smarSiteTerm(o.term) !== o.term) { term = smarSiteTerm(o.term); st.siteTerm = term; } // C29 c
      if (!term.trim()) { st.emptyReason = 'smar_http400_empty_query'; st.seeded = true; await io.save(st); return; }
      const s = await runSearch(st, io, term, 'primary');
      st.searches = [s];
      if (isAppId(term)) { // C7: SMAR runs search() first, then app({appId: query})
        const r = await io.get(urls(C).details(term));
        if (r.status === 200 && pageKind(r.text, { status: 200, url: r.url, appId: term }) === 'app' && !smarLibWouldThrow(r.text)) st.appIdQuery = true;
        else st.appIdQueryFellThrough = true;
      }
      if (st.appIdQuery) { enqueue(st, term, 'keyword search'); st.expanded = true; } else {
        for (const id of s.ids) enqueue(st, id, 'keyword search');
        if (!s.ids.length) { st.emptyReason = s.noResults ? 'google_no_results' : st.wrongStorefront.some((w) => w.kind === 'search') ? 'wrong_storefront' : 'search_page_drift'; st.expanded = true; }
        if (!o.similar) st.expanded = true;
      }
    } else if (o.mode === 'chart') {
      if (!io.chart) throw E('USAGE', 'chart mode needs chart_fetch.js (io.chart)');
      const c = await io.chart({ collection: o.collection, category: o.category, num: o.num, country: C });
      // gps list() calls app() on EVERY rank the RPC returns (SMAR slices to num afterwards), and one failing app makes the
      // whole chart HTTP 500. With --smar-compat at seed, ranks beyond num are probed for that prediction only (no rows).
      const ids = c.ids || [], all = Array.isArray(c.allIds) ? c.allIds : ids, extra = all.slice(ids.length);
      st.chart = { collection: o.collection, category: o.category, ranks: ids.length, requested: Number.isInteger(o.num) ? o.num : undefined, ids, iap: (c.iap || []).slice(0, ids.length), pathUsed: c.pathUsed, healed: !!c.healed, empty: !!c.empty, ok: !!c.ok, why: c.why, ranksReturned: Math.max(all.length, c.ranksReturned || 0), extraIds: extra, probe: o.compat ? [] : null, probeQueue: o.compat ? extra.slice() : [] };
      if (!c.ok) st.emptyReason = 'chart_rpc_drift'; else if (c.empty || !(c.ids || []).length) st.emptyReason = 'empty_chart';
      else for (const id of ids) st.queue.push([id, 'chart', ++st.seq]); // every rank, no dedupe (C17)
      st.expanded = true;
    } else { for (const [id, src] of o.ids) enqueue(st, id, src); st.expanded = true; }
    st.seeded = true; await io.save(st);
  }
  // The in-app range this run's own search results or chart list show for an app: a second record Google serves for
  // it, fetched minutes before its details page. Real data: 5,680 of 5,680 listing/details pairs with a range agree, and
  // none has a range on one side only (search results, top-result cards and charts, same capture folders).
  function listingOf(st, id) {
    const seen = new Set(), add = (ids, iap) => (ids || []).forEach((x, i) => { const v = (iap || [])[i]; if (x === id && typeof v === 'string' && IAP_TAIL.test(v)) seen.add(v); });
    for (const s of st.searches || []) add(s.ids, s.iap);
    if (st.chart) add(st.chart.ids, st.chart.iap);
    return seen.size ? { iap: [...seen] } : undefined;
  }
  async function fetchApp(st, io, id, opt) {
    opt = opt || {};
    const C = st.opts.country, url = urls(C).details(id), tries = opt.tries || (st.fetchFailed.length >= 3 ? 1 : 4); // circuit breaker
    let best = null, fieldRetry = false, errPages = 0, prevField = false, lastErr = null;
    for (let i = 0; i < tries + (fieldRetry ? 1 : 0); i++) {
      if (i) await io.sleep(prevField ? 1500 : 2000 * 2 ** (errPages - 1));
      prevField = false;
      let r;
      // makeGet already retried transport failures with backoff: record fetchFailed, never re-run that ladder here
      try { r = await io.get(url); } catch (e) { if (e && STOPS[e.code]) throw e; lastErr = { code: e && e.code, message: String(e && e.message).slice(0, 160) }; break; }
      const kind = r.status === 404 ? 'not_found' : pageKind(r.text, { status: r.status, url: r.url, appId: id });
      if (kind === 'not_found') return { notFound: true, kind }; // a 200 page that is not this app's page ('removed') is retried, then fetchFailed
      if (kind === 'unavailable') { const lib = smarLibWouldThrow(r.text); return { withheld: true, kind, why: 'page says the app is not available in this country', smarWouldInclude: !lib, lib }; }
      if (kind !== 'app') { errPages++; if (errPages >= tries) break; continue; }
      const x = extractApp(r.text, id, { country: C, status: r.status, url: r.url }); x.listing = listingOf(st, id);
      const cand = { x, check: checkApp(x), html: r.text };
      best = pickBetter(best, cand);
      if ((!x.storefront.ok || cand.check.errors.length) && !fieldRetry && !opt.single) { fieldRetry = true; prevField = true; continue; } // one re-fetch: transient locale/A-B pages
      break;
    }
    if (!best) return { failed: true, error: lastErr || undefined };
    if (!best.x.storefront.ok) return { withheld: true, kind: 'storefront', why: best.x.storefront.why };
    if (io.keepHtml) io.keepHtml(id, best.html, { errors: best.check.errors.length, unverified: best.check.unverified.length });
    return { x: best.x, check: best.check };
  }
  function storeApp(st, id, src, seq, x) {
    const f = finalizeApp(x, src, { country: st.opts.country, seq });
    st.rows.push(f.row); st.audit[id] = f.audit;
    if (f.check.errors.length) st.errors[id] = f.check.errors.map((e) => ({ field: e.field, why: e.why, got: e.got })); else delete st.errors[id];
    if (Object.keys(f.quarantined).length) st.quarantined[id] = f.quarantined; else delete st.quarantined[id];
    if (f.check.unverified.length) st.unverified[id] = f.check.unverified; else delete st.unverified[id];
    if (f.smarDrop) st.smarDrop[id] = f.smarDrop; else delete st.smarDrop[id];
  }
  async function detailUnit(st, io) {
    const [id, src, seq] = st.queue[0], r = await fetchApp(st, io, id);
    if (r.notFound) { if (!st.notFound.includes(id)) st.notFound.push(id); }
    else if (r.failed) { st.fetchFailed.push([id, src, seq]); st.failRounds[id] = (st.failRounds[id] || 0) + 1; }
    else if (r.withheld) { st.wrongStorefront.push(Object.assign({ id, src, seq, kind: r.kind, why: r.why }, r.lib ? { lib: r.lib } : {})); if (r.smarWouldInclude && !st.smarWouldInclude.some((w) => w.id === id)) st.smarWouldInclude.push({ id, kind: r.kind }); }
    else { storeApp(st, id, src, seq, r.x); queueRecheck(st, id, src, seq); }
    st.done[id] = 1; st.queue.shift(); await io.save(st);
  }
  // A page with no rating at all is fetched once more after the crawl (rating blanks are confirmed only by a second,
  // later page). The second page replaces the row when it shows a rating and has no more hard errors.
  function queueRecheck(st, id, src, seq) {
    if (!st.ratingCheck) st.ratingCheck = {};
    if (!st.recheck) st.recheck = [];
    if (!(st.audit[id] || {}).unrated || st.ratingCheck[id] || st.recheck.some((q) => q[0] === id)) return;
    st.ratingCheck[id] = 'pending'; st.recheck.push([id, src, seq]);
  }
  async function recheckUnit(st, io) {
    const [id] = st.recheck[0], i = st.rows.findIndex((r) => r.appId === id);
    let verdict = 'failed';
    if (i >= 0) {
      const r = await fetchApp(st, io, id, { tries: 1, single: true });
      if (r.x && unratedPage(r.x)) verdict = 'confirmed';
      else if (r.x && r.check.errors.length <= (st.errors[id] || []).length) {
        const old = st.rows[i]; st.rows.splice(i, 1); storeApp(st, id, old.scrapedFrom, old._seq, r.x); const n = st.rows.pop(); st.rows.splice(i, 0, n); verdict = 'rated';
      } else if (r.x) verdict = 'rated-not-used'; // a rating was shown, but that page failed more checks: the blank stays unconfirmed
    }
    st.ratingCheck[id] = verdict; st.recheck.shift(); await io.save(st);
  }
  const expansionPending = (st) => st.opts.mode === 'search' && st.opts.similar && !st.appIdQuery && !st.expanded;
  async function expansionUnit(st, io) {
    const titles = (st.searches[0] && st.searches[0].titles) || [];
    if (st.expandIdx >= titles.length) { st.expanded = true; await io.save(st); return; }
    const idx = st.expandIdx, q = `related to ${titles[idx]}`; // one related search request per primary search CARD, as SMAR (C6), duplicates included
    const s = await runSearch(st, io, q, 'related', { title: titles[idx], titleIdx: idx });
    st.searches.push(s);
    if (!s.drift) for (const id of s.ids) enqueue(st, id, 'similar app links');
    st.expandIdx = idx + 1; await io.save(st);
  }
  async function redoUnit(st, io) { // re-run a withheld related search (wrong storefront) in place
    const idx = st.redo[0], titles = (st.searches[0] && st.searches[0].titles) || [], q = `related to ${titles[idx]}`;
    const s = await runSearch(st, io, q, 'related', { title: titles[idx], titleIdx: idx }), at = st.searches.findIndex((x) => x.kind === 'related' && x.titleIdx === idx);
    if (at >= 0) st.searches[at] = s; else st.searches.push(s);
    if (!s.drift) for (const id of s.ids) enqueue(st, id, 'similar app links');
    st.redo.shift(); await io.save(st);
  }
  const probePending = (st) => !!(st.chart && st.chart.probeQueue && st.chart.probeQueue.length);
  async function probeUnit(st, io) { // compat chart: would gps app() fail on this rank beyond num? (C29 a)
    const id = st.chart.probeQueue[0];
    let reason;
    try {
      const r = await io.get(urls(st.opts.country).details(id));
      const kind = r.status === 404 ? 'not_found' : pageKind(r.text, { status: r.status, url: r.url, appId: id });
      reason = kind === 'not_found' ? 'not_found' : kind === 'app' || kind === 'unavailable' ? smarLibWouldThrow(r.text) : 'unknown:' + kind;
    } catch (e) { if (e && STOPS[e.code]) throw e; reason = 'unknown:fetch_failed'; }
    st.chart.probe.push([id, reason || false]); st.chart.probeQueue.shift();
    if (reason && !/^unknown:/.test(reason)) st.chart.probeQueue = []; // list() rejects on the first failure: the verdict is known
    await io.save(st);
  }
  const isDone = (st) => !!st.seeded && !st.queue.length && !expansionPending(st) && !(st.redo || []).length && !(st.recheck || []).length && !probePending(st);
  async function advance(st, io, o) {
    o = o || {};
    applyRun(st);
    const budget = o.budget == null ? Infinity : o.budget, deadline = o.deadlineMs == null ? Infinity : o.deadlineMs, now = io.now || (() => Date.now()), t0 = now();
    let units = 0;
    delete st.stopped;
    try {
      if (!st.seeded) { await seed(st, io); units++; }
      for (const r of st.rows) if (!(st.ratingCheck || {})[r.appId]) queueRecheck(st, r.appId, r.scrapedFrom, r._seq); // progress files from before the recheck
      while (units < budget && now() - t0 < deadline) {
        if ((st.redo || []).length) await redoUnit(st, io);
        else if (st.queue.length && (st.queue[0][1] !== 'similar app links' || !expansionPending(st))) await detailUnit(st, io);
        else if (expansionPending(st)) await expansionUnit(st, io);
        else if ((st.recheck || []).length) await recheckUnit(st, io);
        else if (probePending(st)) await probeUnit(st, io);
        else break;
        units++;
      }
      if (st.seeded && !st.queue.length && !st.rows.length && !st.emptyReason && isDone(st) && st.notFound.length && !st.fetchFailed.length && !st.wrongStorefront.length) st.emptyReason = 'all_not_found';
    } catch (e) { if (e && STOPS[e.code]) st.stopped = { code: e.code, message: String(e.message).slice(0, 200) }; try { await io.save(st); } catch (x) { /* keep the original error */ } throw e; }
    return { done: isDone(st), units };
  }
  function requeue(st, which) {
    if (which === 'fetchFailed') { const L = st.fetchFailed.splice(0); for (const q of L.slice().reverse()) { delete st.done[q[0]]; st.queue.unshift(q); } return L.length; }
    if (which !== 'wrongStorefront') throw E('USAGE', 'requeue expects fetchFailed or wrongStorefront');
    const L = st.wrongStorefront.splice(0);
    for (const k of new Set(L.map((w) => w.id || 'search:' + w.q))) st.withheldRounds[k] = (st.withheldRounds[k] || 0) + 1; // rounds already retried
    for (const w of L.slice().reverse()) {
      if (w.kind === 'search') {
        st.searchDrift = st.searchDrift.filter((s) => s.q !== w.q);
        if (w.searchKind === 'primary') { st.seeded = false; st.searches = []; st.emptyReason = null; st.expanded = false; st.expandIdx = 0; } else if (!st.redo.includes(w.titleIdx)) st.redo.push(w.titleIdx);
        continue;
      }
      delete st.done[w.id]; st.queue.unshift([w.id, w.src, w.seq]);
      st.smarWouldInclude = st.smarWouldInclude.filter((x) => x.id !== w.id);
    }
    return L.length;
  }
  // C23: replaces a row only when the new page has fewer hard errors; keeps scrapedFrom and order.
  async function refetch(st, io, ids) {
    applyRun(st);
    if (!isDone(st)) throw E('USAGE', 'the run is not finished; resume it before refetching');
    const out = [];
    for (const id of ids || []) {
      const i = st.rows.findIndex((r) => r.appId === id);
      if (i < 0) { out.push({ id, result: 'unknown_id' }); continue; }
      const old = st.rows[i], before = (st.errors[id] || []).length, r = await fetchApp(st, io, id, { tries: 1, single: true });
      let result = 'kept';
      if (r.notFound) result = 'not_found';
      else if (r.x && r.check.errors.length < before) { st.rows.splice(i, 1); storeApp(st, id, old.scrapedFrom, old._seq, r.x); const n = st.rows.pop(); st.rows.splice(i, 0, n); result = 'replaced'; }
      st.refetched.push({ id, result, errorsBefore: before, errorsAfter: r.check ? r.check.errors.length : null });
      out.push({ id, result }); await io.save(st);
    }
    return out;
  }
  // app name -> package id, decided by the script (D27): exact > prefix (name + optional space + - : – — | ( ).
  async function lookup(io, name, o) {
    o = o || {};
    const C = normCountry(o.country), r = await io.get(urls(C).search(name), { gap: POLICY.searchGapMs }), sr = searchResults(r.text, { num: 20, term: name, country: C, url: r.url });
    if (r.status !== 200 || !sr.ok || !sr.storefront.ok) return { match: 'none', unique: false, candidates: [], why: !sr.storefront.ok ? 'wrong storefront: ' + sr.storefront.why : sr.why || 'HTTP ' + r.status };
    const nn = (s) => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim(), want = nn(name), seen = new Set(), c = [];
    const lvl = (t) => (nn(t) === want ? 2 : new RegExp('^' + reEsc(want) + '\\s*[-:–—|(]').test(nn(t)) ? 1 : 0);
    sr.ids.forEach((id, i) => { if (!seen.has(id)) { seen.add(id); c.push({ appId: id, title: sr.titles[i], developer: sr.developers[i], l: lvl(sr.titles[i]) }); } });
    let best = Math.max(0, ...c.map((x) => x.l)), rule;
    // Leading words: Google's FIRST result is the only title that starts with the whole name, followed by more words
    // ("Strong Workout Tracker" -> "Strong Workout Tracker Gym Log"). Only for names of 2+ words and 10+ letters with
    // a word that is not a generic app word, so a short or generic name ("Workout Tracker", "Photo Editor") never resolves.
    const bare = (w) => w.replace(/[^\p{L}\p{N}]/gu, ''), words = want.split(' ');
    if (!best && c.length && nn(c[0].title).startsWith(want + ' ') && words.length >= 2 && bare(want).length >= 10 && words.some((w) => bare(w) && !GENERIC_NAME_WORDS.has(bare(w))) && c.slice(1).every((x) => !nn(x.title).startsWith(want))) { c[0].l = 1; best = 1; rule = 'leading-words'; }
    const top = c.filter((x) => x.l === best).length;
    const cands = c.slice().sort((a, b) => b.l - a.l).slice(0, 5).map(({ appId, title, developer }) => ({ appId, title, developer }));
    return Object.assign({ match: best === 2 ? 'exact' : best === 1 ? 'prefix' : 'none', unique: best > 0 && top === 1, candidates: cands }, rule ? { rule } : {});
  }
  const GENERIC_NAME_WORDS = new Set(('app apps free pro lite plus premium mobile android game games play the a an and of for my your with by to in on ' +
    'tracker track tracking workout workouts fitness gym exercise exercises log logger planner plan diary journal notes note todo list ' +
    'photo photos video videos editor edit maker music player radio camera gallery scanner pdf reader viewer file files manager ' +
    'calculator calendar clock alarm timer weather news browser vpn keyboard launcher theme themes wallpaper wallpapers chat messenger ' +
    'translator dictionary learn learning english language budget money expense finance bank wallet shop shopping food recipe recipes ' +
    'health sleep meditation step steps counter map maps gps navigation offline online puzzle puzzles word words card cards solitaire ' +
    'chess classic simple easy best new tv remote control cleaner booster battery security antivirus lock password').split(' '));

  // ---------------------------------------------------------------- X12 drift report and summary
  const SIGNAL_FIELDS = { releasedFormatBad: 'released', releasedAfterUpdated: 'released', releasedEqUpdated: 'released', versionEqScoreText: 'version', reviewsGeRatings: 'reviews', reviewsIsHistBucket: 'reviews', maxEqMin: 'maxInstalls', iapRangeFormatBad: 'offersIAPRange', googlePolicyOnNonGoogleApp: 'privacyPolicy', genreIdNotUpperSnake: 'genreId', emailNoAt: 'developerEmail', downloadableFalse: 'available', versionNoValue: 'version', androidNoValue: 'androidVersionText', versionSharedAcrossApps: 'version', iapRangeSharedAcrossApps: 'offersIAPRange', versionEqAndroid: 'version', releasedAfterReview: 'released' };
  const RARE = ['originalPrice', 'discountEndDate'], STRONG = ['reviewsGeRatings'];
  function compatExactOf(st) {
    const o = st.opts, R = [];
    let bad = null;
    if (o.mode === 'chart' && st.chart) {
      const c = st.chart; bad = [...new Set(st.rows.filter((r) => st.smarDrop[r.appId]).map((r) => r.appId + ':' + st.smarDrop[r.appId]))];
      for (const id of st.notFound) bad.push(id + ':not_found');
      for (const w of st.wrongStorefront) if (w.lib) bad.push(w.id + ':' + w.lib);
      for (const [id, why] of c.probe || []) if (why && !/^unknown:/.test(why)) bad.push(id + ':' + why + ' (rank beyond num)');
      const unknown = (c.probe || []).filter(([, why]) => /^unknown:/.test(why || '')).map(([id]) => id);
      // count = every app that breaks SMAR (the detail names the first 10; the full list is summary.smarChartHttp500Apps)
      if (bad.length) R.push({ code: 'smar_http500_chart', count: bad.length, detail: `gps list() calls app() on every returned rank and fails on ${bad.length} app(s) (${bad.length > 10 ? 'first 10: ' : ''}${bad.slice(0, 10).join(', ')}; all ${bad.length} in smarChartHttp500Apps), so smar-tool.org returns HTTP 500 for the whole chart` });
      else if ((c.ranksReturned || 0) > c.ranks && (!c.probe || probePending(st) || unknown.length || (c.extraIds || []).length < c.ranksReturned - c.ranks)) R.push({ code: 'smar_chart_ranks_unchecked', detail: `Google returned ${c.ranksReturned} ranks; SMAR loads all of them and returns HTTP 500 if any cannot be read, but ranks ${c.ranks + 1}-${c.ranksReturned} were ${unknown.length ? 'not readable (' + unknown.slice(0, 5).join(',') + ')' : 'not checked'}; start the run with --smar-compat to check them` });
    }
    if (o.mode === 'search') {
      const p = st.searches[0];
      if (st.emptyReason === 'smar_http400_empty_query') R.push({ code: 'smar_http400_empty_query', detail: 'smar-tool.org receives an empty query for this term' });
      if (p && p.smarSearchThrows) R.push({ code: 'smar_http500_search', detail: 'gps search() throws (' + p.smarSearchThrows + '), so smar-tool.org returns HTTP 500 with no file' });
      if (o.term && smarSiteTerm(o.term) !== o.term && (!st.siteTerm || o.term.includes('#'))) R.push({ code: 'site_term_mangled', detail: `smar-tool.org searches "${smarSiteTerm(o.term)}"` + (o.term.includes('#') ? ' and drops countryCode ("#")' : '') });
    }
    if (st.smarWouldInclude.length) R.push({ code: 'smar_would_include', detail: st.smarWouldInclude.map((w) => w.id).join(',') });
    if (st.rows.length && !R.some((r) => NO_FILE.includes(r.code)) && !smarCompatRows(st.rows, st.searches, { mode: o.mode, smarDrop: st.smarDrop, appIdQuery: st.appIdQuery }).length) R.push({ code: 'smar_http500_empty', detail: 'every row is one SMAR drops, so smar-tool.org returns HTTP 500' });
    const ex = { ok: !R.length, reasons: R };
    if (bad && bad.length) Object.defineProperty(ex, 'chartApps', { value: bad }); // the full list, never serialized here
    return ex;
  }
  // FI-12: every app the progress file marks done has a row, unless it was not found, failed or withheld; every row was
  // marked done; no app has more rows than the run asked for (one per app; a chart repeats an id only as often as its list
  // does); and every app the run's own lists name (the ids given, the search results enqueued, the chart ranks) is done
  // or still queued. rows, done and the queue are saved together, so anything else is an edited, rolled-back or copied
  // progress file whose rows cannot be trusted (STOP).
  // A run killed before seed() saved its options only: its lists are queued when the resume seeds it, so nothing is
  // unlisted yet; such a file holds no row, done mark or queued app (seed() saves the queue and seeded together, and a
  // retried withheld primary search had no results to queue), so any of them is an edit (early). One exception: a
  // search for an app id (C7 appIdQuery) queues that id even when its primary search was withheld, and retrying that
  // search (requeue) un-seeds the run after the id's row and done mark exist; a kill or 429 during the re-seed leaves
  // them on an unseeded file, so that one id (and nothing else) is not early there.
  function progressCheck(st) {
    const o = st.opts, ch = o.mode === 'chart' ? (st.chart && st.chart.ids) || [] : null, k = {}, fid = new Set(st.fetchFailed.map((q) => q[0])), wid = new Set(st.wrongStorefront.map((w) => w.id).filter(Boolean)), q = new Set(st.queue.map((x) => x[0]));
    for (const r of st.rows) k[r.appId] = (k[r.appId] || 0) + 1;
    const lost = Object.keys(st.done).filter((id) => !k[id] && !st.notFound.includes(id) && !fid.has(id) && !wid.has(id)), extra = Object.keys(k).filter((id) => !st.done[id]);
    const dup = Object.keys(k).filter((id) => k[id] > (ch ? ch.filter((x) => x === id).length : 1));
    const want = !st.seeded ? [] : ch || (o.mode === 'search' ? (st.appIdQuery ? [] : [].concat(...st.searches.filter((s, i) => !i || !s.drift).map((s) => s.ids || []))) : (o.ids || []).map((e) => e[0]));
    const unlisted = [...new Set(want)].filter((id) => !st.done[id] && !q.has(id));
    const qt = o.mode === 'search' ? st.siteTerm || o.term : null, reseedId = !st.seeded && st.appIdQuery && qt && (st.withheldRounds || {})['search:' + qt] >= 1 ? qt : null;
    const early = st.seeded ? [] : [...new Set(Object.keys(k).concat(Object.keys(st.done), [...q]))].filter((id) => id !== reseedId);
    return { bad: !!(lost.length || extra.length || dup.length || unlisted.length || early.length), lost, extra, dup, unlisted, early };
  }
  // A field's drifting causes (an entry carries one cause, or several under `causes`).
  const driftCauses = (e) => (e.causes || [e]).filter((c) => c.likelyLayoutDrift);
  // validationFailures is keyed by PATHS field (contract 3.6); each entry names its cause and the CSV columns it feeds.
  // Causes: value (hard check failed), anchor (the independent anchor is gone: fix the anchor, not PATHS),
  // blank (raw value missing on many rows), signal (soft plausibility signal), page (run-level pattern), noSale.
  // Page-level drift with no single field (wrapper, chart list) goes to pageDrift.
  function driftReport(st, ctx) {
    ctx = ctx || {};
    const o = st.opts, compat = ctx.compat == null ? o.compat : ctx.compat, A = [];
    for (const r of st.rows) if (st.audit[r.appId] && !A.some((x) => x.id === r.appId)) A.push(Object.assign({ id: r.appId }, st.audit[r.appId]));
    const n = A.length, VF = {}, UV = {}, PD = {}, problems = [], subs = {};
    const push = (f, s) => (subs[f] = subs[f] || []).push(s);
    const cnt = (sel) => { const m = {}; for (const a of A) for (const k of new Set(sel(a))) (m[k] = m[k] || []).push(a.id); return m; };
    const fail = cnt((a) => a.failed.filter((f) => !(a.noSale || []).includes(f))), inf = cnt((a) => a.informative.filter((f) => !(a.noSale || []).includes(f)));
    for (const [f, ids] of Object.entries(cnt((a) => a.noSale || []))) push(f, { cause: 'noSale', apps: ids.length, likelyLayoutDrift: false, sample: ids.slice(0, 5), note: 'value present but the page shows no sale: cell quarantined' });
    for (const [f, ids] of Object.entries(fail)) {
      const k = ids.length, I = Math.max(k, (inf[f] || []).length);
      const drift = f === 'updatedText' ? k >= 1 : RARE.includes(f) ? k >= Math.max(1, Math.ceil(0.5 * I)) : (k >= 2 && k >= Math.ceil(0.1 * I)) || k === I;
      const e = { cause: 'value', apps: k, informative: I, likelyLayoutDrift: drift, sample: ids.slice(0, 5) };
      if (f === 'offersIAPRange' || f === 'adSupported') { const lk = f === 'offersIAPRange' ? 'iap' : 'ads'; if (A.filter((a) => a.failed.includes(f)).every((a) => (a.labelMissing || []).includes(f)) && !A.some((a) => a.labels && a.labels[lk])) Object.assign(e, { cause: 'anchor', anchor: lk + 'Label' }); }
      push(f, e);
    }
    for (const lk of ['iap', 'ads']) { const jt = A.filter((a) => a.json && a.json[lk]); if (jt.length >= 3 && !jt.some((a) => a.labels && a.labels[lk])) push(lk === 'iap' ? 'offersIAPRange' : 'adSupported', { cause: 'anchor', anchor: lk + 'Label', apps: jt.length, informative: jt.length, likelyLayoutDrift: true, sample: jt.slice(0, 5).map((a) => a.id) }); }
    // (b) anchor liveness: a value whose anchor is missing is unverified; on >= 50% of the rows consulting it, the anchor died.
    const need = {}, miss = {}, unvBy = {};
    for (const a of A) {
      for (const [k, ok] of Object.entries(a.anchors || {})) { (need[k] = need[k] || []).push(a.id); if (!ok) (miss[k] = miss[k] || []).push(a.id); }
      for (const u of a.unverified || []) ((unvBy[u.anchor] = unvBy[u.anchor] || {})[u.field] = unvBy[u.anchor][u.field] || []).push(a.id);
    }
    for (const [k, ids] of Object.entries(miss)) {
      const of = (need[k] || []).length, drift = ids.length >= Math.max(1, Math.ceil(0.5 * of));
      UV[k] = { apps: ids.length, of, likelyLayoutDrift: drift, sample: ids.slice(0, 5) };
      if (drift) for (const [f, fi] of Object.entries(unvBy[k] || {})) push(f, { cause: 'anchor', anchor: k, apps: fi.length, informative: of, likelyLayoutDrift: true, sample: fi.slice(0, 5) });
    }
    // (e)/(f): >=3 rows and >=25%, or >=50% (n>=3). Max legit rate in 149 real 20/50/200-row runs: blank 20%, signal 15%.
    // A strong signal (0 of 8,820 real pages) needs one row.
    // Short "Updated on"-only pages (shortDetail) lack version, Android version and release date by shape: they leave the
    // numerator (finalizeApp/checkApp) and the denominator of those three fields.
    // They are excused only while they are not half of a run of 20+ apps (max seen: 10 of 29): beyond that the short shape
    // itself is the drift (Google no longer sends these fields), so they count again and the three fields are page drift.
    const shortIds = A.filter((a) => a.shortDetail).map((a) => a.id), SHORT_F = ['version', 'androidVersionText', 'released'];
    const shortMajority = n >= 20 && shortIds.length >= 0.5 * n, nShort = shortMajority ? 0 : shortIds.length;
    if (shortMajority) {
      for (const a of A) if (a.shortDetail) { a.rawEmpty = a.rawEmpty.concat(a.rawEmpty.includes('released') ? [] : ['released']); a.signals = a.signals.concat(['versionNoValue', 'androidNoValue'].filter((s) => !a.signals.includes(s))); }
      for (const f of SHORT_F) push(f, { cause: 'page', note: `shortMajority: ${shortIds.length} of ${n} pages are the short "Updated on"-only shape (no version, Android version or release date); never seen on half of a run of 20+ apps, so Google probably stopped sending these fields`, apps: shortIds.length, likelyLayoutDrift: true, sample: shortIds.slice(0, 5) });
    }
    const soft = (k, f) => { const m = SHORT_F.includes(f) ? n - nShort : n; return (m >= 3 && k >= 0.5 * m) || (k >= 3 && k >= 0.25 * m); };
    // A blank needs 3+ apps: some apps legitimately lack a release date (about 1% of real pages), so 2 of a 3-4 app run
    // (0.07% of random real 4-app runs) are not drift; a moved path blanks the field on every app.
    for (const [f, ids] of Object.entries(cnt((a) => a.rawEmpty))) if (ids.length >= 3 && soft(ids.length, f)) push(f, { cause: 'blank', apps: ids.length, likelyLayoutDrift: true, sample: ids.slice(0, 5) });
    // Small runs: when fewer than 3 apps of the run carry a field, soft() cannot judge it, so a signal that is drift evidence
    // on a larger run would ship as read. Those signalled cells are quarantined instead (written "undefined", listed in
    // smallRun). Real base rates: reviewsIsHistBucket 0.1%, versionEqAndroid 0.06%, versionEqScoreText 0.02%, every other
    // signal 0 of 9,140 pages (8 of 3,243 real 1-app runs withhold a cell). releasedEqUpdated (2.3%: never-updated apps)
    // is never quarantined: checkApp fails an update record in the release slot per page when a review card is more than
    // a year older, and a never-updated app keeps its date.
    const SR = {}, NOQ = ['versionNoValue', 'androidNoValue', 'releasedEqUpdated'], rowOf = new Map();
    for (const r of st.rows) if (!rowOf.has(r.appId)) rowOf.set(r.appId, r);
    const val = (r, col) => r && !['undefined', 'VARY', '', 'null'].includes(r[col]) && !/^Varies with device$/i.test(r[col]);
    const carriers = (f) => { const cs = FEEDS[f] || [], col = cs[cs.length - 1]; return A.filter((a) => val(rowOf.get(a.id), col)).length; };
    const sq = (f, ids, s) => { for (const id of ids) for (const c of s === 'iapRangeSharedAcrossApps' ? ['inAppPurchasesPriceRange'] : FEEDS[f] || []) (SR[id] = SR[id] || {})[c] = s; }; // a shared range: the label-verified boolean stays
    const sig = (s, f, ids, drift, sm) => { const small = sm != null ? sm : !drift && !NOQ.includes(s) && carriers(f) < 3; if (small) sq(f, ids, s); push(f, Object.assign({ cause: 'signal', signal: s, apps: ids.length, likelyLayoutDrift: drift, sample: ids.slice(0, 5) }, small ? { smallRun: true } : {})); };
    // releasedEqUpdated is on 2.3% of real pages (never-updated apps): two of them in a 3-4 app run (0.13% / 0.3% of random
    // real runs) are not drift; a release path moved onto the update record puts the update date on every app (3+ needed).
    for (const [s, ids] of Object.entries(cnt((a) => a.signals))) sig(s, SIGNAL_FIELDS[s], ids, STRONG.includes(s) ? ids.length >= 1 : soft(ids.length, SIGNAL_FIELDS[s]) && (s !== 'releasedEqUpdated' || ids.length >= 3));
    // One value on apps of different developers in a slot that is per-app data is a constant the slot now holds, not data.
    // Version texts are diverse (three random apps share one 0.0003% of the time): drift when one string is on >= 3 apps of
    // >= 3 developers and half the apps with a version. In-app ranges are not ("$0.99 - $99.99 per item" is 10% of apps):
    // drift only when one range is on >= 75% of >= 6 apps with a range, of >= 3 developers (< 0.01% of real runs); on 3-5
    // apps of 3+ developers all showing one range (0.12% of random triples, 0.012% of quadruples) the cells are quarantined.
    // A cell its own listing anchor verified (the search results or chart list showed the same in-app range) is data,
    // not a constant the slot holds: those rows leave the shared-range rule (numerator and denominator).
    const listed = new Set(A.filter((a) => (a.anchors || {}).listing === true && !a.failed.includes('offersIAPRange')).map((a) => a.id));
    const shared = (col, f, s, rule, skip) => {
      const rs = A.filter((a) => !(skip && skip.has(a.id))).map((a) => rowOf.get(a.id)).filter((r) => val(r, col)), g = {};
      for (const r of rs) (g[r[col]] = g[r[col]] || []).push(r);
      for (const grp of Object.values(g)) { const ids = grp.map((r) => r.appId), dev = new Set(grp.map((r) => (r.developerId !== 'undefined' ? r.developerId : r.developer !== 'undefined' ? r.developer : r.appId))).size, v = rule(ids.length, rs.length, dev); if (v) sig(s, f, ids, v === 'drift', v === 'small'); }
    };
    shared('currentAppVersion', 'version', 'versionSharedAcrossApps', (k, m, dev) => (k >= 3 && dev >= 3 && k >= 0.5 * m ? 'drift' : ''));
    shared('inAppPurchasesPriceRange', 'offersIAPRange', 'iapRangeSharedAcrossApps', (k, m, dev) => (m >= 6 && dev >= 3 && k >= 0.75 * m ? 'drift' : m >= 3 && k === m && dev >= 3 ? 'small' : ''), listed);
    if (n >= 20 && !st.rows.some((r) => r.inAppAdvertisements === 'true') && !st.rows.some((r) => r.inAppPurchases === 'true')) for (const f of ['offersIAPRange', 'adSupported']) push(f, { cause: 'page', note: 'noAdsNoIap: no row has in-app ads or purchases; the labels and paths probably changed together', apps: n, likelyLayoutDrift: true, sample: [] });
    const PRI = { value: 0, anchor: 1, page: 2, blank: 3, signal: 4, noSale: 5 };
    for (const [f, L] of Object.entries(subs)) {
      L.sort((a, b) => (b.likelyLayoutDrift ? 1 : 0) - (a.likelyLayoutDrift ? 1 : 0) || PRI[a.cause] - PRI[b.cause]);
      const p = L[0], e = { apps: p.apps, of: n, informative: p.informative != null ? p.informative : p.apps, likelyLayoutDrift: L.some((s) => s.likelyLayoutDrift), cause: p.cause };
      for (const k of ['anchor', 'signal', 'note']) if (p[k]) e[k] = p[k];
      Object.assign(e, { columns: FEEDS[f] || [], sample: p.sample });
      if (L.length > 1) e.causes = L.map((s) => { const c = { cause: s.cause, apps: s.apps, likelyLayoutDrift: s.likelyLayoutDrift }; for (const k of ['anchor', 'signal', 'smallRun']) if (s[k]) c[k] = s[k]; return c; });
      if (L.some((s) => s.smallRun)) Object.assign(e, { smallRun: true, note: 'too few apps to tell a real value from a moved path (fewer than 3 apps carry this field, or every one of 3-5 apps shows one in-app range): the signalled cells are written "undefined" (smallRunQuarantine)' });
      VF[f] = e;
    }
    const page = (k, d, msg) => { PD[k] = d; problems.push(msg); };
    const tried = st.rows.length + st.fetchFailed.length, noBlob = A.filter((a) => a.noBlob).length, bad = noBlob + st.fetchFailed.length;
    if (bad >= Math.max(2, Math.ceil(0.5 * tried)) && tried) page('detailPage', { apps: bad, of: tried }, `${bad} of ${tried} detail pages had no app data (error pages or a changed page wrapper)`);
    const sd = st.searchDrift.filter((s) => !s.storefront);
    if (sd.length) problems.push(`search page drift on ${sd.length} search page(s): ${sd.slice(0, 3).map((s) => s.q + ' (' + s.why + ')').join('; ')}`);
    if (st.paginationFailed.length) problems.push(`pagination failed for ${st.paginationFailed.map((s) => s.q).join('; ')}`);
    // SMAR's drop predicate is about google-play-scraper, not about these values (each is checked against its own anchor):
    // a high rate is reported, never blocking (X12 g; R3/R4 evidence: wrapper and sparse-JSPB pages read correctly).
    const dropN = st.rows.filter((r) => st.smarDrop[r.appId]).length;
    if (n >= 10 && dropN >= 0.5 * n) problems.push(`note: ${dropN} of ${n} rows are apps google-play-scraper cannot read (SMAR drops them${compat ? '; --smar-compat drops them too' : ''}); the values here are checked against the page itself`);
    if (o.mode === 'chart' && st.chart) {
      if (st.chart.healed) page('chartHealed', { why: 'chart list read through a healed path' }, 'the chart list was located by a heal fallback, not the fixed path');
      const want = st.chart.ids.filter((id) => !st.notFound.includes(id)), got = sortRows(st.rows).map((r) => r.appId);
      if (isDone(st) && !st.fetchFailed.length && !st.wrongStorefront.length && want.join() !== got.join()) page('chartOrder', { ranks: want.length, rows: got.length }, 'chart rows are not in rank order');
      // a repeated app id is not a ranking (0 of 133 recorded charts, 0 of 43 live categories): the ranks after it shift
      const ci = st.chart.ids || [], dup = [...new Set(ci.filter((id, i) => ci.indexOf(id) !== i))];
      if (dup.length) page('chartDuplicates', { count: dup.length, ids: dup.slice(0, 5) }, `the chart list repeats ${dup.length} app id(s) (${dup.slice(0, 3).join(', ')}): Google's rank list is not a clean ranking and the ranks after a repeat are shifted`);
      // a chart shorter than the ranks asked for is Google's list (SMAR's file has the same ranks), never an error: said, not hidden
      if (st.chart.ok && !st.chart.empty && st.chart.requested > st.chart.ranks) problems.push(`note: Google's chart list holds ${st.chart.ranks} app(s), fewer than the ${st.chart.requested} requested; the file has every app it ranks`);
    }
    // an app id listed twice in Google's search results (0 of 644 recorded search pages): one row per app, so the file has
    // fewer rows than the results list; said, not hidden
    if (o.mode === 'search') for (const sr of st.searches.slice(0, 1)) { const L = sr.ids || [], dup = [...new Set(L.filter((id, i) => L.indexOf(id) !== i))]; if (dup.length) problems.push(`note: Google's results for "${sr.q}" list ${dup.length} app id(s) twice (${dup.slice(0, 3).join(', ')}); each is one row, so the file has ${dup.length} row(s) fewer than the list`); }
    { const pc = progressCheck(st), K = { lost: 'marked done, no row', extra: 'row never marked done', dup: 'duplicate rows', unlisted: 'listed, neither done nor queued', early: 'with a row, done mark or queue entry before the run was seeded' }, ks = Object.keys(K).filter((x) => pc[x].length);
      if (pc.bad) page('progressRows', Object.assign({ sample: [].concat(...ks.map((x) => pc[x])).slice(0, 5) }, ...ks.map((x) => ({ [x]: pc[x].length }))), `the progress file is inconsistent (${ks.map((x) => pc[x].length + ' app(s) ' + K[x]).join(', ')}): edited, rolled back or copied, so its rows cannot be trusted`); }
    const nullC = {};
    for (const r of st.rows) for (const [c, v] of Object.entries(r._smar || {})) if (v === 'null' && r[c] !== 'null') nullC[c] = (nullC[c] || 0) + 1;
    if (Object.keys(nullC).length) problems.push(`note: the page has an explicit JSON null where google-play-scraper reads ${Object.entries(nullC).map(([c, k]) => `${c} (${k})`).join(', ')}; --smar-compat writes those cells as "null", as SMAR does`);
    const finished = isDone(st), ex = compatExactOf(st), noFile = compat && ex.reasons.some((r) => NO_FILE.includes(r.code));
    const failBlock = st.fetchFailed.filter((q) => (st.failRounds[q[0]] || 0) < 2).length;
    if (!finished) problems.push('run not finished');
    if (st.emptyReason) problems.push('no rows: ' + st.emptyReason);
    if (st.wrongStorefront.length) problems.push(`${st.wrongStorefront.length} page(s) withheld: wrong storefront or not available in ${o.country} (not layout drift)`);
    if (failBlock) problems.push(`${failBlock} app page(s) failed to load; retry once`);
    if (noFile) problems.push('smar-tool.org would produce no file for this request (' + ex.reasons.filter((r) => NO_FILE.includes(r.code)).map((r) => r.code).join(',') + ')');
    const drifted = Object.keys(VF).filter((k) => VF[k].likelyLayoutDrift);
    if (drifted.length) problems.push('layout drift: ' + drifted.map((f) => `${f} (${(VF[f].columns || []).join(', ') || 'no column'}: ${driftCauses(VF[f]).map((c) => c.cause + (c.anchor ? ' ' + c.anchor : c.signal ? ' ' + c.signal : '')).join(', ')})`).join('; '));
    const READY = finished && st.rows.length > 0 && !drifted.length && !Object.keys(PD).length && !st.emptyReason && !st.wrongStorefront.length && !st.searchDrift.length && !st.paginationFailed.length && !failBlock && !noFile;
    return { validationFailures: VF, unverified: UV, pageDrift: PD, compatNullCells: nullC, problems, READY_TO_DELIVER: READY, finished, compatExact: ex, failBlock, shortMajority, smallRun: SR };
  }
  // The rows as they are written: small-run quarantined cells (driftReport smallRun) become "undefined" in both outputs.
  function blankSmallRun(rows, SR) {
    if (!SR || !Object.keys(SR).length) return rows;
    return rows.map((r) => {
      const q = SR[r.appId]; if (!q) return r;
      const row = Object.assign({}, r), sm = Object.assign({}, r._smar || {});
      for (const c of Object.keys(q)) { row[c] = 'undefined'; delete sm[c]; }
      Object.defineProperty(row, '_smar', { value: sm, enumerable: true, writable: true, configurable: true });
      return row;
    });
  }
  function nextStep(st, rep, ctx) {
    const o = st.opts, sh = (ctx.runner || 'shell') !== 'browser', skill = ctx.skill || '<SKILL>', out = ctx.out || '<OUT.csv>';
    const q = (s) => `"${String(s).replace(/(["\\$`])/g, '\\$1')}"`;
    const base = ctx.cmd || (o.mode === 'search' ? `node ${skill}/scripts/run_play.js search ${q(o.term)} ${out}` : o.mode === 'chart' ? `node ${skill}/scripts/run_play.js chart ${o.category || 'APPLICATION'} ${out} --collection ${o.collection}` : o.mode === 'rerun' ? `node ${skill}/scripts/run_play.js rerun ${o.from || '<previous.csv>'} ${out}` : `node ${skill}/scripts/run_play.js ids ${o.ids.map(([i, s]) => (s === 'similar app links' ? i + '=similar' : i)).join(',')} ${out}`) + (ctx.cmd ? '' : ` --country ${o.country}${o.compat ? ' --smar-compat' : ''}${o.mode === 'search' && !o.similar ? ' --primary-only' : ''}${ctx.pathsFile ? ' --paths ' + ctx.pathsFile : ''}`);
    const resume = sh ? `RESUME: ${base} --resume` : 'RESUME: await SMAR_RUN.step(15)';
    // an inconsistent progress file is never crawled (run_play.js), so a stop saved by an earlier call is stale there: its
    // "resume later" would loop, since every resume is refused
    if ((rep.pageDrift || {}).progressRows) return 'STOP: the progress file of this run is inconsistent (pageDrift.progressRows): it was edited, rolled back or copied, so its rows cannot be trusted. Tell the user and re-run the same command into a NEW output file; never edit progress files.';
    const stop = st.stopped || (ctx.error && STOPS[ctx.error.code] ? ctx.error : null);
    if (stop) return `STOP: Google answered with ${stop.code === 'SORRY' || stop.code === 'RATE_LIMITED' ? 'its rate limit ("unusual traffic")' : 'a consent or redirect interstitial'} (${stop.code}); stop now, tell the user, and resume later with ${sh ? 'the same command plus --resume' : 'await SMAR_RUN.step(15)'}.`;
    if (st.wrongStorefront.length) return st.wrongStorefront.every((w) => (st.withheldRounds[w.id || 'search:' + w.q] || 0) >= 1) ? `STOP: Google keeps serving a different storefront or "not available" for ${st.wrongStorefront.length} page(s); tell the user (VPN, proxy or signed-in account) and do not deliver without their OK.` : sh ? `RETRY_WITHHELD: ${base} --resume` : 'RETRY_WITHHELD: await SMAR_RUN.retryWithheld(); then repeat await SMAR_RUN.step(15)';
    if (!rep.finished) return resume;
    if (st.emptyReason) return 'STOP: ' + { google_no_results: 'Google Play shows no results for this search.', search_page_drift: 'the search results page could not be read (layout drift); do not deliver.', all_not_found: 'none of the requested apps exist on Google Play.', empty_chart: 'Google Play returned an empty chart for this category and collection.', chart_rpc_drift: 'the top-chart response could not be read (layout drift).', wrong_storefront: `Google served another country's or language's store instead of ${o.country}; check VPN/proxy or the signed-in account.`, smar_http400_empty_query: 'smar-tool.org receives an empty query for this term; nothing to reproduce.' }[st.emptyReason];
    if ((ctx.compat == null ? o.compat : ctx.compat) && rep.compatExact.reasons.some((r) => NO_FILE.includes(r.code))) return 'STOP: smar-tool.org returns no file for this request (' + rep.compatExact.reasons.map((r) => r.code).join(',') + '); tell the user and offer the default (page-truth) output instead.';
    if (st.searchDrift.some((x) => !x.storefront)) return 'STOP: a search results page could not be read (layout drift or wrong page); tell the user, do not deliver.';
    if (st.paginationFailed.length) return 'STOP: a search continuation page could not be read; tell the user, do not deliver.';
    if (rep.failBlock) return sh ? `RESUME: ${base} --resume` : 'RESUME: await SMAR_RUN.retryFailed(); then repeat await SMAR_RUN.step(15)';
    const VF = rep.validationFailures, drifted = Object.keys(VF).filter((k) => VF[k].likelyLayoutDrift);
    if ((rep.pageDrift || {}).chartDuplicates && Object.keys(rep.pageDrift).length === 1) return 'STOP: Google\'s chart list repeats app ids (pageDrift.chartDuplicates), so the ranks after a repeat are shifted; tell the user, do not deliver without their OK.';
    if (Object.keys(rep.pageDrift || {}).length) return 'STOP: Google changed the page wrapper or the chart list; heal cannot fix this. Tell the user, do not deliver.';
    if (drifted.length) {
      const dc = (f) => driftCauses(VF[f]), isLabel = (c) => c.cause === 'anchor' && /Label$/.test(c.anchor || '');
      const heal = (fs) => 'HEAL: ' + fs.map((f) => (sh ? `node ${skill}/scripts/heal.js ${f} --pages ${out}.pages${ctx.pathsFile ? ' --paths ' + ctx.pathsFile : ''}` : `await SMAR_RUN.heal('${f}')`)).join(' ; ');
      const anchors = [].concat(...drifted.map((f) => dc(f).filter((c) => c.cause === 'anchor' && !isLabel(c)).map((c) => c.anchor)));
      if (anchors.length) return 'FIX_ANCHOR: ' + [...new Set(anchors)].join(', ') + ' (a cross-check source on the page changed; report it to the user, do not edit paths)';
      const labelF = drifted.filter((f) => dc(f).some(isLabel));
      if (labelF.length) return heal(labelF);
      const fields = drifted.filter((f) => own(DEFAULT_PATHS, f) && dc(f).some((c) => ['value', 'blank', 'signal'].includes(c.cause)));
      if (!fields.length) return 'STOP: the run looks like layout drift (' + drifted.map((f) => f + ': ' + (VF[f].note || VF[f].cause)).join('; ') + '); tell the user, do not deliver.';
      const small = fields.every((f) => dc(f).every((c) => c.cause === 'value') && VF[f].informative <= 2 && VF[f].sample.every((id) => !st.refetched.some((r) => r.id === id)));
      if (small) { const ids = [...new Set([].concat(...fields.map((f) => VF[f].sample)))]; return sh ? `REFETCH: node ${skill}/scripts/run_play.js refetch ${ids.join(',')} ${out}` : `REFETCH: await SMAR_RUN.refetch(${JSON.stringify(ids)})`; }
      return heal(fields);
    }
    return rep.READY_TO_DELIVER ? 'DELIVER' : 'STOP: the run is not deliverable (' + rep.problems.join('; ') + ')';
  }
  // The cells of the file a run delivers (stress F3). Default: every row, HEADER cells. --smar-compat: SMAR's row set and
  // order (smarCompatRows) and each cell exactly as toCsvCompat renders it (SMAR's _smar strings, '' for a key the row's
  // card lacks); inFile is then the set of app ids in that file. Counts: 'undefined' or empty cells per column (up to 5
  // app ids each), VARY cells, rows per scrapedFrom label, unique app ids.
  function cellCounts(st, rows, compat) {
    const o = st.opts, undef = {}, undefS = {}, vary = {}, bySource = {};
    let list = rows.map((r) => ({ appId: r.appId, scrapedFrom: r.scrapedFrom, cells: HEADER.map((h) => [h, r[h]]) })), inFile = null, describe;
    if (compat) {
      const smar = smarCompatRows(rows, st.searches, { mode: o.mode, smarDrop: st.smarDrop, appIdQuery: st.appIdQuery }), chart = o.mode === 'chart' || o.layout === 'chart';
      const cols = smar.length ? replayColumns(chart ? 'chart' : smar[0]._card).filter((k) => k !== 'dateScraped') : [];
      list = smar.map((row) => {
        const keys = new Set(replayKeys(chart ? 'chart' : row._card));
        return { appId: row.appId, scrapedFrom: row.scrapedFrom, cells: cols.map((k) => { const c = fixColumn(k); return [c, !keys.has(k) ? '' : row._smar && own(row._smar, c) ? row._smar[c] : String(row[c])]; }) };
      });
      inFile = new Set(list.map((x) => x.appId));
      const dropped = new Set(rows.map((r) => r.appId).filter((id) => !inFile.has(id))).size;
      describe = `cell counts and app lists describe the ${list.length} rows of the --smar-compat file (SMAR's rows: the ${dropped} smarWouldDrop app(s) are not in it; cells as SMAR writes them, so developerAddress is undefined)`;
    }
    const cells = {}; // appId -> one {column: cell as written} per row of the app, in file order
    for (const r of list) {
      (cells[r.appId] = own(cells, r.appId) ? cells[r.appId] : []).push(Object.fromEntries(r.cells));
      bySource[r.scrapedFrom] = (bySource[r.scrapedFrom] || 0) + 1;
      for (const [h, v] of r.cells) {
        if (v === 'undefined' || v === '') { undef[h] = (undef[h] || 0) + 1; if ((undefS[h] = undefS[h] || []).length < 5) undefS[h].push(r.appId); }
        if (v === 'VARY' && VARY_STATUS !== 'confirmed') vary[h] = (vary[h] || 0) + 1;
      }
    }
    return { undef, undefS, vary, bySource, unique: new Set(list.map((r) => r.appId)).size, inFile, describe, cells };
  }
  // A --smar-compat file writes "undefined" in every quarantined cell (a failed check, a small-run quarantine or a
  // deliver-anyway blank) where SMAR's file has the value as read from the page: those cells are a reason the file is not
  // SMAR's (counts per column, of the file's rows). Recomputed after deliver-anyway adds its blanks.
  function compatQuarantine(s, compat) {
    const cf = s.compatFileReproducible; if (!compat || !cf) return;
    const R = cf.reasons.filter((r) => r.code !== 'quarantined_cells'), qc = s.quarantinedCells || {}, n = Object.values(qc).reduce((a, b) => a + b, 0);
    if (n) R.push({ code: 'quarantined_cells', count: n, detail: `${n} cell(s) written "undefined" where SMAR's file has the value as read from the page (` + Object.keys(qc).map((k) => k + ':' + qc[k]).join(',') + ')' });
    cf.reasons = R; cf.ok = !R.length;
  }
  const varyBlock = (vary) => { const n = Object.values(vary).reduce((a, b) => a + b, 0); return n ? { writtenAs: 'VARY', cells: vary, total: n, note: 'cells written as the text VARY (the page says the value varies with device): not blank, not "undefined", not in undefinedCounts' } : {}; };
  function summarize(st, ctx) {
    ctx = ctx || {};
    const o = st.opts, full = !!ctx.full, cap = (a, k) => (full ? a : a.slice(0, k)), compat = ctx.compat == null ? o.compat : ctx.compat;
    const rep = driftReport(st, { compat }), rows = blankSmallRun(sortRows(st.rows), rep.smallRun), fin = ctx.finishedUTC || new Date().toISOString();
    // F3: every cell count and app list below describes the file being delivered: a --smar-compat file holds SMAR's rows
    // (smarWouldDrop rows left out) with SMAR's cells (developerAddress "undefined", derivations), so apps outside it are
    // never named and its own blanks are counted (keep(id): the app is a row of that file)
    const cc = cellCounts(st, rows, compat), keep = (id) => !cc.inFile || cc.inFile.has(id);
    const undef = cc.undef, undefS = cc.undefS, vary = cc.vary, bySource = cc.bySource, qc = {}, uv = [];
    for (const [id, q] of Object.entries(st.quarantined)) if (keep(id)) for (const c of Object.keys(q)) qc[c] = (qc[c] || 0) + 1;
    const srq = { cells: {}, items: [] }; // small-run quarantine (driftReport smallRun): counted as quarantined cells
    for (const [id, q] of Object.entries(rep.smallRun || {})) for (const [c, sgl] of Object.entries(q)) { if ((st.quarantined[id] || {})[c] || !keep(id)) continue; qc[c] = (qc[c] || 0) + 1; srq.cells[c] = (srq.cells[c] || 0) + 1; srq.items.push({ appId: id, column: c, signal: sgl }); }
    for (const [id, us] of Object.entries(st.unverified)) { if (!keep(id)) continue; const row = rows.find((r) => r.appId === id); for (const u of us) uv.push({ appId: id, field: u.field, value: row ? brief(row[(FEEDS[u.field] || [])[0]]) : undefined }); }
    const unratedAll = rows.filter((r) => keep(r.appId) && (st.audit[r.appId] || {}).unrated).map((r) => r.appId), rc = st.ratingCheck || {};
    const unrated = unratedAll.filter((id) => rc[id] === 'confirmed'), unratedUnconf = unratedAll.filter((id) => rc[id] !== 'confirmed');
    const swd = smarWouldDrop(st.rows, st.searches, { mode: o.mode, smarDrop: st.smarDrop, appIdQuery: st.appIdQuery });
    // validationFailures keeps drift and failed checks; an informative signal (no drift, every cell kept) is a softSignal
    const vfOut = {}, softOut = {};
    for (const [f, e] of Object.entries(rep.validationFailures)) {
      if (!e.likelyLayoutDrift && !e.smallRun && (e.causes || [e]).every((c) => c.cause === 'signal')) softOut[f] = Object.assign({}, e, { note: 'informative check only: every cell was kept as read (no cell is blank because of this)' });
      else vfOut[f] = e;
    }
    // F3: with --smar-compat a soft signal counts and names only apps of the delivered file (a smarWouldDrop app is not in it)
    if (cc.inFile) {
      const inF = [...cc.inFile].filter((id) => st.audit[id]), on = (sg) => inF.filter((id) => (st.audit[id].signals || []).includes(sg));
      for (const [f, e] of Object.entries(softOut)) {
        const sgs = (e.causes || [e]).map((c) => c.signal).filter(Boolean), ids = inF.filter((id) => sgs.some((sg) => on(sg).includes(id)));
        if (!ids.length) { delete softOut[f]; continue; }
        softOut[f] = Object.assign({}, e, { apps: ids.length, of: inF.length, informative: ids.length, sample: ids.slice(0, 5) }, e.causes ? { causes: e.causes.map((c) => Object.assign({}, c, { apps: on(c.signal).length })) } : {});
      }
    }
    const byDev = (ids) => { const m = {}; for (const id of ids) { const r = rows.find((x) => x.appId === id), k = r && r.developer !== 'undefined' ? r.developer : '(developer not shown)'; m[k] = (m[k] || 0) + 1; } return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))); };
    const run = o.mode === 'search' ? { term: o.term } : o.mode === 'chart' ? { category: o.category, collection: o.collection } : { ids: o.ids.length };
    Object.assign(run, { country: o.country, similar: o.similar, compat, appIdQuery: st.appIdQuery, appIdQueryFellThrough: st.appIdQueryFellThrough });
    const s = { skill: 'smar-playstore-agent', version: VERSION, runner: ctx.runner || 'shell', mode: o.mode, run, csv: ctx.out, rows: rows.length, uniqueAppIds: cc.unique };
    if (o.mode === 'chart') s.chart = st.chart ? { ranks: st.chart.ranks, requested: st.chart.requested, rowsInRankOrder: !rep.pageDrift.chartOrder, pathUsed: st.chart.pathUsed, healed: st.chart.healed, empty: st.chart.empty } : null; else s.bySource = bySource;
    Object.assign(s, {
      READY_TO_DELIVER: rep.READY_TO_DELIVER, problems: rep.problems, NEXT: nextStep(st, rep, ctx), validationFailures: vfOut, softSignals: softOut, unverified: rep.unverified, pageDrift: rep.pageDrift,
      quarantinedCells: qc, quarantinedApps: cap(Object.keys(st.quarantined).filter(keep), 10), unverifiedCells: cap(uv, 25), undefinedCounts: undef, undefinedSample: undefS,
      ratingBlanksConfirmed: unrated.length, unratedApps: cap(unrated, 25), unratedByDeveloper: byDev(unrated),
      ratingBlanksUnconfirmed: cap(unratedUnconf, 25),
      notFound: st.notFound, fetchFailed: st.fetchFailed.map((q) => q[0]),
      wrongStorefront: { withheld: st.wrongStorefront.length, sample: st.wrongStorefront.slice(0, 5).map((w) => ({ id: w.id || w.q, kind: w.kind, why: w.why })), note: 'not layout drift: never heal; retry, then tell the user' },
    });
    if (srq.items.length) s.smallRunQuarantine = { cells: srq.cells, items: cap(srq.items, 25), note: 'too few apps carry the field (fewer than 3, or 3-5 apps all showing one in-app range) to tell these values from a moved path, so they are written "undefined": withheld, not known to be wrong. Run them with more apps that carry it to keep them.' };
    const shortIds = rows.filter((r) => keep(r.appId) && (st.audit[r.appId] || {}).shortDetail).map((r) => r.appId);
    if (shortIds.length) s.shortDetailPages = { count: shortIds.length, sample: shortIds.slice(0, 5), columns: ['currentAppVersion', 'androidMinVersion', 'originalReleaseDate'], note: rep.shortMajority ? `${shortIds.length} of ${rows.length} pages are the short "Updated on"-only shape: too many to be page truth, so those three fields are reported as layout drift` : 'short "Updated on"-only pages: Google shows no version, Android version or release date for these apps, so those cells are undefined (page truth, not layout drift)' };
    if (st.emptyReason) s.emptyReason = st.emptyReason;
    if (st.emptyReason === 'google_no_results') s.noResults = true;
    if (st.searchDrift.length) s.searchPageDrift = st.searchDrift;
    s.smarWouldDrop = { count: swd.length, items: cap(swd, 25), compatApplied: !!compat };
    if (o.mode === 'chart') s.smarChartWouldHttp500 = rep.compatExact.reasons.some((r) => r.code === 'smar_http500_chart');
    const c500 = rep.compatExact.chartApps; // every app that makes SMAR's chart request fail (count = the number to report)
    if (s.smarChartWouldHttp500 && c500) s.smarChartHttp500Apps = { count: c500.length, items: cap(c500, 25) };
    if (st.searches[0] && st.searches[0].smarSearchThrows) s.smarSearchWouldHttp500 = { reason: st.searches[0].smarSearchThrows };
    if (o.mode === 'search' && smarSiteTerm(o.term) !== o.term) s.smarSiteTerm = { term: o.term, smarWebsiteSearches: smarSiteTerm(o.term), searched: st.siteTerm || o.term };
    if (st.smarWouldInclude.length) s.smarWouldInclude = st.smarWouldInclude;
    if (Object.keys(rep.compatNullCells).length) s.compatNullCells = rep.compatNullCells;
    s.compatFileReproducible = Object.assign({ ok: rep.compatExact.ok, reasons: rep.compatExact.reasons }, { means: (compat ? COMPAT_MEANS : 'whether a --smar-compat run would be built with SMAR\'s exact row set, formatting and known bugs; it does NOT mean this default file matches SMAR\'s (see defaultVsSmarDifferences)') });
    compatQuarantine(s, compat);
    if (!compat) { // SMAR returning no file at all is the difference; the cell counts then describe a file SMAR never returns
      const dv = defaultVsSmar(st, rows, swd, o);
      s.defaultVsSmarDifferences = rep.compatExact.reasons.some((r) => NO_FILE.includes(r.code)) ? { smarReturnsNoFile: true, note: 'smar-tool.org returns NO file for this request (compatFileReproducible.reasons), so there is no SMAR file to compare cells or rows with: report only that. ifSmarReturnedAFile holds the by-design cell differences for reference; never present them as differences from an actual SMAR file.', ifSmarReturnedAFile: dv } : dv;
    }
    if (cc.inFile) s.countsDescribe = cc.describe;
    Object.assign(s, { derivedUnconfirmed: varyBlock(vary), paginated: st.searches.filter((x) => x.pages > 1 && !x.cluster).map((x) => x.q), paginationFailed: st.paginationFailed, searchDrift: st.searchDrift, refetched: st.refetched, pathOverrides: o.paths, labelOverrides: o.labels, startedUTC: st.startedUTC, finishedUTC: fin, seconds: Math.max(0, Math.round((Date.parse(fin) - Date.parse(st.startedUTC)) / 1000)), countryVerified: VERIFIED_COUNTRIES.includes(o.country) });
    if (!full && (swd.length > 25 || uv.length > 25 || unrated.length > 25 || unratedUnconf.length > 25 || Object.keys(st.quarantined).length > 10) && ctx.summaryFile) s.summaryFile = ctx.summaryFile;
    if (ctx.summaryFile && !s.summaryFile) s.summaryFile = ctx.summaryFile;
    // an inconsistent progress file (FI-12) is never resumed: NEXT says re-run into a NEW file, so no resumeWith or remaining
    if (!rep.finished && (rep.pageDrift || {}).progressRows) s.incomplete = true;
    else if (!rep.finished) { s.incomplete = true; s.remaining = st.queue.length + (st.recheck || []).length + (probePending(st) ? st.chart.probeQueue.length : 0) + (expansionPending(st) ? (((st.searches[0] || {}).titles || []).length - st.expandIdx) : 0) + (st.seeded ? 0 : 1); s.resumeWith = ctx.resumeWith || s.NEXT.replace(/^RESUME: /, ''); }
    const qIds = Object.keys(st.quarantined).filter((id) => !st.refetched.some((r) => r.id === id));
    if (rep.finished && qIds.length) s.refetchOnce = (ctx.runner || 'shell') !== 'browser' ? `node ${ctx.skill || '<SKILL>'}/scripts/run_play.js refetch ${qIds.join(',')} ${ctx.out || '<OUT.csv>'}` : `await SMAR_RUN.refetch(${JSON.stringify(qIds)})`;
    const loneSur = rows.reduce((k, r) => k + HEADER.filter((h) => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(String(r[h]))).length, 0);
    if (loneSur) s.loneSurrogateCells = loneSur;
    return s;
  }
  // The by-design differences between this default (page-truth) file and SMAR's file, in the rows both files share.
  function defaultVsSmar(st, rows, swd, o) {
    const smar = smarCompatRows(st.rows, st.searches, { mode: o.mode, smarDrop: st.smarDrop, appIdQuery: st.appIdQuery }), by = {};
    for (const r of smar) by[r.appId] = r;
    let addr = 0, quotes = 0, idList = 0; const other = {}, relabeled = [];
    for (const r of rows) {
      const m = by[r.appId]; if (!m) continue;
      for (const h of HEADER) {
        if (h === 'dateScraped') continue;
        if (!own(r._smar || {}, h)) continue;
        if (h === 'developerAddress') { if (r[h] !== 'undefined') addr++; } else if (r[h].includes('"') && r._smar[h] === r[h].replace(/"/g, '""""')) quotes++; else other[h] = (other[h] || 0) + 1; // SMAR cleans quoted text twice
      }
      if (r.scrapedFrom === IDS_LABEL && m.scrapedFrom !== r.scrapedFrom) idList++;
      else if (m.scrapedFrom !== r.scrapedFrom && !relabeled.some((x) => x.appId === r.appId)) relabeled.push({ appId: r.appId, here: r.scrapedFrom, smar: m.scrapedFrom });
    }
    const d = { developerAddressFilled: addr, quotesDoubledBySmar: quotes, otherCells: other, rowsSmarDrops: swd.length, smarRelabels: relabeled,
      note: 'by design, this default file differs from SMAR\'s file: developerAddress is filled where SMAR writes undefined, quotes are cleaned once where SMAR doubles them, SMAR leaves out rowsSmarDrops rows and labels smarRelabels rows differently. Report these; never say the file otherwise matches SMAR\'s.' };
    if (idList) d.appIdListLabel = { rows: idList, here: IDS_LABEL, smar: 'keyword search', note: 'rows from an app id list say scrapedFrom "' + IDS_LABEL + '" (no keyword search produced them); SMAR has no id-list mode and labels a package-id search "keyword search", as a --smar-compat file does' };
    return d;
  }
  // C30 deliver-anyway: blank every cell of a drifted field; a field drifting only through a dead anchor is blanked on
  // the rows where it was not hard-verified. Returns the rows, the extra blanked cells per column (cells that were not
  // already "undefined") and, per column, the app ids of every blanked cell (extraIds: a --smar-compat delivery counts
  // only the cells of its own file that the blanking changed, see outputs()).
  // A swap moves the drifted field's value into a partner slot that passes its own check, so the partner columns are blanked
  // too: a field holding the drifted field's anchor value (audit.partners), or an unanchored field linked to it by a signal on
  // some row or by sharing its record (version and the Android text are both read from [140] and swap together).
  const SIGNAL_LINK = { releasedEqUpdated: ['released', 'updatedText'], versionEqScoreText: ['version', 'score'], versionEqAndroid: ['version', 'androidVersionText'], reviewsIsHistBucket: ['reviews', 'ratings'], reviewsGeRatings: ['reviews', 'ratings'] };
  function blankForDelivery(st, rows, rep) {
    const VF = rep.validationFailures, colsAll = new Set(), perRow = [], why = {};
    const drifted = Object.keys(VF).filter((f) => driftCauses(VF[f]).length);
    for (const f of drifted) {
      const dc = driftCauses(VF[f]);
      if (dc.every((c) => c.cause === 'anchor' && !/Label$/.test(c.anchor || ''))) perRow.push(f); else (FEEDS[f] || []).forEach((c) => { colsAll.add(c); why[c] = why[c] || 'drifted: ' + f; });
    }
    const bl = (g, w) => { if (!drifted.includes(g)) for (const c of FEEDS[g] || []) { colsAll.add(c); why[c] = why[c] || w; } };
    const link = (L, how) => { const hit = L.find((f) => drifted.includes(f)); if (hit) for (const g of L) if (!ANCHORED.has(g)) bl(g, `linked to drifted ${hit} by ${how}`); };
    link(['version', 'androidVersionText'], 'their shared record');
    for (const r of rows) {
      const a = st.audit[r.appId] || {};
      for (const f of drifted) for (const g of (a.partners || {})[f] || []) bl(g, `swap partner of drifted ${f} (holds its anchor value)`);
      for (const s of a.signals || []) if (SIGNAL_LINK[s]) link(SIGNAL_LINK[s], `the ${s} signal`);
    }
    const extra = {}, extraIds = {};
    const out = rows.map((r) => {
      const row = Object.assign({}, r), sm = Object.assign({}, r._smar || {}), ver = new Set((st.audit[r.appId] || {}).verified || []), blankC = new Set(colsAll);
      for (const f of perRow) if (!ver.has(f)) for (const c of FEEDS[f] || []) blankC.add(c);
      for (const c of blankC) {
        if (row[c] !== 'undefined') extra[c] = (extra[c] || 0) + 1;
        (extraIds[c] = extraIds[c] || []).push(r.appId);
        row[c] = 'undefined'; delete sm[c]; if (!why[c]) why[c] = 'drifted (anchor gone): not verified on this row';
      }
      Object.defineProperty(row, '_smar', { value: sm, enumerable: true, writable: true, configurable: true });
      return row;
    });
    return { rows: out, extra, extraIds, why };
  }
  // The single byte producer for both runners (shell files, browser Blobs).
  function outputs(st, o) {
    o = o || {};
    const compat = o.compat == null ? st.opts.compat : !!o.compat, now = o.now == null ? Date.now() : o.now, fin = new Date(now).toISOString();
    const sum = summarize(st, Object.assign({}, o, { compat, full: true, finishedUTC: fin })), rep = driftReport(st, { compat });
    const layout = st.opts.layout === 'chart' || st.opts.mode === 'chart' ? 'chart' : st.opts.mode;
    let csv = null, csvName = null, rowsN = 0, dropped = [];
    if (rep.finished && st.rows.length) {
      let rows = blankSmallRun(sortRows(st.rows), rep.smallRun);
      const da = o.deliverAnyway && !rep.pageDrift.progressRows; // missing rows cannot be blanked away: never "deliver anyway"
      if (o.deliverAnyway && !da) sum.deliverAnywayRefused = 'the progress file is inconsistent (pageDrift.progressRows): its rows cannot be trusted, so nothing is delivered';
      if (!rep.READY_TO_DELIVER && da) {
        const before = compat ? cellCounts(st, rows, compat).cells : null, b = blankForDelivery(st, rows, rep); rows = b.rows; sum.deliveredAnyway = true;
        sum.deliverAnywayBlanked = b.why; // every column blanked for delivery and why (drifted, swap partner, signal link)
        const cc = cellCounts(st, rows, compat); // F3: the blanks of the file actually written
        // C30: the blanked cells count as quarantined; a --smar-compat file leaves out the smarWouldDrop rows, so only the
        // cells of rows in that file are counted, each only when its cell as written went from a value to blank (F3: the
        // counts describe the delivered file)
        if (!compat) { for (const [c, k] of Object.entries(b.extra)) sum.quarantinedCells[c] = (sum.quarantinedCells[c] || 0) + k; } else {
          const blank = (v) => v === 'undefined' || v === '';
          for (const [c, ids] of Object.entries(b.extraIds)) {
            let k = 0;
            for (const id of new Set(ids)) if (own(before, id) && own(cc.cells, id)) cc.cells[id].forEach((after, i) => { if (before[id][i] && !blank(before[id][i][c]) && blank(after[c])) k++; });
            if (k) sum.quarantinedCells[c] = (sum.quarantinedCells[c] || 0) + k;
          }
        }
        Object.assign(sum, { undefinedCounts: cc.undef, undefinedSample: cc.undefS, derivedUnconfirmed: varyBlock(cc.vary) });
        compatQuarantine(sum, compat);
      }
      const f = toCsvFile(rows, { layout, compat, appIdQuery: st.appIdQuery, searches: st.searches, now, mode: st.opts.mode, smarDrop: st.smarDrop, compatExact: rep.compatExact });
      csv = f.csv; rowsN = csv == null ? 0 : f.rows; dropped = f.dropped;
      // after --deliver-anyway, NEXT is no longer the step that would have made the run ready (HEAL, REFETCH, STOP): the
      // file is written, READY_TO_DELIVER stays false
      if (sum.deliveredAnyway && csv != null) sum.NEXT = 'DELIVERED_ANYWAY: deliverAnywayBlanked columns are "undefined"; deliver it as not cross-checked, name each and why; do not heal or re-run.';
      csvName = csv == null ? null : rep.READY_TO_DELIVER || da ? 'final' : 'not_ready';
    }
    sum.csvName = csvName;
    const relog = toRelog({ finishedUTC: fin, startedUTC: st.startedUTC, country: st.opts.country, mode: st.opts.mode, term: st.opts.term, siteTerm: st.siteTerm, category: st.opts.category, collection: st.opts.collection, rows: rowsN, similar: st.opts.mode === 'search' ? st.opts.similar : undefined, compat, ready: rep.READY_TO_DELIVER, deliveredAnyway: sum.deliveredAnyway, pathOverrides: st.opts.paths, labelOverrides: st.opts.labels, ids: sortRows(st.rows).map((r) => r.appId), smarWouldDrop: sum.smarWouldDrop.items.length ? sum.smarWouldDrop.items : undefined, compatExact: !compat || sum.compatFileReproducible.ok ? (rep.compatExact.ok ? undefined : rep.compatExact) : { ok: false, reasons: sum.compatFileReproducible.reasons } });
    return { csv, csvName, relog, summaryJson: JSON.stringify(sum), rows: rowsN, dropped, layout, compatExact: rep.compatExact };
  }

  // ---------------------------------------------------------------- X13 heal core (C22)
  // a heal candidate for the version gets the same sibling checks as checkApp: its own record's target SDK and API level,
  // the rating, and the record's other scalars (the Android text and the score text stay soft, as on a read page)
  const healVersionSib = (v, p, T, A) => { const b = up(p, 3), at = getPath(T, b.concat(1, 1, 0, 0, 1)); return Object.assign({ targetSdk: getPath(T, b.concat(1, 0, 0, 0)), androidApi: getPath(T, b.concat(1, 1, 0, 0, 0)), scores: [A.rv], soft: [typeof at === 'string' ? at.trim() : undefined, Number.isFinite(A.rv) ? A.rv.toFixed(1) : undefined] }, versionSib(T, p)); };
  function anchorsOf(P) {
    const L = P.ld || {}, d = P.dom || {}, off = (Array.isArray(L.offers) ? L.offers[0] : L.offers) || {}, agg = L.aggregateRating || {}, au = L.author || {};
    return { title: L.name != null ? L.name : d.title, desc: L.description, image: L.image, author: au.name, website: /^https?:/i.test(au.url || '') ? au.url : undefined, devLinkId: d.developerLinkId, genre: L.applicationCategory, cr: L.contentRating, M: off.price !== undefined ? Math.round(Number(off.price) * 1e6) : undefined, cur: off.priceCurrency, rv: agg.ratingValue !== undefined ? Number(agg.ratingValue) : undefined, rc: agg.ratingCount !== undefined ? Number(agg.ratingCount) : undefined, bm: badgeMin(d.installsBadge), updatedOn: d.updatedOn, hasWhatsNew: d.hasWhatsNew, whatsNew: d.whatsNew, email: d.developerEmail, address: d.developerAddress, privacy: d.privacyPolicy, hasIAP: d.hasIAP, containsAds: d.containsAds, preRegister: d.preRegister, wasPrice: d.wasPrice, priceButton: d.priceButton, offerEnds: d.offerEnds };
  }
  const HEAL = {
    title: { x: 1, has: (A) => A.title != null, ok: (v, p, T, A) => typeof v === 'string' && unesc(v) === unesc(A.title) },
    summary: { x: 1, has: (A) => A.desc != null, ok: (v, p, T, A) => typeof v === 'string' && norm(v) === norm(A.desc) },
    icon: { x: 1, has: (A) => !!A.image, ok: (v, p, T, A) => v === A.image },
    developer: { x: 1, has: (A) => !!A.author, ok: (v, p, T, A) => typeof v === 'string' && norm(v) === norm(A.author) },
    developerWebsite: { x: 1, has: (A) => !!A.website, ok: (v, p, T, A) => typeof v === 'string' && sameUrl(v, A.website) },
    developerLink: { x: 1, has: (A) => !!A.devLinkId, ok: (v, p, T, A) => typeof v === 'string' && /\/store\/apps\/dev/.test(v) && pctDec(v.split('id=')[1] || '') === pctDec(A.devLinkId) },
    genreId: { x: 1, has: (A) => !!A.genre, ok: (v, p, T, A) => v === A.genre },
    contentRating: { x: 1, has: (A) => !!A.cr, ok: (v, p, T, A) => typeof v === 'string' && unesc(v) === unesc(A.cr) },
    price: { x: 1, has: (A) => A.M !== undefined && !!A.cur, ok: (v, p, T, A) => v === A.M && getPath(T, up(p, 1).concat(1)) === A.cur },
    currency: { x: 1, has: (A) => !!A.cur && A.M !== undefined, ok: (v, p, T, A) => v === A.cur && p[p.length - 1] === 1 && getPath(T, up(p, 1).concat(0)) === A.M },
    score: { x: 1, has: (A) => A.rv !== undefined, ok: (v, p, T, A) => typeof v === 'number' && Math.abs(v - A.rv) < 1e-6 },
    ratings: { x: 1, has: (A) => A.rc !== undefined, ok: (v, p, T, A) => v === A.rc },
    reviews: { has: (A) => A.rc !== undefined, ok: (v, p, T, A) => Number.isInteger(v) && p.length > 1 && getPath(T, up(p, 1).concat(0)) === v.toLocaleString('en-US') && getPath(T, up(p, 2).concat(p[p.length - 2] - 1, p[p.length - 1])) === A.rc && !(v >= 1000 && [1, 2, 3, 4, 5].some((k) => getPath(T, up(p, 2).concat(1, k, 1)) === v)) },
    minInstalls: { x: 1, has: (A) => Number.isFinite(A.bm), ok: (v, p, T, A) => v === A.bm && typeof getPath(T, up(p, 1).concat(0)) === 'string' },
    maxInstalls: { has: (A) => Number.isFinite(A.bm), ok: (v, p, T, A) => Number.isInteger(v) && v >= A.bm && v < nextBucket(A.bm) && !(A.bm >= 1000 && v === A.bm) && (getPath(T, up(p, 1)) || []).includes(A.bm) },
    installsText: { x: 1, has: (A) => Number.isFinite(A.bm), ok: (v, p, T, A) => typeof v === 'string' && /^[\d,]+\+$/.test(v) && +v.replace(/\D/g, '') === A.bm },
    updatedText: { x: 1, has: (A) => !!A.updatedOn, ok: (v, p, T, A) => v === A.updatedOn || sameDayDmy(v, A.updatedOn) },
    recentChanges: { x: 1, has: (A) => !!A.hasWhatsNew, ok: (v, p, T, A) => typeof v === 'string' && norm(v) === norm(A.whatsNew) },
    version: { has: () => true, ok: (v, p, T, A) => typeof v === 'string' && v.trim() !== '' && p.length > 3 && ((t) => Number.isInteger(t) && t >= 14 && t <= 60)(getPath(T, up(p, 3).concat(1, 0, 0, 0))) && !versionWhy(v, { contentRating: A.cr, title: A.title, developer: A.author, genreId: A.genre, updatedText: A.updatedOn, summary: A.desc, developerEmail: A.email, developerAddress: A.address, whatsNew: A.whatsNew }, { ratings: A.rc, minInstalls: A.bm }, { description: A.desc, title: A.title, developer: A.author }, healVersionSib(v, p, T, A)), none: (p, T) => p.length > 2 && EMPTY(getRaw(T, up(p, 2))) },
    androidVersionText: { has: () => true, ok: (v, p, T) => typeof v === 'string' && p.length > 1 && ANDROID_API_NAMES[getPath(T, up(p, 1).concat(0))] === v, none: (p, T) => p.length > 3 && (EMPTY(getRaw(T, up(p, 3))) || (Number.isInteger(getPath(T, up(p, 1).concat(0))) && !hasStr(getRaw(T, up(p, 3))))) },
    developerEmail: { x: 1, has: (A) => !!A.email, ok: (v, p, T, A) => v === A.email },
    developerAddress: { x: 1, has: (A) => has(A.address), ok: (v, p, T, A) => typeof v === 'string' && norm(v) === A.address },
    privacyPolicy: { x: 1, has: (A) => !!A.privacy, ok: (v, p, T, A) => typeof v === 'string' && sameUrl(v, A.privacy) },
    offersIAPRange: { lab: 'iap', has: (A) => A.hasIAP && !A.preRegister, ok: (v) => iapShapeOk(v) },
    adSupported: { lab: 'ads', has: (A) => A.containsAds, ok: (v) => typeof v === 'string' && LABELS.ads.includes(v), lift: 1 },
    originalPrice: { x: 1, has: (A) => !!A.wasPrice, ok: (v, p, T, A) => typeof getPath(T, up(p, 1).concat(1)) === 'string' && wasMicros(A.wasPrice, A.priceButton, A.cur || getPath(T, up(p, 1).concat(1))).includes(v) },
    discountEndDate: { x: 1, has: (A) => !!A.offerEnds, ok: (v, p, T, A) => typeof v === 'string' && v !== A.offerEnds && getPath(T, up(p, 1).concat(2)) === A.offerEnds },
    // structural (no page anchor): a "Mon D, YYYY" date with its own timestamp sibling, not after the visible "Updated on".
    // An app never updated since release shows the same date twice, so equal is allowed on a page (ok); but a path is
    // only supported (tally, USE) by pages where it is strictly earlier (strict), which the "Updated on" record itself
    // never is: equal-date pages can neither elect a path nor veto the right one. USE only if unique.
    released: { has: (A) => !Number.isNaN(dateOf(A.updatedOn)), ok: (v, p, T, A) => typeof v === 'string' && DATE_RE.test(v) && p.length > 1 && epochNear(v, getPath(T, up(p, 1).concat(1, 0))) && Date.parse(v) <= dateOf(A.updatedOn), strict: (v, p, T, A) => v !== A.updatedOn && !sameDayDmy(v, A.updatedOn) },
  };
  const ABM = typeof WeakMap === 'function' ? new WeakMap() : null;
  function anchorBlob(P, id, A) { // the detail blob is the one carrying the most independent anchors (never PATHS.title)
    const marks = [A.title, A.image, A.author, A.desc && norm(A.desc), A.website, A.privacy, A.email, A.genre].filter((m) => m != null && m !== '');
    const sig = id + '|' + JSON.stringify(marks), memo = ABM && ABM.get(P.blobs);
    if (memo && memo.has(sig)) return memo.get(sig);
    const res = anchorBlobScan(P, id, marks);
    if (ABM && P.blobs && typeof P.blobs === 'object') { if (!memo) ABM.set(P.blobs, new Map([[sig, res]])); else memo.set(sig, res); }
    return res;
  }
  function anchorBlobScan(P, id, marks) {
    let best = null, bs = 0;
    for (const [k, v] of Object.entries(P.blobs)) {
      const s = JSON.stringify(v); if (!s.includes(id)) continue;
      const leaves = new Set(); findPaths(v, (x) => { if (typeof x === 'string') { leaves.add(x); leaves.add(unesc(x)); leaves.add(norm(x)); } return false; });
      const sc = marks.filter((m) => leaves.has(m) || leaves.has(unesc(m))).length;
      if (sc > bs) { bs = sc; best = { key: k, data: v }; }
    }
    return best;
  }
  const HEAL_KEEP = ['decision', 'status', 'field', 'overrideKey', 'path', 'label', 'reason', 'next'];
  function healOut(r, o) {
    const sh = (o.runner || 'shell') !== 'browser';
    if (!r.next) r.next = r.decision === 'USE' ? (r.status === 'label-drift' ? (sh ? `write {"${r.overrideKey}":${JSON.stringify([r.label])}} into OUT_DIR/labels.override.json (keep other keys), then re-run the same command into a NEW output file with --labels OUT_DIR/labels.override.json` : `await SMAR_RUN.start({...same options, labels:{...previous, "${r.overrideKey}":${JSON.stringify([r.label])}}, force:true}), then step() until done`) : sh ? `write {"${r.overrideKey}":${JSON.stringify(r.path)}} into OUT_DIR/paths.override.json (keep other keys), then re-run the same command into a NEW output file with --paths OUT_DIR/paths.override.json` : `await SMAR_RUN.start({...same options, paths:{...previous, "${r.overrideKey}":${JSON.stringify(r.path)}}, force:true}), then step() until done`) : 'STOP: tell the user which column could not be repaired and why; do not deliver it without their OK; never pick a path or value by eye';
    const out = {}; for (const k of HEAL_KEEP.concat(Object.keys(r))) if (r[k] !== undefined && !(k in out)) out[k] = r[k];
    for (const k of ['skipped', 'labelsSeen', 'equivalentPaths', 'tieBreak', 'knownFields', 'candidates']) while (Array.isArray(out[k]) && out[k].length && JSON.stringify(out).length >= 700) out[k].pop();
    for (const k of ['skipped', 'candidates', 'knownFields', 'labelsSeen', 'value']) if (JSON.stringify(out).length >= 700) delete out[k];
    return out;
  }
  function headerTexts(html) { // short visible texts of the label strip under the title (label-drift evidence)
    const vis = stripScripts(html), i = vis.indexOf('<h1'), seg = i < 0 ? '' : vis.slice(i, i + 4000);
    return [...seg.matchAll(/>([^<>]{3,40})</g)].map((m) => decEnt(m[1]).trim()).filter((t) => t && !/^\d/.test(t));
  }
  const HPC = new Map(); // small LRU of parsed heal pages (browser heal() reuses its ring buffer)
  function healField(pages, field, o) {
    o = o || {};
    const key = fieldKey(field), res = (r) => healOut(Object.assign({ field, overrideKey: key || field }, r), o);
    if (!key) return res({ decision: 'STOP', status: 'unknown-field', reason: `"${field}" is not a field name or CSV column`, knownFields: Object.keys(DEFAULT_PATHS) });
    const H = HEAL[key];
    if (!H) return res({ decision: 'STOP', status: 'no-anchor', reason: `no independent page anchor exists for ${key}; report its column as unverified` });
    const saveP = clone(PATHS), saveL = clone(LABELS);
    try {
      const over = canonOverride(o.paths); usePaths(over); useLabels(o.labels);
      const prep = [], skipped = [], lk = JSON.stringify(LABELS);
      for (const pg of pages || []) {
        const ck = pg.id + '|' + lk, hit = HPC.get(ck), P = hit && hit.html === pg.html ? hit.P : parsePage(pg.html, { appId: pg.id });
        if (!hit || hit.P !== P) { HPC.delete(ck); HPC.set(ck, { html: pg.html, P }); if (HPC.size > 30) HPC.delete(HPC.keys().next().value); }
        // a definite non-app page (Google error page, /sorry, consent, unavailable, removed) is skipped by kind; only a
        // plausible details page without data blobs counts toward wrapper drift
        if (P.kind !== 'app' && !(P.kind === 'error_page' && !P.blobCount && !/<title[^>]*>Error \d{3} \(/.test(pg.html))) { skipped.push(pg.id + ':' + P.kind); continue; }
        if (!P.blobCount) { skipped.push(pg.id + ':no-blobs'); continue; }
        const A = anchorsOf(P), b = anchorBlob(P, pg.id, A);
        if (!b) { skipped.push(pg.id + ':no-detail-blob'); continue; }
        prep.push({ id: pg.id, P, A, T: b.data, key: b.key, html: pg.html });
      }
      if (!prep.length) return res({ decision: 'STOP', status: skipped.some((s) => /no-blobs/.test(s)) ? 'wrapper-drift' : 'none', reason: skipped.some((s) => /no-blobs/.test(s)) ? 'no AF_initDataCallback data parsed: the page wrapper changed (parseBlobs), not a path' : 'no usable app page', skipped });
      const inf = prep.filter((p) => H.has(p.A));
      if (!inf.length) {
        if (H.lab) { // label drift: JSON says yes, the label text matches nowhere -> find one consistent visible text
          const truthy = prep.filter((p) => !!getPath(p.T, PATHS[key]));
          if (truthy.length >= 2) {
            const falsy = prep.filter((p) => !getPath(p.T, PATHS[key])), cand = [...new Set(headerTexts(truthy[0].html))].filter((t) => truthy.every((p) => headerTexts(p.html).includes(t)) && falsy.every((p) => !headerTexts(p.html).includes(t)));
            // A reworded label only if the data at the path is still this field's data (IAP: "<price> - <price> per item" or GB "... if billed through Play";
            // ads: one short label text, the same on every page) and the text names the same thing and is not the other
            // field's label. Otherwise the PATH moved onto data that merely correlates with a visible text ("star",
            // "Everyone", "In-app purchases"): 9 such false USEs on 2-5-page corpus runs, 0 genuine rewordings lost.
            const vals = truthy.map((p) => { const v = getPath(p.T, PATHS[key]); return Array.isArray(v) && v.length === 1 ? v[0] : v; });
            const shapeOk = key === 'offersIAPRange' ? vals.every(iapShapeOk) : vals.every((v) => typeof v === 'string' && v.length <= 40 && !/\d|https?:/i.test(v) && v === vals[0]);
            const lc = (t) => String(t).trim().toLowerCase(), otherLab = (t) => Object.keys(LABELS).some((k) => k !== H.lab && LABELS[k].concat(DEFAULT_LABELS[k]).some((l) => lc(l) === lc(t)));
            const word = H.lab === 'ads' ? /\bads?\b|advert/i : /purchas|in[- ]app/i;
            if (!shapeOk || cand.some(otherLab) || (cand.length === 1 && !word.test(cand[0]))) return res({ decision: 'STOP', status: 'label-drift', overrideKey: H.lab, reason: `the ${key} path moved onto other data (it is not ${key} data, or the only matching text is not its label); this is not a new label` });
            if (cand.length === 1 && falsy.length) return res({ decision: 'USE', status: 'label-drift', overrideKey: H.lab, label: cand[0], reason: `the visible label changed; "${cand[0]}" appears exactly on the ${truthy.length} pages whose data says yes` });
            return res({ decision: 'STOP', status: 'label-drift', overrideKey: H.lab, reason: 'the visible label changed and no single replacement text is consistent on every page', labelsSeen: [...new Set(headerTexts(truthy[0].html))].slice(0, 6) });
          }
        }
        return res({ decision: 'STOP', status: 'anchor-missing', reason: `no page shows the independent anchor for ${key}; fix the anchor in extract_play.js (domAnchors/jsonLd), not the path`, skipped });
      }
      const tally = new Map(), byPage = new Map();
      for (const p of inf) {
        const hits = findPaths(p.T, (v, path) => H.ok(v, path, p.T, p.A) && (!H.strict || H.strict(v, path, p.T, p.A))).map((h) => (H.lift && Array.isArray(getRaw(p.T, up(h.path, 1))) && getRaw(p.T, up(h.path, 1)).length === 1 ? up(h.path, 1) : h.path));
        byPage.set(p.id, new Set(hits.map((h) => JSON.stringify(h))));
        for (const k of new Set(hits.map((h) => JSON.stringify(h)))) tally.set(k, (tally.get(k) || 0) + 1);
      }
      const holds = (path, p) => { const v = getPath(p.T, H.lift ? path.concat(0) : path); return v !== undefined ? H.ok(v, H.lift ? path.concat(0) : path, p.T, p.A) : !!(H.none && H.none(path, p.T)); };
      // Re-verify the whole row, not just this field: with the candidate path no other field may fail where it passed
      // before (a path another field depends on, a swap partner), and this field must pass on every page.
      const errsOf = (p) => { const x = extractFrom(p.P, p.id); return x.blobKey === p.key ? new Set(checkApp(x).errors.map((e) => e.field)) : null; };
      for (const p of prep) p.base = errsOf(p); // null: the current path picks another blob (title drift), so no baseline
      const closed = (path) => { usePaths(Object.assign({}, over, { [key]: path })); try { return prep.every((p) => { const e = errsOf(p); return !!e && !e.has(key) && (!p.base || [...e].every((f) => p.base.has(f))); }); } finally { usePaths(over); } };
      // a path another field already reads is never a candidate: that data belongs to the other field (or the two swapped)
      const inUse = (path) => Object.keys(PATHS).filter((g) => g !== key && overlapP(PATHS[g], path));
      const minSup = Math.max(2, Math.ceil(0.5 * inf.length)), verified = [], blocked = [];
      const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
      for (const [k, sup] of ranked) { const path = JSON.parse(k), iu = inUse(path); if (sup >= minSup && inf.every((p) => holds(path, p))) { if (iu.length) blocked.push([k, iu]); else if (closed(path)) verified.push(path); } }
      const cur = PATHS[key], vals = (path) => JSON.stringify(inf.map((p) => getPath(p.T, path)));
      const strictOn = (path) => !H.strict || inf.some((p) => { const v = getPath(p.T, path); return v !== undefined && H.strict(v, path, p.T, p.A); });
      if (inf.every((p) => holds(cur, p)) && strictOn(cur) && closed(cur)) return res({ decision: 'STOP', status: 'current-path-ok', path: cur, reason: `the current path satisfies the anchor on all ${inf.length} pages: the failure is not path drift (check the anchor or the page)` });
      if (inf.length < 2) return res({ decision: 'STOP', status: 'none', reason: 'only one page carries the anchor; heal needs at least 2 (use --pages with more apps)' });
      if (verified.length === 1) return res({ decision: 'USE', status: 'recommended', path: verified[0], reason: `verified on ${inf.length} page(s) against the independent anchor and by re-extraction` });
      if (verified.length > 1) {
        const same = H.x && new Set(verified.map(vals)).size === 1, ref = DEFAULT_PATHS[key];
        const dist = (p) => { let i = 0; while (i < p.length && p[i] === ref[i]) i++; return [-i, Math.abs((p[i] || 0) - (ref[i] || 0)), p.length]; };
        if (same) { const best = verified.slice().sort((a, b) => { const x = dist(a), y = dist(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; })[0]; return res({ decision: 'USE', status: 'recommended', path: best, tieBreak: 'nearest to the shipped path; every candidate gives identical values on every page', equivalentPaths: verified.filter((p) => p !== best) }); }
        return res({ decision: 'STOP', status: 'ambiguous', reason: 'several paths satisfy the anchor with different values; do not choose by eye', equivalentPaths: verified });
      }
      if (blocked.length) return res({ decision: 'STOP', status: 'path-in-use', reason: `the only path(s) matching the anchor are already read by another field (${blocked.slice(0, 2).map(([k, iu]) => k + ': ' + iu.join(', ')).join('; ')}): the two fields' data moved together or swapped, which heal does not repair; report both columns` });
      const weak = H.strict ? ranked.filter(([k, sup]) => sup < minSup && inf.every((p) => holds(JSON.parse(k), p))) : [];
      if (weak.length) return res({ decision: 'STOP', status: 'none', reason: `only ${weak[0][1]} of the ${inf.length} pages show a ${key} value that differs from its anchor (the rest are equal), too few to verify a path; heal again with more pages`, candidates: weak.slice(0, 3).map(([k, n]) => k + ':' + n) });
      return res({ decision: 'STOP', status: 'none', reason: `no path satisfies the anchor on every page carrying it (${inf.length}); report the column`, candidates: ranked.slice(0, 3).map(([k, n]) => k + ':' + n) });
    } finally { for (const k of Object.keys(PATHS)) delete PATHS[k]; Object.assign(PATHS, saveP); Object.assign(LABELS, saveL); }
  }

  // ---------------------------------------------------------------- X15 injection fingerprint
  const source = () => smarExtract.toString();
  async function fingerprint() {
    const parts = [];
    for (const n of ['SMAR', 'SMAR_CHART', 'SMAR_RUN', 'SMAR_REVIEWS']) { const g = n === 'SMAR' ? api : root && root[n]; if (g && typeof g.source === 'function') parts.push(g.source()); }
    const subtle = (root && root.crypto && root.crypto.subtle) || (typeof require === 'function' ? require('crypto').webcrypto.subtle : null);
    const buf = await subtle.digest('SHA-256', new TextEncoder().encode(parts.join('\n')));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  async function verify(expected) {
    const loaded = ['SMAR', 'SMAR_CHART', 'SMAR_RUN', 'SMAR_REVIEWS'].filter((n) => (n === 'SMAR' ? api : root && root[n]) && typeof (n === 'SMAR' ? api : root[n]).source === 'function'), fp = await fingerprint();
    return { ok: fp === expected, fingerprint: fp, loaded };
  }

  const api = {
    VERSION, PATHS, DEFAULT_PATHS, COL2PATH, FEEDS, LABELS, HEADER, CHART_HEADER, HEADER_APPID_QUERY, RateLimited, Superseded, POLICY, COUNTRIES, ANDROID_API_NAMES, APPID_RE, RAW_PRESENT,
    getPath, rpath, findPaths, fieldKey, usePaths, useLabels, canonPaths, parseBlobs, findDetailBlob, jsonLd, domAnchors, pageKind, storefront, parsePage, extractFrom, extractApp,
    checkApp, validate, pickBetter, toSmarRow, finalizeApp, iapShapeOk, priceMicros, wasMicros, smarLibWouldThrow, smarCompatRows, smarWouldDrop, unesc, norm, sameUrl, smarClean, smarCleanText, smarDate,
    csvCell, dateCell, csvWith, toCsv, toCsvCompat, toCsvFile, bomFor, toRelog, searchResults, searchNoResults, nextPageBody, parseNextPage, idsFromHtml, isAppId, smarSiteTerm,
    urls, makeGet, makePost, healField, driftReport, progressCheck, summarize, source, fingerprint, verify, newState, seed, advance, requeue, refetch, outputs, lookup, compatExactOf, isDone,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SMAR = api;
})(typeof window !== 'undefined' ? window : globalThis);
