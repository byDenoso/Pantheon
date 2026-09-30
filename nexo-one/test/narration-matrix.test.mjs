import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/features/lab/LabApp.tsx', import.meta.url), 'utf8');

test('Atlas expands narration to a 90x90 matrix', () => {
  assert.match(source, /const NARRATION_MATRIX_SIZE = 90;/);
  assert.match(source, /Matriz 90x90: cabeça e cauda sorteadas separadamente \(até 8100 falas por evento\)/);
  assert.match(source, /function narrationHeads\(pool: string\[\]\): string\[\]/);
  assert.match(source, /function narrationTails\(pool: string\[\]\): string\[\]/);
  assert.match(source, /const m = matrixFor\(key\)/);
});

test('Mural and test cards reuse real records while varying the speech surface', () => {
  assert.match(source, /function boardNarration\(text: string, id: string, to: string\)/);
  assert.match(source, /const matrix = matrixFor\('BOARD_POSTED'\)/);
  assert.match(source, /pick\(matrix\.heads, `board-head:\$\{id\}`\)/);
  assert.match(source, /pick\(matrix\.tails, `board-tail:\$\{id\}`\)/);
  assert.match(source, /const raw = humanize\(nameIds\(p\.text, lab\)\)/);
  assert.match(source, /const latestEventByTest = new Map/);
  assert.match(source, /narrate\(latestEventByTest\.get\(t\.id\)!, lab\)/);
});
