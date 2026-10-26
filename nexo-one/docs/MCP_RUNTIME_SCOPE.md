# Scoped MCP runtime migration (candidate)

This change corrects scientific role discovery (Cientista/LEARNER and Engenheiro/ADVISOR), derives reported execution from the verified CONTROL and adds opt-in authentication scope. It does not activate credentials, connect client products, grant new permissions or replace the Writer.

`NEXO_MCP_PRINCIPALS_JSON` is a server-side JSON registry, schema `NEXO_MCP_RUNTIME_PRINCIPALS_V1`, with a `principals` array. Each row has exactly: `subject` (64 lowercase hex), `runtime` (short lowercase identifier), `token_sha256` (64 lowercase hex), `roles`, `allowed_tools`, `expires_at` (UTC), and boolean `revoked`. Use secure deployment configuration; never put real bearer values in prompts, this repository or logs. The registry stores hashes only. It is not an OAuth authorization server.

Scopes apply to operational tool discovery and invocation. Existing public read-only tools remain public. Role permissions and Writer validation still apply. Empty, malformed, duplicate, expired or revoked grants cannot acquire authority through the shared legacy bearer key. When the registry is absent, existing authentication behavior is preserved. Owner-cookie authentication is unchanged.

Before enabling the registry, explicitly migrate every required bearer caller. Registry mode deliberately prevents fallback to the old shared key AND the prior Writer OIDC bearer path. Preserve required Writer access with a reviewed configuration rather than enabling this option blindly. Rollback must not accidentally restore a revoked client through legacy authentication.

Local tests cover three synthetic runtime identities, role isolation, tool denial, revoked/expired/invalid grants, and an SDK call through the existing operational queue adapter. The write fixture produces PENDING_WRITER, not APPLIED. It is not a real Google Drive, Gemini, ChatGPT automation or deployed-server canary.

The facade still supports four named roles. Generic proposals for the other scientific roles require a separate reviewed integration using existing Writer validation and receipt contracts. No scheduler or scientific contract changes belong in this patch.

Deployment acceptance: run the suite against the lockfile; resolve the actual private source binding; verify each real runtime independently; then run an explicitly approved non-scientific delivery canary with stable identity, receipt and canonical effect readback. A duplicate call must not duplicate the effect. Never treat missing authorization as an empty knowledge base. Do not infer Gemini web/Spark connectivity from CLI/API support.
