# NEXO Atlas — Official Frontend Contract

Status: **OFFICIAL FRONTEND** for the NEXO scientific/operational read model.

## Truth flow

`Drive → Neon → NEXO Atlas`

- Drive remains a source surface where applicable.
- Neon `science_v1` / `learning_v1` is the live projection consumed by Atlas.
- Atlas is read-only with respect to canonical science; it renders current canonical/derived state and provenance.
- The bundled snapshot is emergency fallback only and must never be presented as the preferred source when V1 is healthy.

## Freshness contract

- Manual `Sincronizar`: immediate refresh and client-cache invalidation.
- Automatic app refresh: every 12 hours while the browser is active.
- The browser persists the last automatic-sync time, so closing/reopening the app does not reset the cadence.
- Returning to the tab only triggers a sync when the 12-hour window is actually due.
- The Vercel Hobby plan permits only daily cron jobs, so the server keeps one daily 08:00 UTC refresh as an unattended fallback; it is not the app cadence.
- Normal navigation continues to read the live Neon projection; a synchronization is not required just to navigate current V1 data.

## UI contract

Primary workspace surfaces:

1. Visão do sistema
2. Universo científico
3. Black Box
4. Learning
5. Auditoria

`Arquivos` is not a first-level workspace. Files remain provenance/evidence attached to entities and audit/source inspection.

The former flat entity list is replaced by **Painel do recorte**, which summarizes composition, relations, health, centrality and observed activity. Black Box is the operational flight recorder for execution, learning and integrity; it does not manufacture scientific evidence.

## Change propagation

A source change is considered reflected in Atlas when it reaches the live Neon projection and Atlas invalidates/reloads its projection cache. Drive-only changes therefore follow the authoritative Drive→Neon ingestion path; Atlas does not bypass Neon by inventing a second scientific authority.
