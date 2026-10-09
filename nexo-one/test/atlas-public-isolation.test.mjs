// Source-level isolation: the public entry's import closure must not reach legacy
// data/providers/fixtures/SVG mirror, and must not mention private identifiers.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const spec = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|import\s*['"]([^'"]+)['"]/g;

function resolveFile(from, s) {
  if (!s.startsWith('.')) return null;
  const base = resolve(dirname(from), s);
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}
function closure(entry) {
  const seen = new Set(), stack = [entry], bare = new Set();
  while (stack.length) {
    const f = stack.pop(); if (seen.has(f)) continue; seen.add(f);
    if (!/\.(tsx?|css)$/.test(f)) continue;
    const text = readFileSync(f, 'utf8');
    if (f.endsWith('.css')) continue;
    for (const m of text.matchAll(spec)) {
      const s = m[1] ?? m[2] ?? m[3]; const r = resolveFile(f, s);
      if (r) stack.push(r); else if (!s.startsWith('.')) bare.add(s);
    }
  }
  return {files: [...seen].map(f => f.slice(root.length + 1).replaceAll('\\', '/')), bare: [...bare]};
}

const {files, bare} = closure(join(src, 'main.tsx'));

test('public entry closure stays inside src/atlas, src/app/area.ts, src/i18n and main', () => {
  for (const f of files) assert.match(f, /^src\/(main\.tsx|atlas\/|i18n\/|app\/area\.ts)/, f);
  assert.ok(files.length > 10);
});
test('public entry closure has no legacy data, store, fixtures, SVG mirror, three/g6 or fonts', () => {
  assert.deepEqual(bare.filter(b => !['react', 'react-dom/client'].includes(b)), []);
  for (const f of files) assert.doesNotMatch(f, /fixture|NexoStore|adapters|useSystem|useSession|TowerSVG|legacy|mcp\//i, f);
});
test('no private identifier, client PIN storage or legacy session path in the public closure', () => {
  const forbidden = [/\/api\/session\b/, /localStorage\.setItem\([^)]*(pin|token|session)/i, /script\.google\.com/, /tower-projection|system\.json|world-public|tower-head/, /sourceMappingURL/];
  for (const f of files) {
    if (f.endsWith('.css')) continue;
    const t = readFileSync(join(root, f), 'utf8');
    for (const [index,re] of forbidden.entries()) {
      if (index === 0 && f === 'src/atlas/useHumanSession.ts') continue;
      assert.doesNotMatch(t, re, `${f} ${re}`);
    }
  }
});
test('private-area modules are reachable only through a dynamic import (separate chunk)', () => {
  const router = readFileSync(join(src, 'atlas/ui/AppRouter.tsx'), 'utf8');
  assert.match(router, /lazy\(\(\) => import\('\.\/PrivateApp\.tsx'\)\)/);
  assert.doesNotMatch(router, /^import .*PrivateApp/m);
  const pub = readFileSync(join(src, 'atlas/ui/PublicApp.tsx'), 'utf8');
  assert.doesNotMatch(pub, /privateSession|PrivateApp|usePrivateSession/);
});
test('no external font or CDN reference is introduced by the new modules', () => {
  const dir = join(src, 'atlas');
  const walk = d => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
  for (const f of [...walk(dir), join(src, 'main.tsx')].filter(f => /\.(?:ts|tsx|css)$/.test(f))) {
    const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(code, /https?:\/\//, f);
  }
});
