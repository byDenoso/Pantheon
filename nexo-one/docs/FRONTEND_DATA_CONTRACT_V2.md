# Contrato de dados do Observatório (para o GPT / backend)

O site (`src/features/lab/`) já lê estes campos **se existirem** e mostra "aguardando dado" quando faltam.
Tudo vai em `public_projection.py` (TCC) → `system.json`. Nada de nome do Olympus: sigla de 3 letras.

## Por teste — `science_projection_v1.tests[]` (cada campo como `{value, unavailable_reason, source_ref, fingerprint}` ou valor cru)
| Campo | Uso na tela |
|---|---|
| `question_plain` | título do teste (hoje cai no id) |
| `result_meaning` | "O que o resultado significa" |
| `review_state` | PENDING_REVIEW / CONTESTED / REFEREE1_PASSED / CONFIRMED / REFUTED → chip de veredito e contagens |
| `created_at` | ordem temporal, "desde ontem" real |
| `roadmap_id` | árvore do roadmap (roadmaps sem campanha: DENER-CORE, NEXO-*) |
| `prereg` = `{metric, criterion, prediction, null, rival, hash, at}` | bloco "Congelado antes do teste" |
| `reviews[]` = `{kind, by, axis, outcome, at, ref}` | "Tentativas de derrubar" (axis = dados/método/coorte/critério) |
| `limitations`, `claim_boundary` | "Limites da conclusão" |
| `blocker` | motivo do bloqueio, em português simples |

## Por hipótese — `science_projection_v1.hypotheses[]`
`origin` (quem propôs e a partir de qual pensamento), `parent_id` (mutação/herança).

## Ciclo — `evolution.events[]` (últimas 48 h, no máximo 200)
`{at, actor: "Pítia"|"Learner"|"Executor"|"Runner"|"Refutador"|"Guardião"|"Dener", kind, ref, text}`
Alimenta o diário do ciclo e a linha do tempo. `kind` ex.: THOUGHT, HYPOTHESIS, DISPATCH, RESULT, CONTEST, VERDICT, MUTATION.

## Idade do funil — `evolution.stage_age_hours` (opcional)
`{PENDING_REVIEW: mediana_h, CONTESTED: mediana_h, REFEREE1_PASSED: mediana_h, READY: mediana_h}` → mostra onde o loop emperra.
