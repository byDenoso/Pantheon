# ATLAS (NEXO ONE) — guia para o GPT

Site: https://bydenoso.github.io/Pantheon/ (GitHub Pages, repo público `byDenoso/Pantheon`, pasta `nexo-one/`).
Cópia com API: https://nexo-one-two.vercel.app (Vercel, projeto `nexo-one`, mesma pasta).
Stack: React + TypeScript + Vite; Three.js na galáxia; Node ESM no servidor (`nexo-one/server`).

## 1. De onde vêm os dados (nunca editar dado à mão no site)
Tower (Drive, privada) → projeção pública (TCC `runtime/nexo_agent_api/public_projection.py`, inclui `evolution`)
→ build do Pages (`.github/workflows/nexo-one-pages.yml`, a cada 15 min e a cada push em `nexo-one/**`):
- `scripts/build-pages-system.mjs` → `dist/system.json` (SystemState: inbox, lanes, graph, guardian, **evolution**).
- `scripts/build-galaxy-snapshot.mjs` + `server/compiler/galaxy-v1.mjs` → `dist/galaxy/latest.json` (entidades, braços, eventos).
O front só lê `system.json` e `galaxy/latest.json`. Mudou regra de dado → mude a projeção (TCC) ou os builders, não o React.

## 2. Telas e componentes que importam
| Tela | Arquivo | O que mostra |
|---|---|---|
| Início | `src/app/App.tsx` (hero `StarfieldCanvas`) + `src/features/system/Overview.tsx` | céu com os domínios (sem GPT_PERFORMANCE: é Engenharia), faixa do Guardião, **EvolutionPanel** |
| Ciclo fechado | `src/features/system/EvolutionPanel.tsx` | diário da Pítia (sem preâmbulo, 1ª pessoa, com refs), Portão do Dener (cartas/canaries, objetivos, “Campanha permanente”), Resultados sob refutação (“só confirma quem sobrevive a 2 contestações”), Iscas (plantadas/detectadas), roadmaps (pergunta da carta, barra de confirmados + trilha de testes usados) |
| Galáxia | `src/atlas3d/GalaxyView.tsx`, `src/components/GalaxyThree3D.tsx/.css` | espiral por domínio; eventos astrofísicos |
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

## 6. Portão e robô (back-end que o front reflete)
- `/api/inbox-drop` (Vercel): tarefa abre link → proposta vai para `byDenoso/TCC@nexo-inbox`.
- Writer robô (`.github/workflows/nexo-writer-robot.yml`, 15 min): aplica inbox (Drive NEXO_INBOX + portão) na Tower, fecha roadmaps no critério de parada, despacha **baterias** (`nexo-test-battery.yml`, até 20 testes em paralelo, sem segredos) e dispara o build do site.
