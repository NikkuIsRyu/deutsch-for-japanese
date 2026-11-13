// Builds src/data/sentences.json and src/data/content-manifest.json from content/source/*.csv
// plus content/review/fixes.json. Node builtins only. See docs/PLAN.md §2.1-2.3.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = {
  sentences: path.join(ROOT, 'content/source/ja_sentences_new.csv'),
  variants: path.join(ROOT, 'content/source/ja_variants.csv'),
  fixes: path.join(ROOT, 'content/review/fixes.json'),
  outSentences: path.join(ROOT, 'src/data/sentences.json'),
  outGrammar: path.join(ROOT, 'src/data/grammar.json'),
  outManifest: path.join(ROOT, 'src/data/content-manifest.json'),
};

// ---------------------------------------------------------------- tag vocabulary (PLAN §2.3)
export const TAGS = {
  perfekt: 'A2', praeteritum: 'A2', modalverben: 'A2', trennbare_verben: 'A2', dativ: 'A2',
  wechselpraepositionen: 'A2', adjektivendungen: 'A2', reflexive_verben: 'A2', komparativ: 'A2',
  imperativ: 'A2', nebensatz_weil_dass_wenn: 'A2',
  relativsatz: 'B1', konjunktiv2: 'B1', passiv: 'B1', infinitiv_zu: 'B1', temporalsatz: 'B1',
  konzessiv_final: 'B1', lassen: 'B1', futur: 'B1', genitiv: 'B1',
  passiv_erweitert: 'B2', konjunktiv1: 'B2', partizipialattribut: 'B2', nominalstil: 'B2',
  zweiteilige_konnektoren: 'B2', praep_genitiv: 'B2',
};
const LEVEL_RANK = { A2: 0, B1: 1, B2: 2 };

// ---------------------------------------------------------------- CSV (RFC 4180)
export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [], field = '', inQ = false, any = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"') { inQ = true; any = true; }
    else if (c === ',') { row.push(field); field = ''; any = true; }
    else if (c === '\r') { /* swallow; \n ends the record */ }
    else if (c === '\n') {
      if (any || field !== '' || row.length) { row.push(field); rows.push(row); }
      row = []; field = ''; any = false;
    } else { field += c; any = true; }
  }
  if (any || field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function readTable(file) {
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  const header = rows.shift();
  return rows.map((r, n) => {
    if (r.length !== header.length) throw new Error(`${path.basename(file)} record ${n + 1}: ${r.length} columns, expected ${header.length}`);
    return Object.fromEntries(header.map((h, i) => [h, r[i]]));
  });
}

// ---------------------------------------------------------------- tokens
export function tokenize(de) {
  const raw = de.trim().split(/\s+/);
  const tokens = [];
  for (const t of raw) {
    // a lone dash/punctuation chip stays attached to the preceding word
    if (tokens.length && /^[\p{P}\p{S}]+$/u.test(t)) tokens[tokens.length - 1] += ' ' + t;
    else tokens.push(t);
  }
  return tokens;
}

// ---------------------------------------------------------------- heuristic tagger
const PARTICLES = ['an', 'auf', 'aus', 'ein', 'mit', 'zurück', 'ab', 'vor', 'zu', 'nach', 'weg', 'fest', 'hin', 'her',
  'zusammen', 'herunter', 'heraus', 'heran', 'hinunter', 'durch', 'um', 'bei', 'weiter', 'fort', 'los', 'vorbei',
  'kaputt', 'statt', 'hoch', 'raus', 'rein', 'runter', 'voran', 'wieder'];
const SEP_END = new Set(['an', 'auf', 'aus', 'ein', 'mit', 'zurück', 'ab', 'vor', 'hin', 'her', 'herunter', 'heraus',
  'heran', 'hinunter', 'weg', 'fest', 'fort', 'um', 'los', 'vorbei', 'weiter', 'hoch', 'raus', 'rein', 'runter', 'nach', 'bei']);
const PRE = PARTICLES.join('|');
const PII_NOT = new Set(['gegen', 'gehen', 'geben', 'gelten', 'gerne', 'genug', 'gestern', 'gesund', 'gerade', 'genau']);
const PII_IRREG = new Set(['getan', 'gewesen', 'geworden', 'gegangen', 'gekommen']);
const PII_NOGE = /^(?:be|er|ver|ent|zer|miss|emp|über|unter|hinter)\p{L}{2,}(?:t|en)$/u;
const SEIN_PII = new Set(['gegangen', 'gekommen', 'gefahren', 'geflogen', 'geworden', 'gewesen', 'passiert', 'geblieben',
  'gelaufen', 'gestiegen', 'gefallen', 'gereist', 'gestorben', 'gerannt', 'geschwommen', 'gesprungen', 'geschehen',
  'verschwunden', 'erschienen', 'entstanden', 'eingeschlafen', 'aufgestanden', 'angekommen', 'abgefahren',
  'umgezogen', 'zurückgekehrt', 'zurückgekommen', 'ausgestiegen', 'eingestiegen', 'umgestiegen', 'zusammengestoßen',
  'heruntergefallen', 'durchgebrannt', 'zersplittert', 'abgeplatzt', 'abgegangen', 'gewachsen', 'geglückt', 'gelungen',
  'mitgekommen', 'weggelaufen', 'hingefallen', 'kaputtgegangen', 'eingegangen', 'ausgegangen', 'angegangen',
  'aufgewacht', 'gesunken', 'gestürzt', 'verreist', 'verlaufen', 'abgereist', 'vorbeigekommen', 'geschlüpft']);

function isPartizip(w) {
  if (!/^\p{Ll}/u.test(w)) return false;
  if (PII_IRREG.has(w)) return true;
  const m = w.match(new RegExp(`^(${PRE})?ge(\\p{L}{2,})(?:t|en)$`, 'u'));
  if (m) return !PII_NOT.has(w);
  if (/^\p{L}+iert$/u.test(w)) return true;
  if (PII_NOGE.test(w)) return true;
  return false;
}
// participle with ge- (or -iert / -t): safe even without the auxiliary right next to it
const strongPartizip = (w) => isPartizip(w) && !PII_NOGE.test(w);

const HABEN = new Set(['habe', 'hast', 'hat', 'haben', 'habt']);
const SEIN = new Set(['bin', 'bist', 'ist', 'sind', 'seid']);
const WERDEN_FIN = new Set(['wird', 'werde', 'wirst', 'werdet', 'wurde', 'wurden', 'wurdest']);
const WERDEN_PRES = new Set(['wird', 'werde', 'wirst', 'werdet']);
const MODAL_PRES = new Set(['kann', 'kannst', 'können', 'könnt', 'muss', 'musst', 'müssen', 'müsst', 'darf', 'darfst',
  'dürfen', 'dürft', 'soll', 'sollst', 'sollen', 'sollt', 'will', 'willst', 'wollen', 'wollt', 'möchte', 'möchtest',
  'möchten', 'möchtet', 'mag', 'magst', 'mögen']);
const MODAL_PRET = new Set(['konnte', 'konntest', 'konnten', 'musste', 'musstest', 'mussten', 'durfte', 'durften',
  'wollte', 'wolltest', 'wollten']);
const MODAL_KONJ = new Set(['könnte', 'könntest', 'könnten', 'müsste', 'müsstest', 'müssten', 'dürfte', 'dürften',
  'sollte', 'solltest', 'sollten']);
const KONJ2 = new Set(['würde', 'würdest', 'würden', 'würdet', 'hätte', 'hättest', 'hätten', 'hättet', 'wäre', 'wärst',
  'wären', 'wärt', 'wüsste', 'wüssten', 'käme', 'kämen', 'bräuchte', 'gäbe', 'ließe']);
const PRAET = new Set(['war', 'waren', 'warst', 'hatten', 'gab', 'ging', 'gingen', 'kam', 'kamen', 'sah', 'sahen', 'tat',
  'fiel', 'sang', 'sangen', 'saß', 'saßen', 'sank', 'erschien', 'schrieb', 'blieb']);
const WERDEN_PRET = new Set(['wurde', 'wurden', 'wurdest']);
const DAT = new Set(['dem', 'einem', 'meinem', 'deinem', 'seinem', 'ihrem', 'unserem', 'keinem', 'diesem', 'jenem',
  'mir', 'dir', 'ihm', 'ihnen']);
const GEN = new Set(['des', 'eines', 'meines', 'deines', 'seines', 'ihres', 'unseres', 'dessen', 'deren', 'wegen']);
const PREP_GEN = new Set(['aufgrund', 'trotz', 'innerhalb', 'außerhalb', 'anstatt', 'angesichts', 'infolge', 'anhand',
  'zugunsten', 'mithilfe', 'oberhalb', 'unterhalb', 'bezüglich', 'hinsichtlich']);
const LASSEN = new Set(['lasse', 'lässt', 'lassen', 'lasst', 'lass', 'ließ', 'ließen', 'gelassen']);
const WECHSEL = new Set(['in', 'an', 'auf', 'über', 'unter', 'vor', 'hinter', 'neben', 'zwischen']);
const WECHSEL_CONTR = new Set(['im', 'am', 'ins', 'ans', 'aufs', 'hinterm', 'vorm', 'überm', 'unterm']);
const DET = new Set(['der', 'die', 'das', 'den', 'dem', 'ein', 'eine', 'einen', 'einem', 'einer', 'mein', 'meine', 'meinen',
  'meinem', 'meiner', 'dein', 'deine', 'deinen', 'sein', 'seine', 'seinen', 'seinem', 'ihr', 'ihre', 'ihren', 'ihrem',
  'unser', 'unsere', 'unseren', 'unserem', 'unserer', 'kein', 'keine', 'keinen', 'keinem', 'diesen', 'diesem', 'dieser', 'diese', 'dieses']);
const TIME_NOUNS = new Set(['sonntag', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'morgen',
  'abend', 'nacht', 'mittag', 'sommer', 'winter', 'herbst', 'frühling', 'wochenende', 'woche', 'monat', 'jahr', 'tag',
  'ferien', 'sommerferien', 'jahreszeit', 'regenzeit', 'zeit', 'minuten', 'stunde', 'tagen', 'nächten']);
const PLACES = new Set(['tisch', 'regal', 'kiste', 'park', 'garten', 'haus', 'stadt', 'bahnhof', 'küche', 'zimmer',
  'schublade', 'tasche', 'straße', 'bett', 'wand', 'fluss', 'museum', 'kunstmuseum', 'kino', 'theater', 'schule',
  'berg', 'berge', 'meer', 'feld', 'hosentasche', 'kühlschrank', 'sportplatz', 'zug', 'bus', 'eingang', 'hügel',
  'wäldchen', 'kalender', 'fahrrad', 'boden', 'rand', 'lokal', 'restaurant', 'herberge', 'laden', 'klassenzimmer',
  'bibliothek', 'stadtsporthalle', 'schulkantine', 'untergeschoss', 'ausland', 'weltall', 'klavier']);
const COMP_LIST = new Set(['älter', 'ältere', 'älterer', 'älteren', 'jünger', 'jüngere', 'jüngerer', 'jüngeren', 'besser',
  'lieber', 'höher', 'größer', 'tiefer', 'schneller', 'länger', 'kürzer', 'leiser']);
const SUP_LIST = new Set(['beste', 'besten', 'bester', 'bestes', 'wichtigste', 'wichtigsten', 'größte', 'größten',
  'schönste', 'schönsten', 'meisten', 'höchste', 'höchsten']);
const NOT_ADJ = new Set(['jeden', 'jede', 'jeder', 'jedes', 'jedem', 'diese', 'diesen', 'dieser', 'dieses', 'diesem', 'alle',
  'allen', 'aller', 'einige', 'einigen', 'manche', 'manchen', 'mehrere', 'wenige', 'wenigen', 'viele', 'vielen', 'keine',
  'keinen', 'keiner', 'meine', 'meinen', 'meiner', 'meinem', 'meines', 'deine', 'seine', 'seinen', 'seiner', 'seinem',
  'ihre', 'ihren', 'ihrer', 'unsere', 'unseren', 'unserer', 'welche', 'welchen', 'solche', 'solchen', 'andere', 'anderen',
  'beiden', 'beide', 'unserem', 'unserer', 'unseres', 'eurem', 'euren', 'sieben', 'neunzig', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'zehn', 'zwölf', 'elf', 'dieselbe', 'denselben', 'derselben', 'selben', 'eben', 'wegen', 'haben', 'machen', 'sehen',
  'gehen', 'kommen', 'sind', 'werden', 'wollen', 'müssen', 'können', 'dürfen', 'sollen', 'bitte', 'nicht', 'aber',
  'oder', 'wieder', 'schon', 'immer', 'heute', 'gestern', 'oben', 'unten', 'hier', 'dort', 'drüben', 'sehr']);
const ADJ_PREP = new Set(['mit', 'in', 'an', 'auf', 'aus', 'bei', 'von', 'zu', 'für', 'durch', 'ohne', 'gegen', 'um', 'nach',
  'seit', 'bis', 'über', 'unter', 'vor', 'zwischen', 'neben', 'hinter', 'während', 'wegen', 'im', 'am', 'zum', 'zur',
  'vom', 'beim', 'ins', 'ans']);
const ADJ_QUANT = new Set(['viele', 'wenige', 'einige', 'mehrere', 'alle', 'beide', 'keine', 'manche']);
const SUBJ = new Set(['ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'man']);
const REL = new Set(['der', 'die', 'das', 'dem', 'den', 'deren', 'dessen', 'denen', 'wo']);
const REL_PREP = new Set(['in', 'an', 'auf', 'mit', 'von', 'zu', 'aus', 'bei', 'für', 'über', 'unter', 'vor', 'nach', 'durch', 'um', 'gegen']);
const FINITE_MAIN = new Set(['ist', 'sind', 'war', 'waren', 'hat', 'haben', 'hatte', 'kann', 'muss', 'wird', 'will', 'soll',
  'darf', 'gibt', 'bin', 'bist', 'seid', 'hast', 'habt', 'kannst', 'ich', 'du', 'wir', 'ihr']);
const DU_IMP = new Set(['lass', 'hab', 'quäl', 'sei', 'geh', 'komm', 'mach', 'nimm', 'gib', 'sieh', 'sag', 'hilf', 'schau',
  'bleib', 'lies', 'iss', 'fahr', 'trink', 'sprich', 'vertrau', 'warte', 'denk', 'hör', 'probier']);

const REFL_PREP = new Set(['zu', 'mit', 'von', 'bei', 'für', 'nach', 'aus', 'an', 'auf', 'über', 'um', 'gegen', 'ohne', 'durch', 'vor']);
const clean = (w) => w.replace(/^[„"“”‚'‘(»«]+/u, '').replace(/[.,;:!?“”"‘’')»«–—]+$/u, '');

function clausesOf(de) {
  const out = [];
  let cur = [];
  for (const raw of de.trim().split(/\s+/)) {
    if (/^[\p{P}\p{S}]+$/u.test(raw)) { if (cur.length) out.push(cur); cur = []; continue; }
    const w = clean(raw);
    if (w) cur.push(w);
    if (/[,;:.!?]["“”’']*$/u.test(raw)) { if (cur.length) out.push(cur); cur = []; }
  }
  if (cur.length) out.push(cur);
  return out;
}

export function tagSentence(de) {
  const tags = new Set();
  const clauses = clausesOf(de);
  const lc = (w) => w.toLowerCase();
  const all = clauses.flat();
  const low = all.map(lc);
  const endsQ = /\?["“”]*\s*$/.test(de.replace(/[“”"]+\s*$/, '')) || /\?[“”"]?$/.test(de.trim());
  const text = ' ' + low.join(' ') + ' ';
  const has = (set) => low.some((w) => set.has(w));

  for (const cl of clauses) {
    const cw = cl.map(lc);
    const last = cw.length - 1;
    const pIdx = cl.findIndex((w) => isPartizip(w));
    const auxIdx = (set) => cw.findIndex((w, i) => set.has(w) && !(i > 0 && cw[i - 1] === 'zu'));
    // --- Perfekt / Passiv (participle at clause end, finite auxiliary in the same clause)
    for (let p = last; p >= Math.max(0, last - 1); p--) {
      if (!isPartizip(cl[p])) continue;
      const finAtEnd = p === last - 1 && (HABEN.has(cw[last]) || SEIN.has(cw[last]) || WERDEN_FIN.has(cw[last]));
      if (p !== last && !finAtEnd) continue;
      const ok = (set) => { const a = auxIdx(set); return a >= 0 && (p === last || a === last); };
      if (ok(HABEN)) tags.add('perfekt');
      if (ok(SEIN) && SEIN_PII.has(cw[p])) tags.add('perfekt');
      if (ok(WERDEN_FIN) && strongPartizip(cl[p]) && !['geworden', 'gewesen'].includes(cw[p])) tags.add('passiv');
    }
    // --- Passiv erweitert: modal + participle + werden
    if (cw.some((w) => MODAL_PRES.has(w) || MODAL_PRET.has(w) || MODAL_KONJ.has(w)) && cw[last] === 'werden'
      && last >= 1 && strongPartizip(cl[last - 1])) tags.add('passiv_erweitert');
    // --- Futur: wird/werde + infinitive at clause end
    if (cw.some((w) => WERDEN_PRES.has(w)) && /^\p{Ll}\p{L}*(?:en|ern|eln)$/u.test(cl[last]) && !isPartizip(cl[last])
      && !WERDEN_PRES.has(cw[last]) && cw.length >= 3 && !cw.some((w) => WERDEN_FIN.has(w) && /^(wurde|wurden)/.test(w))) tags.add('futur');
    // --- trennbare Verben: detached particle at clause end
    if (cw.length >= 3 && SEP_END.has(cw[last]) && !(cw[last] === 'nach' || cw[last] === 'bei') && !/^(wenn|weil|dass|ob|als|bevor|nachdem|während|obwohl|damit)$/.test(cw[0])) tags.add('trennbare_verben');
  }

  // --- sentence-level token rules
  for (let i = 0; i < all.length; i++) {
    const w = low[i], orig = all[i];
    if (MODAL_PRES.has(w)) tags.add('modalverben');
    if (MODAL_PRET.has(w)) { tags.add('modalverben'); tags.add('praeteritum'); }
    if (MODAL_KONJ.has(w)) { tags.add('modalverben'); tags.add('konjunktiv2'); }
    if (KONJ2.has(w)) tags.add('konjunktiv2');
    if (PRAET.has(w) || (WERDEN_PRET.has(w) && !tags.has('passiv'))) tags.add('praeteritum');
    if (DAT.has(w) && !(w === 'ihnen' && false)) tags.add('dativ');
    if (GEN.has(w)) tags.add('genitiv');
    if (PREP_GEN.has(w)) tags.add('praep_genitiv');
    if (LASSEN.has(w)) tags.add('lassen');
    if (/^(weil|dass|wenn|ob)$/.test(w)) tags.add('nebensatz_weil_dass_wenn');
    if (/^(obwohl|trotzdem|deshalb|deswegen|daher|darum)$/.test(w)) tags.add('konzessiv_final');
    if (w === 'damit' && i > 0 && /,$/.test(de.split(/\s+/)[de.split(/\s+/).findIndex((t) => clean(t) === all[i - 1])] || '')) tags.add('konzessiv_final');
    if (/^(bevor|nachdem|sobald|solange|seitdem)$/.test(w)) tags.add('temporalsatz');
    if ((w === 'seit' || w === 'bis') && i + 1 < all.length && SUBJ.has(low[i + 1])) tags.add('temporalsatz');
    if (w === 'als' && i === 0 && all.length > 3) tags.add('temporalsatz');
    if (w === 'während') {
      const rest = de.slice(de.indexOf(orig));
      if (/,/.test(rest) && i === 0) tags.add('temporalsatz'); else tags.add('praep_genitiv');
    }
    // trennbare Verben via participle / zu-infinitive
    if (new RegExp(`^(${PRE})ge\\p{L}{3,}(?:t|en)$`, 'u').test(w) && isPartizip(w) && !/^(?:zu|bei|um)ge/.test(w)) tags.add('trennbare_verben');
    if (new RegExp(`^(${PRE})zu\\p{L}{3,}en$`, 'u').test(w) && /^\p{Ll}/u.test(orig)) { tags.add('trennbare_verben'); tags.add('infinitiv_zu'); }
    // infinitiv mit zu
    if (w === 'zu' && i + 1 < all.length && /^\p{Ll}\p{L}*(?:en|ern|eln)$/u.test(all[i + 1])
      && !/^(zu)$/.test(low[i + 1])) {
      // exclude "zu" + adjective-ish -en forms like "zu wenigen" – require verb-like infinitive at clause end
      const cl = clauses.find((c) => c.includes(all[i + 1]) && c.indexOf('zu') >= 0);
      if (cl && cl[cl.length - 1] === all[i + 1]) tags.add('infinitiv_zu');
    }
    // reflexive
    if (w === 'sich') tags.add('reflexive_verben');
  }
  for (const cl of clauses) {
    const cw = cl.map(lc);
    const refl = (pron) => { const j = cw.indexOf(pron); return j >= 0 && !REFL_PREP.has(cw[j - 1]); };
    if (cw.includes('ich') && (refl('mich') || refl('mir'))) tags.add('reflexive_verben');
    if (cw.includes('du') && refl('dich')) tags.add('reflexive_verben');
    if (cw.includes('wir') && refl('uns')) tags.add('reflexive_verben');
  }
  if (!low.includes('ich') && low.includes('dich') && !endsQ && DU_IMP.has(low[0].replace(/ß$/, 'ss')) || (!low.includes('ich') && low.includes('dich') && /^(quäl|vertrau)/.test(low[0] || ''))) tags.add('reflexive_verben');

  // --- Relativsatz: comma + (prep) + relative pronoun, verb-final clause
  for (let c = 1; c < clauses.length; c++) {
    const cl = clauses[c];
    const cw = cl.map(lc);
    let k = 0;
    if (REL_PREP.has(cw[0]) && REL.has(cw[1])) k = 1;
    if (!REL.has(cw[k])) continue;
    // the previous boundary must be a comma
    const idx = de.indexOf(cl[0] + ' ');
    const before = de.slice(0, idx < 0 ? 0 : idx).trimEnd();
    if (!before.endsWith(',')) continue;
    if (cw.length < 3) continue;
    if (FINITE_MAIN.has(cw[k + 1])) continue;
    if (!/^\p{Ll}/u.test(cl[cl.length - 1])) continue;
    if (cw[k] === 'wo' && endsQ) continue;
    if (k === 1 && cw[0] === 'um') continue;
    if (cw.includes('zu') || new RegExp(`^(${PRE})zu\\p{L}{3,}en$`, 'u').test(cw[cw.length - 1])) continue;
    tags.add('relativsatz');
  }

  // --- Komparativ / Superlativ
  for (let i = 0; i < all.length; i++) {
    const w = low[i];
    if (COMP_LIST.has(w)) tags.add('komparativ');
    if (w === 'als' && i > 0 && /er$/.test(low[i - 1]) && low[i - 1].length >= 5 && low[i - 1] !== 'aber') tags.add('komparativ');
    if (w === 'am' && i + 1 < all.length && /sten$/.test(low[i + 1]) && low[i + 1].length >= 6) tags.add('komparativ');
    if (SUP_LIST.has(w) && i > 0 && /^(das|der|die|den|dem|am|im)$/.test(low[i - 1])) tags.add('komparativ');
  }

  // --- Imperativ
  if (!endsQ) {
    const t0 = low[0], t1 = low[1], t2 = low[2];
    const sie = (a) => a === 'sie';
    for (const c of clauses) { const cw = c.map(lc); if (cw[0] === 'bitte' && cw[2] === 'sie' && /en$/.test(cw[1])) tags.add('imperativ'); }
    if (tags.has('imperativ')) { /* done */ }
    else if (t1 === 'sie' && /^\p{Lu}/u.test(all[0]) && /en$/.test(t0) && !/^(wenn|weil|dass|ob|als)$/.test(t0)
      && !MODAL_PRES.has(t0) && !HABEN.has(t0) && !SEIN.has(t0)) tags.add('imperativ');
    else if (/\bbitte\b/.test(text) && / \p{Ll}+en sie /u.test(text) && /,\s/.test(de)) {
      for (let c = 1; c < clauses.length; c++) { const cw = clauses[c].map(lc); if (/en$/.test(cw[0]) && cw[1] === 'sie') tags.add('imperativ'); }
    }
    for (let c = 0; c < clauses.length; c++) {
      const cw = clauses[c].map(lc);
      const j = cw[0] === 'aber' ? 1 : 0;
      if (DU_IMP.has(cw[j]) && (c === 0 || j === 1) && cw.length >= 2 && cw[j + 1] !== 'ich' && cw[j + 1] !== 'du') tags.add('imperativ');
    }
  }
  // --- Konjunktiv I (indirect speech): only unmistakable 3rd person forms
  if (/\b(er|sie|es|man) (sei|werde|könne|müsse|solle|dürfe|wolle|habe|gebe|komme)\b/.test(text) && /\b(sagt|sagte|meint|meinte|behauptet|behauptete|erzählt|erzählte|berichtet)\b/.test(text)) tags.add('konjunktiv1');
  // --- zweiteilige Konnektoren
  if (/ sowohl .* als auch /.test(text) || / nicht nur .* sondern auch /.test(text) || / weder .* noch /.test(text)
    || / je .*,? desto /.test(text) || / entweder .* oder /.test(text) || / zwar .* aber /.test(text)) tags.add('zweiteilige_konnektoren');

  // --- Wechselpräpositionen: preposition + determiner + concrete place noun (no time expressions)
  for (let i = 0; i < all.length; i++) {
    const w = low[i];
    const contr = WECHSEL_CONTR.has(w);
    if (!WECHSEL.has(w) && !contr) continue;
    const np = low.slice(i + 1, i + 4);
    if (!contr && !DET.has(np[0])) continue;
    if (np.some((x) => TIME_NOUNS.has(x))) continue;
    // stop at clause boundary
    const clauseOf = clauses.find((c) => c.includes(all[i]));
    const rel = clauseOf ? clauseOf.map(lc).slice(clauseOf.indexOf(all[i]) + 1, clauseOf.indexOf(all[i]) + 4) : np;
    if (rel.some((x) => PLACES.has(x))) tags.add('wechselpraepositionen');
  }

  // --- Adjektivendungen: det/quantifier/prep + lowercase adjective with ending + Noun
  for (let i = 0; i + 2 < all.length; i++) {
    const a = low[i], adj = low[i + 1], n = all[i + 2];
    if (!(DET.has(a) || ADJ_QUANT.has(a) || ADJ_PREP.has(a))) continue;
    if (!/^\p{Ll}/u.test(all[i + 1]) || !/^\p{Lu}/u.test(n)) continue;
    if (!/(?:e|en|er|em|es)$/.test(adj) || adj.length < 5 || NOT_ADJ.has(adj)) continue;
    if (DET.has(adj) || ADJ_PREP.has(adj)) continue;
    if (/(?:en)$/.test(adj) && (MODAL_PRES.has(adj) || /^(sein|haben|werden)$/.test(adj))) continue;
    tags.add('adjektivendungen');
  }

  // --- Partizipialattribut: det + declined participle + Noun (or Partizip I)
  for (let i = 1; i + 1 < all.length; i++) {
    const w = low[i];
    if (!/^\p{Lu}/u.test(all[i + 1]) || !/^\p{Ll}/u.test(all[i])) continue;
    if (!(DET.has(low[i - 1]) || ADJ_QUANT.has(low[i - 1]) || (i > 1 && DET.has(low[i - 2])))) continue;
    const m = w.match(/^(.*?)(?:e|en|er|es|em)$/u);
    if (!m) continue;
    const stem = m[1];
    const part2 = isPartizip(stem + 't') && /^(?:\p{L}*ge\p{L}{2,}t|\p{L}*ge\p{L}{2,}en)$/u.test(stem) ||
      (/^(?:be|ver|er|ent|zer)\p{L}{4,}t$/u.test(stem) && stem.length >= 8) ||
      (new RegExp(`^(${PRE})?ge\\p{L}{3,}en$`, 'u').test(stem) && isPartizip(stem));
    const part1 = /^\p{L}{3,}end$/u.test(stem) && !/^(wend|send|end)$/.test(stem);
    if ((part2 && /(t|en)$/.test(stem)) || part1) tags.add('partizipialattribut');
  }

  // consistency: lassen and trennbar etc. need nothing further
  return [...tags].filter((t) => t in TAGS);
}

export function cefrOf(tags) {
  let best = 'A2';
  for (const t of tags) if (LEVEL_RANK[TAGS[t]] > LEVEL_RANK[best]) best = TAGS[t];
  return best;
}

// ---------------------------------------------------------------- build
function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function fail(msg) { console.error('BUILD FAILED: ' + msg); process.exit(1); }

function main() {
  const sRows = readTable(P.sentences);
  const vRows = readTable(P.variants);
  const fixes = JSON.parse(fs.readFileSync(P.fixes, 'utf8')).fixes;

  const variantsById = new Map();
  let unmatched = 0, matched = 0;
  const known = new Map(sRows.map((r) => [r.item_id, r]));
  for (const v of vRows) {
    const base = v.item_id.replace(/~v\d+$/, '');
    if (!known.has(base)) { unmatched++; continue; }
    matched++;
    if (!variantsById.has(base)) variantsById.set(base, []);
    variantsById.get(base).push({ ja: v.text.trim(), jaReading: v.reading.trim() });
  }

  const items = sRows.map((r) => {
    const de = r.de.replace(/\s+/g, ' ').trim();
    const tags = tagSentence(de);
    return {
      id: r.review_no.trim(),
      de,
      ja: r.text.trim(),
      jaReading: r.reading.trim(),
      jaVariants: variantsById.get(r.item_id) || [],
      cefr: cefrOf(tags),
      tags,
      tokens: tokenize(de),
      review: { ja: 'ok-unmarked', de: 'pending', tags: 'auto' },
    };
  });

  const byId = new Map();
  for (const it of items) {
    if (byId.has(it.id)) fail(`duplicate id ${it.id}`);
    byId.set(it.id, it);
    if (!it.de) fail(`${it.id}: empty de`);
    if (!it.ja) fail(`${it.id}: empty ja`);
    for (const t of it.tags) if (!(t in TAGS)) fail(`${it.id}: unknown tag ${t}`);
  }
  let fixesApplied = 0;
  for (const f of fixes) {
    const it = byId.get(f.id);
    if (!it) fail(`fix id ${f.id} not present in sentences`);
    it.ja = f.ja;
    it.jaReading = f.jaReading;
    it.review.ja = 'fixed';
    fixesApplied++;
  }
  if (!fs.existsSync(P.outGrammar)) fail('src/data/grammar.json is missing');

  const out = { version: 1, generatedAt: new Date().toISOString(), count: items.length, items };
  const body = '{"version":1,"generatedAt":' + JSON.stringify(out.generatedAt) + ',"count":' + items.length + ',"items":[\n'
    + items.map((i) => JSON.stringify(i)).join(',\n') + '\n]}\n';
  fs.writeFileSync(P.outSentences, body);
  fs.writeFileSync(P.outManifest, JSON.stringify({
    'sentences.json': sha256(P.outSentences),
    'grammar.json': sha256(P.outGrammar),
  }, null, 2) + '\n');

  const cefr = {}, tagCount = {};
  for (const it of items) {
    cefr[it.cefr] = (cefr[it.cefr] || 0) + 1;
    for (const t of it.tags) tagCount[t] = (tagCount[t] || 0) + 1;
  }
  console.log(`sentences: ${items.length}`);
  console.log('cefr:', JSON.stringify(cefr));
  console.log('tags:');
  for (const t of Object.keys(TAGS)) console.log(`  ${t.padEnd(26)} ${TAGS[t]}  ${tagCount[t] || 0}`);
  console.log(`fixes applied: ${fixesApplied}/${fixes.length}`);
  console.log(`variants: ${matched} matched, ${unmatched} unmatched (of ${vRows.length})`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
