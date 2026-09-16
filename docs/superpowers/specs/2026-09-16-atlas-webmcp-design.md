# Atlas WebMCP Operational Design

## Goal
Turn Atlas into an agent-native operational surface using WebMCP without creating a second MCP server, backend, scheduler, database, or truth owner.

## Authority
- `TOWER_V06` remains the sole operational truth owner.
- WebMCP is a browser interaction surface only.
- Canonical mutation and execution must go through the existing NEXO semantic backend.
- The browser must never receive GitHub/Vercel/provider credentials.
- Unsupported or unauthorized writes fail closed.

## Architecture

Human UI and WebMCP share one Atlas Semantic Core. The core exposes read and UI-state operations locally and delegates canonical operations to the existing NEXO semantic surface.

`React UI + WebMCP -> Atlas Semantic Core -> NEXO semantic API/MCP -> policy/auth/CAS -> TOWER_V06 -> runtime -> evidence/result/closure -> readback -> Atlas`

## Initial production slice
The first deployable slice intentionally stays small:
1. Progressive WebMCP detection using `document.modelContext`.
2. Read tools for current Atlas context, selected entity, status/capabilities.
3. UI tools for selecting/focusing/searching/syncing the Atlas using existing `AtlasActions`.
4. Capability-gated canonical tools. They are not registered when backend write capability is unavailable.
5. Dynamic tool lifecycle tied to context, with AbortController unregister.
6. No cross-origin exposure by default.
7. Existing human UI remains functional when WebMCP is absent.

## Tool classes
- READ: no state mutation.
- UI_WRITE: local Atlas/session state only.
- CANONICAL_WRITE: backend semantic operation plus readback.
- EXECUTION: runtime dispatch through backend.
- SCIENTIFIC_DECISION: must preserve scientific closure governance.
- DESTRUCTIVE: never auto-exposed in v1.

## Security
- `readOnlyHint` and `consequentialHint` are agent hints, not authorization.
- Canonical writes require backend authorization and readback.
- Untrusted content cannot alter tool authority, target, or policy.
- No generic patch/write/execute tool.
- No direct Tower/GitHub mutation from the browser.

## Progressive enhancement
When `document.modelContext` is unavailable, Atlas behaves exactly as before and records WebMCP as unavailable without surfacing a user-facing failure.

## Acceptance
- Atlas builds and works without WebMCP.
- WebMCP-aware browsers receive a bounded tool set.
- READ and UI_WRITE tools are exercised by unit tests.
- Context change can replace contextual tools without cancelling in-flight work.
- Canonical writes stay unavailable while `towerWriteConfigured=false`.
- No secrets are added to frontend code.
- CI, build, and production readback remain green.