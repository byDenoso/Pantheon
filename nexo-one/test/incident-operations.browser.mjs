// Targeted fixture-only regression. Run with VITE_SYSTEM_SOURCE=remote npm run dev.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { legacyVisualUrl } from './helpers/legacy-visual-url.mjs';
import { scenarioById, DEFAULT_SCENARIO_ID } from '../src/data/fixtures/scenarios.ts';
const state = scenarioById(DEFAULT_SCENARIO_ID).build();
const legacy = { incident_id: 'INC-LEGACY', summary_pt: 'Incidente sem contrato operacional.', state: 'OBSERVED', next_owner: 'LEARNER', evidence_count: 3, public_ids: { tests: [], hypotheses: [], lessons: [] } };
const op = { policy: 'INCIDENT_OPERATIONS_V1', state: 'OPEN', work_ids: ['WORK::RECOVERY-7439f6b78a05c2d060db82f3ecce6df4'], items: [{ work_id: 'WORK::RECOVERY-7439f6b78a05c2d060db82f3ecce6df4', test_id: null, current_owner: 'ADVISOR', assigned_to: 'EXECUTOR', ownership_state: 'ASSIGNED_UNACCEPTED', accepted: false, validation_state: 'EVIDENCE_REQUIRED' }], suggested_owner: null, reason_code: 'READY_INPUTS_NOT_MATERIALIZED', next_action_code: 'COMPLETE_RECOVERY', resolution_scope: null, scientific_effect: 'NONE', handoff: 'SECRET_HANDOFF_NEVER_RENDER' };
state.evolution = { ...(state.evolution ?? {}), incidents: [legacy, { ...legacy, incident_id: 'INC-OPEN', summary_pt: 'Incidente com tarefa encaminhada.', operational: op }, { ...legacy, incident_id: 'INC-RESOLVED', summary_pt: 'Pré-requisitos reparados.', operational: { ...op, state: 'RESOLVED', resolution_scope: 'EXECUTION_PREREQUISITES', next_action_code: 'RESOLVED' } }] };
state.guardian = { status: 'YELLOW', checked_at: '2026-09-29T09:00:00Z', checks_total: 10, checks_failing: 1, failing_areas: ['site'] };
const baseUrl=process.env.NEXO_BASE_URL || 'http://127.0.0.1:4173';
const output='test-output/incident-operations';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {}), headless:true });
try {
 for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 960 }, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', error => errors.push(error.stack || error.message));
  await page.route('**/api/system**', route => route.fulfill({ json: state }));
  await page.route('**/api/world**', route => route.fulfill({ json: {} }));
  await page.goto(legacyVisualUrl(baseUrl, '#/atlas?view=2d'));
  const detailsToggle = page.getByRole('button', { name: /Incidentes.*detalhes/ });
  if (width < 600) {
   await detailsToggle.click();
   await page.waitForFunction(() => document.activeElement?.classList.contains('atlas-mobile-sidebar-close'));
  }
  await page.getByText('Incidentes em acompanhamento', { exact: true }).waitFor();
  const atlasQueue = page.locator('.atlas-incident-queue');
  const openQueue = await atlasQueue.innerText();
  assert.match(openQueue, /Responsável operacional não informado/);
  assert.match(openQueue, /responsável atual: Conselheiro · destinatário: Executor/);
  assert.match(openQueue, /aceite ainda não registrado/);
  assert.match(openQueue, /Aprendizagem: Em observação · próxima etapa: Learner/);
  assert.ok(!openQueue.includes('SECRET_HANDOFF'));
  assert.doesNotMatch(openQueue, /Pré-requisitos reparados\.|Resolvido operacionalmente/);
  const showResolved = atlasQueue.getByRole('button', { name: 'Mostrar resolvidos (1)' });
  assert.equal(await showResolved.getAttribute('aria-expanded'), 'false');
  await showResolved.click();
  assert.match(await atlasQueue.innerText(), /Pré-requisitos reparados\./);
  assert.match(await atlasQueue.innerText(), /Resolvido operacionalmente/);
  await atlasQueue.getByRole('button', { name: 'Ocultar resolvidos' }).click();
  assert.doesNotMatch(await atlasQueue.innerText(), /Pré-requisitos reparados\.|Resolvido operacionalmente/);
  await page.screenshot({ path: `${output}/atlas-${width}.png`, fullPage: true });
  if (width < 600) {
   await page.locator('.atlas-mobile-sidebar-close').click();
   await page.waitForFunction(() => document.activeElement?.classList.contains('atlas-mobile-details-toggle'));
   assert.equal(await detailsToggle.evaluate(toggle => document.activeElement === toggle), true,
    'fechar detalhes no iPhone deve devolver o foco ao botão de abertura');
  }
  // Both the primary G6 renderer and its minimap use the SVG backend.
  // Require materialized output, not merely an attached empty container.
  const waitForGraph = async () => {
   await page.locator('#atlas-metro-g6 svg[data-tower-svg-native="metro2d"][data-ready="true"]').waitFor();
   await page.waitForFunction(() => !!document.querySelector('#atlas-metro-g6 svg[data-tower-svg-native="metro2d"] path[d]'));
   assert.equal(await page.locator('#atlas-metro-g6 canvas').count(), 0);
   if (width >= 600) {
    await page.locator('.g6-minimap').waitFor({ state: 'visible' });
    await page.locator('.g6-minimap svg').first().waitFor();
    await page.waitForFunction(() => !!document.querySelector('.g6-minimap svg path[d]'));
    assert.equal(await page.locator('.g6-minimap canvas').count(), 0);
   }
  };
  await waitForGraph();
  // Exercise rapid teardown/recreation while render and fit transitions may
  // still be active; this surfaced late getData errors in CI.
  for (let cycle = 0; cycle < 2; cycle += 1) {
   await page.getByRole('button',{name:'Ver como tabela'}).click();
   await page.getByRole('button',{name:'Ver grafo'}).click();
  }
  await waitForGraph();
  await page.getByRole('button',{name:'Ver como tabela'}).click();
  const table=page.locator('.nexo-graph-table');
  const station=table.locator('tbody tr:not(.selected) .nexo-graph-table-select').first();
  const stationName=(await station.innerText()).trim();
  await station.focus();await page.keyboard.press('Enter');
  assert.equal((await table.locator('tbody tr.selected .nexo-graph-table-select').innerText()).trim(),stationName);
  await page.getByRole('button',{name:'Ver grafo'}).click();
  await waitForGraph();
  // The upstream minimap debounces redraw by 128 ms; let a full trailing
  // window pass so late callbacks surface as pageerrors before this test ends.
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []); await page.close();
 }
 console.log('PASS: Atlas desktop/mobile, legacy/open/resolved, focus restoration, keyboard selection, native SVG graph/minimap, no private handoff, no overflow or page errors');
} finally { await browser.close(); }
