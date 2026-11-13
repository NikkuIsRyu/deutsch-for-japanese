import { $, store, toast, say } from './common.ts';

const st = store();
const s = st.getSettings();

const newPer = $<HTMLInputElement>('#new-per-day')!;
const rate = $<HTMLInputElement>('#rate')!;
const rateOut = $('#rate-out')!;
const reading = $<HTMLInputElement>('#show-reading')!;
newPer.value = String(s.newPerDay);
rate.value = String(s.speechRate);
rateOut.textContent = s.speechRate.toFixed(2);
reading.checked = s.showReading;

newPer.addEventListener('change', () => {
  const v = Math.min(100, Math.max(0, Math.round(Number(newPer.value) || 0)));
  newPer.value = String(v);
  st.saveSettings({ newPerDay: v });
  toast('保存しました');
});
rate.addEventListener('input', () => { rateOut.textContent = Number(rate.value).toFixed(2); });
rate.addEventListener('change', () => { st.saveSettings({ speechRate: Number(rate.value) }); toast('保存しました'); });
reading.addEventListener('change', () => { st.saveSettings({ showReading: reading.checked }); toast('保存しました'); });
$('#rate-test')!.addEventListener('click', () => {
  st.saveSettings({ speechRate: Number(rate.value) });
  say('Guten Tag! Wie geht es Ihnen?');
});

if (!st.persistent) $('#storage-warning')!.hidden = false;

// ---- export
const out = $<HTMLTextAreaElement>('#export-code')!;
const refresh = () => { out.value = st.exportState(); };
refresh();
$('#copy')!.addEventListener('click', async () => {
  refresh();
  try {
    await navigator.clipboard.writeText(out.value);
    toast('コピーしました');
  } catch {
    out.focus(); out.select();
    toast('テキストを選択しました。コピーしてください');
  }
});
$('#download')!.addEventListener('click', () => {
  refresh();
  const blob = new Blob([out.value], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `deutsch-progress-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});

// ---- import
const inp = $<HTMLTextAreaElement>('#import-code')!;
const msg = $('#import-msg')!;
function doImport(text: string) {
  const r = st.importState(text);
  if (r.ok) {
    msg.className = 'notice good';
    msg.textContent = `読み込みました（${r.cards}枚のカード）。`;
    msg.hidden = false;
    refresh();
    const ns = st.getSettings();
    newPer.value = String(ns.newPerDay);
    rate.value = String(ns.speechRate);
    rateOut.textContent = ns.speechRate.toFixed(2);
    reading.checked = ns.showReading;
  } else {
    msg.className = 'notice bad';
    msg.textContent = 'このデータは読み込めませんでした。エクスポートしたコードをそのまま貼り付けてください。';
    msg.hidden = false;
  }
}
$('#import-btn')!.addEventListener('click', () => {
  if (!inp.value.trim()) { toast('コードを貼り付けてください'); return; }
  if (confirm('この端末の学習記録を、読み込む内容で置き換えます。よろしいですか？')) doImport(inp.value);
});
$<HTMLInputElement>('#import-file')!.addEventListener('change', async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  const text = await f.text();
  if (confirm('この端末の学習記録を、ファイルの内容で置き換えます。よろしいですか？')) doImport(text);
  (e.target as HTMLInputElement).value = '';
});

// ---- reset (two steps)
const step1 = $('#reset-1')!, step2 = $('#reset-2')!;
$('#reset-start')!.addEventListener('click', () => { step1.hidden = true; step2.hidden = false; });
$('#reset-cancel')!.addEventListener('click', () => { step2.hidden = true; step1.hidden = false; });
$('#reset-go')!.addEventListener('click', () => {
  if (!confirm('本当に、すべての学習記録を削除しますか？ 元に戻せません。')) return;
  st.reset();
  location.reload();
});
