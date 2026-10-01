"""Generate a factual 120x120 matrix with event-specific action nouns.

Head diversity describes the received action. Tails use only non-empty published
fields supplied at render time; unsupported tails are never shown. No safety
boilerplate is multiplied to fill the axes. Files are testable and deterministic.
"""
import json
import pathlib
MATRIX_SIZE = 120
OBJECTS = {
  "SEMANTIC_BACKFILLED": [
    "a descrição de %q",
    "o nome de %q",
    "o texto semântico de %q",
    "a leitura simples de %q",
    "os rótulos de %q"
  ],
  "TEST_ENRICHED": [
    "a atualização de %q",
    "a ficha atualizada de %q",
    "o contrato enriquecido de %q",
    "os campos de %q",
    "a revisão da ficha de %q"
  ],
  "LEARNING_SIGNAL_RECORDED": [
    "um sinal de aprendizagem",
    "uma observação para aprender",
    "um registro de aprendizagem",
    "um sinal para avaliar",
    "um ponto do registro de aprendizagem"
  ],
  "TEST_DISPATCHED": [
    "o despacho de %q",
    "o pedido de execução de %q",
    "o envio de %q à bateria",
    "a chamada de execução de %q",
    "a solicitação de execução de %q"
  ],
  "TEST_RESULT_RECORDED": [
    "o resultado de %q",
    "o retorno de %q",
    "o desfecho de %q",
    "a saída do teste %q",
    "o resultado da execução de %q"
  ],
  "ROADMAP_TEST_FROZEN": [
    "o critério congelado de %q",
    "o pré-registro de %q",
    "o contrato congelado de %q",
    "as regras pré-registradas de %q",
    "a regra de decisão de %q"
  ],
  "RESULT_CONTESTED": [
    "a contestação de %q",
    "o ataque a %q",
    "a abertura da revisão de %q",
    "o pedido de revisão de %q",
    "a contestação vinculada a %q"
  ],
  "RESULT_REFEREE1_PASSED": [
    "a passagem de %q no primeiro árbitro",
    "o primeiro parecer favorável de %q",
    "a aprovação de %q na primeira revisão",
    "o primeiro ataque superado por %q",
    "a primeira etapa de revisão aprovada em %q"
  ],
  "RESULT_REFUTED": [
    "a refutação de %q",
    "o parecer que refutou %q",
    "a revisão negativa de %q",
    "o resultado refutado de %q",
    "a conclusão refutada na revisão de %q"
  ],
  "RESULT_CONFIRMED": [
    "a confirmação de %q",
    "o parecer que confirmou %q",
    "a revisão favorável de %q",
    "o resultado confirmado de %q",
    "a confirmação registrada pela revisão de %q"
  ],
  "HYPOTHESIS_UPSERTED": [
    "a hipótese %q",
    "a pergunta de %q",
    "o registro da hipótese %q",
    "a proposta de hipótese %q",
    "a atualização da hipótese %q"
  ],
  "INTEGRITY_REPORT_RECORDED": [
    "a auditoria de integridade",
    "o relatório de integridade",
    "a checagem de integridade",
    "a verificação de integridade",
    "o relatório de saúde"
  ],
  "NEXO_THOUGHT_RECORDED": [
    "uma nota da Pítia",
    "um pensamento da Pítia",
    "uma entrada no diário da Pítia",
    "uma síntese da Pítia",
    "a nota publicada pela Pítia"
  ],
  "NEXO_THOUGHT_NOOP_RECORDED": [
    "a revisão sem nova nota",
    "a passagem sem novo pensamento",
    "o turno sem nova nota da Pítia",
    "a revisão sem nova entrada de pensamento",
    "a passagem de revisão sem novo pensamento"
  ],
  "TEST_BATTERY_DISPATCHED": [
    "o despacho da bateria",
    "o envio do lote de testes",
    "a chamada da bateria",
    "o pedido de execução em lote",
    "o despacho publicado da bateria"
  ],
  "GENOME_MUTATION_PROPOSED": [
    "a proposta de mudança de regra",
    "o ajuste proposto no procedimento",
    "a mutação proposta",
    "a proposta de procedimento",
    "o pedido de alteração de regra"
  ],
  "ROADMAP_CHARTERED": [
    "a carta da frente de pesquisa",
    "o roadmap com carta aprovada",
    "a carta aprovada da frente",
    "a abertura autorizada do roadmap",
    "a carta registrada do roadmap"
  ],
  "BOARD_POSTED": [
    "um recado no mural",
    "uma mensagem de coordenação",
    "um recado de coordenação",
    "uma nota entre os papéis",
    "uma mensagem no mural"
  ],
  "SELF_FOCUS": [
    "{n} eventos de {title} no recorte",
    "{n} sinais recebidos de {title}",
    "{title}: {n} eventos no recorte",
    "{n} registros de atividade em {title}",
    "{n} eventos recebidos ligados a {title}"
  ],
  "SELF_IGNORED": [
    "{title} com {n} testes na fronteira e nenhum evento recebido",
    "{n} testes na fronteira de {title}, sem evento no recorte",
    "a fronteira de {title}: {n} testes, sem evento recebido",
    "{title}: {n} testes na fronteira sem evento dessa frente",
    "{n} testes na fronteira de {title} e nenhum evento dela no recorte"
  ],
  "SELF_BLOCKED": [
    "{n} testes bloqueados em {title}",
    "{title}: {n} testes esperando destravar",
    "{n} testes de {title} com bloqueio",
    "{n} testes sem avanço liberado em {title}",
    "{n} testes presos num bloqueio de {title}"
  ],
  "SELF_DECOY_CAUGHT": [
    "{n} iscas identificadas entre {m} reveladas",
    "{n} identificadas em {m} iscas reveladas",
    "{m} iscas reveladas, das quais {n} identificadas",
    "a contagem de iscas: {n} identificadas em {m}",
    "{n} iscas encontradas no grupo de {m} reveladas"
  ],
  "SELF_DECOY_PLANTED": [
    "{n} iscas plantadas no snapshot",
    "{n} iscas declaradas na leitura",
    "a contagem publicada de {n} iscas plantadas",
    "{n} iscas plantadas na fonte",
    "o total declarado de {n} iscas plantadas"
  ],
  "SELF_GATE": [
    "{n} decisões no portão do Dener",
    "{n} decisões esperando o Dener",
    "{n} decisões publicadas para o Dener",
    "a fila de {n} decisões do Dener",
    "o portão com {n} decisões pendentes"
  ],
  "AWAY_OPEN": [
    "o intervalo desde a visita anterior",
    "o período desde a última leitura",
    "o recorte desde a sua última visita",
    "o intervalo desde o snapshot anterior",
    "o histórico recebido desde a sua visita"
  ],
  "GROUP_SEMANTIC_BACKFILLED": [
    "{n} atualizações semânticas",
    "{n} descrições atualizadas",
    "{n} eventos de atualização semântica",
    "{n} atualizações de rótulo",
    "{n} registros de ajuste semântico"
  ],
  "GROUP_TEST_ENRICHED": [
    "{n} atualizações de ficha",
    "{n} enriquecimentos de contrato",
    "{n} registros de ficha atualizada",
    "{n} eventos de enriquecimento",
    "{n} registros de contrato enriquecido"
  ],
  "GROUP_LEARNING_SIGNAL_RECORDED": [
    "{n} sinais de aprendizagem",
    "{n} registros de lacuna",
    "{n} eventos de aprendizagem",
    "{n} sinais para investigar",
    "{n} registros de aprendizagem"
  ],
  "GROUP_TEST_DISPATCHED": [
    "{n} despachos de teste",
    "{n} pedidos de execução",
    "{n} envios para a bateria",
    "{n} eventos de despacho",
    "{n} registros de envio à execução"
  ],
  "GROUP_ROADMAP_TEST_FROZEN": [
    "{n} contratos congelados",
    "{n} pré-registros",
    "{n} critérios congelados",
    "{n} eventos de pré-registro",
    "{n} registros de congelamento de critério"
  ],
  "GROUP_INTEGRITY_REPORT_RECORDED": [
    "{n} auditorias de integridade",
    "{n} relatórios de integridade",
    "{n} checagens de integridade",
    "{n} verificações de integridade",
    "{n} registros de auditoria"
  ],
  "GROUP_NEXO_THOUGHT_NOOP_RECORDED": [
    "{n} revisões sem nova nota",
    "{n} passagens sem novo pensamento",
    "{n} eventos sem nova nota da Pítia",
    "{n} revisões sem nova entrada de pensamento",
    "{n} registros de revisão sem novo pensamento"
  ],
  "GROUP_TEST_RESULT_RECORDED": [
    "{n} registros de resultado",
    "{n} retornos de teste recebidos",
    "{n} eventos de resultado",
    "{n} resultados recebidos no recorte",
    "{n} registros de saída de teste"
  ]
}
VERBS = ['Anotei', 'Registrei', 'Recebi', 'Publiquei', 'Salvei', 'Documentei', 'Guardei', 'Incluí', 'Deixei anotado', 'Deixei na ficha', 'Coloquei no histórico', 'Passei para a ficha']
OBSERVERS = ['Vejo', 'Tenho aqui', 'A leitura traz', 'O painel mostra', 'O recorte mostra', 'A lista traz', 'A projeção traz', 'O snapshot mostra', 'A ficha aponta', 'O resumo mostra', 'O recorte inclui', 'A contagem mostra']
FIELDS = {
  "status": [
    "Ficha recebida",
    "Estado recebido",
    "Situação na ficha",
    "A ficha marca",
    "Estado do teste",
    "Na leitura recebida",
    "Situação publicada",
    "Na ficha atual",
    "A ficha traz",
    "O estado registrado é"
  ],
  "review": [
    "Revisão",
    "Parecer da revisão",
    "A revisão está",
    "Etapa de revisão",
    "Revisão publicada",
    "Estado da revisão",
    "A revisão marca",
    "Parecer registrado",
    "Na revisão",
    "Conclusão da revisão"
  ],
  "result": [
    "Execução",
    "Resultado bruto",
    "Na execução",
    "Rótulo da execução",
    "Desfecho bruto",
    "A execução registrou",
    "O teste devolveu",
    "Saída da execução",
    "Resultado recebido",
    "O resultado veio como"
  ],
  "blocker": [
    "Travou aqui",
    "O que trava",
    "Falta resolver",
    "O bloqueio é",
    "Sem isso, a fila fica presa",
    "Esse teste está preso em",
    "O entrave é",
    "Isto ainda segura o teste",
    "A trava da ficha",
    "Ainda falta destravar"
  ],
  "question": [
    "Pergunta",
    "Questão do teste",
    "O teste pergunta",
    "A pergunta é",
    "Pergunta registrada",
    "Questão publicada",
    "É isto que está em jogo",
    "A questão é",
    "Pergunta da ficha",
    "O teste investiga"
  ],
  "roadmap": [
    "Frente",
    "Roadmap",
    "Na frente",
    "Frente vinculada",
    "Roteiro",
    "Pertence à frente",
    "Frente de pesquisa",
    "Roteiro vinculado",
    "No roadmap",
    "A frente é"
  ],
  "meaning": [
    "A execução relata",
    "Interpretação da execução",
    "O resultado bruto diz",
    "Leitura registrada na execução",
    "Significado anotado na execução",
    "O relato da execução",
    "A interpretação foi",
    "O resultado foi descrito como",
    "Resumo da execução",
    "A execução trouxe"
  ],
  "limit": [
    "Limite",
    "Escopo",
    "Limite declarado",
    "Escopo da conclusão",
    "A conclusão se limita a",
    "Fronteira da alegação",
    "Limite do teste",
    "O escopo é",
    "A ficha delimita",
    "Limite publicado"
  ],
  "method": [
    "Método",
    "Método declarado",
    "Método na ficha",
    "A análise usa",
    "Procedimento",
    "Método registrado",
    "O método é",
    "Procedimento declarado",
    "A ficha descreve o método",
    "A análise foi descrita como"
  ],
  "by": [
    "Dono declarado",
    "Responsável declarado",
    "Papel declarado",
    "Quem responde na fonte",
    "Papel responsável na ficha",
    "Dono do passo na fonte",
    "Responsabilidade declarada",
    "Papel vinculado",
    "Dono publicado",
    "A fonte aponta o papel"
  ],
  "request": [
    "Pedido aberto",
    "No mural pediram",
    "O pedido é",
    "Próxima ação declarada",
    "A mensagem pede",
    "Pedido no mural",
    "O recado pede",
    "Ação pedida",
    "O pedido publicado",
    "Quem escreveu pediu"
  ],
  "n": [
    "Quantidade no recorte",
    "Registros recebidos",
    "Eventos recebidos",
    "Lote recebido",
    "Contagem do recorte",
    "Itens agrupados",
    "A contagem é",
    "Quantidade agrupada",
    "No grupo recebido",
    "Na soma dos registros"
  ]
}

RECEIPT_SUFFIXES = ["consta no diário", "consta no histórico", "ficou anotado", "registro recebido", "evento registrado", "registro publicado", "foi registrado", "entrou no recorte", "consta na leitura recebida", "consta na ficha", "foi anotado", "consta entre os eventos"]

# Twelve action forms and twelve receipt forms over five event-specific nouns.
# The tail axis is twelve different source fields with ten short reading forms.
prefix = '// Generated: factual action matrix, 120x120, conditional published-field tails.\n'
prefix += f'export const NARRATION_MATRIX_SIZE = {MATRIX_SIZE};\n'
prefix += 'const verbs: string[] = ' + json.dumps(VERBS, ensure_ascii=False) + ';\n'
prefix += 'const observers: string[] = ' + json.dumps(OBSERVERS, ensure_ascii=False) + ';\n'
prefix += 'const received: string[] = ' + json.dumps(RECEIPT_SUFFIXES, ensure_ascii=False) + ';\n'
prefix += 'const objects: Record<string,string[]> = ' + json.dumps(OBJECTS, ensure_ascii=False) + ';\n'
prefix += 'const fields: Record<string,string[]> = ' + json.dumps(FIELDS, ensure_ascii=False) + ';\n'
prefix += "const tails = Object.entries(fields).flatMap(([field, readings]) => readings.map(reading => '; ' + reading + ': {' + field + '}.'));\n"
prefix += "const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);\n"
prefix += "export const NARRATION: Record<string,{heads:string[];tails:string[]}> = Object.fromEntries(Object.entries(objects).map(([key, nouns]) => { const actions = key.startsWith('SELF_') || key === 'AWAY_OPEN' ? observers : verbs; return [key, { heads: [...actions.flatMap(verb => nouns.map(noun => verb + ' ' + noun)), ...received.flatMap(ending => nouns.map(noun => capitalize(noun) + ': ' + ending))], tails }]; }));\n"
path = pathlib.Path(__file__).resolve().parents[1] / 'src/features/lab/narration.ts'
path.write_text(prefix, encoding='utf-8', newline='\n')
print(f'{len(OBJECTS)} families; {MATRIX_SIZE}x{MATRIX_SIZE}; actual tail choices require published fields')
