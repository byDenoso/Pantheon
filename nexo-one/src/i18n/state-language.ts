// One formatter for how the Atlas TALKS about states: test status, review state and verdict codes become everyday PT-BR / EN sentences.
// Presentation only. It never changes an enum, a contract, a scientific criterion, a decision or a stored value:
//   - `code` is always the value that was published, untouched; technical codes belong in an expandable technical detail;
//   - an unknown or missing code is said to be unknown / not informed; it is never mapped to another state;
//   - "inconclusive" is never worded as refuted, confirmed or as an error; DONE describes a finished run or task, never a scientific confirmation;
//   - a reason or next step is shown only when the data has one; otherwise the text says it has not been informed yet.
export type Lang = 'pt-BR' | 'en';
export const LANGS: readonly Lang[] = ['pt-BR', 'en'];
/** what a state talks about: where a test is in its life, how a run ended, or what the independent review concluded */
export type StateKind = 'progress' | 'execution' | 'review' | 'unknown';
export interface StateText {
  /** short human label for chips, legends, tooltips and cards */
  label: string;
  /** one plain sentence saying what it means and what it does NOT mean */
  meaning: string;
  /** the published value, exactly as received (null when nothing was published) */
  code: string | null;
  kind: StateKind;
  /** false for unknown codes and missing values */
  known: boolean;
  /** true only for conclusions of the published review (confirmed / refuted) */
  scientificConclusion: boolean;
}
type Entry = {kind: StateKind; conclusion?: boolean; 'pt-BR': [string, string]; en: [string, string]};

const T: Record<string, Entry> = {
  READY: {kind: 'progress', 'pt-BR': ['Pronto para executar', 'O teste está pronto para executar. Ainda não rodou e não há resultado.'], en: ['Ready to run', 'The test is ready to run. It has not run yet and there is no result.']},
  QUEUED: {kind: 'progress', 'pt-BR': ['Na fila para executar', 'O teste está na fila e ainda não começou.'], en: ['Queued to run', 'The test is in the queue and has not started.']},
  DISPATCHED: {kind: 'progress', 'pt-BR': ['Enviado para execução', 'O teste foi enviado para execução e ainda não há resultado.'], en: ['Sent to run', 'The test was sent to run and there is no result yet.']},
  RUNNING: {kind: 'progress', 'pt-BR': ['Teste em andamento', 'O teste está em andamento. Ainda não há conclusão desta execução.'], en: ['Test in progress', 'The test is in progress. This run has no conclusion yet.']},
  CHECKPOINTED: {kind: 'progress', 'pt-BR': ['Execução salva para continuar', 'A execução foi salva num ponto intermediário. Isso não é um resultado concluído.'], en: ['Run saved to continue later', 'The run was saved at an intermediate point. This is not a finished result.']},
  PAUSED: {kind: 'progress', 'pt-BR': ['Em pausa', 'O trabalho está em pausa e pode ser retomado.'], en: ['Paused', 'The work is paused and can be resumed.']},
  BLOCKED: {kind: 'progress', 'pt-BR': ['Parado, aguardando desbloqueio', 'O teste está parado. Não ter rodado não é uma refutação científica.'], en: ['On hold, waiting to be unblocked', 'The test is on hold. Not having run is not a scientific refutation.']},
  BLOCKED_INPUT: {kind: 'progress', 'pt-BR': ['Faltam dados para executar', 'O teste não pode rodar porque faltam dados de entrada. Isso não diz nada sobre a hipótese.'], en: ['Input data is missing', 'The test cannot run because input data is missing. This says nothing about the hypothesis.']},
  DONE: {kind: 'execution', 'pt-BR': ['Execução terminada', 'A execução ou tarefa terminou. Isso não é uma confirmação científica: o resultado ainda depende da revisão.'], en: ['Run finished', 'The run or task finished. This is not a scientific confirmation: the result still depends on review.']},
  COMPLETE: {kind: 'execution', 'pt-BR': ['Execução terminada', 'A execução ou tarefa terminou. Isso não é uma confirmação científica: o resultado ainda depende da revisão.'], en: ['Run finished', 'The run or task finished. This is not a scientific confirmation: the result still depends on review.']},
  FAILED: {kind: 'execution', 'pt-BR': ['A execução falhou', 'A execução não terminou por uma falha. Isso é um problema de execução, não um resultado científico.'], en: ['The run failed', 'The run did not finish because of a failure. This is an execution problem, not a scientific result.']},
  INCONCLUSIVE: {kind: 'execution', 'pt-BR': ['Os dados ainda não permitem concluir', 'A execução terminou, mas os dados ainda não permitem concluir. Não é uma refutação, nem uma confirmação, nem um erro.'], en: ['The data does not yet support a conclusion', 'The run finished, but the data does not yet support a conclusion. It is not a refutation, not a confirmation and not an error.']},
  PROMOTED: {kind: 'execution', 'pt-BR': ['Positivo na execução, ainda sem revisão', 'A execução atendeu ao critério do teste. Ainda não foi confirmado pela revisão independente.'], en: ['Positive in the run, not reviewed yet', 'The run met the test criterion. It has not been confirmed by independent review yet.']},
  REJECTED: {kind: 'execution', 'pt-BR': ['Não atendeu ao critério do teste', 'A execução terminou sem atender ao critério registrado. Isso é diferente de uma refutação pela revisão independente.'], en: ['Did not meet the test criterion', 'The run finished without meeting the registered criterion. This is different from a refutation by independent review.']},
  PROVISIONAL: {kind: 'execution', 'pt-BR': ['Resultado provisório', 'Há um resultado, mas ele ainda não foi confirmado pela revisão.'], en: ['Provisional result', 'There is a result, but it has not been confirmed by review yet.']},
  DISCARDED: {kind: 'execution', 'pt-BR': ['Descartado', 'O teste foi descartado no registro atual.'], en: ['Discarded', 'The test was discarded in the current record.']},
  PENDING_REVIEW: {kind: 'review', 'pt-BR': ['Aguardando revisão', 'O resultado espera pela revisão independente. Ainda não é uma conclusão.'], en: ['Waiting for review', 'The result is waiting for independent review. It is not a conclusion yet.']},
  REVIEW: {kind: 'review', 'pt-BR': ['Em revisão', 'O resultado está em revisão. A leitura da execução ainda não é uma conclusão confirmada.'], en: ['Under review', 'The result is under review. The reading of the run is not a confirmed conclusion yet.']},
  REFEREE1_PASSED: {kind: 'review', 'pt-BR': ['Primeira revisão aprovada', 'A primeira revisão aprovou o resultado. A confirmação ainda depende das etapas seguintes.'], en: ['First review passed', 'The first review approved the result. Confirmation still depends on the next steps.']},
  CONTESTED: {kind: 'review', 'pt-BR': ['Contestado', 'O resultado foi contestado e a disputa está aberta.'], en: ['Contested', 'The result was contested and the dispute is open.']},
  CONFIRMED: {kind: 'review', conclusion: true, 'pt-BR': ['Confirmado na revisão', 'O resultado foi confirmado pela revisão publicada, dentro dos limites deste teste.'], en: ['Confirmed in review', 'The result was confirmed by the published review, within the limits of this test.']},
  REFUTED: {kind: 'review', conclusion: true, 'pt-BR': ['Refutado na revisão', 'A revisão publicada refutou este resultado.'], en: ['Refuted in review', 'The published review refuted this result.']},
};
// spellings of the same published state; the lookup key only, `code` keeps what was received
const ALIAS: Record<string, string> = {INCONCLUSIVO: 'INCONCLUSIVE', IN_PROGRESS: 'RUNNING', ACTIVE: 'RUNNING', COMPLETED: 'COMPLETE', ERROR: 'FAILED'};
const UNKNOWN: Record<Lang, {none: [string, string]; other: [string, string]}> = {
  'pt-BR': {none: ['Estado ainda não informado', 'Nenhum estado foi publicado para este item. Não há base para apresentar uma conclusão.'], other: ['Estado não reconhecido', 'O estado publicado não tem uma descrição nesta versão do Atlas. Ele é mostrado no detalhe técnico, sem interpretação.']},
  en: {none: ['State not informed yet', 'No state was published for this item. There is no basis to present a conclusion.'], other: ['Unrecognised state', 'The published state has no description in this version of the Atlas. It is shown in the technical detail, without interpretation.']},
};

/** Any locale tag -> a supported language; anything that is not English falls back to PT-BR (the product default). */
export const resolveLang = (tag?: string | null): Lang => (typeof tag === 'string' && /^en(?:[-_]|$)/i.test(tag.trim()) ? 'en' : 'pt-BR');
/** Language of the current document. Inside the private frame this stays PT-BR until the shell hands its locale to the frame. */
export const documentLang = (): Lang => resolveLang(typeof document === 'undefined' ? null : document.documentElement.lang);
export const KNOWN_STATES: readonly string[] = Object.keys(T);

export function describeState(code: unknown, lang: Lang = 'pt-BR'): StateText {
  const l = LANGS.includes(lang) ? lang : 'pt-BR';
  if (code === null || code === undefined || (typeof code === 'string' && code.trim() === '')) return {label: UNKNOWN[l].none[0], meaning: UNKNOWN[l].none[1], code: null, kind: 'unknown', known: false, scientificConclusion: false};
  const raw = String(code), key = raw.trim().toUpperCase().replace(/[\s-]+/g, '_'), e = T[ALIAS[key] ?? key];
  if (!e) return {label: UNKNOWN[l].other[0], meaning: UNKNOWN[l].other[1], code: raw, kind: 'unknown', known: false, scientificConclusion: false};
  return {label: e[l][0], meaning: e[l][1], code: raw, kind: e.kind, known: true, scientificConclusion: e.conclusion === true};
}
/** label only; lowerFirst for use in the middle of a sentence */
export const stateLabel = (code: unknown, lang: Lang = 'pt-BR', lowerFirst = false): string => { const s = describeState(code, lang).label; return lowerFirst ? s.charAt(0).toLowerCase() + s.slice(1) : s; };

export interface ReasonText {reason: string; nextStep: string; reasonInformed: boolean; nextStepInformed: boolean}
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : Array.isArray(v) ? (v.filter(x => typeof x === 'string' && x.trim() !== '').join('; ') || null) : null);
/** Why something is in its state and what comes next: only what the data says. Nothing is guessed when the data is silent. */
export function describeReason(data: {reason?: unknown; nextStep?: unknown}, lang: Lang = 'pt-BR'): ReasonText {
  const en = lang === 'en', r = text(data.reason), n = text(data.nextStep);
  return {reason: r ?? (en ? 'The reason has not been informed yet.' : 'O motivo ainda não foi informado.'), nextStep: n ?? (en ? 'The next step has not been informed yet.' : 'O próximo passo ainda não foi informado.'), reasonInformed: r !== null, nextStepInformed: n !== null};
}
export const UI: Record<Lang, {technical: string; published: string; none: string; result: string; status: string; review: string; reason: string; next: string}> = {
  'pt-BR': {technical: 'Detalhe técnico', published: 'Valor publicado', none: 'não publicado', result: 'Resultado', status: 'Andamento', review: 'Revisão', reason: 'Motivo', next: 'Próximo passo'},
  en: {technical: 'Technical detail', published: 'Published value', none: 'not published', result: 'Result', status: 'Progress', review: 'Review', reason: 'Reason', next: 'Next step'},
};
