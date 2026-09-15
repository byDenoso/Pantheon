# NEXO Capability MCP Implementation Plan

1. Add failing MCP capability tests covering bootstrap, registry/frontier, contract validation, execution frontier, closure diagnosis and fail-closed mutations.
2. Add pure capability projection helpers under `nexo-one/server/mcp/capabilities.mjs`.
3. Extend `tools.mjs` with the new read tools while preserving existing public sanitization.
4. Extend `server.mjs` with governed write tool definitions and optional injected `mutateCanonical`; fail closed when absent.
5. Wire the HTTP MCP route only to mutation capability that is explicitly available; never invent a persistence fallback.
6. Update `NEXO_BOOTSTRAP.md` and MCP README contract so new chats discover the canonical ingress/frontier behavior.
7. Add canonical ingress contract to `NEXO-Obsidian-Vault` on its feature branch.
8. Run CI/tests, verify readback and inspect diff.
9. Update the three active NEXO automation prompts to discover/use the capability/frontier contract when available and fall back to the existing canonical Tower path when not.
10. Open PRs; do not merge to `main` without an explicit integration decision.

Acceptance:
- Existing read-only tools remain functional and private rows remain excluded.
- New bootstrap explicitly names Tower as canonical truth.
- `FALSIFIED`/`RETIRED` do not appear in the default hypothesis frontier.
- Frozen-contract validation reports missing required fields deterministically.
- Closure diagnosis never invents missing reconciliation.
- Write tools cannot mutate without an injected governed writer.
- With a fake injected writer in tests, write tools emit stable canonical mutation envelopes and return writer readback.
