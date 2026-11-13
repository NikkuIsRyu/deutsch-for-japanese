// Text-to-speech through the Web Speech API. Must only be called from a user tap (iOS rule).

export interface VoiceLike { name: string; lang: string; localService?: boolean }

export function pickGermanVoice<T extends VoiceLike>(voices: readonly T[]): T | null {
  const de = voices.filter((v) => /^de([-_]|$)/i.test(v.lang));
  if (de.length === 0) return null;
  const anna = de.find((v) => /anna/i.test(v.name));
  return anna ?? de.find((v) => /^de[-_]DE$/i.test(v.lang)) ?? de[0]!;
}

export type SpeakResult = { ok: true } | { ok: false; reason: 'unsupported' | 'no-voice' | 'error' };

export function speechAvailable(): boolean {
  return typeof globalThis.speechSynthesis !== 'undefined' && typeof globalThis.SpeechSynthesisUtterance !== 'undefined';
}

export function speak(text: string, rate = 0.9): SpeakResult {
  if (!speechAvailable()) return { ok: false, reason: 'unsupported' };
  try {
    const synth = globalThis.speechSynthesis;
    const voices = synth.getVoices();
    const voice = pickGermanVoice(voices);
    const u = new globalThis.SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    if (voice) u.voice = voice as SpeechSynthesisVoice;
    u.rate = Math.min(1.1, Math.max(0.7, rate));
    synth.cancel();
    synth.speak(u);
    // iOS often reports an empty voice list at first; only warn when voices exist but none is German.
    return voices.length > 0 && !voice ? { ok: false, reason: 'no-voice' } : { ok: true };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
