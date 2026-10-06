import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {describeReason, describeState, KNOWN_STATES, LANGS, resolveLang, stateLabel, UI} from '../src/i18n/state-language.ts';
import {VERDICT_ORDER, VERDICT_PT} from '../src/features/lab/model.ts';
import {currentVerdictText} from '../src/features/lab/presentation.ts';

const src = p => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const SHOUT = /\b[A-Z]{2,}(?:_[A-Z0-9]+)+\b|\b(?:READY|RUNNING|DONE|BLOCKED|INCONCLUSIVE|CONFIRMED|REFUTED|REVIEW|PROVISIONAL|PROMOTED|REJECTED|QUEUED|FAILED)\b/;

test('language: the agreed everyday wording, PT-BR and EN', () => {
  assert.equal(stateLabel('INCONCLUSIVE'), 'Os dados ainda não permitem concluir'); assert.equal(stateLabel('BLOCKED_INPUT'), 'Faltam dados para executar');
  assert.equal(stateLabel('READY'), 'Pronto para executar'); assert.equal(stateLabel('RUNNING'), 'Teste em andamento');
  assert.equal(stateLabel('INCONCLUSIVE', 'en'), 'The data does not yet support a conclusion'); assert.equal(stateLabel('BLOCKED_INPUT', 'en'), 'Input data is missing');
  assert.equal(stateLabel('READY', 'en'), 'Ready to run'); assert.equal(stateLabel('RUNNING', 'en'), 'Test in progress');
  assert.equal(stateLabel('READY', 'pt-BR', true), 'pronto para executar');
});

test('language: every known state has both languages, a meaning, and no robotic code in the words', () => {
  assert.ok(KNOWN_STATES.length >= 20);
  for (const code of KNOWN_STATES) for (const lang of LANGS) {
    const s = describeState(code, lang); assert.equal(s.known, true); assert.equal(s.code, code); assert.ok(s.label.length > 3 && s.meaning.length > 15, code);
    assert.doesNotMatch(s.label, SHOUT, `${code} label`); assert.doesNotMatch(s.meaning, SHOUT, `${code} meaning`); assert.ok(s.meaning.endsWith('.'));
  }
  for (const code of KNOWN_STATES) assert.notEqual(describeState(code, 'pt-BR').label, describeState(code, 'en').label, `${code} is translated`);
});

test('language: DONE is a finished run or task, never a scientific confirmation; only the review concludes', () => {
  for (const lang of LANGS) { const d = describeState('DONE', lang); assert.equal(d.kind, 'execution'); assert.equal(d.scientificConclusion, false); assert.doesNotMatch(d.label, /confirm/i); }
  assert.equal(stateLabel('DONE'), 'Execução terminada'); assert.match(describeState('DONE').meaning, /não é uma confirmação científica/); assert.match(describeState('DONE', 'en').meaning, /not a scientific confirmation/);
  assert.deepEqual(KNOWN_STATES.filter(c => describeState(c).scientificConclusion).sort(), ['CONFIRMED', 'REFUTED']);
  assert.notEqual(stateLabel('DONE'), stateLabel('CONFIRMED')); assert.notEqual(stateLabel('PROMOTED'), stateLabel('CONFIRMED')); assert.notEqual(stateLabel('REJECTED'), stateLabel('REFUTED'));
});

test('language: inconclusive is never worded as refuted, confirmed or an error; blocked is not a refutation', () => {
  for (const lang of LANGS) for (const code of ['INCONCLUSIVE', 'inconclusive', 'INCONCLUSIVO']) {
    const s = describeState(code, lang); assert.equal(s.known, true); assert.equal(s.scientificConclusion, false); assert.equal(s.kind, 'execution');
    assert.doesNotMatch(s.label, /refut|confirm|erro|fail|falh/i); assert.equal(s.label, describeState('INCONCLUSIVE', lang).label);
  }
  assert.match(describeState('INCONCLUSIVE').meaning, /Não é uma refutação, nem uma confirmação, nem um erro/);
  for (const code of ['BLOCKED', 'BLOCKED_INPUT', 'FAILED']) assert.equal(describeState(code).scientificConclusion, false);
  assert.match(describeState('BLOCKED').meaning, /não é uma refutação científica/); assert.match(describeState('FAILED').meaning, /não um resultado científico/);
});

test('language: the published value is preserved exactly; unknown and missing states are said to be so and never mapped to another', () => {
  for (const raw of ['READY', 'ready', ' Ready ', 'blocked-input', 'INCONCLUSIVO', 'PENDING_REVIEW']) assert.equal(describeState(raw).code, raw);
  assert.equal(describeState('blocked-input').label, 'Faltam dados para executar');
  for (const v of [null, undefined, '', '   ']) { const s = describeState(v); assert.deepEqual([s.label, s.code, s.known, s.kind, s.scientificConclusion], ['Estado ainda não informado', null, false, 'unknown', false]); assert.equal(describeState(v, 'en').label, 'State not informed yet'); }
  const labels = new Set(KNOWN_STATES.flatMap(c => LANGS.map(l => describeState(c, l).label)));
  for (const odd of ['ZZ_NEW_STATE', 'SUPERSEDED', 'confirmed_maybe', 42]) { for (const lang of LANGS) { const s = describeState(odd, lang); assert.equal(s.known, false); assert.equal(s.code, String(odd)); assert.equal(s.scientificConclusion, false); assert.ok(!labels.has(s.label), 'not borrowed from a known state'); } }
  assert.equal(describeState('ZZ_NEW_STATE').label, 'Estado não reconhecido'); assert.equal(describeState('ZZ_NEW_STATE', 'en').label, 'Unrecognised state');
});

test('language: PT-BR is the fallback; EN only for English locales', () => {
  for (const t of ['en', 'en-US', 'EN_gb', ' en ']) assert.equal(resolveLang(t), 'en');
  for (const t of ['pt-BR', 'pt', 'es', 'fr-FR', '', null, undefined, 'english', 'xx']) assert.equal(resolveLang(t), 'pt-BR');
  assert.equal(describeState('READY', 'de').label, 'Pronto para executar', 'an unsupported language falls back to PT-BR');
  assert.deepEqual(Object.keys(UI['pt-BR']).sort(), Object.keys(UI.en).sort());
});

test('language: reasons and next steps come from the data; when the data is silent the text says so and invents nothing', () => {
  const full = describeReason({reason: 'Falta o catálogo de entrada', nextStep: 'Publicar o catálogo'}); assert.deepEqual(full, {reason: 'Falta o catálogo de entrada', nextStep: 'Publicar o catálogo', reasonInformed: true, nextStepInformed: true});
  assert.deepEqual(describeReason({reason: ['a', '', 'b']}).reason, 'a; b');
  for (const empty of [{}, {reason: null}, {reason: '  ', nextStep: ''}, {reason: [], nextStep: 7}, {reason: {x: 1}}]) {
    const r = describeReason(empty); assert.deepEqual(r, {reason: 'O motivo ainda não foi informado.', nextStep: 'O próximo passo ainda não foi informado.', reasonInformed: false, nextStepInformed: false});
    assert.equal(describeReason(empty, 'en').reason, 'The reason has not been informed yet.'); assert.equal(describeReason(empty, 'en').nextStep, 'The next step has not been informed yet.');
  }
});

test('canonical values are untouched: the lab enum keeps its keys and order, only the words changed', () => {
  assert.deepEqual(VERDICT_ORDER, ['CONFIRMED', 'REFUTED', 'REVIEW', 'PROVISIONAL', 'READY', 'RUNNING', 'CHECKPOINTED', 'BLOCKED', 'REJECTED', 'DISCARDED']);
  assert.deepEqual(Object.keys(VERDICT_PT), VERDICT_ORDER); for (const v of VERDICT_ORDER) assert.equal(VERDICT_PT[v], stateLabel(v, 'pt-BR'));
  assert.equal(VERDICT_PT.READY, 'Pronto para executar'); assert.equal(VERDICT_PT.RUNNING, 'Teste em andamento');
  const model = src('features/lab/model.ts'); assert.match(model, /export type Verdict = 'CONFIRMED' \| 'REFUTED' \| 'REVIEW' \| 'PROVISIONAL' \| 'READY' \| 'RUNNING' \| 'CHECKPOINTED' \| 'BLOCKED' \| 'REJECTED' \| 'DISCARDED';/);
});

test('real strings in the components: the lab sentences speak plainly and keep their scientific meaning', () => {
  const t = (verdict, extra = {}) => currentVerdictText({verdict, verdictRaw: null, readiness: null, status: 'X', review: null, meaning: null, result: null, ...extra});
  for (const v of ['READY', 'RUNNING', 'BLOCKED']) assert.doesNotMatch(t(v), SHOUT, v);
  assert.match(t('READY'), /pronto para executar/); assert.match(t('READY', {readiness: {eligible: true, reasons: []}}), /pronto para executar e é elegível/); assert.match(t('READY', {readiness: {eligible: false, reasons: []}}), /ainda não pode rodar/);
  assert.match(t('RUNNING'), /em andamento; ainda não há conclusão/); assert.match(t('BLOCKED'), /Não ter rodado não é uma refutação científica/);
  const inc = t('PROVISIONAL', {verdictRaw: 'INCONCLUSIVE'}); assert.match(inc, /Os dados ainda não permitem concluir/); assert.match(inc, /não é refutação nem confirmação/); assert.doesNotMatch(inc, /inconclusiv/i);
  assert.match(t('CONFIRMED'), /confirmado na revisão publicada/); assert.match(t('REFUTED'), /refutou este resultado/);
});

test('real strings in the components: views use the formatter, and published codes only appear in the technical detail', () => {
  const cosmos = src('tower-web/TowerCosmos.tsx'), web = src('tower-web/TowerWeb.tsx'), lab = src('features/lab/LabApp.tsx'), uni = src('features/lab/UniversePage.tsx'), scene = src('features/lab/ObservatoryScene.tsx');
  for (const [name, s] of [['TowerCosmos', cosmos], ['TowerWeb', web]]) { assert.match(s, /from '\.\.\/i18n\/state-language\.ts'/, name); assert.match(s, /describeState\(/, name); assert.doesNotMatch(s, /<dd>\{sel\.verdict \?\? na\}<\/dd>/, `${name} no longer prints the raw verdict as the value`); }
  assert.doesNotMatch(cosmos, /<dd>\{rec\?\.status \?\? na\}<\/dd>|<dd>\{rec\?\.review \?\? na\}<\/dd>/); assert.match(cosmos, /<details className="tc-tech"><summary>\{ui\.technical\}<\/summary>[\s\S]*<code>\{sel\.verdict \?\? ui\.none\}<\/code>[\s\S]*<code>\{rec\?\.status \?\? ui\.none\}<\/code>/);
  assert.match(cosmos, /describeReason\(/); assert.match(web, /stateLabel\(n\.verdict, langRef\.current\)/); assert.match(web, /stateLabel\(v, lang\)/);
  for (const [name, x] of [['TowerCosmos', cosmos], ['TowerWeb', web]]) { assert.match(x, /const lang = useDocumentLang\(\)/, `${name} follows the document language live`); assert.doesNotMatch(x, /documentLang\(\)/, `${name} never reads the language only once`); }
  assert.match(lab, /NARRATION_TERMS: Record<string, string> = Object\.fromEntries\(\[[^\]]*'INCONCLUSIVE'[^\]]*\]\.map\(k => \[k, stateLabel\(k, 'pt-BR', true\)\]\)\)/); assert.doesNotMatch(lab, /INCONCLUSIVE: 'inconclusivo'/);
  assert.doesNotMatch(lab, /label="na fila"|label: 'Na fila', who: 'Operador'/, 'READY is no longer called "in the queue"'); assert.match(lab, /label="prontos para executar"/);
  assert.doesNotMatch(uni, /Inconclusivos relevantes/); assert.match(uni, /\['INCONCLUSIVE', 'Ainda sem conclusão \(dados insuficientes\)'\]/, 'the key is still the published value');
  assert.match(scene, /VERDICT_TXT: Record<Verdict, string> = Object\.fromEntries\(Object\.entries\(VERDICT_PT\)/);
});

test('presentation: no academic background or institution of the author in the shell, its messages or the page metadata (PT-BR and EN)', async () => {
  const {readdirSync} = await import('node:fs'); const root = new URL('../', import.meta.url);
  const files = ['index.html', 'private-ui/index.html', 'src/i18n/messages.ts', ...readdirSync(new URL('src/atlas/ui/', root)).map(f => `src/atlas/ui/${f}`)];
  const banned = /\bUFRJ\b|\bCEDERJ\b|Universidade Federal do Rio de Janeiro|Federal University of Rio de Janeiro|\b(?:bacharel|licenciatura|graduando|graduanda|undergraduate|bachelor'?s?)\b/i;
  for (const f of files) assert.doesNotMatch(readFileSync(new URL(f, root), 'utf8'), banned, f);
});
