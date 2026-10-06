# Private workspace presentation

The private entry opens the existing interactive 3D web. A small navigation layer connects the web, source-declared domains, tests and operations. Older views remain reachable and have a return-to-web link.

## Paths

- Empty private frame hash or `#/teia`: existing 3D web, search, inspector and controls.
- `#/teia/dominios`: source-declared domains, including Olympus when declared.
- `#/teia/dominio/{domain}`: that domain's tests.
- `#/teia/testes`: all current tests; `?view=results` or `?view=pending` filters the list.
- `#/teia/teste/{id}`: question/result followed by Data, Recipe, Execution and Review.
- `#/teia/operacao`: explicit human decisions, running work, blocked work and waiting work.
- `#/teia/organograma`: existing hierarchy view.

Source text remains in its original language. The new navigation/list/detail/operation labels support PT-BR and English. Some inherited 3D controls still use their existing Portuguese wording.

## Authority and boundaries

The existing authenticated Host validates a runtime before mounting this UI. All views receive the same `SystemState` and reuse `buildLab`, the existing 3D renderer, normalizers and state-label formatter. No new data store, authentication, route on the server, upstream read, scientific enum, recipe or schedule is introduced.

The lists count records present in the current snapshot; partial or unavailable source coverage is shown. A finished execution alone does not count as a scientific result. Pending review can overlap with a recorded result. Automatic dependencies are kept separate from explicit human decisions. Typed actions and their canonical WORK record are deduplicated.

Recipes are read from existing canonical recipe fields. If missing, the view says so, while retaining the recorded method and preregistered criteria. It does not generate a recipe. Raw execution and review remain separate, and result limitations are preserved.

Operations is a read-only presentation. The link to the existing decision workflow navigates only; it does not approve or execute anything. The public allowlist and public endpoint remain empty and unchanged.

## Local synthetic preview

`node scripts/build-private-workspace-preview.mjs /absolute/output.html` produces a self-contained HTML artifact with 24 clearly synthetic tests across three domains. It uses the actual private presentation and interactive renderer. It has no real data, no backend login, no network access and only in-memory display preferences. Older legacy screens are intentionally not included in this standalone preview; they remain available in the integrated app.

The preview builder is separate from production and imports fixtures only in its dedicated script. The production private entry imports no preview fixture.

## Verification

Run TypeScript, the complete unit suite with bounded concurrency, style checks and both builds. The focused workspace tests cover route encoding, domain coverage, Olympus, result/pending separation, canonical recipe/evidence rendering, WORK/action deduplication, explicit human gates, local links and non-mutation. The real-browser script is `node test/atlas-private-workspace.browser.mjs`; it uses only a synthetic backend and should run in a supported browser environment. An unexecuted browser script is not visual or GPU validation.
