const STRUCTURAL_TYPES = new Set(['SYSTEM','DOMAIN','CAMPAIGN']);
const SCIENTIFIC_TYPES = new Set(['DOMAIN','CAMPAIGN','HYPOTHESIS','DECISION_HYPOTHESIS','CLAIM','TEST','RESULT','DATASET','MODEL','PROBE','PUBLICATION']);

const TYPE_DEPTH = {
  SYSTEM:-260, DOMAIN:-210, CAMPAIGN:-145,
  HYPOTHESIS:-70, DECISION_HYPOTHESIS:-70, CLAIM:-60,
  TEST:15, PROBE:20, MODEL:30, DATASET:45,
  RESULT:105, PUBLICATION:125,
  SOURCE:190, SOURCE_REF:230, RUNTIME:260, ARTIFACT:280
};

export function temporalWeight(value, nowValue = Date.now()) {
  if (!value) return 0.22;
  const at = new Date(value).getTime();
  const now = new Date(nowValue).getTime();
  if (!Number.isFinite(at) || !Number.isFinite(now)) return 0.22;
  const hours = Math.max(0, (now - at) / 3_600_000);
  if (hours <= 1) return 1;
  const days = hours / 24;
  const weight = Math.exp(-days / 12);
  return Math.max(0.12, Math.min(0.98, Math.round(weight * 1000) / 1000));
}

export function semanticLayerForZoom(zoom) {
  const z = Number(zoom) || 1;
  if (z < 0.95) return 'macro';
  if (z < 1.95) return 'scientific';
  return 'provenance';
}

function nodeTimestamp(node) {
  return node.updatedAt || node.activityAt || node.observedAt || node.createdAt || node.sourceRefs?.map(x=>x?.observedAt).filter(Boolean).sort().at(-1) || null;
}

function enrichNode(node, semanticLayer, now) {
  const type = node.subtype === 'HYPOTHESIS' && node.type === 'CLAIM' ? 'HYPOTHESIS' : node.type;
  const activity = temporalWeight(nodeTimestamp(node), now);
  return {
    ...node,
    visualType: type,
    semanticLayer,
    temporalWeight: activity,
    zBand: TYPE_DEPTH[type] ?? 0,
    activityAt: nodeTimestamp(node)
  };
}

function filterEdges(edges, nodeIds, semanticLayer) {
  return (edges || [])
    .filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map(e => ({...e, semanticLayer}));
}

export function projectGraph(graph, {view='scientific', now=Date.now()} = {}) {
  const nodes = graph?.nodes || [];
  let kept;
  if (view === 'macro') kept = nodes.filter(n => STRUCTURAL_TYPES.has(n.type));
  else if (view === 'scientific') kept = nodes.filter(n => SCIENTIFIC_TYPES.has(n.type) || (n.type === 'CLAIM' && n.subtype === 'HYPOTHESIS'));
  else if (view === 'provenance') return synthesizeProvenance(graph, {focus:graph?.focus, now});
  else kept = nodes;

  const outNodes = kept.map(n => enrichNode(n, view, now));
  const ids = new Set(outNodes.map(n => n.id));
  return {
    ...graph,
    semanticView:view,
    nodes:outNodes,
    edges:filterEdges(graph?.edges, ids, view),
    visualTotal:outNodes.length,
    sourceContract:graph?.source || 'v1'
  };
}

function sourceId(ref) {
  const source = String(ref?.source || 'UNKNOWN').replace(/\s+/g,'_');
  const id = String(ref?.sourceId || ref?.source || 'unknown').replace(/\s+/g,'_');
  return `source:${source}:${id}`;
}

function refId(ownerId, ref, index) {
  const location = String(ref?.sourceRef || `ref-${index}`).replace(/[^a-zA-Z0-9:_-]+/g,'_').slice(0,96);
  return `source-ref:${ownerId}:${location}`;
}

export function synthesizeProvenance(graph, {focus=graph?.focus, now=Date.now()} = {}) {
  const baseNodes = (graph?.nodes || []).map(n => enrichNode(n, 'provenance', now));
  const baseEdges = (graph?.edges || []).map(e => ({...e, semanticLayer:'provenance'}));
  const nodesById = new Map(baseNodes.map(n => [n.id,n]));
  const edges = [...baseEdges];

  for (const owner of baseNodes) {
    (owner.sourceRefs || []).forEach((ref,index) => {
      const sid = sourceId(ref);
      if (!nodesById.has(sid)) {
        nodesById.set(sid, enrichNode({
          id:sid,
          type:'SOURCE',
          label:ref.source || 'Source',
          summary:ref.sourceId || '',
          authority:'PROVENANCE',
          observedAt:ref.observedAt || null,
          metadata:{sourceId:ref.sourceId || null}
        }, 'provenance', now));
      }
      if (!edges.some(e => e.source===owner.id && e.target===sid && e.type==='OBSERVED_BY')) {
        edges.push({
          id:`trace:${owner.id}:${sid}`,
          source:owner.id,
          target:sid,
          type:'OBSERVED_BY',
          authority:'PROVENANCE',
          semanticLayer:'provenance'
        });
      }
      if (ref.sourceRef) {
        const rid = refId(owner.id, ref, index);
        if (!nodesById.has(rid)) {
          nodesById.set(rid, enrichNode({
            id:rid,
            type:'SOURCE_REF',
            label:ref.sourceRef,
            summary:ref.sourceId || '',
            authority:'PROVENANCE',
            observedAt:ref.observedAt || null,
            metadata:{source:ref.source || null, sourceId:ref.sourceId || null, sourceRef:ref.sourceRef}
          }, 'provenance', now));
        }
        edges.push({
          id:`trace-ref:${sid}:${rid}`,
          source:sid,
          target:rid,
          type:'LOCATED_AT',
          authority:'PROVENANCE',
          semanticLayer:'provenance'
        });
      }
    });
  }

  return {
    ...graph,
    focus,
    semanticView:'provenance',
    nodes:[...nodesById.values()],
    edges,
    visualTotal:nodesById.size,
    sourceContract:graph?.source || 'v1'
  };
}
