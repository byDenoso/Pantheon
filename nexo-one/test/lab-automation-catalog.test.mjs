import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/features/lab/LabApp.tsx', import.meta.url), 'utf8');
const taskBlock = source.match(/const TASKS:[\s\S]*?= \[([\s\S]*?)\n\];/)?.[1] ?? '';
const taskNames = [...taskBlock.matchAll(/name: '([^']+)'/g)].map(match => match[1]);

test('lab crew mirrors the ten active Business automations', () => {
  assert.deepEqual(taskNames, [
    'Operador C', 'Engenheiro', 'Guardião', 'Crítico', 'Cientista',
    'Pítia', 'Operador A', 'Operador B', 'Sentinela', 'Revisor de PR',
  ]);
  assert.match(taskBlock, /Operador C'[\s\S]*toda hora · :00/);
  assert.match(taskBlock, /Engenheiro'[\s\S]*toda hora · :05/);
  assert.match(taskBlock, /Guardião'[\s\S]*toda hora · :07/);
  assert.match(taskBlock, /Crítico'[\s\S]*toda hora · :09/);
  assert.match(taskBlock, /Cientista'[\s\S]*toda hora · :12/);
  assert.match(taskBlock, /Pítia'[\s\S]*toda hora · :15/);
  assert.match(taskBlock, /Operador A'[\s\S]*toda hora · :30/);
  assert.match(taskBlock, /Operador B'[\s\S]*toda hora · :45/);
  assert.match(taskBlock, /Sentinela'[\s\S]*todo dia · 06:40/);
  assert.match(taskBlock, /Revisor de PR'[\s\S]*evento de PR/);
  assert.doesNotMatch(taskBlock, /name: 'Operador'/);
  assert.doesNotMatch(taskBlock, /Bom dia/);
});

test('shared role telemetry is not attributed to one automation', () => {
  assert.match(source, /matches\.length === 1 \? matches\[0\] : undefined/);
  assert.match(source, /sharedRole \? 'telemetria do papel · ' : ''/);
  assert.match(source, /SENTINEL: 'Sentinela'/);
});
