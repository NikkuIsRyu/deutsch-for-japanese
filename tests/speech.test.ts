import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickGermanVoice, speak, speechAvailable } from '../src/lib/speech.ts';

const v = (name: string, lang: string) => ({ name, lang });

test('pickGermanVoice prefers Anna, then de-DE, then any de', () => {
  assert.equal(pickGermanVoice([v('Samantha', 'en-US')]), null);
  assert.equal(pickGermanVoice([v('Markus', 'de-AT'), v('Anna', 'de-DE')])!.name, 'Anna');
  assert.equal(pickGermanVoice([v('Markus', 'de-AT'), v('Viktor', 'de-DE')])!.name, 'Viktor');
  assert.equal(pickGermanVoice([v('Markus', 'de-AT')])!.name, 'Markus');
  assert.equal(pickGermanVoice([v('X', 'de_DE')])!.name, 'X');
});

test('speak is a no-op without Web Speech', () => {
  assert.equal(speechAvailable(), false);
  assert.deepEqual(speak('Hallo'), { ok: false, reason: 'unsupported' });
});

test('speak uses de-DE, clamps rate and picks the voice', () => {
  const g = globalThis as any;
  const spoken: any[] = [];
  g.SpeechSynthesisUtterance = class { text: string; constructor(t: string) { this.text = t; } lang = ''; rate = 1; voice: any = null; };
  g.speechSynthesis = { getVoices: () => [v('Anna', 'de-DE')], cancel() {}, speak: (u: any) => spoken.push(u) };
  try {
    assert.deepEqual(speak('Guten Tag', 3), { ok: true });
    assert.equal(spoken[0].lang, 'de-DE');
    assert.equal(spoken[0].rate, 1.1);
    assert.equal(spoken[0].voice.name, 'Anna');
    g.speechSynthesis.getVoices = () => [v('Samantha', 'en-US')];
    assert.deepEqual(speak('Guten Tag'), { ok: false, reason: 'no-voice' });
    g.speechSynthesis.getVoices = () => [];
    assert.deepEqual(speak('Guten Tag'), { ok: true });
  } finally {
    delete g.SpeechSynthesisUtterance;
    delete g.speechSynthesis;
  }
});
