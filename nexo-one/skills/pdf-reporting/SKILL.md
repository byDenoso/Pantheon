---
name: pdf-reporting
description: Use when creating, rewriting, exporting, or validating a PDF report, plan, audit, scientific report, consulting document, infographic-adapted report, or other fixed-layout PDF artifact.
---

# PDF Reporting

## Core rule

Preset choice is structural. If the user requests a PDF without a preset, present the canonical Visual Grammar Preset Pack before authoring. Reuse an already established preset for the active document or project.

Google Drive document `NEXO · ARTIFACT · VISUAL GRAMMAR PRESET PACK · v1.0` (`12hpUHgXCcXQk9AWDrFj0tBp6tGXwfnhVDu7vEAMbiFE`) is the body/content authority. MCP exposes discovery/resolve metadata only.

## Canonical 22 presets

1. **SWISS_SIGNAL** — editorial-system — grid + scale + signal color.
2. **MISSION_CONTROL** — operational — operational surface, not dashboard cards.
3. **EDITORIAL_SHOCK** — editorial — every spread changes rhythm.
4. **MUSEUM_ARCHIVE** — archive-luxury — object as specimen.
5. **LAB_NOTEBOOK** — scientific — artifact behaves like research instrument.
6. **DATA_NEWSROOM** — data-editorial — the chart carries the argument.
7. **RAW_BRUTAL** — brutalist — nothing decorative survives.
8. **GENERATIVE_GEOMETRY** — data-driven-identity — identity changes with the data.
9. **QUIET_JAPAN** — minimal-editorial — silence is part of hierarchy.
10. **TYPE_MATRIX** — typographic — typography is the visualization.
11. **LEDGER_78** — institutional-record — structure is explicit and auditable.
12. **MONOGRAPH** — publication — book logic, not app logic.
13. **TECH_REVIEW_12** — technology-editorial — flexible technical publication grid.
14. **FORENSIC_DOSSIER** — investigative — evidence chain is the composition.
15. **BLUEPRINT_SYSTEM** — engineering-schematic — page behaves like a drawing set.
16. **MARKET_TERMINAL** — financial-terminal — dense comparative scanning.
17. **CARTOGRAPHIC_ATLAS** — spatial-atlas — layers and geography lead the story.
18. **MATERIAL_INDEX** — material-catalog — systematic sample cataloguing.
19. **SIGNAL_ZINE** — experimental-zine — controlled visual collision.
20. **DATA_BRAND_SYSTEM** — data-brand — charts and brand grammar are one system.
21. **ARCHITECTONIC** — architectural — monumental hierarchy with spatial discipline.
22. **RESEARCH_POSTER** — academic-poster — one-canvas research narrative.

## Selection

Use the explicit preset supplied by the user. If none is supplied, ask for one. Unknown preset or ambiguous alias fails closed. Do not silently replace a selected grammar with generic cards, generic dashboard styling, or generic corporate layout.

For detailed rules and cross-media compatibility, recover the current Drive authority before authoring when those details materially affect the result.

## Writing policy

Write the report itself. Avoid metalinguage about generating, rendering, validating, exporting, testing, templates, or proving artifact capability. Prefer direct domain content: data, evidence, analysis, inference, conclusion, decision, and action.

## Authoring flow

Resolve preset → recover detailed grammar if needed → author → export PDF → render every page → validate final-size legibility, pagination, clipping, overlap, glyphs, tables, charts, headers and footers → deliver.

## Integration

`server/policy/pdf-reporting-policy.mjs` mirrors discovery metadata for the 22 presets. MCP clients use `get_pdf_policy`; Drive remains the canonical grammar body.
