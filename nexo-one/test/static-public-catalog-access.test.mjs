import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const rd = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('Pages builds explicitly select the static public shell', () => {
  assert.match(rd('vite.config.ts'), /'import\.meta\.env\.VITE_STATIC_PUBLIC_SHELL': JSON\.stringify\(Boolean\(process\.env\.GITHUB_PAGES\)\)/);
});

test('static shell reads public campaign summaries from the existing backend', () => {
  const app = rd('src/atlas/ui/PublicApp.tsx');
  assert.match(app, /const PUBLIC_API_URL = 'https:\/\/nexo-one-two\.vercel\.app\/api\/atlas-public';/);
  assert.doesNotMatch(app, /if \(STATIC_PUBLIC_SHELL\) return;|PUBLIC_CATALOG_URL/);
  assert.match(app, /STATIC_PUBLIC_SHELL && u === PUBLIC_PATH \? PUBLIC_API_URL : u/);
  assert.match(rd('src/atlas/ui/Shell.tsx'), /https:\/\/nexo-one-two\.vercel\.app\/#\/privado/);
  assert.doesNotMatch(app, /target="_blank"|window\.location\.replace/);
});

test('hosted API rendering and publication boundary remain intact', () => {
  const app = rd('src/atlas/ui/PublicApp.tsx');
  assert.match(app, /pub\.status === 'unavailable'/);
  assert.doesNotMatch(app, /pub\.tests\.map|PublicTestView/);
  assert.match(rd('scripts/static-publication.mjs'), /APPROVED_PUBLIC_DATA = Object\.freeze\(\[\]\)/);
  assert.match(rd('src/atlas/public-presentation.css'), /\.atlas-catalog-link\{width:fit-content;max-width:100%;text-decoration:none\}/);
});
