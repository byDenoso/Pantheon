// Paired, source-pinned production-build comparison. No production source is injected.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { verifySceneSourcePin } from './scene-source-pin.mjs';
import { labVisualFixture } from './lab-visual-fixture.mjs';
import { buildPagesProjection } from '../scripts/build-pages-system.mjs';

const output = 'test-output/scene-ab';
await mkdir(output, { recursive: true });
const baselineDir = process.env.NEXO_AB_BASELINE_DIR;
const candidateDir = process.env.NEXO_AB_CANDIDATE_DIR;
const baselineSha = process.env.NEXO_AB_BASELINE_SHA;
const candidateSha = process.env.NEXO_AB_CANDIDATE_SHA;
assert.ok(baselineDir && candidateDir, 'isolated source directories required');
const baselinePin = verifySceneSourcePin(baselineDir, baselineSha, 'baseline');
const candidatePin = verifySceneSourcePin(candidateDir, candidateSha, 'candidate');
assert.deepEqual(await readFile(resolve(baselineDir, 'package-lock.json')), await readFile('package-lock.json'), 'same baseline dependency lock');
assert.deepEqual(await readFile(resolve(candidateDir, 'package-lock.json')), await readFile('package-lock.json'), 'same candidate dependency lock');
const projection = labVisualFixture();
// Only synthetic input is used; both variants receive this exact in-memory object.
const { system } = buildPagesProjection({ projection, manifestFile: projection.manifest });
const inputHash = createHash('sha256').update(JSON.stringify(system)).digest('hex');
const baselineScene = await readFile(resolve(baselineDir, 'src/features/lab/ObservatoryScene.tsx'), 'utf8');
const candidateScene = await readFile(resolve(candidateDir, 'src/features/lab/ObservatoryScene.tsx'), 'utf8');
const section = (source, begin, end) => source.slice(source.indexOf(begin), source.indexOf(end, source.indexOf(begin)));
for (const [begin, end] of [
  ['const SHOTS:', '// Física de brinquedo'], ['const VERT =', '/** Qualidade gráfica'],
  ['    // --- Estrutura:', '    // Guarda de fluidez:'],
  ['    // Controles (como nos grafos)', '    // Rótulos dos domínios'],
]) assert.equal(section(candidateScene, begin, end), section(baselineScene, begin, end), 'visual source must remain identical');

const servers = [];
const browserArgs = process.env.CHROMIUM_EXECUTABLE ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
let browser;
const records = [];
const report = { schema: 'NEXO_SCENE_PAIRED_AB_V1', baselineSha, candidateSha,
  compiledSources: { baseline: baselinePin, candidate: candidatePin },
  checkoutSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  baselinePublishedReadbackRun: 37044218190, inputHash, syntheticInput: true,
  build: 'production Vite build, same local host, dependencies and server',
  protocol: { seed: 20261002, repetitions: 3, orders: ['AB', 'BA', 'AB'],
    idleMs: 4000, rotationMs: 6000, minimumIntervalsForPair: 30,
    jankThresholdMs: 50, gapAt60HzThresholdMs: 25,
    interaction: 'trusted browser pointer down/up with the same time-based synthetic move trajectory, applied once per animation frame',
    eligibility: 'matching effective renderer, geometry, viewport, DPR and constant effective quality; >=30 intervals per phase; no page errors',
  },
  limits: ['Headless runner is not user hardware or an iOS device.',
    'Submitted WebGL frame intervals are not GPU completion/presentation timestamps.',
    'CPU callback time includes camera/render submission/labels; it does not identify GPU duration.',
    'Pairs that adapt to different quality or provide too few samples cannot support a speedup claim.',
    'Three repetitions are exploratory, not a statistical acceptance test; p95 with fewer than 100 intervals is sparse.'],
  records, pairs: [],
};
const distribution = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const q = fraction => sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? null;
  return { p50: q(.5), p95: q(.95), p99: q(.99) };
};
const profiles = [
  { name: 'desktop-low', width: 1440, height: 900, quality: 'low' },
  { name: 'mobile-low', width: 390, height: 844, quality: 'low' },
  { name: 'quality-cost-low', width: 800, height: 600, quality: 'low' },
  { name: 'quality-cost-high', width: 800, height: 600, quality: 'high' },
];

async function startServer(label, cwd, port) {
  const child = spawn(process.execPath, ['scripts/dev.mjs', '--built'], {
    cwd, env: { ...process.env, PORT: String(port), VITE_SYSTEM_SOURCE: 'remote' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const lines = [];
  child.stdout.on('data', data => lines.push(String(data)));
  child.stderr.on('data', data => lines.push(String(data)));
  servers.push({ child, label, lines });
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null) throw new Error(label + ': server exited');
    try { if ((await fetch('http://127.0.0.1:' + port + '/')).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(label + ': server did not start');
}

try {
  await startServer('baseline', baselineDir, 4181);
  await startServer('candidate', candidateDir, 4182);
  console.log('SCENE_AB_SOURCE_PINS ' + JSON.stringify({ compiledSources: report.compiledSources, ciMergeCheckoutSha: report.checkoutSha }));
  browser = await chromium.launch({ headless: true, args: browserArgs,
    ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  report.browserVersion = browser.version();
  report.launchFlags = browserArgs;
  report.os = process.platform;
  for (const profile of profiles) for (let repeat = 0; repeat < 3; repeat++) {
    const variants = repeat % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate'];
    for (const variant of variants) {
      const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height },
        deviceScaleFactor: 1, isMobile: profile.width < 760, hasTouch: profile.width < 760, reducedMotion: 'no-preference' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(({ quality, seed }) => {
        localStorage.setItem('nexo-theme', 'dark');
        localStorage.setItem('nexo.intro.seen', '1');
        localStorage.setItem('nexo.legend.seen', '1');
        localStorage.setItem('nexo.quality', quality);
        let randomState = seed;
        Math.random = () => {
          randomState |= 0; randomState = randomState + 0x6D2B79F5 | 0;
          let n = Math.imul(randomState ^ randomState >>> 15, 1 | randomState);
          n = n + Math.imul(n ^ n >>> 7, 61 | n) ^ n;
          return ((n ^ n >>> 14) >>> 0) / 4294967296;
        };
        const probe = window.__sceneAB = { phase: null, frames: [], uploads: [], uploadPromises: [],
          captureGeometry: true, totalFrames: 0, canvases: new Set(), longTasks: [], inputTrace: [] };
        document.addEventListener('pointerdown', event => { probe.pointerId = event.pointerId; }, true);
        let activeAt = null;
        const raf = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = callback => raf(at => {
          const previous = activeAt; activeAt = at;
          const started = performance.now(), count = probe.frames.length;
          try { callback(at); } finally {
            if (probe.frames.length > count) probe.frames.at(-1).cpuCallbackMs = performance.now() - started;
            activeAt = previous;
          }
        });
        // Reset at renderer creation so unrelated React bootstrap random calls
        // cannot change the scene's particle realization between bundles.
        let rendererSeeded = false;
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
          const result = getContext.call(this, kind, ...args);
          if (result && /^webgl/.test(kind) && !rendererSeeded) {
            randomState = seed; rendererSeeded = true;
          }
          return result;
        };
        const seen = new WeakSet();
        const draw = gl => {
          if (activeAt === null || !gl.canvas.closest?.('.obs-scene')) return;
          probe.canvases.add(gl.canvas);
          if (probe.lastAt !== activeAt) { probe.totalFrames++; probe.lastAt = activeAt; }
          if (!probe.phase) return;
          let record = probe.frames.at(-1);
          if (!record || record.at !== activeAt) {
            const host = gl.canvas.closest('.obs-scene');
            const ext = gl.getExtension('WEBGL_debug_renderer_info');
            probe.environment ??= { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable',
              vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : 'unavailable',
              glVersion: gl.getParameter(gl.VERSION), userAgent: navigator.userAgent,
              hardwareConcurrency: navigator.hardwareConcurrency, viewport: [innerWidth, innerHeight],
              devicePixelRatio, headless: true };
            record = { at: activeAt, phase: probe.phase, drawCalls: 0, cpuCallbackMs: null,
              quality: host.dataset.quality, drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight] };
            probe.frames.push(record);
          }
          record.drawCalls++;
        };
        for (const Constructor of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
          if (!Constructor) continue;
          const proto = Constructor.prototype;
          for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
            if (!Object.hasOwn(proto, name)) continue;
            const original = proto[name];
            proto[name] = function (...args) { draw(this); return original.apply(this, args); };
          }
          if (!Object.hasOwn(proto, 'bufferData')) continue;
          const original = proto.bufferData;
          proto.bufferData = function (target, data, ...args) {
            if (probe.captureGeometry && this.canvas.closest?.('.obs-scene') && ArrayBuffer.isView(data)) {
              const binding = target === this.ARRAY_BUFFER ? this.ARRAY_BUFFER_BINDING : this.ELEMENT_ARRAY_BUFFER_BINDING;
              const buffer = this.getParameter(binding);
              if (buffer && !seen.has(buffer)) {
                seen.add(buffer);
                const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice();
                probe.uploadPromises.push(crypto.subtle.digest('SHA-256', bytes).then(hash => {
                  probe.uploads.push({ bytes: bytes.length, hash: [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join('') });
                }));
              }
            }
            return original.call(this, target, data, ...args);
          };
        }
        probe.observer = new PerformanceObserver(list => probe.longTasks.push(...list.getEntries().map(x => ({ at: x.startTime, duration: x.duration }))));
        probe.observer.observe({ type: 'longtask' });
      }, { quality: profile.quality, seed: report.protocol.seed });
      await page.route('**/api/session', route => route.fulfill({ json: { configured: false, authenticated: false } }));
      let inputReads = 0;
      await page.route('**/api/system*', route => { inputReads++; return route.fulfill({ json: system }); });
      await page.route('**/build-meta.json*', route => route.fulfill({ json: { projection_fingerprint: projection.manifest.projection_fingerprint } }));
      await page.goto('http://127.0.0.1:' + (variant === 'baseline' ? 4181 : 4182) + '/#/agora');
      await page.locator('.obs-scene canvas').waitFor();
      await page.evaluate(() => document.fonts.ready);
      assert.ok(inputReads > 0, 'compiled source must consume the shared controlled System input');
      await page.waitForFunction(() => window.__sceneAB.totalFrames >= 2, null, { timeout: 60_000 });
      await page.waitForTimeout(1000);
      const geometry = await page.evaluate(async () => {
        const probe = window.__sceneAB;
        probe.captureGeometry = false;
        await Promise.all(probe.uploadPromises);
        return [...probe.uploads].sort((a, b) => a.hash.localeCompare(b.hash));
      });
      const geometryHash = createHash('sha256').update(JSON.stringify(geometry)).digest('hex');
      const phases = [];
      for (const phase of ['idle', 'rotation']) {
        if (phase === 'rotation') {
          await page.getByRole('button', { name: 'Explorar a teia' }).click();
          await page.waitForTimeout(1000);
        }
        if (phase === 'rotation') {
          await page.mouse.move(profile.width * .5, profile.height * .66);
          await page.mouse.down();
          assert.ok(await page.evaluate(() => document.querySelector('.obs-scene canvas').hasPointerCapture(window.__sceneAB.pointerId)), 'rotation must begin on the captured scene pointer');
        }
        const sample = await page.evaluate(async ({ phase, duration }) => {
          const probe = window.__sceneAB, canvas = document.querySelector('.obs-scene canvas');
          const started = performance.now();
          probe.phase = phase; probe.frames = []; probe.inputTrace = [];
          const point = elapsed => ({ x: innerWidth * (.5 + .18 * Math.sin(elapsed / 700)), y: innerHeight * (.6 + .06 * Math.cos(elapsed / 700)) });
          const dispatch = (type, elapsed) => {
            const p = point(elapsed);
            canvas.dispatchEvent(new PointerEvent(type, { pointerId: probe.pointerId, pointerType: 'mouse', isPrimary: true,
              button: 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, clientX: p.x, clientY: p.y }));
            probe.inputTrace.push({ type, elapsed, ...p });
          };
          await new Promise(resolve => {
            const tick = () => {
              const elapsed = performance.now() - started;
              if (elapsed >= duration) { resolve(); return; }
              if (phase === 'rotation') dispatch('pointermove', elapsed);
              requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          });
          const ended = performance.now();
          probe.phase = null;
          return { started, ended, frames: [...probe.frames], inputTrace: [...probe.inputTrace],
            longTasks: probe.longTasks.filter(x => x.at >= started && x.at < ended),
            environment: probe.environment, canvasCount: probe.canvases.size };
        }, { phase, duration: phase === 'idle' ? 4000 : 6000 });
        if (phase === 'rotation') await page.mouse.up();
        const intervals = sample.frames.slice(1).map((frame, i) => frame.at - sample.frames[i].at);
        const span = sample.frames.length > 1 ? sample.frames.at(-1).at - sample.frames[0].at : null;
        const summary = { phase, intervals: intervals.length, measuredFps: span ? intervals.length * 1000 / span : null,
          frameMs: distribution(intervals), cpuCallbackMs: distribution(sample.frames.map(x => x.cpuCallbackMs).filter(x => x !== null)),
          jank50Fraction: intervals.length ? intervals.filter(x => x > 50).length / intervals.length : null,
          gap25Fraction: intervals.length ? intervals.filter(x => x > 25).length / intervals.length : null,
          qualities: [...new Set(sample.frames.map(x => x.quality))],
          drawingBuffers: [...new Set(sample.frames.map(x => x.drawingBuffer.join('x')))],
          longTasks: sample.longTasks, drawCalls: distribution(sample.frames.map(x => x.drawCalls)),
          actualWindowMs: sample.ended - sample.started, sampledSpanMs: span,
          environment: sample.environment, canvasCount: sample.canvasCount,
          rawFrames: sample.frames, inputTrace: sample.inputTrace };
        phases.push(summary);
        console.log('SCENE_AB ' + JSON.stringify({ profile: profile.name, repeat, variant, geometryHash, ...summary, rawFrames: undefined, inputTrace: undefined }));
      }
      records.push({ profile, repeat, variant, order: variants.join(' -> '), geometryHash, geometryBufferCount: geometry.length, inputReads, phases, errors });
      assert.deepEqual(errors, [], 'no page errors');
      await context.close();
    }
    const pair = records.slice(-2);
    const baseline = pair.find(x => x.variant === 'baseline'), candidate = pair.find(x => x.variant === 'candidate');
    for (const phase of ['idle', 'rotation']) {
      const a = baseline.phases.find(x => x.phase === phase), b = candidate.phases.find(x => x.phase === phase);
      const reasons = [];
      if (baseline.geometryHash !== candidate.geometryHash || !baseline.geometryBufferCount || !candidate.geometryBufferCount) reasons.push('GEOMETRY_MISMATCH');
      if (JSON.stringify(a.environment) !== JSON.stringify(b.environment) || a.environment?.renderer === 'unavailable') reasons.push('ENVIRONMENT_UNVERIFIED');
      if (JSON.stringify(a.drawingBuffers) !== JSON.stringify(b.drawingBuffers)) reasons.push('DRAWING_BUFFER_MISMATCH');
      if (a.qualities.length !== 1 || b.qualities.length !== 1 || a.qualities[0] !== b.qualities[0] || a.qualities[0] !== profile.quality) reasons.push('QUALITY_CHANGED');
      if (a.intervals < 30 || b.intervals < 30) reasons.push('INSUFFICIENT_INTERVALS');
      if (a.canvasCount !== 1 || b.canvasCount !== 1) reasons.push('SCENE_REMOUNTED');
      const comparison = { profile: profile.name, repeat, phase, eligible: reasons.length === 0, reasons,
        baselineFps: a.measuredFps, candidateFps: b.measuredFps,
        candidateToBaselineFps: reasons.length ? null : b.measuredFps / a.measuredFps,
        baselineP95Ms: a.frameMs.p95, candidateP95Ms: b.frameMs.p95 };
      report.pairs.push(comparison);
      console.log('SCENE_AB_PAIR ' + JSON.stringify(comparison));
    }
  }
  report.summary = profiles.flatMap(profile => ['idle', 'rotation'].map(phase => {
    const pairs = report.pairs.filter(pair => pair.profile === profile.name && pair.phase === phase);
    const complete = pairs.length === 3 && pairs.every(pair => pair.eligible);
    return { profile: profile.name, phase, allRepetitionsEligible: complete,
      eligiblePairs: pairs.filter(pair => pair.eligible).length, totalPairs: pairs.length,
      medianCandidateToBaselineFps: complete ? distribution(pairs.map(pair => pair.candidateToBaselineFps)).p50 : null,
      inference: complete ? 'Exploratory paired ratio; no confidence interval or user-device claim.' : 'INCONCLUSIVE: no aggregate from selectively retained pairs.' };
  }));
  console.log('SCENE_AB_SUMMARY ' + JSON.stringify(report.summary));
} finally {
  for (const { child, label, lines } of servers) {
    child.kill('SIGTERM');
    await writeFile(output + '/' + label + '-server.log', lines.join(''));
  }
  await browser?.close();
  await writeFile(output + '/comparison.json', JSON.stringify(report, null, 2));
}
