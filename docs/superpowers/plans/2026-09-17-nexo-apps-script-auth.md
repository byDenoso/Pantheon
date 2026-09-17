# NEXO ONE Apps Script Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Vercel-dependent PIN/session transport with a Google Apps Script auth broker while keeping GitHub Pages as the public frontend and preserving the current NEXO session UX.

**Architecture:** The GitHub Pages React app embeds an Apps Script Web App bridge in a hidden iframe. Parent and iframe exchange a strict versioned `postMessage` protocol; Apps Script server functions validate a salted PIN hash from Script Properties, enforce rate limits in CacheService, issue opaque 8-hour session tokens, and validate/revoke them server-side. The browser stores only the opaque token in `sessionStorage`.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, Node 24 test runner, Google Apps Script HTML Service, `google.script.run`, PropertiesService, CacheService, Utilities.

**Spec:** `docs/superpowers/specs/2026-09-17-nexo-apps-script-auth-design.md`

## Global Constraints

- No plaintext PIN, PIN hash, session secret, or privileged payload may be committed to the public repository.
- PIN format remains numeric, 4–12 digits.
- Session lifetime is capped at 8 hours.
- Failed logins are limited to 5 per browser/15 minutes plus a 50/15-minute global bucket.
- Browser token storage is `sessionStorage` only.
- Every cross-origin message validates exact origin, source window, protocol version, and request ID.
- GitHub Pages remains the canonical public frontend.
- Missing bridge configuration must fail closed to PUBLIC/read-only.

---

### Task 1: Browser auth bridge protocol client

**Files:**
- Create: `nexo-one/src/auth/apps-script-bridge.ts`
- Create: `nexo-one/test/apps-script-bridge.test.mjs`

**Interfaces:**
- Produces `createAppsScriptAuthBridge(options)` with `getSession()`, `login(pin)`, `logout()`, `dispose()`.
- Produces `getStoredSessionToken()`, `setStoredSessionToken(token)`, `clearStoredSessionToken()` using `sessionStorage` only.

- [ ] **Step 1: Write failing protocol tests**

Tests must prove that the client accepts responses only when `origin`, `source`, `version`, and `requestId` all match; rejects/ignores malformed responses; times out safely; never writes PIN to any storage; and stores only returned opaque session tokens in `sessionStorage`.

- [ ] **Step 2: Run focused test and verify RED**

Run: `cd nexo-one && node --test test/apps-script-bridge.test.mjs`
Expected: FAIL because `src/auth/apps-script-bridge.ts` does not exist.

- [ ] **Step 3: Implement minimal bridge client**

Use protocol version `1`, source names `NEXO_PARENT` and `NEXO_AUTH_BRIDGE`, generated request IDs, exact bridge origin derived from configured URL, an iframe reference supplied/injected by the React layer, and a bounded request timeout. Do not persist PIN.

- [ ] **Step 4: Run focused test and verify GREEN**

Run: `cd nexo-one && node --test test/apps-script-bridge.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -am "feat(auth): add Apps Script bridge client"`

### Task 2: Apps Script server primitives and bridge shell

**Files:**
- Create: `nexo-one/apps-script-auth/Code.gs`
- Create: `nexo-one/apps-script-auth/Index.html`
- Create: `nexo-one/apps-script-auth/appsscript.json`
- Create: `nexo-one/apps-script-auth/core.mjs`
- Create: `nexo-one/test/apps-script-auth-core.test.mjs`

**Interfaces:**
- `core.mjs` exposes deterministic pure helpers for PIN format validation, salted digest derivation, constant-time byte comparison, session record validation, and limiter window calculations.
- `Code.gs` exposes `doGet`, `authStatus`, `authLogin`, `authLogout`, and administrator-only setup helper `setupNexoAuth(pin, allowedOrigin)`.

- [ ] **Step 1: Write failing server-core tests**

Tests must cover: 4–12 digit PIN validation; wrong PIN rejection; constant-time comparison behavior contract; session expiry at 8 hours; per-browser 5/15-minute limiter; global 50/15-minute limiter; successful login clearing only the per-browser bucket; missing properties yielding `configured:false`.

- [ ] **Step 2: Run focused test and verify RED**

Run: `cd nexo-one && node --test test/apps-script-auth-core.test.mjs`
Expected: FAIL because core module is absent.

- [ ] **Step 3: Implement pure core helpers**

Use SHA-256 based salted digest construction compatible with Apps Script `Utilities.computeDigest`; never include any concrete PIN/hash/secret values in source.

- [ ] **Step 4: Run focused test and verify GREEN**

Run the focused server-core test; expected PASS.

- [ ] **Step 5: Add Apps Script runtime shell**

`Code.gs` must use Script Properties (`NEXO_PIN_HASH`, `NEXO_SESSION_SECRET`, `NEXO_ALLOWED_ORIGIN`), CacheService for tokens/limiters, cryptographically random token material from UUID + server secret digest, 8-hour TTL, revocation on logout, and sanitized state/error responses. `Index.html` must accept messages only from the configured parent origin and `window.parent`, invoke `google.script.run`, and return responses only to that origin.

- [ ] **Step 6: Add static-source regression assertions**

Extend the core test to read `Code.gs`/`Index.html` and assert there is no concrete PIN, no `localStorage`, no wildcard `postMessage('*')`, and no private secret literal.

- [ ] **Step 7: Commit**

`git commit -am "feat(auth): add Apps Script auth broker"`

### Task 3: Integrate bridge into React session API

**Files:**
- Modify: `nexo-one/src/app/useSession.ts`
- Modify: `nexo-one/src/app/App.tsx`
- Create: `nexo-one/test/apps-script-session-integration.test.mjs`

**Interfaces:**
- `useSession` keeps its current return shape and error strings.
- `VITE_NEXO_AUTH_BRIDGE_URL` is the only public configuration value.

- [ ] **Step 1: Write failing integration tests**

Prove: missing URL keeps PUBLIC/read-only and `runtimeAvailable=false`; initial token restore always calls remote validation; invalid/expired token clears storage; successful login returns PRIVATE and emits existing session event; 429 maps to the current Portuguese rate-limit message; invalid PIN maps to `PIN inválido.`; logout clears local token even if remote logout fails.

- [ ] **Step 2: Run focused test and verify RED**

Run: `cd nexo-one && node --test test/apps-script-session-integration.test.mjs`
Expected: FAIL while `useSession` still calls `/api/session`.

- [ ] **Step 3: Refactor `useSession` to bridge client**

Keep UI behavior and public API stable. Create/manage the hidden iframe in the app/session layer, clear the React PIN input immediately after submit as already required, and never expose token in rendered DOM.

- [ ] **Step 4: Run focused + existing auth tests**

Run: `cd nexo-one && node --test test/apps-script-session-integration.test.mjs test/private-pin-runtime.test.mjs`
Expected: PASS, updating the old Vercel-specific regression expectations only where the transport intentionally changed.

- [ ] **Step 5: Commit**

`git commit -am "refactor(auth): route NEXO session through Apps Script"`

### Task 4: GitHub Pages build configuration and deployment guardrails

**Files:**
- Modify: `.github/workflows/nexo-one-pages.yml`
- Modify: `nexo-one/test/private-pin-runtime.test.mjs`
- Create: `nexo-one/apps-script-auth/README.md`

**Interfaces:**
- Workflow consumes non-secret repository/environment variable `VITE_NEXO_AUTH_BRIDGE_URL` if configured.
- Build remains valid without it and fails closed to public-only mode.

- [ ] **Step 1: Write failing workflow/config assertions**

Regression test must require the Pages workflow to pass `VITE_NEXO_AUTH_BRIDGE_URL` into the build without logging or embedding any PIN/hash/session secret.

- [ ] **Step 2: Run and verify RED**

Run: `cd nexo-one && node --test test/private-pin-runtime.test.mjs`
Expected: FAIL because Pages workflow lacks the bridge variable wiring.

- [ ] **Step 3: Wire Pages build variable and document Google setup**

README must contain exact operator steps: create Apps Script project, paste/version the three source files, run `setupNexoAuth` interactively with the chosen PIN and `https://bydenoso.github.io`, deploy as Web App, record `/exec` URL, configure `VITE_NEXO_AUTH_BRIDGE_URL` in GitHub without storing the PIN, then rebuild Pages. It must explicitly say not to paste PIN/hash/session secret into GitHub or chat logs.

- [ ] **Step 4: Run full check**

Run: `cd nexo-one && npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -am "ci(auth): wire Apps Script bridge into Pages"`

### Task 5: Browser verification and branch completion

**Files:**
- Modify as needed: `nexo-one/test/browser.mjs`

**Interfaces:**
- Browser verification may mock the bridge iframe transport but must exercise the real React session behavior.

- [ ] **Step 1: Add RED browser assertions**

Cover PUBLIC initial load, valid bridge login -> PRIVATE, response from wrong origin ignored, reload restoration only after validation, logout -> PUBLIC.

- [ ] **Step 2: Run browser verification and observe expected failure**

Run the repository's existing Chromium browser verification command/workflow.

- [ ] **Step 3: Make minimal fixture/harness changes**

Do not weaken origin/source checks in production code to satisfy tests.

- [ ] **Step 4: Run `npm run check` and browser verification**

Both must pass with no warnings that indicate auth fallback or secret leakage.

- [ ] **Step 5: Inspect generated bundle**

Search `dist` for `NEXO_PIN_HASH`, `NEXO_SESSION_SECRET`, representative setup markers, and `localStorage`; none may expose credentials or forbidden persistence.

- [ ] **Step 6: Commit**

`git commit -am "test(auth): verify Apps Script private session flow"`

### Task 6: PR verification and deployment handoff

**Files:** none unless verification finds a defect.

- [ ] **Step 1: Push/update PR #145 and run CI**

CI must pass `npm run check` plus desktop/mobile Chromium verification.

- [ ] **Step 2: Review diff for security invariants**

Confirm no plaintext PIN/hash/secret, no wildcard message target, no `localStorage`, no client-only authorization of private payloads.

- [ ] **Step 3: Merge only after green CI**

After merge, confirm the GitHub Pages workflow succeeds on `main`.

- [ ] **Step 4: Operator deployment handoff**

The only unavoidable manual Google-side actions are creating/deploying the Apps Script Web App and setting its Script Properties/setup PIN. Do not request the PIN in chat. Once the Web App URL exists, set only the non-secret bridge URL in the Pages build configuration and validate end-to-end.