// Applies a grade to a stored card: schedule, persist, update daily counters and activity.
import { schedule, initialSnapshot, LearningDay, type ReviewGrade, type SrsConfig, type SrsSnapshot } from './srs.ts';
import type { Store, CardRec } from './storage.ts';

export function toSnapshot(id: string, rec: CardRec | null): SrsSnapshot {
  return rec ? { itemKey: id, ...rec } : initialSnapshot(id);
}

export function toRec(s: SrsSnapshot): CardRec {
  const { itemKey: _ignored, ...rec } = s;
  return rec;
}

export function applyGrade(store: Store, id: string, grade: ReviewGrade, now: number, cfg: SrsConfig): SrsSnapshot {
  const prev = store.getCard(id);
  const next = schedule(toSnapshot(id, prev), grade, now, cfg);
  store.setCard(id, toRec(next));
  const day = LearningDay.getLearningDate(now, cfg.learningDayCutoffHour, cfg.zoneId);
  const daily = store.getDaily(day);
  if (!prev || prev.state === 'NEW') daily.newCount += 1;
  daily.reviewCount += 1;
  store.saveDaily(daily);
  store.bumpActivity(day);
  return next;
}
