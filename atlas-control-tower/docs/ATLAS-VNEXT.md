# NEXO Atlas vNext frontend

The React entrypoint now keeps four projections inside one Atlas shell:

- `/graphs` keeps the existing `useAtlasSession` + `AtlasCanvas` exploration flow.
- `/observatory` reads the existing V1 `state` and renders typed scientific projections when those fields are published.
- `/lab` queries the existing graph contract for real claims, tests, runs, results, evidence and pipelines; it is read-only until write contracts exist.
- `/universe` renders API-published synthesis and parameters, with explicit empty states for unpublished questions.

The browser adapter lives under `src/api/`. It is the only frontend boundary for scientific payloads. Runtime parsing is defensive and maps unsupported or absent fields to `EMPTY`, `DATA_UNAVAILABLE`, `STALE`, `DEGRADED` or `INCONCLUSIVE`; it does not supply cosmological defaults.

`NEXO_API_BASE_URL` is accepted by the Vite build (and `VITE_NEXO_API_BASE_URL` is accepted for standard Vite deployments). The value should point to the API root that exposes `graph`, `state`, `entity`, `learning`, `ops` and `audit`.

The URL context is shared across areas (`domain`, `dataset`, `source`, `period`, `redshift`, `status`, `scope`, `query`). A domain route such as `/graphs/science/d3` remains available when opening the Observatory or Laboratory.

