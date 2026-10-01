// Targeted fixture-only regression. Run with VITE_SYSTEM_SOURCE=remote npm run dev.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { scenarioById, DEFAULT_SCENARIO_ID } from '../src/data/fixtures/scenarios.ts';
const state = scenarioById(DEFAULT_SCENARIO_ID).build();
const legacy = { incident_id: 'INC-LEGACY', summary_pt: 'Incidente sem contrato operacional.', state: 'OBSERVED', next_owner: 'LEARNER', evidence_count: 3, public_ids: { tests: [], hypotheses: [], lessons: [] } };
const op = { policy: 'INCIDENT_OPERATIONS_V1', state: 'OPEN', work_ids: ['WORK::RECOVERY-7439f6b78a05c2d060db82f3ecce6df4'], items: [{ work_id: 'WORK::RECOVERY-7439f6b78a05c2d060db82f3ecce6df4', test_id: null, current_owner: 'ADVISOR', assigned_to: 'EXECUTOR', ownership_state: 'ASSIGNED_UNACCEPTED', accepted: false, validation_state: 'EVIDENCE_REQUIRED' }], suggested_owner: null, reason_code: 'READY_INPUTS_NOT_MATERIALIZED', next_action_code: 'COMPLETE_RECOVERY', resolution_scope: null, scientific_effect: 'NONE', handoff: 'SECRET_HANDOFF_NEVER_RENDER' };
state.evolution = { ...(state.evolution ?? {}), incidents: [legacy, { ...legacy, incident_id: 'INC-OPEN', summary_pt: 'Incidente com tarefa encaminhada.', operational: op }, { ...legacy, incident_id: 'INC-RESOLVED', summary_pt: 'Pré-requisitos reparados.', operational: { ...op, state: 'RESOLVED', resolution_scope: 'EXECUTION_PREREQUISITES', next_action_code: 'RESOLVED' } }] };
state.guardian = { status: 'YELLOW', checked_at: '2026-09-29T09:00:00Z', checks_total: 10, checks_failing: 1, failing_areas: ['site'] };
await mkdir('/tmp/pantheon-incidents-qa', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
 for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 960 }, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/system**', route => route.fulfill({ json: state }));
  await page.route('**/api/world**', route => route.fulfill({ json: {} }));
  await page.goto('http://127.0.0.1:4173/#/saude');
  await page.getByText('Responsável operacional não informado', { exact: true }).waitFor();
  const body = await page.locator('body').innerText();
  assert.match(body, /responsável atual: Conselheiro · destinatário: Executor/);
  assert.match(body, /aceite ainda não registrado/); assert.match(body, /Aprendizagem: Em observação · próxima etapa: Learner/);
  assert.match(body, /Resolvido operacionalmente/); assert.match(body, /2026-09-29 09:00:00 UTC/);
  assert.ok(!body.includes('SECRET_HANDOFF')); assert.ok(!body.includes('quem investiga'));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: `/tmp/pantheon-incidents-qa/health-${width}.png`, fullPage: true });
  await page.goto('http://127.0.0.1:4173/#/atlas?view=2d');
  if (width < 600) await page.getByRole('button', { name: /Incidentes.*detalhes/ }).click();
  await page.getByText('Incidentes em acompanhamento', { exact: true }).waitFor();
  assert.match(await page.locator('.atlas-incident-queue').innerText(), /responsável atual: Conselheiro · destinatário: Executor/);
  await page.screenshot({ path: `/tmp/pantheon-incidents-qa/atlas-${width}.png`, fullPage: true });
  await page.goBack(); await page.getByText('Responsável operacional não informado', { exact: true }).waitFor();
  assert.deepEqual(errors, []); await page.close();
 }
 console.log('PASS: health + Atlas, desktop/mobile, legacy/open/resolved, back navigation, no private handoff, no page errors');
} finally { await browser.close(); }
