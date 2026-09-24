import type { GraphNode } from '../contracts/system.ts';

export type AtlasTopDomain = 'NEXO' | 'SCIENCE' | 'OLYMPUS';
export const ATLAS_TOP_DOMAINS: AtlasTopDomain[] = ['NEXO', 'SCIENCE', 'OLYMPUS'];

const tokenOf = (node: GraphNode): string =>
  [
    node.parent_subdomain,
    node.semantic_description,
    node.semantic_state,
    node.campaign_id,
    node.id,
    node.label,
    node.summary,
  ].filter(Boolean).join(' ').toUpperCase();

export function atlasTopDomainOf(node: GraphNode): AtlasTopDomain {
  if (node.semantic_domain === 'OLYMPUS') return 'OLYMPUS';
  if (node.semantic_domain === 'SCIENCE') return 'SCIENCE';
  if (node.semantic_domain === 'ENGINEERING') return 'NEXO';
  const token = tokenOf(node);
  if (/CAMP-OLY-|T-OLY|OLYMPHYS|OLYCAUSE|OLYPIVOT/.test(token) || node.domain === 'OLYMPUS') return 'OLYMPUS';
  if (node.domain === 'ENGINEERING') return 'NEXO';
  if (node.type === 'CAPABILITY' && /(PEER\.|COSMOLOGY|GZ0|GZSB|IDM_)/i.test(node.id)) return 'SCIENCE';
  if (/CAND-SCI/.test(token) || node.domain === 'SCIENCE') return 'SCIENCE';
  return 'NEXO';
}

/**
 * Conservative semantic router used by Learning filaments.
 * Returns only a strong subdomain match. It deliberately has no generic
 * "Outros ativos" fallback because filaments should fall back to the domain hub
 * rather than claim a false semantic precision.
 */
export function atlasSubdomainHint(
  domain: AtlasTopDomain,
  signal: string,
  entityType?: GraphNode['type'],
): string | null {
  const token = String(signal || '').toUpperCase();

  if (domain === 'OLYMPUS') {
    if (/MIQUEIAS|OLYCAUSE/.test(token)) return 'Cause/Nulls';
    if (/COMPPHYS|OLYPHYS|BODY\s*COMPOSITION|COMPOSI[CÇ][AÃ]O\s*CORPORAL/.test(token)) {
      return 'Composição corporal · Física computacional';
    }
    if (/PIVOT|OLYPIVOT|NULL\s*CROSS/.test(token)) return 'Pivot & Null cross-checks';
    return null;
  }

  if (domain === 'SCIENCE') {
    if (/H0-LCDM|H0LCDM|H0HOM|H0-HOMOGENEITY|T-H0|SH0ES|HUBBLE/.test(token)) {
      return 'Expansão do Universo · H0';
    }
    if (/PEER[.\-\s]DETECTION|PEER\.DETECTION|A_LENS|EDE/.test(token)) {
      return 'Consistência cosmológica · Peer Detection';
    }
    // A campaign is routed by its scientific object, not by incidental words in
    // its description. This keeps DDE×LSS campaigns inside Dark Energy even
    // when the question mentions growth, megastructures or ΛCDM anomalies.
    if (entityType === 'CAMPAIGN' && /\bDDE\b|DYNAMIC[ -]?DARK[ -]?ENERGY|DARK_ENERGY|DARK\s+ENERGY/.test(token)) {
      return 'Energia escura';
    }
    if (/DE-MICROPHYSICS|T-DEM|\bDDE\b|DYNAMIC[ -]?DARK[ -]?ENERGY|DARK_ENERGY|DARK\s+ENERGY/.test(token)) {
      return 'Energia escura';
    }
    if (/DARK-SECTOR|DARK\s+SECTOR|INTERACTING[ -]?DARK/.test(token)) {
      return 'Setor escuro';
    }
    if (/MEGASTRUCTURE|T-MEGA|GIANT[ -]?ARC|BIG[ -]?RING/.test(token)) return 'Megaestruturas cosmológicas';
    if (/GROWTH-LSS|GZSB|EROSITA|S8|LARGE[ -]?SCALE|LSS/.test(token)) {
      return 'Estrutura em larga escala · Growth/LSS';
    }
    if (/BLINDSPOT-LIGHT|BLIND26|PROPAGA[CÇ][AÃ]O.*LUZ/.test(token)) {
      return 'Propagação da luz · Blindspots';
    }
    if (/GALAXY-REDSHIFT|GALAXY-3D|GZ-01|GZ01|REDSHIFT\s*3D/.test(token)) {
      return 'Galáxias · Redshift 3D';
    }
    if (/AVERAGING-PROBLEM|AVERAGING\s+PROBLEM/.test(token)) {
      return 'Transferência metodológica · Averaging';
    }
    if (entityType === 'CAPABILITY' && /SCI|COSMO|CAMB|CLASS/.test(token)) return 'Capacidades científicas';
    return null;
  }

  if (/ACT-ENG|REQUEST-INGRESS|SIDECHANNEL|INFRA|SECURITY|HOSTING|GITHUB/.test(token)) {
    return 'Engenharia, infraestrutura & segurança';
  }
  if (entityType === 'CAPABILITY' || /RUNTIME|MCP|EXECUTOR|PRODUCER|ADAPTER|CANARY/.test(token)) {
    return 'Runtime, MCP & execução';
  }
  if (/T-LEARN|LEARN|NEXO\s+EXECUTION|METALEARNING|PROCEDURAL/.test(token)) return 'Operações NEXO';
  return null;
}

/**
 * SEMANTIC_TAXONOMY_V1 ids -> Atlas station labels. Topic entries win over
 * their subdomain so distinct stations (3D map, megastructures) survive.
 * This is the only place presentation names meaning.
 */
const SEMANTIC_STATIONS: Record<string, string> = {
  'science.cosmology.h0': 'Expansão do Universo · H0',
  'science.cosmology.dark_energy': 'Energia escura',
  'science.cosmology.dark_matter': 'Matéria escura',
  'science.cosmology.lss_growth': 'Estrutura em larga escala · Growth/LSS',
  'science.cosmology.lss_growth.galaxy_distribution': 'Galáxias · Redshift 3D',
  'science.cosmology.lss_growth.megastructures': 'Megaestruturas cosmológicas',
  'science.methods.inference': 'Inferência estatística · Nulls & calibração',
  'science.methods.robustness': 'Reprodutibilidade científica · Robustez',
  'engineering.nexo_runtime': 'Operações NEXO',
  'engineering.ai_agents': 'Agentes de IA',
  'olympus.body_composition': 'Composição corporal · Física computacional',
  'olympus.training': 'Treino',
  'olympus.nutrition': 'Nutrição',
};

export function atlasSemanticStation(node: GraphNode): string | null {
  if (node.semantic_topic_id && SEMANTIC_STATIONS[node.semantic_topic_id]) return SEMANTIC_STATIONS[node.semantic_topic_id];
  if (node.semantic_subdomain_id && SEMANTIC_STATIONS[node.semantic_subdomain_id]) return SEMANTIC_STATIONS[node.semantic_subdomain_id];
  return node.semantic_subdomain || null;
}

export function atlasSubdomainOf(node: GraphNode): string {
  // Canonical meaning first: the Tower/taxonomy decides, not presentation regexes.
  const station = atlasSemanticStation(node);
  if (station) return station;
  const token = tokenOf(node);
  const top = atlasTopDomainOf(node);

  // Campaign roadmaps may declare their semantic parent explicitly. This is
  // stronger than presentation regexes and lets new campaigns land correctly
  // without a frontend code change.
  if (node.type === 'CAMPAIGN' && String(node.parent_subdomain || '').trim()) {
    const declared = String(node.parent_subdomain).trim();
    // Tower roadmaps may use the canonical machine namespace while the Atlas
    // taxonomy uses a localized station label. This is projection-only.
    if (top === 'SCIENCE' && /^(DARK[ _-]?ENERGY|ENERGIA ESCURA)$/i.test(declared)) return 'Energia escura';
    return declared;
  }

  const hinted = atlasSubdomainHint(top, token, node.type);
  if (hinted) return hinted;

  if (top === 'OLYMPUS') return 'Olympus · Outros ativos';
  if (top === 'SCIENCE') {
    if (node.type === 'CAPABILITY') return 'Capacidades científicas';
    return 'Science · Outros ativos';
  }
  if (node.domain === 'ENGINEERING') return 'Engenharia, infraestrutura & segurança';
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
