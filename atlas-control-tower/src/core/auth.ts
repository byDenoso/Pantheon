// Client-side auth gate. This module never talks to a network -- it only decides,
// from configuration and a session object already in memory, what the UI should show.
// It must never fabricate a signed-in session and must never hide the fact that OAuth
// is not configured behind a generic error.

export type AuthGateState = 'AUTH_SETUP_REQUIRED' | 'SIGNED_OUT' | 'SIGNED_IN' | 'EXPIRED';

export type AtlasSession = {
  email: string;
  expiresAt: number; // epoch ms
};

function configuredGoogleClientId(): string {
  try {
    // Vite inlines import.meta.env.* at build time; guarded for the Node test runner,
    // which has no import.meta.env at all.
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    return String(env?.VITE_GOOGLE_CLIENT_ID || '').trim();
  } catch {
    return '';
  }
}

export function isAuthConfigured(clientId: string = configuredGoogleClientId()): boolean {
  return clientId.length > 0;
}

/**
 * Resolves what a private route should show right now. Never returns SIGNED_IN unless
 * a real session object with a future expiresAt was supplied -- there is no code path
 * here that can synthesize one.
 */
export function resolveAuthGateState(session: AtlasSession | null, now: number = Date.now(), clientId?: string): AuthGateState {
  if (!isAuthConfigured(clientId)) return 'AUTH_SETUP_REQUIRED';
  if (!session) return 'SIGNED_OUT';
  if (session.expiresAt <= now) return 'EXPIRED';
  return 'SIGNED_IN';
}

export function isPrivateRouteAccessible(session: AtlasSession | null, now: number = Date.now(), clientId?: string): boolean {
  return resolveAuthGateState(session, now, clientId) === 'SIGNED_IN';
}

// --- Facade-side classification (used by api/private/*.mjs handlers; kept here too so
// the same rule is unit-tested once and imported both client- and server-side). ---

export type FacadeAuthOutcome = { status: 401 | 403 | 200; reason: string };

export type DecodedGoogleClaims = {
  iss?: string;
  aud?: string;
  exp?: number; // epoch seconds
  email?: string;
  email_verified?: boolean;
};

const VALID_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

/**
 * Pure classification of a decoded (already signature-verified, elsewhere) Google ID
 * token against the expected audience and the email allowlist. Never trusts an
 * unverified token -- callers must verify the JWT signature before calling this.
 */
export function classifyGoogleSession(
  claims: DecodedGoogleClaims | null,
  expectedAudience: string,
  allowedEmails: readonly string[],
  now: number = Math.floor(Date.now() / 1000)
): FacadeAuthOutcome {
  if (!claims) return { status: 401, reason: 'TOKEN_ABSENT' };
  if (!claims.iss || !VALID_ISSUERS.has(claims.iss)) return { status: 401, reason: 'INVALID_ISSUER' };
  if (claims.aud !== expectedAudience) return { status: 401, reason: 'INVALID_AUDIENCE' };
  if (!claims.exp || claims.exp <= now) return { status: 401, reason: 'EXPIRED' };
  if (!claims.email_verified) return { status: 401, reason: 'EMAIL_NOT_VERIFIED' };
  if (!claims.email) return { status: 401, reason: 'EMAIL_ABSENT' };
  const allowlist = new Set(allowedEmails.map(email => email.trim().toLowerCase()));
  if (!allowlist.has(claims.email.trim().toLowerCase())) return { status: 403, reason: 'NOT_IN_ALLOWLIST' };
  return { status: 200, reason: 'OK' };
}

export function isAllowedOrigin(origin: string | null | undefined, allowedOrigins: readonly string[]): boolean {
  if (!origin) return false;
  return allowedOrigins.includes(origin);
}

export const PRODUCTION_PAGES_ORIGIN = 'https://bydenoso.github.io';
