# NEXO Atlas 3D — Implementation Plan

1. Add failing tests that define deterministic 3D placement: NEXO at origin, unique domain hubs, stable ordering-independent coordinates, and outer evidence farther from its domain hub than providers/capabilities.
2. Add `graph3d.ts` and make layout tests pass.
3. Add Babylon.js dependency and lock entry.
4. Add `Atlas3DCanvas.tsx` with scene lifecycle, camera controls, picking, focus/fly-to, glow, edges, labels, resize and cleanup.
5. Add isolated `atlas3d.css`.
6. Replace the SVG canvas use in `Atlas.tsx`, preserving filters, inspector, legend and mobile behavior.
7. Extend browser smoke checks for the 3D canvas and selection path.
8. Run GitHub CI until `npm run check` and browser verification pass.
9. Review diff, merge to `main`, wait for Vercel production deployment, then read back the production root/Atlas and runtime errors.