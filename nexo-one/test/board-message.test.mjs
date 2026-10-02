import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { buildLab } from '../src/features/lab/model.ts';
import { latestBoardRecord } from '../src/features/lab/presentation.ts';
import { buildPagesProjection } from '../scripts/build-pages-system.mjs';
import { labVisualFixture } from './lab-visual-fixture.mjs';

const now = Date.parse('2026-10-01T10:00:00Z');
const post = (id, at, extra = {}) => ({ id, at, from: 'EXECUTOR', to: 'ENGINEER', text: '  Original: TEST-A\n& <texto literal>  ', ...extra });

test('message focus uses the newest observed timestamp, not array order or a made-up exchange', () => {
  const latest = post('NEW', '2026-10-01T09:59:00Z');
  const records = [latest, post('OLD', '2026-09-30T09:00:00Z'), post('FUTURE', '2026-10-02'), post('INVALID', 'invalid'), post('NO-TIME', undefined)];
  const before = structuredClone(records);
  assert.equal(latestBoardRecord(records, now), latest);
  assert.equal(latestBoardRecord(records, now).text, latest.text);
  assert.deepEqual(records, before);
  assert.equal(latestBoardRecord([], now), null);
});

test('empty messages and missing authors or destinations do not invent a focus card', () => {
  for (const extra of [{ text: ' \n ' }, { text: undefined }, { from: '' }, { from: undefined }, { to: '' }, { to: undefined }, { to: '   ' }]) assert.equal(latestBoardRecord([post('MISSING', '2026-10-01', extra)], now), null);
  const resolved = post('RESOLVED', '2026-10-01T09:00:00Z', { resolved_at: '2026-10-01T09:10:00Z' });
  assert.equal(latestBoardRecord([resolved], now), resolved, 'a historical receipt remains a receipt');
});

test('structural render preserves long original text, line breaks and markup characters without adding a response', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
  try {
    const { BoardMessage } = await server.ssrLoadModule('/src/features/lab/BoardMessage.tsx');
    const original = '  Original literal\n' + Array.from({ length: 20 }, (_, i) => `Linha ${i}: TEST-A & <dado> "aspas"`).join('\n') + '\n  ';
    const lab = buildLab({ generated_at: '2026-10-01', graph: { nodes: [], edges: [] }, read_model: { tests: { 'TEST-A': { status: 'READY' } } } });
    const record = post('LONG', '2026-10-01T09:00:00Z', { text: original, refs: ['TEST-A', 'UNKNOWN'] });
    const html = renderToStaticMarkup(createElement(BoardMessage, { post: record, lab, from: 'Executor', to: 'Engenheiro', records: [record], focus: true }));
    const literal = html.match(/<p[^>]*class="board-text"[^>]*>([\s\S]*?)<\/p>/)?.[1];
    const expected = renderToStaticMarkup(createElement('p', null, original)).slice(3, -4);
    assert.equal(literal, expected);
    assert.match(html, /Mural · original/);
    assert.match(html, /EXECUTOR → ENGINEER/);
    assert.match(html, /href="#\/e\/TEST-A"/);
    assert.doesNotMatch(html, /href="[^\"]*UNKNOWN/);
    assert.doesNotMatch(html, /Respondido|Aceito|digitando|setInterval/);
  } finally { await server.close(); }
});

test('literal message, original routing and linked references stay separate from UI narration', async () => {
  const component = await readFile(new URL('../src/features/lab/BoardMessage.tsx', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/features/lab/LabApp.tsx', import.meta.url), 'utf8');
  assert.match(component, /className="board-text" data-collapsed=\{!expanded\}>\{post.text\}/);
  assert.doesNotMatch(component, /clip\(|humanize\(|nameIds\(|Typewriter|setInterval/);
  assert.match(component, /Mural · original/);
  assert.match(component, /\{post.from\} → \{post.to\}/);
  assert.match(component, /lab\.roadmaps\.get\(id\)/);
  assert.match(component, /aria-controls=\{textId\}/);
  assert.match(app, /Narração · interface<\/span>/);
  for (const label of ['Para', 'Tipo', 'Mostrar']) assert.ok(app.includes(`aria-label="${label}"`), 'filter accessible name: ' + label);
  assert.match(app, /useState\('Aguardando resposta'\)/);
  assert.match(app, /<option>Histórico<\/option>/);
  assert.ok(app.indexOf('<BoardFocus state=') < app.indexOf('<LiveNowPanel lab='), 'focus is visible before long dashboard sections');
});

test('compact message sky shares its height with the reading panel and the exploration control', async () => {
  const css = await readFile(new URL('../src/styles/atlas-cinematic.css', import.meta.url), 'utf8');
  const base = await readFile(new URL('../src/features/lab/lab.css', import.meta.url), 'utf8');
  assert.match(css, /:has\(\.board-focus\):not\(\.exploring\):not\(\.flat\):not\(\.scene-unavailable\)\{--sky:22vh\}/);
  assert.match(css, /:has\(\.board-focus\)[^\n]+\.obs-scene\{height:var\(--sky\)\}/);
  assert.match(css, /:has\(\.board-focus\)[^\n]+\.hud\{top:calc\(48px \+ var\(--sky\)\)\}/);
  assert.match(base, /\.explore-toggle\{top:calc\(48px \+ var\(--sky\) - 46px\)!important/);
});

test('message priority moves the intact scientific introduction once and preserves the no-message flow', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
  try {
    const { default: LabApp } = await server.ssrLoadModule('/src/features/lab/LabApp.tsx');
    const projection = labVisualFixture(Date.now() - 60_000);
    const { system } = buildPagesProjection({ projection, manifestFile: projection.manifest });
    const render = state => renderToStaticMarkup(createElement(LabApp, { state, route: { page: 'agora' }, theme: 'dark' }));
    const withMessage = render(system);
    const without = structuredClone(system); without.evolution.board = [];
    const noMessage = render(without);
    const intro = html => html.match(/<p class="thesis">[\s\S]*?<\/p>/)?.[0];
    const hero = html => html.slice(html.indexOf('<header class="hud-hero"'), html.indexOf('</header>'));
    assert.equal(intro(withMessage), intro(noMessage), 'selection, entity link and current verdict are identical');
    assert.equal((withMessage.match(/class="thesis"/g) ?? []).length, 1);
    assert.equal((noMessage.match(/class="thesis"/g) ?? []).length, 1);
    assert.doesNotMatch(hero(withMessage), /class="thesis"/);
    assert.ok(withMessage.indexOf('id="board-focus-title"') < withMessage.indexOf('class="hud-science-intro"'));
    assert.match(hero(noMessage), /class="thesis"/);
    assert.doesNotMatch(noMessage, /class="hud-science-intro"|id="board-focus-title"/);
  } finally { await server.close(); }
});
