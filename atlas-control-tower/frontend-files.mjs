/** Explicit public boundary; never add snapshots, backend readers or credentials.
 *  lib/audit.mjs, lib/learning.mjs, lib/naming.mjs, lib/datasource.mjs and
 *  lib/adapters.mjs are server-side projections and stay out. */
export const frontendFiles=[
 'index.html','styles.css','app.mjs','graph3d.mjs',
 'lib/model.mjs','lib/graph-contract.mjs','lib/atlas-api.mjs','lib/graph-session.mjs',
 'ui/tokens.css','ui/visual-config.mjs','ui/theme.mjs','ui/map-data.mjs',
 'ui/dom.mjs','ui/metrics.mjs','ui/inspector.mjs','ui/filters.mjs',
 'ui/learning-view.mjs','ui/audit-view.mjs','ui/provenance.mjs','ui/data-view.mjs',
 'webmcp/tools.mjs'
];
