# ATLAS (NEXO ONE) — guia para o GPT

Site: https://bydenoso.github.io/Pantheon/ (GitHub Pages, repo público `byDenoso/Pantheon`, pasta `nexo-one/`).
Cópia com API: https://nexo-one-two.vercel.app (Vercel, projeto `nexo-one`, mesma pasta).
Stack: React + TypeScript + Vite; Three.js na galáxia; Node ESM no servidor (`nexo-one/server`).

## 1. De onde vêm os dados (nunca editar dado à mão no site)
Tower (Drive, privada) → projeção pública (TCC `runtime/nexo_agent_api/public_projection.py`, inclui `evolution`)
→ build do Pages (`.github/workflows/nexo-one-pages.yml`, a cada push em `nexo-one/**`, por `repository_dispatch` da projeção e por `workflow_dispatch`; o agendamento horário é apenas recuperação):
- `scripts/build-pages-system.mjs` → `dist/system.json` (SystemState: inbox, lanes, graph, guardian, **evolution**).
- `scripts/build-galaxy-snapshot.mjs` + `server/compiler/galaxy-v1.mjs` → `dist/galaxy/latest.json` (entidades, braços, eventos).
O front só lê `system.json` e `galaxy/latest.json`. Mudou regra de dado → mude a projeção (TCC) ou os builders, não o React.
Enquanto o ATLAS fica aberto, `useSystem.ts` consulta o `build-meta.json` leve a cada 20 s e só relê o `system.json` quando o fingerprint publicado muda. A Galáxia acompanha esse mesmo fingerprint e relê `galaxy/latest.json` com readback sem cache e retry curto até os dois artefatos pertencerem à mesma publicação.

## 2a. Observatório (padrão desde 2026-09-28)
Rotas `#/agora #/ciclo #/roadmaps #/roadmap/<id> #/evidencia[?v=VEREDITO] #/e/<id> #/saude` (`src/features/lab/`).
- `ObservatoryScene.tsx`: teia cósmica WebGL (Three.js) fixa atrás de todas as páginas. Domínio = região/halo; hipótese = nó; teste = estrela no filamento, cor+pulso pelo veredito; clicar abre `#/e/<id>`; câmera muda por página.
- `model.ts`: índice único de entidades (testes, hipóteses, campanhas, roadmaps) a partir do `system.json`. Contestações ligadas pelo id `CONTEST-<alvo>-<n>`.
- `LabApp.tsx`: páginas em HUD (coluna de leitura à esquerda, teia à direita; no celular teia em cima).
- Veredito sempre com glifo + palavra (✓ ✕ ◐ ● ○ ▨ –), nunca só cor.
- Campos que faltam na projeção: `docs/FRONTEND_DATA_CONTRACT_V2.md`.
As telas antigas (Início/Operação/Prova/Mapa) seguem acessíveis em Saúde → Detalhes técnicos.

## 2. Telas e componentes que importam
| Tela | Arquivo | O que mostra |
|---|---|---|
| Início | `src/app/App.tsx` (hero `StarfieldCanvas`) + `src/features/system/Overview.tsx` | céu com os domínios (sem GPT_PERFORMANCE: é Engenharia), faixa do Guardião, **EvolutionPanel** |
| Ciclo fechado | `src/features/system/EvolutionPanel.tsx` | diário da Pítia (sem preâmbulo, 1ª pessoa, com refs), Portão do Dener (cartas/canaries, objetivos, “Campanha permanente”), Resultados sob refutação (“só confirma quem sobrevive a 2 contestações”), Iscas (plantadas/detectadas), roadmaps com pergunta, quantas confirmações faltam e trilhas separadas de confirmações/testes usados |
| Galáxia | `src/atlas3d/GalaxyView.tsx`, `src/components/GalaxyThree3D.tsx/.css` | espiral por domínio; eventos astrofísicos; painel com breadcrumb semântico, pergunta/resultado primeiro, ação e detalhes técnicos recolhíveis |
| Ciência | `src/features/ScienceWorkspace.tsx(.css)` | campanhas/testes/hipóteses; no celular vira cartões e esconde campos vazios (`data-blank`) |
| Operação | `src/features/system/Operations.tsx` | fila antiga de WORK (herança); “Exigem você” conta human gates |

## 3. Regras de design já decididas pelo Dener
- Paleta Deep Field (JWST). Fundo de página: nebulosas + estrelas fixas no escuro; “carta celeste” (pastéis + pontos de tinta) no claro (`src/styles/editorial.css`, `body::before`).
- Galáxia: brilho padrão Médio (presets 0.32/0.48/0.66, chave `nexo.galaxy.glow.v2`); celular renderiza até 2.5× pixel ratio com antialias.
- Eventos realistas, sem crachá (nome só no hover/foco):
  - **Supernova** = decisão esperando o Dener (carta ou canary). Ponto branco-quente, halo radial, raios de difração, blend `screen`. Fica no **braço do domínio** da decisão (cosmologia → SCIENCE, NEXO → ENGINEERING, Olympus → OLYMPUS), espaçada ao longo do braço. Some quando o Dener decide.
  - **AGN** = testes rodando no domínio (inclui baterias no GitHub Actions). Núcleo compacto, disco inclinado, jatos finos.
  - H II = muitos testes prontos; SNR = resolvido; Flare = novidade.
- Painel do evento mostra a **pergunta em linguagem simples** (`plain`) e o **resultado** (`meaning`) do item.
- Nunca nome de pessoa do Olympus no site: sigla de 3 letras.
- Texto em português simples, sem jargão sem explicação.

## 4. Contagens que o build confere (senão o deploy falha)
`nexo-one-pages.yml` compara: WORK total, bloqueados, aguardando, e **inbox = human gates + itens do portão** (cartas/canaries).
Se mudar o que entra no inbox, atualize essa conferência junto.

## 5. Como mudar algo no front (processo)
1. Branch ou commit direto em `main` com mudança pequena; `npx tsc --noEmit -p .` e `npm test` em `nexo-one` (há ~8 falhas antigas conhecidas; não aumente o número).
2. Push → Pages reconstrói (5 min). Confira o site no celular e no desktop, tema claro e escuro.
3. Nada de segredo no front; a Vercel guarda `NEXO_INBOX_TOKEN` (portão `/api/inbox-drop`), só servidor usa.

## 6. Conversas, portão e robô (back-end que o front reflete)
- Intenção acionável que nasce numa conversa entra no registro canônico por `nexo.ingest_request` (`REQUEST_INGRESS_V1`), com `thread_id` da conversa e `correlation_id`; a Tower guarda fingerprint, referências de origem e um resumo compacto. Isso incorpora a decisão/trabalho ao sistema sem fingir que a transcrição inteira foi importada. Não contorne o gate humano: decisões de aprovação continuam nascidas numa conversa com o Dener.
- `/api/inbox-drop` (Vercel): se o staging e a gravação direta no inbox do GitHub forem recusados, use `scripts/nexo-submit.mjs` para dividir e enviar o envelope ao **Sheet spool**, que o Writer já lê a cada cinco minutos. O gateway confirma a gravação antes de o agente avançar; esse caminho não precisa da permissão de escrita do conector GitHub.
- **Regra de persistência do Executor:** primeiro salve e releia o envelope no buffer durável, usando o mesmo `stable_id` da rodada. Se as duas tentativas de gravação no GitHub falharem, extraia do buffer somente o envelope, grave-o num arquivo JSON temporário e execute `node scripts/nexo-submit.mjs --file <arquivo> --id <stable_id>`. Só considere concluído quando a saída confirmar `complete: true` e `readback: "PASS"`; se houver recusa, resposta incompleta ou timeout, preserve o buffer e repita com o mesmo ID. Assim outro processo consegue recuperar o resultado mesmo que a conversa termine.
- Para conferir um ID depois, use `node scripts/nexo-submit.mjs --check <stable_id>`. Esse comando consulta o mesmo gateway e confirma a fila durável; não precisa recuperar a conversa.
- O token `NEXO_INBOX_TOKEN` pode ser **read-only** para drenar arquivos legados de `byDenoso/TCC@nexo-inbox`: depois que o Writer aplica um item, o ATLAS registra o ACK no Sheet. Se o token não puder mover/apagar o arquivo, ele fica fisicamente no branch, mas não volta para a fila.
- Writer robô (`.github/workflows/nexo-writer-robot.yml`, a cada 30 min nos minutos 7 e 37 — fora do pico, porque o GitHub descarta agendamentos de 5 min — e imediatamente quando chega proposta ou `nexo-wake/*.json` muda): aplica Sheet spool + inbox legado na Tower, fecha roadmaps no critério de parada, despacha **baterias** (`nexo-test-battery.yml`, até 20 testes em paralelo, sem segredos) e chama o build do site. O workflow do Pages também tem um agendamento horário de recuperação; esse cron não substitui o disparo explícito do Writer nem prova que um papel concluiu seu trabalho.


## 7. Quem roda os papéis (produtor ativo) e fallback em shadow
- `nexo-control/producers.json` (Pantheon): `"active": "GPT"` hoje; `"shadow": "CLAUDE"`.
- O Writer robô lê esse arquivo e passa `NEXO_ACTIVE_PRODUCER` ao `robot` (TCC `gpt_writer.split_by_producer`).
- Propostas com `producer` diferente do ativo são registradas e **nunca aplicadas**. Arquivos `scheduled-*` sem campo contam como GPT.
  Sem `producer` (Dener, conversas, robô) sempre passa. Nunca há dois escritores nem duas verdades.
- Trocar para o Claude: mudar `active` para `CLAUDE` e ativar as tarefas do Claude. Pendente: publicar o writer novo no Drive
  (`TCC/scripts/build_gpt_writer_bundle.py --upload`) e criar as 5 tarefas do Claude desligadas, reaproveitando `TCC/gpt/TASKS_CLOSED_LOOP.md`
  com `"producer": "CLAUDE"`.

## 8. Unificação (plano acordado Claude × GPT)
`TCC/docs/UNIFICATION_PLAN.md`: 1 autoridade, 1 formato de proposta, 1 escritor, 1 compilador de leitura (Python). O site só desenha.
Ordem: invariantes → contrato → inbox → projeção em shadow → site → limpeza → repositório único público.
Auditoria 2026-09-28: TCC já é público; código e histórico sem segredos; nomes reais do Olympus só na Tower privada, site usa sigla de 3 letras.
Automações do GPT rodam por relay agendado (não dependem da cota do Work); o `activity[]` público pode atrasar quando a projeção pública está indisponível.
