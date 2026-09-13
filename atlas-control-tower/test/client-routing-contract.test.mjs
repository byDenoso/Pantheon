import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const client = fs.readFileSync(new URL('../src/api/client.ts', import.meta.url), 'utf8');

test('browser default API client routes through the Atlas serverless contract', () => {
  assert.match(client, /const baseUrl = configuredBaseUrl\(\)/);
  assert.match(client, /baseUrl === '\/api'/);
  assert.match(client, /window\.fetch\.bind\(window\)/);
  assert.match(client, /profile:\s*['"]atlas['"]\s+as const/);
  assert.match(client, /createApi\(apiOptions\)/);
});
