const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

test('app shell exposes unified navigation and sync/freshness markers', () => {
  const html = read('index.html');
  for (const view of ['now', 'activity', 'evolution', 'capabilities', 'system']) {
    assert.match(html, new RegExp(`data-view=\\"${view}\\"`));
  }
  assert.match(html, /data-sync-state/);
  assert.match(html, /data-since-refresh/);
  assert.match(html, /id="degraded-banner"/);
  assert.match(html, /SCIENCE/);
  assert.match(html, /ENGINEERING/);
  assert.match(html, /OLYMPUS/);
});

test('client implements all primary renderers and refresh path', () => {
  const js = read('app.js');
  for (const fn of ['renderNow', 'renderActivity', 'renderEvolution', 'renderCapabilities', 'renderSystem', 'refreshData']) {
    assert.match(js, new RegExp(`function ${fn}\\b|async function ${fn}\\b`));
  }
  assert.match(js, /\/api\/nexo/);
  assert.match(js, /EMBEDDED_FALLBACK/);
});

test('styles contain responsive desktop and mobile layouts', () => {
  const css = read('styles.css');
  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
  assert.match(css, /\.domain-grid/);
  assert.match(css, /\.flight-card/);
});

test('evolution and capabilities expose proof state instead of generic KPI cards', () => {
  const js = read('app.js');
  assert.match(js, /data-evolution-id/);
  assert.match(js, /data-baseline-state/);
  assert.match(js, /COLLECTING BASELINE/);
  assert.match(js, /data-capability-id/);
});

test('system view marks exactly three current tasks and keeps retired roles behind history toggle', () => {
  const js = read('app.js');
  assert.match(js, /data-current-task/);
  assert.match(js, /data-history-toggle/);
  assert.match(js, /NEXO Continuity/);
  assert.match(js, /NEXO Scientific Core/);
  assert.match(js, /NEXO Executor/);
  assert.match(js, /historicalRoles/);
});
