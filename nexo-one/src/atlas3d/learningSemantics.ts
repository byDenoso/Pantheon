import type { Filament } from '../contracts/system.ts';
import type { AtlasTopDomain } from '../viewmodels/atlasTaxonomy.ts';

export type LearningSemanticBasis = 'STRUCTURED_GROUP' | 'STRUCTURED_KIND' | 'STRONG_CONTENT';

export interface LearningSemanticAnchor {
  domain: AtlasTopDomain;
  subdomain: string;
}

export interface LearningSemanticRoute {
  theme: string;
  basis: LearningSemanticBasis;
  source: LearningSemanticAnchor | null;
  target: LearningSemanticAnchor | null;
}

export const LEARNING_ANCHORS = {
  NEXO: {
    governance: 'Governança científica & decisão',
    inference: 'Inferência, nulls & calibração',
    data: 'Dados, agregação & incerteza',
    causality: 'Causalidade & interpretação',
    execution: 'Execução & confiabilidade',
    robustness: 'Robustez & reprodutibilidade',
    models: 'Modelos rivais & discriminação',
    prediction: 'Predição & validação externa',
  },
  SCIENCE: {
    governance: 'Método científico · Governança',
    inference: 'Inferência estatística · Nulls & calibração',
    data: 'Consistência de dados · CMB/BAO/SN',
    bayes: 'Inferência bayesiana · Priors & evidência',
    robustness: 'Reprodutibilidade científica · Robustez',
    peer: 'Consistência cosmológica · Peer Detection',
    h0: 'Expansão do Universo · H0',
    growth: 'Estrutura em larga escala · Growth/LSS',
    dark: 'Energia escura & setor escuro',
  },
  OLYMPUS: {
    method: 'Olympus · Método & validação',
    composition: 'Composição corporal · Física computacional',
  },
} as const;

const peerRoutes: Record<string, { theme: string; source: string; target: string }> = {
  GOVERNANCE: {
    theme: 'scientific-governance',
    source: LEARNING_ANCHORS.NEXO.governance,
    target: LEARNING_ANCHORS.SCIENCE.governance,
  },
  BASELINE_PROFILE: {
    theme: 'statistical-inference',
    source: LEARNING_ANCHORS.NEXO.inference,
    target: LEARNING_ANCHORS.SCIENCE.inference,
  },
  ANCHOR: {
    theme: 'anchors-and-distance-ladder',
    source: LEARNING_ANCHORS.NEXO.data,
    target: LEARNING_ANCHORS.SCIENCE.h0,
  },
  DATA_SPLITS: {
    theme: 'dataset-consistency',
    source: LEARNING_ANCHORS.NEXO.data,
    target: LEARNING_ANCHORS.SCIENCE.data,
  },
  GLOBAL_NULL: {
    theme: 'global-null',
    source: LEARNING_ANCHORS.NEXO.inference,
    target: LEARNING_ANCHORS.SCIENCE.inference,
  },
  CALIBRATION: {
    theme: 'calibration',
    source: LEARNING_ANCHORS.NEXO.inference,
    target: LEARNING_ANCHORS.SCIENCE.inference,
  },
  BAYES_PRIORS: {
    theme: 'bayesian-priors',
    source: LEARNING_ANCHORS.NEXO.inference,
    target: LEARNING_ANCHORS.SCIENCE.bayes,
  },
  RIVALS: {
    theme: 'model-discrimination',
    source: LEARNING_ANCHORS.NEXO.models,
    target: LEARNING_ANCHORS.SCIENCE.dark,
  },
  PREDICTION: {
    theme: 'external-prediction',
    source: LEARNING_ANCHORS.NEXO.prediction,
    target: LEARNING_ANCHORS.SCIENCE.growth,
  },
  ROBUSTNESS: {
    theme: 'reproducibility',
    source: LEARNING_ANCHORS.NEXO.robustness,
    target: LEARNING_ANCHORS.SCIENCE.robustness,
  },
  SYNTHESIS: {
    theme: 'decision-synthesis',
    source: LEARNING_ANCHORS.NEXO.governance,
    target: LEARNING_ANCHORS.SCIENCE.peer,
  },
};

function signalOf(filament: Filament): string {
  return [
    filament.id,
    filament.label,
    filament.from_label,
    filament.to_label,
    filament.boundary,
    filament.peer_detection_group,
    ...(filament.evidence || []),
    ...(filament.links || []).flatMap(link => [link.id, link.label]),
  ].filter(Boolean).join(' ').toUpperCase();
}

type ProceduralTheme = 'EXECUTION' | 'CAUSALITY' | 'DATA' | 'GOVERNANCE' | 'INFERENCE' | 'ROBUSTNESS';

function proceduralTheme(signal: string): ProceduralTheme | null {
  if (/WRITER|REBASE|RUNTIME|PRODUCER|ADAPTER|BLOCKER|RECOVER|CONCURRENC|MCP/.test(signal)) return 'EXECUTION';
  if (/LOCALIZATION|LOCALISATION|CAUSATION|CAUSAL/.test(signal)) return 'CAUSALITY';
  if (/MISSING[_ -]?EVIDENCE|PREREG|UNDERIDENTIFIED|UNDERPOWERED/.test(signal)) return 'GOVERNANCE';
  if (/COVARIANCE|INDEPENDENCE|TENSION|SIGNIFICANCE|GLOBAL[_ -]?NULL|CALIBRATION|PRIOR/.test(signal)) return 'INFERENCE';
  if (/ANALYTIC[_ -]?INVARIANCE|REPRODUC|ROBUSTNESS|PREPROCESS|ESTIMATOR/.test(signal)) return 'ROBUSTNESS';
  if (/AVERAGING|AGGREGATION|ABLATION|LOW[-_ ]?N|MEASUREMENT[_ -]?UNCERTAINTY|STRATIFICATION/.test(signal)) return 'DATA';
  if (/PROMOT|DECISION/.test(signal)) return 'GOVERNANCE';
  if (/ROBUST|HOLDOUT|INVARIANCE/.test(signal)) return 'ROBUSTNESS';
  return null;
}

function proceduralNexoPair(theme: ProceduralTheme): { source: string; target: string } {
  switch (theme) {
    case 'EXECUTION':
      return { source: LEARNING_ANCHORS.NEXO.execution, target: LEARNING_ANCHORS.NEXO.governance };
    case 'CAUSALITY':
      return { source: LEARNING_ANCHORS.NEXO.data, target: LEARNING_ANCHORS.NEXO.causality };
    case 'DATA':
      return { source: LEARNING_ANCHORS.NEXO.data, target: LEARNING_ANCHORS.NEXO.inference };
    case 'GOVERNANCE':
      return { source: LEARNING_ANCHORS.NEXO.inference, target: LEARNING_ANCHORS.NEXO.governance };
    case 'INFERENCE':
      return { source: LEARNING_ANCHORS.NEXO.inference, target: LEARNING_ANCHORS.NEXO.governance };
    case 'ROBUSTNESS':
      return { source: LEARNING_ANCHORS.NEXO.robustness, target: LEARNING_ANCHORS.NEXO.governance };
  }
}

function topDomain(value: string | undefined): AtlasTopDomain | null {
  const normalized = String(value || '').toUpperCase() === 'ENGINEERING'
    ? 'NEXO'
    : String(value || '').toUpperCase();
  return normalized === 'NEXO' || normalized === 'SCIENCE' || normalized === 'OLYMPUS'
    ? normalized
    : null;
}

export function learningSemanticRoute(filament: Filament): LearningSemanticRoute | null {
  if (filament.kind === 'SCIENTIFIC_LEARNING_PIPELINE') {
    const group = String(filament.peer_detection_group || '').toUpperCase();
    const route = peerRoutes[group];
    if (!route) return null;
    return {
      theme: route.theme,
      basis: 'STRUCTURED_GROUP',
      source: { domain: 'NEXO', subdomain: route.source },
      target: { domain: 'SCIENCE', subdomain: route.target },
    };
  }

  const signal = signalOf(filament);

  if (filament.kind === 'SEMANTIC' && /METHOD_TRANSFER|SELECTION[-_ ]?AWARE/.test(signal)) {
    return {
      theme: 'cross-domain-method-transfer',
      basis: 'STRUCTURED_KIND',
      source: null,
      target: { domain: 'OLYMPUS', subdomain: LEARNING_ANCHORS.OLYMPUS.method },
    };
  }

  if (filament.kind !== 'PROCEDURAL') return null;

  const theme = proceduralTheme(signal);
  if (!theme) return null;
  const pair = proceduralNexoPair(theme);
  const fromDomain = topDomain(filament.from_domain);
  const toDomain = topDomain(filament.to_domain);

  // Canonical Olympus-labelled meta-learning is allowed to recover the domain
  // that older procedural records failed to encode explicitly.
  const olympusTarget = /(?:^|[^A-Z])OLY(?:MPUS)?(?:[^A-Z]|$)|BODYBUILD|COMPOSI[CÇ][AÃ]O/.test(signal)
    ? { domain: 'OLYMPUS' as const, subdomain: LEARNING_ANCHORS.OLYMPUS.method }
    : null;

  return {
    theme: `procedural-${theme.toLowerCase()}`,
    basis: 'STRONG_CONTENT',
    source: fromDomain === 'NEXO'
      ? { domain: 'NEXO', subdomain: pair.source }
      : null,
    target: olympusTarget || (
      fromDomain === 'NEXO' && toDomain === 'NEXO'
        ? { domain: 'NEXO', subdomain: pair.target }
        : null
    ),
  };
}
