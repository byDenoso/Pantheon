/** Explicit public boundary; never add snapshots, backend readers or credentials.
 *  lib/audit.mjs, lib/learning.mjs, lib/naming.mjs, lib/datasource.mjs and
 *  lib/adapters.mjs are server-side projections and stay out. */
export const frontendFiles=[
 'index.html','styles.css','app.mjs','graph3d.mjs',
 'lib/model.mjs','lib/graph-contract.mjs','lib/atlas-api.mjs','lib/graph-session.mjs',
 'ui/tokens.css','ui/official-dashboard.css','ui/premium-v2.css','ui/control-tower.css','ui/galactic-theme.css','ui/observatory-v2.css','ui/reference-one.css','ui/visual-config.mjs','ui/theme.mjs','ui/map-data.mjs','ui/workspace.mjs','ui/cockpit-copy.mjs',
 'ui/orbital-layout.mjs','ui/filaments.mjs','ui/decision-summary.mjs','ui/learning-graph.mjs','ui/control-tower.mjs',
 'ui/dom.mjs','ui/metrics.mjs','ui/inspector.mjs','ui/filters.mjs',
 'ui/provenance.mjs',
 'ui/recorte-view.mjs','ui/blackbox-view.mjs','webmcp/tools.mjs'
];
