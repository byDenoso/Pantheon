import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { incidentView, guardianAuditTime } from '../src/viewmodels/incidents.ts';

const incident = { incident_id: 'INC-1', state: 'OBSERVED', next_owner: 'LEARNER', evidence_count: 3, public_ids: { tests: [], hypotheses: [], lessons: [] } };
const operational = { policy: 'INCIDENT_OPERATIONS_V1', state: 'OPEN', work_ids: ['WORK-1'], items: [{ work_id: 'WORK-1', test_id: null, current_owner: 'GUARDIAO', assigned_to: 'EXECUTOR', ownership_state: 'ASSIGNED_UNACCEPTED', accepted: false, validation_state: 'EVIDENCE_REQUIRED' }], suggested_owner: 'EXECUTOR', reason_code: 'READY_INPUTS_NOT_MATERIALIZED', next_action_code: 'COMPLETE_RECOVERY', resolution_scope: null, scientific_effect: 'NONE' };

test('legacy projection preserves learning and explicitly lacks operational ownership', () => {
 const out = incidentView(incident);
 assert.equal(out.state, 'UNKNOWN'); assert.equal(out.label, 'Estado operacional não informado');
 assert.equal(out.learning, 'Em observação'); assert.equal(out.learningOwner, 'Learner'); assert.deepEqual(out.items, []);
});
test('assignment does not imply acceptance, ownership or validation', () => {
 const out = incidentView({ ...incident, operational });
 assert.equal(out.items[0].currentOwner, 'Guardião'); assert.equal(out.items[0].assignedTo, 'Executor');
 assert.match(out.items[0].acceptance, /aceite ainda não registrado/);
 assert.equal(out.items[0].validation, 'Evidência necessária'); assert.equal(out.state, 'OPEN');
});
test('acceptance needs both explicit accepted and matching ownership state', () => {
 for (const [accepted, ownership_state, expected] of [[false, 'ACCEPTED', false], [true, 'UNRECORDED', false], [true, 'ACCEPTED', true]]) {
 const out = incidentView({ ...incident, operational: { ...operational, items: [{ ...operational.items[0], accepted, ownership_state }] } });
 assert.equal(out.items[0].acceptance === 'Aceite registrado', expected);
 }
});
test('operational resolution and scientific/learning confirmation remain independent', () => {
 const out = incidentView({ ...incident, operational: { ...operational, state: 'RESOLVED', resolution_scope: 'EXECUTION_PREREQUISITES' } });
 assert.equal(out.learning, 'Em observação'); assert.match(out.resolutionScope, /pré-requisitos/);
 assert.equal(incidentView({ ...incident, state: 'CONFIRMED', operational }).state, 'OPEN');
});
test('unlinked suggested role is not an assignment', () => {
 const out = incidentView({ ...incident, operational: { ...operational, state: 'UNLINKED', items: [], work_ids: [] } });
 assert.equal(out.label, 'Sem tarefa vinculada'); assert.deepEqual(out.items, []); assert.equal(out.suggestedOwner, 'Executor');
});
test('unknown codes and private handoff fields cannot become presentation text', () => {
 const secret = 'private handoff sentinel';
 const out = incidentView({ ...incident, operational: { ...operational, reason_code: secret, next_action_code: secret, handoff: secret, details: secret, items: [{ ...operational.items[0], current_owner: secret, assigned_to: secret, validation_state: secret, details: secret }] } });
 assert.ok(!JSON.stringify(out).includes(secret)); assert.equal(out.reason, null);
});
test('new learning aliases take precedence without overwriting legacy fields', () => {
 const out = incidentView({ ...incident, learning_state: 'REVIEWING', learning_next_owner: 'REFUTADOR' });
 assert.equal(out.learning, 'Em revisão'); assert.equal(out.learningOwner, 'Refutador');
});
test('guardian observation time is source checked_at in UTC, never browser freshness', () => {
 const now = Date.parse('2026-10-01T12:00:00Z');
 assert.equal(guardianAuditTime('2026-09-29T06:00:00-03:00', now), '2026-09-29 09:00:00 UTC');
 assert.equal(guardianAuditTime('invalid', now), 'data da auditoria não informada');
 assert.match(guardianAuditTime('2026-10-02T00:00:00Z', now), /à frente/);
});
test('both public incident surfaces use the shared ownership UI and retain distinct learning labels', async () => {
 const health = await readFile(new URL('../src/features/lab/LabApp.tsx', import.meta.url), 'utf8');
 const atlas = await readFile(new URL('../src/atlas3d/Atlas3DApp.tsx', import.meta.url), 'utf8');
 const component = await readFile(new URL('../src/components/IncidentResponsibility.tsx', import.meta.url), 'utf8');
 assert.match(health, /<IncidentResponsibility incident=\{incident\}/); assert.match(atlas, /<IncidentResponsibility incident=\{incident\}/);
 assert.doesNotMatch(health, /quem investiga/); assert.match(component, /Responsável operacional não informado/);
 assert.match(component, /responsável atual:/); assert.match(component, /destinatário:/); assert.match(component, /Aprendizagem:/);
 assert.match(component, /não altera o resultado científico/);
 assert.match(health, /Achados da última auditoria/); assert.match(health, /guardianAuditTime\(reportAt\)/);
 assert.match(health, /const reportAt = g\?\.report_checked_at/);
 assert.doesNotMatch(health, /incidents!\.length\} abertos/);
});

test('canonical recovery roles are displayed for current owner and recipient', () => {
 for (const role of ['ADVISOR', 'DAILY', 'EMERGENT']) {
 const out = incidentView({ ...incident, operational: { ...operational, items: [{ ...operational.items[0], current_owner: role, assigned_to: role }] } });
 assert.notEqual(out.items[0].currentOwner, 'não informado'); assert.notEqual(out.items[0].assignedTo, 'não informado');
 }
});

test('rendered responsibility component separates destination, acceptance, learning and private fields', async () => {
 const { transpileModule, JsxEmit } = await import('typescript');
 const { renderToStaticMarkup } = await import('react-dom/server');
 const { createElement } = await import('react');
 const source = await readFile(new URL('../src/components/IncidentResponsibility.tsx', import.meta.url), 'utf8');
 const compiled = transpileModule(source, { compilerOptions: { jsx: JsxEmit.ReactJSX, module: 99 } }).outputText
  .replace('"react/jsx-runtime"', JSON.stringify(import.meta.resolve('react/jsx-runtime')))
  .replace("'../viewmodels/incidents.ts'", JSON.stringify(new URL('../src/viewmodels/incidents.ts', import.meta.url).href));
 const { IncidentResponsibility } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
 const render = value => renderToStaticMarkup(createElement(IncidentResponsibility, { incident: value }));
 const legacy = render(incident);
 assert.match(legacy, /Responsável operacional não informado/); assert.match(legacy, /Aprendizagem: Em observação/);
 const current = render({ ...incident, operational: { ...operational, handoff: 'PRIVATE_SENTINEL' } });
 assert.match(current, /responsável atual: Guardião/); assert.match(current, /destinatário: Executor/);
 assert.match(current, /aceite ainda não registrado/); assert.doesNotMatch(current, /PRIVATE_SENTINEL/);
 assert.match(current, /Causa registrada: Entradas prontas ainda não materializadas/);
 assert.match(current, /não altera o resultado científico/);
});

test('closed learning keeps NONE as no pending step, not missing data', () => {
 assert.equal(incidentView({ ...incident, state: 'CLOSED', next_owner: 'NONE' }).learningOwner, 'nenhuma etapa pendente');
});
