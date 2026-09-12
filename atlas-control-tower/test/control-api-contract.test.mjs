import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/api/control.ts', import.meta.url), 'utf8');

test('control client exposes the complete NEXO control API without a hardcoded host', () => {
  for (const route of [
    'context', 'dispatch', 'runs', 'capsule', 'execute', 'outbox', 'mcp'
  ]) assert.match(source, new RegExp(`/${route}`));
  assert.match(source, /NEXO_API_BASE_URL|configuredBaseUrl/);
  assert.doesNotMatch(source, /https?:\/\//);
});

test('control client validates JSON objects and reports HTTP failures', () => {
  assert.match(source, /ControlApiError/);
  assert.match(source, /response\.ok/);
  assert.match(source, /isRecord/);
});

test('control client keeps write operations explicit and GET operations separate', () => {
  assert.match(source, /dispatch:/);
  assert.match(source, /execute:/);
  assert.match(source, /appendOutbox:/);
  assert.match(source, /method:\s*'POST'/);
  assert.match(source, /getContext:/);
  assert.match(source, /listOutbox:/);
});

test('shell exposes control-plane readback without replacing the four Atlas areas', () => {
  const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /ControlPlaneDrawer/);
  assert.match(app, /route\.area === 'graphs'/);
  assert.match(app, /route\.area === 'observatory'/);
  assert.match(app, /route\.area === 'lab'/);
  assert.match(app, /route\.area === 'universe'/);
});
