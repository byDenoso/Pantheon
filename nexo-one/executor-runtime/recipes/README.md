# Receitas de teste (código revisado e congelado)

O runner tem `camb==1.6.6` (pip, recombinação Recfast): `import camb` em qualquer receita. O CAMB exato do paper (CosmoRec, `runtime/portable_camb`) ainda não está no runner. Dados: URL oficial do release + hash; o Drive do Dener é só cópia de conferência.

O Executor não manda código na proposta (o filtro do ChatGPT bloqueia). Em `TEST_BATTERY`, cada teste pode trazer
`"recipe": "<nome>"` + `"params": {...}`; `script` inline é rejeitado. O runner roda `recipes/<nome>.py` com `PARAMS_PATH` e grava em `RESULT_PATH`.

| Receita | Para quê | Parâmetros |
|---|---|---|
| `seed_bounds` | replicação por sementes de amostra normal; limites de média e desvio | `seeds[]`, `n` (int ou lista), `max_abs_mean`, `max_abs_sd_minus_1` |
| `runner_readback_canary` | replica o canário numérico e registra identidade pública/read-back do runner | `seed`, `n`, `max_abs_mean`, `max_abs_sd_minus_1` |
| `tree_matching_symbolic_r1` | ataque simbólico R=1: verifica matching termo a termo e razão R sem coeficiente livre adicional | `field_scale`, `mass_scale` |
| `w0wa_bao_sn` | ajuste w0-wa (CPL plano) com DESI DR2 BAO + Pantheon+, retirando traçadores ou faixas de redshift; compara com o conjunto completo | `drop_bao_z[]` (0.295 BGS, 0.51/0.706 LRG, 0.934 LRG+ELG, 1.321 ELG, 1.484 QSO, 2.33 Ly-α), `drop_sn_zbands[[zmin,zmax]]`, `use_sn`, `priors{omega_m,w0,wa:[média,σ]}`, `criterion` (`delta_chi2_ge` ou `shift_lt`), `threshold` |

Use `w0wa_bao_sn` para: leave-one-tracer-out do BAO, leave-one-band-out das SNe, e "a preferência por w0-wa sobrevive a …". Sem CMB alguns cortes ficam degenerados; a receita devolve INCONCLUSIVE (`DEGENERATE_FIT`) em vez de julgar — congele um prior em `priors` se o teste precisar decidir.

Receita nova: peça numa conversa ("NEXO: preciso de uma receita para …"); ela entra aqui por commit revisado.

| `w0wa_bao_sn_multi` | robustez w0-wa em Pantheon+, DES-SN5YR e Union3 (`union3`) com DESI DR2 BAO; jackknife por faixa de redshift ou família BAO | `mode`, `compilations[]`, `priors{}`, e `bands[[zmin,zmax]]` ou `tracer_groups[{label,z[]}]` |\n| `late_time_joint_probe_stress` | família aprovada de stress tardio: jackknife SN/BAO, respostas de covariância/velocidade e fator comum de calibração; bindings faltantes ficam INCONCLUSIVE, sem substituição silenciosa | `mode`; jackknifes: `compilations[]`, `priors{}`, `bands[]`/`tracer_groups[]`; respostas: `response_sets` ou `response_sets_url`, `criterion`, `permutations` |
| `tower_native` | testes META sobre o histórico do NEXO, lidos da projeção pública (só agregados, sem acesso à Tower): `mode` = `prediction_calibration`, `readiness_yield` ou `event_clock`; `min_per_stratum`, `min_cases`, `min_hypotheses`; amostra pequena = INCONCLUSIVE | `mode` |\n