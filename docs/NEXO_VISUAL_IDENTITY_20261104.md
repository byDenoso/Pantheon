# Identidade visual NEXO Research

Pedido: modernizar o site científico existente, preservar funcionalidades, dados e estrutura, manter operações exclusivamente privadas.

Fonte pública ativa: `nexo-atlas`, publicada pelo workflow `nexo-one-pages.yml` em `nexoresearch.org`. O backend/autenticação existente continua em `nexo-one` e não muda nesta tarefa.

Direção: azul profundo, ciano, composição editorial acadêmica, títulos serifados e textos IBM Plex já locais. Tema claro continua acessível nas preferências; a abertura tem a identidade azul própria. Publicações e resultados recebem entradas claras; números e figuras provêm exclusivamente da projeção pública validada.

Implementação:

- [x] Camada visual final compartilhada entre a aplicação pública e as páginas institucionais; preservar dimensões e cores semânticas das figuras científicas.
- [x] Abertura com resultado real do catálogo, resumo e limites originais; alternativa honesta em carregamento/ausência de dados.
- [x] Publicações e projetos em destaque; preservar busca, filtros, rotas de pesquisa, idiomas e navegação móvel.
- [x] Movimento discreto com Motion/GSAP existentes, sem fundo WebGL decorativo contínuo no site institucional; contexto privado preservado.
- [x] TypeScript, build e testes existentes; conferência real de navegação, gráficos, tema, preferência de movimento e acesso anônimo.

Condições: sem novos dados, snapshots privados, permissões, schema, infraestrutura ou custo. Reversão por commit anterior; nenhuma migração de conteúdo/estado.

Validação final: `npm run check` aprovado (TypeScript, build público/privado e 540 testes). Revisão independente sem bloqueadores. Navegador: busca, filtros de figuras, idiomas, tema claro/escuro, publicações e menu móvel verificados; largura de conteúdo/viewport móvel 375/375 px dentro de quadro de 390 px. A prévia HTTP usa o catálogo científico estático aprovado; a seleção pública de produção continua configurada no workflow, com 169 registros selecionados na consulta atual. Publicações mantém o catálogo vazio existente, sem criar artigos ou DOIs.
