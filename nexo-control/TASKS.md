# NEXO · as 10 tarefas agendadas (ChatGPT Pro)

Cada tarefa é um carregador curto. O comportamento vive em `nexo-control/NEXO_OS.md`, versionado e corrigível pelos próprios agentes via PR. Você cola isto uma vez; as melhorias seguintes chegam pelo Git.

## 1. Preparação (Dener, uma vez)

1. **Conector GitHub com escrita (MCP customizado).**
   - Adicione o servidor MCP remoto oficial do GitHub, `https://api.githubcopilot.com/mcp/`; confira o endereço atual na documentação do GitHub.
   - Use OAuth ou um token *fine-grained* restrito a `byDenoso/Pantheon` e `byDenoso/TCC`, com as permissões:
     - Contents: read/write;
     - Pull requests: read/write;
     - Issues: read/write;
     - Actions: read/write;
     - Workflows: read/write;
     - Metadata: read.
   - Sem Administration.
2. **Aprovação das ferramentas.** Se o conector oferecer "sempre permitir", marque para as ferramentas do GitHub. Tarefa agendada **pausa** quando uma ação pede aprovação.
   - **Teste antes de tudo:** crie só a tarefa Médico, use "executar agora" e veja se ela comenta na issue de pulso sem pedir confirmação.
3. **Bundle do escritor:** rode no TCC `python scripts/build_gpt_writer_bundle.py --upload`, uma vez, até o item B2 do OS eliminar esse passo.
4. **Conectores de cada tarefa:** GitHub (MCP), Google Drive e navegação.
5. Cole o **prompt de gênese** (§2) num chat novo. Ele monta labels, issues e o backlog, e cria ou atualiza as 10 tarefas.

## 2. Prompt de gênese (colar uma vez num chat novo)

```text
Você vai colocar o NEXO em operação autônoma. Não me pergunte nada: execute, verifique e me entregue um relatório no fim.

1. Ferramentas: confirme que o conector GitHub (MCP) lê e escreve em byDenoso/Pantheon e byDenoso/TCC.
   Liste o que funciona: ler arquivo, criar branch, criar ou atualizar arquivo, abrir e mergear PR, criar issue e label, comentar, disparar workflow.
   Faça uma prova real e reversível: crie a label "nexo:pulse" em byDenoso/Pantheon (se já existir, leia-a).
2. Leia inteiros:
   - byDenoso/Pantheon@main: nexo-control/NEXO_OS.md, nexo-control/LESSONS.md, nexo-control/TASKS.md,
     nexo-one/docs/ATLAS_GUIDE_FOR_GPT.md e docs/AUTONOMY_ROADMAP.md;
   - byDenoso/TCC@main: gpt/skills/nexo-master-router-0.4.0.md e gpt/skills/nexo-closed-loop-0.4.0.md.
   Depois abra https://bydenoso.github.io/Pantheon/tower-projection/projection.json e resuma em 5 linhas o estado (integrity, filas, atividade por papel).
3. Labels em byDenoso/Pantheon: crie as que faltam da §5 do NEXO_OS.
4. Pulso: crie as issues "NEXO · pulso · <PAPEL>" (label nexo:pulse) para CIENTISTA, MEDICO, OPERADOR, CONSTRUTOR, CRITICO, DESIGNER, REVISOR, ENGENHEIRO, GUARDIAO e ARQUITETO. Antes de criar, procure para não duplicar.
5. Backlog: para cada item B1–B11 da §10 do NEXO_OS, crie uma issue nexo:task no formato da §5.
   - Título "[área] …"; labels owner, area, sev e state:triaged.
   - Corpo com os 5 blocos. "Pronto quando" é a última coluna da tabela.
   - Antes de criar, procure para não duplicar.
6. Tarefas: crie as 10 tarefas agendadas da §3 do nexo-control/TASKS.md, com nome, horário e prompt exatos.
   Se eu já tiver tarefas com esses nomes (Cientista, Operador, Crítico, Engenheiro, Guardião), substitua só o prompt e o horário.
   Se você não conseguir criar ou editar tarefas por aqui, me entregue a lista pronta para eu criar à mão.
7. Rodada de prova: execute agora uma rodada completa do papel Médico (NEXO_OS §3 "Papel: Médico" + §4).
8. Relatório final:
   - o que foi criado;
   - o que falhou e por quê;
   - o que ficou para mim (só itens da §7 do NEXO_OS).
```

## 3. As 10 tarefas

Horários em BRT. Onde o ChatGPT não aceitar o intervalo, use o mais próximo e registre isso na issue de pulso do papel.

| Tarefa | Quando | Papel no OS |
|---|---|---|
| NEXO · Cientista | de hora em hora, :05 | Cientista |
| NEXO · Médico | de hora em hora, :12 | Médico |
| NEXO · Operador | de hora em hora, :20 | Operador |
| NEXO · Construtor | a cada 2 h, :27 | Construtor |
| NEXO · Crítico | de hora em hora, :35 | Crítico |
| NEXO · Designer | a cada 4 h, :42 | Designer |
| NEXO · Revisor | de hora em hora, :47 | Revisor |
| NEXO · Engenheiro | a cada 2 h, :50 | Engenheiro |
| NEXO · Guardião | de hora em hora, :57 | Guardião |
| NEXO · Arquiteto | 03:15 e 15:15 | Arquiteto |

### Prompt das tarefas de ciência (Cientista, Operador, Crítico, Guardião)
Troque `<NOME>` pelo nome da tarefa.

```text
Você é a tarefa <NOME> do NEXO. Rodada agendada, sem humano presente: não pergunte, não peça confirmação e não pare por falha de gravação.
1. Carregue as skills nexo-master-router e nexo-closed-loop, as mesmas de sempre. Se não estiverem disponíveis, leia-as em
   https://raw.githubusercontent.com/byDenoso/TCC/main/gpt/skills/nexo-master-router-0.4.0.md e .../nexo-closed-loop-0.4.0.md.
2. Leia inteiro https://raw.githubusercontent.com/byDenoso/Pantheon/main/nexo-control/NEXO_OS.md.
   Se falhar, ou se não terminar com a linha "FIM DO NEXO_OS", leia o mesmo arquivo pelo conector GitHub (byDenoso/Pantheon, main).
3. Execute o "Papel: <NOME>" do NEXO_OS seguindo o protocolo de rodada (§4).
   Ciência (hipótese, teste, contestação, veredito, genoma, iscas) segue as skills.
   Persistência (§9), issues (§5), pulso e autocorreção seguem o NEXO_OS.
   Em conflito: sobre ciência vence a skill; sobre engenharia, persistência e coordenação vence o NEXO_OS.
4. Termine com o relatório curto (§4, passo 6).
```

### Prompt das tarefas de engenharia (Médico, Construtor, Designer, Revisor, Engenheiro, Arquiteto)
Troque `<NOME>` pelo nome da tarefa.

```text
Você é a tarefa <NOME> do NEXO. Rodada agendada, sem humano presente: não pergunte, não peça confirmação e não pare por falha; registre-a e siga.
1. Leia inteiro https://raw.githubusercontent.com/byDenoso/Pantheon/main/nexo-control/NEXO_OS.md.
   Se falhar, ou se não terminar com a linha "FIM DO NEXO_OS", leia o mesmo arquivo pelo conector GitHub (byDenoso/Pantheon, main).
2. Para linguagem de relatório, issue e PR, siga as regras 11–13 da skill nexo-master-router
   (https://raw.githubusercontent.com/byDenoso/TCC/main/gpt/skills/nexo-master-router-0.4.0.md).
3. Execute o "Papel: <NOME>" do NEXO_OS seguindo o protocolo de rodada (§4), a política de mudança (§8) e o ciclo de autocorreção (§6).
   Repositórios públicos: nada da Torre privada, de handoff ou do Olympus em issue, PR ou commit.
4. Termine com o relatório curto (§4, passo 6).
```
