# BAO DR1 e DR2 com supernovas

`w0wa_bao_sn_multi` aceita `bao_release: "dr1" | "dr2"` (padrão DR2).
Modos e critérios das famílias permanecem congelados: retirada de faixa de
redshift ou de grupo BAO, ajuste CPL contra ΛCDM, marginalização analítica do
intercepto das supernovas e os mesmos priors declarativos. Os nove ataques
READY de troca de release podem usar DR1 preservando as compilações, priors,
agrupamentos e critérios de seus testes-alvo. Esta receita não liga testes nem
grava resultados na Tower.

Para DR1, a documentação oficial do DESI em `data.desi.lbl.gov` declara que as likelihoods usadas nos resultados BAO são publicadas no repositório `CobayaSampler/bao_data`, nos arquivos `desi_2024_*`: https://data.desi.lbl.gov/doc/releases/dr1/vac/bao-cosmo-params/ . A receita fixa o commit exato desse repositório e o SHA256 dos vetores/covariâncias usados. `statistics.official_provenance` registra a página oficial DESI e o repositório declarado por ela; `statistics.data_sources` registra as URLs e hashes dos bytes realmente consumidos.
Não há URL configurável, troca automática de release ou substituição de SNe.
DES e Pantheon+ compartilham objetos de baixo redshift: as compilações são
ajustadas separadamente, nunca multiplicadas como likelihoods independentes.

## Holdouts

`tracer_groups[].z` deve conter os redshifts do release escolhido:

| Grupo | DR1 | DR2 |
|---|---|---|
| BGS | 0.295 | 0.295 |
| LRG | 0.510, 0.706 | 0.510, 0.706 |
| LRG+ELG | 0.930 | 0.934 |
| ELG | 1.317 | 1.321 |
| QSO | 1.491 | 1.484 |
| Lyα | 2.330 | 2.330 |

DR1 QSO mede DV/rd; DR2 QSO mede DM/rd e DH/rd. A seleção usa o vetor e a
submatriz de covariância de cada release. Redshift ausente retorna INCONCLUSIVE
com motivo, em vez de executar uma retirada vazia. Compilações repetidas,
ganho CPL nulo, erro de rede/hash, falha de convergência ou amostra pequena
também ficam inconclusivos. O contrato canônico existente de `bao_tracer_jackknife` com somente Union3
preserva seu ramo específico: fração máxima <0,5 promove, >=0,7 rejeita.
Os demais contratos exigem duas compilações. No modo de traçadores, pelo
menos duas precisam satisfazer integralmente todos os holdouts e cossenos;
falhas em grupos diferentes entre compilações não contam como sucesso.

Limite: o prior de Ωm desta análise leve não é uma likelihood CMB completa.
Um contrato que exija CMB ou outra contribuição ainda precisa desse binding;
esta extensão fornece BAO+SNe e não substitui o componente ausente.

## Smoke real e regressões

```sh
cd nexo-one/executor-runtime/recipes
OPENBLAS_NUM_THREADS=1 python -m unittest test_w0wa_bao_sn_multi
OPENBLAS_NUM_THREADS=1 PARAMS_PATH=smoke/w0wa_bao_sn_multi.json \
  RESULT_PATH=/tmp/w0wa.out.json python w0wa_bao_sn_multi.py
```

O smoke versionado usa DR1 e Union3, prior Ωm=0,315±0,02, retirada Lyα.
A mesma configuração foi conferida também com DES-SN5YR e Union3 separadamente.
O CI existente descobre o mesmo smoke; nenhum workflow foi alterado.

### Parameter preflight (V1)

`preflight/w0wa_bao_sn_multi.json` records the supported DR1/DR2 observation
redshifts and immutable input identities. `recipe_param_preflight.validate_params`
uses only the Python standard library, without network or fitting. It checks
release selectors, modes, compilation names, priors, holdout shape and exact
input-manifest membership. It never translates DR2 selectors into DR1 selectors.
The Writer reserves covered recipes only after this check; the battery runner
repeats it and compares the frozen manifest and validator SHA256 values.

Coverage is this recipe only. The check does not prove that remote inputs are
available or a fit will converge, nor does it change preregistered scientific
criteria. Other recipes keep their existing scope unless explicitly enrolled.
Input or fit errors exit nonzero with `execution_status=INPUT_OR_FIT_UNAVAILABLE`
and no scientific verdict. Receipts report `ok=false`, `result=null` and typed
operational reasons; a genuine completed `INCONCLUSIVE` result remains valid.
