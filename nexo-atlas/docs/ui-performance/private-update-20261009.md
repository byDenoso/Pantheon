# Private interface and empty-field corrections — 2026-10-09

Changes: shared public cosmological artwork replaces retired private-shell video backdrop; authenticated workspace title artwork updated. Empty nested values, whitespace-only fields, invalid dates, empty client-selection/timeline/campaign states receive explicit labels. Unknown data does not become zero; incomplete counts identify their scope. Scientific records and session/revision checks unchanged.

The 3D graph now evaluates diagnostic graph metrics only when a consumer requests them. A component-owned one-entry cache reuses raw layout on repeat navigation, clones geometry for every renderer mount, and is cleared with workspace generation/logout. No private layout is persisted. Existing scene physics and GPU resources remain per mount.

Synthetic Node24 benchmark (three-trial medians, 1,500 test fixture): graph construction ~253→3.56ms; cold graph/layout/scene/filament pipeline ~883→635ms; repeat navigation pipeline ~879→21.7ms. These are CPU measurements, not production login latency or scientific findings. Full graph and metrics equality verified. See accompanying JSON.

Browser limitation: cloud Chromium had no authenticated private session; actual private account loading/Drive latency was not certified. No access check was bypassed. Public motion, pause and desktop/mobile layout verified on live revision56 before this update.

SSR profile regression was updated to explicitly compare the known difference in Writer availability between old and compact runtime profiles, then compare like-for-like views. The absent Writer status is not silently treated as an empty collection.
