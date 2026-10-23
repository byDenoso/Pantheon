# NEXO · lições do sistema (só acréscimo)

Mantido pelo Arquiteto (`NEXO_OS.md` §3, Papel: Arquiteto). Cada entrada responde a uma causa-raiz única.

Formato de cada entrada:
`## L-<nnn> · <data> · <título>`, seguido de uma linha para cada campo:
- **Sintoma**
- **Causa-raiz**
- **Correção** (PR)
- **Mecanismo** (teste, alarme ou regra, com o caminho)
- **Sinal de recaída**: o que o Médico vigia

Não apague nem reescreva entradas. Uma lição superada ganha uma entrada nova que cita a antiga.

## L-001 · 2026-09-29 · Cron do GitHub perde disparos
- **Sintoma:** robô com buracos de ~2 h; das últimas 40 execuções, só 1 saiu do próprio agendamento.
- **Causa-raiz:** o scheduler do GitHub descarta cron sob carga.
- **Correção:** byDenoso/Pantheon#335 (heartbeats A e B encadeados, defasados).
- **Mecanismo:** `.github/workflows/nexo-heartbeat.yml` e `nexo-heartbeat-b.yml`; o robô tem trava de concorrência.
- **Sinal de recaída:** mais de 35 min sem execução do robô, ou os dois heartbeats sem execução em andamento.

## L-002 · 2026-09-29 · Saúde congelada no relatório de uma tarefa parada
- **Sintoma:** site mostrava RED com 8 h de idade; a tarefa Guardião estava parada.
- **Causa-raiz:** a saúde publicada era o último relatório do próprio Guardião; monitor dependia do monitorado.
- **Correção:** byDenoso/TCC#97.
- **Mecanismo:** `public_projection._live_integrity` recalcula a cada build (`checked_at` = build; relatório fresco só piora).
- **Sinal de recaída:** `integrity.checked_at` com mais de 2 h.

## L-003 · 2026-09-29 · Promovidos sem contestação
- **Sintoma:** positivos acumulando sem ataque; o alarme contava 13 quando o real era 6.
- **Causa-raiz:** `review_queue` incluía ataques (incontestáveis), ordenados no topo; o Crítico gastava a rodada neles.
- **Correção:** byDenoso/TCC#97 (fila só com originais, do mais antigo) e byDenoso/Pantheon#334 (alarme conta só originais).
- **Mecanismo:** `tests/test_evolution.py::test_referee_queue_holds_only_reviewable_originals_oldest_first`.
- **Sinal de recaída:** ataque (`contests_test_id`) em `evolution.review_queue`.

## L-004 · 2026-09-29 · Correção mergeada que não roda
- **Sintoma:** fix no TCC main sem efeito em produção.
- **Causa-raiz:** o robô executa o bundle baixado do Drive; o upload é manual.
- **Correção:** byDenoso/Pantheon#334 (detecção); a correção estrutural é o B2 do `NEXO_OS.md`.
- **Mecanismo:** step "Check the Drive bundle against TCC main" abre e fecha a issue sozinho.
- **Sinal de recaída:** issue "NEXO: robô rodando bundle diferente do TCC main" aberta.

## L-005 · 2026-09-29 · Proveniência apontando para o vault antigo
- **Sintoma:** 8179 `source_ref` citavam o vault de 2026-09-23.
- **Causa-raiz:** `science-projection-v1` usava `tower_commit` legado mesmo com o manifesto vivo.
- **Correção:** byDenoso/Pantheon#333.
- **Mecanismo:** `towerSourceRef()` + teste com manifesto vivo; o readback do Pages aceita `tower-live://`.
- **Sinal de recaída:** `tower://byDenoso/NEXO-Obsidian-Vault@` em `science-projection-v1.json`.

## L-006 · 2026-09-27 · Resultado que só existia no chat
- **Sintoma:** envelope do Executor perdido por ~3 h depois de três rotas recusadas.
- **Causa-raiz:** nenhuma escrita durável antes da primeira tentativa de staging.
- **Correção:** byDenoso/Pantheon#323.
- **Mecanismo:** `nexo-one/docs/EXECUTOR_PERSISTENCE_BLOCK.md` (buffer antes de staging, drenagem com dedupe).
- **Sinal de recaída:** issue `[persistencia]` ou status `PERSISTENCIA_PENDENTE` em rodada.

## L-007 · 2026-09-27 · Fila com trabalho que não pode rodar
- **Sintoma:** `blocked_after_hydration` alto; 66 de 81 itens "READY" eram inconclusivos.
- **Causa-raiz:** seleção feita pelo índice `active-work.json`, desatualizado em relação às entidades.
- **Correção:** byDenoso/Pantheon#324 (seleção por entidade hidratada); regenerar o índice é o B5.
- **Mecanismo:** `atlas-control-tower/lib/tower-eligibility.mjs` + testes.
- **Sinal de recaída:** item escolhido que bloqueia depois de hidratado.

## L-008 · 2026-09-27 · `main` vermelho com deploy
- **Sintoma:** 12 testes falhando em `main`, deploy seguindo.
- **Causa-raiz:** CI usado como test runner; commits a menos de 60 s um do outro.
- **Correção:** byDenoso/Pantheon#322 (hook pre-push instalado no `npm install`).
- **Mecanismo:** `nexo-one/.githooks/pre-push` roda `npm run check`.
- **Sinal de recaída:** qualquer check vermelho em `main`.
