// Source-level wiring checks for the guarded frame (behaviour is exercised in atlas-private-frame.browser.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';

const src = new URL('../src/', import.meta.url).pathname;
const read = p => readFileSync(join(src, p), 'utf8');
const walk = d => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });

test('frame is same-origin, referrer-less, sandboxed without top-navigation/modals/downloads (popups only for explicit, guarded source links), and loads only the guarded shell URL', () => {
  const f = read('atlas/ui/PrivateFrame.tsx');
  assert.match(f, /src=\{PRIVATE_UI_URL\}/); assert.match(f, /PRIVATE_UI_URL = '\/api\/atlas-private-ui'/);
  assert.match(f, /PRIVATE_FRAME_SANDBOX = 'allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox'/);
  assert.match(f, /sandbox=\{PRIVATE_FRAME_SANDBOX\}/);
  assert.match(f, /referrerPolicy="no-referrer"/);
  assert.doesNotMatch(f, /allow-top-navigation|allow-modals|allow-downloads|allow-popups-to-escape-sandbox allow|allow-orientation/);
  assert.doesNotMatch(f.replace(/\/\*[\s\S]*?\*\//g, ''), /sandbox="[^"]*allow-top/);
});

test('the frame is rendered only for an authenticated session with data, and every error path remounts via revalidation', () => {
  const a = read('atlas/ui/PrivateApp.tsx');
  assert.match(a, /const live = state\.phase === 'authenticated' && state\.data !== null/);
  assert.match(a, /\{live && state\.data && \(/);
  assert.match(a, /key=\{epoch\}/);
  assert.match(a, /MAX_FRAME_FAILURES/);
});

test('no postMessage to a wildcard origin anywhere in the new modules', () => {
  const files = [...walk(join(src, 'atlas')), ...walk(join(src, 'private-legacy'))].filter(f => /\.(ts|tsx)$/.test(f));
  for (const f of files) assert.doesNotMatch(readFileSync(f, 'utf8'), /postMessage\([^)]*['"]\*['"]\s*\)/, f);
});

test('guards are installed before any legacy module (first import of the private entry)', () => {
  const m = read('private-legacy/main.tsx').split('\n').filter(l => l.startsWith('import'));
  assert.equal(m[0], "import './install.ts';");
});

test('the private entry never starts the public MCP bridge, the SVG mirror or the old session bridge', () => {
  const closure = ['private-legacy/main.tsx', 'private-legacy/Host.tsx', 'private-legacy/useSession.ts'].map(read).join('\n');
  assert.doesNotMatch(closure, /startWebMcp|TowerSVGSurface|apps-script-bridge|\/api\/session|localStorage\.setItem\([^)]*(pin|token)/);
});

test('locale bridge: the frame applies LOCALE only after the origin+source check and the parser, and only as the document language', async () => {
  const {readFile} = await import('node:fs/promises'); const rd = p => readFile(new URL(`../src/${p}`, import.meta.url), 'utf8');
  const host = await rd('private-legacy/Host.tsx'), frame = await rd('atlas/ui/PrivateFrame.tsx'), app = await rd('atlas/ui/PrivateApp.tsx');
  const iTrust = host.indexOf('if (!trusted(ev, window.location.origin, window.parent)) return;'), iParse = host.indexOf('const msg = parseToFrame(ev.data);'), iLoc = host.indexOf("if (msg.type === 'LOCALE') { document.documentElement.lang = msg.locale; return; }");
  assert.ok(iTrust > 0 && iParse > iTrust && iLoc > iParse, 'trusted -> parsed -> applied');
  assert.doesNotMatch(host.slice(iLoc, iLoc + 120), /setPhase|runtimeHolder|towerMemory|storage/, 'a language change touches no state, data, memory or storage: nothing remounts');
  assert.match(frame, /getLocale: \(\) => localeRef\.current/); assert.match(frame, /useEffect\(\(\) => \{ bridgeRef\.current\?\.setLocale\(locale\); \}, \[locale\]\)/);
  assert.match(app, /const locale = useLocale\(\)/, 'the real preference of the shell'); assert.match(app, /<PrivateFrame data=\{state\.data\} title=\{m\.frameTitle\} locale=\{locale\}/);
  for (const src of [host, frame, app]) assert.doesNotMatch(src, /atlas-locale|localStorage|fetch\(/, 'no endpoint, no storage, no fetch for the bridge');
});
