# Continuação no ChatGPT Sites — 9 de outubro de 2026 (UTC)

O projeto existente foi continuado. A revisão pública permanece v36, `c20e1b56fb9b58606312fa2b27e3d6e36352c5e0`. Esta continuação será salva sem implantação pública enquanto os critérios abaixo permanecerem pendentes.

## Origem e compatibilidade

- Fonte real do Sites: v37, `f2106d76a0c581f72e813f96a550203c94911460`, continuação da v36.
- TCC: PR #155 integrado; HEAD conferido `496dc0dd1825ab6f37e7d6bdeb55f1437661d226`.
- Pantheon: PR #443 integrado em `7e42d9b67ce71cd647c6279f54ae4e43efca331d`; HEAD conferido `a4123b61dfe70b3961bd32a2aebf6cf6c8ff5cd9`. Releia alterações concorrentes do Writer antes de publicação futura.
- ZIP de entrega conferido integralmente contra o manifesto. SHA-256: `c83aaf091c7cd866df6a387f7e23ae6fee4e20eee1d393aaa35489e311df616e`.
- React/Vite/Worker existentes mantidos. Autenticação, PIN, sessões, `/mcp`, ativos privados, Drive em leitura e esquemas aplicados no projeto original preservados.

## Campanhas e privacidade

O componente canônico oferece Em andamento/Concluídas, PT/EN, busca por pergunta, páginas de seis campanhas, links `?campanha=ID#/`, andamento dos testes, próximo passo, limites e encerramento explícito. Perguntas semelhantes não fundem identidades. Resultados são recusados sem revisão independente; testes em revisão não ganham uma conclusão científica.

Os 215 testes anteriores e seus grupos editoriais foram preservados. Esses grupos não atribuem identidade, conclusão ou aprovação às novas campanhas canônicas.

O Worker aceita somente `worker/public-campaigns.approved.json`, um pacote já sanitizado pelo Writer. A construção verifica contrato, digest e ausência de conteúdo privado; não cria aprovações. Sem esse arquivo, a API mantém o catálogo anterior e a interface informa que as campanhas aguardam publicação. BOARD, PEER, Olympus, credenciais e caminhos internos ficam fora da projeção pública.

O consumidor de pacote não implementa sozinho a atualização automática pelo Writer. A etapa atual do Writer prepara e verifica a projeção, mas informa que o publicador da hospedagem precisa ser conectado. Essa automação não foi modificada nesta entrega.

## Validação executada

- Construção, TypeScript e 309 testes passaram, sem ignorados. Oráculos Python e importação de arquivos foram ajustados para Windows sem alterar critérios.
- Campanhas sintéticas identificadas somente nos testes: perguntas distintas, revisão pendente, resultados nulos/inconclusivos, paginação, busca, idiomas e links. Não são resultados científicos.
- Site privado separado: `https://nexo-research-validacao.workspace-797984.chatgpt.site`, v2, `4997c6fb063b55a37b6b64988f03d91f2449df77`, implantação concluída `appgdep_6ac850fe211881918bfbf33c4c0dded6`.
- A versão privada foi aberta pelo proprietário após consentimento de Drive em leitura. JS/CSS servidos correspondem por hash ao pacote. Desktop/celular, PT/EN, abas, busca e paginação anteriores foram inspecionados, sem rolagem lateral. Método funciona após o redirecionamento normal de `.html`.
- Sem sessão, rotas privadas e `/mcp` recusam acesso; arquivos de servidor, configuração e fonte retornam 404. O Site privado recusa visitantes anônimos.
- As duas APIs devolveram os mesmos 215 testes: SHA-256 `4cfe8e77703ebba0d177f7a2a96d9fc7b86f8ca869ebd576f01fb2d803c916fc`.
- Banco privado inicialmente vazio: somente suas migrações não aplicadas receberam instruções SQL completas em uma linha. Equivalência de esquema e execução real D1 verificadas; 16 tabelas provisionadas. Migrações originais intactas.

## Critérios pendentes

Tower integralmente verificada: `sha256:6bbd4851c0ced14070834d9fdaa76942ebc26efb01f9cb25f352c22eb379792b`, atualizada `2026-10-09T02:16:23.458761Z`. Registro de aprovações de campanhas ausente, nenhum vínculo aprovado, nenhuma campanha na projeção pública e nenhum roadmap explicitamente público. Não inventar aprovações nem promover dados privados.

Antes da ampliação pública: pacote canônico aprovado, publicador do Writer ligado ao projeto correto e leitura da atualização efetivamente servida. A implantação privada emite aviso de permissões de criação de plugin no workspace. Drive é elegível, mas isso não prova a leitura privada completa no novo projeto. Seu banco isolado não recebeu PIN ou sessões da produção.

Autonomia ampliada desativada. Nenhuma ativação, automação, contrato científico, Tower, piloto H0 ou avaliação de 168 horas foi modificado ou iniciado.

## Domínio e reversão

`nexoresearch.org` e `nexo.denerpereira.com.br` já estão no projeto original do ChatGPT Sites, com SSL ativo. DNS preservado; o Site privado não recebeu domínios.

Para reverter publicação futura: conferir concorrência; usar v36, `appgprj_6ac45767d678819182c86c56d11e0d37~appgver_bbe256b0a7bc8191b69d900c417e25ba`; preservar audiência, banco e vínculos; aguardar sucesso terminal; ler ativos e `/api/atlas-public`. Não restaurar Tower, cursores ou DNS. Se outra revisão estiver ativa, determinar primeiro o ponto correto de reversão.
