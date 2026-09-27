# NEXO — o que falta para ser autónomo

Levantamento externo, 2026-09-27. Toda a evidência abaixo foi verificada contra o Git,
contra os artefactos publicados ou por sonda HTTP directa — nenhum item vem de relato
de agente. Onde um agente afirmou algo, está marcado como afirmação e verificado à parte.

Contexto de autoridade: `byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06` é o Truth Owner.
`Pantheon` é projecção e apresentação. `TCC` é verificador e fila de persistência.
A execução corre em cinco tarefas agendadas do ChatGPT, de hora a hora:
Guardião, Pítia, Learner, Executor, Refutador.

---

## O que já está fechado

Não é pouco, e convém não mexer:

- **Tower → projecção → Pages** verifica-se ponta a ponta. SHA do verificador pinado em
  `CONTROL.runtime_revision`, fingerprint conferido, ancestralidade do commit validada
  contra o Vault, readback pós-deploy com mais de vinte asserções, e no-op quando a
  produção já está actual.
- **Fronteira de permissão** declarada e aplicada: `NEXO_VAULT_READ_TOKEN` é read-only,
  o job recusa-se a correr sem ele, `persist-credentials: false`, e há um gate que falha
  o build se `GOOGLE_DRIVE` aparecer no artefacto.
- **Relay de persistência é rápido.** Medido: `nexo_persist/requests/refutador-batch-c5cd395028868a52.json`
  às 14:32:11Z, `inbox/scheduled-…json` às 14:32:19Z. Oito segundos. O relay não é o gargalo.
- **Learning Loop produz conhecimento a sério** — hipóteses, refutações e o ciclo
  adversarial, com 1 confirmada, 30 em revisão e 4 refutadas.

---

## AUT-001 — A superfície de escrita está barrada por escopo de credencial

**Severidade: bloqueante. Dono: Dener. Não é trabalho de código.**

Sonda directa, reproduzível por qualquer um:

```
GET https://nexo-one-two.vercel.app/api/inbox-drop?id=audit-probe-readonly&i=1&n=1&d=e30
→ HTTP 502
{"ok":false,"error":"GATEWAY_WRITE_FAILED","primary":"SHEET_SPOOL",
 "fallback":"GITHUB_CONTENTS",
 "detail":"GITHUB_403 PUT inbox: Resource not accessible by personal access token"}
```

O `NEXO_INBOX_TOKEN` nas variáveis de ambiente da Vercel não tem escrita em `byDenoso/TCC`.
Isto é causa raiz única de três sintomas que pareciam independentes: staging recusado,
fallback GitHub directo recusado, e o gateway sem connector a devolver 502.

**Correcção:** reemitir o token com `Contents: Read and write` em `byDenoso/TCC` e
actualizar a env var. **Verificação:** a mesma sonda devolve 400 (contrato inválido) em
vez de 502, e um envelope de teste aparece em `nexo-inbox/inbox/`.

Enquanto isto não for feito, tudo o que está abaixo trata sintomas.

---

## AUT-002 — O Executor nunca chega ao gateway sem connector

**Severidade: alta. Dono: Codex.**

O Executor tem `inbox-drop` disponível e não o usa. Afirmação dele próprio, quando
confrontado: *"foi uma omissão operacional na execução do fallback. O prompt continha um
estágio genérico de HTTP relay complete=true/readback=PASS, mas eu não resolvi esse
estágio para o endpoint concreto."*

Consequência medida: na ronda das 13:10 tentou staging GitHub, fallback GitHub directo e
Doc privado, os três recusados, e parou. O batch `executor-batch-a16f378b7263cb04` ficou
só como anexo de conversa — 404 no `dispatch-runtime` e 404 no `nexo-inbox` durante cerca
de três horas. Foi recuperado depois por outra cadeia, mas por acaso, não por desenho.

**Correcção:** resolver o estágio genérico de HTTP relay para o endpoint concreto na
cadeia de fallback do Executor. Contrato:
`GET /api/inbox-drop?id=<stable-id>&i=<parte>&n=<total>&d=<base64url>`,
`id` em `[a-z0-9-]`, `n` até 40 partes, cada `d` até 6000 caracteres.

**Já existe cliente, não escrever outro:** `nexo-one/scripts/nexo-submit.mjs`
(branch `feat/portable-durable-submit`) faz chunking, idempotência por `stable_id` e
`--check`. Reutilizar.

**Verificação:** forçar recusa do connector GitHub numa ronda e confirmar que o envelope
chega à inbox na mesma ronda, com readback.

---

## AUT-003 — Não há escrita durável antes da primeira tentativa

**Severidade: alta. Dono: Codex.**

Hoje o envelope só se torna durável **se** o `create_file` for aceite. Se for recusado,
existe apenas como texto na conversa. Isso torna a recuperação dependente de o contexto
do chat sobreviver, o que é a definição de não-durável.

**Correcção:** escrever o envelope num caminho durável append-only, chaveado por
`stable_id`, **antes** de qualquer tentativa de staging. A partir daí qualquer processo
externo — outra ronda do GPT, o Codex, ou um agente local — pode drenar a fila sem ler
a conversa.

**Verificação:** matar a ronda a meio, depois do compute e antes do staging, e confirmar
que o resultado continua recuperável por um processo que nunca viu o chat.

---

## AUT-004 — A fronteira selecciona trabalho que não pode correr

**Severidade: alta. É o maior limitador de rendimento.**

Números das próprias rondas: `attempted_real_tests=3, blocked_after_hydration=7` numa
selecção de 10. Noutra: `attempted_real_tests=4, blocked_after_hydration=4,
runtime_failures=4` em 12. Quatro casos fecharam em `SCIENTIFIC_DEFINITION_MISSING`:
os dados públicos existem, mas o contrato congelado não fixa que pares de likelihoods,
funções de selecção ou reconstruções formam o teste executável — e escolher substitutos
alteraria materialmente o teste. O Executor recusou-se a substituir, e fez bem.

Em produção isto aparece como **35 testes prontos e 10 em execução**: a fila está cheia
de trabalho elegível-no-papel e inexecutável-na-prática.

**Correcção:** separar `READY` de `RUNNABLE`. A elegibilidade tem de exigir inputs
materializados, não apenas estado declarado. Um teste sem refs congelados resolvíveis
entra em `BLOCKED_INPUT` na selecção, não depois de queimar uma ronda em hidratação.

**Verificação:** `blocked_after_hydration` cai para perto de zero sem que
`material_results` caia.

---

## AUT-005 — O Guardião é a coisa mais desactualizada do sistema

**Severidade: média.**

`system.json` publicado traz `guardian.checked_at = 2026-09-26T14:47:20Z`, estado `YELLOW`,
`checks_failing: 1`, `failing_areas: ["inbox"]` — enquanto o resto do artefacto refrescou
às 14:58 de 2026-09-27. **Vinte e quatro horas de atraso na única coisa cuja função é
dizer se o sistema está bem.** E a área que falha é `inbox`, ou seja AUT-001.

No `nexo/dispatch-runtime`, em cerca de quinze rondas horárias, o Guardião publicou
**uma vez**. Executor 6, Pítia 3, Refutador 2, Guardião 1.

**Correcção:** determinar se o Guardião falha ao persistir ou decide que não há trabalho
material. Se for o primeiro, AUT-002 resolve-o. Se for o segundo, um health check que só
publica quando algo muda é um health check que não distingue "tudo bem" de "não corri".

**Verificação:** `checked_at` nunca com mais de duas horas no artefacto publicado.

---

## AUT-006 — Olympus está parado

**Severidade: média.**

Lane publicada: `13 testes · 0 concluídos · 0 em andamento · 0 prontos`.
`next_action: "Sem teste pronto: o Learner propõe novas hipóteses na próxima execução agendada."`

Treze testes existem e nenhum é elegível. O Learner não está a produzir trabalho corrível
neste domínio, e o domínio não se queixa — limita-se a esperar.

**Correcção:** um domínio com zero elegíveis e zero em execução durante N rondas tem de
emitir um sinal, não ficar em silêncio educado.

---

## AUT-007 — Não há mecanismo de triagem humana

**Severidade: média. Desenho.**

O cockpit diz "Nenhuma decisão pendente". Quando houver, não há forma de o Dener treinar
a fila senão configurando-a.

O padrão que a astronomia profissional usa para exactamente este problema vale copiar.
O Lasair, broker de alertas do ZTF e do Rubin, **não ordena por confiança automática**:
o astrónomo marca `veto` (não voltar a mostrar) ou `fave` (destacar na próxima). O humano
treina o filtro marcando, não configurando.

**Correcção:** dois verbos na fila de decisões, persistidos como eventos na Tower.

---

## AUT-008 — O portão de qualidade está vermelho

**Severidade: alta para autonomia. Dono: Codex.**

`origin/main` corre **382 de 394 testes**. Doze falham, e não são meus: verifiquei
correndo `main` limpo. Há uma semana o mesmo repo estava 373/373.

Falham, entre outros: `Pages pipeline uses Tower projection authority`,
`tower consistency audit detects identity, state, reference and contract drift`,
`RETIRED_RUNTIME remains explicit in the compiled capability state`,
`overview makes source coverage explicit so zero counters cannot masquerade as health`.

Vários desses testes existem precisamente para proteger invariantes de autonomia.
**Um sistema não pode ser autónomo enquanto o seu próprio portão de verdade está vermelho
e a fazer deploy na mesma.**

Causa provável: o gate completo corre em cerca de 12 segundos localmente
(`npm run check`), mas 29 de 39 commits em `main` estão a menos de 60 segundos uns dos
outros. O CI está a ser usado como test runner. Há um hook `pre-push` preparado em
`nexo-one/.githooks/pre-push`.

**Verificação:** `npm run check` verde em `main`.

---

## AUT-009 — Duas autoridades em produção ao mesmo tempo

**Severidade: alta. Decisão do Dener, não do Codex.**

- Pages: `authority: TOWER_V06`, fingerprint `sha256:573f103c…`, gerado hoje.
- Vercel `/api/projection`: `authority: GOOGLE_DRIVE`, `sourceVersion: 2026-09-14`,
  `sourceRef` numa Google Sheet. Treze dias parado.

O workflow do Pages **falha o build** se a string `GOOGLE_DRIVE` aparecer no artefacto.
A Vercel serve-a como autoridade, sem gate nenhum. `NEXO_SYSTEM_STATE.json` declara
`vercel: OPTIONAL_COMPATIBILITY`, mas houve deploy de produção hoje.

**A pergunta que decide:** a Vercel devia estar a servir produção? Se sim, o
`NEXO_SYSTEM_STATE.json` está errado. Se não, a correcção não é consertar
`/api/projection` — é desligá-lo.

Relacionado: `/api/atlas`, `/api/runtime`, `/api/science` e `/api/live/status` devolvem
307 para `nexo-one-two`, que responde 404. A cadeia está partida ponta a ponta.

---

## AUT-010 — O cockpit reportava zero trabalho em execução

**Severidade: era alta. Corrigido, à espera de merge.**

`telemetryOf` contava `state.graph.nodes`, cujo `status_group` só tem
`DONE / READY / BLOCKED`. Não existe balde `RUNNING` no grafo, logo "EM EXECUÇÃO" era
estruturalmente incapaz de mostrar outra coisa que não zero.

Contra o `system.json` publicado, o cockpit dizia `190 / 0 / 45 / 141` enquanto as lanes
do mesmo artefacto diziam `194 / 10 / 35 / 129`. Um operador concluía que o sistema
estava parado com dez testes a correr.

Corrigido em `fix/cockpit-canonical-telemetry`, verificado contra o artefacto ao vivo.

---

## AUT-011 — Executor híbrido em GitHub Actions

**Severidade: alta para throughput. Infraestrutura implantada; primeiro ciclo canônico de produção ainda precisa ser observado.**

O Executor deixa de gastar a ronda com compute determinístico que um runner normal executa melhor.
O papel passa a ser: resolver a definição científica, congelar a prediction, validar inputs/proveniência,
preparar uma `TEST_BATTERY`, fiscalizar o retorno e corrigir falhas de runtime. O compute público
determinístico corre em `NEXO test battery`; Writer/Tower continuam a ser as únicas autoridades de estado.

Implementado e provado antes do cutover:
- runtime base em `ubuntu-latest` + Python 3.12;
- NumPy, SciPy, pandas e requests instalados fail-closed, com `pip check`;
- rede pública, filesystem, git/curl/tar/timeout e tar+zstd verificados;
- 45/45 testes atuais do runtime TCC passaram no runner hospedado;
- canário real do workflow de bateria passou `plan → preflight → run → collect`;
- matriz suporta até 20 shards independentes; qualquer limite menor do gene continua a mandar;
- PR canary nunca entra no estado canônico; o coletor do Writer aceita apenas execuções `workflow_dispatch`;
- runner público tem `contents: read`, sem credenciais Tower/Drive e sem dados Olympus/privados.

**Fluxo:** `TEST_BATTERY → Writer → GitHub Actions → battery-results → BATTERY_STATUS → Writer → Tower`.

**Verificação final:** observar pelo menos uma bateria canônica de produção ir de READY a resultado/retorno
de runtime pela cadeia completa, sem execução científica duplicada no ChatGPT e sem dados privados nos logs.

---

## Ordem de ataque

Por `impacto × recorrência ÷ risco`:

1. **AUT-001** — token. Dener, dois minutos, destrava tudo.
2. **AUT-008** — pôr `main` verde e instalar o gate local. Sem isto não se confia em nada.
3. **AUT-002 + AUT-003** — cadeia de fallback e escrita durável. Acaba com a perda de resultados.
4. **AUT-004** — elegibilidade real. É o que faz o rendimento subir.
5. **AUT-009** — decisão sobre a Vercel.
6. **AUT-011** — primeira bateria canônica pelo runner já provado; medir throughput e falhas reais.
7. **AUT-005, AUT-006, AUT-007** — observabilidade e triagem.

## Como medir que ficou autónomo

A métrica não é "os agentes correram". É:

> percentagem de cadeias que vão de trabalho elegível a resultado persistido e projectado
> **sem intervenção humana**, medida por ronda.

Hoje não é mensurável, porque `runs`, `actions` e `inbox` estão todos vazios no artefacto
publicado e o Guardião tem 24 horas de atraso. Tornar isto mensurável é, em si, o
primeiro passo de autonomia.
