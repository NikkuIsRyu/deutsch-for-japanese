// Cloze (gap-fill) selection: articles/determiners and prepositions, with deterministic distractors.
import { mulberry32, shuffle } from './shuffle.ts';

const ENDINGS = ['', 'e', 'en', 'em', 'er', 'es'];
const DETERMINER_FAMILIES: Record<string, string[]> = {
  definite: ['der', 'die', 'das', 'den', 'dem', 'des'],
  indefinite: ['ein', 'eine', 'einen', 'einem', 'einer', 'eines'],
  kein: ENDINGS.map((e) => 'kein' + e),
  mein: ENDINGS.map((e) => 'mein' + e),
  dein: ENDINGS.map((e) => 'dein' + e),
  sein: ENDINGS.map((e) => 'sein' + e),
  ihr: ENDINGS.map((e) => 'ihr' + e),
  unser: ENDINGS.map((e) => 'unser' + e),
  euer: ['euer', 'eure', 'euren', 'eurem', 'eurer', 'eures'],
};
// Bare "sein" / "ihr" are very often a verb / pronoun, so only the inflected forms count as determiners.
const AMBIGUOUS = new Set(['sein', 'ihr']);

const PREPOSITION_GROUPS: Record<string, string[]> = {
  dativ: ['mit', 'von', 'zu', 'bei', 'nach', 'aus', 'seit'],
  akkusativ: ['für', 'durch', 'gegen', 'ohne', 'um'],
  wechsel: ['in', 'an', 'auf', 'über', 'unter', 'vor', 'hinter', 'neben', 'zwischen'],
  genitiv: ['wegen', 'trotz', 'während', 'statt', 'innerhalb', 'außerhalb'],
};
const ALL_PREPOSITIONS = Object.values(PREPOSITION_GROUPS).flat();
// Words that are often a separable-verb particle or part of "um ... zu" / "zu + Infinitiv".
const PARTICLE_PRONE = new Set(['an', 'auf', 'aus', 'mit', 'nach', 'vor', 'zu', 'um', 'bei', 'durch', 'gegen', 'ein']);

const DEMONSTRATIVE_VERBS = new Set(['ist', 'war', 'sind', 'waren', 'wird', 'hat', 'kann', 'muss', 'geht', 'gibt', 'macht', 'passt', 'stimmt', 'klingt', 'dauert', 'tut', 'hilft', 'reicht', 'bedeutet']);
const DET_LOOKUP = new Map<string, string>();
for (const [family, forms] of Object.entries(DETERMINER_FAMILIES)) {
  for (const f of forms) if (!AMBIGUOUS.has(f) && !DET_LOOKUP.has(f)) DET_LOOKUP.set(f, family);
}
const PREP_LOOKUP = new Map<string, string>();
for (const [g, list] of Object.entries(PREPOSITION_GROUPS)) for (const p of list) PREP_LOOKUP.set(p, g);

export type ClozeKind = 'article' | 'preposition';
export interface ClozeCandidate {
  index: number;
  kind: ClozeKind;
  family: string;
  /** Lower-case word without punctuation. */
  word: string;
}
export interface Cloze extends ClozeCandidate {
  /** Text before the gap, e.g. "„" – punctuation attached to the token. */
  before: string;
  after: string;
  answer: string;
  options: string[];
}

const LEAD = /^[„"“‚'(]+/u;
const TRAIL = /[.,!?;:"“”‚'’)…]+$/u;

function splitToken(tok: string) {
  const lead = LEAD.exec(tok)?.[0] ?? '';
  const rest = tok.slice(lead.length);
  const trail = TRAIL.exec(rest)?.[0] ?? '';
  return { lead, core: rest.slice(0, rest.length - trail.length), trail };
}

export function findCandidates(tokens: readonly string[]): ClozeCandidate[] {
  const out: ClozeCandidate[] = [];
  tokens.forEach((tok, index) => {
    const { core, trail } = splitToken(tok);
    const lower = core.toLowerCase();
    if (!lower) return;
    const det = DET_LOOKUP.get(lower);
    if (det) {
      // "Das ist ...", "Die sind ...": demonstrative pronoun, not an article.
      const nx = tokens[index + 1] ? splitToken(tokens[index + 1]!).core : '';
      if (DEMONSTRATIVE_VERBS.has(nx)) return;
      out.push({ index, kind: 'article', family: det, word: lower });
      return;
    }
    const prep = PREP_LOOKUP.get(lower);
    if (prep) {
      // A capitalised preposition mid-sentence is probably a noun/name (e.g. "Dank").
      if (index > 0 && core[0] !== core[0]!.toLowerCase()) return;
      const next = tokens[index + 1];
      const isLast = index === tokens.length - 1;
      if (PARTICLE_PRONE.has(lower)) {
        if (isLast || trail) return; // clause-final -> likely separable prefix
        if (lower === 'zu' || lower === 'um') {
          const n = next ? splitToken(next).core.toLowerCase() : '';
          if (!DET_LOOKUP.has(n) && !['mir', 'dir', 'ihm', 'ihr', 'uns', 'euch', 'ihnen', 'mich', 'dich', 'ihn', 'sie', 'es'].includes(n)) return;
        }
      }
      out.push({ index, kind: 'preposition', family: prep, word: lower });
    }
  });
  return out;
}

function matchCase(word: string, like: string): string {
  return like[0] !== like[0]!.toLowerCase() ? word[0]!.toUpperCase() + word.slice(1) : word;
}

export function makeCloze(tokens: readonly string[], seed: number): Cloze | null {
  const cands = findCandidates(tokens);
  if (cands.length === 0) return null;
  const rng = mulberry32(seed);
  const cand = cands[Math.floor(rng() * cands.length)]!;
  const { lead, core, trail } = splitToken(tokens[cand.index]!);

  let pool: string[];
  let backup: string[];
  if (cand.kind === 'article') {
    pool = DETERMINER_FAMILIES[cand.family]!.filter((w) => !AMBIGUOUS.has(w));
    backup = DETERMINER_FAMILIES.definite!.concat(DETERMINER_FAMILIES.indefinite!);
  } else {
    pool = PREPOSITION_GROUPS[cand.family]!;
    backup = ALL_PREPOSITIONS;
  }
  const distractors: string[] = [];
  for (const src of [pool, backup]) {
    for (const w of shuffle(src, rng)) {
      if (distractors.length >= 3) break;
      if (w !== cand.word && !distractors.includes(w)) distractors.push(w);
    }
  }
  const options = shuffle([cand.word, ...distractors], rng).map((w) => matchCase(w, core));
  return { ...cand, before: lead, after: trail, answer: core, options };
}
