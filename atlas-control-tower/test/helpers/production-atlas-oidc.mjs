import { generateKeyPairSync, sign } from 'node:crypto';
import { PROJECTION_SERVICE_TRUST as trust } from '../../../nexo-one/server/auth/vercel-oidc.mjs';

export function productionAtlasOidcFixture() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const now = Math.floor(Date.now() / 1000);
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'synthetic-production-atlas', alg: 'RS256' };
  const claims = {
    iss: `https://oidc.vercel.com/${trust.ownerSlug}`, aud: `https://vercel.com/${trust.ownerSlug}`,
    sub: `owner:${trust.ownerSlug}:project:${trust.projectName}:environment:${trust.environment}`,
    owner: trust.ownerSlug, owner_id: trust.ownerId, project: trust.projectName, project_id: trust.projectId,
    environment: trust.environment, iat: now - 10, exp: now + 600,
  };
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encode({ alg: 'RS256', kid: jwk.kid })}.${encode(claims)}`;
  const token = `${input}.${sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`;
  return { token, jwk };
}
