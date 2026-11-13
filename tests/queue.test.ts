import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQueue } from '../src/lib/queue.ts';
import type { CardRec } from '../src/lib/storage.ts';

const c = (dueAt: number, state: CardRec['state'] = 'REVIEW'): CardRec => ({
  state, intervalDays: 1, easeFactor: 2.5, repetitions: 1, lapses: 0, learningStep: 0, dueAt,
  lastReviewedAt: 0, totalReviews: 1, correctReviews: 1,
});
const items = [
  { id: 'a', cefr: 'A2' }, { id: 'b', cefr: 'A2' }, { id: 'c', cefr: 'B1' },
  { id: 'd', cefr: 'B2' }, { id: 'e', cefr: 'A2' }, { id: 'f', cefr: 'A2' },
];

test('due sorted, new limited by budget, levels filtered', () => {
  const q = buildQueue(items, { a: c(200), b: c(100), c: c(50), e: c(9999) }, { levels: ['A2', 'B1'], newPerDay: 1 }, { newCount: 0 }, 1000);
  assert.deepEqual(q.due, ['c', 'b', 'a']);
  assert.deepEqual(q.fresh, ['f']);
  assert.equal(q.freshAvailable, 1);
});

test('daily budget is reduced by cards already introduced', () => {
  const q = buildQueue(items, {}, { levels: ['A2'], newPerDay: 3 }, { newCount: 2 }, 0);
  assert.deepEqual(q.fresh, ['a']);
  assert.equal(q.freshAvailable, 4);
  assert.deepEqual(buildQueue(items, {}, { levels: ['A2'], newPerDay: 3 }, { newCount: 5 }, 0).fresh, []);
});

test('suspended cards are ignored', () => {
  assert.deepEqual(buildQueue(items, { a: c(0, 'SUSPENDED') }, { levels: ['A2'], newPerDay: 0 }, { newCount: 0 }, 10).due, []);
});
