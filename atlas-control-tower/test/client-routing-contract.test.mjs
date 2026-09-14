import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const client = fs.readFileSync(new URL('../src/api/client.ts', import.meta.url), 'utf8');

test('browser default API client uses published static artifacts and keeps remote Atlas compatibility explicit', () => {
  assert.match(client, /createStaticArtifactApi/);
  assert.match(client, /configuredStaticDataBaseUrl/);
  assert.match(client, /import\.meta\.env\.BASE_URL/);
  assert.match(client, /if\s*\(remoteBase\)[\s\S]*createApi\(\{\s*baseUrl:\s*remoteBase,\s*profile:\s*['"]atlas['"]\s+as const\s*\}\)/s);
  assert.doesNotMatch(client, /window\.fetch\.bind\(window\)/);
});

test('Vercel same-origin API has a published static-artifact fallback instead of blanking the graph', () => {
  assert.match(client, /createResilientApi/);
  assert.match(client, /primary/);
  assert.match(client, /fallback/);
  assert.match(client, /catch/);
  assert.match(client, /shouldUseSameOriginApi\(\)[\s\S]*createResilientApi/s);
});
