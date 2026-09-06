/** Explicit public boundary; never add snapshots, backend readers or credentials.
 *  lib/audit.mjs and lib/learning.mjs are server-side projections and stay out. */
export const frontendFiles=[
 'index.html','styles.css','app.mjs','graph3d.mjs',
 'lib/model.mjs','lib/atlas-api.mjs','lib/graph-session.mjs',
 'ui/tokens.css','ui/visual-config.mjs','ui/theme.mjs','ui/map-data.mjs',
 'ui/dom.mjs','ui/metrics.mjs','ui/inspector.mjs','ui/filters.mjs','ui/learning-view.mjs','ui/audit-view.mjs',
 'webmcp/tools.mjs'
];
