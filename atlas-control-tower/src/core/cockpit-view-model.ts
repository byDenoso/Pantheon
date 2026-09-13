import type { HealthPlane, HealthPlaneId, LearnerFilament } from './contracts';
import { resolveLearnerLayer, type LearnerRenderInstruction } from '../graph-engine/learner-overlay.ts';

export type RawHealthForCockpit = {
  fingerprint?: string;
  sourceVersion?: string;
  contract?: string;
  dataSource?: { freshness?: string; authority?: string; reason?: string };
};

const PLANE_ORDER: HealthPlaneId[] = [
  'CANONICAL_STATE',
  'WRITE_CONTRACT',
  'SCHEDULER',
  'EXECUTION',
  'API',
  'DEPLOYMENT',
  'DOCUMENTATION',
  'ESTATE_HYGIENE'
];

const PLANE_LABEL: Record<HealthPlaneId, string> = {
  CANONICAL_STATE: 'Estado canônico',
  WRITE_CONTRACT: 'Contrato de escrita',
  SCHEDULER: 'Scheduler',
  EXECUTION: 'Execução',
  API: 'API',
  DEPLOYMENT: 'Deployment',
  DOCUMENTATION: 'Documentação',
  ESTATE_HYGIENE: 'Higiene de estimate'
};

/**
 * Builds the 8 health planes from whatever the currently-wired data source can prove.
 * A plane is GREEN only when the underlying reader actually said so; every plane this
 * function has no live signal for is UNKNOWN, never defaulted to GREEN by omission --
 * that is the whole point of the health model from this session's design debate.
 */
export function resolveHealthPlanes(health: RawHealthForCockpit | null): HealthPlane[] {
  const canonicalStatus = health?.contract ? 'GREEN' : 'UNKNOWN';
  const apiStatus = health?.dataSource?.freshness ? (health.dataSource.freshness === 'LIVE' ? 'GREEN' : 'AMBER') : 'UNKNOWN';

  const byId: Record<HealthPlaneId, HealthPlane> = {
    CANONICAL_STATE: {
      id: 'CANONICAL_STATE',
      status: canonicalStatus,
      reason: health?.contract ? `Contrato ${health.contract} publicado, fingerprint presente.` : 'Sem leitura de contrato canônico nesta fonte.',
      observedAt: health?.sourceVersion,
      provenance: []
    },
    WRITE_CONTRACT: { id: 'WRITE_CONTRACT', status: 'UNKNOWN', reason: 'Nenhuma fonte privada conectada nesta build para provar o contrato de escrita.', provenance: [] },
    SCHEDULER: { id: 'SCHEDULER', status: 'UNKNOWN', reason: 'Estado do scheduler Learner não é publicado no snapshot público.', provenance: [] },
    EXECUTION: { id: 'EXECUTION', status: 'UNKNOWN', reason: 'Sem recibos de execução acessíveis nesta fonte.', provenance: [] },
    API: {
      id: 'API',
      status: apiStatus,
      reason: health?.dataSource?.reason || 'Sem sinal de saúde da API declarado pela fonte atual.',
      observedAt: health?.sourceVersion,
      provenance: []
    },
    DEPLOYMENT: { id: 'DEPLOYMENT', status: 'UNKNOWN', reason: 'Sem leitura de deployment nesta fonte.', provenance: [] },
    DOCUMENTATION: { id: 'DOCUMENTATION', status: 'UNKNOWN', reason: 'Sem verificação de documentação nesta fonte.', provenance: [] },
    ESTATE_HYGIENE: { id: 'ESTATE_HYGIENE', status: 'UNKNOWN', reason: 'Sem inventário de estimate acessível nesta fonte.', provenance: [] }
  };

  return PLANE_ORDER.map(id => byId[id]);
}

export function planeLabel(id: HealthPlaneId): string {
  return PLANE_LABEL[id];
}

export function resolveCockpitLearnerView(filaments: LearnerFilament[]): LearnerRenderInstruction[] {
  return resolveLearnerLayer(filaments);
}
