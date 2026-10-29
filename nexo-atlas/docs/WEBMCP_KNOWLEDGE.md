# Private WebMCP, semantic graph and local vector bridge

Status: isolated implementation candidate, not published or enabled in the UI. Built on the existing private-memory candidate `81ac27996585b116f47385df0b990f542c2e71b5`. No changes to the public release checkout, the private presentation components, Tower, Writer, scheduler, credentials or connector grants.

## What the source audit established

The latest visible delivery in [Aprimorar o sistema NEXO](https://chatgpt.com/c/6ac43904-3848-83e8-ba38-1512126b1323), inspected on 6 October 2026, is memory 1.0.1: Python LSA/BM25, SQLite-derived cache, explicit one-hop references and role-scoped retrieval. Its delivery reports 74 tests. No later Node vector implementation was present in that conversation. The source package has Python memory code, not a newly implemented Node vector engine.

The existing JavaScript/TypeScript foundation is real and reused:

- `src/tower-web/graph.ts`: graph indexing, components, Tarjan SCC/cycles, layering, articulation and betweenness.
- `src/tower-web/model.ts`: Tower/domain/subdomain/campaign/test hierarchy.
- `server/atlas/private-tower-views.mjs`: Tower-derived MCP declarations, with live availability explicitly unverified.
- `server/compiler/truthgraph.mjs`: reconciliation of canonical authority and provider observations.
- `worker/memory.mjs`: canonical retrieval surfaces and append-only owner review drafts.

## Minimal architecture

Canonical Drive Tower → existing authenticated read adapter → request-local semantic graph → private HTTP query → optional browser WebMCP.

Separately, existing local Python memory 1.0.1 → revision-checked Node composition → canonical graph and scored retrieval hits. This offline path is functional; it does not magically add Python or a vector database to Cloudflare Workers.

Tower identity, source revision, object identity, object version and lineage stay attached. Graphs, scores, embeddings and indexes remain derived. Similarity and graph centrality do not imply scientific confirmation. The canonical Writer and its CAS/readback protocol remain the only authority for writes.

## Graph route

`POST /api/atlas-knowledge/query` uses the same fixed Drive source, verified owner, active PIN session, same-origin checks, 16 KiB body bound, single-flight source limit, post-read session revalidation and private/no-store headers as memory browsing.

`KnowledgeQuery` and `KnowledgeView` are defined in `src/private-memory/knowledge.ts`.

- Optional query, canonical seed ID, domain/topic filters and expected Tower revision.
- Maximum depth 3, 100 nodes and 300 returned edges.
- Only canonical semantic fields determine domains/topics. Missing values are explicitly `UNMAPPED`/null. No inferred taxonomy backfill.
- Typed relations come from explicit source fields; each edge carries the originating field's JSON pointer and the source object's version/hash.
- Duplicate canonical identities are quarantined. Ambiguous cross-kind aliases never resolve by guess.
- Inactive records require explicit history mode. Graph results preserve recorded status; the graph is not an eligibility engine or temporal recommendation service.
- Metrics are computed only on the returned explicit-reference graph. A reference cycle is not necessarily a dependency cycle or blocker.
- Unresolved/excluded references contribute only a count; their IDs are not emitted.
- This scoped memory/WebMCP view excludes personal, health, Olympus and PEER domain surfaces, including nested arrays and semantic topic markers. It does not modify or remove those domains from the full authenticated owner-private Atlas runtime. Widening the browser-agent scope requires an explicit scope decision.
- Hosted lexical/graph responses honestly report the Python vector cache as not connected.

## Browser WebMCP is optional and distinct from remote MCP

The current [WebMCP draft](https://webmachinelearning.github.io/webmcp/) dated 2 October 2026 uses `document.modelContext.registerTool(tool, {signal})`. It is a draft Community Group report, not a W3C standard. The [Chrome implementation guide](https://github.com/GoogleChrome/modern-web-guidance-src/blob/main/guides/webmcp/agentic-javascript-tools/guide.md) also documents document-scoped registration and AbortSignal cleanup.

`src/private-memory/webmcp.ts` supports:

- `nexo_memory_search`: scoped canonical lexical browsing.
- `nexo_knowledge_graph`: bounded explicit relations and canonical semantic fields.
- Disabled by default; the authenticated host must deliberately enable it for the session.
- Feature-detect the current document API. The old navigator API is opt-in compatibility only, and is accepted only when it supports cleanup.
- Same-origin exposure only. No cross-origin allowlist, global polyfill, remote MCP service, credentials, arbitrary URL parameters, write tool or Writer route.
- Recheck owner/session state before and after every result; abort registrations and in-flight requests when the host's lifecycle signal aborts.
- Annotate read-only tools and untrusted result text. These annotations are descriptions, not a security boundary. Server authorization still applies.
- Unsupported browsers retain normal authenticated HTTP calls through `createKnowledgeTransport`; they are not labelled WebMCP-capable.

The UI owner should capture its narrow native transport before legacy containment, pass that closure to the bridge and ordinary UI, and pass a lifecycle AbortSignal from the authenticated host. No host/bootstrap/UI files were changed here, so registration is not automatically activated or shipped.

## Local vector + Node graph bridge

`scripts/query-memory-graph.mjs` runs the actual existing Python implementation, with its audited code-only source subset pinned by SHA-256 and version. It stages only those verified source bytes in a private temporary directory, so additional modules and cached bytecode in the original directory are not imported. It passes arguments over stdin to an isolated Python process, bounds runtime/output, verifies that the Tower bytes did not change during execution, and writes only the selected rebuildable SQLite cache. It never invokes the Writer.

Example (local paths supplied by the operator):

```sh
node scripts/query-memory-graph.mjs \
  --memory-source /path/to/audited/nexo-memory-code \
  --tower /path/to/verified-private-tower.json \
  --cache /path/to/existing-parent/derived.sqlite \
  --role LEARNER \
  --query 'distance ladder calibration'
```

The audited source subset contains the original 1.0.1 memory, live-Tower and Tower-path modules with empty package initializers. The complete distribution's nonempty initializers are intentionally not accepted without review. Existing numpy/scikit-learn dependencies are required; the script installs nothing. Cache parent must exist; symlinks, hardlinks, non-files, unsafe SQLite sidecars and source-overwriting cache destinations are refused.

`server/atlas/memory-graph-bridge.mjs` composes the result. It validates Tower/source identity, revision, canonical object, source path, pointer and entity version. It retains ranking/cosine as retrieval scores only and reconstructs titles/state from canonical records, rather than trusting cached prose. It limits output to eight scoped hits and a one-hop graph around the top eligible hit. Every graph read uses the exact role eligibility set produced by Python `Memory.eligible`, bound to that role and revision; graph expansion cannot expose a neighbor restricted to another role. Byte-identical duplicates keep the same first sorted source path in Python and Node. It preserves distinct `PYTHON_JSON_V1` and `ATLAS_JSON_V1` hashes because Python and JS float serialization can differ; neither is substituted for a Writer receipt or CAS fingerprint. A broader Python result cannot widen the browser-facing memory scope.

This CLI is not imported by the Worker or browser. A future hosted vector provider would require a separate explicit deployment/access decision; this candidate does not create one.

## Verification

- Production build and TypeScript check passed.
- Full Node suite: 64 passing tests (including the 41-test baseline).
- Actual-module smoke test, synthetic canonical Tower: Python hybrid LSA returned two eligible hits; Node composition returned two graph nodes and two explicit links, the same Tower revision, the actual model/chunker hash, and `applied:false`.
- `node test/local-memory.integration.mjs /path/to/audited/nexo-memory-code` repeats the real-module test and checks deterministic replay, unchanged Tower bytes, role-scoped graph expansion, ignored unpinned modules and refused source hardlinks.
- Local validation also used an already-authorized Tower snapshot observed at 04:10:08Z on 6 October 2026. This was an existing local snapshot, not a fresh Drive read; it returned eight scoped hybrid hits and a bounded graph with no source changes.
- No live Tower writes, new grants, public publishing, remote push, UI changes or native browser WebMCP compatibility claim.
- Registration tests use explicit mocked browser implementations. Native feature compatibility and host/UI lifecycle integration must be verified before enabling this candidate in the hosted interface.

Rollback: remove this additive candidate or revert its commit; Tower and Writer were never modified. The isolated derived cache can be rebuilt from the canonical snapshot.
