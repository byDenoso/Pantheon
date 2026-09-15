export type CompletenessState = 'PUBLISHED' | 'EMPTY' | 'DATA_UNAVAILABLE' | 'NOT_PUBLISHED';

export type CompletenessMetric = {
  id: string;
  label: string;
  value: number | null;
  state: CompletenessState;
  detail: string;
};

export type CompletenessGap = {
  id: string;
  label: string;
  state: CompletenessState;
  detail: string;
};

export type CompletenessModel = {
  metrics: CompletenessMetric[];
  gaps: CompletenessGap[];
};

function listCount(surface: unknown, key: string): { value: number | null; state: CompletenessState } {
  if (!surface || typeof surface !== 'object') return { value: null, state: 'DATA_UNAVAILABLE' };
  const value = (surface as Record<string, unknown>)[key];
  if (!Array.isArray(value)) return { value: null, state: 'NOT_PUBLISHED' };
  return { value: value.length, state: value.length ? 'PUBLISHED' : 'EMPTY' };
}

function metric(id: string, label: string, surface: unknown, key: string, detail: string): CompletenessMetric {
  const result = listCount(surface, key);
  return { id, label, value: result.value, state: result.state, detail };
}

export function buildCompletenessModel(surfaces: Record<string, unknown>): CompletenessModel {
  const observatory = surfaces.observatory;
  const laboratory = surfaces.laboratory;
  const learning = surfaces.learning;
  const operations = surfaces.operations;
  const audit = surfaces.audit;
  const aggregatePublished = Boolean(observatory && typeof observatory === 'object' && (observatory as Record<string, unknown>).aggregate);
  const evidence = listCount(laboratory, 'evidence');
  const runs = listCount(laboratory, 'runs');

  return {
    metrics: [
      metric('campaigns', 'Campanhas', observatory, 'campaigns', 'Registros publicados no Observatório'),
      metric('questions', 'Hipóteses', observatory, 'questions', 'Perguntas científicas publicadas'),
      metric('experiments', 'Experimentos', laboratory, 'items', 'Itens publicados no Laboratório'),
      metric('learning', 'Aprendizado', learning, 'items', 'Registros de aprendizagem publicados'),
      metric('operations', 'Operação', operations, 'actions', 'Ações operacionais publicadas')
    ],
    gaps: [
      {
        id: 'h0-aggregate',
        label: 'Síntese agregada das hipóteses',
        state: aggregatePublished ? 'PUBLISHED' : 'NOT_PUBLISHED',
        detail: aggregatePublished ? 'Síntese publicada com proveniência.' : 'Ainda não publicada pela fonte; o Atlas não estima um valor.'
      },
      {
        id: 'evidence',
        label: 'Evidências vinculadas',
        state: evidence.state,
        detail: evidence.state === 'PUBLISHED' ? `${evidence.value} evidências no snapshot.` : 'A fonte ainda não publicou evidências vinculadas nesta superfície.'
      },
      {
        id: 'runs',
        label: 'Execuções reprodutíveis',
        state: runs.state,
        detail: runs.state === 'PUBLISHED' ? `${runs.value} execuções no snapshot.` : 'A fonte ainda não publicou execuções reproduzíveis.'
      },
      {
        id: 'audit',
        label: 'Trilha de auditoria',
        state: listCount(audit, 'items').state,
        detail: 'Eventos e decisões aparecem apenas quando publicados pela fonte de verdade.'
      }
    ]
  };
}
