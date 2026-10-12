# Atlas, Tower, GitHub e MCP — revisão de 11 de outubro de 2026

O produto atual é o Site `appgprj_6ac45767d678819182c86c56d11e0d37`, servido em `https://nexo.denerpereira.com.br` e também acessado por `https://nexoresearch.org`. A fonte inicialmente conferida foi a versão 63, commit `aeccc307361e36751f26f290ef2950c69b54e55f` do repositório próprio do Sites. O MCP conectado aponta para o `/mcp` desse Site. O endpoint `/api/mcp` deste checkout Pantheon é uma implementação distinta.

## Cadeia e responsabilidades

- Tower/Writer em Drive: autoridade operacional e científica; nenhuma mutação de dados foi feita nesta revisão.
- TCC: código da Tower, publicador derivado e contratos de teste.
- Pantheon: automações, seleção da revisão TCC testada e runtimes de compatibilidade.
- Site Atlas: Worker, autenticação do proprietário, sessão PIN, UI pública/privada e MCP conectado.
- Cache/índice/projeções: derivados; indisponibilidade não autoriza uma fonte de verdade alternativa.

## Correções neste checkout

As leituras de providers agora separam cache e trabalho em andamento por configuração/identidade, e a invalidação impede a conclusão antiga de repopular o cache. O cache de token OAuth legado foi separado por credenciais. A leitura Tower usa um prazo total limitado; o leitor da projeção corta o stream no limite e rejeita credenciais na URL. Os erros MCP preservam códigos seguros de origem sem refletir segredos ou corpos de respostas.

A compressão das respostas privadas usa gzip assíncrono e negociação correta de `Accept-Encoding`. O parser reúne bytes antes de decodificar UTF-8, valida o limite de 64 KiB em todos os formatos recebidos e distingue JSON inválido (400) de corpo grande (413).

No Pages, a verificação e a inspeção do bundle ocorrem imediatamente antes do upload. Projeções não são copiadas depois dessa proteção. O alarme lê diretamente o branch derivado já existente, e mudanças só na projeção não reconstroem o shell. O publicador do Writer reutiliza a revisão TCC testada e a confere novamente antes de publicar o derivado.

## Limites de validação

Os testes usam fixtures sintéticas. Eles não estabelecem que uma sessão de produção, consentimento Drive ou credencial operacional esteja válida. Os logs de produção do Site registraram `CONNECTOR_LIST_FILE_REVISIONS_FAILED` com `connectorStatus=reauthentication_required`; renovar esse consentimento requer o fluxo de conexão do proprietário no Site.

A suíte histórica completa de `atlas-control-tower` contém expectativas sobre páginas e workflows retirados. Seus resultados devem ser distinguidos dos testes exigidos para os adapters e bridges ativos. Os relatórios da entrega registram os comandos e resultados observados.

As alterações visuais foram aplicadas na fonte atual do Site. O primeiro estudo feito sobre a interface histórica foi arquivado fora do checkout e não constitui uma segunda interface de produção.
