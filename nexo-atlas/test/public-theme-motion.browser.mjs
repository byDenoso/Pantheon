// Public theme/motion replay on the real Vite entry with a synthetic catalog.
// No private source, identity, live data, or media uploads are used.
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {chromium} from 'playwright';
import {startStudyServer} from './helpers/public-study-server.mjs';

const output = process.env.PUBLIC_THEME_QA_OUTPUT ? resolve(process.env.PUBLIC_THEME_QA_OUTPUT) : null;
const browserPath = process.env.CHROMIUM_PATH || process.env.CHROMIUM_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const site = await startStudyServer();
const browser = await chromium.launch({headless: true, executablePath: browserPath, args: ['--no-sandbox']});
const report = {notice: site.notice, checks: [], errors: [], browserPath};

if (output) await mkdir(output, {recursive: true});

async function open({width, theme, reducedMotion = 'no-preference'}) {
  const touch = width <= 430;
  const context = await browser.newContext({viewport: {width, height: touch ? 844 : 900}, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch, colorScheme: theme, reducedMotion, locale: 'en-US'});
  await context.addInitScript(({theme}) => {
    localStorage.setItem('atlas.theme', theme);
    localStorage.setItem('atlas.locale', 'en');
    sessionStorage.setItem('nexo-motion-paused', 'false');
  }, {theme});
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => report.errors.push(`${width}/${theme}/${reducedMotion}: ${error.message}`));
  await page.goto(site.origin, {waitUntil: 'domcontentloaded'});
  await page.locator('.nexo-cosmic-backdrop .nexo-cosmic-image').waitFor();
  await page.waitForFunction(() => {
    const image = document.querySelector('.nexo-cosmic-backdrop .nexo-cosmic-image');
    return image?.complete && image.naturalWidth > 0;
  });
  return {page, context};
}

const readArt = page => page.evaluate(() => {
  const root = document.querySelector('.atlas-app[data-area="public"]');
  const backdrop = root?.querySelector('.nexo-cosmic-backdrop');
  const image = backdrop?.querySelector('.nexo-cosmic-image');
  const style = image ? getComputedStyle(image) : null;
  const matrix = style ? new DOMMatrixReadOnly(style.transform) : null;
  return {
    theme: document.documentElement.dataset.theme,
    illustration: backdrop?.getAttribute('data-illustration'),
    paused: root?.getAttribute('data-cinema-paused'),
    src: image?.currentSrc || '',
    videos: backdrop?.querySelectorAll('video').length ?? 0,
    animationName: style?.animationName ?? '',
    animationPlayState: style?.animationPlayState ?? '',
    transform: style?.transform ?? '',
    matrix: matrix ? {a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d, e: matrix.e, f: matrix.f} : null,
  };
});

const openMenu = async page => {
  const toggle = page.locator('.atlas-menu-toggle');
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
};
const chooseTheme = async (page, theme) => {
  await openMenu(page);
  await page.getByRole('group', {name: 'Theme'}).getByRole('button', {name: theme === 'light' ? 'Light' : 'Dark', exact: true}).click();
  await page.waitForFunction(expected => document.documentElement.dataset.theme === expected && document.querySelector('.nexo-cosmic-backdrop')?.getAttribute('data-illustration') === (expected === 'light' ? 'cmb' : 'cosmic-expansion'), theme);
};
const setPause = async (page, paused) => {
  await openMenu(page);
  const label = paused ? 'Pause animation' : 'Play animation';
  await page.getByRole('button', {name: label, exact: true}).click();
  await page.waitForFunction(expected => document.querySelector('.atlas-app[data-area="public"]')?.getAttribute('data-cinema-paused') === String(expected), paused);
  await page.waitForFunction(expected => getComputedStyle(document.querySelector('.nexo-cosmic-backdrop .nexo-cosmic-image')).animationPlayState === (expected ? 'paused' : 'running'), paused);
};

async function check(name, run) {
  try {
    const evidence = await run();
    report.checks.push({name, status: 'PASS', evidence});
    console.log(`PASS ${name}`);
  } catch (error) {
    report.checks.push({name, status: 'FAIL', error: error.stack || error.message});
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

try {
  for (const width of [390, 1280]) {
    await check(`dark expansion animates without rotation and pause/resume repeats at ${width}px`, async () => {
      const {page, context} = await open({width, theme: 'dark'});
      try {
        const before = await readArt(page);
        assert.equal(before.theme, 'dark');
        assert.equal(before.illustration, 'cosmic-expansion');
        assert.ok(before.src.includes('expansion-dark-v1'), before.src);
        assert.equal(before.videos, 0, 'the active backdrop is the existing image, not a new MP4');
        assert.equal(before.animationName, 'nexo-image-stretch');
        assert.equal(before.animationPlayState, 'running');
        assert.ok(Math.abs(before.matrix.b) < 1e-6 && Math.abs(before.matrix.c) < 1e-6, 'the image scale has no rotation');
        await page.waitForTimeout(700);
        const moved = await readArt(page);
        assert.notEqual(moved.transform, before.transform, 'the active dark illustration changes scale over time');
        assert.ok(Math.abs(moved.matrix.b) < 1e-6 && Math.abs(moved.matrix.c) < 1e-6, 'the changed frame still has no rotation');

        const pauseCycles = [];
        for (let index = 0; index < 2; index++) {
          await setPause(page, true);
          const frozen = await readArt(page);
          await page.waitForTimeout(250);
          const stillFrozen = await readArt(page);
          assert.equal(stillFrozen.transform, frozen.transform, `pause cycle ${index + 1} holds the rendered scale`);
          await setPause(page, false);
          const resumed = await readArt(page);
          await page.waitForTimeout(350);
          const continued = await readArt(page);
          assert.notEqual(continued.transform, resumed.transform, `resume cycle ${index + 1} continues the scale animation`);
          pauseCycles.push({cycle: index + 1, pausedTransform: frozen.transform, resumedTransform: resumed.transform, continuedTransform: continued.transform});
        }

        await chooseTheme(page, 'light');
        const cmbBefore = await readArt(page);
        assert.equal(cmbBefore.illustration, 'cmb');
        assert.ok(cmbBefore.src.includes('cmb-light-v1'), cmbBefore.src);
        assert.equal(cmbBefore.animationName, 'none');
        assert.ok(Math.abs(cmbBefore.matrix.b) < 1e-6 && Math.abs(cmbBefore.matrix.c) < 1e-6, 'the CMB has no rotation');
        assert.ok(Math.abs(cmbBefore.matrix.a - 1.12) < 0.001 && Math.abs(cmbBefore.matrix.d - 1.12) < 0.001, JSON.stringify(cmbBefore.matrix));
        await page.waitForTimeout(700);
        const cmbAfter = await readArt(page);
        assert.equal(cmbAfter.transform, cmbBefore.transform, 'the light CMB stays fixed without drift');

        await chooseTheme(page, 'dark');
        const darkAgain = await readArt(page);
        assert.equal(darkAgain.animationName, 'nexo-image-stretch');
        assert.equal(darkAgain.animationPlayState, 'running');
        return {width, firstDarkTransform: before.transform, laterDarkTransform: moved.transform, pauseCycles, lightCmbTransform: cmbBefore.transform, darkResumed: darkAgain.animationName};
      } finally { await context.close(); }
    });

    await check(`reduced motion leaves dark expansion and light CMB static at ${width}px`, async () => {
      const {page, context} = await open({width, theme: 'dark', reducedMotion: 'reduce'});
      try {
        assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
        const darkBefore = await readArt(page);
        assert.equal(darkBefore.illustration, 'cosmic-expansion');
        assert.equal(darkBefore.animationName, 'none');
        await page.waitForTimeout(450);
        const darkAfter = await readArt(page);
        assert.equal(darkAfter.transform, darkBefore.transform, 'reduced motion holds the dark art static');
        await chooseTheme(page, 'light');
        const lightBefore = await readArt(page);
        assert.equal(lightBefore.illustration, 'cmb');
        assert.equal(lightBefore.animationName, 'none');
        await page.waitForTimeout(450);
        const lightAfter = await readArt(page);
        assert.equal(lightAfter.transform, lightBefore.transform, 'reduced motion holds the CMB static');
        return {width, reducedMotion: true, darkTransform: darkBefore.transform, lightTransform: lightBefore.transform};
      } finally { await context.close(); }
    });
  }
} finally {
  await browser.close();
  await site.close();
  if (output) await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
}

const failed = report.checks.filter(check => check.status === 'FAIL');
assert.deepEqual(report.errors, [], report.errors.join('\n'));
console.log(`${failed.length ? 'FAIL' : 'PASS'}: ${report.checks.length - failed.length}/${report.checks.length} public theme/motion browser checks; synthetic catalog only.`);
if (failed.length) process.exit(1);
