import { sentences, type Sentence } from './data.ts';
import { $, de, esc, store, speakButton, wireSpeak, track, progressHtml, doneHtml, levelNote, sessionSeed, url } from './common.ts';
import { makeCloze, type Cloze } from '../lib/cloze.ts';
import { mulberry32, shuffle, hashSeed } from '../lib/shuffle.ts';

const SIZE = 10;
const stage = $('#stage')!;
const note = $('#levels-note');
if (note) note.innerHTML = levelNote();
wireSpeak(document);

function start() {
  const settings = store().getSettings();
  const seed = sessionSeed();
  const pool = sentences.filter((s) => settings.levels.includes(s.cefr));
  const queue: Array<{ s: Sentence; c: Cloze }> = [];
  for (const s of shuffle(pool, mulberry32(seed))) {
    if (queue.length >= SIZE) break;
    const c = makeCloze(s.tokens, hashSeed(s.id) ^ seed);
    if (c) queue.push({ s, c });
  }
  if (queue.length === 0) {
    stage.innerHTML = `<div class="card"><p>この条件で穴埋めにできる例文がありません。<a href="${url()}#levels">対象レベル</a>を変えてみてください。</p></div>`;
    return;
  }
  track('mode_start', 'cloze', settings.levels.join('+'));
  const total = queue.length;
  let done = 0, correct = 0;

  const sentenceHtml = (s: Sentence, c: Cloze, fill: string | null) =>
    s.tokens.map((t, i) => {
      if (i !== c.index) return esc(t);
      const inner = fill === null ? '＿＿＿' : esc(fill);
      return `${esc(c.before)}<span class="gap">${inner}</span>${esc(c.after)}`;
    }).join(' ');

  const next = () => {
    const item = queue.shift();
    if (!item) {
      track('session_done', 'cloze', settings.levels.join('+'));
      stage.innerHTML = doneHtml(total, `<p class="muted">正解 ${correct} / ${total}</p>`);
      $('#again')?.addEventListener('click', start);
      return;
    }
    const { s, c } = item;
    stage.innerHTML = `${progressHtml(done, total)}
      <article class="card">
        <span class="badge">${s.cefr}</span>
        <p class="cloze-sentence" lang="de">${sentenceHtml(s, c, null)}</p>
        <p class="muted">${esc(s.ja)}</p>
        <div class="options" id="options">${c.options.map((o) => `<button type="button" class="btn" data-o="${esc(o)}" lang="de">${esc(o)}</button>`).join('')}</div>
        <div id="after"></div>
      </article>`;
    $('#options')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-o]');
      if (!b) return;
      const ok = b.dataset.o === c.answer;
      if (ok) correct++;
      done++;
      stage.querySelectorAll<HTMLButtonElement>('[data-o]').forEach((x) => {
        x.disabled = true;
        if (x.dataset.o === c.answer) x.classList.add('right');
        else if (x === b) x.classList.add('wrong');
      });
      $('.cloze-sentence')!.innerHTML = sentenceHtml(s, c, c.answer);
      $('#after')!.innerHTML = `<div class="notice ${ok ? 'good' : 'bad'}"><strong>${ok ? '正解です！' : `正解は「${esc(c.answer)}」です`}</strong></div>
        <div style="display:flex;gap:10px;align-items:center"><p style="flex:1;margin:0">${de(s.de)}</p>${speakButton(s.de)}</div>
        <div class="actions"><button type="button" class="btn primary block" id="next">${queue.length ? '次へ' : '結果を見る'}</button></div>`;
      $('#next')!.addEventListener('click', () => { next(); window.scrollTo({ top: 0 }); });
    });
  };
  next();
}

start();
