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

## Ativação pendente

1. Confirmar o arquivo de publicação ativo no Drive e configurar seu ID.
   A busca por nome em 29/10/2026 não encontrou um snapshot ativo.
2. Completar a configuração da sessão privada existente:
   `NEXO_ATLAS_ORIGIN`, `NEXO_ATLAS_PIN_HASH`, `NEXO_ATLAS_REDIS_URL` e
   `NEXO_ATLAS_REDIS_TOKEN`. Não reutilizar o cookie legado como autorização.
3. Publicar e verificar a API e o Pages. Um teste sintético não comprova
   consentimento Google nem leitura real do Drive.
4. O domínio já foi salvo em Settings → Pages do Pantheon. No DNS Namecheap,
   substituir os registros web de `@` pelos quatro A do GitHub Pages:
   `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`.
   Preservar MX/TXT. Após propagação, habilitar e verificar HTTPS no Pages.

## Verificação e reversão

Testes cobrem leitura readonly, identidade fixa, limite de streaming,
ausência de testes individuais na resposta pública e negação de acesso
anônimo às rotas privadas. Execute também typecheck, testes do projeto e build.
Reversão: reverter este commit e retirar apenas a configuração nova do
arquivo de campanhas; não alterar Tower, Writer, credenciais ou tarefas.
