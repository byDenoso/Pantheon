# Read-only Sites MCP candidate

This is prepared code, not a live connection. It does not create a real grant,
apply hosted schemas, enable flags, change Sites access, or connect a plugin.
The owner’s requested 30-day, PIN-approved access is still pending explicit
approval. The candidate metadata adds `mcp` only to the existing Site project.

## Implemented surface

- `POST /mcp` uses the official `@modelcontextprotocol/server` 2.0.0
  `McpServer` and stateless `WebStandardStreamableHTTPServerTransport`.
- Initialization and discovery contain public tool descriptions only.
- Exactly one read-only tool, `nexo_search`, accepts only
  `query`, optional integer `k` from 1 to 50, and optional `mode: lexical`.
- The tool calls the existing trusted lexical adapter and real fixed Drive
  revision validator. Results include evidence citations or an explicit
  no-evidence result. Retrieved text is untrusted data.
- No graph/history/auto placeholder, provider/model call, source write,
  person/client/health tool, OAuth replacement, bearer secret, or local Codex
  MCP configuration is introduced.

## Authorization and fail-closed behavior

Both `NEXO_ATLAS_MCP=owner-pin-current-mcp-v13` and the existing
`NEXO_ATLAS_RETRIEVAL=faithful-contextual-router-v13` are required. They are
not set by this candidate. Missing/wrong flags disable the endpoint.

Sites supplies its trusted `oai-authenticated-user-id` and verified email.
The existing owner-email allowlist and pinned owner ID must match. A browser
cookie, submitted user ID, arbitrary Authorization header, or service identity
cannot replace that identity. Caller arguments cannot select another role,
policy, source, generation, or historical view.

The separate candidate `worker/mcp/grants.sql` is NOT a hosted migration.
The narrow authorization record is bound to the owner user ID, SHA-256 of the
current salted PIN credential, fixed LEARNER role, reviewed lexical policy,
and `tower-scientific-current-readonly-v13` scope. Duration is at most 30 days from creation.
The random grant ID is an internal change detector, not a bearer credential,
and is never returned by the browser lifecycle API or the MCP tool.

Primary reads recheck identity, the current owner PIN and grant together before
and after retrieval. Source transport revision/size is validated twice. The
current index head is rechecked before final authorization; the adapter’s
last asynchronous read is authorization. MCP checks authorization again after
SDK handling. Revocation, PIN rotation, expiry, ownership changes, changed
head, missing source access, and stale source fail closed. Results are no-store.
No authorization or query-result cache is maintained.

## Prepared browser grant lifecycle

`/api/atlas-mcp/grant` is a guarded browser API, not an MCP tool. It requires the
existing owner identity and current browser PIN session. State changes also
require the exact same origin.

- GET: current active/expiry status, without credentials or private records.
- POST: additionally requires the separately approved deployment setting
  `NEXO_ATLAS_MCP_GRANT_APPROVAL=owner-pin-readonly-30d-v1` and the explicit
  JSON body `{ "confirm": "owner-pin-readonly-30d-v1", "days": 30 }`.
  Only integer durations of 1–30 days are accepted. Creation/renewal is an
  atomic conditional write bound to the live browser session and current PIN.
- DELETE: revokes the owner’s grant immediately. It does not require the
  creation gate. The next MCP call and in-flight final check deny access.

Neither Site sign-in, PIN login, MCP initialization, tool discovery, nor tool
calls create or renew a grant. The guarded private Memory view includes status/expiry, an explicit 30-day
consent checkbox, a creation button disabled until server approval is enabled,
and a revoke button. It uses only a fixed-route lifecycle transport captured
before the legacy network guards; no generic fetch handle is exposed.
Activation must use this explicit browser consent step after approval, never
create a grant silently through an MCP call. Browser logout ends the one-hour browser
session; the explicitly approved grant lasts until its expiry or revocation.
Changing the PIN invalidates existing grants.

## Tests and limits

`node test/workerd-readonly-mcp.mjs` runs the official MCP SDK Client against
actual local workerd and ephemeral D1. The fixture owner, PIN, grant, corpus,
revision and connector responses are all synthetic. Network access is blocked.
It exercises SDK initialize/listTools/callTool, actual positive lexical results
and no-evidence results, plus auth/expiry/revocation/PIN/source/head races and
unsupported input paths. It does not prove a deployed Site’s identity boundary,
connector consent, imported production index or plugin connection.

Worker bundles must select the SDK’s workerd conditions and bundle dependencies;
otherwise Node's dynamic-code schema validator is unsuitable for Workers.
The build and affected runtime tests now set those conditions explicitly.

## Activation handoff after approval

1. Review/obtain the owner’s specific approval for the 30-day persistent,
   read-only grant and publication. Preserve current Site/App/plugin identity.
2. Apply approved schemas/import and enable the reviewed gates. Never enable
   a stale/fixture-only production index or manufacture missing Drive consent.
3. Have the owner complete the existing verified browser PIN session and the
   explicit grant-consent operation. Verify grant creation and revocation on
   the hosted surface without revealing its internal ID or PIN hash.
4. Use Sites `get_site(include_mcp_connection: true)` on this existing Site.
   Reuse the returned private plugin ID with plugin setup. Do not create a
   second App/plugin or run `codex mcp add` / `codex mcp login`.
5. If the setup UI is unavailable or already installed: Plugins → Personal →
   Created by you → the existing Site plugin → Install or Connect as needed.
6. Verify an actual read-only tool call after connection, including authorized
   evidence and an appropriate denied case. Until then, remote chat access is
   pending. This does not make knowledge available to every chat automatically.

## UI verification limit

The private grant UI has build, TypeScript and narrow transport/consent unit
coverage. Its prepared synthetic Playwright suite has NOT executed: Chromium
aborts before starting with `socket() failed: Operation not permitted` in
`process_singleton_posix.cc`, including an approved elevated retry. No browser
screenshots or visual/interaction pass are claimed. The browser suite covers
approval-disabled state, consent, repeated clicks, expiry, revoke, uncertain
response recovery, private navigation, mobile width and session teardown once
a supported browser runtime is available. Visual/interaction verification is
still an activation gate; do not publish merely to obtain a preview.

## Hardened1.3 integration

The common endpoint now advertises four implemented tools: `nexo_capabilities`, `nexo_search`, `nexo_neighbors`, and `nexo_trace`. Search accepts auto/exact/lexical; graph tools follow bounded explicit authorized edges. Historical dates, diff/get, arbitrary filters and neural modes remain unsupported and are not advertised. The capability call performs fresh authorization, source-revision and verified-index checks; it is not merely a static status interface. The grant scope is current scientific LEARNER read-only and expires after at most30days. Each runtime must connect separately and complete an actual call.

## Automatic current-cache refresh

A capability call encountering a missing/expired/revision-stale index advances one bounded, server-owned refresh step under the same fresh owner grant. An expiring D1 lease and credential-bound cursor coordinate concurrent clients. `INDEX_REFRESHING` carries no retrieved evidence; repeat capabilities until `AUTHENTICATED` within40steps. Searches never answer from a stale fallback. A local real SDK test changed the source revision, rebuilt the cache, excluded the removed record and returned the new revision. Hosted revision-change verification remains a canary requirement.

Current runtime switches (non-secret): `NEXO_ATLAS_RETRIEVAL=faithful-contextual-router-v13`, `NEXO_ATLAS_RETRIEVAL_PRODUCER=fixed-learner-current-index-v13`, `NEXO_ATLAS_MCP=owner-pin-current-mcp-v13`, `NEXO_ATLAS_MCP_GRANT_APPROVAL=owner-pin-readonly-30d-v1`. No grant row is inserted by deployment or migration; the owner must explicitly consent through the guarded PIN UI.
