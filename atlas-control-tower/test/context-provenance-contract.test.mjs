import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const client = fs.readFileSync(new URL('../src/api/client.ts', import.meta.url), 'utf8');
const filters = fs.readFileSync(new URL('../src/components/shell/MapFilters.tsx', import.meta.url), 'utf8');

test('Vercel same-origin mode actually calls the published HTTP API', () => {
  assert.match(client, /sameOriginApiBase/);
  assert.match(client, /window\.location\.origin/);
  assert.match(client, /createApi\(\{\s*baseUrl:\s*sameOriginApiBase,\s*profile:\s*['"]atlas['"]/s);
  assert.doesNotMatch(client, /createApi\(\{\s*baseUrl:\s*['"]\/api['"]/s);
});

test('same-origin HTTP API retains the static snapshot as read fallback', () => {
  assert.match(client, /createResilientApi\(primary,\s*fallback\)/);
  assert.match(client, /createStaticArtifactApi/);
});

test('source control reports the known global SSOT source instead of unavailable', () => {
  assert.match(filters, /Google Drive/);
  assert.doesNotMatch(filters, />Indisponível</);
});
