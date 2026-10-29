import {createPublicKey, verify} from 'node:crypto';

// This verifier receives an ID token obtained by the server's OAuth flow.
// It never treats identity headers supplied by the browser as proof.
export async function verifyGoogleOwner(token, env, fetcher = fetch, now = Date.now()) {
  try {
    if (typeof token !== 'string' || token.length > 16384 || typeof env.GOOGLE_CLIENT_ID !== 'string' || !env.GOOGLE_CLIENT_ID || typeof env.NEXO_ATLAS_OWNER_SUB !== 'string' || !env.NEXO_ATLAS_OWNER_SUB) return null;
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
    const header = JSON.parse(Buffer.from(parts[0], 'base64url'));
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid || header.kid.length > 256) return null;
    if (!['https://accounts.google.com','accounts.google.com'].includes(claims.iss) || claims.aud !== env.GOOGLE_CLIENT_ID || claims.sub !== env.NEXO_ATLAS_OWNER_SUB || !Number.isSafeInteger(claims.exp) || claims.exp <= Math.floor(now / 1000) || !Number.isSafeInteger(claims.iat) || claims.iat > Math.floor(now / 1000) + 60) return null;
    if (env.NEXO_ATLAS_OWNER_EMAIL && (claims.email_verified !== true || typeof claims.email !== 'string' || claims.email.toLowerCase() !== env.NEXO_ATLAS_OWNER_EMAIL.toLowerCase())) return null;
    const response = await fetcher('https://www.googleapis.com/oauth2/v3/certs', {redirect:'manual', signal:AbortSignal.timeout(10000)});
    if (!response.ok) return null;
    const data = await response.json();
    if (!Array.isArray(data.keys)) return null;
    const keys = data.keys.filter(key => key.kid === header.kid && key.kty === 'RSA' && key.alg === 'RS256' && key.use === 'sig');
    if (keys.length !== 1) return null;
    const key = createPublicKey({key:keys[0],format:'jwk'});
    if (!verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'))) return null;
    return {sub:claims.sub, email:claims.email};
  } catch { return null; }
}
