# Expansão por sirenes gravitacionais

Receita `standard_sirens`, para o pedido READY
`HYP-GW-TCC-61BF4317C234D039EC79C556B7692E46-0`.
Lê as posteriores por evento do [release oficial LVK GWTC-3 v1](https://zenodo.org/records/5645777),
indicado pelo [GWOSC](https://gwosc.org/GWTC-3/), com versão/URL e SHA256
conferidos no código. Não usa CMB, Cepheids/TRGB, amostras simuladas ou
gaussianas ajustadas a limites publicados.

O arquivo inclui 46 eventos e escolhas distintas de hosts no mesmo GLADE+.
`host_choices: ["K", "bJ"]` compara seleção e pesos de luminosidade nas duas
bandas, mantendo a população BBH fiducial do release (μg=32,27,
Mmax=112,5, Λ=4,59). Não são dois catálogos independentes. As funções já
incorporam a seleção do levantamento e hipóteses populacionais do gwcosmo;
esta receita reproduz a combinação publicada, sem recalcular essas funções.

## Parâmetros congelados pelo teste

- `combinations`: listas distintas de eventos. Ordem invertida não gera outra
  combinação; evento desconhecido ou repetido é erro explícito.
- `intervals`: `inverse: [lo, hi]`, `local: [lo, hi]`, disjuntos dentro de
  [20,140] km/s/Mpc. Odds são a razão entre **probabilidades integradas** nesses
  intervalos, dependentes dos intervalos e do prior; não são fatores de Bayes
  de modelos cosmológicos completos.
- `shift_reference_h0`: referências `inverse` e `local` em km/s/Mpc para o
  deslocamento. Deve ser congelada antes do resultado. Mede a diferença entre
  média posterior e referência, na direção do lado preferido, dividida pelo
  desvio posterior. Sem referência, uma decisão positiva fica INCONCLUSIVE.

Combina eventos por produto em log das posteriores oficiais, com prior
uniforme de H0 contado uma vez, exatamente como `GWcosmo_DR.ipynb`.
Combinações ou escolhas de host que compartilham eventos nunca são multiplicadas
entre si. Não misturar diretamente GW170817/P1700296: suas amostras usam
prior 1/H0, diferente do prior uniforme desse release.

Critério: menos de cinco combinações ou menos de duas escolhas → INCONCLUSIVE;
inversão de lado → INCONCLUSIVE; odds <2 em todas as combinações e escolhas →
REJECTED; mesmo lado, odds ≥3 e deslocamento ≥1σ em todas → PROMOTED;
demais → INCONCLUSIVE. Falha de rede/hash, input ausente ou suporte inválido
produz INCONCLUSIVE com motivo. O retorno conserva a grade, posteriores
normalizadas, probabilidades, odds, momentos e fontes para auditoria.

O contrato READY não publica quais combinações, intervalos ou referência
definem o deslocamento. O Operador deve recuperar o binding congelado antes
de ligá-lo; os parâmetros de smoke abaixo não são esse binding.

## Verificações

```sh
cd nexo-one/executor-runtime/recipes
python -m unittest test_standard_sirens
PARAMS_PATH=smoke/standard_sirens.json RESULT_PATH=/tmp/sirens.json \
  python standard_sirens.py
```

Smoke real: GW150914+GW170814+GW190814, K/BJ, intervalos [66,69] e [71,74].
Retorna INCONCLUSIVE por uma combinação, com posteriores calculadas.

Prova adicional real, declarada para verificar o software: os 46 eventos,
mais quatro retiradas individuais (GW150914, GW170814, GW190814 e GW190425),
nas duas bandas, mesmos intervalos e referências 73/67,4. As dez odds ficaram
entre 1,036 e 1,137: REJECTED/ODDS_BELOW_TWO para essa comparação. Isso não é
um veredito do teste READY nem uma rejeição de um dos lados da tensão de H0.

Três testes de regressão verificam recuperação da soma de precisões de
gaussianas independentes, integral de probabilidade, gates de decisão,
inversão por host, duplicatas, evento ausente e hash alterado. Nenhum workflow
existente foi alterado; o CI descobre `smoke/standard_sirens.json`.
