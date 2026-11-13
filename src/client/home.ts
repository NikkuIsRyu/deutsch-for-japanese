import { sentences, LEVELS, type Level } from './data.ts';
import { $, store, learningDay } from './common.ts';
import { buildQueue } from '../lib/queue.ts';
import { currentStreak } from '../lib/srs.ts';

const levelBox = $('#level-chips')!;

function renderLevels() {
  const cur = store().getSettings().levels;
  levelBox.innerHTML = LEVELS.map((l) => {
    const n = sentences.filter((s) => s.cefr === l).length;
    return `<button type="button" class="chip" data-level="${l}" aria-pressed="${cur.includes(l)}">${l}<span class="muted small" style="margin-left:6px">${n}</span></button>`;
  }).join('');
}
levelBox.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-level]');
  if (!b) return;
  const l = b.dataset.level as Level;
  const cur = new Set(store().getSettings().levels);
  if (cur.has(l)) { if (cur.size > 1) cur.delete(l); } else cur.add(l);
  store().saveSettings({ levels: LEVELS.filter((x) => cur.has(x)) });
  renderLevels();
  renderStats();
});

function renderStats() {
  const st = store();
  const now = Date.now();
  const settings = st.getSettings();
  const q = buildQueue(sentences, st.getCards(), settings, st.getDaily(learningDay(now)), now);
  const learned = Object.values(st.getCards()).filter((c) => c.state !== 'NEW').length;
  const act = st.getActivity();
  const byDay = new Map(Object.entries(act));
  const streak = currentStreak(byDay, learningDay(now));
  $('#stat-due')!.textContent = String(q.due.length);
  $('#stat-new')!.textContent = String(q.fresh.length);
  $('#stat-streak')!.textContent = String(streak);
  $('#stat-learned')!.textContent = String(learned);
  const go = $<HTMLAnchorElement>('#go-review');
  if (go) go.dataset.count = String(q.due.length + q.fresh.length);
}

renderLevels();
renderStats();

// iOS hint: only on iPhone/iPad Safari when not installed.
const ua = navigator.userAgent;
const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = (navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
if (isIos && !standalone) $('#ios-hint')!.hidden = false;
