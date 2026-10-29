# Current Sites MCP audit — 2026-10-11

The current NEXO plugin's four tools are implemented in this Site's
`worker/mcp/route.mjs`: `nexo_capabilities`, `nexo_search`, `nexo_neighbors`, and
`nexo_trace`. This is a distinct surface from the older Pantheon
`nexo-one/server/mcp` scientific/operational catalog. The source checkout was
identified as the existing Atlas Sites project; this audit made local changes
and used synthetic tests, without deploying or creating a live source grant.

## Discovery compatibility

The previous endpoint wired SDK 2.0 through only
`WebStandardStreamableHTTPServerTransport`. A valid modern `server/discover`
request was rejected with HTTP 400 and an unsupported `2026-07-28` protocol
error. The route now uses the SDK's protocol classifier and modern handler for
modern requests while preserving stateless JSON responses for legacy clients.
Both paths share identical tool definitions, request limits, origin checks,
security headers, and pre/post authorization. Discovery and tool descriptions
do not query D1 or Drive; data tools still require the current verified Sites
owner and an active PIN-bound LEARNER grant.

## Safe failure reporting

MCP tool failures now include `structuredContent` with explicit `error_code`,
`diagnostic`, and `available:false`. Browser retrieval and MCP share the same
failure classifier. This avoids treating an unavailable index or failed source
as an invalid caller argument. Reviewed distinctions include:

| Condition | Error code | Behavior |
| --- | --- | --- |
| Invalid query/options | `INVALID_ARGUMENT` | Reject before accessing the source. |
| Missing authorized index | `INDEX_UNAVAILABLE` | Return no evidence; capabilities remains the only bounded rebuild entry point. |
| Stale or changed generation | `STALE_INDEX` | Return no stale fallback or partial result. |
| Connector reauthentication required | `SOURCE_REAUTHENTICATION_REQUIRED` | Preserve the safe connector status and `REAUTHORIZE_CONNECTOR` recovery action. |
| Connector throttling | `RATE_LIMITED` | Preserve only a bounded provider retry interval when present. |
| Unknown source/storage failure | `SOURCE_UNAVAILABLE` | Sanitize messages and omit provider bodies, URLs, credentials, and records. |

The reported hosted Drive status `reauthentication_required` is separate from
MCP protocol compatibility. A code fix does not establish renewed provider
authorization. It must remain explicit until the owner reconnects using the
existing Sites consent flow. The route does not change PIN policy, grants,
identity headers, connector selection, Tower identity, or permissions.

Capability refresh still advances one existing server-controlled cache job
step and never writes Tower. Clients may repeat only a returned
`INDEX_REFRESHING` state, respecting its retry interval and the existing bound
of 40 steps. Index failures or provider reauthentication are not an invitation
to bypass MCP or construct a second source of truth.

`test/mcp-protocol.test.mjs` covers modern discovery, legacy compatibility,
metadata isolation, and denied data calls. `test/retrieval-errors.test.mjs`
covers safe failure categories. `test/workerd-readonly-mcp.mjs` exercises the
actual SDK, Worker and ephemeral D1, including a missing index, connector
reauthentication, and mid-query revocation. All test identities, corpus data,
PINs, grants and connector responses are synthetic; outbound access is denied.
