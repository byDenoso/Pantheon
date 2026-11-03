import {useState} from 'react';
import type {Locale} from '../api.ts';

const KEY = 'atlas.tour.v1';
const seen = () => { try { return localStorage.getItem(KEY) === 'done'; } catch { return false; } };

/** Three-step orientation shown once, above the research hub. */
export default function ReadingTour({locale}: {locale: Locale}) {
  const [done, setDone] = useState(seen);
  if (done) return null;
  const en = locale === 'en';
  const steps = en ? [
    ['Pick a reading level', '“From scratch” explains the terms and summarises each result; “Technical” shows the reviewed text alone.'],
    ['Search or filter', 'Type a word or choose a subject to narrow the questions.'],
    ['Open a question', 'Each one shows what was tested, the result, its limits and the figures.'],
  ] : [
    ['Escolha o nível de leitura', '“Do zero” explica os termos e resume cada resultado; “Técnico” mostra só o texto revisado.'],
    ['Busque ou filtre', 'Digite uma palavra ou escolha um assunto para reduzir a lista de perguntas.'],
    ['Abra uma pergunta', 'Cada uma mostra o que foi testado, o resultado, os limites e as figuras.'],
  ];
  const dismiss = () => { setDone(true); try { localStorage.setItem(KEY, 'done'); } catch { /* storage unavailable */ } };
  return <aside className="nexo-tour" aria-label={en ? 'How to use this page' : 'Como usar esta página'}>
    <ol>{steps.map(([title, body], index) => <li key={title}><span aria-hidden="true">{index + 1}</span><div><strong>{title}</strong><p>{body}</p></div></li>)}</ol>
    <button type="button" onClick={dismiss}>{en ? 'Got it' : 'Entendi'}</button>
  </aside>;
}
