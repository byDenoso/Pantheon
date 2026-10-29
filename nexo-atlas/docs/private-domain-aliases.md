# Private domain presentation

`system.domain_catalog` is a request-local, revision-bound projection. It does not replace Tower records, canonical entity identifiers, source graph nodes/edges, scientific states, or the Writer. It contains no vectors and never promotes scientific similarity into identity.

## Identity and membership

- A versioned exact translation/case registry resolves names such as Cosmologia/Cosmology to COSMOLOGY. Unknown source identifiers keep punctuation and spelling; NEXO, ARTIFACT, GPT PERFORMANCE, SCIENCE, COSMOLOGY, OLYMPUS, and BODYBUILDING are not conflated.
- Only a source `*_DOMAIN_ROUTING_V*.json` declaration with `owner_domain` and `subdomains` establishes a parent/child relation. Edges participating in a cycle are quarantined rather than selected by ordering.
- A complete semantic path segment, such as `science.cosmology.h0`, contributes membership only when the same parent/child is explicitly declared and the record belongs to that parent or child. Topic membership and subdomain membership remain separate source traces. Titles, labels, loose prefixes, similarity scores, and vector matches do not establish membership.
- Original direct domain values and all canonical relations remain in the existing read model and graph. Catalog members cite the record path, actual field, source value, contract path where relevant, and revision. Domain alias evidence records the exact alias rule.

## Counts

Counts use distinct canonical kind+ID identities per domain. Duplicate membership traces cannot increase counts. Synthetic campaign wrappers derived from roadmaps are not separate canonical records. Explicit historical test records are outside the test total; archived/retired records still present in the canonical test collection are included and separately labeled. `current_tests` and `retired_tests` partition that total. Parent totals overlap their children and must not be added together.

The private UI uses the same catalog for headings, aliases, domain filters, search, and outlines, rejecting catalog membership from a different revision. The legacy fallback groups direct records only. The domain page builds the membership index once, rather than re-filtering and sorting the full test set for every card. Empty direct-only lane text is not used as a summary for a domain whose test membership is inherited.

The authenticated knowledge graph keeps `semantic.domain_id` verbatim and exposes `grouping_domain_id`, `domain_resolution`, and `membership_ids` for alias-aware filtering. Its domain counts include only eligible, role-scoped, non-quarantined identities under the query's history policy. Translated private domains are excluded before retrieval, and no provider or grant is added.

## Verification

Run `npm run build`, `npm test`, `node node_modules/typescript/bin/tsc --noEmit`, and `node test/domain-aliases.browser.mjs`. Browser QA uses synthetic records and the cloud computer's local browser only. Real Tower validation is read-only and its snapshot/report must stay outside this checkout and public build inputs.

Privacy is checked again after hierarchy expansion, so protected ancestors or descendants cannot re-enter the eligible graph through a routing contract. Structured `subdomain_id` and `topic_id` path segments also honor protected domain aliases before either memory browsing or graph retrieval; lookalike words such as `healthcare` are not treated as `HEALTH`.
