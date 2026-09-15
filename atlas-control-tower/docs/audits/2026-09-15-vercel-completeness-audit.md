# Auditoria de completude — NEXO Atlas / Vercel

## Escopo

Auditoria das superfícies públicas do deployment `nexo-atlas-control-tower.vercel.app`: entrada, Grafos, Pesquisa, Laboratório e Cockpit, além do caminho de dados e dos estados de ausência.

## Pontos cegos encontrados

| Área | Sintoma observado | Causa | Tratamento |
| --- | --- | --- | --- |
| Entrada `/` | Landing mínima com links Mapa/Pesquisa/Entrar | A rota raiz resolvia para `landing` | A raiz agora abre o workspace de Grafos diretamente |
| Grafos `/mapa` | `Failed to fetch`, `0 / 0 nós` | O cliente Vercel construía `createApi` sem o `fetchImpl`; o runtime caía no adaptador local | Fetch same-origin explícito com fallback para snapshot estático |
| Cockpit | Métricas `—` e fontes indisponíveis sem visão agregada | Não havia uma leitura de cobertura das superfícies | Novo painel de completude com contagens e estados |
| Preferências | Entrada e camadas eram fixas no código | Não havia configuração local do workspace | Drawer editável persistido em `localStorage` |
| Dados ausentes | Alguns painéis distinguiam mal vazio, erro e não publicado | Ausência sem motivo acionável | `PUBLISHED`, `EMPTY`, `DATA_UNAVAILABLE` e `NOT_PUBLISHED` explícitos |

## Fonte e limites

O Atlas continua sendo uma projeção somente leitura. Os valores exibidos vêm dos artefatos publicados pela fonte configurada; quando uma síntese, evidência ou execução não existe no snapshot, a interface informa isso em vez de calcular ou preencher com placeholder enganoso.

Na leitura anterior do Vercel, o endpoint de saúde apontava para `TOWER_V06`, snapshot de 2026-09-14, com fallback preservado e divergência de fingerprint. Essa condição permanece visível como stale/degraded quando a fonte não publica uma projeção nova.

## Critérios de aceite

- `/` entra direto no grafo e respeita a preferência local de superfície inicial.
- `/mapa` não exibe mais o estado técnico `Failed to fetch` quando o runtime HTTP estiver indisponível; usa o snapshot estático publicado.
- Cockpit informa contagens publicadas e lacunas com motivo.
- Preferências de entrada, Pesquisa, Operação e Aprendizado podem ser alteradas dentro do próprio site.
- Suíte de testes, typecheck e build passam antes da publicação.
