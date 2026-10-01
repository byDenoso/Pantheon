// Synthetic, test-only input. Never imported by the production app or release package.
export function labVisualFixture(now = Date.now()) {
  const at = hours => new Date(now - hours * 3600e3).toISOString();
  const roadmapId = 'RM-H0-SYSTEMATICS-VS-PHYSICS-20260923-V1';
  const rejectedId = 'FAM-DE-FS-GEOGROWTH-ELG-DESI-PP';
  const h0Ids = Array.from({ length: 22 }, (_, i) => 'VISUAL-H0-' + String(i + 1).padStart(2, '0'));
  const test = (id, status, extra = {}) => ({ id, status, domain: 'SCIENCE', created_at: at(12),
    semantic: { display_name: 'Fixture · ' + id, question_plain: 'Fixture visual: o resultado atende ao critério registrado?' }, ...extra });
  const tests = [
    test(rejectedId, 'REJECTED', { verdict: 'REJECTED', executed_at: at(3), result_meaning: 'Fixture de regressão: o modelo rival foi rejeitado pelo critério registrado.' }),
    ...h0Ids.map((id, i) => test(id, i < 7 ? 'CHECKPOINTED' : i < 17 ? 'BLOCKED_INPUT' : 'DONE', {
      roadmap_id: roadmapId, hypothesis_id: 'VISUAL-HYP-H0', blocker: i >= 7 && i < 17 ? 'Fixture: vínculo de entrada pendente' : undefined,
      ...(i >= 17 ? { verdict: 'INCONCLUSIVE', executed_at: at(4) } : {}),
    })),
    ...Array.from({ length: 43 }, (_, i) => test('VISUAL-BLOCKED-' + i, 'BLOCKED_INPUT', { blocker: 'Fixture: dado de entrada não vinculado' })),
    { ...test('VISUAL-BLOCKED-CONTRACT', undefined), state: 'BLOCKED_SCIENTIFIC_CONTRACT', blocker: 'Fixture: contrato científico incompleto' },
    test('VISUAL-CONFIRMED', 'DONE', { verdict: 'PROMOTED', review_state: 'CONFIRMED', executed_at: at(1), result_meaning: 'Fixture visual: resultado confirmado no registro de revisão, com seu escopo preservado.' }),
    test('VISUAL-REVIEW', 'DONE', { verdict: 'PROMOTED', review_state: 'PENDING_REVIEW', executed_at: at(2), result_meaning: 'Fixture visual: resultado provisório aguardando revisão.' }),
    test('VISUAL-RUNNING', 'RUNNING', { domain: 'ENGINEERING', execution: { at: at(.1), runner: 'FIXTURE_ONLY' } }),
  ];
  const manifest = { authority: 'TOWER_V06', projection_only: true, writeback: 'FORBIDDEN', tower_commit: '6'.repeat(40),
    event_cursor: '20261001T053000000000Z-visual-fixture', projection_fingerprint: 'sha256:' + '7'.repeat(64), generated_at: at(0) };
  const ratio = (value, numerator, denominator, scope = 'window') => ({ value, numerator, denominator, scope, unit: 'ratio', definition: 'TEST_FIXTURE_ONLY' });
  const fronts = [ ['lcdm-geometria', 'ΛCDM, geometria e homogeneidade', 'SOLID', 'Sólido'], ['energia-escura', 'Energia escura', 'TENSION', 'Tensão'],
    ['h0', 'Expansão do Universo · H0', 'TENSION', 'Tensão'], ['crescimento-s8', 'Crescimento · S8', 'OPEN', 'Aberto'], ['materia-escura', 'Matéria escura', 'OPEN', 'Aberto'],
    ['neutrinos', 'Neutrinos', 'OPEN', 'Aberto'], ['cmb-primordial', 'CMB primordial', 'OPEN', 'Aberto'], ['estrutura-grande-escala', 'Estrutura em grande escala', 'SOLID', 'Sólido'] ];
  return { contract: 'NEXO_PUBLIC_PROJECTION_V1', manifest, event_cursor: manifest.event_cursor, work: [], capabilities: {},
    counts: { active_work: 0, tests: tests.length, capabilities: 0 }, tests, hypotheses: [{ id: 'VISUAL-HYP-H0', statement: 'Hipótese sintética para testar o layout', test_ids: h0Ids }],
    roadmaps: [{ roadmap_id: roadmapId, title: 'Fixture · origem da tensão na expansão', question: 'Pergunta sintética para verificar o roadmap', state: 'ACTIVE', test_ids: h0Ids,
      frontier_test_ids: h0Ids, progress: { total: 22, frontier: 22 }, charter: { budget: { max_tests: 40 } } }],
    activity: Array.from({ length: 240 }, (_, i) => ({ event_type: 'TEST_RESULT_RECORDED', role: i < 221 ? 'EXECUTOR' : i < 239 ? 'REFUTADOR' : 'GUARDIAO', at: new Date(now - 2 * 3600e3 + i * 30000).toISOString(), entity_id: rejectedId })),
    cosmology_state: { model: 'COSMOLOGY_STATE_V1', authority: 'TOWER', projection_only: true, historical_tests: [],
      literature_source: { name: 'Fixture visual sintética', url: 'about:blank', version: '1.0.0', updated_at: '2026-09-28' },
      frontiers: fronts.map(([id, title, state, state_label]) => ({ id, title, state, state_label, summary: 'Síntese sintética, apenas para regressão visual.',
        short_summary: 'Fixture: descrição versionada para verificar hierarquia e legibilidade.', why: 'Dados sintéticos de teste.', confidence: 'TEST_ONLY', literature_baseline: 'Fixture de literatura sem alegação científica.',
        synthesis_basis: 'TEST_ONLY', synthesis_evidence_ids: [], nexo_interpretation: [], evidence_counts: { confirmed: 0, refuted: 0, review: 0, inconclusive: 0, open: 0 },
        key_evidence: [], historical_lessons: [], campaign_ids: [], roadmap_ids: id === 'h0' ? [roadmapId] : [], open_questions: [], next_discriminants: [], active_tests: [] })),
    },
    evolution: { gate: { charters_waiting: [], canaries_waiting: [] }, review_queue: { referee_1: [], referee_2: [] }, reviews: { CONFIRMED: 1, PENDING_REVIEW: 1 },
      roadmaps: [{ roadmap_id: roadmapId, state: 'ACTIVE', tests_used: 0, confirmed: 0, max_tests: 40, success_target: 3, frontier_count: 22 }],
      genome: { generation: 1, genes: [] }, decoys: { planted: 0, revealed: 0, caught: 0 }, thoughts: [], families: [], learning: { rules: [] },
      board: [{ id: 'VISUAL-BOARD', at: at(.5), from: 'EXECUTOR', to: 'ENGINEER', text: 'Fixture: pedido de revisão de um vínculo. Próxima ação: conferir o registro publicado.', refs: [h0Ids[8]], priority: 'P1' }],
      autonomy: { schema_version: 'AUTONOMY_METRICS_V2', computed_at: at(0), window_start: at(24), window_end: at(0), window_hours: 24, results: 33,
        robot_share: .909, decisive_rate: .545, median_hours_to_result: null, contest_closure: .358, recovery_rate: 1, false_block_share: 1,
        metrics: { execution_record_share: ratio(.909, 30, 33), decisive_rate: ratio(.515, 17, 33), positive_review_closure: ratio(.358, 24, 67, 'all_tests'), blocked_share: ratio(1, 53, 53, 'all_tests'),
          results: { value: 33, numerator: 33, denominator: null, scope: 'window', unit: 'count', definition: 'TEST_FIXTURE_ONLY' },
          median_hours_to_result: { value: 9.4, numerator: null, denominator: null, scope: 'window', unit: 'hours', definition: 'TEST_FIXTURE_ONLY', sample_count: 33, coverage: { value: 1, numerator: 33, denominator: 33 } } },
        buckets: { result_verdicts: { PROMOTED: 14, REJECTED: 3, INCONCLUSIVE: 15, CONTESTED: 1 } },
      },
    },
  };
}
