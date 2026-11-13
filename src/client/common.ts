import { getStore } from '../lib/storage.ts';
import { defaultConfig, LearningDay, type SrsConfig } from '../lib/srs.ts';
import { speak } from '../lib/speech.ts';
import { withBase } from '../lib/paths.ts';
import { byId, type Sentence } from './data.ts';

export const store = () => getStore();
export const base = document.documentElement.dataset.base || '/';
export const url = (p = '') => withBase(base, p);

export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T | null;

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
export const de = (s: string, cls = '') => `<span lang="de"${cls ? ` class="${cls}"` : ''}>${esc(s)}</span>`;

let zone: string | null = null;
export function timeZone(): string {
  if (zone) return zone;
  try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { zone = 'UTC'; }
  return zone;
}
export const srsConfig = (): SrsConfig => defaultConfig({ zoneId: timeZone() });
export const learningDay = (now = Date.now()) => LearningDay.getLearningDate(now, 4, timeZone());

let toastTimer = 0;
export function toast(msg: string) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), 3500);
}

/** Anonymous events only: never sentence text or answers. */
export function track(event: 'mode_start' | 'session_done', mode: string, level?: string) {
  try {
    const u = (window as any).umami;
    if (u && typeof u.track === 'function') u.track(event, level ? { mode, level } : { mode });
  } catch { /* analytics must never break the app */ }
}

export function say(text: string) {
  const r = speak(text, store().getSettings().speechRate);
  if (r.ok) return;
  toast(r.reason === 'no-voice'
    ? 'この端末にドイツ語の音声がありません。設定アプリで音声を追加してください。'
    : 'この端末では音声を再生できません。');
}

export const speakerSvg =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10v4h4l5 4V6L8 10H4Zm12.5-.5a4 4 0 0 1 0 5M19 7a7.5 7.5 0 0 1 0 10"/></svg>';
export const speakButton = (text: string) =>
  `<button type="button" class="icon-btn" data-speak="${esc(text)}" aria-label="音声を聞く">${speakerSvg}</button>`;

/** Delegated click handler for every [data-speak] button inside root. Call once per page. */
export function wireSpeak(root: ParentNode = document) {
  root.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-speak]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    say(btn.dataset.speak || '');
  });
}

const UNIT: Record<string, string> = { m: '分', h: '時間', d: '日', mo: 'か月', y: '年' };
export function jaInterval(label: string): string {
  const m = /^([\d.]+)(m|h|d|mo|y)$/.exec(label);
  return m ? `${m[1]}${UNIT[m[2]!]}` : label;
}

export const levelsLabel = (levels: string[]) => levels.join(' · ');

/** Renders "対象レベル" note linking to the home page filter. */
export function levelNote(): string {
  return `対象レベル：${levelsLabel(store().getSettings().levels)}（<a href="${url()}#levels">変更</a>）`;
}

export function getSentence(id: string): Sentence {
  return byId.get(id)!;
}

export function sessionSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

export function progressHtml(done: number, total: number): string {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return `<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><i style="width:${pct}%"></i></div><p class="muted counter">${Math.min(done + 1, total)} / ${total}</p>`;
}

export function doneHtml(count: number, extra = ''): string {
  const home = url();
  return `<div class="card done"><h2>おつかれさまでした</h2><p>${count}問 終わりました。</p>${extra}<div class="actions center"><button type="button" class="btn primary" id="again">もう一度</button><a class="btn" href="${home}">ホームへ</a></div></div>`;
}
