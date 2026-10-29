# Torre Limpa: operação e recuperação

Este patch acrescenta seleção científica e reconciliação aos componentes existentes. Não cria banco, fila, serviço ou agendador. A disponibilidade em produção depende da promoção do patch e da confirmação da execução do Writer correspondente; validação local não significa ativação.

## Autoridades

| Informação ou ação | Fonte responsável |
|---|---|
| Código, testes e workflows | GitHub |
| Perguntas, eventos e resultados registrados | MURAL e RESULTADOS da Tower existente |
| Transporte pendente | Spool SHADOW_V2 existente |
| Admissão concorrente, escrita e readback | Writer serial existente |
| Hipóteses, escolha de observáveis e interpretação | Tasks científicas; P integra sem aprovação prévia universal |
| Navegação e métricas | Views derivadas; podem ser reconstruídas das fontes |

`scripts/nexo_scientific_state.py` é uma projeção pura dessas fontes. `scripts/nexo_tower_operations.py` apresenta a projeção; `scripts/nexo_shadow_writer.py` conserva o controle das gravações. Agendas continuam nas Tasks e no workflow já responsável pelo Writer. Não adicionar outro scheduler para a mesma responsabilidade.

## Identidade e eventos opcionais

O envelope `NEXO_SCIENCE_V1` é opt-in: em MURAL, `texto` começa com `NEXO_SCIENCE_V1 ` seguido de JSON; em RESULTADOS, `metodo` contém o objeto `NEXO_SCIENCE_V1` e o recibo `EXECUTOR_RECEIPT_V1`. As tabelas mantêm suas colunas atuais.

`scientific_id(identity)` usa `question`, `estimand`, `observable`, `data` e `design`. `question` é uma chave canônica estável; `title` é uma descrição humana fora da identidade. O código não reconhece paráfrases. Dados trazem ID, versão e SHA-256. Alterações materiais devem constar no desenho, por exemplo `design.material_revision`; trocar Task, run, seed ou versão de código sem mudança material não cria outra pergunta.

Todo evento vincula `event_id` ao ID real da linha, `science_id` à identidade calculada e `role` ao remetente. Novos eventos exigem os IDs contratuais do Writer. Títulos históricos livres e métodos sem envelope permanecem legados não classificados, sem conclusão científica inferida de texto.

### Fluxo

Para uma pergunta compartilhada por produtores concorrentes: **QUESTION → STARTED aceito pelo Writer e relido → execução → CALCULATED → confirmação de artefato e registro canônico**. QUESTION declara atividade, dependências verificadas e prioridade. STARTED identifica run e lease. O Writer admite reservas em série e confirma a anterior antes de admitir outra; dois produtores não podem interpretar a mesma recomendação como duas reservas.

Cálculo local autorizado e isolado pode ocorrer sem reserva prévia e sem esperar Writer. Seu resultado deve conservar evidência recuperável e ser reconciliado pelo transporte existente. A reserva coordena trabalho compartilhado; não é um veto à exploração local independente. O módulo aceita CALCULATED com recibo válido mesmo sem STARTED anterior.

CALCULATED contém recibo do executor, números e artefato. Fechar uma pergunta inconclusiva não torna sua execução novamente elegível. `lifecycle` descreve a pergunta; `result_state` mantém o resultado calculado ou persistido, inclusive após CLOSED/REFRAMED.

`select_next` retorna até seis recomendações determinísticas por papel, usando originalidade, discriminação, impacto e custo declarados. Não adquire lock nem despacha trabalho. O campo `previous` de `build_state` permite consumir deltas por IDs e hashes; essa otimização também não fornece exclusão mútua.

### Exemplo fictício: formato de um controle técnico

O exemplo abaixo usa números e hashes de fixture deliberadamente fictícios. Serve somente para verificar formato e projeção, não deve ser enfileirado e não representa execução científica nem artefato disponível. A atividade TECH_CHECK não entra na contagem de novos testes.

```python
import datetime as dt
import json
from scripts.nexo_scientific_state import (
    build_state, checkpoint_next_action, science_event, scientific_id, select_next,
)

at = "2026-01-01T00:00:00Z"
now = dt.datetime(2026, 1, 1, 0, 1, tzinfo=dt.timezone.utc)
fixture_input_hash, fixture_script_hash, fixture_output_hash = "1" * 64, "2" * 64, "3" * 64
identity = {
    "question": "fixture-mean-control-v1",
    "estimand": "mean",
    "observable": "fictional-fixture-values",
    "data": [{"id": "fixture-only", "version": "1", "sha256": fixture_input_hash}],
    "design": {"purpose": "technical-fixture", "operation": "arithmetic-mean"},
}
receipt = {
    "run_id": "fixture-run-001", "runtime": "local_sandbox", "class": "TECH_CHECK",
    "script_sha256": fixture_script_hash, "output_sha256": fixture_output_hash,
    "input_hashes": {"fixture.json": fixture_input_hash},
}
event = {
    "schema": "NEXO_SCIENCE_V1", "event_id": "fixture-result-001",
    "science_id": scientific_id(identity), "identity": identity,
    "title": "Exemplo fictício de média", "kind": "CALCULATED", "at": at,
    "role": "S1", "activity": "TECH_CHECK", "run_id": receipt["run_id"],
    "numeric_result": {"mean": 2.0},
    "artifact": {"uri": "fixture-local-output.json", "sha256": fixture_output_hash},
}
method = {"NEXO_SCIENCE_V1": event, "EXECUTOR_RECEIPT_V1": receipt}
row = [at, "S1", identity["question"], event["event_id"], "TECH_CHECK",
       json.dumps(method), json.dumps(event["numeric_result"]),
       "Fixture fictícia; sem alegação científica", "", event["artifact"]["uri"]]
data = {"tab": "RESULTADOS", "stable_id": event["event_id"], "values": row}
assert science_event(data, now=now)["science_id"] == event["science_id"]
state = build_state({}, [{"data": data, "state": ""}], now=now)
assert state["metrics"]["distinct_quantitative"] == 0
assert state["questions"][event["science_id"]]["result_state"] == "calculated"
assert select_next(state, "S1") == []
print(checkpoint_next_action(state, "S1", "cursor anterior"))
```

Em operações reais, hashes derivam dos bytes efetivamente executados e produzidos. Para QUESTION, cada dependência contém `id`, `status` (`verified`, `missing` ou `failed`), referência de `evidence`, `checked_at` e `expires_at`. Prioridades opcionais usam `originality`, `discrimination`, `impact` e `cost`. A validade dessas declarações deve ser estabelecida pelo produtor; o seletor apenas verifica formato e coerência.

## Falhas e recuperação

Resultado já calculado fica consumido durante falha de upload, indisponibilidade do Writer ou timeout. Preserve código, entradas, parâmetros, saída e recibo; reconcilie o mesmo ID e payload antes de reenviar. Não gere um novo ID para esconder uma entrega ambígua.

Lease vencida mantém a execução fora da seleção e pede reconciliação. RECONCILED só libera uma tentativa declarada `not_executed` com evidência registrada e readback canônico. Resultado CALCULATED existente continua consumido. Dependência vencida pede rechecagem; não se torna disponível por decurso do prazo. Candidatos independentes continuam elegíveis; sem candidato válido, um zero honesto é permitido.

`APPLIED` isolado e um evento declarando `kind=PERSISTED` não comprovam persistência científica. A projeção exige CALCULATED em RESULTADOS lido da fonte canônica, recibo coerente e atestação de artefato durável. `artifact.verified_sha256` e `verified_at` registram uma conferência externa; o módulo não baixa bytes nem reexecuta o cálculo. Um ponteiro, hash bem formado ou sucesso do workflow não substitui essa conferência.

Quando o artefato se torna durável depois do primeiro evento, preserve o original e registre uma versão vinculada com o mesmo science_id/run e a evidência atualizada, conforme o contrato do Writer. A projeção deduplica a ciência; o novo evento não é outro teste. Conflito de conteúdo sob o mesmo ID exige investigação, nunca sobrescrita. Reservas rejeitadas permanecem como incidentes e não contaminam a reserva legítima.

## Verificação e promoção

Na raiz do repositório, o conjunto focal usado nesta implementação reúne **146 controles** de seleção, Writer, projeções, readback, spool e curadoria:

```bash
python -m unittest \
  scripts.tests.test_nexo_scientific_state \
  scripts.tests.test_tower_operations \
  test.test_nexo_shadow_writer \
  scripts.tests.test_writer_incremental_readback \
  scripts.tests.test_shadow_writer_plain_spool \
  scripts.tests.test_shadow_curation
```

Os testes de integração usam fixtures e falhas simuladas para verificar recuperação; não são descobertas cosmológicas. O workflow existente do Writer executa seus controles antes da persistência, e a CI de seleção cobre os módulos alterados. Os testes locais não demonstram ganho de throughput científico: essa comparação precisa de janelas comparáveis e resultados distintos efetivamente investigados.

Promova somente o patch revisado pelo fluxo de autorização vigente. Depois confirme revisão executada, recibos, readbacks e projeções. Para rollback de código, retorne à revisão anterior por esse mesmo fluxo, mantendo os eventos append-only e as evidências privadas. Nenhuma limpeza de view autoriza excluir histórico ou frozen.
