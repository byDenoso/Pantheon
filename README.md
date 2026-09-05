# NEXO Console

Unified frontend for the existing NEXO operational system.

Production target: **Vercel project `nexo-research-os-live`**.

## Runtime model

The app is a derived visualization. Canonical truth remains in the domain owners (Drive/Tower, Git/GitHub + runtime, Olympus). `Neon.nexo_ops` is only a fast read model.

The serverless `/api/nexo` tries these environment variables in order:

1. `DATABASE_URL`
2. `POSTGRES_URL`
3. `NEON_DATABASE_URL`

If no supported URL is present, or Neon cannot be read, the API returns `source=EMBEDDED_FALLBACK` and `sync.state=DEGRADED`. The UI visibly exposes this condition and must never present fallback data as live.

## Surfaces

- NOW — current lanes, recent material deltas and attention.
- ACTIVITY — material-first Flight Recorder.
- EVOLUTION — before/after with explicit measurement gates.
- CAPABILITIES — PASS / PENDING / UNVERIFIED proof matrix.
- SYSTEM — current 3-task topology; Journal/Guardian are historical only.
- PRESENT — compact presentation mode built from the same payload.

## Development

```bash
npm test
```

The source intentionally stays framework-light: static HTML/CSS/JS plus one Vercel Node function. No new scheduler, database, agent or truth owner is introduced.
