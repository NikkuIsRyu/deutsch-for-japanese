import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, memoryBackend, DEFAULT_SETTINGS, PREFIX, type Backend, type CardRec } from '../src/lib/storage.ts';

const card = (over: Partial<CardRec> = {}): CardRec => ({
  state: 'REVIEW', intervalDays: 3, easeFactor: 2.5, repetitions: 2, lapses: 0, learningStep: 0,
  dueAt: 1000, lastReviewedAt: 500, totalReviews: 2, correctReviews: 2, ...over,
});

test('cards and settings roundtrip with namespaced keys', () => {
  const be = memoryBackend();
  const s = createStore(be);
  s.setCard('JA-S-1', card());
  s.saveSettings({ newPerDay: 5 });
  assert.deepEqual(s.getCard('JA-S-1'), card());
  assert.equal(s.getSettings().newPerDay, 5);
  assert.ok(be.keys().every((k) => k.startsWith(PREFIX)));
});

test('defaults and clamping', () => {
  const s = createStore(memoryBackend());
  assert.deepEqual(s.getSettings(), DEFAULT_SETTINGS);
  assert.equal(s.saveSettings({ speechRate: 5 }).speechRate, 1.1);
  assert.equal(s.saveSettings({ newPerDay: -3 }).newPerDay, 0);
});

test('corrupt data does not throw', () => {
  const be = memoryBackend();
  be.setItem(PREFIX + 'cards', '{not json');
  be.setItem(PREFIX + 'settings', '42');
  const s = createStore(be);
  assert.deepEqual(s.getCards(), {});
  assert.deepEqual(s.getSettings(), DEFAULT_SETTINGS);
});

test('throwing backend falls back to memory', () => {
  const bad: Backend = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('quota'); },
    removeItem() { throw new Error('denied'); },
    keys() { throw new Error('denied'); },
  };
  const s = createStore(bad);
  assert.deepEqual(s.getCards(), {});
  s.setCard('a', card());
  assert.deepEqual(s.getCard('a'), card());
  s.reset();
});

test('daily counter resets on a new day', () => {
  const s = createStore(memoryBackend());
  s.saveDaily({ day: '2026-11-01', newCount: 4, reviewCount: 9 });
  assert.equal(s.getDaily('2026-11-01').newCount, 4);
  assert.deepEqual(s.getDaily('2026-11-02'), { day: '2026-11-02', newCount: 0, reviewCount: 0 });
});

test('export / import roundtrip', () => {
  const a = createStore(memoryBackend());
  a.setCard('x', card());
  a.saveSettings({ showReading: false, levels: ['B1'] });
  a.bumpActivity('2026-11-01');
  const json = a.exportState('2026-11-13T00:00:00.000Z');
  const parsed = JSON.parse(json);
  assert.equal(parsed.schema, 1);
  assert.equal(parsed.exportedAt, '2026-11-13T00:00:00.000Z');

  const b = createStore(memoryBackend());
  const r = b.importState(json);
  assert.deepEqual(r, { ok: true, cards: 1 });
  assert.deepEqual(b.getCard('x'), card());
  assert.equal(b.getSettings().showReading, false);
  assert.deepEqual(b.getSettings().levels, ['B1']);
  assert.deepEqual(b.getActivity(), { '2026-11-01': 1 });
});

test('import rejects invalid input and leaves state untouched', () => {
  const s = createStore(memoryBackend());
  s.setCard('keep', card());
  assert.deepEqual(s.importState('nope'), { ok: false, error: 'invalid-json' });
  assert.deepEqual(s.importState('{"schema":2,"data":{}}'), { ok: false, error: 'bad-schema' });
  assert.deepEqual(s.importState('{"schema":1}'), { ok: false, error: 'bad-data' });
  const bad = JSON.stringify({ schema: 1, data: { cards: { z: { state: 'REVIEW' } } } });
  assert.equal(s.importState(bad).ok, false);
  assert.deepEqual(s.getCard('keep'), card());
});

test('reset removes only namespaced keys', () => {
  const be = memoryBackend();
  be.setItem('other', '1');
  const s = createStore(be);
  s.setCard('a', card());
  s.reset();
  assert.deepEqual(s.getCards(), {});
  assert.equal(be.getItem('other'), '1');
});
