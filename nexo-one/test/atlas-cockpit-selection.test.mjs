import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../server/handler.mjs';
import {atlasBoundary} from '../server/atlas/boundary.mjs';
import {AUDIT_KEY, SELECTION_KEY, cockpitView, saveCockpitSelection, publicSelectionView} from '../server/atlas/cockpit-route.mjs';
import {catalogCandidates, publicationKey, publicSelection, textProblem, towerRowId, frontId} from '../server/atlas/public-selection.mjs';

const bi = text => ({'pt-BR': text, en: text});
const catalogRow = n => ({question: bi(`Pergunta sintética ${n}?`), answers: bi('Escopo sintético.'), method: bi('Método sintético.'), result: bi('Resultado sintético inconclusivo.'), published_at: '2026-10-06T04:40:46.417Z', updated_at: null});
const CATALOG = {contract: 'ATLAS_PUBLIC_V1', items: [], links: [], tests: [catalogRow(1), catalogRow(2), catalogRow(3)]};
const BOARD = {
  contract: 'NEXO_SHADOW_BOARD_V1', access: 'PRIVATE', modified_at: '2026-11-01T20:00:00Z', counts: {resultados: 2, roadmap: 1},
  availability: {roadmap:'available', mural:'available', resumo:'available', resultados:'available', equipe:'available'},
  equipe: [{papel: 'Expansão', task_id: 'x', cadencia: 'horária', frentes: 'H0', estado: 'ativa'}],
  roadmap: [{item: 'FRENTE-SINTETICA-1', titulo: 'Frente sintética de expansão', status: 'em andamento', dono: 'x', prio: '1', proximo_teste: 'Próximo teste sintético', depende_de: '', atualizado: '2026-11-01', nota: ''}],
  resultados: [
    {data: '2026-11-01', task: 'x', item: 'A', titulo: 'Teste sintético A', resultado: 'Sem detecção.', numeros: 'Δχ² = 0,4', limites: 'Amostra pequena.', link_dados: ''},
    {data: '2026-11-01', task: 'x', item: 'B', titulo: 'Teste sintético B', resultado: 'Tensão de 2σ.', numeros: '', limites: 'Um único conjunto.', link_dados: ''},
  ],
  resumo: [], mural: [],
};
const ENV = {NEXO_ATLAS_SHADOW_SOURCE_ENABLED: 'true', NEXO_PUBLIC_CATALOG_URL: 'https://catalog.example/atlas-public.json'};

/** In-memory stand-in for the Redis REST store, including the compare-and-set script semantics. */
function memoryStore() {
  const data = new Map(), lists = new Map(), calls = [];
  const store = async (command, ...args) => {
    calls.push(command);
    if (command === 'GET') return data.get(args[0]) ?? null;
    if (command === 'LRANGE') return (lists.get(args[0]) ?? []).slice(args[1], args[2] + 1);
    if (command === 'EVAL') {
      const [, , key, audit, expected, doc, line] = args;
      const current = data.has(key) ? JSON.parse(data.get(key)).version : 0;
      if (current !== Number(expected)) return [0, current];
      data.set(key, doc); lists.set(audit, [line, ...(lists.get(audit) ?? [])].slice(0, 100));
      return [1, current + 1];
    }
    throw Error(`unexpected ${command}`);
  };
  return {store, data, lists, calls};
}
const fetcher = async url => { assert.equal(String(url), ENV.NEXO_PUBLIC_CATALOG_URL); return new Response(JSON.stringify(CATALOG), {headers: {'content-type': 'application/json'}}); };
const deps = (store, extra = {}) => ({env: ENV, store, fetcher, readShadow: async () => BOARD, now: new Date('2026-11-01T21:00:00Z'), ...extra});
const towerItem = (row, overrides = {}) => ({id: towerRowId(row), public: {question: bi(`${row.titulo}?`), answers: bi(row.limites), method: bi('Ajuste de máxima verossimilhança.'), result: bi(row.resultado), ...overrides}});

test('nothing saved: public selection is UNSET and the public site keeps its static catalog', async () => {
  const {store} = memoryStore();
  const view = await publicSelectionView({store});
  assert.deepEqual(view, {status: 200, body: {contract: 'ATLAS_PUBLIC_SELECTION_V1', mode: 'UNSET'}});
});

test('catalog keys match the public build and only published rows can be added', async () => {
  const rows = catalogCandidates(CATALOG);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].key, publicationKey(CATALOG.tests[0]));
  const {store} = memoryStore();
  const bad = await saveCockpitSelection({expectedVersion: 0, catalog: ['f'.repeat(64)], tower: [], campaigns: []}, deps(store));
  assert.equal(bad.status, 422);
  assert.equal(bad.body.errors[0].code, 'NOT_IN_CATALOG');
  const ok = await saveCockpitSelection({expectedVersion: 0, catalog: [rows[0].key, rows[2].key], tower: [], campaigns: []}, deps(store));
  assert.equal(ok.status, 200);
  assert.equal(ok.body.version, 1);
  const pub = await publicSelectionView({store});
  assert.equal(pub.body.mode, 'LIVE');
  assert.deepEqual(pub.body.include, [rows[0].key, rows[2].key]);
});

test('Tower results need complete owner text; digests come from the server read, not the client', async () => {
  const {store, data} = memoryStore();
  const incomplete = await saveCockpitSelection({expectedVersion: 0, catalog: [], tower: [towerItem(BOARD.resultados[0], {method: bi('')})], campaigns: []}, deps(store));
  assert.equal(incomplete.status, 422);
  assert.deepEqual(incomplete.body.errors[0], {kind: 'tower', id: towerRowId(BOARD.resultados[0]), field: 'method', code: 'EMPTY'});
  const forged = towerItem(BOARD.resultados[0]);
  forged.digest = 'sha256:' + '0'.repeat(64);
  const saved = await saveCockpitSelection({expectedVersion: 0, catalog: [], tower: [forged], campaigns: []}, deps(store));
  assert.equal(saved.status, 200);
  const doc = JSON.parse(data.get(SELECTION_KEY));
  assert.notEqual(doc.tower[0].digest, forged.digest);
  assert.match(doc.tower[0].digest, /^sha256:[a-f0-9]{64}$/);
  const pub = (await publicSelectionView({store})).body;
  assert.equal(pub.tests.length, 1);
  assert.deepEqual(Object.keys(pub.tests[0]).sort(), ['answers', 'method', 'published_at', 'question', 'result', 'updated_at']);
  const serialized = JSON.stringify(pub);
  for (const secret of ['sha256:', towerRowId(BOARD.resultados[0]), 'link_dados', 'task']) assert.ok(!serialized.includes(secret), secret);
});

test('restricted families, internal references and links are refused field by field', async () => {
  for (const [text, code] of [['Resultado do PEER', 'RESTRICTED_FAMILY'], ['Ver Olympus', 'RESTRICTED_FAMILY'], ['Proposto pelo S3', 'RESTRICTED_FAMILY'], ['Dados em https://drive.google.com/x', 'INTERNAL_REFERENCE'], ['Contato a@b.org', 'INTERNAL_REFERENCE'], ['Item WORK-123', 'INTERNAL_REFERENCE'], ['Δχ² = 0,4 com 2σ de tensão em H₀ e S₈', null]]) {
    assert.equal(textProblem(text), code, text);
  }
  const {store} = memoryStore();
  const result = await saveCockpitSelection({expectedVersion: 0, catalog: [], tower: [towerItem(BOARD.resultados[1], {result: bi('Confirmado no PEER-n3')})], campaigns: []}, deps(store));
  assert.equal(result.status, 422);
  assert.equal(result.body.errors[0].code, 'RESTRICTED_FAMILY');
});

test('campaign fronts map to the public campaign contract without internal ids', async () => {
  const {store} = memoryStore();
  const id = frontId(BOARD.roadmap[0]);
  const completedWithoutClosure = await saveCockpitSelection({expectedVersion: 0, catalog: [], tower: [], campaigns: [{id, state: 'completed', public: {question: bi('Como a expansão mudou?')}}]}, deps(store));
  assert.equal(completedWithoutClosure.body.errors[0].code, 'CLOSURE_REQUIRED');
  const saved = await saveCockpitSelection({expectedVersion: 0, catalog: [], tower: [], campaigns: [{id, state: 'ongoing', public: {question: bi('Como a expansão mudou?'), nextStep: bi('Comparar com supernovas.')}}]}, deps(store));
  assert.equal(saved.status, 200);
  const campaign = (await publicSelectionView({store})).body.campaigns[0];
  assert.equal(campaign.id, id);
  assert.equal(campaign.questionId, id);
  assert.equal(campaign.state, 'ongoing');
  assert.equal(campaign.closure, null);
  assert.ok(!JSON.stringify(campaign).includes('FRENTE-SINTETICA'));
});

test('version conflicts are refused and every save leaves a content-free audit line', async () => {
  const {store, lists} = memoryStore();
  const key = catalogCandidates(CATALOG)[1].key;
  assert.equal((await saveCockpitSelection({expectedVersion: 0, catalog: [key], tower: [], campaigns: []}, deps(store))).status, 200);
  const stale = await saveCockpitSelection({expectedVersion: 0, catalog: [], tower: [], campaigns: []}, deps(store));
  assert.deepEqual(stale, {status: 409, body: {error: 'VERSION_CONFLICT', currentVersion: 1}});
  const audit = lists.get(AUDIT_KEY).map(line => JSON.parse(line));
  assert.equal(audit.length, 1);
  assert.deepEqual(audit[0].catalog, {count: 1, added: 1, removed: 0});
  assert.ok(!JSON.stringify(audit).includes('Pergunta'));
});

test('source unavailable: unchanged approvals are kept, new Tower items are refused, drift is reported', async () => {
  const {store} = memoryStore();
  const item = towerItem(BOARD.resultados[0]);
  assert.equal((await saveCockpitSelection({expectedVersion: 0, catalog: [], tower: [item], campaigns: []}, deps(store))).status, 200);
  const off = deps(store, {env: {...ENV, NEXO_ATLAS_SHADOW_SOURCE_ENABLED: 'false'}});
  const keep = await saveCockpitSelection({expectedVersion: 1, catalog: [], tower: [item], campaigns: []}, off);
  assert.equal(keep.status, 200);
  const add = await saveCockpitSelection({expectedVersion: 2, catalog: [], tower: [item, towerItem(BOARD.resultados[1])], campaigns: []}, off);
  assert.equal(add.status, 422);
  assert.equal(add.body.errors[0].code, 'SOURCE_UNAVAILABLE');
  const changed = {...BOARD, resultados: [{...BOARD.resultados[0], resultado: 'Sem detecção (revisado).'}]};
  // Same identity (date, task, item, title), different content: CHANGED, still published until the owner acts.
  const view = await cockpitView(deps(store, {readShadow: async () => changed}));
  assert.deepEqual(view.drift, [{kind: 'tower', id: item.id, status: 'CHANGED'}]);
  assert.equal(view.selection.value.tower.length, 1);
  const unrelatedSave = await saveCockpitSelection({expectedVersion: 2, catalog: [], tower: [item], campaigns: []}, deps(store, {readShadow: async () => changed}));
  assert.equal(unrelatedSave.status, 200);
  const afterSave = await cockpitView(deps(store, {readShadow: async () => changed}));
  assert.deepEqual(afterSave.drift, [{kind: 'tower', id: item.id, status: 'CHANGED'}]);
  const gone = await cockpitView(deps(store, {readShadow: async () => ({...BOARD, resultados: []})}));
  assert.deepEqual(gone.drift, [{kind: 'tower', id: item.id, status: 'MISSING'}]);
});

test('cockpit view never reads SHADOW when the source flag is off', async () => {
  const {store} = memoryStore();
  let reads = 0;
  const view = await cockpitView(deps(store, {env: {...ENV, NEXO_ATLAS_SHADOW_SOURCE_ENABLED: undefined}, readShadow: async () => { reads++; return BOARD; }}));
  assert.equal(reads, 0);
  assert.deepEqual(view.shadow, {available: false, reason: 'SHADOW_SOURCE_DISABLED'});
  assert.equal(view.catalog.rows.length, 3);
});

test('an unavailable results tab does not report missing approvals or permit new approvals',async()=>{
  const {store}=memoryStore();
  const item=towerItem(BOARD.resultados[0]);
  assert.equal((await saveCockpitSelection({expectedVersion:0,catalog:[],tower:[item],campaigns:[]},deps(store))).status,200);
  const unavailable={...BOARD,resultados:[],availability:{...BOARD.availability,resultados:'unavailable'}};
  const local=deps(store,{readShadow:async()=>unavailable});
  const view=await cockpitView(local);
  assert.equal(view.shadow.availability.resultados,'unavailable');
  assert.equal(view.drift.filter(row=>row.kind==='tower').length,0);
  const keep=await saveCockpitSelection({expectedVersion:1,catalog:[],tower:[item],campaigns:[]},local);
  assert.equal(keep.status,200);
  const add=await saveCockpitSelection({expectedVersion:2,catalog:[],tower:[item,towerItem(BOARD.resultados[1])],campaigns:[]},local);
  assert.equal(add.status,422);
  assert.equal(add.body.errors[0].code,'SOURCE_UNAVAILABLE');
});

test('cockpit exposes only fixed diagnostic codes for failed private source reads',async()=>{
  const {store}=memoryStore();
  const detail='synthetic-sensitive-detail';
  const failures=[
    [Object.assign(new Error(detail),{googleDiagnostic:'CONNECT_USER_AUTHORIZATION_REQUIRED'}),'SHADOW_CONNECT_USER_AUTHORIZATION_REQUIRED'],
    [Object.assign(new Error(detail),{googleDiagnostic:'OIDC_MISSING'}),'SHADOW_OIDC_MISSING'],
    [Object.assign(new Error(detail),{code:'AUTH_REQUIRED'}),'SHADOW_AUTH_REQUIRED'],
    [new DOMException(detail,'TimeoutError'),'SHADOW_SOURCE_TIMEOUT'],
    [Object.assign(new Error(detail),{googleDiagnostic:detail}),'SHADOW_SOURCE_UNAVAILABLE'],
  ];
  for(const [error,reason] of failures){
    const view=await cockpitView(deps(store,{readShadow:async()=>{throw error;}}));
    assert.deepEqual(view.shadow,{available:false,reason});
    assert.equal(view.catalog.available,true);
    assert.doesNotMatch(JSON.stringify(view),/synthetic-sensitive-detail/);
  }
});

test('unknown tab coverage is sanitized and never creates fresh source candidates',async()=>{
  const {store}=memoryStore();
  const unknown={...BOARD,availability:{resultados:'synthetic-sensitive-detail',other:'synthetic-sensitive-detail'}};
  const view=await cockpitView(deps(store,{readShadow:async()=>unknown}));
  assert.equal(view.shadow.availability.resultados,'unknown');
  assert.equal(view.shadow.availability.roadmap,'unknown');
  assert.deepEqual(view.candidates,{tower:[],campaigns:[]});
  assert.doesNotMatch(JSON.stringify(view.shadow.availability),/synthetic-sensitive-detail/);
  const add=await saveCockpitSelection({expectedVersion:0,catalog:[],tower:[towerItem(BOARD.resultados[0])],campaigns:[]},deps(store,{readShadow:async()=>unknown}));
  assert.equal(add.status,422);
  assert.equal(add.body.errors[0].code,'SOURCE_UNAVAILABLE');
});

test('a corrupt stored document fails closed on the public route', async () => {
  const {store, data} = memoryStore();
  data.set(SELECTION_KEY, JSON.stringify({contract: 'NEXO_PUBLIC_SELECTION_V1', version: 1, catalog: ['not-a-key'], tower: [], campaigns: []}));
  assert.deepEqual(await publicSelectionView({store}), {status: 503, body: {error: 'PUBLIC_SELECTION_UNAVAILABLE'}});
  assert.throws(() => publicSelection({contract: 'X'}), /SELECTION_INVALID/);
});

test('boundary: public selection is anonymous GET with a short CDN cache; cockpit routes require the owner session', async () => {
  const {store} = memoryStore();
  const pub = await atlasBoundary({method: 'GET', headers: {}, url: '/api/atlas-public-selection'}, {}, {route: 'atlas-public-selection', store});
  assert.equal(pub.status, 200);
  assert.equal(pub.headers['Vercel-CDN-Cache-Control'], 'max-age=10, stale-while-revalidate=30');
  const post = await atlasBoundary({method: 'POST', headers: {}, url: '/api/atlas-public-selection'}, {}, {route: 'atlas-public-selection', store});
  assert.equal(post.status, 405);
  for (const route of ['atlas-cockpit', 'atlas-cockpit-selection']) {
    const denied = await atlasBoundary({method: 'GET', headers: {}, url: `/api/${route}`}, {}, {route, store});
    assert.deepEqual(denied, {status: 401, body: {error: 'AUTH_REQUIRED'}});
  }
});

test('real handler: anonymous cockpit calls are refused before any upstream read; CORS only for the public site', async () => {
  const oldFetch = globalThis.fetch;
  let reads = 0;
  globalThis.fetch = async () => { reads++; throw Error('unexpected upstream'); };
  const response = () => ({headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(value) { this.body = value ? JSON.parse(value) : undefined; }});
  try {
    for (const [method, route] of [['GET', 'atlas-cockpit'], ['PUT', 'atlas-cockpit-selection']]) {
      const res = response();
      await handler({url: `/api/${route}`, method, headers: {origin: 'https://evil.example', 'content-type': 'application/json'}, body: {expectedVersion: 0}}, res);
      assert.equal(res.statusCode, 401, route);
    }
    const preflight = response();
    await handler({url: '/api/atlas-public-selection', method: 'OPTIONS', headers: {origin: 'https://nexoresearch.org'}}, preflight);
    assert.equal(preflight.statusCode, 204);
    assert.equal(preflight.headers['Access-Control-Allow-Origin'], 'https://nexoresearch.org');
    const other = response();
    await handler({url: '/api/atlas-public-selection', method: 'OPTIONS', headers: {origin: 'https://evil.example'}}, other);
    assert.notEqual(other.headers['Access-Control-Allow-Origin'], 'https://evil.example');
    assert.equal(reads, 0);
  } finally { globalThis.fetch = oldFetch; }
});
