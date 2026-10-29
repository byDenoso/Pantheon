# Atlas público: revisão de 11 de outubro de 2026

A interface ativa está no projeto Sites `/workspace/atlas-site`, a partir de `aeccc307`. A cópia Pantheon foi apenas uma exploração inicial; seu patch está arquivado fora deste projeto. Esta revisão conserva a direção atual: Barlow/Nunito, azul, temas claro/escuro, ilustrações decorativas CMB/expansão e conteúdo PT/EN.

O catálogo aprovado atual apresenta **19 perguntas, 169 análises e 37 figuras**. As figuras preservam 72 visuais públicos e 71 análises de origem. Essas contagens continuam derivadas das projeções e agrupamentos existentes. Os 215 registros da projeção histórica passam pelo filtro cosmológico aprovado antes da apresentação atual.

## Concepção

A abertura mantém a arte como elemento principal. As seções seguintes recebem uma superfície de leitura mais controlada, com o fundo cósmico sutil. Cabeçalho, conteúdo e rodapé compartilham alinhamento; as abas têm seleção explícita, ícones discretos e controles de tamanho consistente. A pergunta ocupa a posição de título na comparação. Resultados e limites mantêm os textos publicados.

## Revisão por área

| Área | Ajuste | Verificação |
| --- | --- | --- |
| Abertura e navegação | Alinhamento, tipografia, controles agrupados; cabeçalho persistente e indicação da seção atual; menu com SVG. | Claro/escuro em desktop e celulares; menu/Escape; navegação mantém o hash e transfere foco. |
| Mapa de perguntas | Busca com largura de leitura; seleção clara; mapa e lista com bordas e espaçamento consistentes; recuperação da busca vazia. | Assuntos, seleção, links de estudo, pesquisa sem resultado e retorno ao conjunto completo. |
| Figuras e gráficos | Leitura e hierarquia dos painéis, cartões e legendas; estado vazio com limpeza de filtros; diálogo de imagem nomeado. | Agrupamentos e fontes existentes; busca, limpeza, mobile e desktop; nenhum valor alterado. |
| Atualizações | Hierarquia de datas, títulos e listas; acesso preservado às investigações. | Aba em PT/EN e nos dois temas. |
| Comparar resultados | Pergunta como título; campos com ritmo de leitura; duas seleções sempre representam investigações distintas, inclusive com preferências antigas. | Seletores, fontes e limites preservados; colunas viram uma sequência no celular. |
| Catálogo completo | Cartões e expansões mais legíveis; estado vazio com limpeza dos filtros. | Busca, paginação e contagem dos 19 grupos/169 análises; quatro campos científicos preservados. |
| Estudo individual | Caminho de navegação, título, contagem e painel com hierarquia; foco no título após carregamento. | Link do mapa, abertura de análise e quatro campos; retorno à pesquisa e metodologia. |
| Linhas, métodos, contato e rodapé | Espaçamento e títulos consistentes; contato em duas colunas no desktop; rodapé integrado ao script nativo Método/ORCID. | Links internos, metodologia e email. O script de rodapé continua responsável pelos links de páginas. |
| `/metodo.html` | Página revisada; seis passos, critérios, replicação e limites claros, fontes locais, PT/EN e tema existentes. | Capturas desktop/360/390; página preservada. |
| `/publicacoes.html` | Rota existente revisada; catálogo vazio informado explicitamente. A navegação permanece oculta conforme decisão existente. | Capturas desktop/360/390 e carregamento local de `publications.json`; nenhum item criado. |

## Acessibilidade e estados

O link “Ir para o conteúdo” aparecia permanentemente quando a preferência por movimento reduzido anulava seu `transform`. A visibilidade agora usa recorte e dimensões, preservando sua aparição ao receber foco. As abas mantêm teclado com setas, Home/End e o padrão `tab`/`tabpanel`. Carregamento, indisponibilidade e ausência de trabalhos têm estados distintos, com repetição da consulta apenas para falhas.

## Evidências locais

- TypeScript e 32 testes públicos direcionados passaram; a verificação integrada do projeto executada pelo agente principal passou com 506 testes.
- Navegador aprovado: quatro abas em PT/EN e claro/escuro, em 1440/360/390; ausência de overflow também em 320/768/1024; teclado, menu/Escape, foco, estudos, busca vazia, limpeza de filtros e falha seguida de nova consulta.
- Catálogo completo verificado por paginação: 8 + 8 + 3 perguntas, com 169 análises preservadas; limpeza de filtros retorna à primeira página.
- Capturas antes: `/workspace/artifacts/public-premium/site-before/`.
- Capturas depois e relatório: `/workspace/artifacts/public-premium/site-after/`.
- Relatórios adicionais: `interaction-report.json` e `english-light-report.json`, junto às capturas depois.
- Roteiro de navegador: `/workspace/artifacts/public-premium/site-review.mjs`.
- A revisão React confirmou hooks incondicionais, limpeza de observadores/listeners, imports diretos, montagem sob demanda dos testes e preservação dos estados de consulta existentes.

O navegador usa uma origem local com a mesma projeção pública aprovada do Worker. APIs privadas permanecem indisponíveis nesse roteiro. As verificações locais não constituem publicação do Site nem leitura de dados privados.
