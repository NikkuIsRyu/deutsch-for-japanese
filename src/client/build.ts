import { sentences } from './data.ts';
import { $, de, esc, store, srsConfig, learningDay, speakButton, wireSpeak, track, progressHtml, doneHtml, levelNote, getSentence, sessionSeed, url } from './common.ts';
import { pickPractice } from '../lib/queue.ts';
import { applyGrade } from '../lib/progress.ts';
import { tokensMatch } from '../lib/answer.ts';
import { mulberry32, shuffleDifferent, hashSeed } from '../lib/shuffle.ts';

const SIZE = 10;
const stage = $('#stage')!;
const note = $('#levels-note');
if (note) note.innerHTML = levelNote();
wireSpeak(document);

function start() {
  const st = store();
  const settings = st.getSettings();
  const now = Date.now();
  const seed = sessionSeed();
  const queue = pickPractice(sentences, st.getCards(), settings, st.getDaily(learningDay(now)), now, SIZE, mulberry32(seed));
  if (queue.length === 0) {
    stage.innerHTML = `<div class="card"><p>この条件の例文がありません。<a href="${url()}#levels">対象レベル</a>を変えてみてください。</p></div>`;
    return;
  }
  track('mode_start', 'build', settings.levels.join('+'));
  const total = queue.length;
  let done = 0, correct = 0;

  const next = () => {
    const item = queue.shift();
    if (!item) {
      track('session_done', 'build', settings.levels.join('+'));
      stage.innerHTML = doneHtml(total, `<p class="muted">正解 ${correct} / ${total}</p>`);
      $('#again')?.addEventListener('click', start);
      return;
    }
    const s = getSentence(item.id);
    const order = shuffleDifferent(s.tokens.map((_, i) => i), mulberry32(hashSeed(s.id) ^ seed));
    const chosen: number[] = [];
    const render = () => {
      const bank = order.filter((i) => !chosen.includes(i));
      stage.innerHTML = `${progressHtml(done, total)}
        <article class="card">
          <span class="badge">${s.cefr}</span>
          <p class="prompt-ja">${esc(s.ja)}</p>
          <div class="chipline answer" id="answer" aria-label="あなたの答え">${chosen.map((i) => `<button type="button" class="token" data-i="${i}" data-from="answer">${esc(s.tokens[i]!)}</button>`).join('')}</div>
          <div class="chipline" id="bank" aria-label="単語">${bank.map((i) => `<button type="button" class="token" data-i="${i}" data-from="bank" lang="de">${esc(s.tokens[i]!)}</button>`).join('')}</div>
          <div class="actions"><button type="button" class="btn primary" id="check" ${bank.length ? 'disabled' : ''}>確認</button></div>
        </article>`;
      stage.querySelectorAll<HTMLElement>('.token').forEach((b) =>
        b.addEventListener('click', () => {
          const i = Number(b.dataset.i);
          if (b.dataset.from === 'bank') chosen.push(i);
          else chosen.splice(chosen.indexOf(i), 1);
          render();
        }));
      $('#check')!.addEventListener('click', check);
    };
    const check = () => {
      const given = chosen.map((i) => s.tokens[i]!);
      const ok = tokensMatch(s.tokens, given);
      if (ok) correct++;
      if (item.srs) applyGrade(store(), s.id, ok ? 'GOOD' : 'AGAIN', Date.now(), srsConfig());
      done++;
      stage.innerHTML = `${progressHtml(done - 1, total)}
        <article class="card">
          <span class="badge">${s.cefr}</span>
          <p class="prompt-ja">${esc(s.ja)}</p>
          <div class="notice ${ok ? 'good' : 'bad'}"><strong>${ok ? '正解です！' : 'おしい！ 正しい文はこちら'}</strong></div>
          <div style="display:flex;gap:10px;align-items:flex-start"><p class="de-large" style="flex:1">${de(s.de)}</p>${speakButton(s.de)}</div>
          ${ok ? '' : `<p class="muted small">あなたの答え：${de(given.join(' '))}</p>`}
          ${item.srs ? '' : '<p class="muted small">（復習の予定には入れていません）</p>'}
          <div class="actions"><button type="button" class="btn primary block" id="next">${queue.length ? '次へ' : '結果を見る'}</button></div>
        </article>`;
      $('#next')!.addEventListener('click', () => { next(); window.scrollTo({ top: 0 }); });
    };
    render();
  };
  next();
}

start();
