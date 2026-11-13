import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, shuffle, shuffleDifferent, hashSeed, sample } from '../src/lib/shuffle.ts';

test('mulberry32 is deterministic and in [0,1)', () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 100; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
  assert.notEqual(mulberry32(1)(), mulberry32(2)());
});

test('shuffle keeps the multiset and does not mutate', () => {
  const src = [1, 2, 3, 4, 5, 6];
  const out = shuffle(src, mulberry32(7));
  assert.deepEqual([...out].sort(), src);
  assert.deepEqual(src, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(shuffle(src, mulberry32(7)), out);
});

test('shuffleDifferent never returns the original order', () => {
  for (let seed = 0; seed < 200; seed++) {
    const src = ['a', 'b', 'c'];
    assert.notDeepEqual(shuffleDifferent(src, mulberry32(seed)), src);
  }
  assert.deepEqual(shuffleDifferent(['x', 'x'], mulberry32(1)), ['x', 'x']);
  assert.deepEqual(shuffleDifferent(['x'], mulberry32(1)), ['x']);
});

test('hashSeed is stable and sample picks distinct items', () => {
  assert.equal(hashSeed('abc'), hashSeed('abc'));
  assert.notEqual(hashSeed('abc'), hashSeed('abd'));
  const s = sample([1, 2, 3, 4, 5], 3, mulberry32(3));
  assert.equal(new Set(s).size, 3);
});
