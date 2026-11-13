// Content is bundled by importing the JSON (Vite puts it in one shared, cacheable chunk).
import sentencesJson from '../data/sentences.json';
import grammarJson from '../data/grammar.json';

export type Level = 'A2' | 'B1' | 'B2';
export const LEVELS: Level[] = ['A2', 'B1', 'B2'];

export interface Sentence {
  id: string;
  de: string;
  ja: string;
  jaReading: string;
  jaVariants: Array<{ ja: string; jaReading: string }>;
  cefr: Level;
  tags: string[];
  tokens: string[];
}
export interface GrammarTag {
  id: string;
  cefr: Level;
  titleDe: string;
  titleJa: string;
  summaryJa: string;
  points: Array<{ ja: string; exampleDe: string; exampleJa: string }>;
  pitfallJa: string;
}

export const sentences: Sentence[] = (sentencesJson as { items: Sentence[] }).items;
export const grammarTags: GrammarTag[] = (grammarJson as { tags: GrammarTag[] }).tags;
export const byId = new Map(sentences.map((s) => [s.id, s]));
export const tagTitle = (id: string): string => grammarTags.find((t) => t.id === id)?.titleJa ?? id;
