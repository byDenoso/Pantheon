# NEXO Atlas Neural V4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** progressive disclosure, domain/overlay separation, semantic restore, last-known-good and improved focus/accessibility.

**Architecture:** keep TOWER_V06/projection as Truth Owner; add pure V4 semantic/session modules; integrate them into AtlasV3App; preserve R3F + Canvas fallback.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, R3F 9, Three 0.185, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-15-nexo-atlas-neural-v4-design.md`

## Tasks

- [ ] T1 RED: add `test/atlas-v4-semantic.test.mjs` for domain/overlay classification, semantic depth, visibility, serialization and snapshot diff. Run CI and confirm failure because module is absent.
- [ ] T1 GREEN: add `src/atlas-v3/semantic-v4.mjs` + `.d.mts`; run CI and confirm green.
- [ ] T2 RED: add `test/atlas-v4-session.test.mjs` for invalid storage and versioned semantic session; confirm red.
- [ ] T2 GREEN: add `src/atlas-v3/session-v4.mjs` + `.d.mts`; integrate last-known-good and session restore in `AtlasV3App.tsx`; confirm green/typecheck.
- [ ] T3 RED: add `test/atlas-v4-shell-contract.test.mjs` asserting four primary domains plus three overlays and breadcrumb/diff UX; confirm red.
- [ ] T3 GREEN: refactor `AtlasV3App.tsx`, `atlas-v3.css`, `atlas-v3-theme.css` to primary domain + overlay UI and progressive disclosure; confirm green/typecheck.
- [ ] T4 RED: add `test/atlas-v4-render-contract.test.mjs` for fit-selection, focus priority and screen-reader graph summary; confirm red.
- [ ] T4 GREEN: update `AtlasCanvas.tsx` and label/LOD behavior; confirm green/typecheck.
- [ ] T5 VERIFY: run full `npm test`, `npm run typecheck`, `npm run build`; inspect GitHub Actions and published Pages readback; fix only observed failures.
