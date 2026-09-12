# NEXO Atlas visual QA

## Reference visual truth

- Observatory reference: `/workspace/scratch/e18e667ef038/upload/DD42538A-FEFE-4B75-A506-5344D72B8788.jpeg`.
- Graph reference: `/workspace/scratch/e18e667ef038/upload/IMG_0136(3).jpeg`.
- The references define composition, density, dark navy/cyan language, orbital clusters, labels, filaments and hierarchy. Scientific values shown in the images were not copied.

## Implementation target

- Routes: `/graphs`, `/observatory`, `/lab`, `/universe`.
- Target view: Grafos, real backend graph recorte, focus node plus hierarchical children.
- Intended viewport matrix: 1920×1080, 1440×900, 1366×768, tablet, iPhone portrait and iPhone landscape.
- Browser-rendered screenshot: not captured; no Chromium executable or connected cloud browser is available in this environment.

## Implemented graph visual pass

- R3F/WebGPU remains the interactive graph surface; no image or static graph replacement was introduced.
- Hierarchical `CONTAINS`/layout-parent relations now form deterministic orbital clusters around the focused node.
- The focused node has a dominant core and aura; structural nodes receive restrained local orbit rings.
- Central elliptical orbital scaffolding, depth variation and active-edge emphasis reinforce the 2.5D observatory language.
- HTML labels now show entity label plus type/status and remain bounded by semantic LOD.
- GPU picking uses the same focused-node geometry, preserving selection and reveal behavior.
- Camera distance adapts to compact and narrow viewports; render loop still pauses when hidden/offscreen.

## Validation evidence

- `npm test`: 224 passed.
- `npm run typecheck`: passed.
- `npm run build`: passed; Vercel build completed without errors.
- `git diff --check`: passed.
- Preview deployment: `dpl_TDqPtbJHKX6z73L1HZ7rUk7FBxzu`, state `READY`.
- External browser readback: blocked by deployment protection/browser absence; direct deployment status and build logs were read back successfully.

## Remaining gap

- Same-viewport source-vs-rendered screenshot comparison, interaction capture and visual browser QA remain blocked until a Chromium/cloud browser is available. This is intentionally not marked as visually passed.

## Final result

blocked
