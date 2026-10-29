import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const rd = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('Pages builds explicitly select the static public shell', () => {
  assert.match(rd('vite.config.ts'), /'import\.meta\.env\.VITE_STATIC_PUBLIC_SHELL': JSON\.stringify\(Boolean\(process\.env\.GITHUB_PAGES\)\)/);
});

test('static shell links to the existing public catalogue before requesting absent APIs', () => {
  const app = rd('src/atlas/ui/PublicApp.tsx');
  assert.match(app, /const PUBLIC_CATALOG_URL = 'https:\/\/nexoresearch\.org\/';/);
  assert.ok(app.indexOf('if (STATIC_PUBLIC_SHELL) return;') < app.indexOf('loadPublic((u, i)'));
  assert.match(app, /STATIC_PUBLIC_SHELL \? <div className="atlas-items atlas-catalog-access">/);
  assert.match(app, /href=\{PUBLIC_CATALOG_URL\}/);
  assert.match(app, /Acessar os trabalhos/);
  assert.match(app, /Explore the research/);
  assert.doesNotMatch(app, /target="_blank"|window\.location\.replace/);
});

test('hosted API rendering and publication boundary remain intact', () => {
  const app = rd('src/atlas/ui/PublicApp.tsx');
  assert.match(app, /pub\.status === 'unavailable'/);
  assert.match(app, /pub\.status === 'ready' && pub\.tests\.map/);
  assert.match(rd('scripts/static-publication.mjs'), /APPROVED_PUBLIC_DATA = Object\.freeze\(\[\]\)/);
  assert.match(rd('src/atlas/public-presentation.css'), /\.atlas-catalog-link\{width:fit-content;max-width:100%;text-decoration:none\}/);
});
