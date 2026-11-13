import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findCandidates, makeCloze } from '../src/lib/cloze.ts';

const tok = (s: string) => s.split(' ');

test('finds articles and prepositions', () => {
  const c = findCandidates(tok('Ich gebe dem Lehrer das Buch in der Schule.'));
  assert.deepEqual(c.map((x) => x.word), ['dem', 'das', 'in', 'der']);
  assert.equal(c.find((x) => x.word === 'in')!.kind, 'preposition');
});

test('skips separable-verb particles at clause end and bare ihr/sein', () => {
  assert.deepEqual(findCandidates(tok('Ich rufe dich morgen an.')), []);
  assert.deepEqual(findCandidates(tok('Es muss sein.')), []);
  assert.deepEqual(findCandidates(tok('Er hat ihr geholfen.')), []);
  assert.equal(findCandidates(tok('Das ist seine Tasche.')).length, 1);
  assert.deepEqual(findCandidates(tok('Das ist gut.')), []);
});

test('zu only counts before a determiner or pronoun', () => {
  assert.deepEqual(findCandidates(tok('Ich habe keine Lust zu gehen.')).map((x) => x.word), ['keine']);
  assert.deepEqual(findCandidates(tok('Ich gehe zu dem Arzt.')).map((x) => x.word), ['zu', 'dem']);
});

test('makeCloze: 4 unique options including the answer, deterministic', () => {
  const tokens = tok('Wir fahren mit dem Zug nach Berlin.');
  for (let seed = 0; seed < 50; seed++) {
    const c = makeCloze(tokens, seed)!;
    assert.equal(c.options.length, 4);
    assert.equal(new Set(c.options).size, 4);
    assert.ok(c.options.includes(c.answer));
    assert.deepEqual(makeCloze(tokens, seed), c);
  }
});

test('makeCloze: distractors come from the same family and keep capitalisation/punctuation', () => {
  const c = makeCloze(tok('Dem Kind gehört das Buch.'), 1)!;
  const family = ['der', 'die', 'das', 'den', 'dem', 'des'];
  for (const o of c.options) assert.ok(family.includes(o.toLowerCase()));
  if (c.index === 0) assert.ok(c.options.every((o) => o[0] === o[0]!.toUpperCase()));
  const d = makeCloze(['Ich', 'sehe', 'den,', 'Mann'], 3)!;
  assert.equal(d.answer, 'den');
  assert.equal(d.after, ',');
});

test('makeCloze returns null without candidates', () => {
  assert.equal(makeCloze(tok('Ich lache laut.'), 1), null);
});
