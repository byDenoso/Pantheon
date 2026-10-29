# Investigação contínua com o estado existente

O planejador estende `nexo_scientific_state.py`, a projeção de eventos do Writer,
e oferece uma entrada executável em `nexo_research_planner.py`. Não acrescenta
serviço, banco, agendador, fila ou Roadmap. MURAL e RESULTADOS permanecem as
fontes; SHADOW_V2 permanece o transporte; CHECKPOINTS permanece um cursor.

## Ciclo de um pulso

1. Leia o checkpoint, os eventos recentes e os resultados pertinentes às
   perguntas candidatas. Recupere uma projeção anterior validada quando houver;
   forneça apenas os deltas e as linhas antigas necessárias para comparar
   equivalência. Não conclua ausência histórica a partir de uma leitura parcial.
2. Formule hipóteses rivais, previsões e um observável capaz de distingui-las.
   O código recebe essa decisão científica; não a fabrica a partir de títulos.
   Perguntas podem surgir de resultados nulos, literatura, dados recém-obtidos
   ou controles materialmente distintos, sem esperar o fim de um Roadmap.
3. Confira os bytes e os requisitos próprios do cálculo. Registre dependências
   com evidência e validade. Separe ausência física, autorização, erro técnico
   e não identificabilidade. Um requisito E2 não é requisito universal de E0/E1.
4. Proponha QUESTION no mesmo fluxo NEXO_SCIENCE_V1 e execute o planejador.
   Reutilize equivalentes, isole perguntas bloqueadas e selecione o menor
   teste viável com poder discriminante adequado ao seu escopo.
5. Execute no runtime existente. Registre CALCULATED com números, recibo,
   hashes, interpretação e artefato. Persistência atrasada não apaga o cálculo.
6. Reexecute a projeção com o delta. A pergunta calculada sai da elegibilidade.
   Se o resultado motivar outra pergunta, registre sua diferença material no
   mesmo mecanismo. Não crie uma lista operacional persistente separada.

## Comando utilizável

Salve respostas de leituras delimitadas do conector em JSON. A CLI aceita os
objetos nativos `values` e seus wrappers `structuredContent`. Os intervalos
devem incluir a largura completa da tabela: MURAL A:H, RESULTADOS A:J e
SHADOW_V2 A:O, em ROWS.

```bash
python scripts/nexo_research_planner.py \
  --mural-read mural_delta.json \
  --results-read resultados_pertinentes.json \
  --spool-read spool_delta.json \
  --events propostas.json \
  --role S2 \
  --out plano.json \
  --state-out projecao_descartavel.json \
  --spool-out propostas_A_O.json
```

`propostas.json` é uma lista de corpos NEXO_SCIENCE_V1 ou envelopes Writer
existentes. `event_envelope()` e `plain_spool_row()` usam os validadores do
Writer, incluindo roundtrip por `decode_plain`. A CLI nunca envia essas linhas.
O produtor usa somente o SHADOW_V2 autorizado e faz o readback contratual.

Em uma leitura incremental:

```bash
python scripts/nexo_research_planner.py \
  --previous projecao_descartavel.json \
  --results-read novos_resultados.json \
  --role all --out nova_decisao.json
```

O relatório declara as leituras, hashes, escopo histórico, conflitos,
recomendações e razões de exclusão. A projeção é um cache reconstruível, sem
autoridade de fila. Nunca misture snapshots de outro laboratório ou interprete
uma resposta de outra aba como evidência canônica. A CLI recusa intervalos,
dimensões ou colisões de caminhos inválidos. Incidentes já colocados em
quarentena pelo Writer ficam visíveis e não paralisam candidatos independentes.

## Identidade e equivalência

`scientific_id()` preserva os IDs anteriores. `equivalence_id()` acrescenta
comparação estrutural de estimando, observável, bytes e desenho material.
Renomear pergunta, seed, Task ou alias do mesmo arquivo não produz novidade.
Uma mudança de seleção, covariância, likelihood ou hipótese precisa ser
explicitada no desenho e justificada cientificamente.

O código não reconhece automaticamente sinonímia científica. Para legado,
QUESTION pode receber `prior_evidence` com a relação `equivalent` ou `informs`,
o ID real da linha, `canonical_row_sha256(row)`, comparação explícita e data da
conferência. Somente o hash exato de uma fonte canônica confirma essa ponte.
Um equivalente consumido não exige hidratar seus dados para ser reutilizado.
A ponte não fabrica recibo, cálculo ou contagem científica.

## Informação e custo

`opportunity` registra pergunta física, pelo menos duas previsões rivais,
discriminador, estimativa de informação com justificativa, custo em segundos e
escopo da busca bibliográfica. Quando possível, inclua uma previsão quantitativa
de precisão ou potência calculada antes do ajuste, distinguindo-a da nota
heurística de prioridade. Sem pesquisa bibliográfica, originalidade recebe
peso zero; a exploração autorizada pode continuar.

`plan_research(state, role, limit=16, budget_seconds=None)` explica o ranking e
aplica um orçamento opcional. Custos relativos legados e segundos não são
comensuráveis: o relatório avisa sobre a mistura. Notas de informação não são
probabilidades de descoberta nem evidência contra qualquer modelo.

## Registro, interpretação e concorrência

CALCULATED pode registrar `interpretation` com cinco campos: `physical_meaning`,
`hypothesis_update`, `effect_origin`, `not_identifiable` e `next_observation`.
Registrar INCONCLUSIVE não torna a mesma análise elegível outra vez. Resultados
nulos são preservados; revisão e transporte não contam como novas perguntas.

Entre produtores concorrentes, a reserva depende da revisão real do Writer
com admissão serial, de sua execução e do readback. O Writer antigo consegue
transportar o texto dos eventos, mas isso não prova que aplicou essa semântica.
Um STARTED com `execution_mode=LOCAL_ISOLATED` apenas informa cálculo local
ativo: impede a recomendação repetida, mas não declara reserva distribuída.
A ausência da extensão remota não veta cálculo local autorizado e isolado.

Dependências `requires: [science_id]` continuam exigindo persistência. Para
consumo local explícito de resultado já calculado, use o formato tipado
`minimum_state=calculated` com `artifact_readback` (URI, hash conferido,
evidência, checked_at e expires_at). O código compara o hash declarado com a
saída; quem produz o evento continua responsável por verificar os bytes.

## Validação e promoção

As suites `test_nexo_research_planner` e `test_nexo_research_planner_cli`
verificam deduplicação, fontes legadas, isolamento de bloqueios, orçamento,
feedback, transição após resultado e limites de admissão. Seus números são
fixtures técnicas, sem interpretação cosmológica.

O workflow existente descobre os testes e o Writer conserva seu conjunto de
regressão. Promover código segue a autorização vigente; não publicar snapshots
privados, dados, artefatos científicos ou credenciais. Um pacote privado pode
ser usado para a seleção local antes da promoção, com revisão e hash conhecidos.
Somente depois da execução/readback da revisão remota se pode afirmar que a
extensão de concorrência do Writer está implantada.

## Frentes e limite de recomendações

A seleção suporta S1–S7 e P sem modificar o ownership original das perguntas.
O limite padrão de 16 recomendações por consulta é somente uma paginação da
projeção, configurável de 0 a 50. Ele **não** é uma meta, quota científica ou
permissão de executar 16 testes. O piloto operacional de até dez testes
materialmente distintos por pulso pertence às instruções vigentes das Tasks,
sem mínimo e sem recontar revisões, seeds ou avaliações correlacionadas.
