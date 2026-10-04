# NEXO: descoberta científica e reconciliação de baterias

Esta etapa conecta a descoberta de trabalho científico ao Writer existente e remove a janela fixa das últimas 20 execuções na coleta de resultados. A confirmação de uma fila não equivale à confirmação de execução.

## Interface por função

`get_scientific_queue` lê a Tower privada com verificação de corpo, revisão e autoridade. A resposta contém apenas campos operacionais permitidos, os motivos registrados de bloqueio e a tentativa canônica vinculada ao teste. Os registros privados e os domínios pessoais não entram nessa interface científica.

O Executor descobre testes READY com atestação armazenada de elegibilidade, tentativas ativas e recuperações atribuídas à sua função. Cientista, Crítico e Engenheiro recebem as filas correspondentes às suas funções. A elegibilidade retornada é a atestação registrada pelo Writer, não uma nova avaliação científica feita pelo MCP.

Tentativas concluídas saem da descoberta geral, mas a consulta explícita por `test_id` mantém o acompanhamento da tentativa canônica até o estado terminal.

Exemplo de leitura:

```json
{"role":"EXECUTOR","limit":50}
```

Se `next_cursor` estiver presente, a próxima chamada deve enviar esse valor em `cursor`. O cursor está vinculado à revisão, à função e ao principal. Em `SCIENCE_CURSOR_STALE`, releia a primeira página e deduplique pelos IDs e versões já observados. A paginação usa a mesma ordenação tanto para exibir quanto para continuar os registros.

`request_scientific_execution` está disponível somente para um principal autenticado com a função EXECUTOR:

```json
{"test_id":"ID_CANONICO_DO_TESTE"}
```

A ferramenta exige a versão canônica do teste, READY, atestação de elegibilidade e vínculo de receita/parâmetros. Ela rejeita uma tentativa ativa equivalente. O identificador da intenção deriva da versão do teste e de seu vínculo congelado, preservando a idempotência quando uma alteração não relacionada modifica a revisão global da Tower.

A solicitação usa um envelope `TEST_BATTERY` no spool existente. A leitura de retorno confirma o corpo exato e produz `PENDING_WRITER`. O Writer ainda revalida prontidão, critérios congelados e reserva antes de despachar. O MCP não cria uma segunda autoridade de escrita ou uma segunda fila científica.

## Coleta de resultados

O limite de 20 passa a ser o orçamento de processamento por rodada, e não uma janela que elimina execuções antigas da descoberta. O coletor combina descoberta recente, paginação histórica com limite temporal fixo e retomada independente de pendências. Intervalos que excedem o limite de pesquisa da API são subdivididos; uma resposta truncada não é tratada como história completa.

Cada execução é identificada por `run_id` e `run_attempt`. O coletor seleciona o artefato por identidade, verifica a tentativa antes e depois do download e valida o manifesto produzido pelo workflow. Artefatos legados exigem uma associação inequívoca com a tentativa. Ambiguidade ou falta de evidência permanece pendente.

O avanço da descoberta e a confirmação de conclusão são estados diferentes:

- Descoberta pode avançar quando os IDs pendentes foram persistidos para retomada.
- ACK de conclusão exige o recibo do Writer para o hash exato do envelope e a bateria terminal canônica correspondente.
- A revisão global da Tower, isoladamente, não confirma um resultado.
- O cursor público persiste identidades, hashes e estados de reconciliação; não recebe os resultados científicos privados.

O manifesto de novos artefatos contém `run_id`, `run_attempt`, `battery_id` e o hash do conteúdo comprometido. O Writer atual não grava todos os metadados de artefato na entidade bateria: o vínculo adicional é preservado no recibo exato do envelope e no ACK do coletor.

## Prompt operacional complementar

> Consulte `get_role_capabilities` e use somente ferramentas disponíveis à sua função. Leia `get_scientific_queue` até `next_cursor` ser nulo, respeitando o orçamento da rodada. Retome pendências e tentativas existentes antes de iniciar outra. Para um teste READY elegível, o Executor pode chamar `request_scientific_execution`. Trate `PENDING_WRITER` como solicitação enfileirada; acompanhe o vínculo canônico, a tentativa, o resultado e o recibo antes de declarar entrega. Bloqueio de dados, pré-registro, receita ou acesso não autoriza inventar insumos ou alterar critérios. Uma revisão de cursor desatualizada exige releitura e deduplicação, não reenvio indiscriminado.

Esse complemento se soma ao pacote versionado `byDenoso/TCC/gpt/automations/nexo-automation-prompt-pack-v1.0.0.md`.

## Limites da promoção

O código e seus testes não comprovam, por si só, um ciclo científico agendado de ponta a ponta. A promoção operacional exige observar uma solicitação elegível, a decisão do Writer, a execução, a coleta e o recibo terminal na mesma cadeia de identidade.

Continuam independentes desta etapa: resolver a causa autorizada de `DRIVE_HTTP_403`, verificar GPT 6 Luna / Medium no executor das automações e ligar registros pessoais STAGING à entidade canônica por identidade explícita. Nenhuma dessas condições pode ser satisfeita apenas por texto de prompt ou por mudança visual no ATLAS.

O acesso à Tower ainda transfere o documento inteiro por chamada, com metadados antes e depois. A paginação desta interface limita a resposta ao agente, mas não torna esse arquivo monolítico incremental. A próxima otimização é um índice canônico dos itens ativos, gerado pelo Writer e vinculado à revisão, ou um cache que revalide os metadados ao vivo; o aceite deve medir bytes transferidos e latência sem servir elegibilidade desatualizada.
