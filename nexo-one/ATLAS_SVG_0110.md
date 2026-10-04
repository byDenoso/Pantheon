# Atlas 01/10 — prévia vetorial e dinâmica ilustrativa

Entrega local de 04/10/2026, sem publicação. Branch `atlas/0110-performance-20261004`.

## Base e escopo

O visual recuperado é o commit `4e27af44f01281ae0d780503936cc2a29cb4c023`, de 01/10 às 23:41 em Brasília. O redesign posterior permanece na worktree separada `20261004-atlas-svg`.

O Observatório, Galaxy, Metro 2D/3D, navegação, textos, cartões e painéis são desenhados em SVG. Three.js fornece a câmera e a projeção. HTML semântico permanece como camada de interação, edição de campos e acessibilidade; nenhum `foreignObject` é usado. A conversão conserva layout, tipografia e paleta históricos, com diferenças de rasterização, brilho e sombras em relação ao WebGL/CSS anterior. Não é uma reprodução pixel a pixel.

Os quatro arquivos públicos de dados são idênticos aos usados no benchmark histórico. SHA256, tamanho e data de escrita local estão em `output/galaxy-performance/local-assets-readback.json`. A data local não comprova atualização contínua da Tower. Não houve alteração da autoridade Tower/Writer, autenticação ou fontes privadas. Esta worktree histórica não incorpora automaticamente todos os aprimoramentos de backend da worktree posterior; reconciliar isso antes de qualquer publicação.

## Física na teia do Observatório

`src/features/lab/cosmicDynamics.ts` implementa um **TOY_MODEL** em coordenadas e tempo gráficos:

- Fundo plano ΛCDM, Ωm=0,315, ΩΛ=0,685, H0 visual=0,0008; Λ constante.
- `H(a)=H0 sqrt(Ωm/a³+ΩΛ)` e `a¨=H0² a(ΩΛ−Ωm/(2a³))`.
- Atração local de traçadores para a âncora de domínio mais próxima, suavizada por distância; amortecimento `2Hv` e velocidade limitada.
- Pesos visuais iguais entre âncoras; contagens, resultados e veredictos da Tower não são massas físicas.
- Integração do fundo em passos fixos de 1/60 s; posições a 10 Hz; intervalo de quadro limitado a 50 ms.
- Fator a limitado a [0,5;1,2]; expansão gráfica limitada a 14%; coordenadas limitadas a ±40 unidades gráficas.
- Página oculta, pausa e movimento reduzido congelam a dinâmica. “Rever formação” restaura posições e relógio.
- Os buffers modificados alimentam desenho e seleção na mesma geometria. Resultados científicos não são modificados pelo movimento.

É uma emulação visual limitada, sem solver de relatividade geral, auto-gravidade N-body, massas observadas ou inferência cosmológica. A espiral Galaxy conserva sua dinâmica histórica; o fundo ΛCDM atua na teia do Observatório.

Referências de interpretação: [NASA LAMBDA](https://lambda.gsfc.nasa.gov/resources/graphic_history/) e [ESA — formação de estruturas](https://www.esa.int/Science_Exploration/Space_Science/Planck/History_of_cosmic_structure_formation). Os parâmetros acima são escolhas ilustrativas do código.

## Otimizações e correções

Projeção numérica com matrizes em cache; pontos agrupados por cor/opacidade em caminhos; reaproveitamento de elementos SVG; descarte de conteúdo fora da tela; atualização de rótulos sem reconstruir o painel; detalhes móveis reduzidos. Corrigidos dois ciclos de trabalho desnecessário: transições reiniciadas durante a captura dos estilos e RAF duplicado após arrastar a câmera. O tempo do desenho agora é em segundos, compartilhado com o relógio animado.

G6 5.1.1 e @antv/g-svg 2.1.1 compartilham o runtime g-lite. Mapa e minimapa são vetoriais. O encerramento desativa tarefas atrasadas do minimapa antes de destruir seu contexto. A mudança de `view` na URL atualiza o modo sem recarregar o documento.

Na faixa intermediária de tela, metadados do cabeçalho são compactados e a indicação de domínio fica abaixo dele, corrigindo sobreposição sem trocar a identidade visual. A teia acompanha mudanças de preferência de movimento reduzido durante a sessão, além de respeitar o valor inicial.

## Validação

- `npm run check`: **557/557**, tipos, estilo e build passaram. Log `output/final-check.log`.
- Matriz SVG: **54 combinações**, nove páginas × dois temas × desktop/tablet/celular; sem canvas visível, sem foreignObject, sem overflow horizontal e sem erro não tratado. Log `output/tower-svg-browser.log` e JSON `output/galaxy-performance/tower-svg-browser.json`.
- Interações: movimento reduzido congela os caminhos reais; exploração, zoom, recentralização, replay, busca e página de entidade funcionam; Galaxy→2D→3D funciona; cena viva evolui. Log `output/tower-svg-interactions.log`.
- Cinco testes físicos cobrem sinais de aceleração, atração ligada/desligada, efeito de Λ, congelamento, reset e estabilidade prolongada.
- `npm run test:browser` legado: **falhou** porque espera o antigo Overview “Estado atual” na entrada. A versão histórica já abre Agora. Não foi marcado como aprovado nem apagado; log `output/legacy-browser.log`. Sua cobertura de cenários legados continua pendente de atualização proporcional.
- Aviso de bundle G6: aproximadamente 1,14 MB minificado / 327,5 kB gzip. É dependência dinâmica do modo 2D.
- Revisão independente somente leitura não encontrou blocker científico ou de teardown; apontou a leitura estática de movimento reduzido, corrigida com listener e teste de mudança durante a sessão. A limpeza do minimapa depende de detalhes internos da versão G6 fixada; manter a regressão de troca rápida de modo ao atualizar essa dependência.

## Desempenho medido e limite

Edge headless, 1440×960, servidor de desenvolvimento, três repetições. Medianas em **ms de trabalho por segundo**, sem medição de tempo de GPU ou promessa de FPS:

| Versão | CPU em RAF parada | CPU em RAF orbitando | Tarefas totais parada | Tarefas totais orbitando |
|---|---:|---:|---:|---:|
| Visual original WebGL | 26,97 | 28,59 | 130,53 | 141,77 |
| Primeira conversão SVG | 711,60 | 721,35 | 996,68 | 993,26 |
| SVG otimizado atual | 32,63 | 135,96 | 183,20 | 315,73 |

A otimização reduz em cerca de 95% a CPU em RAF parada e 81% orbitando frente à primeira conversão SVG. **Ainda há regressão de custo de CPU frente ao WebGL histórico, principalmente na órbita.** Não há evidência de aceleração universal; essa limitação permanece aberta. O servidor da baseline histórica também registrou bloqueio de alguns arquivos de fontes por sua allowlist de caminhos; a comparação não é um teste de fidelidade tipográfica nem um benchmark definitivo de produção. Arquivos: `baseline-settled.json`, `svg-galaxy-only.json`, `svg-release.json` em `output/galaxy-performance/`.

## Prévia, reprodução e reversão

Prévia: `http://127.0.0.1:4185/#/agora`. Para explorar, clicar “Explorar a teia”.

No diretório deste pacote, `npm run preview:atlas-0110` lê os arquivos públicos atuais e inicia a prévia; nenhuma escrita externa. A opção exige rede. As capturas desktop/celular, claro/escuro estão em `output/galaxy-performance/svg-*.png`.

Diff local revisável, sem commit/push/merge/deploy. Reversão: voltar à worktree original, preservada. Antes de publicação: revisão visual humana, reconciliação do backend mais recente e decisão sobre o custo da órbita vetorial.
