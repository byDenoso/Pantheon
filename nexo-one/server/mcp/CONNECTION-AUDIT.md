# MCP / Tower connection audit — 2026-10-11

The connected NEXO plugin and this checkout expose different contracts. Local
changes below are verified against this checkout; they do not establish recovery
of the connected plugin or a production deployment.

A subsequent source audit identified the current plugin implementation in the
existing Atlas Sites project, checked out at `/workspace/atlas-site`, with the
four matching tools in `worker/mcp/route.mjs`. Its separate local audit and
corrections are documented in that checkout's `worker/mcp/README.md`.

| Surface | Observed tools / behavior | Source and authorization |
| --- | --- | --- |
| Connected plugin | `nexo_capabilities`, `nexo_search`, `nexo_neighbors`, `nexo_trace` | Tool descriptions refer to a current owner-authorized Tower connection and a private LEARNER index. No endpoint URL or mutable tool was exposed. |
| Checkout scientific MCP | 15 tools in `server/mcp/server.mjs`, including `get_capabilities`, `search_atlas`, and `get_science_state` | Sanctioned public publication via `server/adapters/research-snapshot.mjs`; the public scientific records are derived from Tower. HTTP authentication remains enforced by the enclosing handler. |
| Checkout operational MCP | 11 role tools, including an Executor-only scientific queue request | Tools are registered only for an authenticated principal. Canonical private Tower reads verify Drive identity, body MD5, and revision readback. Mutations use the existing Writer intent/spool path. |

The initial plugin call returned `RETRIEVAL_UNAVAILABLE`. Two subsequent bounded
diagnostic calls returned `RETRIEVAL_UNAVAILABLE` for capabilities and
`AUTHORIZED_INDEX_UNAVAILABLE` for exact search, with `INVALID_ARGUMENT` in the
search error metadata. No `AUTHENTICATED`, `INDEX_REFRESHING`, retry bound, or
successful retrieval was returned. These results do not establish whether the
cause is authorization, a missing/stale index, transport, or server-side error
classification. The checkout does not contain these plugin tool names or error
strings, so substituting its tools for the plugin would invent compatibility.

## Verified local corrections

- Provider snapshots and shared in-flight reads now include a digest of the
  effective source/credential environment in their scope. Different repositories,
  credentials, and connector subjects cannot receive another scope's cached
  records. Cache keys and client diagnostics do not contain raw credentials.
- Cache invalidation advances a generation. Earlier in-flight reads can finish
  for their existing consumers but cannot repopulate the cleared cache or remove
  a newer in-flight entry. Provider and legacy OAuth caches have finite bounds.
- Legacy Google OAuth token caching now keys on the credentials that obtained
  the token instead of sharing one process-global token across credentials.
- Public MCP errors and capability health retain allowlisted distinctions for
  input errors, missing authorization, rate limits, timeouts, cancellation, and
  unavailable sources. Upstream bodies and arbitrary error messages stay private.
- Publication reads enforce the 16 MiB limit while streaming, cancel oversized
  streams, reject URLs containing credentials, and avoid starting a read for an
  already cancelled consumer. Concurrent consumer cancellation remains isolated.
- Canonical Tower verification now shares one 45-second server deadline across
  metadata, body, and revision readback. A supplied caller signal can shorten
  that deadline. Every phase retains safe authorization/throttling errors without
  weakening the existing identity, size, hash, or revision checks.

Regression coverage is in `provider-cache-isolation.test.mjs`,
`google-token-cache.test.mjs`, `research-snapshot-boundary.test.mjs`,
`mcp-errors.test.mjs`, and `tower-read-boundary.test.mjs`, alongside the existing
MCP, operational SDK, canonical Tower, and scientific facade suites. Regressions
were reproduced before applying their corresponding fixes. Tests use synthetic
fixtures and local mocked transports; this audit did not read or mutate live
Tower through an alternate path, push, or deploy.

## Connected plugin follow-up

The matching source has now been identified in the Atlas Sites project. Compare
its published tool schemas, deployed revision, authorization binding, and
capability response with that implementation when validating a deployment.
On that server, inspect the private index health and the bounded rebuild state
returned by capabilities, and correct any mapping that reports an unavailable
index as invalid caller arguments. Continue only within capabilities and
authorization actually returned by the server; keep Tower canonical and its
indices reconstructible.
