# NEXO ONE GitHub Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the NEXO ONE frontend, including Atlas 3D, on GitHub Pages without depending on a Vercel deployment token.

**Architecture:** GitHub Actions builds the Vite frontend with a Pages-specific base path, snapshots the public `SystemState` from the existing NEXO API into the static artifact, and deploys `dist/` with the official Pages actions. The frontend reads a build-time configurable endpoint so normal Vercel behavior remains unchanged while Pages reads the colocated static snapshot.

**Tech Stack:** React 19, Vite 8, Babylon.js 9, GitHub Actions, GitHub Pages.

**Spec:** User-approved request to deploy NEXO ONE on GitHub Pages.

## Global Constraints

- Preserve normal `/api/system` behavior outside the Pages build.
- GitHub Pages build uses `/Pantheon/` as the Vite base.
- Pages publishes only public frontend assets and the already-public SystemState projection.
- No deployment credential is required.

---

### Task 1: Freeze Pages runtime contract

**Files:**
- Create: `nexo-one/test/pages.test.mjs`

**Interfaces:**
- Consumes: Vite config and remote adapter source.
- Produces: contract requiring Pages base-path support and configurable SystemState endpoint.

- [ ] **Step 1:** Add a test that asserts the Vite config reads `GITHUB_PAGES` and the remote adapter reads `VITE_SYSTEM_ENDPOINT` while retaining `/api/system` fallback.
- [ ] **Step 2:** Run `npm test -- --test-name-pattern="GitHub Pages"` and verify RED.
- [ ] **Step 3:** Implement the minimal runtime configuration.
- [ ] **Step 4:** Run the focused test and full `npm run check` and verify PASS.

### Task 2: Add GitHub Pages deployment workflow

**Files:**
- Create: `.github/workflows/nexo-one-pages.yml`

**Interfaces:**
- Consumes: `nexo-one` build and public `https://nexo-one-two.vercel.app/api/system` endpoint.
- Produces: `github-pages` deployment artifact at the repository Pages URL.

- [ ] **Step 1:** Build with `GITHUB_PAGES=1` and `VITE_SYSTEM_ENDPOINT=./system.json`.
- [ ] **Step 2:** Fetch the public SystemState into `nexo-one/dist/system.json` and fail closed if the response is invalid JSON.
- [ ] **Step 3:** Upload `nexo-one/dist` using `actions/upload-pages-artifact@v4`.
- [ ] **Step 4:** Deploy with `actions/deploy-pages@v4` using `pages: write` and `id-token: write`.
- [ ] **Step 5:** Verify workflow completion and live URL readback.
