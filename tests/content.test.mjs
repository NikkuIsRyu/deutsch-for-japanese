import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p));
const sha = (p) => crypto.createHash('sha256').update(read(p)).digest('hex');

const data = JSON.parse(read('src/data/sentences.json').toString('utf8'));
const manifest = JSON.parse(read('src/data/content-manifest.json').toString('utf8'));
const fixes = JSON.parse(read('content/review/fixes.json').toString('utf8')).fixes;

const TAG_IDS = new Set([
  'perfekt', 'praeteritum', 'modalverben', 'trennbare_verben', 'dativ', 'wechselpraepositionen', 'adjektivendungen',
  'reflexive_verben', 'komparativ', 'imperativ', 'nebensatz_weil_dass_wenn', 'relativsatz', 'konjunktiv2', 'passiv',
  'infinitiv_zu', 'temporalsatz', 'konzessiv_final', 'lassen', 'futur', 'genitiv', 'passiv_erweitert', 'konjunktiv1',
  'partizipialattribut', 'nominalstil', 'zweiteilige_konnektoren', 'praep_genitiv',
]);

test('manifest hashes match files on disk', () => {
  assert.equal(manifest['sentences.json'], sha('src/data/sentences.json'));
  assert.equal(manifest['grammar.json'], sha('src/data/grammar.json'));
});

test('count matches items and ids are unique', () => {
  assert.equal(data.count, data.items.length);
  const ids = data.items.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every tag id is valid and cefr is A2/B1/B2', () => {
  for (const it of data.items) {
    for (const t of it.tags) assert.ok(TAG_IDS.has(t), `${it.id}: unknown tag ${t}`);
    assert.ok(['A2', 'B1', 'B2'].includes(it.cefr), `${it.id}: bad cefr ${it.cefr}`);
  }
});

test('all owner fixes are applied', () => {
  assert.equal(fixes.length, 4);
  for (const f of fixes) {
    const it = data.items.find((i) => i.id === f.id);
    assert.ok(it, `${f.id} missing`);
    assert.equal(it.ja, f.ja);
    assert.equal(it.jaReading, f.jaReading);
    assert.equal(it.review.ja, 'fixed');
  }
});

test('every item has non-empty de/ja/tokens', () => {
  for (const it of data.items) {
    assert.ok(it.de.trim(), `${it.id}: de`);
    assert.ok(it.ja.trim(), `${it.id}: ja`);
    assert.ok(Array.isArray(it.tokens) && it.tokens.length > 0, `${it.id}: tokens`);
    for (const t of it.tokens) assert.ok(t.length > 0);
  }
});

test('joined tokens equal de with normalised whitespace', () => {
  for (const it of data.items) {
    assert.equal(it.tokens.join(' '), it.de.replace(/\s+/g, ' ').trim(), it.id);
  }
});
