import test from 'node:test';
import assert from 'node:assert/strict';
import { TOUR_ROUTES, TOUR_ROUTE_IDS, resolveTourAction, tourRouteById } from '../src/viewmodels/tour.ts';

test('exactly the seven routes the spec names exist, in order, each with a label and description', () => {
  assert.deepEqual(TOUR_ROUTE_IDS, [
    'SYSTEM_OVERVIEW', 'SCIENCE', 'ENGINEERING', 'OLYMPUS', 'WHAT_NEEDS_YOU', 'LEARNING', 'WHAT_CHANGED',
  ]);
  assert.equal(TOUR_ROUTES.length, TOUR_ROUTE_IDS.length);
  for (const route of TOUR_ROUTES) {
    assert.ok(route.label.length > 0, route.id);
    assert.ok(route.description.length > 0, route.id);
  }
});

test('SYSTEM_OVERVIEW resets the camera', () => {
  const action = resolveTourAction(tourRouteById('SYSTEM_OVERVIEW'), { needsYouFirstId: null });
  assert.deepEqual(action, { kind: 'RESET' });
});

test('SCIENCE/ENGINEERING/OLYMPUS focus exactly their own domain arm', () => {
  for (const domain of ['SCIENCE', 'ENGINEERING', 'OLYMPUS']) {
    const action = resolveTourAction(tourRouteById(domain), { needsYouFirstId: null });
    assert.deepEqual(action, { kind: 'FOCUS_DOMAIN', domain });
  }
});

test('WHAT_NEEDS_YOU opens the needs-you panel and carries the first Needs You entity id through, if any', () => {
  const withItem = resolveTourAction(tourRouteById('WHAT_NEEDS_YOU'), { needsYouFirstId: 'action.x' });
  assert.deepEqual(withItem, { kind: 'OPEN_PANEL', panel: 'needs-you', focusEntityId: 'action.x' });

  const withoutItem = resolveTourAction(tourRouteById('WHAT_NEEDS_YOU'), { needsYouFirstId: null });
  assert.deepEqual(withoutItem, { kind: 'OPEN_PANEL', panel: 'needs-you', focusEntityId: null });
});

test('LEARNING opens the learn panel and WHAT_CHANGED opens the changes panel, neither focusing an entity', () => {
  assert.deepEqual(
    resolveTourAction(tourRouteById('LEARNING'), { needsYouFirstId: 'irrelevant' }),
    { kind: 'OPEN_PANEL', panel: 'learn', focusEntityId: null },
  );
  assert.deepEqual(
    resolveTourAction(tourRouteById('WHAT_CHANGED'), { needsYouFirstId: 'irrelevant' }),
    { kind: 'OPEN_PANEL', panel: 'changes', focusEntityId: null },
  );
});

test('tourRouteById returns null for an unknown id instead of throwing', () => {
  assert.equal(tourRouteById('NOT_A_ROUTE'), null);
});
