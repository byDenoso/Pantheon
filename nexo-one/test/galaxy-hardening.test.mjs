import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const text=path=>readFile(new URL(path,root),'utf8');

test('canvas failure degrades to a keyboard-operable textual entity list',async()=>{
  const [canvas,styles]=await Promise.all([
    text('src/components/CanvasGraph25D.tsx'),
    text('src/components/CanvasGraph25D.css'),
  ]);
  assert.match(canvas,/setCanvasFailed\(true\)/);
  assert.match(canvas,/canvas25d-fallback/);
  assert.match(canvas,/Visualização gráfica indisponível/);
  assert.match(canvas,/nodes\.slice\(0,200\)\.map/);
  assert.match(styles,/\.canvas25d-fallback/);
});

test('canvas respects reduced motion and exposes keyboard navigation',async()=>{
  const [canvas,styles]=await Promise.all([
    text('src/components/CanvasGraph25D.tsx'),
    text('src/components/CanvasGraph25D.css'),
  ]);
  assert.match(canvas,/prefers-reduced-motion/);
  assert.match(canvas,/tabIndex=\{0\}/);
  assert.match(canvas,/event\.key==='Home'/);
  assert.match(canvas,/event\.key==='ArrowLeft'/);
  assert.match(styles,/@media\(prefers-reduced-motion:reduce\)/);
});

test('production workflow retains last deployed site when a scheduled build fails before deploy',async()=>{
  const workflow=await text('../.github/workflows/nexo-one-pages.yml');
  const build=workflow.indexOf('jobs:\n  build:');
  const deploy=workflow.indexOf('\n  deploy:');
  const upload=workflow.indexOf('actions/upload-pages-artifact@v4');
  assert.ok(build>=0&&deploy>build&&upload>build&&upload<deploy);
  assert.match(workflow,/deploy:\n    needs: build/);
  assert.match(workflow,/cancel-in-progress: true/);
});

test('Atlas prefers the published versioned snapshot and exposes freshness without blocking the galaxy',async()=>{
  const [atlas,hook,styles]=await Promise.all([
    text('src/features/system/Atlas.tsx'),
    text('src/data/useGalaxySnapshot.ts'),
    text('src/styles/nexo-prime.css'),
  ]);
  assert.match(atlas,/useGalaxySnapshot\(state\)/);
  assert.match(atlas,/galaxySnapshotAgeLabel\(galaxySnapshot\.generated_at\)/);
  assert.match(hook,/loadGalaxySnapshot\(\{ signal: controller\.signal, fallback \}\)/);
  assert.match(hook,/setPublished\(selectCompatibleGalaxySnapshot\(snapshot, fallback, state\.bus\.fingerprint\)\)/);
  assert.match(styles,/\.atlas-snapshot-age/);
  assert.match(atlas,/freshness-\$\{galaxyState\.freshness\.toLowerCase\(\)\}/);
});
