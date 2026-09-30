"""Gera nexo-one/src/features/lab/narration.ts: matriz cabeça x cauda por evento, sorteada a cada linha.

Regras de escrita (perfil do Dener): primeira pessoa, frase curta, cada pedaço diz algo concreto
(o que foi feito, com que dado, o que acontece depois). Sem enchimento ("como combinado", "a fila anda"),
sem contraste retórico ("X, não Y"), sem ironia. Cauda vazia ("") é válida: a cabeça sozinha já fecha a frase.
%q = nome do teste ou hipótese; {n}, {m}, {title} = números e nomes preenchidos na página.
"""
import itertools, json, pathlib

E = {
 "SEMANTIC_BACKFILLED": (
  ["Dei nome em português a %q", "Reescrevi a pergunta de %q em linguagem simples", "Completei a leitura de %q", "Traduzi a ficha de %q",
   "Expliquei o que %q mede", "Arrumei o título de %q"],
  ["", " para o site", ", com o que o resultado significa", ", com pergunta, nula e rival legíveis", " e liguei à hipótese certa", " sem siglas"]),
 "TEST_ENRICHED": (
  ["Completei o contrato de %q", "Preenchi método e dado de %q", "Fixei sucesso e kill de %q", "Revisei a ficha de %q", "Ajustei os parâmetros de %q"],
  ["", "; já pode ir para a bateria", " com a URL oficial do dado", " com a previsão anotada", " para o robô aceitar"]),
 "LEARNING_SIGNAL_RECORDED": (
  ["Pedi uma receita que ainda não existe", "Registrei um dado que falta", "Abri um pedido para o Engenheiro", "Anotei uma lacuna na fila",
   "Marquei um teste sem receita", "Registrei um bloqueio"],
  ["", " com o produto oficial citado", "; os testes que dependem dela ficam na fila", " agrupado com os pedidos parecidos", " com o motivo e o dono"]),
 "TEST_DISPATCHED": (
  ["Mandei para a bateria %q", "Coloquei %q para rodar", "Despachei %q", "Liguei o runner em %q", "Soltei %q"],
  ["", " com critério congelado", "; o resultado volta em minutos", " junto com o lote da família", " com receita fixa e hash conferido"]),
 "TEST_RESULT_RECORDED": (
  ["Terminou %q", "Chegou o resultado de %q", "Fechei a conta de %q", "A bateria devolveu %q", "Saiu o veredito de %q"],
  ["", "; os números estão na ficha", "; o próximo passo é o ataque", " pelo critério escrito antes", " e entrou no mapa"]),
 "ROADMAP_TEST_FROZEN": (
  ["Congelei o critério de %q", "Pré-registrei %q", "Escrevi o que derrubaria %q", "Fixei sucesso e kill de %q", "Anotei a previsão de %q"],
  ["", " antes de ver o dado", " com a probabilidade que eu aposto", "; a partir daqui ele só roda", " com nula e rival"]),
 "RESULT_CONTESTED": (
  ["Abri um ataque contra %q", "Montei o contra-teste de %q", "Coloquei %q à prova", "Fui atrás do ponto fraco de %q", "Repliquei %q por outro caminho",
   "Duvidei de %q"],
  ["", " com outra coleção de supernovas", " trocando o dado", " com critério congelado", " mudando o método", " antes de acreditar"]),
 "RESULT_REFEREE1_PASSED": (
  ["%q aguentou o primeiro ataque", "O contra-teste manteve %q", "%q sobreviveu à replicação"],
  ["", " com outro dado", "; segue para o segundo eixo"]),
 "RESULT_REFUTED": (
  ["Derrubei %q", "%q caiu no ataque", "O contra-teste desmontou %q", "Refutei %q", "%q não resistiu à replicação"],
  ["", "; a hipótese rival entra na fila", " e registrei onde falhou", " com outro dado", "; o mapa foi corrigido"]),
 "RESULT_CONFIRMED": (
  ["Confirmei %q", "%q resistiu ao ataque independente", "%q replicou com outro dado", "Fechou: %q", "%q virou resultado firme"],
  ["", " e entra no mapa", " com outra coleção de supernovas", "; serve de base para a próxima pergunta", " pelo critério congelado"]),
 "HYPOTHESIS_UPSERTED": (
  ["Nova hipótese: %q", "Abri uma pergunta: %q", "Formulei %q", "Quero testar %q", "Surgiu %q"],
  ["", ", com nula e rival", ", a partir de um resultado recente", ", já com o que a derrubaria", ", como rival de uma queda"]),
 "INTEGRITY_REPORT_RECORDED": (
  ["Auditei o sistema", "Conferi a saúde do NEXO", "Medi a autonomia das últimas 24 h", "Chequei filas, papéis e robô", "Fiz a ronda de integridade",
   "Conferi se algum agente parou"],
  ["", " e registrei os números", "; nenhum papel parado", " e agi no pior indicador", "; o relatório está no mural", " contra o último heartbeat"]),
 "NEXO_THOUGHT_RECORDED": (
  ["Registrei um pensamento", "Anotei uma surpresa", "Vi um padrão entre dois resultados", "Fiquei com uma pergunta", "Anotei uma ideia para depois"],
  ["", " com referência aos testes", "; pode virar hipótese", " sobre a última bateria"]),
 "NEXO_THOUGHT_NOOP_RECORDED": (
  ["Revisei os resultados recentes", "Conferi as previsões contra os resultados", "Varri as últimas horas", "Olhei o mapa inteiro", "Passei pelos roteiros ativos"],
  ["; nenhuma surpresa", "; nenhuma previsão furou", "; nada pediu pensamento novo", "; tudo dentro do previsto"]),
 "TEST_BATTERY_DISPATCHED": (
  ["Mandei uma bateria rodar", "Soltei um lote de testes", "Disparei uma bateria em paralelo", "Pus a família para rodar"],
  ["", " no runner público", ", cada teste com critério congelado", "; o robô coleta os resultados"]),
 "GENOME_MUTATION_PROPOSED": (
  ["Propus mudar uma regra minha", "Sugeri um ajuste no meu procedimento", "Coloquei uma regra minha em canário"],
  ["", " com a evidência do histórico", "; o Dener decide", " para medir contra a atual"]),
 "ROADMAP_CHARTERED": (
  ["Abri uma frente de pesquisa", "Recebi uma pergunta nova", "Comecei um roteiro novo"],
  ["", " com orçamento e parada definidos", ", aprovada pelo Dener"]),
 "BOARD_POSTED": (
  ["Deixei um recado no mural", "Chamei outro agente", "Avisei quem destrava", "Respondi um recado"],
  ["", " com o teste citado", " com o que falta"]),
 "SELF_FOCUS": (["Minha atenção está em {title}: {n} ações em 24 h", "Quase tudo que fiz hoje foi em {title} ({n} ações)", "Foco em {title}: {n} ações em 24 h"], [""]),
 "SELF_IGNORED": (["{title} está parado, com {n} testes esperando", "Devo uma rodada a {title}: {n} testes na fila", "Não toquei em {title} hoje; {n} testes esperam"], [""]),
 "SELF_DECOY_CAUGHT": (["Das {m} iscas reveladas, peguei {n}", "Me testei com iscas: {n} de {m} descobertas"], [""]),
 "SELF_DECOY_PLANTED": (["Há iscas plantadas contra mim ({n}); ainda não sei quais", "{n} resultado(s) meu(s) pode(m) ser isca"], [""]),
 "SELF_GATE": (["Espero o Dener decidir {n} coisa(s) que só ele decide", "{n} decisão(ões) na mesa do Dener"], [""]),
 "AWAY_OPEN": (["Enquanto você esteve fora", "Desde a sua última visita", "Nesse intervalo", "Desde que você saiu"], [""]),
 "GROUP_SEMANTIC_BACKFILLED": (["Dei nome em português a {n} testes", "Traduzi {n} fichas"], [""]),
 "GROUP_TEST_ENRICHED": (["Completei o contrato de {n} testes", "Preenchi {n} fichas"], [""]),
 "GROUP_LEARNING_SIGNAL_RECORDED": (["Registrei {n} lacunas de receita ou dado", "Abri {n} pedidos para o Engenheiro"], [""]),
 "GROUP_TEST_DISPATCHED": (["Mandei {n} testes para a bateria", "Despachei {n} testes"], [""]),
 "GROUP_ROADMAP_TEST_FROZEN": (["Congelei o critério de {n} testes", "Pré-registrei {n} testes"], [""]),
 "GROUP_INTEGRITY_REPORT_RECORDED": (["{n} auditorias seguidas, sem incidente", "Conferi o sistema {n} vezes"], [""]),
 "GROUP_NEXO_THOUGHT_NOOP_RECORDED": (["{n} revisões sem surpresa", "Revisei os resultados {n} vezes; nada novo"], [""]),
}

# Meio-termo: uma terceira peça (consequência) combinada com as caudas, só nos eventos de ação.
# Cada peça continua concreta; a combinação multiplica sem enchimento.
ENDS = {
 "SEMANTIC_BACKFILLED": ["; qualquer pessoa entende a ficha", "; o site já mostra", "; ninguém precisa decifrar sigla"],
 "TEST_ENRICHED": ["; o robô aceita na próxima rodada", "; a papelada fechou na mesma rodada", "; entra na próxima bateria"],
 "LEARNING_SIGNAL_RECORDED": ["; o Engenheiro recebe no mural", "; a fila segue com o que já dá para rodar", "; vira receita em PR"],
 "TEST_DISPATCHED": ["; o robô coleta sozinho", "; roda em máquina pública", "; ninguém precisou apertar botão"],
 "TEST_RESULT_RECORDED": ["; o site já mostra", "; entra na conta da família", "; o Crítico pega na próxima rodada"],
 "ROADMAP_TEST_FROZEN": ["; ninguém mexe depois", "; o dado decide", "; fica auditável no histórico"],
 "RESULT_CONTESTED": ["; se for real, aguenta", "; o robô decide pelo critério do ataque", "; resultado bonito pede ataque"],
 "RESULT_REFUTED": ["; queda também é resultado", "; melhor agora do que num paper", "; a rival herda o que aprendi"],
 "RESULT_CONFIRMED": ["; conta para a campanha", "; replicou em dado independente", "; vira base para o próximo teste"],
 "HYPOTHESIS_UPSERTED": ["; entra na fila hoje", "; se morrer, aprendo onde", "; o critério nasce junto"],
 "INTEGRITY_REPORT_RECORDED": ["; o site mostra o painel", "; o alarme fica quieto", "; o próximo turno parte daqui"],
 "NEXO_THOUGHT_NOOP_RECORDED": [", e volto na próxima hora", ", e os números ficam no histórico", ", e sigo vigiando"],
 "TEST_BATTERY_DISPATCHED": ["; volta em minutos", "; a vazão depende disso"],
}

MATRIX_SIZE = 90

# A matriz permanece factual: os eixos extras só acrescentam contexto de registro,
# nunca novos resultados, números, dados ou decisões científicas.
HEAD_MOMENTS = [
    "", "Nesta rodada,", "No meu turno,", "Neste ciclo,", "Nesta passagem,",
    "Na atividade registrada,", "Ao fechar esta etapa,", "Na sequência do trabalho,",
    "Durante esta etapa,", "No histórico desta ação,"
]
HEAD_CONTEXTS = [
    "", "com o evento identificado,", "com hora registrada,", "com o contexto preservado,",
    "com a origem vinculada,", "com o registro disponível,", "com a atividade rastreável,",
    "com o item identificado,", "com a sequência preservada,", "com o estado documentado,"
]
TAIL_TRACES = [
    "", "; ficou registrado", "; entrou no histórico", "; a ficha preserva a ação",
    "; o evento ficou rastreável", "; o registro pode ser conferido", "; a origem ficou vinculada",
    "; a hora ficou preservada", "; o estado ficou documentado", "; a sequência ficou registrada"
]
TAIL_CONTEXTS = [
    "", "; com o item identificado", "; com o contexto preservado", "; com a origem disponível",
    "; com o vínculo mantido", "; com o registro da rodada", "; com a atividade identificada",
    "; com o estado disponível", "; com a sequência auditável", "; com o evento preservado"
]


def lower_first(text):
    return text if text.startswith(("%q", "{")) else text[:1].lower() + text[1:]


def unique(values):
    return list(dict.fromkeys(values))


def matrix_heads(cores):
    values = []
    for moment, context in itertools.product(HEAD_MOMENTS, HEAD_CONTEXTS):
        prefix = " ".join(part for part in (moment, context) if part).strip()
        if prefix:
            prefix = prefix[:1].upper() + prefix[1:]
        for core in cores:
            values.append(f"{prefix} {lower_first(core)}".strip() if prefix else core)
    return unique(values)[:MATRIX_SIZE]


def matrix_tails(semantic_tails):
    values = []
    for trace, context in itertools.product(TAIL_TRACES, TAIL_CONTEXTS):
        for tail in semantic_tails:
            values.append(f"{tail}{trace}{context}.")
    return unique(values)[:MATRIX_SIZE]


out = {}
for ev, (heads, tails) in E.items():
    ends = [""] + ENDS.get(ev, [])
    semantic_tails = [t + e for t in tails for e in ends if not (t.startswith(";") and e.startswith(";"))]
    matrix = {"heads": matrix_heads(heads), "tails": matrix_tails(semantic_tails)}
    if len(matrix["heads"]) != MATRIX_SIZE or len(matrix["tails"]) != MATRIX_SIZE:
        raise RuntimeError(f"{ev}: matriz incompleta {len(matrix['heads'])}x{len(matrix['tails'])}")
    out[ev] = matrix

NL = chr(10)
ts = "// Gerado por nexo-one/scripts/gen_narration.py (NEXO): matriz 90x90 por evento, sorteada a cada linha." + NL
ts += f"export const NARRATION_MATRIX_SIZE = {MATRIX_SIZE};" + NL
ts += "export const NARRATION: Record<string, { heads: string[]; tails: string[] }> = " + json.dumps(out, ensure_ascii=False, indent=1) + ";" + NL
open(pathlib.Path(__file__).resolve().parents[1] / "src/features/lab/narration.ts", "w", encoding="utf-8", newline=NL).write(ts)
print(sum(len(v["heads"]) * len(v["tails"]) for v in out.values()), "combinações")
