// Port of the Android scheduler (Knowledge_Vault_App core/domain/engine/srs):
// SrsScheduler.kt, SrsConfig.kt, LearningDay.kt, SrsSnapshot.kt, SrsPreview.kt, ActivityStats.kt.
// Deterministic: time is always passed in (epoch milliseconds), no Date.now() in here.
// The 64-bit seed/fuzz arithmetic uses BigInt to match Kotlin's wrapping Long maths exactly.

export type SrsState = 'NEW' | 'LEARNING' | 'REVIEW' | 'RELEARNING' | 'SUSPENDED';
export type ReviewGrade = 'AGAIN' | 'HARD' | 'GOOD' | 'EASY';
export const GRADES: readonly ReviewGrade[] = ['AGAIN', 'HARD', 'GOOD', 'EASY'];

export interface SrsConfig {
  learningStepsMinutes: number[];
  graduatingIntervalDays: number;
  easyGraduatingIntervalDays: number;
  minimumEaseFactor: number;
  maximumIntervalDays: number;
  easyBonus: number;
  hardIntervalFactor: number;
  lapseNewIntervalFactor: number;
  relearningStepsMinutes: number[];
  fuzzFactor: number;
  learningDayCutoffHour: number;
  /** IANA zone id, e.g. "Europe/Berlin" or "UTC". */
  zoneId: string;
}

export function defaultConfig(overrides: Partial<SrsConfig> = {}): SrsConfig {
  return {
    learningStepsMinutes: [1, 10],
    graduatingIntervalDays: 1.0,
    easyGraduatingIntervalDays: 4.0,
    minimumEaseFactor: 1.3,
    maximumIntervalDays: 36500.0,
    easyBonus: 1.3,
    hardIntervalFactor: 1.2,
    lapseNewIntervalFactor: 0.5,
    relearningStepsMinutes: [10],
    fuzzFactor: 0.05,
    learningDayCutoffHour: 4,
    zoneId: 'UTC',
    ...overrides,
  };
}

/** Timestamps are epoch milliseconds. */
export interface SrsSnapshot {
  itemKey: string;
  state: SrsState;
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  lapses: number;
  learningStep: number;
  dueAt: number;
  lastReviewedAt: number | null;
  totalReviews: number;
  correctReviews: number;
}

export function initialSnapshot(itemKey: string, dueAt = 0): SrsSnapshot {
  return {
    itemKey,
    state: 'NEW',
    intervalDays: 0.0,
    easeFactor: 2.5,
    repetitions: 0,
    lapses: 0,
    learningStep: 0,
    dueAt,
    lastReviewedAt: null,
    totalReviews: 0,
    correctReviews: 0,
  };
}

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------- time zones

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function formatter(zone: string): Intl.DateTimeFormat {
  let f = dtfCache.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    dtfCache.set(zone, f);
  }
  return f;
}

export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
}

export function localParts(ms: number, zone: string): LocalParts {
  const out: Record<string, number> = {};
  for (const p of formatter(zone).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return { year: out.year!, month: out.month!, day: out.day!, hour: out.hour! % 24 };
}

/** Offset (zone minus UTC) in ms at the given instant. */
function zoneOffsetMs(ms: number, zone: string): number {
  const p = formatter(zone).formatToParts(new Date(ms));
  const o: Record<string, number> = {};
  for (const x of p) if (x.type !== 'literal') o[x.type] = Number(x.value);
  const asUtc = Date.UTC(o.year!, o.month! - 1, o.day!, o.hour! % 24, o.minute!, o.second!);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Local wall-clock (zone) to instant. Gaps shift forward, overlaps take the earlier instant (like java.time). */
export function zonedToInstant(year: number, month: number, day: number, hour: number, zone: string): number {
  const wall = Date.UTC(year, month - 1, day, hour, 0, 0);
  if (zone === 'UTC') return wall;
  const before = zoneOffsetMs(wall - DAY_MS, zone);
  const after = zoneOffsetMs(wall + DAY_MS, zone);
  const valid = [before, after]
    .map((o) => wall - o)
    .filter((t) => {
      const p = localParts(t, zone);
      return p.hour === hour && p.day === day;
    });
  if (valid.length === 0) return wall - before; // inside a DST gap
  return Math.min(...valid);
}

function ymd(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseYmd(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map(Number);
  return { y: y!, m: m!, d: d! };
}

export function plusDays(date: string, n: number): string {
  const { y, m, d } = parseYmd(date);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

// ---------------------------------------------------------------- LearningDay

export const LearningDay = {
  /** ISO date (YYYY-MM-DD) of the learning day containing `now`. */
  getLearningDate(now: number, cutoffHour: number, zone: string): string {
    const p = localParts(now, zone);
    const date = ymd(p.year, p.month, p.day);
    return p.hour < cutoffHour ? plusDays(date, -1) : date;
  },

  calculateDueDate(now: number, intervalDays: number, cutoffHour: number, zone: string): number {
    const learningDate = LearningDay.getLearningDate(now, cutoffHour, zone);
    const daysToAdd = Math.max(1, Math.round(intervalDays)); // Math.round == Java's floor(x + 0.5) for x >= 0
    const target = parseYmd(plusDays(learningDate, daysToAdd));
    return zonedToInstant(target.y, target.m, target.d, cutoffHour, zone);
  },

  startOfLearningDay(now: number, cutoffHour: number, zone: string): number {
    const date = parseYmd(LearningDay.getLearningDate(now, cutoffHour, zone));
    return zonedToInstant(date.y, date.m, date.d, cutoffHour, zone);
  },
};

// ---------------------------------------------------------------- scheduler

const I64 = (x: bigint) => BigInt.asIntN(64, x);
const U64 = (x: bigint) => BigInt.asUintN(64, x);

export function deriveSeed(itemKey: string, totalReviews: number): bigint {
  let h = 1125899906842597n;
  for (let i = 0; i < itemKey.length; i++) {
    h = I64(31n * h + BigInt(itemKey.charCodeAt(i)));
  }
  return I64(h ^ I64(BigInt(totalReviews) * 0x5deece66dn));
}

export function deterministicFuzz(interval: number, seed: bigint, fuzzFactor: number): number {
  if (interval < 2.0 || fuzzFactor <= 0.0) return interval;
  let z = I64(seed + -0x61c8864680b583ebn);
  z = I64((z ^ (U64(z) >> 30n)) * -0x5b350417933183bn);
  z = I64((z ^ (U64(z) >> 27n)) * -0x6b2fb644c867e2b5n);
  const mixed = I64(z ^ (U64(z) >> 31n));
  const MAX = 0x7fffffffffffffffn;
  const unit = (Number(mixed & MAX) / Number(MAX)) * 2.0 - 1.0;
  return interval + interval * fuzzFactor * unit;
}

function at(arr: number[], i: number, fallback: number): number {
  return i >= 0 && i < arr.length ? arr[i]! : fallback;
}

export function schedule(
  state: SrsSnapshot,
  grade: ReviewGrade,
  now: number,
  cfg: SrsConfig = defaultConfig(),
  seed: bigint = deriveSeed(state.itemKey, state.totalReviews),
): SrsSnapshot {
  const totalReviews = state.totalReviews + 1;
  const correctReviews = grade !== 'AGAIN' ? state.correctReviews + 1 : state.correctReviews;
  switch (state.state) {
    case 'NEW':
    case 'LEARNING':
      return handleLearning(state, grade, now, cfg, totalReviews, correctReviews);
    case 'RELEARNING':
      return handleRelearning(state, grade, now, cfg, totalReviews, correctReviews);
    case 'REVIEW':
      return handleReview(state, grade, now, cfg, seed, totalReviews, correctReviews);
    case 'SUSPENDED':
      return { ...state, totalReviews, lastReviewedAt: now };
  }
}

function handleLearning(
  s: SrsSnapshot, grade: ReviewGrade, now: number, cfg: SrsConfig, totalReviews: number, correctReviews: number,
): SrsSnapshot {
  const steps = cfg.learningStepsMinutes;
  const common = { totalReviews, correctReviews, lastReviewedAt: now };
  const graduate = (interval: number): SrsSnapshot => ({
    ...s,
    state: 'REVIEW',
    learningStep: 0,
    intervalDays: interval,
    repetitions: 1,
    dueAt: LearningDay.calculateDueDate(now, interval, cfg.learningDayCutoffHour, cfg.zoneId),
    ...common,
  });
  switch (grade) {
    case 'AGAIN':
      return { ...s, state: 'LEARNING', learningStep: 0, dueAt: now + at(steps, 0, 1) * 60_000, intervalDays: 0.0, ...common };
    case 'HARD':
      return { ...s, state: 'LEARNING', dueAt: now + at(steps, s.learningStep, 1) * 60_000, ...common };
    case 'GOOD': {
      const nextStep = s.learningStep + 1;
      if (nextStep < steps.length) {
        return { ...s, state: 'LEARNING', learningStep: nextStep, dueAt: now + steps[nextStep]! * 60_000, intervalDays: 0.0, ...common };
      }
      return graduate(cfg.graduatingIntervalDays);
    }
    case 'EASY':
      return graduate(cfg.easyGraduatingIntervalDays);
  }
}

function handleRelearning(
  s: SrsSnapshot, grade: ReviewGrade, now: number, cfg: SrsConfig, totalReviews: number, correctReviews: number,
): SrsSnapshot {
  const steps = cfg.relearningStepsMinutes;
  const common = { totalReviews, correctReviews, lastReviewedAt: now };
  switch (grade) {
    case 'AGAIN':
      return { ...s, learningStep: 0, dueAt: now + at(steps, 0, 10) * 60_000, ...common };
    case 'HARD':
      return { ...s, dueAt: now + at(steps, s.learningStep, 10) * 60_000, ...common };
    case 'GOOD':
    case 'EASY': {
      const interval = Math.max(1.0, s.intervalDays);
      return {
        ...s,
        state: 'REVIEW',
        learningStep: 0,
        intervalDays: interval,
        repetitions: 1,
        dueAt: LearningDay.calculateDueDate(now, interval, cfg.learningDayCutoffHour, cfg.zoneId),
        ...common,
      };
    }
  }
}

function handleReview(
  s: SrsSnapshot, grade: ReviewGrade, now: number, cfg: SrsConfig, seed: bigint, totalReviews: number, correctReviews: number,
): SrsSnapshot {
  // Duration.between(...).seconds truncates toward zero.
  const diffSeconds = Math.trunc((now - s.dueAt) / 1000);
  const daysLate = Math.max(0.0, diffSeconds / 86400.0);
  const currentInterval = s.intervalDays;
  const currentEase = s.easeFactor;
  const common = { totalReviews, correctReviews, lastReviewedAt: now };
  const finish = (interval: number, ease: number): SrsSnapshot => {
    const capped = Math.min(cfg.maximumIntervalDays, deterministicFuzz(interval, seed, cfg.fuzzFactor));
    return {
      ...s,
      state: 'REVIEW',
      intervalDays: capped,
      easeFactor: ease,
      repetitions: s.repetitions + 1,
      dueAt: LearningDay.calculateDueDate(now, capped, cfg.learningDayCutoffHour, cfg.zoneId),
      ...common,
    };
  };
  switch (grade) {
    case 'AGAIN':
      return {
        ...s,
        state: 'RELEARNING',
        intervalDays: Math.max(1.0, currentInterval * cfg.lapseNewIntervalFactor),
        easeFactor: Math.max(cfg.minimumEaseFactor, currentEase - 0.2),
        repetitions: 0,
        lapses: s.lapses + 1,
        learningStep: 0,
        dueAt: now + at(cfg.relearningStepsMinutes, 0, 10) * 60_000,
        ...common,
      };
    case 'HARD':
      return finish(
        Math.max(currentInterval + 1.0, currentInterval * cfg.hardIntervalFactor),
        Math.max(cfg.minimumEaseFactor, currentEase - 0.15),
      );
    case 'GOOD':
      return finish(Math.max(currentInterval + 1.0, (currentInterval + daysLate / 2.0) * currentEase), currentEase);
    case 'EASY':
      return finish((currentInterval + daysLate) * currentEase * cfg.easyBonus, currentEase + 0.15);
  }
}

// ---------------------------------------------------------------- preview

/** Milliseconds until the card would be due, per grade (never negative). */
export function nextIntervals(
  snapshot: SrsSnapshot, now: number, cfg: SrsConfig = defaultConfig(),
): Record<ReviewGrade, number> {
  const out = {} as Record<ReviewGrade, number>;
  for (const g of GRADES) out[g] = Math.max(0, schedule(snapshot, g, now, cfg).dueAt - now);
  return out;
}

/** Short Anki-style label, minimum "1m": 10m, 5h, 3d, 2mo, 1.5y. */
export function formatInterval(durationMs: number): string {
  const minutes = Math.floor(durationMs / 60_000);
  if (minutes < 1) return '1m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(durationMs / 3_600_000);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(minutes / 1440.0);
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30.0)}mo`;
  return `${(days / 365.0).toFixed(1)}y`;
}

// ---------------------------------------------------------------- activity

export function bucketActivity(timestamps: number[], cfg: SrsConfig): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of timestamps) {
    const d = LearningDay.getLearningDate(t, cfg.learningDayCutoffHour, cfg.zoneId);
    out.set(d, (out.get(d) ?? 0) + 1);
  }
  return out;
}

export function currentStreak(byDay: Map<string, number>, today: string): number {
  let day = (byDay.get(today) ?? 0) > 0 ? today : plusDays(today, -1);
  let streak = 0;
  while ((byDay.get(day) ?? 0) > 0) {
    streak++;
    day = plusDays(day, -1);
  }
  return streak;
}
