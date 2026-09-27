# Bloco de persistência do Executor (AUT-002/003)

Cole o bloco abaixo, sem alterar, no prompt da tarefa agendada **Executor** do ChatGPT,
substituindo qualquer instrução anterior sobre "onde salvar o resultado".
Os outros papéis (Guardião, Pítia, Learner, Refutador) podem usar o mesmo bloco.

Agentes com terminal (Claude, Codex, runner local) fazem o mesmo com
`node scripts/nexo-submit.mjs --enqueue …` e `--drain` (ver `ATLAS_GUIDE_FOR_GPT.md` §6).

---

```text
PERSISTÊNCIA — REGRA FIXA (não pule passos, não mude a ordem)

Cada resultado tem um stable_id no formato [a-z0-9-], 4 a 60 caracteres (ex.: executor-batch-<hash>).
O mesmo resultado usa sempre o mesmo stable_id, inclusive em novas tentativas.

A. INÍCIO DE CADA RODADA — DRENAR PENDENTES
1. Leia o buffer durável NEXO_EXECUTOR_BUFFER. É um arquivo só de acréscimo: nunca edite nem apague linhas.
2. Para cada linha "PENDENTE <stable_id>" que ainda não tenha uma linha "ATERRADO <stable_id>" depois dela:
   a. Abra https://nexo-one-two.vercel.app/api/inbox-drop?id=<stable_id>&check=1
      Se a resposta tiver "complete": true e "readback": "PASS", acrescente "ATERRADO <stable_id>" e siga para o próximo.
   b. Se não, abra https://raw.githubusercontent.com/byDenoso/TCC/nexo/dispatch-runtime/nexo_persist/requests/<stable_id>.json
      Se existir, o resultado está no relay, que entrega em cerca de 8 s. NÃO reenvie. Repita o passo (a) no fim da rodada.
   c. Se não estiver em nenhum dos dois, reenvie pelo passo C com o mesmo stable_id e o envelope da linha PENDENTE.
3. Só depois disso escolha trabalho novo.

B. ANTES DE QUALQUER TENTATIVA DE STAGING
4. Acrescente ao buffer uma linha: PENDENTE <stable_id> <envelope JSON numa única linha>.
5. Releia o buffer e confirme que a linha está lá. Isso vale como a escrita durável: sem ela, não tente staging.

C. PERSISTIR — em ordem, parando na primeira que confirmar
6. Staging GitHub: crie nexo_persist/requests/<stable_id>.json na branch nexo/dispatch-runtime de byDenoso/TCC,
   com {"stable_id": "<stable_id>", "envelope": <envelope>}.
7. Se recusado: crie inbox/scheduled-<stable_id>.json na branch nexo-inbox de byDenoso/TCC com o envelope.
8. Se recusado: use o gateway sem conector. Codifique o envelope em base64url (sem "="), divida em partes de no máximo
   6000 caracteres (no máximo 40 partes) e abra em ordem, i = 1..n:
   https://nexo-one-two.vercel.app/api/inbox-drop?id=<stable_id>&i=<i>&n=<n>&d=<parte>
   Só vale se a última resposta trouxer "complete": true e "readback": "PASS".
9. Confirme sempre com o link de check do passo 2a. Com PASS, acrescente "ATERRADO <stable_id>" ao buffer.
   Uma gravação sem esse PASS não conta como persistida.

D. SE TUDO FOR RECUSADO
10. Não encerre em silêncio. Termine a rodada com o status PERSISTENCIA_PENDENTE e inclua, no fim da resposta:
    ```nexo-pending
    <stable_id>
    <envelope JSON>
    ```
    Se o buffer (passo 4) também tiver sido recusado, diga isso explicitamente: o envelope só existe nesta conversa.
    Nunca invente um stable_id novo para o mesmo resultado.
```

---

## Por que esta ordem

- **O buffer vem antes do staging.** A falha observada em `executor-batch-a16f378b7263cb04`, em 2026-09-27, deixou o envelope só no chat.
  Com a linha PENDENTE gravada antes, a rodada seguinte recupera o envelope sem depender da conversa.
- **A drenagem deduplica em três lugares.** O `check` do gateway cobre `inbox/` e `processed/` do nexo-inbox.
  O raw da `dispatch-runtime` cobre o que ainda está no relay. Por isso uma nova tentativa nunca duplica um resultado.
- **Limite atual, que depende do Dener.** O passo 8 devolve `502 GITHUB_403` enquanto o `NEXO_INBOX_TOKEN` da Vercel
  não tiver escrita em `byDenoso/TCC`. Até lá, os passos 6 e 7 continuam sendo os caminhos que gravam, e o bloco D
  garante que nada se perde em silêncio.
