import { sentences, grammarTags, LEVELS, tagTitle, type Level, type Sentence } from './data.ts';
import { $, de, esc, speakButton, wireSpeak, url } from './common.ts';
import { normalize } from '../lib/answer.ts';

wireSpeak(document);
const params = new URLSearchParams(location.search);
const levels = new Set<Level>(LEVELS.filter((l) => !params.get('level') || params.get('level')!.split(',').includes(l)));
let tag = params.get('tag') || '';
let query = params.get('q') || '';
let limit = 40;

const usedTags = [...new Set(sentences.flatMap((s) => s.tags))];
const tagOptions = usedTags
  .map((id) => ({ id, label: tagTitle(id) }))
  .sort((a, b) => a.label.localeCompare(b.label, 'ja'));

const search = $<HTMLInputElement>('#q')!;
const tagSel = $<HTMLSelectElement>('#tag')!;
const chips = $('#level-filter')!;
const list = $('#list')!;
const count = $('#count')!;
const more = $<HTMLButtonElement>('#more')!;
search.value = query;
tagSel.innerHTML = `<option value="">すべての文法</option>` + tagOptions.map((t) => `<option value="${esc(t.id)}">${esc(t.label)}</option>`).join('');
if (tag && !usedTags.includes(tag)) tagSel.insertAdjacentHTML('beforeend', `<option value="${esc(tag)}">${esc(tagTitle(tag))}</option>`);
tagSel.value = tag;

const index = sentences.map((s) => ({ s, de: normalize(s.de), ja: s.ja + ' ' + s.jaReading + ' ' + s.jaVariants.map((v) => v.ja).join(' ') }));

function row(s: Sentence): string {
  const tags = s.tags.map((t) => `<a class="badge tag" href="${url('grammar/')}#${esc(t)}">${esc(tagTitle(t))}</a>`).join('');
  const variants = s.jaVariants.length
    ? `<p class="small muted" style="margin-bottom:0">別の言い方</p><ul class="variants">${s.jaVariants.map((v) => `<li>${esc(v.ja)}</li>`).join('')}</ul>`
    : '';
  return `<details class="row"><summary><span class="badge">${s.cefr}</span><span class="de">${de(s.de)}</span>${speakButton(s.de)}</summary>
    <div class="body"><p class="prompt-ja" style="font-size:1.1rem">${esc(s.ja)}</p><p class="reading">${esc(s.jaReading)}</p>${variants}<div class="taglist">${tags}</div></div></details>`;
}

function matches() {
  const qn = normalize(query);
  const qj = query.trim();
  return index.filter(({ s, de: d, ja }) =>
    levels.has(s.cefr) && (!tag || s.tags.includes(tag)) && (!qj || d.includes(qn) || ja.includes(qj))).map((x) => x.s);
}

function render() {
  chips.innerHTML = LEVELS.map((l) => `<button type="button" class="chip" data-level="${l}" aria-pressed="${levels.has(l)}">${l}</button>`).join('');
  const found = matches();
  count.textContent = `${found.length}件`;
  list.innerHTML = found.slice(0, limit).map(row).join('') || '<p class="muted">見つかりませんでした。</p>';
  more.hidden = found.length <= limit;
}

chips.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-level]');
  if (!b) return;
  const l = b.dataset.level as Level;
  if (levels.has(l)) levels.delete(l); else levels.add(l);
  limit = 40;
  render();
});
let timer = 0;
search.addEventListener('input', () => { clearTimeout(timer); timer = window.setTimeout(() => { query = search.value; limit = 40; render(); }, 120); });
tagSel.addEventListener('change', () => { tag = tagSel.value; limit = 40; render(); });
more.addEventListener('click', () => { limit += 40; render(); });
render();
