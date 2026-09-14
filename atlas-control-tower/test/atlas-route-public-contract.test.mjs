import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readAtlasRoute, routeFor, rewriteLegacyPublicPath, isPrivateArea, PUBLIC_PATH, normalizeGraphHydrationId } from '../src/atlas-route.ts';

test('normalizeGraphHydrationId uppercases a lowercase domain id, matching real node ids (regression)', () => {
  // Real repro: hydrating /mapa/system:SCIENCE/domain:d1 previously kept "domain:d1"
  // verbatim as the focus id while the real node is "domain:D1", breaking every
  // downstream id comparison and blowing up the 3D layout on screen.
  assert.equal(normalizeGraphHydrationId('domain:d1'), 'domain:D1');
  assert.equal(normalizeGraphHydrationId('DOMAIN:d10'), 'domain:D10');
  assert.equal(normalizeGraphHydrationId('domain:D1'), 'domain:D1');
});

test('normalizeGraphHydrationId leaves non-domain ids untouched', () => {
  assert.equal(normalizeGraphHydrationId('system:SCIENCE'), 'system:SCIENCE');
  assert.equal(normalizeGraphHydrationId('CAMP-H0-RULER-ANCHOR'), 'CAMP-H0-RULER-ANCHOR');
});

test('routeFor produces the canonical public paths from the locked route contract', () => {
  assert.equal(routeFor('graphs'), '/mapa');
  assert.equal(routeFor('observatory'), '/pesquisa');
  assert.equal(routeFor('universe'), '/pesquisa');
  assert.equal(routeFor('lab'), '/laboratorio');
  assert.equal(routeFor('cockpit'), '/cockpit');
  assert.equal(routeFor('atividade'), '/atividade');
  assert.equal(routeFor('login'), '/login');
  assert.equal(routeFor('landing'), '/');
});

test('routeFor keeps the /mapa/science/:domain shape for a domain-focused map route', () => {
  assert.equal(routeFor('graphs', { domain: 'D1' }), '/mapa/science/d1');
});

test('routeFor keeps an explicit graphPath under /mapa', () => {
  assert.equal(routeFor('graphs', { graphPath: ['science', 'd1', 'campaign:c1'] }), '/mapa/science/d1/campaign%3Ac1');
});

test('readAtlasRoute parses the new canonical prefixes back to the correct internal area', () => {
  assert.equal(readAtlasRoute({ pathname: '/mapa', search: '' }).area, 'graphs');
  assert.equal(readAtlasRoute({ pathname: '/pesquisa', search: '' }).area, 'observatory');
  assert.equal(readAtlasRoute({ pathname: '/laboratorio', search: '' }).area, 'lab');
  assert.equal(readAtlasRoute({ pathname: '/cockpit', search: '' }).area, 'cockpit');
  assert.equal(readAtlasRoute({ pathname: '/atividade', search: '' }).area, 'atividade');
  assert.equal(readAtlasRoute({ pathname: '/login', search: '' }).area, 'login');
});

test('readAtlasRoute still parses legacy prefixes so an old link never 404s', () => {
  assert.equal(readAtlasRoute({ pathname: '/graphs', search: '' }).area, 'graphs');
  assert.equal(readAtlasRoute({ pathname: '/observatory', search: '' }).area, 'observatory');
  assert.equal(readAtlasRoute({ pathname: '/universe', search: '' }).area, 'universe');
  assert.equal(readAtlasRoute({ pathname: '/lab', search: '' }).area, 'lab');
});

test('readAtlasRoute defaults an empty or unknown path to landing, not the map', () => {
  assert.equal(readAtlasRoute({ pathname: '/', search: '' }).area, 'landing');
  assert.equal(readAtlasRoute({ pathname: '/something-unknown', search: '' }).area, 'landing');
});

test('readAtlasRoute keeps deep domain context under the new /mapa/science/:domain shape', () => {
  const route = readAtlasRoute({ pathname: '/mapa/science/d3', search: '' });
  assert.equal(route.area, 'graphs');
  assert.equal(route.context.domain, 'D3');
});

test('rewriteLegacyPublicPath upgrades every legacy prefix and preserves the remaining path', () => {
  assert.equal(rewriteLegacyPublicPath('/graphs/science/d1'), '/mapa/science/d1');
  assert.equal(rewriteLegacyPublicPath('/observatory'), '/pesquisa');
  assert.equal(rewriteLegacyPublicPath('/universe'), '/pesquisa');
  assert.equal(rewriteLegacyPublicPath('/lab'), '/laboratorio');
});

test('rewriteLegacyPublicPath returns null for an already-canonical or unrelated path', () => {
  assert.equal(rewriteLegacyPublicPath('/mapa'), null);
  assert.equal(rewriteLegacyPublicPath('/cockpit'), null);
  assert.equal(rewriteLegacyPublicPath('/'), null);
});

test('isPrivateArea flags exactly cockpit, atividade and lab (laboratorio) as private', () => {
  assert.equal(isPrivateArea('cockpit'), true);
  assert.equal(isPrivateArea('atividade'), true);
  assert.equal(isPrivateArea('lab'), true);
  assert.equal(isPrivateArea('graphs'), false);
  assert.equal(isPrivateArea('observatory'), false);
  assert.equal(isPrivateArea('landing'), false);
  assert.equal(isPrivateArea('login'), false);
});

test('PUBLIC_PATH has no gaps: every AtlasArea maps to a defined string', () => {
  const areas = ['graphs', 'observatory', 'lab', 'universe', 'cockpit', 'atividade', 'login', 'landing'];
  for (const area of areas) assert.equal(typeof PUBLIC_PATH[area], 'string');
});
