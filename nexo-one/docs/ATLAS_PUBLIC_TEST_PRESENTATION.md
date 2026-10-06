# Public test presentation

The public presentation uses four reviewed fields, in this order:

1. Pergunta / Question
2. O que o teste responde / What the test answers
3. Método / Method
4. Resultado / Result

`ATLAS_PUBLIC_V1` accepts an optional `tests` array. Existing `items` and `links` remain compatible; the canonical item and scientific enums are unchanged. Every test has an opaque, reviewed public ID and the four fields in both PT-BR and English. IDs are keys, not an extra displayed field. Incomplete or malformed projections are omitted, without substituting operational state for scientific meaning.

The client uses a positive field allowlist. Result text is shown verbatim, including any uncertainty or lack of a conclusion. It is never calculated from `DONE`, a verdict or an execution state.

The server-side `projectApprovedPublicTests` accepts the existing normalized Tower `records.tests`. Its explicit approval list is empty. A review entry binds all four editorial fields to the SHA-256 digest of the entire canonical record. A changed result, limitation or review state invalidates that approval. Raw source fields, internal IDs, links, paths and statistics are never copied into the output. This projection creates no independent source of truth or database.

The public HTTP route is intentionally unchanged: it fetches no private source and returns an empty public contract. The projector is not wired into that route. Connecting approved content requires a separate, reviewed publication change; adding these UI fields does not authorize publication. No real test is included in the code, bundle or screenshots.

## Visual direction

The public page uses an open layout, the approved decorative web image plus the existing seeded animation, blue action color `#1E5BFF`, and white/black themes. Nunito Black is a replaceable working heading choice; Barlow is used for reading. Fonts are self-hosted with their license. The private 3D renderer, its controls, canonical topology and private delivery boundary remain intact.
