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
   "; qualquer pessoa entende a ficha.",
   "; o site já mostra.",
   "; ninguém precisa decifrar sigla.",
   " para o site.",
   " para o site; qualquer pessoa entende a ficha.",
   " para o site; o site já mostra.",
   " para o site; ninguém precisa decifrar sigla.",
   ", com o que o resultado significa.",
   ", com o que o resultado significa; qualquer pessoa entende a ficha.",
   ", com o que o resultado significa; o site já mostra.",
   ", com o que o resultado significa; ninguém precisa decifrar sigla.",
   ", com pergunta, nula e rival legíveis.",
   ", com pergunta, nula e rival legíveis; qualquer pessoa entende a ficha.",
   ", com pergunta, nula e rival legíveis; o site já mostra.",
   ", com pergunta, nula e rival legíveis; ninguém precisa decifrar sigla.",
   " e liguei à hipótese certa.",
   " e liguei à hipótese certa; qualquer pessoa entende a ficha.",
   " e liguei à hipótese certa; o site já mostra.",
   " e liguei à hipótese certa; ninguém precisa decifrar sigla.",
   " sem siglas.",
   " sem siglas; qualquer pessoa entende a ficha.",
   " sem siglas; o site já mostra.",
   " sem siglas; ninguém precisa decifrar sigla."
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
   "; o robô aceita na próxima rodada.",
   "; a papelada fechou na mesma rodada.",
   "; entra na próxima bateria.",
   "; já pode ir para a bateria.",
   " com a URL oficial do dado.",
   " com a URL oficial do dado; o robô aceita na próxima rodada.",
   " com a URL oficial do dado; a papelada fechou na mesma rodada.",
   " com a URL oficial do dado; entra na próxima bateria.",
   " com a previsão anotada.",
   " com a previsão anotada; o robô aceita na próxima rodada.",
   " com a previsão anotada; a papelada fechou na mesma rodada.",
   " com a previsão anotada; entra na próxima bateria.",
   " para o robô aceitar.",
   " para o robô aceitar; o robô aceita na próxima rodada.",
   " para o robô aceitar; a papelada fechou na mesma rodada.",
   " para o robô aceitar; entra na próxima bateria."
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
   "; o Engenheiro recebe no mural.",
   "; a fila segue com o que já dá para rodar.",
   "; vira receita em PR.",
   " com o produto oficial citado.",
   " com o produto oficial citado; o Engenheiro recebe no mural.",
   " com o produto oficial citado; a fila segue com o que já dá para rodar.",
   " com o produto oficial citado; vira receita em PR.",
   "; os testes que dependem dela ficam na fila.",
   " agrupado com os pedidos parecidos.",
   " agrupado com os pedidos parecidos; o Engenheiro recebe no mural.",
   " agrupado com os pedidos parecidos; a fila segue com o que já dá para rodar.",
   " agrupado com os pedidos parecidos; vira receita em PR.",
   " com o motivo e o dono.",
   " com o motivo e o dono; o Engenheiro recebe no mural.",
   " com o motivo e o dono; a fila segue com o que já dá para rodar.",
   " com o motivo e o dono; vira receita em PR."
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
   "; o robô coleta sozinho.",
   "; roda em máquina pública.",
   "; ninguém precisou apertar botão.",
   " com critério congelado.",
   " com critério congelado; o robô coleta sozinho.",
   " com critério congelado; roda em máquina pública.",
   " com critério congelado; ninguém precisou apertar botão.",
   "; o resultado volta em minutos.",
   " junto com o lote da família.",
   " junto com o lote da família; o robô coleta sozinho.",
   " junto com o lote da família; roda em máquina pública.",
   " junto com o lote da família; ninguém precisou apertar botão.",
   " com receita fixa e hash conferido.",
   " com receita fixa e hash conferido; o robô coleta sozinho.",
   " com receita fixa e hash conferido; roda em máquina pública.",
   " com receita fixa e hash conferido; ninguém precisou apertar botão."
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
   "; o site já mostra.",
   "; entra na conta da família.",
   "; o Crítico pega na próxima rodada.",
   "; os números estão na ficha.",
   "; o próximo passo é o ataque.",
   " pelo critério escrito antes.",
   " pelo critério escrito antes; o site já mostra.",
   " pelo critério escrito antes; entra na conta da família.",
   " pelo critério escrito antes; o Crítico pega na próxima rodada.",
   " e entrou no mapa.",
   " e entrou no mapa; o site já mostra.",
   " e entrou no mapa; entra na conta da família.",
   " e entrou no mapa; o Crítico pega na próxima rodada."
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
   "; ninguém mexe depois.",
   "; o dado decide.",
   "; fica auditável no histórico.",
   " antes de ver o dado.",
   " antes de ver o dado; ninguém mexe depois.",
   " antes de ver o dado; o dado decide.",
   " antes de ver o dado; fica auditável no histórico.",
   " com a probabilidade que eu aposto.",
   " com a probabilidade que eu aposto; ninguém mexe depois.",
   " com a probabilidade que eu aposto; o dado decide.",
   " com a probabilidade que eu aposto; fica auditável no histórico.",
   "; a partir daqui ele só roda.",
   " com nula e rival.",
   " com nula e rival; ninguém mexe depois.",
   " com nula e rival; o dado decide.",
   " com nula e rival; fica auditável no histórico."
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
   "; se for real, aguenta.",
   "; o robô decide pelo critério do ataque.",
   "; resultado bonito pede ataque.",
   " com outra coleção de supernovas.",
   " com outra coleção de supernovas; se for real, aguenta.",
   " com outra coleção de supernovas; o robô decide pelo critério do ataque.",
   " com outra coleção de supernovas; resultado bonito pede ataque.",
   " trocando o dado.",
   " trocando o dado; se for real, aguenta.",
   " trocando o dado; o robô decide pelo critério do ataque.",
   " trocando o dado; resultado bonito pede ataque.",
   " com critério congelado.",
   " com critério congelado; se for real, aguenta.",
   " com critério congelado; o robô decide pelo critério do ataque.",
   " com critério congelado; resultado bonito pede ataque.",
   " mudando o método.",
   " mudando o método; se for real, aguenta.",
   " mudando o método; o robô decide pelo critério do ataque.",
   " mudando o método; resultado bonito pede ataque.",
   " antes de acreditar.",
   " antes de acreditar; se for real, aguenta.",
   " antes de acreditar; o robô decide pelo critério do ataque.",
   " antes de acreditar; resultado bonito pede ataque."
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
   "; queda também é resultado.",
   "; melhor agora do que num paper.",
   "; a rival herda o que aprendi.",
   "; a hipótese rival entra na fila.",
   " e registrei onde falhou.",
   " e registrei onde falhou; queda também é resultado.",
   " e registrei onde falhou; melhor agora do que num paper.",
   " e registrei onde falhou; a rival herda o que aprendi.",
   " com outro dado.",
   " com outro dado; queda também é resultado.",
   " com outro dado; melhor agora do que num paper.",
   " com outro dado; a rival herda o que aprendi.",
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
   "; conta para a campanha.",
   "; replicou em dado independente.",
   "; vira base para o próximo teste.",
   " e entra no mapa.",
   " e entra no mapa; conta para a campanha.",
   " e entra no mapa; replicou em dado independente.",
   " e entra no mapa; vira base para o próximo teste.",
   " com outra coleção de supernovas.",
   " com outra coleção de supernovas; conta para a campanha.",
   " com outra coleção de supernovas; replicou em dado independente.",
   " com outra coleção de supernovas; vira base para o próximo teste.",
   "; serve de base para a próxima pergunta.",
   " pelo critério congelado.",
   " pelo critério congelado; conta para a campanha.",
   " pelo critério congelado; replicou em dado independente.",
   " pelo critério congelado; vira base para o próximo teste."
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
   "; entra na fila hoje.",
   "; se morrer, aprendo onde.",
   "; o critério nasce junto.",
   ", com nula e rival.",
   ", com nula e rival; entra na fila hoje.",
   ", com nula e rival; se morrer, aprendo onde.",
   ", com nula e rival; o critério nasce junto.",
   ", a partir de um resultado recente.",
   ", a partir de um resultado recente; entra na fila hoje.",
   ", a partir de um resultado recente; se morrer, aprendo onde.",
   ", a partir de um resultado recente; o critério nasce junto.",
   ", já com o que a derrubaria.",
   ", já com o que a derrubaria; entra na fila hoje.",
   ", já com o que a derrubaria; se morrer, aprendo onde.",
   ", já com o que a derrubaria; o critério nasce junto.",
   ", como rival de uma queda.",
   ", como rival de uma queda; entra na fila hoje.",
   ", como rival de uma queda; se morrer, aprendo onde.",
   ", como rival de uma queda; o critério nasce junto."
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
   "; o site mostra o painel.",
   "; o alarme fica quieto.",
   "; o próximo turno parte daqui.",
   " e registrei os números.",
   " e registrei os números; o site mostra o painel.",
   " e registrei os números; o alarme fica quieto.",
   " e registrei os números; o próximo turno parte daqui.",
   "; nenhum papel parado.",
   " e agi no pior indicador.",
   " e agi no pior indicador; o site mostra o painel.",
   " e agi no pior indicador; o alarme fica quieto.",
   " e agi no pior indicador; o próximo turno parte daqui.",
   "; o relatório está no mural.",
   " contra o último heartbeat.",
   " contra o último heartbeat; o site mostra o painel.",
   " contra o último heartbeat; o alarme fica quieto.",
   " contra o último heartbeat; o próximo turno parte daqui."
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
   "; nenhuma surpresa, e volto na próxima hora.",
   "; nenhuma surpresa, e os números ficam no histórico.",
   "; nenhuma surpresa, e sigo vigiando.",
   "; nenhuma previsão furou.",
   "; nenhuma previsão furou, e volto na próxima hora.",
   "; nenhuma previsão furou, e os números ficam no histórico.",
   "; nenhuma previsão furou, e sigo vigiando.",
   "; nada pediu pensamento novo.",
   "; nada pediu pensamento novo, e volto na próxima hora.",
   "; nada pediu pensamento novo, e os números ficam no histórico.",
   "; nada pediu pensamento novo, e sigo vigiando.",
   "; tudo dentro do previsto.",
   "; tudo dentro do previsto, e volto na próxima hora.",
   "; tudo dentro do previsto, e os números ficam no histórico.",
   "; tudo dentro do previsto, e sigo vigiando."
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
   "; volta em minutos.",
   "; a vazão depende disso.",
   " no runner público.",
   " no runner público; volta em minutos.",
   " no runner público; a vazão depende disso.",
   ", cada teste com critério congelado.",
   ", cada teste com critério congelado; volta em minutos.",
   ", cada teste com critério congelado; a vazão depende disso.",
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
