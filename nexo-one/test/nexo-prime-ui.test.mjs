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

test('visual style presets are persistent and available on desktop and the mobile sheet',async()=>{
  const app=await text('src/app/App.tsx');
  const css=await text('src/styles/nexo-prime.css');
  assert.match(app,/nexo-visual-style/);
  assert.match(app,/dataset\.visualStyle = visualStyle/);
  assert.match(app,/\['nexo-prime', 'NEXO'\]/);
  assert.match(app,/\['openai', 'OpenAI'\]/);
  assert.match(app,/\['apple', 'Apple'\]/);
  assert.match(css,/:root\[data-visual-style="openai"\]/);
  assert.match(css,/:root\[data-visual-style="apple"\]/);
  assert.match(css,/\.visual-style-sheet-options/);
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

test('galaxy framing is wider and bloom is controlled instead of clipping the core',async()=>{
  const galaxy=await text('src/components/GalaxyThree3D.tsx');
  assert.match(galaxy,/DEFAULT_CAMERA = new Vector3\(0, 22, 248\)/);
  assert.match(galaxy,/toneMappingExposure = isMobile \? 1\.0 : 1\.06/);
  assert.match(galaxy,/bloom\.threshold = 0\.22/);
  assert.match(galaxy,/bloom\.strength = 0\.58/);
  assert.match(galaxy,/bloom\.radius = 0\.46/);
  assert.match(galaxy,/<small>CORE<\/small>/);
});
