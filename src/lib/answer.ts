// Answer normalisation, grading and word diff for the typing mode.

export type Verdict = 'correct' | 'almost' | 'wrong';
export type DiffStatus = 'ok' | 'missing' | 'extra' | 'changed';
export interface DiffItem {
  /** The word as typed (extra / changed) or as expected (ok / missing). */
  word: string;
  status: DiffStatus;
  /** For "changed": the expected word. */
  expected?: string;
}
export interface GradeResult {
  verdict: Verdict;
  diff: DiffItem[];
  hints: Array<'capitalization'>;
}

const EDGE_PUNCT = /^[\s„"“”‚'‘’«»‹›.,!?;:…\-–—()]+|[\s„"“”‚'‘’«»‹›.,!?;:…\-–—()]+$/gu;

function strip(s: string): string {
  return s.normalize('NFC').replace(EDGE_PUNCT, '');
}

/** Case-insensitive, punctuation-insensitive, umlaut-transliteration-insensitive form. */
export function normalize(s: string): string {
  return strip(s)
    .replace(/\s+/gu, ' ')
    .toLowerCase()
    .replace(/ä/gu, 'ae')
    .replace(/ö/gu, 'oe')
    .replace(/ü/gu, 'ue')
    .replace(/ß/gu, 'ss');
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    prev = cur;
  }
  return prev[n]!;
}

function words(s: string): string[] {
  return s.normalize('NFC').trim().split(/\s+/u).filter(Boolean);
}

/** Word-level diff (LCS on normalised words). */
export function diffWords(expected: string, given: string): DiffItem[] {
  const e = words(expected), g = words(given);
  const en = e.map(normalize), gn = g.map(normalize);
  const m = e.length, n = g.length;
  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      lcs[i]![j] = en[i] === gn[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffItem[] = [];
  let i = 0, j = 0;
  let missing: string[] = [], extra: string[] = [];
  const flush = () => {
    const k = Math.min(missing.length, extra.length);
    for (let x = 0; x < k; x++) out.push({ word: extra[x]!, status: 'changed', expected: missing[x]! });
    for (let x = k; x < missing.length; x++) out.push({ word: missing[x]!, status: 'missing' });
    for (let x = k; x < extra.length; x++) out.push({ word: extra[x]!, status: 'extra' });
    missing = []; extra = [];
  };
  while (i < m || j < n) {
    if (i < m && j < n && en[i] === gn[j]) {
      flush();
      out.push({ word: e[i]!, status: 'ok' });
      i++; j++;
    } else if (j >= n || (i < m && lcs[i + 1]![j]! >= lcs[i]![j + 1]!)) {
      missing.push(e[i]!); i++;
    } else {
      extra.push(g[j]!); j++;
    }
  }
  flush();
  return out;
}

/** Compare case of each word except the first; true if the typed text misses a capital the expected text has. */
function capitalizationMismatch(expected: string, given: string): boolean {
  const e = words(expected).map(strip), g = words(given).map(strip);
  if (e.length !== g.length) return false;
  for (let i = 1; i < e.length; i++) {
    if (e[i] !== g[i] && normalize(e[i]!) === normalize(g[i]!)) {
      // only case differs (or umlaut spelling, which is fine)
      if (e[i]!.toLowerCase() === g[i]!.toLowerCase() && e[i] !== g[i]) return true;
    }
  }
  return false;
}

export function grade(expected: string, given: string): GradeResult {
  // Compare word by word so punctuation inside the sentence (commas) never matters.
  const key = (t: string) => words(t).map(normalize).filter(Boolean).join(' ');
  const ne = key(expected), ng = key(given);
  const diff = diffWords(expected, given);
  const hints: Array<'capitalization'> = [];
  if (ng === '') return { verdict: 'wrong', diff, hints };

  if (ne === ng) {
    if (capitalizationMismatch(expected, given)) return { verdict: 'almost', diff, hints: ['capitalization'] };
    return { verdict: 'correct', diff, hints };
  }
  const badWords = diff.filter((d) => d.status !== 'ok').length;
  if (levenshtein(ne, ng) <= 2 || badWords === 1) return { verdict: 'almost', diff, hints };
  return { verdict: 'wrong', diff, hints };
}

/** Build mode: exact token order, case-sensitive except the first token. */
export function tokensMatch(expected: readonly string[], given: readonly string[]): boolean {
  if (expected.length !== given.length) return false;
  return expected.every((t, i) => (i === 0 ? t.toLowerCase() === given[i]!.toLowerCase() : t === given[i]));
}
