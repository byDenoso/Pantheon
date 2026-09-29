# BAO DR1 e DR2 com supernovas

`w0wa_bao_sn_multi` aceita `bao_release: "dr1" | "dr2"` (padrão DR2).
Modos e critérios das famílias permanecem congelados: retirada de faixa de
redshift ou de grupo BAO, ajuste CPL contra ΛCDM, marginalização analítica do
intercepto das supernovas e os mesmos priors declarativos. Os nove ataques
READY de troca de release podem usar DR1 preservando as compilações, priors,
agrupamentos e critérios de seus testes-alvo. Esta receita não liga testes nem
grava resultados na Tower.

Os dados BAO são a likelihood gaussiana oficial distribuída pelo Cobaya
([descrição do release DESI 2024](https://github.com/CobayaSampler/cobaya/blob/master/cobaya/likelihoods/bao/desi_2024_bao_all.py)).
BAO, Pantheon+, DES-Dovekie e Union3 têm commit e SHA256 fixados no código;
`statistics.data_sources` informa as URLs e hashes realmente utilizados.
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
também ficam inconclusivos. Uma compilação continua insuficiente para os
critérios destas famílias.

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

O smoke usa DR1, DES-SN5YR e Union3, prior Ωm=0,315±0,02, retirada Lyα.
O CI existente descobre o mesmo smoke; nenhum workflow foi alterado.
