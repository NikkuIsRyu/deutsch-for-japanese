import { sentences } from './data.ts';
import { $, de, esc, store, srsConfig, learningDay, speakButton, wireSpeak, track, progressHtml, doneHtml, levelNote, getSentence, sessionSeed, url } from './common.ts';
import { pickPractice } from '../lib/queue.ts';
import { applyGrade } from '../lib/progress.ts';
import { grade as gradeAnswer, type DiffItem } from '../lib/answer.ts';
import { mulberry32 } from '../lib/shuffle.ts';

const SIZE = 10;
const stage = $('#stage')!;
const note = $('#levels-note');
if (note) note.innerHTML = levelNote();
wireSpeak(document);

function diffHtml(diff: DiffItem[]): string {
  return diff.map((d) => {
    const w = esc(d.word);
    switch (d.status) {
      case 'ok': return `<span class="diff-ok">${w}</span>`;
      case 'missing': return `<span class="diff-missing" title="足りない単語">${w}</span>`;
      case 'extra': return `<span class="diff-extra">${w}</span>`;
      case 'changed': return `<span class="diff-changed">${w}</span> <span class="diff-expected">${esc(d.expected ?? '')}</span>`;
    }
  }).join(' ');
}

function start() {
  const st = store();
  const settings = st.getSettings();
  const now = Date.now();
  const queue = pickPractice(sentences, st.getCards(), settings, st.getDaily(learningDay(now)), now, SIZE, mulberry32(sessionSeed()));
  if (queue.length === 0) {
    stage.innerHTML = `<div class="card"><p>この条件の例文がありません。<a href="${url()}#levels">対象レベル</a>を変えてみてください。</p></div>`;
    return;
  }
  track('mode_start', 'type', settings.levels.join('+'));
  const total = queue.length;
  let done = 0, correct = 0;

  const next = () => {
    const item = queue.shift();
    if (!item) {
      track('session_done', 'type', settings.levels.join('+'));
      stage.innerHTML = doneHtml(total, `<p class="muted">正解 ${correct} / ${total}</p>`);
      $('#again')?.addEventListener('click', start);
      return;
    }
    const s = getSentence(item.id);
    stage.innerHTML = `${progressHtml(done, total)}
      <article class="card">
        <span class="badge">${s.cefr}</span>
        <p class="prompt-ja">${esc(s.ja)}</p>
        <form id="form" autocomplete="off">
          <label class="sr-only" for="answer">ドイツ語で入力</label>
          <input id="answer" class="type-input" type="text" lang="de" inputmode="text" enterkeyhint="done" autocapitalize="sentences" autocorrect="off" autocomplete="off" spellcheck="false" placeholder="ドイツ語で入力" />
          <div class="umlauts" role="group" aria-label="特殊文字">${['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'].map((c) => `<button type="button" data-ch="${c}" lang="de">${c}</button>`).join('')}</div>
          <div class="actions"><button type="submit" class="btn primary block">確認</button></div>
        </form>
        <div id="result"></div>
      </article>`;
    const input = $<HTMLInputElement>('#answer')!;
    $('.umlauts')!.addEventListener('mousedown', (e) => e.preventDefault()); // keep the keyboard open
    $('.umlauts')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-ch]');
      if (!b) return;
      const a = input.selectionStart ?? input.value.length, z = input.selectionEnd ?? a;
      input.value = input.value.slice(0, a) + b.dataset.ch + input.value.slice(z);
      input.setSelectionRange(a + 1, a + 1);
      input.focus();
    });
    let submitted = false;
    $('#form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      if (submitted) return;
      submitted = true;
      const r = gradeAnswer(s.de, input.value);
      input.readOnly = true;
      $('#form .actions')!.remove();
      $('.umlauts')!.remove();
      const finish = (ok: boolean) => {
        if (ok) correct++;
        if (item.srs) applyGrade(store(), s.id, ok ? 'GOOD' : 'AGAIN', Date.now(), srsConfig());
        done++;
        next();
        window.scrollTo({ top: 0 });
      };
      const title = r.verdict === 'correct' ? ['good', '正解です！'] : r.verdict === 'almost' ? ['', 'おしい！ あと少しです'] : ['bad', '違います'];
      const hint = r.hints.includes('capitalization') ? '<p class="small">名詞の頭文字は大文字で書きます。</p>' : '';
      const diff = r.verdict === 'correct' ? '' : `<p class="result-line" lang="de">${diffHtml(r.diff)}</p>`;
      const buttons = r.verdict === 'almost'
        ? `<p class="small muted">自分で判定してください。</p><div class="actions"><button type="button" class="btn primary" id="ok">正解にする</button><button type="button" class="btn" id="ng">もう一度</button></div>`
        : `<div class="actions"><button type="button" class="btn primary block" id="next">${queue.length ? '次へ' : '結果を見る'}</button></div>`;
      $('#result')!.innerHTML = `<div class="notice ${title[0]}"><strong>${title[1]}</strong>${hint}</div>${diff}
        <div style="display:flex;gap:10px;align-items:flex-start"><p class="de-large" style="flex:1">${de(s.de)}</p>${speakButton(s.de)}</div>
        ${item.srs ? '' : '<p class="muted small">（復習の予定には入れていません）</p>'}${buttons}`;
      $('#next')?.addEventListener('click', () => finish(r.verdict === 'correct'));
      $('#ok')?.addEventListener('click', () => finish(true));
      $('#ng')?.addEventListener('click', () => finish(false));
    });
  };
  next();
}

start();
