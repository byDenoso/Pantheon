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


## Private-output transport (draft; launch requires reviewed configuration)

The calculation and frozen source hashes above are unchanged. The historical
public smoke invocation above is no longer an execution route: the entry point
requires the private runner, and the public battery rejects `cf4_velocity` before
loading any frozen recipe revision. The public scheduled smoke reports SKIPPED,
not PASS or scientific completion. Pure synthetic invariant tests remain enabled.

`.github/workflows/nexo-cf4-private.yml` is a manual, main-only, single-job route.
It reuses the existing `NEXO_DRIVE_WRITER_JSON` credential only in the transport
steps. No secret is passed to the calculation child. No result artifacts, job
summaries or scientific stdout are published. Both normal output and stderr stay
in the ephemeral private directory and are included in a private Drive bundle.
Public messages are fixed `STATUS` values. The workflow does not change the
Writer's routing, schedules or frozen reservations.

Before any launch, an authorized maintainer must review a private JSON config and
bind its exact bytes using `NEXO_CF4_PRIVATE_CONFIG_FILE_ID` and
`NEXO_CF4_PRIVATE_CONFIG_SHA256` (configuration secrets, not new credentials).
This PR does not create them, a destination folder, or any access permission.
The JSON schema is `NEXO_CF4_PRIVATE_V1`; it contains:
- `params`: the approved scientific parameters, retaining the original contract;
- `recipe_sha256`: hash of the reviewed recipe bytes in the merged revision;
- `output_folder_id`: an existing authorized private My Drive folder;
- `output_file_id`: an empty binary file preallocated by the user in that folder,
  reserved exclusively for this one execution (not owned by the service account);
- `allowed_permission_ids`: the approved existing user/group Drive permission IDs.

No actual IDs, parameters or private configuration are committed to the repo.
Missing config, changed recipe/config hashes, public/domain sharing, unknown
recipients, shared-drive destinations or inaccessible permissions fail closed
before scientific execution. Destination ACLs are checked again before upload
and on the result afterward. Size and SHA-256 are compared against a downloaded
readback. ACL checks are observations, not a guarantee against later ACL changes.
The workflow never creates files or changes permissions. It PATCHes only the
preallocated empty user-owned file; a nonempty target, service-account-owned file,
wrong folder or native Google document is refused. This avoids relying on a
service account owning new My Drive files (service accounts lack storage quota).
The output must be reserved exclusively: the size check is not an atomic lock
against an external writer. A new execution requires a new approved empty target.

A green upload step means private bytes and ACL were verified, not that the
scientific verdict was positive. Compute failure still leaves the job failed;
its available diagnostics are delivered privately where possible. Upload timeout
or readback failure remains unverified: no blind retry, no public fallback.
After an uncertain PATCH, reconcile the known private target against the expected
bytes/hash before considering another launch. Cleanup occurs only after verified
delivery, but GitHub-hosted runner termination still loses local-only bytes. No
private backup destination has been authorized; this transport does not claim
checkpoint recovery or durability when Drive is unavailable.

Before merging or launching, review destination/recipient configuration, verify
CI for the exact commit, and perform an explicitly authorized synthetic Drive
integration check. Unit tests mock Drive and do not prove a live delivery.
