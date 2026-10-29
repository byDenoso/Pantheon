# Evidence-origin grouping

`summarizeEvidenceOrigins` operates only on a server-selected, redacted authorized view. It is a separate derived summary; it does not alter retrieval ranking, approve a claim, or write memory/Tower. It is not yet attached to the live Atlas/MCP response.

It follows only explicit source-field `derived_from`, `supported_by`, `for_test`, `has_run`, and `has_result` relations with both endpoints visible. Generic references, campaigns, hypotheses and semantic similarity cannot create a common origin. Ten papers explicitly linked to one experiment produce one lineage-origin group. Separate test identities, including dataset/prior variants, stay distinct unless an explicit run/result derivation identifies a common origin. Canonical ID, version, content hash, source revision, locator and path witnesses accompany groups.

An origin group is NOT an independent experimental confirmation. `independent_experiments` remains null, and every group says `NOT_ESTABLISHED`. Unknown or cyclic lineage stays unresolved; bounded traversal is marked incomplete and its count a lower bound. Literal source `not_independent_evidence: true` flags survive as qualifiers. No hidden endpoint/locator is returned.

Twelve focused tests pass. A read-only replay on the latest frozen LEARNER view covers1,589 authorized documents:402 known lineage-origin IDs,735 unresolved documents, no truncated traversals,13 explicit non-independent qualifiers. Every returned ID and edge stayed in the authorized view. These are coverage counts, not relevance scores or scientific evidence counts. Raw source and replay inputs are outside the source checkout.
