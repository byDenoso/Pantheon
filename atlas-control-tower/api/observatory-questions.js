import atlasHandler from './atlas.js';
import { observatoryQuestionsPayload } from '../lib/observatory-contract.mjs';

function graphRequest(req, focus) {
  let body = '';
  const response = {
    statusCode: 200,
    setHeader() {},
    end(value) { body = String(value || ''); }
  };
  const query = new URLSearchParams({ focus, depth: '1', limit: '250' });
  return atlasHandler({ ...req, method: 'GET', url: `/api/graph?${query}` }, response).then(() => {
    if (response.statusCode >= 400) throw new Error(`GRAPH_READ_${response.statusCode}`);
    return JSON.parse(body || '{}');
  });
}

/**
 * Dedicated semantic read model for Observatório and Resumo do Universo.
 * It composes the already-authoritative graph route so this endpoint cannot
 * silently become a second database reader. Tests stay in campaign metadata;
 * only DOMAIN and CAMPAIGN nodes are returned to the graph UI.
 */
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const root = await graphRequest(req, 'system:SCIENCE');
    const domains = Array.isArray(root.nodes) ? root.nodes.filter(node => String(node.type || '').toUpperCase() === 'DOMAIN') : [];
    const domainGraphs = await Promise.all(domains.map(domain => graphRequest(req, domain.id)));
    const campaigns = domainGraphs.flatMap(graph => Array.isArray(graph.nodes) ? graph.nodes.filter(node => String(node.type || '').toUpperCase() === 'CAMPAIGN') : []);
    // Testes are intentionally not merged into the spatial payload. We only
    // read their count from each campaign so the Observatory can expose a
    // truthful text metric without turning the map into a test-node cloud.
    const campaignGraphs = await Promise.all(campaigns.map(campaign => graphRequest(req, campaign.id)));
    const nodeById = new Map();
    const edgesById = new Map();
    for (const graph of [root, ...domainGraphs]) {
      for (const node of Array.isArray(graph.nodes) ? graph.nodes : []) nodeById.set(node.id, node);
      for (const edge of Array.isArray(graph.edges) ? graph.edges : []) edgesById.set(edge.id || `${edge.source}:${edge.target}`, edge);
    }
    for (const graph of campaignGraphs) {
      const campaign = nodeById.get(graph.focus);
      if (!campaign) continue;
      const testCount = Array.isArray(graph.nodes) ? graph.nodes.filter(node => String(node.type || '').toUpperCase() === 'TEST').length : 0;
      nodeById.set(graph.focus, { ...campaign, metadata: { ...(campaign.metadata || {}), testCount } });
    }
    const payload = observatoryQuestionsPayload({ nodes: [...nodeById.values()], edges: [...edgesById.values()] }, {
      freshness: root.freshness || 'LIVE',
      source: root.source || 'science_v1',
      sourceVersion: root.sourceVersion || ''
    });
    res.statusCode = 200;
    res.end(JSON.stringify(payload));
  } catch (error) {
    res.statusCode = 502;
    res.end(JSON.stringify({ contract: 'NEXO_ATLAS_OBSERVATORY_QUESTIONS_V1', status: 'DATA_UNAVAILABLE', error: 'OBSERVATORY_GRAPH_READ_FAILED', detail: String(error?.message || error).slice(0, 180) }));
  }
}
