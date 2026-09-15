import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('visible product navigation unifies map and observatory without deleting map compatibility', () => {
  const app = read('src/App.tsx');
  const route = read('src/atlas-route.ts');
  for (const label of ['COCKPIT', 'OBSERVATÓRIO', 'LABORATÓRIO', 'ATIVIDADE']) assert.match(app, new RegExp(`label: '${label}'`));
  assert.doesNotMatch(app, /label: 'GRAFOS'/);
  assert.doesNotMatch(app, /label: 'RESUMO DO UNIVERSO'/);
  assert.match(route, /graphs: 'mapa'/);
  assert.match(route, /observatory: 'pesquisa'/);
});

test('visible research product copy is unified while graph infrastructure remains', () => {
  const visible = read('src/App.tsx') + read('src/pages/CockpitPage.tsx') + read('src/components/shell/GraphHeader.tsx');
  assert.doesNotMatch(visible, /ABRIR NO MODO GRAFOS|O Grafo é o mapa; o Observatório é a leitura|Ver campanhas no Grafo|Abrir em Grafos|Abrir Grafos/);
  assert.doesNotMatch(visible, /Universo → Domínio → Campanha/);
  assert.match(read('src/pages/graphs-page.tsx'), /GraphRenderer/);
  assert.match(read('src/App.tsx'), /UnifiedObservatoryPage/);
});

test('deep-space is the default visual preset but all presets remain available', () => {
  const theme = read('src/components/ThemeToggle.tsx');
  assert.match(theme, /return saved&&THEMES\.includes\(saved\)\?saved:'deep-space'/);
  for (const preset of ['classic', 'light', 'dark', 'system', 'deep-space', 'high-contrast']) assert.match(theme, new RegExp(preset));
});

test('science read models do not hardcode Google Drive as the live semantic source', () => {
  const source = read('src/api/hooks.ts') + read('src/api/multisurface-adapters.ts');
  assert.doesNotMatch(source, /source:\s*'GOOGLE_DRIVE'/);
});

test('unified observatory owns the renderer composition without introducing a second graph engine', () => {
  const source = read('src/pages/UnifiedObservatoryPage.tsx');
  assert.match(source, /GraphsPage/);
  assert.doesNotMatch(source, /GraphRenderer|Canvas25DGraph|GraphsV2|Babylon|pixi/i);
});

test('operations UI never fabricates Pulse identity when cycle boundaries are unpublished', () => {
  const source = read('src/pages/CockpitPage.tsx') + read('src/pages/AtividadePage.tsx');
  assert.doesNotMatch(source, /Pulse\s*#|NEXO Pulse v3\.1|cycle_id\s*=\s*['"`]/i);
  assert.match(source, /Atividade operacional/);
});