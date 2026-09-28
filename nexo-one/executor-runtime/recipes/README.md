# Receitas de teste (código revisado e congelado)

O Executor não manda código na proposta (o filtro do ChatGPT bloqueia). Em `TEST_BATTERY`, cada teste pode trazer
`"recipe": "<nome>"` + `"params": {...}`; `script` inline é rejeitado. O runner roda `recipes/<nome>.py` com `PARAMS_PATH` e grava em `RESULT_PATH`.

| Receita | Para quê | Parâmetros |
|---|---|---|
| `seed_bounds` | replicação por sementes de amostra normal; limites de média e desvio | `seeds[]`, `n` (int ou lista), `max_abs_mean`, `max_abs_sd_minus_1` |
| `runner_readback_canary` | replica o canário numérico e registra identidade pública/read-back do runner | `seed`, `n`, `max_abs_mean`, `max_abs_sd_minus_1` |

Receita nova: peça numa conversa ("NEXO: preciso de uma receita para …"); ela entra aqui por commit revisado.
