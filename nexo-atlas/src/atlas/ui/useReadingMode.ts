import {useSyncExternalStore} from 'react';
import type {Locale} from '../api.ts';

// Reading level of the public pages. "plain" adds explanations for first-time
// readers on top of the reviewed text; "technical" shows the reviewed text alone.
// Nothing scientific changes between the two: no field is rewritten or hidden.
export type ReadingMode = 'plain' | 'technical';
const KEY = 'atlas.reading';
const read = (): ReadingMode => { try { return localStorage.getItem(KEY) === 'technical' ? 'technical' : 'plain'; } catch { return 'plain'; } };

let current: ReadingMode = read();
const listeners = new Set<() => void>();
const apply = () => { if (typeof document !== 'undefined') document.documentElement.dataset.reading = current; };
apply();

export const readingMode = () => current;
export function setReadingMode(mode: ReadingMode) {
  current = mode;
  try { localStorage.setItem(KEY, mode); } catch { /* storage unavailable */ }
  apply();
  listeners.forEach(listener => listener());
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const useReadingMode = (): ReadingMode => useSyncExternalStore(subscribe, readingMode, () => 'plain');

export const READING_LABELS: Record<Locale, {label: string; plain: string; technical: string; plainHint: string; technicalHint: string}> = {
  'pt-BR': {label: 'Nível de leitura', plain: 'Do zero', technical: 'Técnico', plainHint: 'Explica os termos e resume cada resultado para quem começa do zero', technicalHint: 'Mostra só o texto revisado, sem explicações'},
  en: {label: 'Reading level', plain: 'From scratch', technical: 'Technical', plainHint: 'Explains the terms and summarises each result for first-time readers', technicalHint: 'Shows only the reviewed text, without explanations'},
};
