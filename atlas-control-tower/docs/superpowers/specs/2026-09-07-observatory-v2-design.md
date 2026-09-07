# NEXO Atlas Observatory V2 — Design Spec

## Goal

Implement the first approved visual mockup as the default Atlas overview while preserving the existing graph, APIs, source truth and navigation behavior.

## Visual direction

- Deep navy observatory, not cyan/neon SaaS.
- The interactive graph is the dominant surface and occupies the first major viewport.
- Space treatment supplies depth through layered stars, nebula haze, orbital rings and a partial planetary horizon, without using decorative copy as evidence.
- Sidebar remains compact and functional, with lower border density and a quieter active state.
- Top bar stays lean: brand, search, theme, sync.
- No `FRONTEND OFICIAL`, no provenance badge in the top bar, no `Estado rastreável` sidebar card.

## Information architecture

1. Top bar.
2. Sidebar.
3. Overview headline: `O conhecimento é um sistema.`
4. One-line operational subtitle: `Conecte domínios, rastreie relações e priorize o que exige ação.`
5. Filter row integrated with the map header.
6. Large interactive map.
7. Overview deck below the map:
   - `Status operacional`
   - `Visão geral`
   - `Atividade recente`
8. `Prioridades operacionais` below the overview deck, sourced from real blockers.
9. Existing analytics / radar / inspector remain available below and through current navigation.

## Copy rules

- No `X, não Y` constructions.
- No generic motivational slogans.
- No fake coordinates, fake counts or decorative operational facts.
- Labels may summarize real source state, but must be derived from current `/health`, `/ops`, `/learning` and `/state` payloads.
- Keep `Science`, `Black Box`, `Learning`, `Engineering`, `Olympus` graph labels as the graph renderer provides them. Do not add redundant `SYSTEM` labels in surrounding UI.

## Behavioral constraints

- No new backend route, database, scheduler, agent or dependency.
- Existing GraphSession resilience remains unchanged.
- Map controls, filters, focus, inspector, sync, Learning overlay and Black Box drill-down remain functional.
- Command Center sources still load independently.
- Missing auxiliary sources degrade locally rather than blanking the page.
- Reduced-motion behavior remains respected.

## Responsive behavior

- Desktop: map dominates the viewport; overview deck is 3 columns.
- Tablet: overview deck collapses to 2/1 columns.
- Mobile: map remains first, filters become horizontally scrollable or stacked, overview deck becomes one column.

## Success criteria

- On desktop the first viewport visually reads as an observatory/map, not a KPI dashboard.
- The overview headline and map appear before operational cards.
- The rendered Command Center contains exactly the three primary overview panels plus a priorities section.
- Existing source data and graph behavior are preserved.
- Full test suite passes.