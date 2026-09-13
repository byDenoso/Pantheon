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

// --- Facade-side classification lives in lib/auth.mjs, not duplicated here -- that
// file is the one both this browser bundle AND the api/private/*.js Vercel functions
// import (those run as plain JS, no TS build step, matching this repo's existing
// api/*.js convention), so the 401/403/JWT-verification rule is defined once. ---

export type FacadeAuthOutcome = { status: 401 | 403 | 200; reason: string };

export type DecodedGoogleClaims = {
  iss?: string;
  aud?: string;
  exp?: number; // epoch seconds
  email?: string;
  email_verified?: boolean;
};

export {
  classifyGoogleSession,
  isAllowedOrigin,
  PRODUCTION_PAGES_ORIGIN
} from '../../lib/auth.mjs';
