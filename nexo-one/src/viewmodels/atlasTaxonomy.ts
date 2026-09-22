import type { GraphNode } from '../contracts/system.ts';

export type AtlasTopDomain = 'NEXO' | 'SCIENCE' | 'OLYMPUS';
export const ATLAS_TOP_DOMAINS: AtlasTopDomain[] = ['NEXO', 'SCIENCE', 'OLYMPUS'];

const tokenOf = (node: GraphNode): string =>
  [node.campaign_id, node.id, node.label, node.summary].filter(Boolean).join(' ').toUpperCase();

export function atlasTopDomainOf(node: GraphNode): AtlasTopDomain {
  const token = tokenOf(node);
  if (/CAMP-OLY-|T-OLY|OLYMPHYS|OLYCAUSE|OLYPIVOT/.test(token) || node.domain === 'OLYMPUS') return 'OLYMPUS';
  if (node.domain === 'ENGINEERING') return 'NEXO';
  if (node.type === 'CAPABILITY' && /(PEER\.|COSMOLOGY|GZ0|GZSB|IDM_)/i.test(node.id)) return 'SCIENCE';
  if (/CAND-SCI/.test(token) || node.domain === 'SCIENCE') return 'SCIENCE';
  return 'NEXO';
}

export function atlasSemanticSubdomain(
  domain: AtlasTopDomain,
  hint: string,
): string | null {
  const token = String(hint || '').toUpperCase();

  if (domain === 'OLYMPUS') {
    if (/MIQUEIAS|OLYCAUSE/.test(token)) return 'Miquéias · Cause/Nulls';
    if (/COMPPHYS|OLYPHYS|BODY\s*COMPOSITION/.test(token)) return 'Composição corporal · Física computacional';
    if (/PIVOT|OLYPIVOT|NULL\s*CROSS/.test(token)) return 'Pivot & Null cross-checks';
    if (/BODYBUILDING|OLYMPUS/.test(token)) return 'Olympus · Outros ativos';
    return null;
  }

  if (domain === 'SCIENCE') {
    if (/H0-LCDM|H0HOM|H0-HOMOGENEITY|T-H0|HUBBLE/.test(token)) return 'Expansão do Universo · H0';
    if (/PEER[ ._-]?DETECTION|PEER\.DETECTION|PEER\s+INFERENCE|A_LENS|EDE/.test(token)) return 'Consistência cosmológica · Peer Detection';
    if (/GROWTH-LSS|GZSB|EROSITA|\bS8\b/.test(token)) return 'Estrutura em larga escala · Growth/LSS';
    if (/DE-MICROPHYSICS|T-DEM|DARK-SECTOR|DARK_ENERGY|DARK\s+ENERGY/.test(token)) return 'Energia escura & setor escuro';
    if (/BLINDSPOT-LIGHT|BLIND26/.test(token)) return 'Propagação da luz · Blindspots';
    if (/MEGASTRUCTURE|T-MEGA/.test(token)) return 'Megaestruturas · ΛCDM';
    if (/GALAXY-REDSHIFT|GZ-01|GZ01|GALAXY-3D-MAP/.test(token)) return 'Galáxias · Redshift 3D';
    if (/AVERAGING-PROBLEM|AVERAGING\s+SENSITIVITY/.test(token)) return 'Transferência metodológica · Averaging';
    return null;
  }

  if (/ACT-ENG|REQUEST-INGRESS|SIDECHANNEL|INFRASTRUCTURE|SECURITY/.test(token)) {
    return 'Engenharia, infraestrutura & segurança';
  }
  if (/RUNTIME|\bMCP\b|NEXO\s+EXECUTION|EXECUTION\s*[·:-]/.test(token)) return 'Runtime, MCP & execução';
  if (/T-LEARN|NEXO\s+LEARNING|LEARNING|GOVERNANCE|OPERATIONS|OPERAÇÕES/.test(token)) return 'Operações NEXO';
  return null;
}

export function atlasSubdomainOf(node: GraphNode): string {
  const token = tokenOf(node);
  const top = atlasTopDomainOf(node);
  const semantic = atlasSemanticSubdomain(top, token);
  if (semantic) return semantic;

  if (top === 'OLYMPUS') return 'Olympus · Outros ativos';
  if (top === 'SCIENCE') {
    if (node.type === 'CAPABILITY') return 'Capacidades científicas';
    return 'Science · Outros ativos';
  }
  if (node.type === 'CAPABILITY') return 'Runtime, MCP & execução';
  return 'Operações NEXO';
}

export const atlasTopNodeId = (domain: AtlasTopDomain): string => `atlas.top.${domain.toLowerCase()}`;
export const atlasSubdomainNodeId = (domain: AtlasTopDomain, subdomain: string): string =>
  `atlas.subdomain.${domain.toLowerCase()}.${encodeURIComponent(subdomain)}`;

export function atlasSubdomainFromId(id: string): { domain: AtlasTopDomain; subdomain: string } | null {
  const match = /^atlas\.subdomain\.([^.]+)\.(.+)$/.exec(id);
  if (!match) return null;
  const domain = match[1]!.toUpperCase() as AtlasTopDomain;
  if (!ATLAS_TOP_DOMAINS.includes(domain)) return null;
  try {
    return { domain, subdomain: decodeURIComponent(match[2]!) };
  } catch {
    return null;
  }
}
