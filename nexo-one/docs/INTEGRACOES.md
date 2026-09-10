# NEXO ONE — integrações privadas

Este runbook cobre o provisionamento necessário para sair de `PUBLIC` e validar leituras privadas sem colocar credenciais no repositório.

## Ordem obrigatória

1. Configure `NEXO_PASSWORD_HASH` e `NEXO_SESSION_SECRET` no projeto Vercel `nexo-one`.
2. Faça redeploy e confirme em `/api/health` que `privateConfigured` é `true`.
3. Configure/autorize o conector Google e vincule-o ao projeto.
4. Configure as referências não secretas de Google, NEXO e Atlas e a credencial read-only da Vercel quando necessária.
5. Entre pela tela de sessão do NEXO ONE. Providers privados só são consultados com sessão válida.
6. Faça redeploy, valide `/api/health` e `/api/world?refresh=1`, e confirme que a mesma chamada sem sessão continua sem expor dados privados.

## Gate de sessão

Enquanto `NEXO_PASSWORD_HASH` ou `NEXO_SESSION_SECRET` estiver ausente, o app opera em modo público e somente o provider GitHub pode ser lido. Configurar um provider privado sem resolver esse gate não o torna ativo.

Gere o hash com o helper existente:

```bash
node scripts/password.mjs
```

Gere `NEXO_SESSION_SECRET` localmente com um gerador criptograficamente seguro. Não use valor previsível e não salve o valor no Git.

## Google — caminho principal: Vercel Connect

Drive, Gmail, Calendar e Sheets usam um único conector Google. O runtime usa `VERCEL_OIDC_TOKEN`, fornecido pela própria Vercel, para obter uma credencial Google curta. O código pede apenas estes escopos:

```text
https://www.googleapis.com/auth/drive.readonly
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/calendar.readonly
https://www.googleapis.com/auth/spreadsheets.readonly
```

Crie o conector Google na conta/equipe da Vercel, autorize a conta Google proprietária e vincule o conector ao projeto `nexo-one`. A configuração de runtime é:

```text
GOOGLE_CONNECTOR=google/<nome-do-conector>
GOOGLE_CONNECT_SUBJECT_ID=owner
GOOGLE_CALENDAR_ID=primary
GOOGLE_DRIVE_FOLDER_ID=<opcional>
```

`GOOGLE_CONNECT_SUBJECT_ID` é opcional e assume `owner`. `GOOGLE_DRIVE_FOLDER_ID` restringe a leitura do Drive a uma pasta existente. Não copie `VERCEL_OIDC_TOKEN` para variável manual: ele é identidade efêmera do deployment.

Se `GOOGLE_CONNECTOR` existir e o Connect falhar, o adapter fecha com erro. Ele não cai silenciosamente para credenciais OAuth antigas, porque esconder uma conexão quebrada atrás de outro segredo seria uma excelente forma de fabricar um falso `AVAILABLE`.

### Rollback Google: OAuth legado

O helper OAuth anterior continua disponível somente como fallback explícito quando `GOOGLE_CONNECTOR` estiver ausente:

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REFRESH_TOKEN
```

No diretório `nexo-one`, `npm run google-auth` ainda gera o refresh token pelo fluxo loopback + PKCE. Não envie esse token por chat e não o grave em arquivo versionado.

## GitHub

O repositório público `byDenoso/Pantheon` funciona sem token. Para repositório privado, configure um token de leitura com o menor escopo possível.

```text
GITHUB_REPOSITORY
GITHUB_TOKEN
```

## Vercel

O adapter é somente leitura. Configure um token de leitura, o team ID e o project ID do mesmo projeto `nexo-one`:

```text
VERCEL_READ_TOKEN
VERCEL_TEAM_ID
VERCEL_PROJECT_ID
```

O project ID canônico desta aplicação é:

```text
prj_rFoAEgGt4gFNr8DHEOzxY7keS16W
```

## NEXO SSoT

A fonte canônica atual é a planilha `NEXO · SSOT CANONICAL`, id:

```text
1e6s2dKOYVLNsPUguHI85RLVLwJKtlCsQZBJ1BE-UhaY
```

Configure:

```text
NEXO_SHEET_ID=1e6s2dKOYVLNsPUguHI85RLVLwJKtlCsQZBJ1BE-UhaY
NEXO_SHEET_RANGE=NEXO!A1:H1000
```

`NEXO_SHEET_RANGE` é opcional e esse é o default. O adapter lê o schema canônico existente:

```text
record_type | record_id | status | title | detail | payload_json | source | updated_at
```

Ele preserva `updated_at` como tempo observado e não converte o cockpit em Truth Owner. `NEXO_SOURCE_URL` + `NEXO_SOURCE_TOKEN` continuam disponíveis como fallback para o export versionado anterior quando `NEXO_SHEET_ID` estiver ausente.

## Atlas

Aponte o Graph Contract V1 para o Atlas canônico:

```text
ATLAS_GRAPH_URL=https://nexo-atlas-control-tower.vercel.app/api/graph?refresh=1&depth=2&limit=120
ATLAS_SOURCE_TOKEN=<somente se o endpoint passar a exigir bearer auth>
```

O endpoint é read-only para o NEXO ONE. O adapter rejeita payload sem `nodes`, `edges`, `freshness`, `source` e `fingerprint`.

## Readback de aceitação

Com sessão válida, cada provider configurado deve deixar `AUTH_REQUIRED` e retornar `AVAILABLE` ou erro explícito do provider. A aceitação mínima é:

```text
/api/health              -> privateConfigured=true
/api/world?refresh=1     -> Drive/Gmail/Calendar/GitHub/Vercel/NEXO/Atlas consultados
sem sessão               -> nenhum dado privado exposto; somente GitHub público
```

Não promover como V1 operacional enquanto Calendar, Drive, Gmail, NEXO, Atlas e Vercel exigidos pelo uso real não tiverem readback autenticado no deployment alvo.
