---
name: pdf-reporting
description: Use when creating, rewriting, exporting, or validating a PDF report, plan, audit, scientific report, consulting document, or other fixed-layout PDF artifact.
---

# PDF Reporting

## Core rule

Treat preset choice as structural. If the user requests a PDF without defining style or preset, present the six canonical presets before authoring. Do not silently invent a visual identity.

## Canonical presets

- **Premium Dark**: technical dashboard, dark background, cards, metrics, charts, high visual hierarchy.
- **Premium Light**: clean executive report, light background, whitespace, discreet charts and tables.
- **Scientific**: formal technical/scientific report, figures, tables, captions, references, dense information.
- **Operational**: audit format centered on diagnosis, evidence, risk, decision, and next action.
- **Editorial**: consulting-style visual report with stronger typography and controlled visual narrative.
- **Minimal**: compact, dry, low-decoration document optimized for fast reading.

## Writing policy

Write the report itself. Do not write about the report-generation process.

Avoid metalinguage such as:
- statements that the document exists to prove generation capability;
- comments about producing, rendering, validating, exporting, or testing the PDF;
- comments about templates or lack of templates;
- sentences such as “este relatório demonstra que...” when they describe the artifact rather than the subject matter;
- explanations of why the document was generated unless that is genuine subject-matter content requested by the user.

Prefer direct domain content: data, evidence, analysis, inference, conclusion, decision, and action.

## Authoring flow

1. Resolve preset.
2. Choose the smallest correct authoring route for the content.
3. Build the artifact with coherent typography, spacing, tables, figures, and page breaks.
4. Export to PDF.
5. Render every page to images.
6. Validate clipping, overlap, broken glyphs, table overflow, graph readability, headers/footers, and pagination.
7. Deliver only after visual validation passes.

## Preset inference

Use an explicit preset supplied by the user. If none is supplied, ask for one. If the user already established a preset for the active document or project, reuse it instead of asking again.

## Integration

The canonical machine-readable policy is `server/policy/pdf-reporting-policy.mjs`. MCP clients should read it through `get_pdf_policy` rather than duplicating preset definitions.
