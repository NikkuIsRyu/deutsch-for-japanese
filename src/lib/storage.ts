// Local persistence: namespaced keys, every access guarded, in-memory fallback, export/import.
import type { SrsSnapshot, SrsState } from './srs.ts';

export const PREFIX = 'dfj:v1:';
export const SCHEMA = 1;

export interface Backend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** Keys currently stored (used for reset). */
  keys(): string[];
}

export interface Settings {
  newPerDay: number;
  speechRate: number;
  showReading: boolean;
  levels: Array<'A2' | 'B1' | 'B2'>;
}
export const DEFAULT_SETTINGS: Settings = { newPerDay: 10, speechRate: 0.9, showReading: true, levels: ['A2', 'B1', 'B2'] };

/** Card state without itemKey (the key is the record key). */
export type CardRec = Omit<SrsSnapshot, 'itemKey'>;
export interface Daily { day: string; newCount: number; reviewCount: number }

export interface Persisted {
  cards: Record<string, CardRec>;
  settings: Settings;
  daily: Daily;
  /** reviews per learning day, YYYY-MM-DD -> count */
  activity: Record<string, number>;
}

export function memoryBackend(): Backend {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    keys: () => [...m.keys()],
  };
}

function localStorageBackend(): Backend | null {
  try {
    const ls = (globalThis as any).localStorage as Storage | undefined;
    if (!ls) return null;
    const probe = PREFIX + '__probe';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return {
      getItem: (k) => ls.getItem(k),
      setItem: (k, v) => ls.setItem(k, v),
      removeItem: (k) => ls.removeItem(k),
      keys: () => Array.from({ length: ls.length }, (_, i) => ls.key(i)).filter((k): k is string => !!k),
    };
  } catch {
    return null;
  }
}

const STATES: SrsState[] = ['NEW', 'LEARNING', 'REVIEW', 'RELEARNING', 'SUSPENDED'];
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export function sanitizeCard(x: any): CardRec | null {
  if (!x || typeof x !== 'object') return null;
  if (!STATES.includes(x.state)) return null;
  for (const k of ['intervalDays', 'easeFactor', 'repetitions', 'lapses', 'learningStep', 'dueAt', 'totalReviews', 'correctReviews']) {
    if (!isNum(x[k])) return null;
  }
  if (x.lastReviewedAt !== null && !isNum(x.lastReviewedAt)) return null;
  return {
    state: x.state, intervalDays: x.intervalDays, easeFactor: x.easeFactor, repetitions: x.repetitions,
    lapses: x.lapses, learningStep: x.learningStep, dueAt: x.dueAt, lastReviewedAt: x.lastReviewedAt,
    totalReviews: x.totalReviews, correctReviews: x.correctReviews,
  };
}

export function sanitizeSettings(x: any): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS, levels: [...DEFAULT_SETTINGS.levels] };
  if (!x || typeof x !== 'object') return s;
  if (isNum(x.newPerDay)) s.newPerDay = Math.min(100, Math.max(0, Math.round(x.newPerDay)));
  if (isNum(x.speechRate)) s.speechRate = Math.min(1.1, Math.max(0.7, x.speechRate));
  if (typeof x.showReading === 'boolean') s.showReading = x.showReading;
  if (Array.isArray(x.levels)) {
    const lv: Array<'A2' | 'B1' | 'B2'> = x.levels.filter((l: unknown): l is 'A2' | 'B1' | 'B2' => l === 'A2' || l === 'B1' || l === 'B2');
    if (lv.length > 0) s.levels = [...new Set(lv)];
  }
  return s;
}

export type ImportResult = { ok: true; cards: number } | { ok: false; error: string };

export interface Store {
  readonly persistent: boolean;
  getCards(): Record<string, CardRec>;
  getCard(id: string): CardRec | null;
  setCard(id: string, card: CardRec): void;
  getSettings(): Settings;
  saveSettings(s: Partial<Settings>): Settings;
  getDaily(today: string): Daily;
  saveDaily(d: Daily): void;
  getActivity(): Record<string, number>;
  bumpActivity(day: string): void;
  exportState(nowIso?: string): string;
  importState(text: string): ImportResult;
  reset(): void;
  requestPersist(): Promise<boolean>;
}

export function createStore(backend?: Backend): Store {
  const ls = backend ? null : localStorageBackend();
  const b: Backend = backend ?? ls ?? memoryBackend();
  const fallback = memoryBackend();
  const persistent = !!backend || !!ls;
  let useFallback = false;

  const read = (key: string): unknown => {
    try {
      const raw = (useFallback ? fallback : b).getItem(PREFIX + key);
      return raw == null ? undefined : JSON.parse(raw);
    } catch {
      return undefined;
    }
  };
  const write = (key: string, value: unknown) => {
    const raw = JSON.stringify(value);
    try {
      (useFallback ? fallback : b).setItem(PREFIX + key, raw);
    } catch {
      // quota / private mode: keep working in memory for this session
      useFallback = true;
      fallback.setItem(PREFIX + key, raw);
    }
  };

  const store: Store = {
    persistent,
    getCards() {
      const raw = read('cards');
      const out: Record<string, CardRec> = {};
      if (raw && typeof raw === 'object') {
        for (const [id, v] of Object.entries(raw)) {
          const c = sanitizeCard(v);
          if (c) out[id] = c;
        }
      }
      return out;
    },
    getCard(id) {
      return store.getCards()[id] ?? null;
    },
    setCard(id, card) {
      const cards = store.getCards();
      cards[id] = card;
      write('cards', cards);
    },
    getSettings() {
      return sanitizeSettings(read('settings'));
    },
    saveSettings(partial) {
      const next = sanitizeSettings({ ...store.getSettings(), ...partial });
      write('settings', next);
      return next;
    },
    getDaily(today) {
      const d = read('daily') as Daily | undefined;
      if (d && d.day === today && isNum(d.newCount) && isNum(d.reviewCount)) return d;
      return { day: today, newCount: 0, reviewCount: 0 };
    },
    saveDaily(d) {
      write('daily', d);
    },
    getActivity() {
      const raw = read('activity');
      const out: Record<string, number> = {};
      if (raw && typeof raw === 'object') {
        for (const [k, v] of Object.entries(raw)) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && isNum(v)) out[k] = v;
      }
      return out;
    },
    bumpActivity(day) {
      const a = store.getActivity();
      a[day] = (a[day] ?? 0) + 1;
      write('activity', a);
    },
    exportState(nowIso = new Date().toISOString()) {
      return JSON.stringify({
        schema: SCHEMA,
        app: 'deutsch-for-japanese',
        exportedAt: nowIso,
        data: { cards: store.getCards(), settings: store.getSettings(), activity: store.getActivity() },
      });
    },
    importState(text) {
      let parsed: any;
      try {
        parsed = JSON.parse(text.trim());
      } catch {
        return { ok: false, error: 'invalid-json' };
      }
      if (!parsed || typeof parsed !== 'object' || parsed.schema !== SCHEMA) return { ok: false, error: 'bad-schema' };
      const data = parsed.data;
      if (!data || typeof data !== 'object' || !data.cards || typeof data.cards !== 'object') return { ok: false, error: 'bad-data' };
      const cards: Record<string, CardRec> = {};
      for (const [id, v] of Object.entries(data.cards)) {
        const c = sanitizeCard(v);
        if (!c) return { ok: false, error: `bad-card:${id}` };
        cards[id] = c;
      }
      const activity: Record<string, number> = {};
      if (data.activity && typeof data.activity === 'object') {
        for (const [k, v] of Object.entries(data.activity)) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && isNum(v)) activity[k] = v;
      }
      write('cards', cards);
      write('settings', sanitizeSettings(data.settings));
      write('activity', activity);
      return { ok: true, cards: Object.keys(cards).length };
    },
    reset() {
      for (const bk of [b, fallback]) {
        try {
          for (const k of bk.keys()) if (k.startsWith(PREFIX)) bk.removeItem(k);
        } catch { /* ignore */ }
      }
    },
    async requestPersist() {
      try {
        const sm = (globalThis as any).navigator?.storage;
        if (sm?.persist) return !!(await sm.persist());
      } catch { /* ignore */ }
      return false;
    },
  };
  return store;
}

let shared: Store | null = null;
let persistAttempted = false;

/** Lazily created store on localStorage (memory fallback). */
export function getStore(): Store {
  if (!shared) shared = createStore();
  if (!persistAttempted) {
    persistAttempted = true;
    void shared.requestPersist();
  }
  return shared;
}
