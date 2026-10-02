import test from 'node:test';
import assert from 'node:assert/strict';
import { compactTitle, hasPublishedTestCollection } from '../src/features/lab/presentation.ts';

test('short titles remain literal excerpts; missing, null and array sources cannot imply an empty queue', () => {
  const original = 'Pergunta completa sobre entradas e resultados '.repeat(6);
  const short = compactTitle(original);
  assert.ok(short.length <= 97); assert.ok(short.endsWith('…'));
  assert.ok(original.startsWith(short.slice(0, -1)));
  assert.equal(compactTitle('  pergunta\n original  '), 'pergunta original');
  for (const missing of [undefined, null, {}, { read_model: {} }, { read_model: { tests: null } }, { read_model: { tests: [] } }]) assert.equal(hasPublishedTestCollection(missing), false);
  assert.equal(hasPublishedTestCollection({ read_model: { tests: {} } }), true);
});

test('rendered empty READY distinguishes absent collection from explicit empty, and preserves originals', async () => {
  const { createServer } = await import('vite');
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { labVisualFixture } = await import('./lab-visual-fixture.mjs');
  const { buildPagesProjection } = await import('../scripts/build-pages-system.mjs');
  const server = await createServer({ server:{ middlewareMode:true, hmr:false, watch:null }, appType:'custom' });
  try {
    const { default: LabApp } = await server.ssrLoadModule('/src/features/lab/LabApp.tsx');
    const projection = labVisualFixture();
    const { system } = buildPagesProjection({ projection, manifestFile:projection.manifest });
    const render = state => renderToStaticMarkup(createElement(LabApp, { state, route:{ page:'evidencia', q:'READY' }, theme:'dark' }));
    // Route filter field is asserted by the rendered empty message; malformed routing cannot silently pass.
    const known = render(system);
    assert.match(known,/Nenhum teste pronto nesta leitura/);
    const absent = structuredClone(system); delete absent.read_model;
    const unknown = render(absent);
    assert.match(unknown,/Não foi possível confirmar a fila nesta leitura/);
    assert.doesNotMatch(unknown,/Nenhum teste pronto nesta leitura/);
  } finally { await server.close(); }
});
