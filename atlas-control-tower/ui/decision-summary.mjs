/** "Como chegou aqui": a high-level operational reading of one recorded run.
 *
 *  This is a decision trajectory summary built ONLY from fields nexo_ops already
 *  publishes for the execution. It is not, and must never become, a transcript
 *  of any private deliberation: no internal reasoning is stored, requested or
 *  rendered here. When the source is silent about a step, the step says so
 *  instead of being filled in.
 *
 *  Authority: DERIVED_NOT_EVIDENCE. Reading this never promotes an operational
 *  record to scientific evidence.
 */

export const DECISION_AUTHORITY = 'DERIVED_NOT_EVIDENCE';
const MISSING = 'Não informado na fonte.';

/** Hash-like values belong to Auditoria, never to the operational reading. */
const HASHY = /^[a-f0-9]{16,}$/i;

const FIELD_LABEL = {
 runtime_env: 'Ambiente', operation: 'Operação', new_observation: 'Nova observação',
 source_ref: 'Referência de origem', source_kind: 'Tipo de origem', sources: 'Fontes lidas',
 component: 'Componente', source_run_id: 'Execução de origem',
 pattern_link: 'Padrão vinculado', new_pattern_id: 'Padrão novo',
 candidate_patterns: 'Padrões candidatos', validation_pattern: 'Padrão em validação',
 surprise_cause: 'Sinal inesperado', patterns_after: 'Padrões após a execução',
 change_type: 'Tipo de mudança', material_change: 'Mudança material',
 claim_change: 'Mudança de claim', tower_state: 'Estado da torre',
 classification: 'Classificação', coverage_gap: 'Lacuna de cobertura',
 vblockers_scored: 'Blockers avaliados', vblockers_promoted: 'Blockers promovidos',
 learning_disposition: 'Disposição de aprendizado', uncertainty_source: 'Fonte de incerteza',
 score_eligible: 'Elegível a score', score_blocker: 'Blocker de score',
 hypothesis_like_current: 'Hipóteses em aberto',
 evidence_refs: 'Referências de evidência', provider_readback: 'Readback do provedor',
 science_revision_id: 'Revisão científica', test_revisions: 'Revisões de teste',
 receipt_ref: 'Recibo', readback_source: 'Origem do readback', links: 'Vínculos',
 status: 'Resultado', summary: 'Conclusão registrada', closure: 'Encerramento',
 resolved: 'Resolvido', science_boundary: 'Fronteira científica',
 readback_verified: 'Readback verificado', readback: 'Readback',
 tower_readback_verified: 'Readback da torre', integrity_score: 'Score de integridade',
 next_mode: 'Próximo modo', work_mode: 'Modo de trabalho',
 remaining_real_blockers: 'Blockers remanescentes', open_migration_issues: 'Pendências de migração'
};

/** The eight declared steps of the operational trajectory, in order. */
export const DECISION_STEPS = Object.freeze([
 {id: 'observations', label: 'Observações consideradas',
  fields: ['runtime_env', 'component', 'operation', 'new_observation', 'source_ref', 'source_kind', 'sources', 'source_run_id']},
 {id: 'patterns', label: 'Padrões detectados',
  fields: ['pattern_link', 'new_pattern_id', 'candidate_patterns', 'validation_pattern', 'patterns_after', 'surprise_cause']},
 {id: 'comparisons', label: 'O que foi comparado',
  fields: ['change_type', 'material_change', 'claim_change', 'tower_state', 'classification', 'coverage_gap']},
 {id: 'hypotheses', label: 'Hipóteses e caminhos avaliados',
  fields: ['vblockers_scored', 'vblockers_promoted', 'hypothesis_like_current', 'score_eligible', 'score_blocker', 'uncertainty_source']},
 {id: 'evidence', label: 'Evidências e resultados que sustentaram',
  fields: ['evidence_refs', 'provider_readback', 'science_revision_id', 'test_revisions', 'receipt_ref', 'readback_source', 'links']},
 {id: 'decision', label: 'Decisão registrada',
  fields: ['status', 'summary', 'closure', 'resolved', 'science_boundary']},
 {id: 'confidence', label: 'Confiança e readback',
  fields: ['readback_verified', 'tower_readback_verified', 'readback', 'integrity_score']},
 {id: 'next', label: 'Próxima ação escolhida',
  fields: ['next_mode', 'work_mode', 'remaining_real_blockers', 'open_migration_issues', 'learning_disposition']}
]);

const present = v => v !== null && v !== undefined && String(v).trim() !== '' && !Array.isArray(v)
 ? true
 : Array.isArray(v) ? v.length > 0 : false;

function readable(value) {
 if (typeof value === 'boolean') return value ? 'sim' : 'não';
 if (Array.isArray(value)) return value.map(v => String(v)).filter(Boolean).slice(0, 4).join(', ');
 if (value && typeof value === 'object') return '';
 const text = String(value).replace(/\s+/g, ' ').trim();
 if (!text || HASHY.test(text)) return '';
 return text.length > 150 ? text.slice(0, 149) + '…' : text;
}

/** Flattens the record into the single lookup the steps read from. */
function fieldsOf(entity = {}) {
 const meta = entity.metadata && typeof entity.metadata === 'object' ? entity.metadata : {};
 const payload = meta.payload && typeof meta.payload === 'object' ? meta.payload : {};
 return {...payload, ...meta, status: entity.status, summary: entity.summary};
}

/** Builds the eight-step reading for one action, run or runtime event. */
export function decisionSummary(entity = {}) {
 const source = fieldsOf(entity);
 const steps = DECISION_STEPS.map(step => {
  const parts = [];
  for (const field of step.fields) {
   if (!(field in source)) continue;
   const value = source[field];
   if (!present(value)) continue;
   const text = readable(value);
   if (!text) continue;
   parts.push({field, label: FIELD_LABEL[field] || field, value: text});
  }
  return {
   id: step.id,
   label: step.label,
   available: parts.length > 0,
   parts,
   value: parts.length ? parts.map(p => `${p.label}: ${p.value}`).join(' · ') : MISSING
  };
 });
 return {
  authority: DECISION_AUTHORITY,
  entityId: entity.id || entity.canonicalId || '',
  available: steps.some(s => s.available),
  steps
 };
}

export const DECISION_MISSING_TEXT = MISSING;
