import test from 'node:test';
import assert from 'node:assert/strict';
import {publicAtlasProjection} from '../worker/public-tests.mjs';
import {publicationKey as serverKey} from '../worker/public-publication.mjs';
import {applySelection, fetchSelection, publicationKey} from '../src/atlas/publicSelection.ts';
import {loadPublic} from '../src/atlas/publicItems.ts';
import {PUBLIC_PATH} from '../src/atlas/api.ts';

const URL_PUBLIC = PUBLIC_PATH, URL_SELECTION = 'https://cockpit.example/api/atlas-public-selection';
const rows = publicAtlasProjection().tests;
const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});
const bi = t => ({'pt-BR': t, en: t});
const owner = {question: bi('Pergunta aprovada pelo dono?'), answers: bi('Escopo aprovado.'), method: bi('Método aprovado.'), result: bi('Resultado aprovado, inconclusivo.'), published_at: '2026-11-01T21:00:00.000Z', updated_at: null};
const front = {id: 'front-0123456789abcdef', questionId: 'front-0123456789abcdef', question: bi('Frente aprovada?'), why: null, method: null, currentStage: bi('Em andamento'), nextStep: bi('Próximo passo aprovado.'), limitations: null, updatedAt: '2026-11-01T21:00:00.000Z', state: 'ongoing', closure: null, tests: [], testsCoverage: 'PARTIAL'};
const fetcher = selection => async url => url === URL_PUBLIC ? json({contract: 'ATLAS_PUBLIC_V1', items: [], links: [], tests: rows.slice(0, 5)}) : url === URL_SELECTION ? (selection instanceof Response ? selection : json(selection)) : json({error: 'unexpected'}, 404);

test('browser key equals the server publication key for real reviewed rows', async () => {
  for (const row of rows.slice(0, 20)) assert.equal(await publicationKey(row), serverKey(row));
});

test('selection contract: UNSET passes through; malformed LIVE is refused', async () => {
  assert.deepEqual(await fetchSelection(fetcher({contract: 'ATLAS_PUBLIC_SELECTION_V1', mode: 'UNSET'}), URL_SELECTION), {mode: 'UNSET'});
  for (const bad of [{contract: 'X', mode: 'LIVE'}, {contract: 'ATLAS_PUBLIC_SELECTION_V1', mode: 'LIVE', version: 1, updatedAt: '2026-11-01T21:00:00Z', include: ['nope'], tests: [], campaigns: []}]) {
    await assert.rejects(fetchSelection(fetcher(bad), URL_SELECTION));
  }
});

test('LIVE selection keeps only chosen catalog rows and appends owner-approved rows', async () => {
  const keep = [serverKey(rows[1]), serverKey(rows[3])];
  const {payload} = await applySelection({contract: 'ATLAS_PUBLIC_V1', items: [], links: [], tests: rows.slice(0, 5)}, {mode: 'LIVE', version: 2, updatedAt: '2026-11-01T21:00:00Z', include: keep, tests: [owner], campaigns: []});
  assert.equal(payload.tests.length, 3);
  assert.deepEqual(payload.tests.slice(0, 2), [rows[1], rows[3]]);
});

test('loadPublic: no selection URL keeps today\'s behaviour; UNSET keeps the static catalog', async () => {
  assert.equal((await loadPublic(fetcher(null), undefined, '')).tests.length, 5);
  assert.equal((await loadPublic(fetcher({contract: 'ATLAS_PUBLIC_SELECTION_V1', mode: 'UNSET'}), undefined, URL_SELECTION)).tests.length, 5);
});

test('loadPublic: LIVE selection drives tests and fronts; tests stay listed next to fronts', async () => {
  const state = await loadPublic(fetcher({contract: 'ATLAS_PUBLIC_SELECTION_V1', mode: 'LIVE', version: 3, updatedAt: '2026-11-01T21:00:00.000Z', include: [serverKey(rows[0])], tests: [owner], campaignsContract: 'ATLAS_PUBLIC_CAMPAIGNS_V1', campaigns: [front]}), undefined, URL_SELECTION);
  assert.equal(state.status, 'ready');
  assert.equal(state.selection, 'LIVE');
  assert.equal(state.tests.length, 2);
  assert.equal(state.tests[1].question['pt-BR'], owner.question['pt-BR']);
  assert.equal(state.campaigns.length, 1);
  assert.equal(state.campaigns[0].nextStep['pt-BR'], 'Próximo passo aprovado.');
});

test('LIVE publication time survives a selection without campaigns and preserves study dates', async () => {
  const updatedAt = '2026-11-01T21:00:00.000Z';
  const state = await loadPublic(fetcher({contract: 'ATLAS_PUBLIC_SELECTION_V1', mode: 'LIVE', version: 3,
    updatedAt, include: [serverKey(rows[0])], tests: [], campaigns: []}), undefined, URL_SELECTION);
  assert.equal(state.status, 'ready');
  assert.equal(state.generatedAt, updatedAt);
  assert.equal(state.tests[0].published_at, rows[0].published_at);
  assert.equal(state.tests[0].updated_at, rows[0].updated_at ?? null);
});

test('empty LIVE selection retains its publication time', async () => {
  const updatedAt = '2026-11-01T21:00:00.000Z';
  const state = await loadPublic(fetcher({contract: 'ATLAS_PUBLIC_SELECTION_V1', mode: 'LIVE', version: 4,
    updatedAt, include: [], tests: [], campaigns: []}), undefined, URL_SELECTION);
  assert.equal(state.status, 'empty');
  assert.equal(state.generatedAt, updatedAt);
});

test('loadPublic fails closed when the configured selection cannot be read', async () => {
  for (const response of [json({error: 'PUBLIC_SELECTION_UNAVAILABLE'}, 503), new Response('<html>', {status: 200, headers: {'content-type': 'text/html'}})]) {
    const state = await loadPublic(fetcher(response), undefined, URL_SELECTION);
    assert.equal(state.status, 'unavailable');
    assert.equal(state.tests.length, 0);
  }
});

test('catalog and selection start together; pending or failed selection cannot expose catalog', async () => {
  let releaseCatalog, releaseSelection;
  const catalogReady = new Promise(resolve => { releaseCatalog = resolve; });
  const selectionReady = new Promise(resolve => { releaseSelection = resolve; });
  const started = [];
  const fetch = async url => {
    started.push(url);
    if (url === URL_PUBLIC) { await catalogReady; return json({contract: 'ATLAS_PUBLIC_V1', items: [], links: [], tests: rows.slice(0, 5)}); }
    if (url === URL_SELECTION) { await selectionReady; return json({error: 'PUBLIC_SELECTION_UNAVAILABLE'}, 503); }
    return json({error: 'unexpected'}, 404);
  };
  let settled = false;
  const result = loadPublic(fetch, undefined, URL_SELECTION).then(state => { settled = true; return state; });
  assert.deepEqual(new Set(started), new Set([URL_PUBLIC, URL_SELECTION]));
  releaseCatalog();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false, 'catalog is not exposed while the selection is pending');
  releaseSelection();
  const state = await result;
  assert.equal(state.status, 'unavailable');
  assert.deepEqual(state.tests, []);
});

test('a failed parallel read aborts its still-pending companion', async () => {
  let catalogSignal;
  const fetch = async (url, init) => {
    if (url === URL_SELECTION) return json({error: 'PUBLIC_SELECTION_UNAVAILABLE'}, 503);
    catalogSignal = init.signal;
    return new Promise((resolve, reject) => {
      if (catalogSignal.aborted) reject(new DOMException('aborted', 'AbortError'));
      else catalogSignal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), {once: true});
    });
  };
  const state = await loadPublic(fetch, undefined, URL_SELECTION);
  assert.equal(catalogSignal.aborted, true);
  assert.equal(state.status, 'unavailable');
  assert.deepEqual(state.tests, []);
});

test('caller cancellation aborts both parallel reads and remains an abort', async () => {
  const signals = [];
  const fetch = (url, {signal}) => new Promise((resolve, reject) => {
    signals.push(signal);
    const abort = () => reject(new DOMException('aborted', 'AbortError'));
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, {once: true});
  });
  const controller = new AbortController();
  const result = loadPublic(fetch, controller.signal, URL_SELECTION);
  controller.abort();
  await assert.rejects(result, error => error.code === 'ABORTED');
  assert.equal(signals.length, 2);
  assert.ok(signals.every(signal => signal.aborted));
});

// Cross-contract: the cockpit backend (nexo-one) and this public client must agree on keys and shapes.
import {publicationKey as cockpitKey, publicSelection as cockpitProjection, frontId} from '../../nexo-one/server/atlas/public-selection.mjs';
test('cockpit backend keys and public projection are accepted unchanged by the public client', async () => {
  for (const row of rows.slice(0, 20)) assert.equal(cockpitKey(row), serverKey(row));
  const id = frontId({item: 'X'});
  const projection = cockpitProjection({contract: 'NEXO_PUBLIC_SELECTION_V1', version: 4, updatedAt: '2026-11-01T21:00:00.000Z', catalog: [serverKey(rows[2])],
    tower: [{id: 'r-' + 'a'.repeat(24), digest: 'sha256:' + 'b'.repeat(64), approvedAt: '2026-11-01T21:00:00.000Z', public: {question: owner.question, answers: owner.answers, method: owner.method, result: owner.result}}],
    campaigns: [{id, digest: 'sha256:' + 'c'.repeat(64), approvedAt: '2026-11-01T21:00:00.000Z', state: 'completed', public: {question: bi('Frente encerrada?'), why: null, currentStage: null, nextStep: null, closure: bi('Encerrada sem detecção.')}}]});
  const state = await loadPublic(fetcher(projection), undefined, URL_SELECTION);
  assert.equal(state.status, 'ready');
  assert.equal(state.tests.length, 2);
  assert.equal(state.campaigns[0].state, 'completed');
  assert.equal(state.campaigns[0].closure.summary['pt-BR'], 'Encerrada sem detecção.');
});
