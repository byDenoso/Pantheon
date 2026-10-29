# NEXO Research: campanhas públicas, operação privada

Decisão do Dener em 29/10/2026: resumos das campanhas públicos; testes,
agentes e mural privados. O site público fica no GitHub Pages; a API e a
sessão privada continuam no projeto Vercel existente. Nenhum GPT Sites.

## API

`GET /api/atlas-public` lê um arquivo JSON de publicação no Drive, usando a
identidade Google existente e `drive.readonly`. Configure no servidor
`NEXO_PUBLIC_CAMPAIGNS_DRIVE_FILE_ID` com o ID do snapshot produzido pelo
publicador/Writer existente no contrato `ATLAS_PUBLIC_CAMPAIGNS_V1`.
Esse arquivo deve conter somente os textos aprovados para publicação.
A rota não aceita ID, caminho ou URL fornecido pelo navegador, não lê a
Tower e não grava no Drive. Nunca configurar esse ID para a Tower ou
para um pacote privado de entrada do Writer.

O snapshot é validado antes da resposta. Os testes individuais são removidos
mesmo quando aparecem numa publicação anterior. O limite é 8 MiB, aplicado
também durante o streaming. Erros de acesso ou de contrato retornam 503 sem
conteúdo privado, credenciais ou fallback silencioso. Na ausência da opção
Drive, a configuração de arquivo local existente continua válida.

O Pages consulta a API pública na Vercel; não envia cookies para esse outro
domínio. CORS permite somente os domínios públicos do NEXO e o GitHub Pages,
somente na rota de resumos. As rotas privadas conservam a autenticação
existente e `no-store`; a área privada abre diretamente na Vercel.

## Configuração em 29/10/2026

O snapshot público foi criado no Drive com resumos de R1–R4 e configurado
por `NEXO_PUBLIC_CAMPAIGNS_DRIVE_FILE_ID`. Ele contém escopos de campanhas,
sem resultados numéricos ou testes individuais. O Google Connect ainda
retorna `CONNECT_USER_AUTHORIZATION_REQUIRED` para o vínculo `user/owner`;
a API pública fica indisponível até concluir o consentimento de leitura.

A sessão usa `NEXO_ATLAS_ORIGIN` e `NEXO_ATLAS_PIN_HASH`. O Redis gratuito
`nexo-private-sessions` está conectado somente à produção. As credenciais
protegidas fornecidas pelo Marketplace, `KV_REST_API_URL` e
`KV_REST_API_TOKEN`, são aceitas diretamente. Configurações explícitas
`NEXO_ATLAS_REDIS_URL` e `NEXO_ATLAS_REDIS_TOKEN` têm precedência.
O cookie legado não autoriza a área privada do Atlas.

O domínio está no GitHub Pages, com os quatro registros A oficiais e
`www` apontando para `bydenoso.github.io`. MX/TXT foram preservados.
DNS e redirecionamento para HTTPS foram verificados. O Pages ainda usa
main: a publicação da branch de implementação foi bloqueada pelas regras
do ambiente `github-pages`; integrar a alteração pelo fluxo de PR antes
de publicar a interface atualizada. A API está publicada na Vercel.

Pendente: concluir a entrada do proprietário e o consentimento Google;
depois verificar a leitura real do snapshot e a área privada. Testes
sintéticos não comprovam consentimento nem leitura de arquivos reais.

## Verificação e reversão

Testes cobrem leitura readonly, identidade fixa, limite de streaming,
ausência de testes individuais na resposta pública e negação de acesso
anônimo às rotas privadas. Execute também typecheck, testes do projeto e build.
Reversão: reverter este commit e retirar apenas a configuração nova do
arquivo de campanhas; não alterar Tower, Writer, credenciais ou tarefas.
