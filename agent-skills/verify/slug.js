#!/usr/bin/env node
'use strict';
// Results-folder name for verify.sh / verify_appstore.sh: node slug.js <word> [<word> ...]  (joined with spaces)
// A plain request (a-z, 0-9 and single spaces, any case) keeps the readable rule: lower case, spaces -> '_'
// ("Habit Tracker" -> habit_tracker, "chart topfreeapplications 6013" -> chart_topfreeapplications_6013). Anything
// else is lossy and gets a 6-hex hash of the exact text, as the skills' own file slugs do: punctuation ("c++" and "c#"
// would both be "c", "a,b" and "a b" both "a_b"), a bundle id's dots, letters outside a-z (家計簿, café keep their
// letters), a request cut to fit (60 characters, 180 bytes), or one with no letter or digit at all (just the hash).
const t = process.argv.slice(2).join(' ').normalize('NFC');
const h = require('crypto').createHash('sha256').update(t).digest('hex').slice(0, 6);
const lower = t.toLowerCase(), ascii = /^[\x20-\x7e]*$/.test(t);
let s = ascii ? lower.replace(/[^a-z0-9]+/g, '_') : lower.replace(/[^\p{L}\p{N}\p{M}]+/gu, '_');
// cut at 60 whole code points and 180 UTF-8 bytes, so <slug>_<hash>_<cc>_<stamp> stays inside a 255-byte file name
let cut = '', bytes = 0, n = 0;
for (const ch of s.replace(/^_+|_+$/g, '')) { const b = Buffer.byteLength(ch); if (n === 60 || bytes + b > 180) break; cut += ch; bytes += b; n++; }
s = cut.replace(/_+$/, '');
const plain = ascii && /^[a-z0-9]+(?: [a-z0-9]+)*$/.test(lower) && s === lower.replace(/ /g, '_');
process.stdout.write(plain ? s : (s ? s + '_' : '') + h);
