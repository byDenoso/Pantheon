# Handoff: campos de WORK na projeção pública da Tower

Para quem mantém a Tower e as automações (GPT, `byDenoso/TCC/scripts/build_public_projection.py`).
Este documento descreve o contrato. O NEXO ONE lê esses campos e nunca os infere.

## 1. Campos novos por item em `projection.work[]` (todos opcionais)

| Campo | Tipo | Quando preencher | Onde aparece no NEXO ONE |
|---|---|---|---|
| `blocked_since` | ISO-8601 (ou `blocked_at`) | Ao entrar em `BLOCKED` ou `WAIT_DEPENDENCY`. Manter a data original enquanto o item continuar parado. | Operação → linha do WORK: "Bloqueado desde … · há N d" |
| `blocker` | string curta | Motivo do bloqueio (o que falta, de quem depende). | Mesma linha, ao lado da data |
| `automation_eligible` | boolean (ou `automation.eligible`) | `true` quando a automação do NEXO consegue resolver sem o Dener; `false` quando exige mão humana. Omitir = não avaliado. | Chip "NEXO resolve" / "Manual" / "Automação ?" e filtro **NEXO pode resolver** |
| `automation_reason` | string (ou `automation.reason`) | Por que é ou não é elegível (capability/runtime que resolve, ou o que impede). | Tooltip do chip |

Exemplo:

```json
{
  "id": "WORK::SCI-UNIFIED-DARK-SECTOR-COUPLING-DISCRIMINANT-20260911",
  "status": "BLOCKED",
  "priority": "CRITICAL",
  "domain": "SCIENCE",
  "blocked_since": "2026-09-18T14:02:00Z",
  "blocker": "aguardando chain MCMC do DESI DR2",
  "automation_eligible": true,
  "automation_reason": "capability cosmo-engine + runtime local cobrem a re-execução"
}
```

Regras:
- `human_gate` (em `human_gates.work_ids`) continua vencendo: se o item tem human gate, a UI mostra "Exige você" independente de `automation_eligible`.
- Só marque `automation_eligible: true` se existir capability + runtime que executam o item. Palpite não conta.
- Datas sem timezone são rejeitadas silenciosamente: sempre em UTC com `Z`.

`scripts/build-pages-system.mjs` (`projectedWorkNode`) copia os campos sem reinterpretar. Enquanto a Tower não os publicar, a UI mostra "data não publicada pela Tower" e "Automação ?".

## 2. Execuções (aba Operação → Execução vazia)

A tela fica vazia porque a projeção pública não traz nenhum `ExecutionRun`. Para ela ter conteúdo, a automação precisa registrar cada execução seguindo o fluxo
`ACTION → CAPABILITY → RUNTIME → EFFECT → READBACK` e a projeção precisa publicá-la. A UI não fabrica execuções a partir de WORK.

## 3. Gramática visual da Galáxia (para gerar eventos coerentes)

Gerados por `server/compiler/galaxy-v1.mjs`. Cada tipo tem silhueta própria:

| Evento | Significado | Glifo |
|---|---|---|
| `SUPERNOVA` | precisa do Dener agora (human gate, importância ≥ 0.9) | estrela de 4 pontas laranja + ondas de choque |
| `NOVA` | atenção, menor | estrela âmbar + anel |
| `AGN` | campanha científica rodando no domínio | núcleo com jatos bipolares, ciano |
| `HII` | muitos testes novos/READY num subdomínio | nuvem rosa tracejada |
| `REMNANT` | resolvido desde o último snapshot | anel verde partido |
| `FLARE` | item novo desde o último snapshot | cruz branca pequena |

As cores dos domínios (`DOMAIN_TINTS` em `src/viewmodels/galaxy-morphology.mjs`) não mudaram. A galáxia só reduziu a mistura do tint nas estrelas (0.4 → 0.14).
