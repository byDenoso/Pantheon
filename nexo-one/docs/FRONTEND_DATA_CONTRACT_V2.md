# Contrato do Observatório (frontend ↔ projeção)

Uma regra: **o site só lê `system.json`. Campo ausente = "não publicado", nunca erro.** Nada privado entra; Olympus só com sigla.

## De onde vem
TCC `public_projection.py` → `projection.json` → `scripts/build-pages-system.mjs` → `system.json.read_model`:

```
read_model = { version: 1, tests: {id: {...}}, hypotheses: {id: {...}}, roadmaps: [...], activity: [...] }
```

## O que o site usa

**Teste** (`read_model.tests[id]`): `question`, `status`, `review_state`, `verdict`, `domain`, `hypothesis_id`,
`prereg{prediction{expected_effect,p_promoted}, null, rival, criterion{success[],kill[]}, hash, at}`,
`review[]{kind,by,axis,outcome,at,contest_test_id}`, `limitations[]`, `claim_boundary`,
`created_at_effective` + `created_at_source`, `executed_at`, `execution{battery_id}`, `parents[]`, `children[]`.

**Hipótese** (`read_model.hypotheses[id]`): `statement`, `claim_boundary`, `test_ids[]`, `roadmap_ids[]`, `origin`.

**Roadmap** (`read_model.roadmaps[]`): `roadmap_id`, `title`, `question`, `state`,
`charter{objectives[], budget{max_tests,max_days}, stop{success_confirmed,kill_consecutive_refuted}, renewable}`,
`test_ids[]`, `hypothesis_ids[]`, `frontier_test_ids[]`, `progress{confirmed,refuted,in_review,blocked,ready,frontier}`.

**Atividade** (`read_model.activity[]`, últimas ~600): `{event_type, role, at, entity_id?}`.
`role` ∈ PITIA, LEARNER, EXECUTOR, REFUTADOR, GUARDIAO, DENER → raias da página Ciclo.

**Domínio novo** (ex. `PHILOSOPHY`): basta aparecer em `domain`/`semantic_domain` dos testes; a teia cria a região sozinha.
Registrar na taxonomia da projeção para não cair em SCIENCE.

## Quem é dono do quê
- **GPT/backend**: o que existe e o que é público (projeção, privacidade, linhagem, timestamps).
- **Claude/frontend**: como aparece (`src/features/lab/`). O front não inventa estado nem relações.
- Campo novo? Adicione na projeção e em `RM_TEST_KEYS`/`RM_HYP_KEYS` do `build-pages-system.mjs`. Só isso.

## Próximo (pedido ao backend)
`funnel{stage: {count, median_age_h}}` e deltas de 24 h prontos, para a Home separar atividade de progresso sem o front recalcular.
