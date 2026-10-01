import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { buildLab } from '../src/features/lab/model.ts';
import { latestBoardRecord } from '../src/features/lab/presentation.ts';

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
  assert.ok(app.indexOf('<BoardFocus state=') < app.indexOf('<LiveNowPanel lab='), 'focus is visible before long dashboard sections');
});
