# NEXO ONE Private Connections Design

## Goal

Make all NEXO ONE read providers operational through the existing single-user private session without creating a new Truth Owner or exposing long-lived provider secrets in source code.

## Architecture

- Preserve the current `/api/session` signed-cookie gate and public-mode rule: unauthenticated requests may read only GitHub public data.
- Prefer Vercel Connect for Google access. The runtime exchanges the project `VERCEL_OIDC_TOKEN` for a short-lived Google credential through the configured `GOOGLE_CONNECTOR`; the legacy client-id/client-secret/refresh-token path remains as rollback fallback.
- Request only read scopes: Drive, Gmail, Calendar and Sheets.
- Keep Google Drive, Gmail and Calendar normalization contracts unchanged.
- Extend the NEXO adapter with an optional Google Sheets source. When `NEXO_SHEET_ID` is configured, it reads the canonical `NEXO` tab through the same Google credential and maps its current eight-column SSOT schema into the existing NEXO item contract; `NEXO_SOURCE_URL` remains the fallback path.
- Keep Atlas read-only and point it at the canonical Atlas Graph Contract V1 endpoint.
- Keep Vercel read-only. No credential is committed; existing `VERCEL_READ_TOKEN` remains supported until a separate credential-plane change is justified.
- Keep GitHub public access unchanged.

## Google Connect contract

Configuration:

- `GOOGLE_CONNECTOR`, expected form `google/<name>` or a connector identifier accepted by Vercel Connect.
- `GOOGLE_CONNECT_SUBJECT_ID`, stable single-user subject id, default `owner`.
- `VERCEL_OIDC_TOKEN`, injected by Vercel at runtime and never persisted in source.

Token exchange:

`POST https://api.vercel.com/v1/connect/token/<connector>` using the Vercel OIDC token and a `user` subject. The request asks only for Google Drive, Gmail, Calendar and Sheets read-only scopes. A missing/invalid authorization is normalized as `AUTH_REQUIRED`.

Fallback:

If `GOOGLE_CONNECTOR` is absent, the existing Google OAuth refresh-token flow is used unchanged. If `GOOGLE_CONNECTOR` is present but fails, the adapter does not silently fall back to legacy secrets; this prevents masking a broken Connect configuration.

## NEXO Sheets source

The live canonical source is `NEXO · SSOT CANONICAL`, sheet id `1e6s2dKOYVLNsPUguHI85RLVLwJKtlCsQZBJ1BE-UhaY`, tab `NEXO`. Its observed schema is:

```text
record_type | record_id | status | title | detail | payload_json | source | updated_at
```

The adapter requires `record_type`, `record_id`, `status`, `title`, `detail`, `source` and `updated_at`. Blank rows are ignored. It maps actions to `ACTION` and other rows to `ENTITY`, preserves `updated_at` as the observation timestamp, maps only an explicit `BLOCKED` state into the constrained loop-state contract, and computes a deterministic SHA-256 revision from normalized semantic fields. It does not invent owner timestamps, provenance, arbitrary loop states or scientific authority. `NEXO_SHEET_RANGE` defaults to `NEXO!A1:H1000`.

## Error handling

- Missing Connect/OIDC setup: `AUTH_REQUIRED`.
- Vercel Connect non-2xx or missing token: `AUTH_REQUIRED` for authentication/authorization failures; other provider failures follow the common provider error path.
- Invalid NEXO sheet schema or invalid row identity/timestamp: `UNAVAILABLE`.
- Public requests never invoke Google, NEXO, Atlas or Vercel private readers.

## Validation

Acceptance requires:

1. Unit tests proving Connect token exchange, scope restriction and no silent legacy fallback.
2. Unit tests proving legacy Google fallback remains valid.
3. Unit tests for the real NEXO SSOT sheet schema, timestamp preservation and malformed-schema rejection.
4. Existing contract/security tests remain green.
5. CI `npm run check` passes.
6. After owner-side connector authorization and Vercel configuration, authenticated `/api/health` reports required providers `AVAILABLE`; unauthenticated readback still exposes no private provider data.

## Rollback

Rollback is code/config only: remove `GOOGLE_CONNECTOR` to return to the existing Google OAuth fallback, disable `NEXO_SHEET_ID` to return to `NEXO_SOURCE_URL`, or promote the previously verified NEXO ONE deployment. No canonical data mutation is part of this change.
