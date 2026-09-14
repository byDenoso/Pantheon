# NEXO Atlas — auditoria de experiência e arquitetura

Data: 14 de setembro de 2026  
Escopo: frontend React/TypeScript, contratos de leitura e rotas do Atlas  
Fonte visual: screenshot atual do Observatório + inspeção do código e do snapshot publicado

## Diagnóstico executivo

O produto já tem uma base espacial forte: Grafos concentra a navegação por sistemas, domínios e campanhas, com Canvas 2.5D suportado e WebGL 3D experimental. O problema principal do Observatório não era falta de cartões; era falta de semântica compartilhada entre os cartões e a fonte.

O estado anterior misturava:

- perguntas reais dos domínios;
- síntese quantitativa que a fonte ainda não publica;
- testes e evidências, que não devem virar nós do mapa;
- um mini-mapa duplicado da aba Grafos;
- Atividade como uma sexta área principal, apesar de ser uma linha operacional acessível pela notificação.

Essa mistura produzia os cartões genéricos “Sem síntese publicada” e fazia uma página aparentemente cheia continuar sem orientação de próxima ação.

## Arquitetura de navegação decidida

| Superfície | Papel | Fonte/autoridade | Destino principal |
| --- | --- | --- | --- |
| Cockpit | saúde operacional, sincronização e status do backend | runtime/API | operações autenticadas |
| Grafos | exploração espacial de SYSTEM → DOMAIN → CAMPAIGN | contrato de grafo | mapa 2.5D / WebGL 3D experimental |
| Observatório | leitura semântica do estado científico | contrato `NEXO_ATLAS_OBSERVATORY_QUESTIONS_V1` + resumos | perguntas, tensões e sinais |
| Laboratório | investigação textual de claims, testes, runs, resultados e evidências | endpoints de pesquisa/API | pipeline e registros |
| Resumo do Universo | síntese por pergunta e domínio | mesmo contrato do Observatório | visão longitudinal sem mapa duplicado |
| Atividade | timeline operacional autenticada | runtime operacional | acessada pela notificação, fora da navegação primária |

O Resumo do Universo continua existindo porque responde a uma tarefa diferente: “o que está publicado por domínio?”. Ele não deve competir com o Observatório como outra porta de entrada equivalente. Atividade continua roteável para preservar links e notificações, mas deixou de ocupar um slot primário.

## Contrato do Observatório

`GET /api/observatory-questions` agora compõe o contrato a partir do endpoint de grafo já existente. A função não cria uma segunda leitura do Neon: primeiro lê `SYSTEM → DOMAIN`, depois lê cada domínio, consulta o nível de cada campanha apenas para contar seus testes e reúne somente as campanhas no payload semântico.

O payload separa explicitamente:

- `question`: texto publicado no resumo do domínio;
- `status` e `rawStatus`: status normalizado para a UI e status original da fonte;
- `campaigns`: campanhas reais vinculadas ao domínio;
- `counts.tests`: soma de `metadata.testCount` somente quando a fonte publicou esses valores;
- `synthesis`: permanece `null` enquanto nenhum produtor publicar síntese quantitativa;
- `availability` e `unavailableReason`: explicam se falta a pergunta ou apenas a síntese;
- `nextAction`: orienta a próxima navegação;
- `surfaces`: definição semântica de Perguntas, Evidências, Testes, Relações e Decisões, com dono e destino.

O fallback estático usa o mesmo shape derivado dos arquivos em `public/data`. Assim o localhost não se comporta como um produto diferente do backend remoto.

## Mudanças de experiência

1. O Observatório não monta mais um segundo canvas. O bloco “Contexto espacial” explica o recorte atual, exibe nós/relações/foco e leva para Grafos.
2. Uma faixa de camadas explica o que cada aba significa e para onde ela leva. Testes, resultados e evidências ficam em superfícies textuais, sem poluir o mapa.
3. O Resumo do Universo mostra a pergunta real de cada domínio, seu status, suas campanhas e a quantidade de testes quando publicada. Ausências permanecem visíveis como ausência de contrato, não como `INCONCLUSIVE` fabricado.
4. O CSS usa os tokens existentes de tema e acrescenta profundidade, hierarquia e estados compactos para Claro, Escuro, Deep Space e Clássico.
5. O mapa mantém a regra de volume: apenas sistemas, domínios, campanhas e grupos transversais aparecem espacialmente. Testes não são promovidos a nós.

## Auditoria de redundância

| Elemento | Veredito |
| --- | --- |
| Mini-grafo dentro do Observatório | removido da composição principal; substituído por hand-off contextual |
| Mini-grafo dentro do Laboratório | mantido como contexto de recorte, pois o Laboratório ainda precisa ancorar o pipeline em um domínio |
| Observatório vs Resumo do Universo | mantidos, mas com papéis explícitos: monitoramento vs síntese por pergunta |
| Cockpit vs Atividade | Cockpit é superfície operacional; Atividade permanece rota secundária via notificação |
| Testes no grafo | proibidos como nós; aparecem como contagem e registros no Laboratório |
| Rotas legadas `/graphs`, `/observatory`, `/universe`, `/lab` | preservadas apenas como redirecionamento para as rotas canônicas |

## Limites que continuam honestos

- O backend remoto depende da autenticação/configuração já documentada. Sem ela, o site usa o snapshot e mostra `SNAPSHOT`; isso não é apresentado como dado ao vivo.
- O contrato novo não inventa síntese, posterior, tensão ou direção preferencial. Quando a API não publica o dado, a UI informa a ausência e oferece a fonte navegável mais próxima.
- Esta é uma auditoria funcional e visual orientada por código, DOM e screenshots. Não é uma certificação WCAG completa nem um teste físico em todos os dispositivos.

## Critério de aceite desta fase

- cada domínio publicado aparece uma vez, em ordem D1…D10;
- campanhas reais e contagens publicadas chegam ao Resumo do Universo;
- a página Observatório explica as camadas semânticas e aponta para a próxima superfície;
- Grafos permanece o único dono da exploração espacial;
- a navegação primária não inclui Atividade como área concorrente;
- build, typecheck, testes de contrato e browser smoke test passam sem erro de página;
- tema Claro/Escuro/Clássico não perde contraste nos novos blocos.
