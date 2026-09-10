import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { buildProjectionBus } from '../server/compiler/projection-bus.mjs';
import { buildSystemState } from '../server/compiler/system-state.mjs';
import { capabilityToneOf, label } from '../src/viewmodels/tokens.ts';

const NOW = Date.parse('2026-09-10T12:00:00.000Z');
const NOW_ISO = new Date(NOW).toISOString();
const LIVE_BUS = { fingerprint: 'BUS-test', generated_at: NOW_ISO, state: 'LIVE', sources: [], envelopes: [] };

function item(id, { kind = 'ENTITY', source = 'nexo' } = {}) {
  return {
    id,
    kind,
    title: id,
    summary: 'x',
    source,
    sourceRef: `https://source/${id}`,
    sourceRevision: 'r1',
    authority: source === 'nexo' ? 'CANONICAL' : 'PROVIDER',
    contextId: 'NEXO',
    observedAt: NOW_ISO,
    freshness: { state: 'LIVE', observedAt: NOW_ISO, expiresAt: new Date(NOW + 60_000).toISOString() },
    actions: [],
  };
}

function liveReader(calls) {
  return async id => {
    calls.push(id);
    const items = id === 'nexo'
      ? [item('entity:ssot'), item('action:A-1', { kind: 'ACTION' })]
      : id === 'github'
        ? [item('issue:1', { source: 'github' })]
        : [item('deploy:1', { source: id })];
    return {
      provider: {
        id,
        status: 'AVAILABLE',
        checkedAt: NOW_ISO,
        lastSuccessAt: NOW_ISO,
        revision: 'r1',
        partial: false,
        count: items.length,
        message: 'ok',
      },
      items,
    };
  };
}

test('Universal Projection Bus never requests Vercel as a source', async () => {
  const calls = [];
  const bus = await buildProjectionBus({ now: NOW, reader: liveReader(calls) });
  assert.deepEqual([...new Set(calls)].sort(), ['github', 'nexo']);
  assert.equal(bus.sources.some(source => source.id === 'VERCEL'), false);
  assert.equal(bus.envelopes.some(envelope => envelope.source === 'VERCEL'), false);
});

test('external Vercel health stays visible without gating global NEXO health', () => {
  const state = buildSystemState({
    world: {
      generatedAt: NOW_ISO,
      providers: [{ id: 'vercel', status: 'AUTH_REQUIRED', checkedAt: NOW_ISO, lastSuccessAt: null, message: 'AUTH_REQUIRED' }],
      truthGraph: { results: [] },
    },
    bus: LIVE_BUS,
    systemInput: {},
    now: NOW_ISO,
  });
  assert.equal(state.providers.find(provider => provider.id === 'vercel')?.state, 'BLOCKED');
  assert.equal(state.global_state, 'LIVE');
});

test('RETIRED_RUNTIME remains explicit in the compiled capability state', () => {
  const state = buildSystemState({
    world: { generatedAt: NOW_ISO, providers: [], truthGraph: { results: [] } },
    bus: LIVE_BUS,
    systemInput: {
      capabilities: [{
        capability_id: 'CAP-NEON-RETIRED',
        domain: 'NEXO',
        runtime: 'SCHEDULED_TASK',
        operation: 'Retired Neon projection route',
        status: 'RETIRED_RUNTIME',
        notes: 'Historical only.',
      }],
    },
    now: NOW_ISO,
  });
  assert.equal(state.capabilities[0].status, 'RETIRED_RUNTIME');
  assert.equal(capabilityToneOf('RETIRED_RUNTIME'), 'stale');
  assert.equal(label('RETIRED_RUNTIME'), 'Runtime retirado');
});

test('remote footer labels the remote state instead of a fixture scenario', async () => {
  const app = await readFile(fileURLToPath(new URL('../src/app/App.tsx', import.meta.url)), 'utf8');
  assert.doesNotMatch(app, /\{system\.sourceKind === 'fixture' \? 'FIXTURE' : 'REMOTO'\} · \{scenario\.label\}/);
  assert.match(app, /system\.state\?\.scenario_label/);
});
