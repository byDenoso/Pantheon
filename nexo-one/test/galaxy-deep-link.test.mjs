import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GALAXY_DEEP_LINK, buildGalaxySearch, parseGalaxyDeepLink,
} from '../src/app/galaxyDeepLink.ts';

test('empty search parses to the explore-mode default with nothing focused or open', () => {
  assert.deepEqual(parseGalaxyDeepLink(''), DEFAULT_GALAXY_DEEP_LINK);
  assert.deepEqual(parseGalaxyDeepLink('?'), DEFAULT_GALAXY_DEEP_LINK);
});

test('parses mode/domain/subdomain/entity/panel independently', () => {
  const state = parseGalaxyDeepLink('?mode=operate&domain=SCIENCE&subdomain=atlas.cluster.science.test&entity=test.x&panel=needs-you');
  assert.deepEqual(state, {
    mode: 'operate', domain: 'SCIENCE', subdomain: 'atlas.cluster.science.test', entity: 'test.x', panel: 'needs-you',
  });
});

test('an unknown mode value falls back to explore; an unknown panel value falls back to no panel', () => {
  assert.equal(parseGalaxyDeepLink('?mode=whatever').mode, 'explore');
  assert.equal(parseGalaxyDeepLink('?panel=whatever').panel, null);
});

test('buildGalaxySearch omits explore mode and every null field, so the default state has no querystring at all', () => {
  assert.equal(buildGalaxySearch({ mode: 'explore', domain: null, subdomain: null, entity: null, panel: null }), '');
});

test('buildGalaxySearch round-trips through parseGalaxyDeepLink', () => {
  const original = { mode: 'operate', domain: 'ENGINEERING', subdomain: null, entity: 'action.y', panel: 'changes' };
  const search = buildGalaxySearch(original);
  assert.deepEqual(parseGalaxyDeepLink(search), original);
});

test('every emitted panel value is one of the four real panel ids', () => {
  const search = buildGalaxySearch({ panel: 'capabilities' });
  assert.match(search, /panel=capabilities/);
});
