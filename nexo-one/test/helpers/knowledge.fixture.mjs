// Synthetic knowledge graph for UI tests and the local preview. Not real science.
export function knowledgeReadModel() {
  const campaigns = {
    'SYN-Q-EXP': {campaign_id: 'SYN-Q-EXP', central_question: 'Pergunta sintética A: a expansão tardia desvia do modelo base?', roadmap_id: 'R1'},
    'SYN-Q-GROW': {campaign_id: 'SYN-Q-GROW', central_question: 'Pergunta sintética B: o crescimento de estrutura é menor em z baixo?', roadmap_id: 'R1'},
    'SYN-Q-H0': {campaign_id: 'SYN-Q-H0', central_question: 'Pergunta sintética C: a discrepância local é sistemática?', roadmap_id: 'R2'},
  };
  const h = (id, q, label, status, roadmap) => [id, {hypothesis_id: id, question_id: q, proposition: label, status, roadmap_id: roadmap}];
  const hypotheses = Object.fromEntries([
    h('SYN-H1', 'SYN-Q-EXP', 'Hipótese sintética 1: desvio físico', 'ACTIVE', 'R1'),
    h('SYN-H2', 'SYN-Q-EXP', 'Hipótese sintética 2: calibração', 'ACTIVE', 'R1'),
    h('SYN-H3', 'SYN-Q-GROW', 'Hipótese sintética 3: crescimento suprimido', 'INCONCLUSIVE', 'R1'),
    h('SYN-H4', 'SYN-Q-GROW', 'Hipótese sintética 4: viés de photo-z', 'PARKED', 'R1'),
    h('SYN-H5', 'SYN-Q-H0', 'Hipótese sintética 5: sistemática da escada', 'PROMOTED', 'R2'),
    h('SYN-H6', 'SYN-Q-H0', 'Hipótese sintética 6: física nova', 'KILLED', 'R2'),
  ]);
  const claims = {};
  const c = (id, o) => { claims[id] = {claim_id: id, ...o}; };
  const tiers = ['A', 'A', 'B', 'C'], types = ['COLLABORATION', 'INDEPENDENT', 'REANALYSIS', 'THEORY'];
  let n = 0;
  for (const [hyp, pro, con] of [['SYN-H1', 4, 2], ['SYN-H2', 3, 3], ['SYN-H3', 2, 1], ['SYN-H4', 1, 1], ['SYN-H5', 5, 1], ['SYN-H6', 1, 4]]) {
    for (let i = 0; i < pro + con; i++) {
      n++;
      c(`SYN-LIT-${n}`, {source: 'LITERATURE', label: `Artigo sintético ${n}`, ref: `synthetic:${n}`, journal: `Revista sintética ${tiers[n % 4]}`, journal_tier: tiers[n % 4],
        evidence_type: types[n % 4], publication_status: n % 5 ? 'PEER_REVIEWED' : 'PREPRINT', data_lineage: [`dataset-${n % 3}`],
        date: `2026-0${(n % 9) + 1}-15`, value: `valor sintético ${n}`, [i < pro ? 'supports' : 'contradicts']: [hyp]});
    }
  }
  c('SYN-NEXO-1', {source: 'NEXO', label: 'Teste NEXO sintético 1', review_verdict: 'SURVIVED', data_lineage: ['dataset-9'], date: '2026-10-10', supports: ['SYN-H1']});
  c('SYN-NEXO-2', {source: 'NEXO', label: 'Teste NEXO sintético 2', data_lineage: ['dataset-1'], date: '2026-10-12', contradicts: ['SYN-H3']});
  c('SYN-NEXO-3', {source: 'NEXO', label: 'Teste NEXO sintético 3', review_verdict: 'SURVIVED', data_lineage: ['dataset-8'], date: '2026-10-14', supports: ['SYN-H5']});
  return {campaigns, hypotheses, claims};
}
