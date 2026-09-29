# CF4 corrigido × Pantheon+ de baixo redshift

`cf4_velocity` calcula uma reconstrução local explícita usando velocidades radiais
do Cosmicflows-4 corrigido. Cruza essa reconstrução com as mesmas SNe Pantheon+
usadas na correção padrão e publica dispersão, dipolo, razão de H0 e retiradas regionais.

## Fontes congeladas

- CF4: tabelas 3 e 4 de Tully et al. 2023, ApJ 944, 94, no arquivo oficial CDS
  `J/ApJ/944/94`, documentação de 28-Jan-2025. Correspondem aos produtos publicados
  **CF4 All Groups** e **CF4 All Group Velocities** descritos pelo
  [EDD](https://edd.ifa.hawaii.edu/). O EDD identifica a publicação como a versão
  corrigida e manda descartar as tabelas iniciais de agosto de 2022.
  A receita usa exclusivamente o arquivo publicado CDS; não tenta outro release.
- Pantheon+: `Pantheon+SH0ES.dat` e `Pantheon+SH0ES_STAT+SYS.cov`, commit
  `c447f0fea703fcd0fff57de5000947b5ca81286b` do repositório oficial
  [PantheonPlusSH0ES/DataRelease](https://github.com/PantheonPlusSH0ES/DataRelease).
- URLs, versões e SHA256 estão congelados em `SOURCES`, são conferidos antes do
  cálculo e aparecem no resultado. Mudança dos bytes gera `DATA_HASH_MISMATCH`.

## Reconstrução e comparação

1. Selecionar grupos com `0.005 <= V3k/c < 0.1`, incerteza válida e nenhum
   módulo de distância SNIa na tabela 3. Verificar o módulo evita interpretar
   contagem em branco como prova de ausência. A velocidade usada é **Vpwf**,
   estimador logarítmico Watkins–Feldman da tabela corrigida.
2. Usar o referencial CMB e as convenções do catálogo: H0=74,6 km/s/Mpc,
   Ωm=0,27, universo plano. A incerteza radial é
   `fV3k/(1+z) * ln(10)/5 * eDM`, com 250 km/s de dispersão não linear
   em quadratura. Posições vêm de redshift CMB, sem selecionar pela distância
   ruidosa medida.
3. Em cada posição SN, ajustar por GLS um vetor de fluxo constante local com
   janela gaussiana de 40 Mpc. Este é um estimador definido pela receita;
   não se identifica com o campo Wiener/HMC do EDD. Exigir cobertura efetiva
   suficiente e matriz de direção de posto completo. Propagar o operador linear
   completo para manter a covariância entre SNe que usam os mesmos grupos.
4. Fixar SNe não calibradoras pelo **zCMB**, inicialmente `0.01 <= zCMB < 0.05`.
   Calcular `zcos = (1+zCMB)/(1+v/c)-1`; usar `zHEL` na conversão de distância
   comóvel em luminosidade. Comparar com o `zHD` padrão do release.
5. Manter STAT+SYS publicado e acrescentar a covariância propagada CF4.
   Os dois modelos usam **os mesmos pesos**. A receita conserva as incertezas
   de velocidade padrão, pois o release não fornece sua decomposição completa
   em uma matriz separada; a ponderação é conservadora e não remove componentes
   de covariância por hipótese.
6. Medir RMS após retirar o monopolo, dipolo por GLS e mudança relativa do
   intercepto de Hubble. Repetir para `zCMB >= 0.023` e retirar, uma por vez,
   as oito regiões definidas pelos sinais x/y/z das direções equatoriais.
   Medições repetidas da mesma SN permanecem na matriz publicada, mas o mínimo
   de amostra conta **CID distintos**.

H0 absoluto não é medido por este cruzamento. `delta_h0_at_reference_km_s_mpc`
normaliza a razão entre interceptos na referência 74,6; não substitui uma âncora.
O estimador local é um diagnóstico linear com escala congelada; não corrige
por si só seleção/Malmquist nem representa uma reconstrução cosmológica integral.

## Contratos dos testes READY

| Modo | Teste | Limite decisório |
|---|---|---|
| `sn_crosscheck` | `XAREA26-007-SN-VELOCITY-DENSITY-CROSSCHECK` — Movimentos locais previstos pelo mapa de matéria | Publica o cruzamento real. Retorna `INCONCLUSIVE / SINGLE_DISTANCE_RECONSTRUCTION`: o contrato exige duas reconstruções independentes e previsão externa de densidade; esta reconstrução vem de distâncias CF4. |
| `anchor_velocity` | `H0X26-010-ANCHOR-VELOCITY-FIELD-ORTHOGONALITY` — Âncoras locais e velocidades peculiares | Publica o mesmo diagnóstico. Retorna `INCONCLUSIVE / MISSING_INDEPENDENT_FIELD_AND_ANCHORS`: faltam o segundo campo independente e as calibrações públicas congeladas Cepheid/TRGB com covariância. |

Excluir grupos SNIa elimina uso direto dessas medidas de distância na
reconstrução. A calibração global CF4 combina metodologias, incluindo SNe;
**independência estatística em relação ao Pantheon+ não foi estabelecida**.
O campo público CF4 completo e sua versão agrupada compartilham dados; contar
ambos como duas reconstruções independentes violaria esses contratos.

Os critérios congelados não são relaxados. Esta receita entrega o componente
CF4 computável e mostra os bindings que faltam para decidir os dois testes.
Amostra pequena, fonte ausente, hash divergente ou céu degenerado produzem
`INCONCLUSIVE` com motivo; nenhuma SN recebe previsão substituta silenciosa.

## Executar e verificar

```bash
PARAMS_PATH=nexo-one/executor-runtime/recipes/smoke/cf4_velocity.json \
RESULT_PATH=/tmp/cf4-velocity-smoke.json \
OPENBLAS_NUM_THREADS=1 \
python nexo-one/executor-runtime/recipes/cf4_velocity.py

python nexo-one/executor-runtime/recipes/test_cf4_velocity.py
python nexo-one/executor-runtime/recipes/test_cf4_velocity.py \
  --real-result /tmp/cf4-velocity-smoke.json
```

O primeiro comando baixa dados reais com hashes conferidos. A validação do
resultado exige as 38.053 entradas CF4, exclusão de grupos SNIa, estatísticas
numéricas nos dois cortes e oito retiradas por corte. Os testes numéricos
verificam recuperação de um fluxo vetorial conhecido, covariância compartilhada,
rejeição de céu sem posto e rejeição de artefato modificado. O workflow existente
`nexo-recipe-smoke.yml` encontra automaticamente o JSON; não foi alterado.

Smoke local com esse release: 36.389 grupos sem SNIa; 921 grupos SNIa excluídos
na profundidade selecionada; 418 SNe distintas no primeiro corte e 259 no
segundo; cobertura local mínima de 135,7 grupos efetivos. Os dois cortes e
as 16 retiradas regionais produziram estatísticas finitas. O resultado foi
`INCONCLUSIVE / SINGLE_DISTANCE_RECONSTRUCTION`, conforme o limite acima.
