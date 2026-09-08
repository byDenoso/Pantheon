# ATLAS Graph Lab · Babylon Pseudo-3D

## Goal
Create an isolated Babylon.js pseudo-3D renderer for comparison against the existing Canvas and full 3D Babylon labs.

## Constraints
- Do not modify Atlas production renderer or backend.
- Reuse synthetic graph, semantic layout, and Palette A.
- Compress logical Z with a tunable depthScale.
- Keep camera low-FOV and constrained around a mostly frontal orbital view.
- Preserve curved filaments, traveling pulses, projected HTML labels, picking, focus navigation, mobile shell, and HUD.
- Keep the full 3D Babylon lab unchanged.

## Validation
- graph-lab test contract must pass.
- full CI, typecheck, and build must remain green.
- deploy to a separate Vercel project/URL.
