# NEXO ONE Private Connections Design

## Goal

Make all NEXO ONE read providers operational through the existing single-user private session without creating a new Truth Owner or exposing long-lived provider secrets in source code.

## Architecture

- Preserve the current `/api/session` signed-cookie gate and public-mode rule: unauthenticated requests may read only GitHub public data.
- Prefer Vercel Connect for Google access. The runtime exchanges the project `VERCEL_OIDC_TOKEN` for a short-lived Google credential through the configured `GOOGLE_CONNECTOR`; the legacy client-id/client-secret/refresh-token path remains as rollback fallback.
- Request only read scopes: Drive, Gmail, Calendar and Sheets.
- Keep Google Drive, Gmail and Calendar normalization contracts unchanged.
- Extend the NEXO adapter with an optional Google Sheets source. When `NEXO_SHEET_ID` and `NEXO_SHEET_RANGE` are configured, it reads rows through the same Google credential and converts the sheet into the existing versioned owner-export contract; `NEXO_SOURCE_URL` remains the fallback path.
- Keep Atlas read-only and point it at the canonical Atlas Graph Contract V1 endpoint.
- Keep Vercel read-only. No credential is committed; existing `VERCEL_READ_TOKEN` remains supported until a Connect/API-key migration is separately justified.
- Keep GitHub public access unchanged.

## Google Connect contract

Configuration:

- `GOOGLE_CONNECTOR`, expected form `google/<name>` or connector id.
- `GOOGLE_CONNECT_SUBJECT_ID`, stable single-user subject id, default `owner`.
- `VERCEL_OIDC_TOKEN`, injected by Vercel at runtime.

Token exchange:

`POST https://api.vercel.com/v1/connect/token/<connector>` using the Vercel OIDC token and a `user` subject. The request asks for Google read-only scopes only. A missing/invalid authorization is normalized as `AUTH_REQUIRED`.

Fallback:

If `GOOGLE_CONNECTOR` is absent, the existing Google OAuth refresh-token flow is used unchanged. If `GOOGLE_CONNECTOR` is present but fails, the adapter does not silently fall back to legacy secrets; this prevents masking a broken Connect configuration.

## NEXO Sheets source

The optional sheet source must expose a header row including at least `id`, `title`, `sourceRef`, `kind`, `authority`, `attention`, `freshnessState`, `observedAt`, and `expiresAt`. Optional columns map to the existing item contract. The adapter validates and normalizes values, preserves owner timestamps, and computes a deterministic revision from the normalized items. It does not invent freshness or provenance beyond explicit sheet values.

## Error handling

- Missing Connect/OIDC setup: `AUTH_REQUIRED`.
- Vercel Connect non-2xx or missing token: `AUTH_REQUIRED` for auth/permission failures, otherwise `UNAVAILABLE`.
- Google API failures follow the existing provider error path.
- Invalid NEXO sheet schema: `UNAVAILABLE`.
- Public requests never invoke Google, NEXO, Atlas or Vercel private readers.

## Validation

Acceptance requires:

1. Unit tests proving Connect token exchange, scope restriction and no silent legacy fallback.
2. Unit tests proving legacy Google fallback remains valid.
3. Unit tests for NEXO Sheets normalization and rejection of malformed schema.
4. Existing contract/security tests remain green.
5. CI `npm run check` passes.
6. After owner-side connector authorization and Vercel configuration, authenticated `/api/health` reports required providers `AVAILABLE`; unauthenticated readback still exposes no private provider data.

## Rollback

Rollback is code-only: remove `GOOGLE_CONNECTOR` to return to the existing Google OAuth fallback, or promote the previously verified NEXO ONE deployment. No canonical data mutation is part of this change.
