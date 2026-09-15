import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');
const exists=path=>fs.existsSync(new URL(path,root));

test('Atlas V3 exposes persisted light dark and system theme modes',()=>{
  const app=read('src/atlas-v3/AtlasV3App.tsx');
  assert.match(app,/ThemeMode/);
  assert.match(app,/data-theme=\{resolvedTheme\}/);
  assert.match(app,/atlas-v3-theme/);
  assert.match(app,/aria-label="Tema do Atlas"/);
  assert.match(app,/system/);
  assert.equal(exists('src/atlas-v3/atlas-v3-theme.css'),true);
  const theme=read('src/atlas-v3/atlas-v3-theme.css');
  assert.match(theme,/\[data-theme="light"\]/);
  assert.match(theme,/color-scheme:light/);
  assert.match(theme,/--bg:#f7faff/);
});

test('Atlas V3 canvas presentation is wider and deliberately shallow',()=>{
  const layout=read('src/scene/types.ts');
  assert.match(layout,/CANVAS_LAYOUT_SPREAD\s*=\s*1\.3/);
  assert.match(layout,/CANVAS_DEPTH_SCALE\s*=\s*0\.28/);
  const canvas=read('src/scene/AtlasCanvas.tsx');
  assert.match(canvas,/presentationMode\?:'spatial'\|'canvas'/);
  assert.match(canvas,/minPolarAngle/);
  assert.match(canvas,/maxPolarAngle/);
  assert.match(canvas,/minAzimuthAngle/);
  assert.match(canvas,/maxAzimuthAngle/);
  const app=read('src/atlas-v3/AtlasV3App.tsx');
  assert.match(app,/presentationMode="canvas"/);
});

test('light theme reaches the WebGL scene rather than recoloring only DOM chrome',()=>{
  const canvas=read('src/scene/AtlasCanvas.tsx');
  assert.match(canvas,/theme\?:'dark'\|'light'/);
  assert.match(canvas,/theme===['"]light['"]/);
  assert.match(canvas,/StarField/);
  assert.match(canvas,/OrbitalGuides/);
  const app=read('src/atlas-v3/AtlasV3App.tsx');
  assert.match(app,/theme=\{resolvedTheme\}/);
});
