import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGrade } from '../src/lib/progress.ts';
import { createStore, memoryBackend } from '../src/lib/storage.ts';
import { defaultConfig } from '../src/lib/srs.ts';
import { pickPractice } from '../src/lib/queue.ts';
import { mulberry32 } from '../src/lib/shuffle.ts';

const cfg = defaultConfig();
const t0 = Date.parse('2026-11-02T10:00:00Z');

test('applyGrade persists the card and counts a new card once', () => {
  const s = createStore(memoryBackend());
  const a = applyGrade(s, 'x', 'GOOD', t0, cfg);
  assert.equal(a.state, 'LEARNING');
  assert.equal(s.getCard('x')!.state, 'LEARNING');
  applyGrade(s, 'x', 'GOOD', t0 + 600_000, cfg);
  const d = s.getDaily('2026-11-02');
  assert.equal(d.newCount, 1);
  assert.equal(d.reviewCount, 2);
  assert.equal(s.getCard('x')!.state, 'REVIEW');
  assert.deepEqual(s.getActivity(), { '2026-11-02': 2 });
});

test('pickPractice fills with non-SRS extras', () => {
  const items = ['a', 'b', 'c', 'd'].map((id) => ({ id, cefr: 'A2' }));
  const s = createStore(memoryBackend());
  applyGrade(s, 'a', 'EASY', t0, cfg); // due in 4 days, not due now
  const r = pickPractice(items, s.getCards(), { levels: ['A2'], newPerDay: 1 }, { newCount: 0 }, t0, 3, mulberry32(1));
  assert.equal(r.length, 3);
  assert.deepEqual(r[0], { id: 'b', srs: true });
  assert.ok(r.slice(1).every((x) => !x.srs));
  assert.equal(new Set(r.map((x) => x.id)).size, 3);
});
