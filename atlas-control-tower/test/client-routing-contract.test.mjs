import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const client = fs.readFileSync(new URL('../src/api/client.ts', import.meta.url), 'utf8');

test('browser default API client uses the local static Atlas contract', () => {
  assert.match(client, /const baseUrl = configuredBaseUrl\(\)/);
  assert.match(client, /createApi\(\{\s*baseUrl,\s*profile:\s*['"]atlas['"]\s+as const\s*\}\)/s);
  assert.doesNotMatch(client, /window\.fetch\.bind\(window\)/);
});
