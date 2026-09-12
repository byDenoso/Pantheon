# NEXO Atlas Research API Design

## Goal

Create one stable public read-only aggregation API between the canonical NEXO SSOT and the Atlas frontend. The API must power Grafos, Observatório, Laboratório and Resumo do Universo without exposing raw Google Sheets structure or private Olympus content.

## Architecture

`readAtlasSsot()` remains the canonical Google Drive reader. A new pure compiler turns the full snapshot into privacy-safe public research views. The existing `handler.mjs` exposes those views through stable GET routes, preserving the current read-only model.

The frontend consumes only normalized API contracts. It never parses sheet tabs, Drive IDs or raw canonical rows directly.

## Public routes

- `GET /api?route=atlas-graph`
- `GET /api?route=observatory-summary`
- `GET /api?route=observatory-parameters`
- `GET /api?route=observatory-tensions`
- `GET /api?route=observatory-directional-signals`
- `GET /api?route=lab-hypotheses`
- `GET /api?route=lab-claims`
- `GET /api?route=lab-tests`
- `GET /api?route=lab-runs`
- `GET /api?route=lab-results`
- `GET /api?route=lab-evidence`
- `GET /api?route=lab-pipelines`
- `GET /api?route=universe-snapshot`

All routes return the same envelope:

```json
{
  "contract": "NEXO_ATLAS_RESEARCH_API_V1",
  "status": "OK|PARTIAL|EMPTY|DEGRADED",
  "freshness": "LIVE|SNAPSHOT|STALE|DEGRADED|OFFLINE",
  "generatedAt": "ISO-8601",
  "sourceModifiedAt": "ISO-8601",
  "authority": "GOOGLE_DRIVE",
  "projectionAuthority": "DERIVED_FROM_SSOT",
  "access": "PUBLIC_SANITIZED",
  "privacyGate": "OLYMPUS_EXCLUDED",
  "data": {},
  "provenance": []
}
```

## Data policy

The compiler may normalize only fields present in the canonical snapshot. It must not infer cosmological parameter values, tensions, directions, significance, consensus or causal conclusions from prose. If no structured value exists, return an empty array plus `status: EMPTY` or `PARTIAL`.

The Science projection is safe for structural public graph data. WORK rows under `THR::SCIENCE::ROOT` can populate lab test/workflow views using explicit columns such as `kind`, `question`, `status`, `method`, `result_ref` and `updated_at`. Olympus rows are excluded before projection.

## Graph contract

The graph endpoint returns real program/campaign/domain nodes derived from `projections.Science` and `projections.Engineering`, plus canonical NEXO/Science/Engineering/Operations roots. Parent relations are explicit when known. No fake claim/test nodes are created.

## Observatory contract

Observatory endpoints are schema-ready but conservative. Structured parameter/tension/directional arrays are empty until the SSOT contains explicit machine-readable records for those scientific products. `observatory-summary` returns domain/program/campaign coverage and API availability metadata, not invented science.

## Laboratory contract

Laboratory endpoints derive public read-only workflow records from canonical Science WORK rows and Science projection rows. Explicit TEST work rows populate `lab-tests`; other lab categories remain empty unless the snapshot contains explicit matching record types. This preserves scientific claim discipline.

## Universe snapshot

Returns the current structural scientific coverage, known domains/programs/campaigns, freshness and availability counts. Scientific parameters remain empty without structured canonical values.

## Privacy

- Olympus projection is never returned.
- WORK rows outside `THR::SCIENCE::ROOT` are excluded from research API lab views.
- Raw authorities, private execution details and arbitrary Drive references are not exposed beyond sanitized provenance labels.
- API remains GET-only.

## Failure behavior

A complete SSOT read failure returns HTTP 500 through the existing handler error path. A valid snapshot with missing scientific product classes returns HTTP 200 with `status: EMPTY` or `PARTIAL`. This lets the frontend degrade panel-by-panel instead of treating absence of evidence as transport failure.

## Compatibility

Existing routes (`world`, `health`, `atlas-public-ssot`, `atlas-ssot`, etc.) remain unchanged. The research API is additive.