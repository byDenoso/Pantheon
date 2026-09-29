"""Gera nexo-one/src/features/lab/narration.ts: até 45 falas por evento, montadas de cabeça x cauda."""
import itertools, json, random

# %q = nome do teste ou hipótese. Cabeças terminam sem pontuação; caudas começam com espaço ou pontuação.
E = {
 "SEMANTIC_BACKFILLED": (["Dei nome e leitura simples a %q", "Traduzi para português %q", "Arrumei a ficha de %q", "Reescrevi a pergunta de %q", "Dei um nome humano a %q", "Deixei %q legível"],
                         [".", " para qualquer pessoa entender.", ", agora dá para ler sem sigla.", "; ninguém precisa decifrar código.", ", do jeito que o site mostra.", " antes que virasse sopa de IDs.", "; clareza também é dado.", ", sem jargão desnecessário."]),
 "TEST_ENRICHED": (["Completei a ficha de %q", "Preenchi o que faltava em %q", "Fechei as lacunas de %q", "Revisei o contrato de %q", "Deixei %q pronto para rodar", "Juntei método e critério em %q"],
                   [".", "; agora ele pode ir para a bateria.", ", com dado e critério no lugar.", "; papelada resolvida na hora.", " sem esperar ninguém.", ", do jeito que o robô aceita.", "; faltava pouco.", " e segui para o próximo."]),
 "LEARNING_SIGNAL_RECORDED": (["Anotei uma lacuna", "Achei um buraco no caminho", "Pedi uma ferramenta que ainda não existe", "Marquei o que está segurando a fila", "Registrei o que falta", "Deixei um pedido para o Engenheiro", "Encontrei um teste sem receita"],
                              [".", " para o dono resolver.", ": receita ou dado que falta.", "; quem pode destravar já sabe.", " e segui com o que dava para fazer.", ", sem parar a fila por isso.", "; vira trabalho na próxima rodada.", " com o motivo escrito."]),
 "TEST_DISPATCHED": (["Mandei para a bateria %q", "Coloquei %q para rodar", "%q saiu da fila", "Liguei a máquina em %q", "Soltei %q no runner", "Despachei %q", "%q entrou em execução"],
                     [".", "; agora é esperar a conta.", ", critério já congelado.", " com dado público e receita fixa.", "; volta em alguns minutos.", " sem ninguém apertar botão.", ", junto com o lote.", "; o robô cuida do resto."]),
 "TEST_RESULT_RECORDED": (["Terminei um teste: %q", "Chegou o resultado de %q", "%q voltou da bateria", "Fechei a conta de %q", "Saiu o veredito de %q", "A bateria devolveu %q"],
                          [".", "; o critério decide, não eu.", ", e ficou registrado.", " com os números na ficha.", "; próximo passo é atacar.", ", sem mexer na trave.", "; mais um tijolo no mapa.", " e o site já mostra."]),
 "ROADMAP_TEST_FROZEN": (["Congelei as regras antes de olhar os dados: %q", "Travei o critério de %q", "Escrevi o que derrubaria %q", "Pré-registrei %q", "Fixei sucesso e kill de %q", "Tranquei a trave de %q"],
                         [".", " antes de ver o resultado.", "; depois disso ninguém mexe.", ", para não me enganar depois.", " com a previsão anotada.", "; o dado decide sozinho.", ", do jeito que a ciência pede.", " e só então liberei a execução."]),
 "RESULT_CONTESTED": (["Não confiei no resultado e abri um ataque: %q", "Fui atrás do ponto fraco de %q", "Coloquei %q à prova", "Duvidei de %q", "Montei o contra-teste de %q", "Ataquei %q", "Resolvi testar %q de novo"],
                      [".", " com outro dado.", "; se for real, aguenta.", ", por outro caminho.", " com critério congelado.", "; resultado bonito demais pede ataque.", " antes de acreditar.", ", trocando a coleção de supernovas."]),
 "RESULT_REFEREE1_PASSED": (["O resultado sobreviveu ao primeiro ataque: %q", "%q aguentou o primeiro golpe", "%q passou pelo contra-teste", "O ataque não derrubou %q", "%q segurou o tranco", "Tentei derrubar %q e não consegui"],
                            [".", "; ficou mais sólido.", ", e sigo desconfiando.", " com outro dado.", "; bom sinal.", ", por enquanto de pé.", " e segue para o próximo teste.", "; ponto para ele."]),
 "RESULT_REFUTED": (["Derrubei uma conclusão minha: %q", "%q caiu no ataque", "Errei em %q", "O contra-teste desmontou %q", "%q não resistiu", "Refutei %q"],
                    [".", " e agora sei onde.", "; errar rápido é o objetivo.", ", e a rival já está na fila.", "; queda também é resultado.", " sem choro, com registro.", ", melhor agora do que num paper.", "; o mapa ficou mais honesto."]),
 "RESULT_CONFIRMED": (["Confirmado depois do ataque independente: %q", "%q resistiu e virou resultado firme", "Outro dado, mesma resposta: %q", "%q passou no teste que podia derrubar", "Fechou: %q"],
                      [".", "; esse fica.", ", com a força que o dado tem.", " com outra coleção de supernovas.", "; entra no mapa.", ", depois de tentar derrubar.", "; replicou.", " e conta para a campanha.", "; agora é base para o próximo."]),
 "HYPOTHESIS_UPSERTED": (["Tive uma ideia nova para testar: %q", "Nova pergunta na mesa: %q", "Abri uma frente nova: %q", "Formulei %q", "Quero saber: %q", "Surgiu uma hipótese: %q", "Pensei em %q"],
                         [".", "; já com o que a derrubaria.", ", nasce com nula e rival.", " para a fila.", "; vamos ver se aguenta.", ", saída de um resultado de ontem.", " e o critério vem junto.", "; se morrer, aprendo."]),
 "INTEGRITY_REPORT_RECORDED": (["Auditei a mim mesmo", "Conferi a saúde do sistema", "Passei o pente-fino", "Medi o quanto estou funcionando sozinho", "Chequei se algum agente parou", "Olhei filas, papéis e robô", "Fiz a ronda"],
                               [".", "; tudo respirando.", ", sem corrupção à vista.", " e registrei os números.", "; se algo travar, eu aviso.", ", conferindo o pior indicador.", " antes da próxima rodada.", "; nenhum papel sumiu."]),
 "NEXO_THOUGHT_RECORDED": (["Parei para pensar", "Uma coisa me chamou atenção", "Anotei uma ideia solta", "Fiquei com uma pergunta", "Vi um padrão", "Registrei um pensamento"],
                           [".", " sobre o que estou vendo.", "; pode virar hipótese.", ", com referência aos testes.", " entre dois resultados.", "; vale voltar nisso.", " enquanto os testes rodam.", ", sem pressa de concluir."]),
 "NEXO_THOUGHT_NOOP_RECORDED": (["Olhei tudo de novo", "Revisei os resultados recentes", "Varri as últimas horas", "Passei pelos resultados", "Conferi as previsões", "Dei uma volta pelo mapa"],
                                ["; nada novo por agora.", "; sem surpresa.", ", nada fora do previsto.", "; quieto por enquanto.", ", tudo dentro do esperado.", "; nada pediu atenção.", ", nenhuma previsão furou.", "; silêncio também é informação."]),
 "TEST_BATTERY_DISPATCHED": (["Mandei uma bateria rodar em paralelo", "Soltei um lote de testes", "Bateria no ar", "Disparei vários testes de uma vez", "Enchi o runner"],
                             [".", "; volta em minutos.", ", cada um com critério congelado.", " sem ninguém apertar botão.", "; o robô coleta sozinho.", ", do jeito que a família pede.", " para não perder tempo.", "; vazão é o jogo.", ", em máquinas públicas."]),
 "GENOME_MUTATION_PROPOSED": (["Propus mudar uma regra de como eu funciono", "Sugeri ajustar meu procedimento", "Quero trocar um gene meu", "Propus um canário para uma regra", "Vi uma regra minha que dá para melhorar", "Coloquei uma regra minha em teste"],
                              [".", "; o Dener decide.", ", com a evidência junto.", " e vou medir contra o atual.", "; se piorar, volta.", ", sem tocar na espinha.", " a partir do meu histórico.", "; aprender também é isso."]),
 "ROADMAP_CHARTERED": (["Recebi uma nova pergunta para investigar", "Uma frente nova de pesquisa foi aberta", "Ganhei um roteiro novo", "Abriu uma campanha nova", "Entrou uma pergunta grande na mesa", "O mapa ganhou uma frente nova"],
                       [".", "; já com orçamento e parada.", ", aprovada pelo Dener.", " para as próximas semanas.", "; a fila vai mudar.", ", com objetivo claro.", " e começo por ela.", "; hora de desenhar testes."]),
     "BOARD_POSTED": (["Deixei um recado no mural", "Chamei outro agente", "Avisei quem destrava", "Escrevi no mural", "Pedi ajuda no mural", "Respondi um recado"],
                      [".", "; coordenação, não evidência.", " com o que falta.", ", para ninguém ficar parado.", "; o dono já sabe.", " em uma linha.", ", com o teste citado.", "; bola passada."]),
}

random.seed(20260929)
out = {}
for ev, (heads, tails) in E.items():
    combos = [h + t for h, t in itertools.product(heads, tails)]
    random.shuffle(combos)
    out[ev] = combos[:45]

ts = "// Gerado por nexo-one/scripts/gen_narration.py (NEXO): até 45 falas por evento, sorteadas a cada linha.\n"
ts += "export const NARRATION: Record<string, string[]> = " + json.dumps(out, ensure_ascii=False, indent=1) + ";\n"
open(r"C:\Users\Dener\Documents\Pantheon-main\nexo-one\src\features\lab\narration.ts", "w", encoding="utf-8", newline="\n").write(ts)
print({k: len(v) for k, v in out.items()})
