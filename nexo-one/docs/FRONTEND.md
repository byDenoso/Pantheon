# NEXO ONE + Atlas · arquitetura de frontend

Esta fase entrega **apenas frontend**. Nenhuma integração real foi criada: não há OAuth, secret,
acesso a Google/GitHub/Vercel, chamada a automação, scheduler, banco ou escrita. O estado do sistema
vem de fixtures determinísticas atrás de uma interface de adapter.

## Planos

A interface tem dois planos, visíveis na navegação:

| Plano | Origem | Estado |
| --- | --- | --- |
| **SISTEMA** — Overview, Human Inbox, Actions, Execution, TruthGraph, Capabilities, Sources, Integrity, Atlas, Learning | `SystemDataSource` (fixtures) | novo nesta fase |
| **PESSOAL** — Now, Loops, Day, Context, Recall | `/api/world` no servidor já publicado | preservado, não reescrito |

O plano PESSOAL continua consumindo o backend real que já existia. Ele foi movido de `App.tsx` para
`features/PersonalCockpit.tsx` sem mudança de comportamento.

## Fluxo de dados

```
DataSource -> Adapter -> Contract -> ViewModel -> UI
```

Nenhum componente conhece a origem dos dados. Todos dependem de `SystemState`.

```
src/
├── contracts/
│   ├── world.ts        contrato do cockpit pessoal (já existia)
│   └── system.ts       ProjectionEnvelope, TruthFinding, ActionRecord, Capability,
│                       ExecutionRun, ProjectionBus, GraphNode/Edge, Filament, SystemState
├── data/
│   ├── adapters/
│   │   ├── source.ts   interface SystemDataSource + validação de fronteira
│   │   ├── fixture.ts  adapter ativo
│   │   ├── remote.ts   PONTO DE INTEGRAÇÃO ÚNICO (ver abaixo)
│   │   └── index.ts    activeSource
│   ├── fixtures/
│   │   ├── build.ts       entidades base + fingerprint determinístico
│   │   ├── graph.ts       grafo derivado do MESMO estado do cockpit
│   │   └── scenarios.ts   os dez cenários obrigatórios
│   └── useSystem.ts    hook: LoadState + troca de cenário
├── viewmodels/         derivações puras, sem React e sem rede
├── components/         primitivos e compostos reutilizáveis
├── features/system/    as dez superfícies
└── app/                shell, navegação, Command Bar, sessão
```

## Invariantes que a interface sustenta

Cada uma tem teste próprio em `test/frontend.test.mjs`.

1. **Nenhuma projeção é autoritativa.** `ProjectionEnvelope.authoritative` é o literal `false`, e a
   validação de fronteira rejeita qualquer payload que se declare autoritativo.
2. **Nada aparece sem proveniência.** `source_ref`, `fingerprint`, `freshness` e `derivation_rule`
   são obrigatórios; qualquer estado importante abre um painel de proveniência.
3. **O pior estado vence.** O estado global nunca é uma média otimista dos componentes.
4. **`UNVERIFIED` não é funcionalidade parcial.** Ele compartilha o tom visual de `UNKNOWN` — nunca o
   de `PASS` nem o de "meio funcionando".
5. **Ausência de leitura não vira zero.** `MISSING_PROVIDER` usa freshness `UNKNOWN` e é exibido como
   desconhecido, não vazio.
6. **`STALE` nunca é silencioso.** A leitura anterior continua visível, sempre rotulada.
7. **Efeito sem readback não conta como aplicado.** `readback: FAILED` mantém a ação fora de
   `APPLIED` e gera achado em Integrity.
8. **Erro nunca vira skeleton eterno.** `Surface` resolve loading, erro, não autorizado e vazio de
   forma explícita.
9. **O frontend não executa escrita.** A Command Bar recusa verbos de escrita e as telas dizem isso.

## Pontos exatos de integração

Só um arquivo precisa mudar: **`src/data/adapters/remote.ts`**.

1. Publicar `GET /api/system` respondendo `SystemState` v1. A composição acontece no servidor, que já
   detém as credenciais; o browser nunca vê secret.
2. Trocar `activeSource` em `src/data/adapters/index.ts` de `fixtureSource` para `remoteSource`.
3. `assertSystemState()` já rejeita payload fora do contrato. Nenhuma validação precisa ser duplicada.

Responsabilidade por seção do contrato:

| Campo | Origem real esperada |
| --- | --- |
| `providers[]` | health de cada provider (`server/adapters/registry.mjs`) |
| `capabilities[]` | registro de capability: declaração + evidência de execução |
| `findings[]` | comparação provider esperado × observado |
| `actions[]` | `ACTION_REGISTER` |
| `runs[]` | execuções e recibos |
| `inbox[]` | human gates abertos no `ACTION_REGISTER` |
| `envelopes[]` / `bus` | Universal Projection Bus |
| `graph` | Graph Contract V1 do Atlas |
| `filaments[]` | Semantic / Procedural Memory |

## Cenários de fixture

Selecionáveis na faixa `FIXTURES` no topo da interface:

`all-live` · `olympus-conflict` (base) · `github-unverified` · `provider-missing` · `source-stale`
· `projection-degraded` · `readback-failed` · `no-op-applied` · `waiting-side-quest` · `human-decision`

## Verificação

```bash
npm run check        # typecheck + 65 testes + build
npm run test:browser # desktop/mobile, claro/escuro e uma captura por cenário
```

O teste de browser exige um servidor em `http://127.0.0.1:4173` (`npm run preview`) e o Playwright
disponível — como antes, via `PLAYWRIGHT_MODULE` ou instalado no ambiente de CI.
