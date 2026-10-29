# Private integration on the complete-public v10 baseline

This branch is based on the already-published v10 source `20f374eab5d8947b586d3e737d894ad55fa769bb`. Its 215 complete public summaries and server/client completeness guards remain unchanged. Private memory candidate `81ac279` and read-only graph/WebMCP candidate `bc9afb9` are merged here, without a separate deployment.

## Installed private tools

The private Host installs the requested session-only browser bridge only after accepting a valid authenticated runtime generation. The original public shell never imports tool definitions or source records. The existing owner identity and PIN requirements still gate every actual read.

The host binds tool calls to that runtime's exact Tower revision, aborts registration and outstanding requests on generation change, navigation or teardown, and asks the existing parent to log out on a server 401. The current `document.modelContext` API is feature-detected. No legacy navigator registration is autoenabled. Unsupported or policy-denied browsers retain regular authenticated HTTP browsing, with no fake native-availability claim.

The application explicitly enables its two read-only tools for the requested private integration; the reusable adapter still defaults to disabled. Neither tool can prepare an edit, apply a draft, invoke a Writer, call arbitrary URLs or access other providers. Owner review drafts remain in the separate memory UI and remain unsaved until an authorized existing Writer transport is connected.

The only edited host files are `src/private-legacy/install.ts` (narrow native read transport captured before containment) and `src/private-legacy/Host.tsx` (lifecycle). The visual frontend work must be merged separately from its reviewed private presentation patch before one coordinated release. No domain/origin allowlist change is included.

Verification before the presentation merge: production build, TypeScript, and all 76 unit/integration tests passed. The four public artifact/guard files match v10 exactly. Native browser implementation availability and the final presentation still need their own verification; successful unit tests do not claim a hosted vector provider or a Writer connection.

The reviewed private presentation was subsequently merged from `eca9dfaaa24a9e14844c80e6d84af2a8be2f97f4`, including guarded TTF font support and canonical topic/subdomain identity fixes. Its optional memory presentation slot now mounts the real owner memory browser and a status line driven by the actual session WebMCP mode. The separate memory visual patch preserves the existing read/propose callbacks. Final merged build, TypeScript and 81 tests passed; the public 215 summaries remain byte-for-byte unchanged. The synthetic browser script was updated for the new accessible labels, but has not been rerun in this executor because local browser access is blocked. Native browser availability is reported dynamically, not assumed.

## Current vector boundary and smallest future option

The real local Python LSA + Node graph adapter works and is tested; it is not a hosted Worker vector service. The hosted interface currently supports canonical lexical and explicit-graph reads. No new private embedding copy, database, provider, credential or API endpoint for vector retrieval is created by this branch.

A possible next step, for approval rather than execution here, is a versioned, scope-restricted derived retrieval artifact in the existing private Drive. The existing Python module would generate it from an exactly identified Tower snapshot; the server could read a fixed approved file through the existing read-only connector if that grant supports it. The artifact would need source revision/hash, role eligibility, chunk/model versions and expiry. The server would reject stale source revisions and return bounded cited hits, never ship the full vectors to a browser or public asset. This requires an explicitly approved artifact destination and update workflow, and validation of Worker memory/runtime costs. No such current usable artifact was established in this task, and none was uploaded.

The alternative is an authenticated existing server-side Python retrieval transport, if one is verified later. Creating a new service or long-lived credential is outside this integration.
