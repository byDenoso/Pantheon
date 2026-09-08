/** Explicit browser-source boundary. Vite bundles these into dist/; backend readers,
 * Durable Runner internals and credentials remain outside the frontend graph. */
export const frontendFiles=[
 'index.html','styles.css','vite.config.ts','tsconfig.json',
 'src/main.tsx','src/App.tsx','src/state/useAtlasSession.ts','src/styles/react-atlas.css',
 'src/scene/types.ts','src/scene/semantic-lod.ts','src/scene/createRenderer.ts','src/scene/gpu-picking.ts','src/scene/GpuPicking.tsx',
 'src/scene/materials.ts','src/scene/InstancedNodes.tsx','src/scene/InstancedFilaments.tsx','src/scene/AtlasCanvas.tsx','src/scene/LabelOverlay.tsx',
 'lib/model.mjs','lib/graph-contract.mjs','lib/atlas-api.mjs','lib/graph-session.mjs',
 'ui/cockpit-copy.mjs','ui/official-dashboard.css','ui/premium-v2.css','ui/reference-one.css'
];
