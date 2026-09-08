/** Explicit public boundary; never add snapshots, backend readers or credentials.
 *  lib/audit.mjs, lib/learning.mjs, lib/naming.mjs, lib/datasource.mjs,
 *  lib/adapters.mjs, lib/projections.mjs and lib/neon-read.mjs are server-side
 *  projections and readers, and stay out. ui/projection-state.mjs mirrors the
 *  projection states in its own const so the browser never has to download the
 *  builder; test/projections.test.mjs fails if the two lists drift apart. */
export const frontendFiles=[
 'index.html','styles.css','app.mjs','graph3d.mjs','assets/atlas-observatory-bg.svg',
 'lib/model.mjs','lib/graph-contract.mjs','lib/atlas-api.mjs','lib/graph-session.mjs',
 'ui/tokens.css','ui/official-dashboard.css','ui/premium-v2.css','ui/reference-one.css','ui/reference-deck.css','ui/cosmos.css','ui/visual-config.mjs','ui/theme.mjs','ui/map-data.mjs','ui/workspace.mjs','ui/cockpit-copy.mjs',
 'ui/projection-layout.mjs','ui/projection-state.mjs','ui/layer-console.mjs','ui/command-palette.mjs',
 'ui/orbital-layout.mjs','ui/filaments.mjs','ui/decision-summary.mjs','ui/learning-graph.mjs','ui/control-tower.mjs',
 'ui/dom.mjs','ui/metrics.mjs','ui/inspector.mjs','ui/filters.mjs',
 'ui/provenance.mjs',
 'ui/recorte-view.mjs','ui/blackbox-view.mjs','webmcp/tools.mjs'
];
