import { sentences } from './data.ts';
import { $, de, esc, store, srsConfig, learningDay, speakButton, wireSpeak, track, progressHtml, doneHtml, levelNote, getSentence, url, jaInterval } from './common.ts';
import { buildQueue } from '../lib/queue.ts';
import { applyGrade, toSnapshot } from '../lib/progress.ts';
import { nextIntervals, formatInterval, GRADES, type ReviewGrade } from '../lib/srs.ts';

const stage = $('#stage')!;
const note = $('#levels-note');
if (note) note.innerHTML = levelNote();
wireSpeak(document);

const LABEL: Record<ReviewGrade, string> = { AGAIN: 'もう一度', HARD: '難しい', GOOD: '良い', EASY: '簡単' };
const CLS: Record<ReviewGrade, string> = { AGAIN: 'again', HARD: '', GOOD: '', EASY: 'easy' };

function start() {
  const st = store();
  const settings = st.getSettings();
  const now = Date.now();
  const q = buildQueue(sentences, st.getCards(), settings, st.getDaily(learningDay(now)), now);
  const queue = [...q.due, ...q.fresh];
  if (queue.length === 0) {
    stage.innerHTML = `<div class="card"><h2>今日の復習は終わりです</h2><p class="muted">期限の来ているカードも、今日の新しいカードもありません。${q.freshAvailable > 0 ? '新しいカードは明日また出ます。' : ''}</p><div class="actions"><a class="btn primary" href="${url('build/')}">並べ替えで練習</a><a class="btn" href="${url('type/')}">書いて練習</a><a class="btn" href="${url('cloze/')}">穴埋め</a></div></div>`;
    return;
  }
  track('mode_start', 'review', settings.levels.join('+'));
  const total = queue.length;
  let done = 0;
  let reviewed = 0;
  let showReading = settings.showReading;

  const next = () => {
    const id = queue.shift();
    if (!id) {
      track('session_done', 'review', settings.levels.join('+'));
      stage.innerHTML = doneHtml(reviewed);
      $('#again')?.addEventListener('click', start);
      return;
    }
    const s = getSentence(id);
    const front = () => `
      ${progressHtml(done, total)}
      <article class="card">
        <span class="badge">${s.cefr}</span>
        <p class="prompt-ja">${esc(s.ja)}</p>
        <p class="reading" id="reading" ${showReading ? '' : 'hidden'}>${esc(s.jaReading)}</p>
        <div id="back"></div>
      </article>
      <div class="actions" id="controls">
        <button type="button" class="btn primary block" id="reveal">答えを見る</button>
        <button type="button" class="btn small ghost" id="toggle-reading">${showReading ? '読みを隠す' : '読みを見る'}</button>
      </div>`;
    stage.innerHTML = front();
    $('#toggle-reading')!.addEventListener('click', () => {
      showReading = !showReading;
      $('#reading')!.hidden = !showReading;
      $('#toggle-reading')!.textContent = showReading ? '読みを隠す' : '読みを見る';
    });
    $('#reveal')!.addEventListener('click', () => {
      const cfg = srsConfig();
      const now2 = Date.now();
      const preview = nextIntervals(toSnapshot(id, store().getCard(id)), now2, cfg);
      const variants = s.jaVariants.length
        ? `<details class="variants"><summary>別の言い方</summary><ul>${s.jaVariants.map((v) => `<li>${esc(v.ja)}</li>`).join('')}</ul></details>`
        : '';
      $('#back')!.innerHTML = `<hr class="divider" /><div style="display:flex;gap:10px;align-items:flex-start"><p class="de-large" style="flex:1">${de(s.de)}</p>${speakButton(s.de)}</div>${variants}`;
      $('#controls')!.outerHTML = `<div class="grades" id="controls" role="group" aria-label="自己評価">${GRADES.map(
        (g) => `<button type="button" class="btn grade ${CLS[g]}" data-grade="${g}">${LABEL[g]}<small>${jaInterval(formatInterval(preview[g]))}</small></button>`,
      ).join('')}</div>`;
      $('#controls')!.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>('[data-grade]');
        if (!b) return;
        const g = b.dataset.grade as ReviewGrade;
        const n = Date.now();
        const after = applyGrade(store(), id, g, n, cfg);
        reviewed++;
        done = Math.min(total, done + 1);
        // Cards that come back within this session (learning steps) are shown again at the end.
        if (after.dueAt - n <= 20 * 60_000) queue.push(id);
        next();
        window.scrollTo({ top: 0 });
      });
    });
  };
  next();
}

start();
