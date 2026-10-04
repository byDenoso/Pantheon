import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const baseUrl = (process.env.NEXO_BASE_URL || 'http://127.0.0.1:4185').replace(/\/$/, '');
const atlasUrl = route => `${baseUrl}/?svgMirror=1#/${route}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const deadline = setTimeout(() => { console.error('SVG interaction run exceeded 180 seconds'); void browser.close(); }, 180000);
const results = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => { errors.push(error.stack || error.message); console.error(error.stack || error.message); });
  await page.goto(atlasUrl('agora'));
  const scene = page.locator('svg[data-tower-svg-native="observatory"][data-ready="true"]');
  await scene.waitFor();
  assert.equal(await page.locator('.obs-scene').getAttribute('data-physics-model-status'), 'TOY_MODEL');
  await page.waitForTimeout(1800);
  const paths = () => scene.locator('path').evaluateAll(nodes => nodes.map(node => node.getAttribute('d')));
  const frozen = await paths();
  await page.waitForTimeout(800);
  assert.deepEqual(await paths(), frozen, 'reduced motion freezes the actual vector geometry');
  results.push('Illustrative physics identified; reduced motion freezes vector geometry');

  // A label's own overflow box must follow it while the scene viewport stays fixed.
  await page.locator('.obs-scene-labels button').first().evaluate(node => { node.style.overflow = 'hidden'; });
  await page.waitForTimeout(400);
  await page.locator('.obs-scene-labels button').first().evaluate(node => { node.style.transform += ' translate(160px, 0px)'; });
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => {
    const surface = document.querySelector('svg[data-tower-svg-surface]');
    const label = document.querySelector('.obs-scene-labels button');
    const entry = surface.__towerLabels.get(label);
    return entry.groups.some(item => item.movingClips.length > 0) && entry.groups.every(item => item.movingClips.every(clip => clip.getAttribute('transform') === item.group.getAttribute('transform')));
  }), true, 'moving label retains its own clip at its new position');
  await page.locator('.obs-scene-labels button').first().evaluate(node => { node.style.overflow = ''; node.style.transform = node.style.transform.replace(' translate(160px, 0px)', ''); });
  results.push('Moving SVG label keeps its clipping box aligned');

  await page.getByRole('button', { name: 'Explorar a teia', exact: true }).click();
  await page.getByRole('button', { name: 'Aproximar câmera', exact: true }).click();
  await page.waitForTimeout(350);
  assert.notDeepEqual(await paths(), frozen, 'camera zoom changes projection');
  await page.getByRole('button', { name: 'Recentrar câmera', exact: true }).click();
  await page.getByRole('button', { name: 'Rever a formação da teia', exact: true }).click();
  await page.getByRole('button', { name: 'Voltar ao painel', exact: true }).click();
  results.push('Explore, camera zoom, recenter, replay and return controls work');

  await page.getByRole('button', { name: 'Procurar', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Procurar', exact: true });
  await dialog.getByRole('textbox').fill('DDEUDS26');
  const result = dialog.locator('li a').first();
  await result.waitFor();
  const href = await result.getAttribute('href');
  await result.click();
  await page.waitForURL(url => url.hash === href);
  await page.locator('.observatory[data-page="entidade"]').waitFor();
  await page.locator('svg[data-tower-svg-surface][data-ready="true"]').waitFor();
  assert.equal(await page.locator('foreignObject').count(), 0);
  results.push('SVG search opens a published entity and its evidence page');

  await page.goto(atlasUrl('atlas?view=galaxy'));
  await page.locator('svg[data-tower-svg-native="galaxy"][data-ready="true"]').waitFor();
  await page.goto(atlasUrl('atlas?view=2d'));
  await page.locator('svg[data-tower-svg-native="metro2d"][data-ready="true"]').waitFor();
  await page.goto(atlasUrl('atlas?view=3d'));
  await page.locator('svg[data-tower-svg-native="metro3d"][data-ready="true"]').waitFor();
  results.push('Galaxy / 2D / 3D route changes work without a document reload');
  assert.deepEqual(errors, []);
  await context.close();

  const live = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const livePage = await live.newPage();
  livePage.on('pageerror', error => errors.push(error.message));
  await livePage.goto(atlasUrl('agora'));
  const liveScene = livePage.locator('svg[data-tower-svg-native="observatory"][data-ready="true"]');
  await liveScene.waitFor();
  const before = await liveScene.locator('path').evaluateAll(nodes => nodes.map(node => node.getAttribute('d')));
  await livePage.waitForTimeout(900);
  const after = await liveScene.locator('path').evaluateAll(nodes => nodes.map(node => node.getAttribute('d')));
  assert.notDeepEqual(after, before, 'live scene evolves');
  results.push('Live vector scene evolves when reduced motion is disabled');
  const baseStride = await livePage.locator('.obs-scene').getAttribute('data-environment-stride');
  await livePage.getByRole('button', { name: 'Explorar a teia', exact: true }).click();
  await livePage.mouse.move(900, 440);
  await livePage.mouse.down();
  let peakStride = Number(baseStride);
  for (let n = 0; n < 16; n++) {
    await livePage.mouse.move(900 + n * 4, 440 + Math.sin(n * .3) * 20);
    await livePage.waitForTimeout(50);
    peakStride = Math.max(peakStride, Number(await livePage.locator('.obs-scene').getAttribute('data-environment-stride')));
  }
  await livePage.mouse.up();
  assert.ok(peakStride > Number(baseStride), 'heavy orbit adapts only environmental detail');
  await livePage.waitForFunction(stride => document.querySelector('.obs-scene').dataset.environmentStride === stride, baseStride, { timeout: 7000 });
  results.push('Environmental detail adapts during orbit and restores its original stride after settling');
  await livePage.emulateMedia({ reducedMotion: 'reduce' });
  await livePage.waitForTimeout(500);
  const changedPreference = await liveScene.locator('path').evaluateAll(nodes => nodes.map(node => node.getAttribute('d')));
  await livePage.waitForTimeout(800);
  assert.deepEqual(await liveScene.locator('path').evaluateAll(nodes => nodes.map(node => node.getAttribute('d'))), changedPreference, 'a live change of motion preference freezes the mounted scene');
  results.push('Changing reduced-motion preference freezes an already mounted scene');
  assert.deepEqual(errors, []);
  await live.close();
  console.log(results.join('\n'));
} finally {
  clearTimeout(deadline);
  await writeFile('output/galaxy-performance/tower-svg-interactions.json', JSON.stringify(results, null, 2));
  await browser.close();
}
