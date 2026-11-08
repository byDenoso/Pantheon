# Leitura privada da SHADOW no Cockpit

O Cockpit de `nexo-one` consulta `/api/atlas-cockpit` na própria origem, protegido pela sessão existente. A leitura da SHADOW continua condicionada à flag de servidor já existente. A área privada de `nexo-atlas` usa outro contrato e outro acesso para o snapshot JSON. Uma data, revisão ou fingerprint de um não identifica o outro; nenhum dos dois comprova, por si só, que o outro está atualizado.

A consulta devolve a hora de início, a modificação informada pela fonte e a disponibilidade de cada aba. `available` significa que a aba foi lida com cabeçalho válido; `unavailable` indica ausência ou falha da aba; `unknown` indica que a origem não forneceu esse estado. Um vetor vazio de aba indisponível ou desconhecida não é uma coleção validamente vazia. A data de modificação não garante que a leitura das abas tenha sido atômica.

O leitor limita o histórico por aba e mantém até 100 linhas de resultados antes da projeção privada filtrada; o Cockpit encaminha até 60 linhas de resultados para as vistas de atividade. As contagens descrevem o recorte projetado, não o total da Tower. Uma aprovação que não aparece na leitura pode estar fora da janela ou ter sido filtrada. `MISSING` significa apenas não localizada no recorte; não prova exclusão. Se a aba necessária estiver indisponível ou sem cobertura informada, a verificação daquela classe de aprovação fica indisponível e novos itens dessa classe não podem ser aprovados a partir dela. Aprovações existentes e regras de publicação permanecem preservadas.

O digest legado V1 é calculado sobre a linha projetada, não sobre a linha integral da SHADOW. O leitor não inclui método nem referências nessa projeção, e limita o tamanho de certas células. Portanto, ausência de alerta não prova que todos os campos originais permaneceram iguais. Nenhum digest, aprovação ou versão armazenada é migrado por esta alteração.

Uma revisão futura pode definir um contrato V2 com identidade, conjunto de campos, normalização, limites e versão do digest explicitamente registrados. Antes de qualquer migração, a fonte completa e a autorização para cada campo precisariam ser verificadas; versões antigas teriam de continuar identificadas como V1, sem inferir equivalência ou reaprovação. A busca por uma linha fora da janela exigiria acesso autorizado e cobertura explícita. Não implementar V2 ou backfill até que a política de transição seja revisada.

Os testes usam somente fixtures sintéticas. A fonte e a configuração efetivamente ativas em produção dependem de leitura autenticada autorizada; não foram verificadas aqui.

## Filas, placar e manuscritos (arquitetura de 07/11/2026)

`/api/atlas-cockpit` devolve também `architecture` (`NEXO_ARCHITECTURE_V1`), calculado no servidor a partir das linhas já lidas, sem nova fonte. Contém as nove filas do Mural pela coluna `tipo` (HIPOTESE_PRE, PRIOR_ART_PRE, HIPOTESE_DUPLICADA, VARREDURA_REGISTRO, VARREDURA_RESULTADO, CANDIDATO_ABERTO, PEDIDO_AJUDA, PAPER_CANDIDATO, DECISAO_DENER), hipóteses sem prior art citando o ID, pedidos de ajuda sem linha posterior citando o ID, os cartões DECISAO_DENER e o placar de achados.

O placar conta IDs únicos por fila desde 07/11/2026: G3 = CANDIDATO_ABERTO, G5 = PAPER_CANDIDATO, G4 = candidatos citados por um PRIOR_ART_PRE "não encontrei" da janela. Palavras de grau no texto livre (todo registro cita G0 a G5) não entram na conta. A conferência dos IDs de HIPOTESE_PRE e PRIOR_ART_PRE de cada candidato exige um formato de ID fixo e não é feita.

O leitor guarda as 300 linhas mais recentes do Mural e, além delas, até 120 linhas antigas de CANDIDATO_ABERTO, PAPER_CANDIDATO e DECISAO_DENER posteriores a 07/11/2026, para que cartões não saiam da tela em horas.

O estado dos manuscritos vem da aba opcional MANUSCRITOS da Tower (colunas de `MASTER_CATALOG/manuscritos.csv`; `scripts/manuscritos-para-tower.mjs` gera as linhas). Os dados não ficam neste repositório público; a coluna `pacote` (caminho local) não é enviada ao navegador. A aba ausente aparece como indisponível, sem derrubar a leitura.

A aba EQUIPE continua sendo a fonte do elenco: papel, cadência ("1h :MM America/Sao_Paulo") e frentes aparecem como estiverem na Tower. Linhas com estado CORE4, histórico, aposentada ou arquivada saem da contagem. Várias linhas que postam sob o mesmo nome no Mural (as automações da Lumia) são exibidas sem atividade atribuída.
