// Ported from SrsSchedulerTest.kt, SrsPreviewTest.kt and ActivityStatsTest.kt (Android app).
// Not ported: replayEquivalence (needs ReplayProgressUseCase, which is not part of this app).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  schedule, initialSnapshot, defaultConfig, deriveSeed, LearningDay, nextIntervals, formatInterval,
  bucketActivity, currentStreak, zonedToInstant, plusDays, GRADES,
  type SrsSnapshot,
} from '../src/lib/srs.ts';

const cfg = defaultConfig();
const t = (iso: string) => Date.parse(iso);
const near = (a: number, b: number, eps = 0.001) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

function review(over: Partial<SrsSnapshot> & { itemKey: string }): SrsSnapshot {
  return { ...initialSnapshot(over.itemKey), state: 'REVIEW', ...over };
}

test('newCard_goodThenGood_graduatesToOneDay', () => {
  const t0 = t('2026-11-02T10:00:00Z');
  const step1 = schedule(initialSnapshot('card_new'), 'GOOD', t0, cfg);
  assert.equal(step1.state, 'LEARNING');
  assert.equal(step1.learningStep, 1);
  near(step1.intervalDays, 0.0);
  assert.equal(step1.dueAt, t0 + 600_000);

  const t1 = t0 + 600_000;
  const graduated = schedule(step1, 'GOOD', t1, cfg);
  assert.equal(graduated.state, 'REVIEW');
  assert.equal(graduated.learningStep, 0);
  near(graduated.intervalDays, 1.0);
  assert.equal(graduated.repetitions, 1);
  assert.equal(graduated.dueAt, t('2026-11-03T04:00:00Z'));
});

test('review_again_lapsesAndFloorsEaseAt1_3', () => {
  const initial = review({
    itemKey: 'card_review', intervalDays: 10.0, easeFactor: 1.4, repetitions: 4, lapses: 0,
    dueAt: t('2026-11-02T04:00:00Z'),
  });
  const now = t('2026-11-02T08:00:00Z');
  const lapsed = schedule(initial, 'AGAIN', now, cfg);
  assert.equal(lapsed.state, 'RELEARNING');
  assert.equal(lapsed.lapses, 1);
  assert.equal(lapsed.repetitions, 0);
  near(lapsed.easeFactor, 1.3);
  near(lapsed.intervalDays, 5.0);
  assert.equal(lapsed.dueAt, now + 600_000);

  const second = schedule({ ...lapsed, state: 'REVIEW' }, 'AGAIN', now + 1_000_000, cfg);
  near(second.easeFactor, 1.3);
  assert.equal(second.lapses, 2);
});

test('review_easyBonus_scalesIntervalAndEase', () => {
  const card = review({
    itemKey: 'card_easy', intervalDays: 10.0, easeFactor: 2.5, repetitions: 3, dueAt: t('2026-11-02T04:00:00Z'),
  });
  const now = t('2026-11-02T04:00:00Z');
  const seed = 12345n;
  const good = schedule(card, 'GOOD', now, cfg, seed);
  const easy = schedule(card, 'EASY', now, cfg, seed);
  near(good.easeFactor, 2.5);
  near(easy.easeFactor, 2.65);
  assert.ok(easy.intervalDays > good.intervalDays * 1.25);
});

test('interval_cappedAtMaximum', () => {
  const huge = review({
    itemKey: 'card_huge', intervalDays: 30000.0, easeFactor: 2.5, repetitions: 10, dueAt: t('2026-11-02T04:00:00Z'),
  });
  const result = schedule(huge, 'EASY', t('2026-11-02T04:00:00Z'), cfg);
  assert.ok(result.intervalDays <= cfg.maximumIntervalDays);
  near(result.intervalDays, cfg.maximumIntervalDays);
});

test('determinism_sameInputsProduceIdenticalOutputs1000x', () => {
  const snapshot = review({
    itemKey: 'card_deterministic', intervalDays: 14.0, easeFactor: 2.4, repetitions: 3, lapses: 1,
    dueAt: t('2026-11-02T04:00:00Z'), totalReviews: 5, correctReviews: 4,
  });
  const now = t('2026-11-02T12:30:00Z');
  const seed = 987654321n;
  const baseline = schedule(snapshot, 'GOOD', now, cfg, seed);
  for (let i = 0; i < 1000; i++) assert.deepEqual(schedule(snapshot, 'GOOD', now, cfg, seed), baseline);
});

test('deriveSeed / fuzz stay within +-5% and are stable', () => {
  assert.equal(deriveSeed('a', 0), deriveSeed('a', 0));
  assert.notEqual(deriveSeed('a', 0), deriveSeed('a', 1));
  const card = review({ itemKey: 'x', intervalDays: 20, easeFactor: 2.5, dueAt: 0 });
  const r = schedule(card, 'GOOD', 0, cfg);
  assert.ok(r.intervalDays >= 50 * 0.95 && r.intervalDays <= 50 * 1.05);
});

test('sequential review run is reproducible (replay substitute)', () => {
  const t0 = t('2026-11-01T09:00:00Z');
  const seq: Array<[any, number]> = [
    ['GOOD', t0], ['GOOD', t0 + 600_000], ['GOOD', t0 + 86400_000], ['AGAIN', t0 + 3 * 86400_000],
    ['GOOD', t0 + 3 * 86400_000 + 600_000], ['HARD', t0 + 6 * 86400_000], ['EASY', t0 + 12 * 86400_000],
  ];
  const run = () => {
    let s = initialSnapshot('card_replay_test');
    for (const [g, at] of seq) s = schedule(s, g, at, cfg, deriveSeed(s.itemKey, s.totalReviews));
    return s;
  };
  assert.deepEqual(run(), run());
  assert.equal(run().totalReviews, 7);
  assert.equal(run().correctReviews, 6);
  assert.equal(run().lapses, 1);
});

test('learningDayCutoff_0400LocalTime', () => {
  assert.equal(LearningDay.calculateDueDate(t('2026-11-02T02:30:00Z'), 1.0, 4, 'UTC'), t('2026-11-02T04:00:00Z'));
  assert.equal(LearningDay.calculateDueDate(t('2026-11-02T05:00:00Z'), 1.0, 4, 'UTC'), t('2026-11-03T04:00:00Z'));
});

// ---- SrsPreviewTest

test('preview: every grade predicted and matches the real scheduler', () => {
  const now = t('2026-03-10T12:00:00Z');
  const card = review({ itemKey: 'w1', intervalDays: 10, easeFactor: 2.5, repetitions: 3, dueAt: now, totalReviews: 4, correctReviews: 4 });
  const p = nextIntervals(card, now, cfg);
  for (const g of GRADES) assert.equal(p[g], schedule(card, g, now, cfg).dueAt - now);
  assert.equal(p.AGAIN, 10 * 60_000);
  assert.ok(p.HARD < p.GOOD && p.GOOD < p.EASY);
  assert.deepEqual(nextIntervals(card, now, cfg), p);
});

test('preview: new card follows the learning steps', () => {
  const now = t('2026-03-10T12:00:00Z');
  const p = nextIntervals(initialSnapshot('n1', now), now, cfg);
  assert.equal(p.AGAIN, 60_000);
  assert.equal(p.GOOD, 600_000);
  assert.ok(p.EASY > p.GOOD);
});

test('preview: format uses short labels', () => {
  const min = 60_000, h = 3_600_000, d = 86_400_000;
  assert.equal(formatInterval(0), '1m');
  assert.equal(formatInterval(59_000), '1m');
  assert.equal(formatInterval(10 * min), '10m');
  assert.equal(formatInterval(5 * h), '5h');
  assert.equal(formatInterval(3 * d), '3d');
  assert.equal(formatInterval(62 * h), '3d');
  assert.equal(formatInterval(60 * d), '2mo');
  assert.equal(formatInterval(548 * d), '1.5y');
});

// ---- ActivityStatsTest (Europe/Berlin incl. DST)

const berlinCfg = defaultConfig({ zoneId: 'Europe/Berlin', learningDayCutoffHour: 4 });
const ms = (y: number, mo: number, d: number, h: number, mi = 0, zone = 'Europe/Berlin') => {
  const base = zonedToInstant(y, mo, d, h, zone);
  return base + mi * 60_000;
};
const entries = (m: Map<string, number>) => Object.fromEntries([...m.entries()].sort());

test('bucket: cutoff 03:59 belongs to previous day', () => {
  const out = bucketActivity(
    [ms(2026, 11, 5, 3, 59), ms(2026, 11, 5, 4, 0), ms(2026, 11, 5, 23, 59), ms(2026, 11, 6, 3, 59)], berlinCfg);
  assert.deepEqual(entries(out), { '2026-11-04': 1, '2026-11-05': 3 });
});

test('bucket: custom cutoff hour', () => {
  const out = bucketActivity([ms(2026, 11, 5, 5, 30)], { ...berlinCfg, learningDayCutoffHour: 6 });
  assert.deepEqual(entries(out), { '2026-11-04': 1 });
});

test('bucket: DST spring forward 2026-03-29', () => {
  const out = bucketActivity(
    [ms(2026, 3, 29, 1, 59), ms(2026, 3, 29, 3, 0), ms(2026, 3, 29, 4, 0), ms(2026, 3, 29, 22, 0)], berlinCfg);
  assert.deepEqual(entries(out), { '2026-03-28': 2, '2026-03-29': 2 });
  const days = bucketActivity([ms(2026, 3, 29, 4, 0), ms(2026, 3, 30, 3, 59), ms(2026, 3, 30, 4, 0)], berlinCfg);
  assert.deepEqual(entries(days), { '2026-03-29': 2, '2026-03-30': 1 });
});

test('bucket: DST fall back 2026-10-25 (25h day)', () => {
  const first = Date.parse('2026-10-25T00:30:00Z'); // 02:30 CEST
  const second = Date.parse('2026-10-25T01:30:00Z'); // 02:30 CET
  const out = bucketActivity([first, second, ms(2026, 10, 25, 4, 0), ms(2026, 10, 26, 3, 59)], berlinCfg);
  assert.deepEqual(entries(out), { '2026-10-24': 2, '2026-10-25': 2 });
});

test('bucket: empty', () => assert.equal(bucketActivity([], berlinCfg).size, 0));

const days = (today: string, ...offsets: number[]) => new Map(offsets.map((o) => [plusDays(today, -o), 3]));

test('streak cases', () => {
  assert.equal(currentStreak(days('2026-11-05', 0, 1, 2), '2026-11-05'), 3);
  assert.equal(currentStreak(days('2026-11-05', 1, 2), '2026-11-05'), 2);
  assert.equal(currentStreak(days('2026-11-05', 0, 1, 3, 4, 5), '2026-11-05'), 2);
  assert.equal(currentStreak(days('2026-11-05', 2, 3), '2026-11-05'), 0);
  assert.equal(currentStreak(new Map(), '2026-11-05'), 0);
  assert.equal(currentStreak(new Map([['2026-11-05', 0], ['2026-11-04', 0]]), '2026-11-05'), 0);
  assert.equal(currentStreak(days('2027-01-02', 0, 1, 2, 3), '2027-01-02'), 4);
});

test('streak from bucketed timestamps end to end', () => {
  const ts = [ms(2026, 11, 3, 10), ms(2026, 11, 4, 10), ms(2026, 11, 5, 2, 0)];
  assert.equal(currentStreak(bucketActivity(ts, berlinCfg), '2026-11-04'), 2);
});
