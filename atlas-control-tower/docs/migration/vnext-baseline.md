# NEXO Atlas vNext Migration Baseline

- Captured: 2026-09-10
- Repository: `byDenoso/Pantheon`
- Branch: `feat/nexo-atlas-vnext`
- Baseline / rollback SHA: `1603112d6cafa77e1a2d05539606f7dbe80d895e`
- Production: `https://nexo-atlas-control-tower.vercel.app`
- Current production frontend contract: legacy `index.html` + `/app.mjs`; deploy readback requires root `id="graph"` and `/app.mjs`.

## Local baseline

- `npm install --no-audit --no-fund`: PASS
- `npm test`: PASS, 224/224
- `npm run typecheck`: PASS
- `npm run build`: PASS
- Vite build: 32 modules; JS 99.92 kB (35.94 kB gzip); CSS 76.85 kB (15.52 kB gzip)

## Production HTTP baseline

- `/`: 200
- `/api/health`: 200
- `/api/graph?focus=system:NEXO&depth=1`: 200
- `/api/learning`: 200
- `/api/ops`: 200

This SHA is the rollback target for the vNext frontend migration.