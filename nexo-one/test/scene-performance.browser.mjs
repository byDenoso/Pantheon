// Real-clock rendered-frame measurements. CI SwiftShader is not the user's GPU.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { labVisualFixture } from './lab-visual-fixture.mjs';
import { buildPagesProjection } from '../scripts/build-pages-system.mjs';
const base = process.env.NEXO_BASE_URL || 'http://127.0.0.1:4178';
const output = 'test-output/scene-performance';
await mkdir(output, { recursive: true });
const input = process.env.NEXO_PUBLIC_PROJECTION_INPUT;
const projection = input ? JSON.parse(await readFile(input, 'utf8')) : labVisualFixture();
const { system } = buildPagesProjection({ projection, manifestFile: projection.manifest });
const software = !process.env.CHROMIUM_EXECUTABLE;
const browser = await chromium.launch({ headless: true,
  ...(software ? {} : { executablePath: process.env.CHROMIUM_EXECUTABLE }),
  args: ['--no-sandbox', ...(software ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [])] });
const reports = [];
const distribution = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const at = p => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? null;
  return { p50: at(.5), p95: at(.95), p99: at(.99) };
};
try {
  for (const [name, width, height, theme, quality] of [
    ['desktop-auto', 1440, 900, 'dark', null],
    ['mobile-auto', 390, 844, 'dark', null],
    ['mobile-light', 390, 844, 'light', null],
    ['manual-high', 800, 600, 'dark', 'high'],
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1,
      isMobile: width < 760, hasTouch: width < 760, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ theme, quality }) => {
      localStorage.setItem('nexo-theme', theme);
      localStorage.setItem('nexo.intro.seen', '1');
      localStorage.setItem('nexo.legend.seen', '1');
      if (quality) localStorage.setItem('nexo.quality', quality); else localStorage.removeItem('nexo.quality');
    }, { theme, quality });
    await page.route('**/api/session', route => route.fulfill({ json: { configured: false, authenticated: false } }));
    await page.route('**/api/system*', route => route.fulfill({ json: system }));
    await page.route('**/build-meta.json*', route => route.fulfill({ json: { projection_fingerprint: projection.manifest.projection_fingerprint } }));
    await page.goto(base + '/#/agora');
    await page.locator('.obs-scene canvas').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(2000);
    const environment = await page.evaluate(() => {
      const canvas = document.querySelector('.obs-scene canvas');
      const gl = canvas.getContext('webgl2');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return { userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency,
        viewport: [innerWidth, innerHeight], devicePixelRatio,
        renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable',
        drawingBuffer: gl ? [gl.drawingBufferWidth, gl.drawingBufferHeight] : null };
    });
    const phases = [];
    for (const phase of ['idle', 'rotation']) {
      if (phase === 'rotation') {
        await page.getByRole('button', { name: 'Explorar a teia' }).click();
        await page.waitForTimeout(1000);
      }
      await page.evaluate(() => {
        window.frameSamples = [];
        window.longTasks = [];
        window.frameListener = event => window.frameSamples.push(event.detail);
        window.addEventListener('nexo:frame', window.frameListener);
        window.longTaskObserver = new PerformanceObserver(list => {
          window.longTasks.push(...list.getEntries().map(entry => ({ startTime: entry.startTime, duration: entry.duration })));
        });
        window.longTaskObserver.observe({ type: 'longtask' });
        window.dispatchEvent(new CustomEvent('nexo:measure-frames', { detail: true }));
      });
      if (phase === 'rotation') {
        await page.mouse.move(width * .5, height * .6);
        await page.mouse.down();
        for (let step = 0; step < 80; step++) {
          await page.mouse.move(width * (.5 + .2 * Math.sin(step / 10)), height * (.6 + .08 * Math.cos(step / 10)));
          await page.waitForTimeout(50);
        }
        await page.mouse.up();
      } else await page.waitForTimeout(4000);
      const sample = await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('nexo:measure-frames', { detail: false }));
        window.removeEventListener('nexo:frame', window.frameListener);
        window.longTaskObserver.disconnect();
        return { frames: window.frameSamples, longTasks: window.longTasks };
      });
      assert.ok(sample.frames.length >= 2, name + ': actual render samples required');
      const frames = sample.frames.slice(1); // first interval crosses measurement boundary
      assert.ok(frames.every(frame => frame.targetFps === (phase === 'idle' ? 30 : 60)), name + ': interaction target');
      if (quality) assert.ok(frames.every(frame => frame.quality === quality && frame.qualityMode === 'manual'), 'manual quality must persist under load');
      if (phase === 'rotation') assert.ok(frames.some(frame => frame.interacting), 'real pointer rotation sampled');
      const elapsed = sample.frames.at(-1).at - sample.frames[0].at;
      const summary = { phase, samples: frames.length, measuredFps: frames.length * 1000 / elapsed,
        intervalMs: distribution(frames.map(frame => frame.intervalMs)),
        cpuSubmitMs: distribution(frames.map(frame => frame.cpuSubmitMs)),
        overlayMs: distribution(frames.map(frame => frame.overlayMs)),
        cpuTotalMs: distribution(frames.map(frame => frame.cpuTotalMs)),
        jankFraction: frames.filter(frame => frame.intervalMs > 1.5 * 1000 / frame.targetFps).length / frames.length,
        qualities: [...new Set(frames.map(frame => frame.quality))], renderDpr: [...new Set(frames.map(frame => frame.dpr))],
        longTasks: sample.longTasks, gpuDurationMs: null, rawFrames: frames };
      phases.push(summary);
      console.log(JSON.stringify({ profile: name, ...summary, rawFrames: undefined }));
    }
    assert.deepEqual(errors, []);
    reports.push({ name, theme, requestedQuality: quality ?? 'auto', environment, phases });
    await context.close();
  }
} finally {
  await writeFile(output + '/frames.json', JSON.stringify({
    schema: 'NEXO_SCENE_FRAME_MEASUREMENT_V1', measuredAt: new Date().toISOString(),
    execution: { os: process.platform, browser: browser.version(), headless: true, requestedSoftwareRendering: software },
    input: { synthetic: !input, projectionFingerprint: projection.manifest.projection_fingerprint },
    limits: ['Executor measurements are not user-device FPS.', 'CPU submission is not GPU completion; GPU timings unavailable.',
      'Mobile viewport emulation uses browser mouse input, not an iOS device.', 'Development server; no production speedup claim.'],
    reports,
  }, null, 2));
  await browser.close();
}
