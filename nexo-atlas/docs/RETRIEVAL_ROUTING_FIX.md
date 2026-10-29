# Bounded retrieval corrections

The lexical browser now ranks an exact canonical ID or object ID ahead of records that only mention it. Other matches retain their existing order, filters and citations. Ranking happens before pagination. Ambiguous identities remain ambiguous; this does not merge entities or replace lexical retrieval with semantic similarity.

The local Python-memory graph bridge creates one request-local graph reader rather than rebuilding the full graph for each hit. The reader captures its Tower revision, role-eligible ID set and history visibility. It is not shared between requests or stored globally. Returned objects cannot mutate later results. Empty retrieval results do not trigger a graph build.

No provider, endpoint, authentication grant, persistent cache, Writer or production configuration is added. Hosted vectors and a common remote MCP remain separate integration work.

Validation on the fixed 12,054-file Tower snapshot:

- Same 24 real current TEST identifiers: exact entity first rose from 0/24 to 24/24; result membership was unchanged.
- Three actual LSA queries, three repetitions each: graph composition p50 fell from 2,711 ms to 328 ms and p95 from 3,144 ms to 363 ms. All nine complete outputs matched the baseline.
- Lexical route latency did not demonstrate an improvement: observed p50 318/315 ms and p95 419/502 ms, baseline/candidate.
- These are local contained-fix measurements, not a full relevance benchmark or a hosted capacity claim.

The private measurement receipts and source snapshots are intentionally outside the repository. Run npm test for synthetic regression coverage. Revert the bounded code changes to roll back; no data migration is involved.
