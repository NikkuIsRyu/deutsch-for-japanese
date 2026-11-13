// Builds the review queue from card states. Pure: all inputs injected.
import type { CardRec, Daily, Settings } from './storage.ts';

export interface QueueItem { id: string; cefr: string }

export interface Queue {
  /** Learning/relearning cards that are due (minutes-level steps) plus review cards due, soonest first. */
  due: string[];
  /** Unseen cards, limited by the daily budget. */
  fresh: string[];
  /** Unseen cards in total (before the daily limit). */
  freshAvailable: number;
}

export function buildQueue(
  items: readonly QueueItem[],
  cards: Record<string, CardRec>,
  settings: Pick<Settings, 'levels' | 'newPerDay'>,
  daily: Pick<Daily, 'newCount'>,
  now: number,
): Queue {
  const levels = new Set<string>(settings.levels);
  const due: Array<{ id: string; at: number }> = [];
  const unseen: string[] = [];
  for (const it of items) {
    if (!levels.has(it.cefr)) continue;
    const c = cards[it.id];
    if (!c || c.state === 'NEW') {
      unseen.push(it.id);
    } else if (c.state !== 'SUSPENDED' && c.dueAt <= now) {
      due.push({ id: it.id, at: c.dueAt });
    }
  }
  due.sort((a, b) => a.at - b.at);
  const budget = Math.max(0, settings.newPerDay - daily.newCount);
  return { due: due.map((d) => d.id), fresh: unseen.slice(0, budget), freshAvailable: unseen.length };
}

export interface PracticeItem { id: string; srs: boolean }

/**
 * Items for a practice session: due cards, then new cards within today's budget (both feed the SRS),
 * then random extra sentences (srs: false) to fill up to `size`.
 */
export function pickPractice(
  items: readonly QueueItem[],
  cards: Record<string, CardRec>,
  settings: Pick<Settings, 'levels' | 'newPerDay'>,
  daily: Pick<Daily, 'newCount'>,
  now: number,
  size: number,
  rng: () => number,
): PracticeItem[] {
  const q = buildQueue(items, cards, settings, daily, now);
  const out: PracticeItem[] = [...q.due, ...q.fresh].slice(0, size).map((id) => ({ id, srs: true }));
  if (out.length < size) {
    const taken = new Set(out.map((o) => o.id));
    const levels = new Set<string>(settings.levels);
    const rest = items.filter((i) => levels.has(i.cefr) && !taken.has(i.id));
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [rest[i], rest[j]] = [rest[j]!, rest[i]!];
    }
    for (const r of rest.slice(0, size - out.length)) out.push({ id: r.id, srs: false });
  }
  return out;
}
