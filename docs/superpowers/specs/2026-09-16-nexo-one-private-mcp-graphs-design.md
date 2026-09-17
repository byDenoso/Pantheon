# NEXO ONE — Private Access, MCP Integration and Graph Projections

Date: 2026-09-16
Status: Proposed design approved in chat; awaiting written-spec review before implementation
Repository: `byDenoso/Pantheon`
Application: `nexo-one/`

## 1. Goal

Evolve NEXO ONE from a public integrity/dashboard surface into a two-plane cockpit driven by one projection model:

- **PUBLIC**: GitHub Pages, public snapshots, public Atlas/Science/MCP, no private data or secrets.
- **PRIVATE**: authenticated runtime, private providers, personal cockpit, operational graphs, eligible low-risk actions, human gates for medium/high-risk actions.

The frontend remains non-authoritative. Truth, authority, capability, action, effect/readback and projections remain distinct.

## 2. Existing capabilities to reuse

The existing backend already provides the core primitives and must be extended rather than replaced:

- `/api/session`
- `/api/personal`
- `/api/personal/action`
- `/api/world`
- `/api/system`
- `/api/mcp`
- `server/auth/session.mjs`
- `server/auth/session-route.mjs`
- `server/mcp/server.mjs`
- Universal/System projection contracts under `src/contracts/`
- Atlas graph contracts and 3D renderer
- GitHub Pages static compilation of `system.json` and `world-public.ndjson`

## 3. Authentication and authorization

### 3.1 PIN

The desired human PIN is `2301`.

The literal PIN MUST NOT be present in:

- frontend source or generated bundle
- source maps
- static Pages artifacts
- query strings
- localStorage/sessionStorage
- public JSON/NDJSON
- MCP public payloads

The PIN is converted to the existing `scrypt` representation and stored only as `NEXO_PASSWORD_HASH` in the private runtime environment. `NEXO_SESSION_SECRET` remains private and at least 32 bytes.

### 3.2 Session

Reuse the current HttpOnly session design:

- HttpOnly
- Secure outside localhost
- SameSite=Strict
- signed session cookie
- bounded lifetime
- logout invalidates the cookie
- expired/invalid session falls back to PUBLIC

### 3.3 Authorization policy

Authentication unlocks private data but is not universal authorization.

- PUBLIC: read-only public projection.
- PRIVATE + LOW risk + capability PASS + executable contract + expected readback: may execute without an extra approval prompt.
- PRIVATE + MEDIUM/HIGH risk: MUST still require explicit Human Gate approval.
- BLOCKED/UNVERIFIED/UNKNOWN capability: MUST NOT execute autonomously.

## 4. Deployment topology

### 4.1 Public plane

GitHub Pages remains the public surface:

`GitHub/NEXO public adapters -> build-pages-system.mjs -> system.json + world-public.ndjson -> Pages UI`

The public build must not depend on Vercel or any private backend to render the public cockpit.

### 4.2 Private plane

A backend runtime serves same-origin private routes:

- `/api/session`
- `/api/personal`
- `/api/personal/action`
- `/api/world`
- `/api/system`
- `/api/mcp`

GitHub Pages must never attempt cross-origin cookie authentication. Public Pages may redirect to the private runtime while preserving the active view/graph mode.

If the private runtime is unavailable, the UI reports that explicitly and never simulates successful authentication.

## 5. Single projection chain

Canonical data flow:

`SOURCES -> NEXO ADAPTERS -> WORLD STATE -> SYSTEM STATE -> UNIVERSAL PROJECTION BUS -> API/MCP -> GRAPH PROJECTIONS -> UI`

No graph view owns truth. No graph gets a private shadow database. Every rendered entity preserves, where applicable:

- `source_ref`
- `source_revision`
- `fingerprint`
- `checked_at`
- `freshness`
- `authority_class`
- `state`
- `provider`
- derivation/provenance metadata

## 6. MCP integration

Preserve current read-only MCP tools and add cockpit-focused read tools only where the existing contracts cannot answer the question cleanly.

Candidate additions:

- `get_system_state`
- `get_world_state`
- `get_capabilities`
- `get_execution_runs`
- `get_graph`
- `get_learning_state`
- `get_provider_health`

Public MCP tools must only expose public-safe projections.

Private access must be explicit in the server-side access context. A public MCP call must never become private because the browser happens to be authenticated elsewhere.

No frontend duplication of MCP business logic.

## 7. Graph projections

The existing Atlas 3D remains **General Map**.

Add deterministic graph modes derived from `SystemState` and/or existing MCP/public projection state.

### 7.1 General Map

Existing structural system graph. Preserve behavior, search, filtering, 3D layout and entity inspector.

### 7.2 Operational Graph

Primary chain:

`ACTION -> CAPABILITY -> RUNTIME -> EFFECT -> READBACK`

Must expose:

- action status
- capability and capability status
- runtime
- execution run
- effect key
- blocker
- retries
- receipt reference
- readback state
- timestamps
- fingerprints

### 7.3 Truth / Evidence Graph

Primary semantic chain:

`DOMAIN -> CLAIM -> TEST -> EVIDENCE -> SOURCE`

Supported relations include:

- SUPPORTS
- CONTRADICTS
- VERIFIES
- DERIVES_FROM
- DEPENDS_ON
- OWNS

The visual model must not equate size, brightness or proximity with truth unless the contract explicitly defines that meaning.

### 7.4 Capability Graph

Primary chain:

`CAPABILITY -> PROVIDER -> RUNTIME -> OPERATION -> EVIDENCE`

Designed to answer: **What can NEXO actually do now?**

Statuses:

- PASS
- UNVERIFIED
- UNKNOWN
- BLOCKED
- RETIRED_RUNTIME

### 7.5 Learning Graph

Derived from learning filaments and execution evidence:

`OBSERVATION -> FILAMENT -> EFFECT`

and

`ACTION -> READBACK -> LEARNING`

Distinguish SEMANTIC and PROCEDURAL. Display weight, support, contradiction, evidence refs, boundary and status. Weight is not truth.

### 7.6 NEXO Live Graph

Operational topology showing:

- providers
- MCP tools
- capabilities
- automations
- actions
- runs
- issues
- contexts
- campaigns/tests/evidence
- personal state when PRIVATE

In PUBLIC mode, private entities may appear only as opaque `AUTH_REQUIRED` placeholders with no private payload.

## 8. Atlas navigation

Add a graph-mode selector with:

- General
- Operations
- Truth / Evidence
- Capabilities
- Learning
- NEXO Live

Preferred deep links:

- `#atlas/general`
- `#atlas/operations`
- `#atlas/truth`
- `#atlas/capabilities`
- `#atlas/learning`
- `#atlas/nexo`

If the existing router cannot support nested hashes without regression, encode the mode deterministically while preserving back/forward, refresh restoration and shareability.

## 9. Private-access UX

From the public surface, avatar `D` opens **Private Access** behavior.

On the private runtime, show a PIN dialog with:

- PIN input
- Enter
- generic invalid-PIN error
- logout when authenticated

Never display the expected PIN.

After successful authentication:

- mark session as PRIVATE
- refresh world/system/private providers
- expose private personal views
- expose private graph nodes
- preserve the active view/graph mode

## 10. Rate limiting

Add backend brute-force protection around PIN verification.

Target behavior:

- 5 failed attempts within the window
- temporary 15-minute lock
- generic failure response
- no secret/user enumeration

Implementation must be compatible with the chosen runtime. If runtime instances are ephemeral, rate-limit storage must not pretend to be globally durable; document the guarantee actually provided.

## 11. Overview / Sources / Execution improvements

### Overview

Zero counters must include coverage context, e.g. `0 blockers · coverage 3/7`, so missing providers cannot masquerade as health.

### Sources / Integrity

Avoid giant inline capability dumps. Show summary counts and expandable details:

- PASS
- UNVERIFIED
- BLOCKED
- other states

### Execution

When runs exist, present the full auditable sequence:

`ACTION -> CAPABILITY -> RUNTIME -> EFFECT -> READBACK`

with timestamps, status, fingerprint, provider and receipt.

### Entity tables

GitHub issue rows should prioritize human-readable title/status/domain/relation and keep raw IDs as secondary identifiers.

## 12. Mobile behavior

All graph modes must work on mobile:

- graph selector as compact dropdown/sheet
- filters as drawer
- inspector as bottom sheet
- canvas constrained to viewport
- deep links preserved

## 13. Error semantics

Never collapse these distinct states:

- provider unavailable
- auth required
- no data
- stale snapshot
- partial coverage
- runtime unavailable
- actual healthy zero

The UI must communicate the observed state, not infer health from absence.

## 14. Test contract

Tests are written before implementation for each behavior.

Mandatory coverage:

1. PIN literal absent from public source/bundle/artifact checks.
2. Wrong PIN -> 401.
3. Correct PIN hash verification -> PRIVATE session.
4. Cookie is HttpOnly and Secure where applicable.
5. Logout -> PUBLIC.
6. Expired session -> PUBLIC.
7. Public world/system contain no private provider payload.
8. Public MCP never returns private data.
9. Operational graph faithfully maps runs.
10. Truth graph maps SUPPORTS/CONTRADICTS/VERIFIES correctly.
11. Capability graph maps capability/provider/runtime/evidence correctly.
12. Learning graph preserves support/contradiction/boundary semantics.
13. Graph deep links restore on refresh/back/forward.
14. Existing Atlas General mode remains functional.
15. Mobile renders every graph mode without overflow.
16. `system.json` works without backend.
17. `world-public.ndjson` works without backend.
18. GitHub Pages build has no Vercel dependency for public rendering.
19. MEDIUM/HIGH actions retain Human Gate after authentication.
20. LOW-risk autonomous action requires PASS capability and expected readback path.
21. Runtime-unavailable state is explicit and cannot fake PRIVATE.

## 15. Implementation sequence

Implementation must follow TDD and preserve deployability after each stage:

1. auth/rate-limit regression tests
2. private-session UX integration
3. MCP access-scope tests and cockpit read tools
4. graph projection builders as pure/testable modules
5. graph-mode navigation/deep links
6. Atlas UI rendering for each graph
7. mobile behavior
8. Overview/Sources/Execution cleanup
9. full `npm run check`
10. browser tests
11. GitHub Pages build and public readback
12. private runtime deploy/readback
13. MCP readback
14. action authorization/readback validation

## 16. Completion criteria

Do not claim completion until all applicable checks are evidenced:

- final SHA
- unit/integration/browser tests passing
- public Pages URL responds with current build
- `system.json` and `world-public.ndjson` read back successfully
- private runtime responds
- PIN-authenticated session readback succeeds using the hashed configuration
- public/private separation verified
- MCP public/private scopes verified
- graph modes verified
- remaining blockers explicitly listed

## 17. Non-goals

This change does not:

- make the frontend authoritative
- add private data to GitHub Pages
- create a second truth database for graphs
- make all actions autonomous
- infer learning without evidence/readback
- use 3D as decorative animation

## 18. Security note

The literal human PIN appears in this design document only because the user explicitly selected it as configuration input. Implementation artifacts that are delivered to browsers must not contain it. Operational deployment should configure only its derived server-side hash and private session secret.
