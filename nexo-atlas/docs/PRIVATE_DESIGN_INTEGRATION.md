# Current private workspace design and cosmic playback

This release combines the current workspace repair, illustrative cosmic motion and the visual layer delivered by Claude. It is based on the existing private application, not the older demonstration snapshot that Claude used.

## Design integration

- `src/private-design/private-design.css` and its two local gas images inherit the public typography, blue, light/dark palette, cards and subtle motion.
- `PrivateNav.tsx` renders the existing route contracts. The current workspace remains responsible for routing, data, refresh and the optional memory slot.
- `current-workspace.css` adapts the visual layer to the current 52 px phone header and bottom navigation. Three routes stay visible; the remaining routes use the More disclosure. The current web stage geometry is preserved.
- The real `AgentBoardView` and its canonical, revision-bound source adapter are unchanged. The demonstration board and fixture adapter from Claude were not imported.
- CSS stretched-link overlays are disabled so source details and other controls within cards remain usable. Mobile overflow-link hiding and an inward canvas focus indicator have explicit integration fixes.
- The build permits the two JPEG images as guarded assets. They are absent from public static output, alongside all other private workspace assets.

## Timeline and illustration

The current web engine keeps its graph, dates and controls. Illustrative dark-matter halos and dark-energy expansion use the existing drawing surfaces and are explicitly labeled as illustrative, with no physical scale. Timeline rates are 0.25×, 0.5× and 1×, initially 0.5×. Pause, seek, resume, hidden-tab suspension and reduced-motion behavior are covered by deterministic tests. Dates and undated-record handling remain source-grounded.

## Verification

- TypeScript: `node node_modules/typescript/bin/tsc --noEmit`
- Full private/public/Worker build: `npm run build`
- Unit/security contracts: `npm test`
- Synthetic SSR: `node test/private-design.render.mjs`, `node test/private-agent-board.render.mjs`, `node test/cosmic-playback.render.mjs`
- Source formatting: `git diff --check`

The local browser preview could not be opened by the available cloud-browser runtime. Earlier headless browser attempts also failed at the runtime's socket boundary. Therefore combined screenshot inspection and interactive login → navigation → mural → web → timeline → Back/reload/logout verification have **not** passed. SSR and source checks do not establish those browser results. Real owner sign-in, PIN, connected-source consent, iOS/Safari, Firefox, touch and GPU performance remain unverified.

Claude's 301 demonstration checks and screenshots apply only to its older synthetic demonstration. They are design references, not results for this release. No real private records, source snapshots or credentials were sent to Claude.

`test/private-design-preview.mjs` is an optional local fixture preview. It uses only synthetic records and a clearly fictional test code; it does not authenticate a real person or connect to private sources. It is not part of the deployed asset surface.
