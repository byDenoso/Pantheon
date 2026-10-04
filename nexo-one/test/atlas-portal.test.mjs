import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { buildLab } from '../src/features/lab/model.ts';

test('Atlas fallback keeps real evidence links and reserves pulses for fresh RUNNING', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
  try {
    const { AtlasPortal } = await server.ssrLoadModule('/src/features/lab/AtlasPortal.tsx');
    const lab = buildLab({ generated_at: new Date().toISOString(), graph: { nodes: [], edges: [] }, read_model: { tests: {
      A: { status: 'RUNNING', roadmap_id: 'R' }, B: { status: 'QUEUED', roadmap_id: 'R' }, C: { status: 'BLOCKED_INPUT', roadmap_id: 'R', parents: ['A','MISSING'] },
    } } });
    const render = (sourceCurrent, scale = 'overview') => renderToStaticMarkup(createElement(AtlasPortal, { lab, fallback: true, sourceCurrent, scale, onScale(){}, onFocus(){}, onPanel(){}, onSearch(){} }));
    const current = render(true), stale = render(false);
    assert.equal((current.match(/class="atlas-node-running"/g) || []).length, 1);
    assert.doesNotMatch(stale, /class="atlas-node-running"/);
    assert.doesNotMatch(stale, /#8adbd7|r="2.5"/);
    assert.match(stale, /LEITURA DESATUALIZADA/);
    assert.match(stale, /execução não verificada/);
    assert.match(render(false, 'research'), /<option value="running" disabled="">Execução não verificada<\/option>/);
    for (const id of ['A','B','C']) assert.match(current, new RegExp(`href="#/e/${id}"`));
    assert.doesNotMatch(current, /href="#\/e\/MISSING"/);
    assert.match(current, /WebGL indisponível/);
    assert.match(current, /não coordenadas astronômicas/);
  } finally { await server.close(); }
});
