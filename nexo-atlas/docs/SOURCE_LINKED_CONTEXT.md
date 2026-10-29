# Contained source-linked context policy

This is a query-only development patch against release commit
`5ec226baecc243abc17d080f4208731119005443`. It does not deploy, modify Tower,
change grants, call an external model, alter source records or infer a verdict.

## Why

An exact TEST ID in an interpretation question previously suppressed the later
source-linked correction. Identifying the TEST is necessary but insufficient to
recover a reviewed interpretation. An ID alone remains an exact lookup.

## Selection and ordering

- Explicit singular current-version queries and raw IDs retain exact priority.
- Literal field passages retain lexical behavior.
- Whole folded PT/EN correction, review or interpretation words select the new
  `bounded_source_linked_context` strategy when an authorized ID is identified,
  unless an explicit chain/trace/connection request takes priority.
- Evidence words select it only when an explicit structural request did not
  already match. “Evidence chain”, “Cadeia de evidências”, trace and connection
  queries preserve the existing multi-hop/path-witness strategy, including mixed
  review+connection wording. In evidence questions, whole independence words
  no longer accidentally match the legacy dependency substring.
- Portuguese `relação`/`relações` now recognize structural relation intent after
  folding; the previous `relacion` substring did not match these words.
- The new strategy accepts at most two explicit identities and walks one hop per
  identity, with the existing 200-node traversal limit per root. Exact identities
  rank first. Direct authorized neighbors then use existing lexical RRF order,
  with canonical ID as the deterministic tie-break. Lexical similarity cannot
  create a relationship or admit an unrelated document.
- Every supplemental hit carries an actual source-field edge and its original
  source citation. TEST state, dataset/prior wording, content hashes and pointers
  remain unchanged. A board post's `refs` edge establishes a source assertion,
  not a verified scientific correction or independent confirmation.
- No new graph edges, generated answers or independent-experiment counts exist.
  The new summary explicitly reports `scientific_independence: NOT_ESTABLISHED`.
- Shared campaign or hypothesis membership cannot introduce sibling tests at a
  second hop. Reviews without a direct explicit edge are outside this strategy.
  Missing/hidden/expired/inactive records remain outside the authorized index.
- Unresolved source fields are counted without revealing unresolved targets.
  `context_completeness` distinguishes bounded/unresolved delivery from resolved
  direct authorized links; `exhaustive_review_context` is always false. A complete
  returned edge witness is not exhaustive scientific-review context. Python
  context-budget trimming also updates the actual returned-hit completeness.
- Traversal and top-k truncation remain explicit. A small k or large neighborhood
  can omit a review; this is not an exhaustive interpretation guarantee.

Explicit `exact`, `lexical` and `graph` modes retain their existing behavior.
Unsupported history/options, malformed shards and wrong-scope edges still fail
closed. Source text remains untrusted data and all hits remain evidence-only.

## Version/provenance

Capabilities and search expose the additive `search_policy: reviewed-source-linked-context-v1`
identifier for this query behavior. Existing `method`, `code_sha256`, source/export
pins and the v1.3 D1 manifest bind the unchanged upstream index implementation,
not the new query-policy source. This patch intentionally reuses compatible
immutable indexes; no producer/job fingerprint or schema migration is needed.
The patch commit and reproducibility receipts identify the new query code.

The Python parity companion is in
`patches/retrieval-source-linked-context-python.patch`. Apply only to a copy of
reviewed Python 1.3, never relabel an original or deployed package. Its own code
and cache hash are recomputed normally; the D1 index pin is not changed to match
this query-only Python derivative. The original Python regression files remain
unchanged, with additional tests in the companion patch.

## Verification

Run `npm run build`, `npm test`, and
`node node_modules/typescript/bin/tsc --noEmit`. Code-pin checks are
`node scripts/pin-retrieval-producer.mjs --check` and
`node scripts/pin-retrieval-jobs.mjs --check`.

The new `test/retrieval-context.test.mjs` uses only synthetic sources and covers
PT/EN cues, raw-ID and trailing-ID priority, literal field passages, explicit
chains, direct correction/contest witnesses, prose-only and campaign-sibling
exclusion, unauthorized/expired/inactive reviews, malformed/hidden graph edges,
multiple roots, bounds and truncation.

For a private source-derived replay, supply explicit local inputs:

```
node scripts/verify-source-linked-context.mjs SOURCE.json PLAN.json NEW_OUTPUT_DIR BASELINE_REPO FROZEN_CLOCK
```

It preserves source bytes, builds a fixture-only local SQLite index using the
actual producer, verifies immutable shards, and runs both search implementations.
It never serves an expired snapshot as live data. Snapshot timestamp fields retain
the source envelope's metadata; the separate frozen query clock controls validity.
`RESUME_LOCAL_FIXTURE=1` can replay the identical already-verified local generation
without rebuilding, but cannot reuse another source or clock generation.

Frozen qrels and later correction cases must remain separate. The earlier
332-search v2 benchmark does not contain the later QSO board correction. Its
unchanged qrels establish regressions only. Source-derived later questions and
all new synthetic cases are development tests, not independently adjudicated gold,
blind holdout, causal productivity improvement or proof of scientific learning.

No production activation is authorized by this patch or by its passing tests.
