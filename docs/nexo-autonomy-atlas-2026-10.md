# NEXO: autonomia verificável e ATLAS espacial

Implementação autorizada em 4 de outubro de 2026.

## Contrato de autonomia

O sistema avança uma tarefa a partir de evidência publicada: observar → escolher trabalho elegível → preparar → executar → verificar → registrar → reconciliar. Um relatório, prompt alterado, chamada tentada ou estado visual não equivale a execução concluída. O Writer existente continua sendo a autoridade única de mutação. Propostas não alteram diretamente a Tower, critérios científicos congelados, permissões ou charters.

Prioridades desta entrega:

- Recibos duráveis por intenção, incluindo falhas definitivas e conflitos de versão; replay idempotente e recuperação vinculada a versão nova.
- Coleta incremental do inbox com revisão explícita de dependências adiadas, tratamento de renomes e reconciliação de respostas truncadas.
- Saúde com estados reconhecidos por igualdade e com idade verificável da evidência.
- Prompts versionados por função e revisão independente acionada por eventos de PR.
- ATLAS espacial como entrada, detalhes operacionais sob demanda e equivalência navegável para dispositivos sem WebGL.

## Semântica visual

| Elemento | Dado do NEXO | Comportamento |
|---|---|---|
| Região | Roadmap/projeto/campanha | Cresce com os membros publicados; identidade estável |
| Nó | Hipótese/teste | Seleção abre o registro e suas evidências |
| Filamento de associação | Pertencimento publicado | Estático, distinto das dependências |
| Dependência | Relação entre entidades existentes | Bloqueio atenua a conexão |
| Pulso | Estado explícito RUNNING com fonte recente | Para com fonte desatualizada ou movimento reduzido |
| Brilho recente | Evento observado | Nunca simula execução |
| Câmera | Escala da inspeção | Cosmos → Pesquisa → Contexto |

As posições codificam relações do NEXO. Não são coordenadas astronômicas ou uma simulação física do universo. A projeção 2D usa os mesmos registros e links quando WebGL não está disponível. Resultados científicos, revisões e bloqueios permanecem estados distintos.

## Referências de direção visual

Pesquisa anterior à implementação, em fontes primárias:

- NASA, Large Scale Structures: https://science.nasa.gov/universe/galaxies/large-scale-structures/
- NASA, Mapping the Cosmic Web: https://science.nasa.gov/mission/hubble/science/science-highlights/mapping-the-cosmic-web/
- NASA Scientific Visualization Studio: https://svs.gsfc.nasa.gov/14598/
- ESO, observação de filamento: https://eso.org/public/images/potw2504a/
- ESO Supernova, Cosmic Web: https://supernova.eso.org/exhibition/images/1120_web-CC/?lang=en

Direção: vazios e concentrações, filamentos orgânicos, hierarquia de escala, contraste contido e instrumentos legíveis. Sem formação cosmológica fictícia, respiração ornamental ou giro automático que se passe por atividade do sistema.

## Restrições verificadas

- A API de automações exposta nesta sessão não contém campos de modelo ou esforço. A preferência solicitada é GPT 6 Luna / Medium, mas texto de prompt não configura o executor. A aplicação da preferência precisa de verificação no produto.
- O controle operacional usa uma receita de controle permitida; ele não foi convertido artificialmente em execução científica genérica.
- DRIVE_HTTP_403 continua sendo erro de acesso. Recibos e diagnóstico não concedem permissão ao principal nem substituem a credencial por outra rota.
- A normalização científica não fornece pré-registro inexistente, dados, receita ou resultados. Os bloqueios correspondentes permanecem ativos.

## Próxima promoção de autonomia

1. Verificar os testes/CI e publicação dos dois repositórios.
2. Verificar o principal de leitura do arquivo de controle e resolver a causa real do 403 dentro da autorização existente.
3. Recriar intenção vinculada ao recibo e à versão atual; exigir registro terminal e leitura de retorno pelo Writer.
4. Configurar e verificar GPT 6 Luna / Medium no executor de cada automação.
5. Substituir o coletor de baterias limitado às últimas 20 execuções por paginação e recibos duráveis por run, avançando o cursor somente após confirmação canônica. Esta migração não está incluída nesta entrega.
6. Acompanhar entregas científicas verificadas, tempo bloqueado, intenções duplicadas, idade das filas e custo por entrega. Aumentar cadência apenas se a fila elegível e a capacidade justificarem.

Reversão: reverter os commits de implementação e restaurar os prompts anteriores versionados; nunca apagar recibos ou reescrever o histórico para aparentar progresso.
