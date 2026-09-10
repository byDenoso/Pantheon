# NEXO ONE — integrações privadas

O código dos adapters já existe. Este runbook cobre somente o provisionamento necessário para sair de `PUBLIC` e validar leituras privadas sem colocar credenciais no repositório.

## Ordem obrigatória

1. Configure `NEXO_PASSWORD_HASH` e `NEXO_SESSION_SECRET` no projeto `nexo-one` da Vercel.
2. Faça um redeploy e confirme em `/api/health` que `privateConfigured` é `true`.
3. Entre pela tela de sessão do NEXO ONE. Providers privados só são consultados com sessão válida.
4. Configure Google, Vercel, NEXO e Atlas conforme necessário.
5. Redeploy, faça login e valide `/api/health` e `/api/world?refresh=1`.
6. Confirme que uma chamada sem sessão continua sem expor dados privados.

## Gate de sessão

Enquanto `NEXO_PASSWORD_HASH` ou `NEXO_SESSION_SECRET` estiver ausente, o app opera em modo público e somente o provider GitHub pode ser lido. Configurar um provider privado sem resolver esse gate não o torna ativo.

Gere o hash com o helper existente:

```bash
node scripts/password.mjs
```

Gere `NEXO_SESSION_SECRET` localmente com um gerador criptograficamente seguro. Não use valor previsível e não salve o valor no Git.

## Google: Drive, Gmail e Calendar

O adapter usa um único refresh token com três escopos somente de leitura:

- `drive.readonly`
- `gmail.readonly`
- `calendar.readonly`

Crie um cliente OAuth do tipo **Desktop app** no Google Cloud e habilite as APIs Google Drive, Gmail e Calendar. Depois, no diretório `nexo-one`, defina `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` apenas no ambiente local e execute:

```bash
npm run google-auth
```

O helper abre um callback em `127.0.0.1`, usa PKCE, mostra a URL de consentimento e, após a autorização, imprime `GOOGLE_REFRESH_TOKEN` no terminal. Copie o valor diretamente para as Environment Variables do projeto na Vercel. Não envie esse valor por chat e não o grave em `.env` versionado.

Variáveis usadas pelo adapter:

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REFRESH_TOKEN
GOOGLE_CALENDAR_ID
GOOGLE_DRIVE_FOLDER_ID
```

`GOOGLE_CALENDAR_ID` pode permanecer `primary`. `GOOGLE_DRIVE_FOLDER_ID` é opcional e restringe a leitura a uma pasta existente.

## GitHub

O repositório público `byDenoso/Pantheon` funciona sem token. Para repositório privado, configure um token de leitura com o menor escopo possível.

```text
GITHUB_REPOSITORY
GITHUB_TOKEN
```

## Vercel

O adapter é somente leitura. Configure um token de leitura, o team ID e o project ID do mesmo projeto `nexo-one`.

```text
VERCEL_READ_TOKEN
VERCEL_TEAM_ID
VERCEL_PROJECT_ID
```

O project ID esperado pelo release atual é `prj_rFoAEgGt4gFNr8DHEOzxY7keS16W`.

## NEXO SSoT

Aponte `NEXO_SOURCE_URL` para um export existente e autorizado no contrato:

```json
{"version":"1","revision":"...","items":[]}
```

Use `NEXO_SOURCE_TOKEN` somente se o endpoint exigir bearer auth. O cockpit não cria um novo Truth Owner para preencher essa integração.

## Atlas

`ATLAS_GRAPH_URL` deve apontar para o endpoint autorizado do Graph Contract V1 já existente. `ATLAS_SOURCE_TOKEN` é opcional e deve ser configurado apenas quando o endpoint exigir autenticação.

## Readback de aceitação

Com sessão válida, um provider configurado deve deixar `AUTH_REQUIRED` e retornar `AVAILABLE` ou um erro explícito do provider. A aceitação mínima é:

```text
/api/health              -> privateConfigured=true
/api/world?refresh=1     -> providers configurados consultados
sem sessão               -> nenhum dado privado exposto
```

Não promover como V1 operacional enquanto Calendar, Drive, Gmail, NEXO/Atlas e Vercel exigidos pelo uso real não tiverem readback autenticado no deployment alvo.
