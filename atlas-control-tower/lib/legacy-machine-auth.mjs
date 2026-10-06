import { createHash, timingSafeEqual } from 'node:crypto';
import { DEFAULT_RUNNER_KEY_SHA256 } from './durable-runner.mjs';
import { verifyProjectionServiceToken } from '../../nexo-one/server/auth/vercel-oidc.mjs';

const header = value => typeof value === 'string' ? value : '';
export function legacyBearer(headers = {}) {
  const value = header(headers.authorization || headers.Authorization);
  if (Buffer.byteLength(value, 'utf8') > 16384) return '';
  return /^Bearer\s+(.+)$/i.exec(value)?.[1]?.trim() || '';
}

// Preserve the existing MCP-only credential precedence and scheduled-task hash
// contract. Possession grants no access to any other Atlas data entrypoint.
export function legacyMcpAccessHash(env = process.env) {
  return env.NEXO_MCP_ACCESS_KEY_SHA256 || env.NEXO_RUNNER_KEY_SHA256 || DEFAULT_RUNNER_KEY_SHA256;
}
export function legacyMcpKeyAuthorized(headers, env = process.env) {
  const token = legacyBearer(headers);
  const expected = String(legacyMcpAccessHash(env));
  if (!token || !/^[0-9a-f]{64}$/i.test(expected)) return false;
  const actual = createHash('sha256').update(token).digest();
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}

export function presentedLegacyOidc(req) {
  const trustedHeader = header(req?.headers?.['x-vercel-oidc-token']).trim();
  const bearer = legacyBearer(req?.headers);
  if (trustedHeader && bearer && trustedHeader !== bearer) return '';
  const token = trustedHeader || bearer;
  return token && Buffer.byteLength(token, 'utf8') <= 16384 ? token : '';
}

// The trust contract pins the production Atlas owner, project, environment,
// issuer, audience and subject, and verifies signature/expiry via Vercel JWKS.
// Merely having a deployment token in process.env never authenticates a caller.
export async function legacyOidcAuthorized(req, { verifyOidc = verifyProjectionServiceToken } = {}) {
  const token = presentedLegacyOidc(req);
  return token && await verifyOidc(token) ? token : '';
}
