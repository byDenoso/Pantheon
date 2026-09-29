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

OPENERS = ["Nesta rodada,", "Agora há pouco,", "Sem alarde,", "Como combinado,", "Mais uma vez,", "Sem esperar ninguém,",
           "Enquanto o resto rodava,", "Antes de seguir,", "Na mesma rodada,", "Com calma,", "No meu turno,", "Seguindo a fila,",
           "Como sempre,", "Para não perder o fio,", "Sem pular etapa,", "Ainda agora,", "No ritmo de sempre,",
           "Entre uma bateria e outra,", "Por conta própria,", "Sem ninguém pedir,"]
GENERIC_TAILS = [". Sigo.", ". Próximo.", ". Registrado.", ". Está no histórico.", ". O robô leva daqui.", ". Leio de volta e sigo.",
                 ". Um passo a mais.", ". Sem cerimônia.", ". Faz parte do ciclo.", ". Anotado com hora.", ". Está na ficha para conferir.",
                 ". Trabalho feito.", ". Uma coisa a menos na fila.", ". De volta à fila.", ". Deixo rastro de tudo.",
                 ". Continua no próximo turno.", ". Checado.", ". Nenhum atalho.", ". Assim anda.", ". Segue o jogo.", ". Fica o registro.",
                 ". Conferido duas vezes.", ". E vamos adiante.", ". O resto é com os números.", ". Tudo auditável.", ". Mais um ciclo.",
                 ". Método antes de opinião.", ". A fila anda.", ". Ninguém precisou apertar botão.", ". Sem pressa, sem parar.",
                 ". Anoto e sigo.", ". O próximo turno pega daqui.", ". Nada fica solto.", ". Vale para o mapa.", ". Tudo lido de volta.",
                 ". Pronto por ora.", ". Com hora e dono.", ". Sem ruído.", ". Deixo o caminho limpo.", ". Registro feito.", ". Sem enrolação.", ". O dia segue.", ". Vou atrás.", ". Fica anotado.", ". Tudo na conta."]

# Outros monólogos: {title}, {n}, {m} são trocados em tempo de execução.
E.update({
 "SELF_FOCUS": (["Minha atenção está em {title}: {n} ações em 24 h", "Estou mergulhado em {title}: {n} ações em 24 h", "Quase tudo que fiz hoje foi em {title}: {n} ações",
                 "{title} ocupou meu dia: {n} ações", "Foco em {title}, com {n} ações em 24 h", "O centro do meu trabalho é {title}: {n} ações"], ["."]),
 "SELF_IGNORED": (["Estou deixando de lado {title}, com {n} testes esperando", "{title} ficou para trás: {n} testes na fila", "Não toquei em {title} hoje, e há {n} testes esperando",
                   "{title} espera minha vez: {n} testes", "Devo uma rodada a {title}: {n} testes parados"], ["."]),
 "SELF_DECOY_CAUGHT": (["Plantei iscas contra mim mesmo: peguei {n} de {m}", "Das {m} iscas reveladas, desconfiei de {n}", "Me testei com iscas: {n} de {m} pegas",
                        "Acertei {n} das {m} armadilhas que eu mesmo plantei"], ["."]),
 "SELF_DECOY_PLANTED": (["Há {n} isca(s) plantada(s) contra mim; ainda não sei qual", "Existe(m) {n} armadilha(s) escondida(s) no meu próprio histórico", "Tenho {n} isca(s) para achar entre meus resultados",
                         "Algum resultado meu pode ser isca: {n} plantada(s)"], ["."]),
 "SELF_GATE": (["Estou esperando o Dener decidir {n} coisa(s) que não posso decidir sozinho", "{n} decisão(ões) aguarda(m) o Dener", "Parei em {n} portão(ões) que só o Dener abre",
                "Tem {n} escolha(s) na mesa do Dener"], ["."]),
 "AWAY_OPEN": (["Enquanto você esteve fora", "Desde a sua última visita", "Nesse meio-tempo", "Da última vez para cá", "Enquanto você cuidava da vida",
                "Nas horas em que você não olhou", "Sem você por perto", "Desde que você saiu", "No intervalo", "Enquanto isso"], [""]),
 "GROUP_SEMANTIC_BACKFILLED": (["Dei nome e leitura simples a {n} testes", "Traduzi {n} fichas para português", "Arrumei o nome de {n} testes"], ["."]),
 "GROUP_TEST_ENRICHED": (["Completei a ficha de {n} testes", "Preenchi o que faltava em {n} testes", "Deixei {n} testes prontos para rodar"], ["."]),
 "GROUP_LEARNING_SIGNAL_RECORDED": (["Anotei {n} lacunas para resolver", "Registrei {n} pedidos de receita ou dado", "Marquei {n} buracos no caminho"], ["."]),
 "GROUP_TEST_DISPATCHED": (["Mandei {n} testes para a bateria", "Coloquei {n} testes para rodar", "Soltei {n} testes no runner"], ["."]),
 "GROUP_ROADMAP_TEST_FROZEN": (["Congelei as regras de {n} testes antes de olhar os dados", "Travei o critério de {n} testes", "Pré-registrei {n} testes"], ["."]),
 "GROUP_INTEGRITY_REPORT_RECORDED": (["Fiz {n} auditorias seguidas; nada quebrou entre elas", "{n} rondas de saúde sem incidente", "Conferi o sistema {n} vezes"], ["."]),
 "GROUP_NEXO_THOUGHT_NOOP_RECORDED": (["{n} passadas pelos resultados sem nada fora do previsto", "Olhei {n} vezes e nada pediu atenção", "{n} varreduras quietas"], ["."]),
})


def lower_first(t):
    return t if t.startswith(("%q", "{")) else t[0].lower() + t[1:]


random.seed(20260929)
out = {}
for ev, (cores, own_tails) in E.items():
    openers = [] if ev.startswith(("SELF_", "AWAY_")) else OPENERS  # estado do sistema não combina com "por conta própria"
    heads = cores + [f"{o} {lower_first(c)}" for o in openers for c in cores]
    random.shuffle(heads)
    heads = cores + [h for h in heads if h not in cores][:45 - len(cores)]
    tails = own_tails if ev.startswith("AWAY_") else own_tails + [t for t in GENERIC_TAILS if t not in own_tails]
    out[ev] = {"heads": heads[:45], "tails": tails[:45]}

NL = chr(10)
ts = "// Gerado por nexo-one/scripts/gen_narration.py (NEXO): matriz cabeça x cauda por evento, sorteada a cada linha." + NL
ts += "export const NARRATION: Record<string, { heads: string[]; tails: string[] }> = " + json.dumps(out, ensure_ascii=False, indent=1) + ";" + NL
open(__import__("pathlib").Path(__file__).resolve().parents[1] / "src/features/lab/narration.ts", "w", encoding="utf-8", newline=NL).write(ts)
print({k: (len(v["heads"]), len(v["tails"])) for k, v in out.items()})
