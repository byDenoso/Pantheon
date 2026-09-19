import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const text=path=>readFile(new URL(path,root),'utf8');

test('NEXO Prime is loaded last and owns the final design tokens',async()=>{
  const [main,css]=await Promise.all([
    text('src/main.tsx'),
    text('src/styles/nexo-prime.css'),
  ]);
  const command=main.indexOf("./styles/command-os.css");
  const prime=main.indexOf("./styles/nexo-prime.css");
  assert.ok(command>=0&&prime>command);
  assert.match(css,/--nexo-bg-0:#02060d/);
  assert.match(css,/--nexo-accent:#79e7ff/);
  assert.match(css,/--font-ui:Inter/);
  assert.match(css,/--text-2xs:10px/);
  assert.match(css,/--text-hero:clamp\(38px,7vw,64px\)/);
});

test('branded visual preset controls are not exposed in the product UI',async()=>{
  const app=await text('src/app/App.tsx');
  assert.doesNotMatch(app,/nexo-visual-style/);
  assert.doesNotMatch(app,/dataset\.visualStyle/);
  assert.doesNotMatch(app,/OpenAI|Apple/);
  assert.doesNotMatch(app,/visual-style-switch|visual-style-sheet/);
});

test('Atlas is promoted to a full-screen environment rather than a card inside the dashboard',async()=>{
  const css=await text('src/styles/nexo-prime.css');
  assert.match(css,/\.cockpit\[data-view=ATLAS\] \.command-wrap,[\s\S]*\.nav-rail\{\s*display:none/);
  assert.match(css,/\.cockpit\[data-view=ATLAS\] \.atlas-layout\{[\s\S]*height:calc\(100dvh - 68px\)/);
  assert.match(css,/\.cockpit\[data-view=ATLAS\] \.atlas-stage\{[\s\S]*position:absolute;[\s\S]*inset:0/);
  assert.match(css,/\.cockpit\[data-view=ATLAS\] \.atlas-inspector\{[\s\S]*position:absolute/);
  assert.match(css,/\.cockpit\[data-view=ATLAS\] \.atlas-toolbar\{[\s\S]*position:absolute/);
});

test('mobile Atlas keeps readable type and gesture-first camera controls',async()=>{
  const css=await text('src/styles/nexo-prime.css');
  assert.match(css,/@media\(max-width:860px\)/);
  assert.match(css,/\.galaxy-three-label\.domain\{[\s\S]*font-size:13px/);
  assert.match(css,/\.galaxy-three-controls button:nth-child\(2\),[\s\S]*nth-child\(3\)\{\s*display:none/);
  assert.match(css,/\.bottom-nav\{[\s\S]*min-height:58px/);
  assert.doesNotMatch(css,/font-size:(?:6(?:\.\d+)?|7(?:\.\d+)?|8(?:\.\d+)?)px/);
});

test('galaxy uses restrained exposure, macro framing and theme-aware rendering',async()=>{
  const galaxy=await text('src/components/GalaxyThree3D.tsx');
  assert.match(galaxy,/DEFAULT_CAMERA = new Vector3\(0, 22, 268\)/);
  assert.match(galaxy,/MACRO_CAMERA = new Vector3\(0, 20, 340\)/);
  assert.match(galaxy,/toneMappingExposure = themeName === 'light' \? 0\.92/);
  assert.match(galaxy,/bloom\.threshold = 0\.30/);
  assert.match(galaxy,/bloom\.strength = 0\.34/);
  assert.match(galaxy,/bloom\.radius = 0\.32/);
  assert.match(galaxy,/NormalBlending/);
  assert.match(galaxy,/<small>CORE<\/small>/);
});


test('dark and light themes use the requested black-blue and white-orange palettes',async()=>{
  const css=await text('src/styles/nexo-prime.css');
  assert.match(css,/--nexo-bg-0:#020508/);
  assert.match(css,/--nexo-accent:#8bd3ff/);
  assert.match(css,/:root\[data-theme=light\]\{[\s\S]*--nexo-bg-0:#fbfaf7/);
  assert.match(css,/:root\[data-theme=light\]\{[\s\S]*--nexo-accent:#f47a20/);
  assert.match(css,/\.galaxy-three-root\[data-view-mode="macro"\]/);
});
