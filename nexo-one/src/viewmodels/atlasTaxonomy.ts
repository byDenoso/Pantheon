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

export function atlasSubdomainOf(node: GraphNode): string {
  const token = tokenOf(node);
  const top = atlasTopDomainOf(node);

  if (top === 'OLYMPUS') {
    if (/MIQUEIAS|OLYCAUSE/.test(token)) return 'Miquéias · Cause/Nulls';
    if (/COMPPHYS|OLYPHYS/.test(token)) return 'Composição corporal · Física computacional';
    if (/PIVOT|OLYPIVOT/.test(token)) return 'Pivot & Null cross-checks';
    return 'Olympus · Outros ativos';
  }

  if (top === 'SCIENCE') {
    if (/H0-LCDM|H0HOM|H0-HOMOGENEITY|T-H0/.test(token)) return 'Expansão do Universo · H0';
    if (/PEER[.-]DETECTION|PEER\.DETECTION|A_LENS|EDE/.test(token)) return 'Consistência cosmológica · Peer Detection';
    if (/GROWTH-LSS|GZSB|EROSITA|S8/.test(token)) return 'Estrutura em larga escala · Growth/LSS';
    if (/DE-MICROPHYSICS|T-DEM|DARK-SECTOR|DARK_ENERGY/.test(token)) return 'Energia escura & setor escuro';
    if (/BLINDSPOT-LIGHT|BLIND26/.test(token)) return 'Propagação da luz · Blindspots';
    if (/MEGASTRUCTURE|T-MEGA/.test(token)) return 'Megaestruturas · ΛCDM';
    if (/GALAXY-REDSHIFT|GZ-01|GZ01/.test(token)) return 'Galáxias · Redshift 3D';
    if (/AVERAGING-PROBLEM/.test(token)) return 'Transferência metodológica · Averaging';
    if (node.type === 'CAPABILITY') return 'Capacidades científicas';
    return 'Science · Outros ativos';
  }

  if (node.domain === 'ENGINEERING' || /ACT-ENG|REQUEST-INGRESS|SIDECHANNEL/.test(token)) {
    return 'Engenharia, infraestrutura & segurança';
  }
  if (/T-LEARN|LEARN/.test(token)) return 'Operações NEXO';
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
