import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, grade, levenshtein, diffWords, tokensMatch } from '../src/lib/answer.ts';

test('normalize: NFC, spaces, punctuation, case, umlaut transliteration', () => {
  assert.equal(normalize('  „Ich   gehe  nach Hause.“ '), 'ich gehe nach hause');
  assert.equal(normalize('Müller'), normalize('Müller'));
  assert.equal(normalize('Schöne Grüße'), normalize('Schoene Gruesse'));
  assert.equal(normalize('Straße'), normalize('Strasse'));
  assert.equal(normalize('Was?!'), 'was');
});

test('levenshtein', () => {
  assert.equal(levenshtein('kitten', 'sitting'), 3);
  assert.equal(levenshtein('', 'abc'), 3);
  assert.equal(levenshtein('abc', 'abc'), 0);
});

test('grade: correct incl. transliteration and punctuation', () => {
  const exp = 'Ich möchte einen Kaffee, bitte.';
  assert.equal(grade(exp, 'Ich möchte einen Kaffee, bitte.').verdict, 'correct');
  assert.equal(grade(exp, 'ich moechte einen Kaffee bitte').verdict, 'correct');
  assert.equal(grade('Das ist groß.', 'Das ist gross').verdict, 'correct');
});

test('grade: typo within 2 chars is almost', () => {
  const r = grade('Ich wohne in Berlin.', 'Ich wohne in Berlni.');
  assert.equal(r.verdict, 'almost');
});

test('grade: exactly one wrong or missing word is almost', () => {
  assert.equal(grade('Wir fahren morgen nach Hamburg.', 'Wir fahren morgen nach München.').verdict, 'almost');
  assert.equal(grade('Wir fahren morgen nach Hamburg.', 'Wir fahren nach Hamburg.').verdict, 'almost');
  const d = diffWords('Wir fahren morgen nach Hamburg.', 'Wir fahren nach Hamburg.');
  assert.deepEqual(d.filter((x) => x.status !== 'ok'), [{ word: 'morgen', status: 'missing' }]);
});

test('grade: wrong and empty', () => {
  assert.equal(grade('Wir fahren morgen nach Hamburg.', 'Ich habe Hunger').verdict, 'wrong');
  assert.equal(grade('Hallo', '   ').verdict, 'wrong');
});

test('grade: missing noun capitalisation yields a hint', () => {
  const r = grade('Ich habe einen Hund.', 'Ich habe einen hund.');
  assert.equal(r.verdict, 'almost');
  assert.deepEqual(r.hints, ['capitalization']);
  // first word case is not an error
  assert.equal(grade('Ich habe einen Hund.', 'ich habe einen Hund.').verdict, 'correct');
});

test('diff reports changed words with expected', () => {
  const d = diffWords('Er liest ein Buch', 'Er liest eine Zeitung');
  assert.deepEqual(d.map((x) => x.status), ['ok', 'ok', 'changed', 'changed']);
  assert.equal(d[2]!.expected, 'ein');
});

test('tokensMatch: order exact, case-sensitive except first token', () => {
  const t = ['Der', 'Hund', 'schläft.'];
  assert.ok(tokensMatch(t, ['der', 'Hund', 'schläft.']));
  assert.ok(!tokensMatch(t, ['Der', 'hund', 'schläft.']));
  assert.ok(!tokensMatch(t, ['Hund', 'Der', 'schläft.']));
  assert.ok(!tokensMatch(t, ['Der', 'Hund']));
});
