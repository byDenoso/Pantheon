// Gerado por nexo-one/scripts/gen_narration.py (NEXO): matriz cabeça x cauda por evento, sorteada a cada linha.
export const NARRATION: Record<string, { heads: string[]; tails: string[] }> = {
 "SEMANTIC_BACKFILLED": {
  "heads": [
   "Dei nome em português a %q",
   "Reescrevi a pergunta de %q em linguagem simples",
   "Completei a leitura de %q",
   "Traduzi a ficha de %q",
   "Expliquei o que %q mede",
   "Arrumei o título de %q"
  ],
  "tails": [
   ".",
   " para o site.",
   ", com o que o resultado significa.",
   ", com pergunta, nula e rival legíveis.",
   " e liguei à hipótese certa.",
   " sem siglas."
  ]
 },
 "TEST_ENRICHED": {
  "heads": [
   "Completei o contrato de %q",
   "Preenchi método e dado de %q",
   "Fixei sucesso e kill de %q",
   "Revisei a ficha de %q",
   "Ajustei os parâmetros de %q"
  ],
  "tails": [
   ".",
   "; já pode ir para a bateria.",
   " com a URL oficial do dado.",
   " com a previsão anotada.",
   " para o robô aceitar."
  ]
 },
 "LEARNING_SIGNAL_RECORDED": {
  "heads": [
   "Pedi uma receita que ainda não existe",
   "Registrei um dado que falta",
   "Abri um pedido para o Engenheiro",
   "Anotei uma lacuna na fila",
   "Marquei um teste sem receita",
   "Registrei um bloqueio"
  ],
  "tails": [
   ".",
   " com o produto oficial citado.",
   "; os testes que dependem dela ficam na fila.",
   " agrupado com os pedidos parecidos.",
   " com o motivo e o dono."
  ]
 },
 "TEST_DISPATCHED": {
  "heads": [
   "Mandei para a bateria %q",
   "Coloquei %q para rodar",
   "Despachei %q",
   "Liguei o runner em %q",
   "Soltei %q"
  ],
  "tails": [
   ".",
   " com critério congelado.",
   "; o resultado volta em minutos.",
   " junto com o lote da família.",
   " com receita fixa e hash conferido."
  ]
 },
 "TEST_RESULT_RECORDED": {
  "heads": [
   "Terminou %q",
   "Chegou o resultado de %q",
   "Fechei a conta de %q",
   "A bateria devolveu %q",
   "Saiu o veredito de %q"
  ],
  "tails": [
   ".",
   "; os números estão na ficha.",
   "; o próximo passo é o ataque.",
   " pelo critério escrito antes.",
   " e entrou no mapa."
  ]
 },
 "ROADMAP_TEST_FROZEN": {
  "heads": [
   "Congelei o critério de %q",
   "Pré-registrei %q",
   "Escrevi o que derrubaria %q",
   "Fixei sucesso e kill de %q",
   "Anotei a previsão de %q"
  ],
  "tails": [
   ".",
   " antes de ver o dado.",
   " com a probabilidade que eu aposto.",
   "; a partir daqui ele só roda.",
   " com nula e rival."
  ]
 },
 "RESULT_CONTESTED": {
  "heads": [
   "Abri um ataque contra %q",
   "Montei o contra-teste de %q",
   "Coloquei %q à prova",
   "Fui atrás do ponto fraco de %q",
   "Repliquei %q por outro caminho",
   "Duvidei de %q"
  ],
  "tails": [
   ".",
   " com outra coleção de supernovas.",
   " trocando o dado.",
   " com critério congelado.",
   " mudando o método.",
   " antes de acreditar."
  ]
 },
 "RESULT_REFEREE1_PASSED": {
  "heads": [
   "%q aguentou o primeiro ataque",
   "O contra-teste manteve %q",
   "%q sobreviveu à replicação"
  ],
  "tails": [
   ".",
   " com outro dado.",
   "; segue para o segundo eixo."
  ]
 },
 "RESULT_REFUTED": {
  "heads": [
   "Derrubei %q",
   "%q caiu no ataque",
   "O contra-teste desmontou %q",
   "Refutei %q",
   "%q não resistiu à replicação"
  ],
  "tails": [
   ".",
   "; a hipótese rival entra na fila.",
   " e registrei onde falhou.",
   " com outro dado.",
   "; o mapa foi corrigido."
  ]
 },
 "RESULT_CONFIRMED": {
  "heads": [
   "Confirmei %q",
   "%q resistiu ao ataque independente",
   "%q replicou com outro dado",
   "Fechou: %q",
   "%q virou resultado firme"
  ],
  "tails": [
   ".",
   " e entra no mapa.",
   " com outra coleção de supernovas.",
   "; serve de base para a próxima pergunta.",
   " pelo critério congelado."
  ]
 },
 "HYPOTHESIS_UPSERTED": {
  "heads": [
   "Nova hipótese: %q",
   "Abri uma pergunta: %q",
   "Formulei %q",
   "Quero testar %q",
   "Surgiu %q"
  ],
  "tails": [
   ".",
   ", com nula e rival.",
   ", a partir de um resultado recente.",
   ", já com o que a derrubaria.",
   ", como rival de uma queda."
  ]
 },
 "INTEGRITY_REPORT_RECORDED": {
  "heads": [
   "Auditei o sistema",
   "Conferi a saúde do NEXO",
   "Medi a autonomia das últimas 24 h",
   "Chequei filas, papéis e robô",
   "Fiz a ronda de integridade",
   "Conferi se algum agente parou"
  ],
  "tails": [
   ".",
   " e registrei os números.",
   "; nenhum papel parado.",
   " e agi no pior indicador.",
   "; o relatório está no mural.",
   " contra o último heartbeat."
  ]
 },
 "NEXO_THOUGHT_RECORDED": {
  "heads": [
   "Registrei um pensamento",
   "Anotei uma surpresa",
   "Vi um padrão entre dois resultados",
   "Fiquei com uma pergunta",
   "Anotei uma ideia para depois"
  ],
  "tails": [
   ".",
   " com referência aos testes.",
   "; pode virar hipótese.",
   " sobre a última bateria."
  ]
 },
 "NEXO_THOUGHT_NOOP_RECORDED": {
  "heads": [
   "Revisei os resultados recentes",
   "Conferi as previsões contra os resultados",
   "Varri as últimas horas",
   "Olhei o mapa inteiro",
   "Passei pelos roteiros ativos"
  ],
  "tails": [
   "; nenhuma surpresa.",
   "; nenhuma previsão furou.",
   "; nada pediu pensamento novo.",
   "; tudo dentro do previsto."
  ]
 },
 "TEST_BATTERY_DISPATCHED": {
  "heads": [
   "Mandei uma bateria rodar",
   "Soltei um lote de testes",
   "Disparei uma bateria em paralelo",
   "Pus a família para rodar"
  ],
  "tails": [
   ".",
   " no runner público.",
   ", cada teste com critério congelado.",
   "; o robô coleta os resultados."
  ]
 },
 "GENOME_MUTATION_PROPOSED": {
  "heads": [
   "Propus mudar uma regra minha",
   "Sugeri um ajuste no meu procedimento",
   "Coloquei uma regra minha em canário"
  ],
  "tails": [
   ".",
   " com a evidência do histórico.",
   "; o Dener decide.",
   " para medir contra a atual."
  ]
 },
 "ROADMAP_CHARTERED": {
  "heads": [
   "Abri uma frente de pesquisa",
   "Recebi uma pergunta nova",
   "Comecei um roteiro novo"
  ],
  "tails": [
   ".",
   " com orçamento e parada definidos.",
   ", aprovada pelo Dener."
  ]
 },
 "BOARD_POSTED": {
  "heads": [
   "Deixei um recado no mural",
   "Chamei outro agente",
   "Avisei quem destrava",
   "Respondi um recado"
  ],
  "tails": [
   ".",
   " com o teste citado.",
   " com o que falta."
  ]
 },
 "SELF_FOCUS": {
  "heads": [
   "Minha atenção está em {title}: {n} ações em 24 h",
   "Quase tudo que fiz hoje foi em {title} ({n} ações)",
   "Foco em {title}: {n} ações em 24 h"
  ],
  "tails": [
   "."
  ]
 },
 "SELF_IGNORED": {
  "heads": [
   "{title} está parado, com {n} testes esperando",
   "Devo uma rodada a {title}: {n} testes na fila",
   "Não toquei em {title} hoje; {n} testes esperam"
  ],
  "tails": [
   "."
  ]
 },
 "SELF_DECOY_CAUGHT": {
  "heads": [
   "Das {m} iscas reveladas, peguei {n}",
   "Me testei com iscas: {n} de {m} descobertas"
  ],
  "tails": [
   "."
  ]
 },
 "SELF_DECOY_PLANTED": {
  "heads": [
   "Há iscas plantadas contra mim ({n}); ainda não sei quais",
   "{n} resultado(s) meu(s) pode(m) ser isca"
  ],
  "tails": [
   "."
  ]
 },
 "SELF_GATE": {
  "heads": [
   "Espero o Dener decidir {n} coisa(s) que só ele decide",
   "{n} decisão(ões) na mesa do Dener"
  ],
  "tails": [
   "."
  ]
 },
 "AWAY_OPEN": {
  "heads": [
   "Enquanto você esteve fora",
   "Desde a sua última visita",
   "Nesse intervalo",
   "Desde que você saiu"
  ],
  "tails": [
   "."
  ]
 },
 "GROUP_SEMANTIC_BACKFILLED": {
  "heads": [
   "Dei nome em português a {n} testes",
   "Traduzi {n} fichas"
  ],
  "tails": [
   "."
  ]
 },
 "GROUP_TEST_ENRICHED": {
  "heads": [
   "Completei o contrato de {n} testes",
   "Preenchi {n} fichas"
  ],
  "tails": [
   "."
  ]
 },
 "GROUP_LEARNING_SIGNAL_RECORDED": {
  "heads": [
   "Registrei {n} lacunas de receita ou dado",
   "Abri {n} pedidos para o Engenheiro"
  ],
  "tails": [
   "."
  ]
 },
 "GROUP_TEST_DISPATCHED": {
  "heads": [
   "Mandei {n} testes para a bateria",
   "Despachei {n} testes"
  ],
  "tails": [
   "."
  ]
 },
 "GROUP_ROADMAP_TEST_FROZEN": {
  "heads": [
   "Congelei o critério de {n} testes",
   "Pré-registrei {n} testes"
  ],
  "tails": [
   "."
  ]
 },
 "GROUP_INTEGRITY_REPORT_RECORDED": {
  "heads": [
   "{n} auditorias seguidas, sem incidente",
   "Conferi o sistema {n} vezes"
  ],
  "tails": [
   "."
  ]
 },
 "GROUP_NEXO_THOUGHT_NOOP_RECORDED": {
  "heads": [
   "{n} revisões sem surpresa",
   "Revisei os resultados {n} vezes; nada novo"
  ],
  "tails": [
   "."
  ]
 }
};
