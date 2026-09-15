import { ATLAS_PROJECTION_CONTRACT, TOWER_AUTHORITY } from './contracts.mjs';

export function validateAtlasV3Snapshot(snapshot) {
  if (!snapshot?.manifest) throw new Error('ATLAS_V3_SNAPSHOT_MANIFEST_REQUIRED');
  if (snapshot.manifest.contractVersion !== ATLAS_PROJECTION_CONTRACT) throw new Error('ATLAS_V3_SNAPSHOT_CONTRACT_MISMATCH');
  if (snapshot.manifest.authority !== TOWER_AUTHORITY) throw new Error('ATLAS_V3_SNAPSHOT_AUTHORITY_MISMATCH');
  if (snapshot.manifest.projectionOnly !== true) throw new Error('ATLAS_V3_SNAPSHOT_MUST_BE_PROJECTION_ONLY');
  if (!snapshot?.graph?.root || !Array.isArray(snapshot.graph.root.nodes) || !Array.isArray(snapshot.graph.root.edges)) {
    throw new Error('ATLAS_V3_GRAPH_REQUIRED');
  }
  return snapshot;
}

export function createAtlasV3Sdk(snapshot) {
  const source = validateAtlasV3Snapshot(snapshot);
  const nodesById = new Map(source.graph.root.nodes.map(node => [node.id, node]));

  return Object.freeze({
    manifest() { return source.manifest; },
    graph(layer = 'SCIENCE') {
      if (layer === 'LEARNING') {
        const filamentIds = new Set((source.learning?.filaments || []).map(item => item.id));
        const edges = source.graph.root.edges.filter(edge => filamentIds.has(edge.source) || filamentIds.has(edge.target));
        const ids = new Set(edges.flatMap(edge => [edge.source, edge.target]));
        return { nodes: source.graph.root.nodes.filter(node => ids.has(node.id)), edges };
      }
      if (layer === 'OPERATIONS') {
        const workIds = new Set((source.operations?.works || []).map(item => item.id));
        const edges = source.graph.root.edges.filter(edge => workIds.has(edge.source) || workIds.has(edge.target));
        const ids = new Set([...workIds, ...edges.flatMap(edge => [edge.source, edge.target])]);
        return { nodes: source.graph.root.nodes.filter(node => ids.has(node.id)), edges };
      }
      return source.graph.root;
    },
    entity(id) { return source.entities?.[id] || nodesById.get(id) || null; },
    learning() { return source.learning || { filaments: [] }; },
    operations() { return source.operations || { works: [] }; },
    health() { return source.health; },
    provenance() { return source.provenance; },
    search(query) {
      const needle = String(query || '').trim().toLowerCase();
      if (!needle) return [];
      return source.graph.root.nodes.filter(node => `${node.id} ${node.label} ${node.type} ${node.domain || ''}`.toLowerCase().includes(needle));
    }
  });
}
