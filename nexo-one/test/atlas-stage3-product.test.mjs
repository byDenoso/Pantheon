import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('Atlas wires Explore/Operate mode, search-to-fly, layers/presets, tour and deep links to the galaxy engine', async () => {
  const atlas = await text('src/features/system/Atlas.tsx');
  assert.match(atlas, /useState<GalaxyMode>\('explore'\)/);
  assert.match(atlas, /onClick=\{\(\) => setMode\('explore'\)\}/);
  assert.match(atlas, /onClick=\{\(\) => setMode\('operate'\)\}/);
  assert.match(atlas, /handleSearchSubmit/);
  assert.match(atlas, /galaxyRef\.current\?\.focusEntity\(id\)/);
  assert.match(atlas, /toggleLayer/);
  assert.match(atlas, /runPreset/);
  assert.match(atlas, /TOUR_ROUTES\.map/);
  assert.match(atlas, /runTourRoute/);
  assert.match(atlas, /exitTour/);
  assert.match(atlas, /parseGalaxyDeepLink\(window\.location\.search\)/);
  assert.match(atlas, /buildGalaxySearch\(/);
  assert.match(atlas, /window\.history\.replaceState/);
  assert.match(atlas, /registerGalaxyWebMcpTools/);
  assert.match(atlas, /<GalaxyIntro onDone=/);
  assert.match(atlas, /mode === 'operate' &&/);
  assert.match(atlas, /<OperateHUD/);
});

test('the galaxy stays visible under the intro, the HUD and the tour menu (nothing here navigates away)', async () => {
  const atlas = await text('src/features/system/Atlas.tsx');
  assert.doesNotMatch(atlas, /window\.location\.assign|window\.location\.href\s*=/);
  assert.match(atlas, /<AtlasGalaxyRenderer/);
});

test('Operate HUD exposes exactly the four permanent indicators, sourced from the compiled galaxy snapshot', async () => {
  const hud = await text('src/features/system/OperateHUD.tsx');
  assert.match(hud, /'needs-you': 'NEEDS YOU'/);
  assert.match(hud, /learn: 'LEARN'/);
  assert.match(hud, /capabilities: 'CAPABILITIES'/);
  assert.match(hud, /changes: 'CHANGES'/);
  assert.match(hud, /snapshot\.needs_you\.length/);
  assert.match(hud, /entity\.kind === 'HYPOTHESIS'/);
  assert.match(hud, /entity\.kind === 'CAPABILITY'/);
  assert.match(hud, /snapshot\.changes\.length/);
  assert.doesNotMatch(hud, /Math\.random/);
});

test('Changes panel stays honest when published history has no delta', async () => {
  const hud = await text('src/features/system/OperateHUD.tsx');
  assert.match(hud, /Nenhuma mudança entre os snapshots publicados disponíveis/);
});

test('the inspector adds a NEXT ("próximo passo") section derived from real entity state', async () => {
  const inspector = await text('src/components/inspector.tsx');
  const tokens = await text('src/viewmodels/tokens.ts');
  assert.match(inspector, /PRÓXIMO PASSO/);
  assert.match(inspector, /nextHintFor\(node\.state\)/);
  assert.match(tokens, /export const nextHintFor/);
});

test('the intro plays once per session, is skippable, and is skipped outright under prefers-reduced-motion', async () => {
  const intro = await text('src/features/system/GalaxyIntro.tsx');
  assert.match(intro, /THIS IS NEXO/);
  assert.match(intro, /sessionStorage/);
  assert.match(intro, /usePrefersReducedMotion/);
  assert.match(intro, /reducedMotion \|\| alreadySeen\(\)/);
  assert.match(intro, /aria-label="Pular introdução"/);
  assert.match(intro, /onDone\(\)/);
});

test('the intro overlay animates within the spec\'s 5-8s window and disables its own animation under reduced motion', async () => {
  const intro = await text('src/features/system/GalaxyIntro.tsx');
  const css = await text('src/styles/system.css');
  assert.match(intro, /DONE_AT_MS = 6200/);
  assert.match(css, /@keyframes galaxy-intro-fade/);
  assert.match(css, /prefers-reduced-motion: reduce\)\{[\s\S]*?\.galaxy-intro/);
});

test('mobile breakpoints exist for the new mode/tour/HUD controls', async () => {
  const css = await text('src/styles/system.css');
  assert.match(css, /@media \(max-width:760px\)\{[\s\S]*?\.atlas-mode-toggle/);
});
