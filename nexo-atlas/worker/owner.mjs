import {randomBytes, scrypt} from 'node:crypto';
import {promisify} from 'node:util';
import {database, sameOrigin, sessionRoute} from './auth.mjs';
const derive = promisify(scrypt);

export async function ownerAccess(request, env) {
  const id = request.headers.get('oai-authenticated-user-id') || '';
  const email = request.headers.get('oai-authenticated-user-email') || '';
  const expected = env.NEXO_ATLAS_OWNER_EMAIL;
  const signedIn = Boolean(id && email);
  if (typeof expected !== 'string' || !expected || !signedIn || email.toLowerCase() !== expected.toLowerCase() || id.length > 512) return {signedIn, owner: false, setupRequired: false};
  const row = await database(env).prepare('SELECT user_id, pin_hash FROM atlas_owner WHERE id = 1').first();
  if (row && row.user_id !== id) return {signedIn, owner: false, setupRequired: false};
  return {signedIn, owner: true, setupRequired: !row, userId: id, env: {...env, NEXO_ATLAS_PIN_HASH: row?.pin_hash || ''}};
}

export async function setupPin(request, env, access, body) {
  if (!access.owner) return {status: 403, body: {error: 'OWNER_REQUIRED'}};
  if (!sameOrigin(request)) return {status: 403, body: {error: 'ORIGIN_NOT_ALLOWED'}};
  if (!access.setupRequired) return {status: 409, body: {error: 'PIN_ALREADY_CONFIGURED'}};
  if (typeof body?.pin !== 'string' || body.pin.length < 8 || body.pin.length > 128) return {status: 400, body: {error: 'PIN_INVALID'}};
  const salt = randomBytes(16).toString('hex');
  const actual = await derive(body.pin, salt, 64);
  const hash = `scrypt$${salt}$${actual.toString('hex')}`;
  const db = database(env);
  // First verified owner submission wins. The owner identity and PIN are never
  // set by an anonymous first visitor, a browser-submitted identity, or an agent.
  const row = await db.prepare('INSERT INTO atlas_owner (id, user_id, pin_hash) VALUES (1, ?, ?) ON CONFLICT(id) DO NOTHING RETURNING user_id, pin_hash').bind(access.userId, hash).first();
  if (!row || row.user_id !== access.userId || row.pin_hash !== hash) return {status: 409, body: {error: 'PIN_ALREADY_CONFIGURED'}};
  return sessionRoute(request, {...env, NEXO_ATLAS_PIN_HASH: hash}, {pin: body.pin});
}
