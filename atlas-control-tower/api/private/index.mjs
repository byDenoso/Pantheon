import cockpit from './cockpit.mjs';
import activity from './activity.mjs';
import research from './research.mjs';
import entity from './entity.mjs';
import learner from './learner.mjs';
import sync from './sync.mjs';
import semantic from './semantic.mjs';
import control from './control.mjs';
import driveBootstrap from './drive-bootstrap.mjs';
import { send } from './_middleware.mjs';

const handlers = Object.freeze({
  cockpit,
  activity,
  research,
  entity,
  learner,
  sync,
  semantic,
  control,
  'drive-bootstrap': driveBootstrap,
});

export default async function privateDispatcher(req, res) {
  const rawRoute = req.query?.route;
  const route = Array.isArray(rawRoute) ? rawRoute[0] : rawRoute;
  const handler = typeof route === 'string' ? handlers[route] : undefined;

  if (!handler) {
    return send(res, { error: 'PRIVATE_ROUTE_NOT_FOUND' }, 404);
  }

  return handler(req, res);
}
