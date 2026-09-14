# ATLAS Pages-primary + manual sync

## Objetivo

Tornar GitHub Pages o host principal do NEXO Atlas. O Atlas continua sendo uma projeção pública e read-only. Cockpit, Grafos, Observatório, Laboratório e Atividade deixam de depender de login. Atualização do estado visível passa a ser iniciada pelo botão **Sincronizar**, não por cron do Atlas.

## Arquitetura

- **GitHub Pages** hospeda o shell React e o último snapshot estático válido.
- **GitHub** continua autoridade de código/contrato e distribuição dos artefatos estáticos.
- **Google Drive** continua Truth Owner dos dados do NEXO.
- **NEXO One** permanece apenas como ponte de leitura server-side do Drive para sincronização manual. O endpoint público retorna somente projeção sanitizada; nenhuma escrita é exposta ao browser.
- **ATLAS** nunca se torna Truth Owner.

## Fluxo de abertura

1. Browser abre GitHub Pages.
2. Atlas carrega `data/current/manifest.json` e shards publicados.
3. Se não houver sincronização manual, todo o produto funciona com o último snapshot válido.
4. Nenhuma rota pública exige Google OAuth.

## Fluxo Sincronizar

1. Usuário clica **Sincronizar**.
2. Atlas pede ao NEXO One a projeção pública mais recente derivada do Drive.
3. A ponte lê o SSOT real no Google Drive, valida o contrato e produz fingerprint semântico.
4. Atlas compara fingerprint live contra o snapshot atualmente exibido.
5. Se a leitura live for válida, atualiza a sessão e reporta `UPDATED` ou `NO_CHANGE`.
6. Se falhar, mantém o último snapshot válido e reporta `DEGRADED/FAILED`; nunca limpa a tela nem simula sucesso.

A publicação estática continua independente do sync manual. O clique não dispara um deploy inteiro nem uma automação científica: ele apenas reconcilia a projeção read-only com o Truth Owner.

## Privacidade

A rota live expõe apenas a mesma classe de informação estrutural já permitida no Atlas público. Dados clínicos, payloads de testes, resultados privados e detalhes pessoais continuam fora da projeção pública. Olympus pode expor estrutura/programa/campanha, não registros pessoais.

## Deploy

- `atlas-pages-fallback.yml` vira o workflow primário do Pages.
- O deploy Vercel do frontend deixa de ser o caminho de produção automático.
- O cron de refresh do `vercel.json` é removido.
- NEXO One continua server-side somente porque GitHub Pages não executa backend e o Drive privado exige credencial.

## Readback

A conclusão exige:

- testes + typecheck + build verdes;
- Pages publicado e acessível;
- rotas públicas sem `AUTH_SETUP_REQUIRED`;
- browser sem dependência da API antiga do Atlas;
- botão Sincronizar preserva snapshot em falha;
- NEXO One aceita o origin do Pages e, quando a credencial Google está disponível, entrega projeção live válida.