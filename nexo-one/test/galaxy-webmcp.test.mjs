import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGalaxyReadOnlyTools, registerGalaxyWebMcpTools } from '../src/mcp/webmcpTools.ts';
import { compileGalaxySnapshot } from '../src/viewmodels/galaxyCompiler.ts';
import { scenarioById } from '../src/data/fixtures/scenarios.ts';

const snapshot = compileGalaxySnapshot(scenarioById('all-live').build());
const context = {
  getSnapshot: () => snapshot,
  focusEntity: () => true,
  focusDomain: () => true,
  startTour: () => true,
};

test('every read-only tool operates on the already-compiled snapshot without mutating it', () => {
  const tools = buildGalaxyReadOnlyTools(context);
  assert.deepEqual(tools.get_current_system_state(), snapshot);
  assert.deepEqual(tools.get_needs_you(), snapshot.needs_you);
  assert.ok(tools.get_hypotheses().every(entity => entity.kind === 'HYPOTHESIS'));
  assert.ok(tools.get_capabilities().every(entity => entity.kind === 'CAPABILITY'));
  assert.deepEqual(tools.get_changes(), snapshot.changes);
});

test('find_entity matches by id or title substring, case-insensitively, and returns nothing for an empty query', () => {
  const tools = buildGalaxyReadOnlyTools(context);
  const target = snapshot.entities[0];
  const found = tools.find_entity(target.title.slice(0, 3).toUpperCase());
  assert.ok(found.some(entity => entity.id === target.id));
  assert.deepEqual(tools.find_entity('   '), []);
});

test('focus_entity/focus_domain/start_guided_tour delegate to the provided context and return its result', () => {
  const tools = buildGalaxyReadOnlyTools(context);
  assert.equal(tools.focus_entity('x'), true);
  assert.equal(tools.focus_domain('SCIENCE'), true);
  assert.equal(tools.start_guided_tour('SYSTEM_OVERVIEW'), true);
});

test('registerGalaxyWebMcpTools is a documented no-op when no WebMCP host exists on window', () => {
  const originalWindow = globalThis.window;
  globalThis.window = {};
  try {
    assert.equal(registerGalaxyWebMcpTools(context), false);
  } finally {
    globalThis.window = originalWindow;
  }
});

test('registerGalaxyWebMcpTools registers every tool when a host is present', () => {
  const registered = [];
  const originalWindow = globalThis.window;
  globalThis.window = { modelContext: { registerTool: (name, handler) => registered.push([name, handler]) } };
  try {
    const ok = registerGalaxyWebMcpTools(context);
    assert.equal(ok, true);
    assert.equal(registered.length, 9);
    assert.ok(registered.every(([, handler]) => typeof handler === 'function'));
  } finally {
    globalThis.window = originalWindow;
  }
});
