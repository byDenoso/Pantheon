# NEXO Lite MCP entry contract

The patch beside this file was prepared against the live TCC paths `gpt/skills/nexo-lite-0.5.0.md` and `gpt/skills/nexo-master-router-0.5.0.md`, read on2026-10-06. It has not been pushed to TCC and does not install plugins or alter schedules.

Each consuming chat/task must discover its connected NEXO tools and make a real `nexo_capabilities({})` call. The call authenticates the current owner grant, verifies the current fixed Drive source and scoped D1 generation, and reports only this runtime's capabilities. Read-only access never implies a Writer grant. A missing/denied/stale connection is an explicit dependent-operation block, not permission to present old chat memory or GitHub state as current Tower data.

Apply the instruction patch only after the real common endpoint is available and a connection canary has passed. Do not change schedule timing, enablement, or role assignments as a side effect.

If `nexo_capabilities` returns `INDEX_REFRESHING`, continue that same tool after its bounded retry interval, for at most40steps. Only `AUTHENTICATED` with a current verified source allows the dependent operation. The server advances a fixed-source private cache under the current owner grant; the caller cannot choose a source, role or cursor, and Tower is never written.
