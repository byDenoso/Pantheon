# DESI DR1 full-shape

`desi_dr1_fullshape` avalia a likelihood real de multipolos do espectro de potência DESI DR1. Usa medições, janela rotacionada e covariância oficial com as contribuições de sistemáticos `rotation-hod-photo`, corte angular de 0,05 grau e os cortes de escala do release `v1.0`. As classes oficiais `desi_fs_bao_all` e `reptvelocileptors` são baixadas do commit `7d51f4f86dc3bee6bf10f1a684913c943a89a844` de `cosmodesi/desi-kp-cosmological-likelihoods`, com SHA256 conferido antes da importação. O cálculo não linear é REPT/velocileptors one-loop com resumação infravermelha; CAMB 1.6.6 fornece os espectros lineares de densidade e velocidade.

## Entrada congelada

A receita lê JSON de `PARAMS_PATH` e grava o contrato do Executor em `RESULT_PATH`. Parâmetros:

| Parâmetro | Conteúdo |
|---|---|
| `mode` | `tracer` ou `geometry_growth` |
| `tracers` | Famílias `LRG`, `ELG`, `QSO`; padrão: as três |
| `bins` | Seleção alternativa de `LRG_z0`, `LRG_z1`, `LRG_z2`, `ELG_z1`, `QSO_z0` |
| `cases` | Modelos congelados `null` e opcionalmente `rival` |
| `cases.<modelo>.cosmology` | `H0`, `omega_b`, `omega_cdm`, `A_s`, `n_s`, `m_ncdm`, `N_eff`, `tau_reio` |
| `cases.<modelo>.geometry` | CPL tardio `w0_fld`, `wa_fld` usados para distâncias, efeito Alcock–Paczynski e prior Planck |
| `cases.<modelo>.growth` | CPL tardio separado, somente em `geometry_growth`, usado nos espectros CAMB de densidade e velocidade |
| `criterion` | `promote_delta_chi2`, `reject_delta_chi2`, `min_blocks`; opcional |

Os defaults cosmológicos são explicitados no smoke. O espaço é plano e os parâmetros iniciais e `H0` são compartilhados entre geometria e crescimento. Em `tracer`, o mesmo modelo CPL fornece geometria e crescimento. Em `geometry_growth`, os dois pares `(w0, wa)` podem diferir: distâncias vêm de um CAMB e os espectros de densidade/velocidade de outro CAMB. Essa divisão é fenomenológica; não demonstra uma realização física estável.

Em cada bin a receita perfila os três parâmetros físicos de viés `b1p`, `b2p`, `bsp` com os priors da implementação oficial (`b1p` uniforme de 0 a 3; `b2p` e `bsp` gaussianos de largura 5; `b3p=0`). Os quatro nuisance lineares `alpha0p`, `alpha2p`, `sn0p`, `sn2p` são perfilados analiticamente pelo código oficial e com seus priors gaussianos oficiais (`solve=best`). As cosmologias são pontos congelados: a receita não infere o posterior cosmológico e não otimiza `w0/wa` silenciosamente. O `profile_chi2` inclui as penalidades dos nuisance e do prior Planck. `delta_chi2` significa `chi2(null) - chi2(rival)`; valores positivos favorecem o rival fixado.

O prior Planck é uma compressão **unidimensional** declarada: `100 theta_* = 1.04110 ± 0.00031`, coluna TT,TE,EE+lowE+lensing da Tabela 2 de *Planck 2018 VI*, versão dos autores `1807.06209v3`. A receita baixa a publicação dos autores de `https://arxiv.org/pdf/1807.06209v3` e confere SHA256 `cfaccea46f78543bbae92cc16f1012034de9914f3e45a76c0a31a36d3a9c8de5` antes de aplicar esse número. Ela calcula `theta_*` via termodinâmica CAMB, usa a covariância escalar publicada e inclui o prior uma vez no conjunto. Essa compressão conserva a escala acústica; perde as demais correlações e a informação de amplitude do CMB. Seu alcance é a comparação tardia com setor inicial comum, segundo as hipóteses da tabela Planck. Toda a provenance é devolvida no resultado.

Exemplo de comparação fenomenológica congelada:

```json
{
  "mode": "geometry_growth",
  "tracers": ["LRG", "ELG", "QSO"],
  "cases": {
    "null": {"geometry": {"w0_fld": -1, "wa_fld": 0}, "growth": {"w0_fld": -1, "wa_fld": 0}},
    "rival": {"geometry": {"w0_fld": -1, "wa_fld": 0}, "growth": {"w0_fld": -0.9, "wa_fld": -0.2}}
  },
  "criterion": {"promote_delta_chi2": 9, "reject_delta_chi2": 4, "min_blocks": 2}
}
```

Os limiares desse exemplo são ilustrativos e devem corresponder ao TEST congelado. Sem ambos os modelos e critério, uma likelihood calculada devolve `INCONCLUSIVE/NO_FROZEN_COMPARISON`. Falta de arquivo, divergência de hash, vetor menor que 20 medições ou ajuste degenerado devolve `INCONCLUSIVE` com motivo; não há troca de compilação, covariância diagonal ou uso de resumos ShapeFit em lugar do full-shape.

## Alcance dos testes READY

| Teste | Parte fornecida | O que ainda deve estar congelado em outro cálculo |
|---|---|---|
| Geometria e crescimento da energia escura | Likelihood RSD full-shape por bin; comparação de pontos com CPL separado | Ajustes matched dos parâmetros cosmológicos e posterior-predictive check exigidos pelo TEST |
| Forma da supressão do crescimento | Likelihood RSD real com dependência em escala e redshift | Templates de famílias não frias, lensing/Ly-alpha, classificação em holdout e permutação; o TEST exige duas famílias de sonda |
| Compatibilidade entre modelos cosmológicos tardios | Avaliação de pontos tardios e penalidade da escala acústica Planck | Três famílias implementadas, derivadas normalizadas, vetor de tensões e BAO exigidos pelo TEST |

A receita fornece um componente desses contratos. Ela não autoriza declarar os três TESTs decididos apenas com um `RECIPE_BIND` para esta receita.

## Verificação local e CI existente

```bash
python -m pip install -r nexo-one/executor-runtime/requirements.txt
OMP_NUM_THREADS=1 python -m unittest discover -s nexo-one/executor-runtime/tests -p test_desi_dr1_fullshape.py -v
PARAMS_PATH=nexo-one/executor-runtime/recipes/smoke/desi_dr1_fullshape.json RESULT_PATH=/tmp/desi.out.json OMP_NUM_THREADS=1 python nexo-one/executor-runtime/recipes/desi_dr1_fullshape.py
```

O smoke inclui um bin LRG real (72 medições e janela 72×1047), realiza o cálculo REPT e perfila o viés. Seu resultado esperado é `INCONCLUSIVE/NO_FROZEN_COMPARISON`, com `profile_chi2` finito e dados reais na estatística. Na execução local: chi2 DESI = 59,26222676, chi2 Planck = 0,06099345, total = 59,32322021; fσ8(z=0,50963) = 0,47530583. O modo split também foi executado em LRG, ELG e QSO com dois modelos reais e likelihood finita. Os quatro testes numéricos/contratuais passaram, incluindo a integral de P(k) em Mpc que recupera sigma8 e a separação de distâncias e crescimento. O workflow existente `nexo-recipe-smoke.yml` já lê `requirements.txt` e inclui todo JSON em `recipes/smoke/`; nenhum workflow é alterado.

Dados DESI: CC BY 4.0. Cite DESI 2024 II, DESI 2024 V, DESI 2024 VII e Planck 2018 VI ao usar os resultados; acknowledgments completos em https://data.desi.lbl.gov/doc/acknowledgments/.
