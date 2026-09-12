import type { AtlasEdge, AtlasGraph, AtlasNode } from '../scene/types';

export type Freshness = 'LIVE' | 'SNAPSHOT' | 'STALE' | 'DEGRADED' | 'OFFLINE';

export type ScientificStatus =
  | 'MEASURED'
  | 'SUPPORTED'
  | 'PROVISIONAL'
  | 'CANDIDATE'
  | 'INCONCLUSIVE'
  | 'CONTRADICTED'
  | 'BLOCKED'
  | 'STALE'
  | 'CONSISTENT'
  | 'INTERESTING'
  | 'TENSION'
  | 'SIGNIFICANT'
  | 'UNKNOWN';

export type Uncertainty = number | { plus: number; minus: number };

export type Provenance = {
  source?: string;
  sourceId?: string;
  sourceRef?: string;
  url?: string;
  observedAt?: string;
  label?: string;
};

export type FreshnessState = {
  state: Freshness;
  updatedAt?: string;
  source?: string;
  sourceVersion?: string;
  message?: string;
};

export type ParameterEstimate = {
  id: string;
  label: string;
  value: number;
  uncertainty?: Uncertainty;
  unit?: string;
  status: ScientificStatus;
  evidenceLevel?: ScientificStatus;
  updatedAt?: string;
  provenance: Provenance[];
};

export type DatasetMeasurement = {
  id: string;
  dataset: string;
  value: number;
  uncertainty?: Uncertainty;
  method?: string;
  reference?: string;
  category?: string;
  status?: ScientificStatus;
  provenance: Provenance[];
};

export type WeightedH0Estimate = {
  value: number;
  uncertainty?: Uncertainty;
  unit?: string;
  datasetCount?: number;
  chiSquared?: number;
  measurements: DatasetMeasurement[];
  interval1Sigma?: [number, number];
  interval2Sigma?: [number, number];
  updatedAt?: string;
  provenance: Provenance[];
};

export type TensionGroup = {
  id: string;
  label: string;
  category?: string;
  estimate?: number;
  uncertainty?: Uncertainty;
  unit?: string;
  provenance: Provenance[];
};

export type TensionResult = {
  id: string;
  label: string;
  groups: TensionGroup[];
  difference?: number;
  significance?: number;
  compatibility?: string;
  status: ScientificStatus;
  updatedAt?: string;
  provenance: Provenance[];
};

export type DirectionalSignal = {
  id: string;
  label: string;
  state: 'CANDIDATE' | 'PROVISIONAL' | 'SUPPORTED' | 'INCONCLUSIVE';
  ra?: number;
  dec?: number;
  amplitude?: number;
  uncertainty?: Uncertainty;
  significance?: number;
  method?: string;
  redshiftRange?: string;
  datasets?: string[];
  selectionFunction?: string;
  globalSignificance?: number;
  provenance: Provenance[];
};

export type ScientificSummary = {
  status: ScientificStatus;
  narrative?: string;
  parameters: ParameterEstimate[];
  updatedAt?: string;
  provenance: Provenance[];
};

export type ObservatoryData = {
  h0: WeightedH0Estimate | null;
  tensions: TensionResult[];
  directionalSignals: DirectionalSignal[];
  parameters: ParameterEstimate[];
  narrative?: string;
  sections: ScientificSection[];
  freshness: FreshnessState;
};

export type ScientificSection = {
  id: string;
  label: string;
  summary?: string;
  status: ScientificStatus;
  updatedAt?: string;
  provenance: Provenance[];
};

export type ResearchRecord = {
  id: string;
  label: string;
  type: string;
  status?: string;
  domain?: string;
  summary?: string;
  updatedAt?: string;
  provenance: Provenance[];
  node: AtlasNode;
};

export type Hypothesis = ResearchRecord;
export type Claim = ResearchRecord;
export type Test = ResearchRecord;
export type Run = ResearchRecord;
export type Result = ResearchRecord;
export type Evidence = ResearchRecord;
export type Pipeline = ResearchRecord;

export type LabData = {
  claims: Claim[];
  tests: Test[];
  runs: Run[];
  results: Result[];
  evidence: Evidence[];
  pipelines: Pipeline[];
};

export type EntityRead = {
  entity?: AtlasNode;
  relations?: AtlasEdge[];
  relationCount?: number;
  source?: string;
  provenance?: Provenance[];
};

export type HealthPayload = {
  ok?: boolean;
  contract?: string;
  dataSource?: {
    requested?: string;
    effective?: string;
    freshness?: string;
    reason?: string;
  };
  fingerprint?: string;
  sourceVersion?: string;
};

export type ResearchEnvelope<T = unknown> = {
  contract?: string;
  status?: 'OK' | 'EMPTY' | 'PARTIAL' | 'DATA_UNAVAILABLE' | string;
  freshness?: Freshness | string;
  generatedAt?: string;
  sourceModifiedAt?: string;
  authority?: string;
  projectionAuthority?: string;
  access?: string;
  privacyGate?: string;
  data?: T;
  provenance?: Provenance[];
};

export type StatePayload = {
  counts?: Record<string, number>;
  statuses?: Record<string, number>;
  domains?: Record<string, number>;
  activity?: Record<string, number>;
  claims?: Record<string, number>;
  claimKinds?: Record<string, number>;
  total?: number;
  sources?: Record<string, { status?: string; observedAt?: string }>;
  projection?: {
    fingerprint?: string;
    sourceVersion?: string;
    source?: string;
    freshness?: string;
    unresolvedRelations?: number;
    unresolvedDomain?: number;
  };
  capabilities?: Record<string, unknown>;
  parameters?: unknown;
  tensions?: unknown;
  directionalSignals?: unknown;
  weightedH0?: unknown;
  observatory?: unknown;
  snapshot?: unknown;
  synthesis?: unknown;
};

export type AtlasApiClient = {
  graph: (query?: Record<string, string | number | undefined>) => Promise<AtlasGraph>;
  state: (query?: Record<string, string | number | undefined>) => Promise<unknown>;
  health: () => Promise<unknown>;
  entity: (id: string, view?: string) => Promise<unknown>;
  lineage: (id: string) => Promise<AtlasGraph>;
  learning: () => Promise<unknown>;
  learningFor: (id: string) => Promise<unknown>;
  ops: () => Promise<unknown>;
  audit: () => Promise<unknown>;
  files: (id: string) => Promise<unknown>;
  sync: () => Promise<unknown>;
  research: (route: string, query?: Record<string, string | number | undefined>) => Promise<ResearchEnvelope>;
  remote?: boolean;
  provenance?: {
    source?: string;
    freshness?: string;
    sourceVersion?: string;
  };
};

export type PanelState = 'LOADING' | 'READY' | 'EMPTY' | 'DATA_UNAVAILABLE' | 'API_ERROR' | 'STALE' | 'DEGRADED' | 'PARTIAL';

export type PanelRead<T> = {
  state: PanelState;
  data: T | null;
  freshness: FreshnessState;
  error?: string;
};

export type AtlasContext = {
  domain?: string;
  query?: string;
  dataset?: string;
  source?: string;
  period?: string;
  redshift?: string;
  status?: string;
  scope?: string;
  graphPath?: string[];
};
