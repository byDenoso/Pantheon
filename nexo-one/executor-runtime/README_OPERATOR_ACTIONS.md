# Operador: execução no GitHub Actions público

Repositório: `byDenoso/Pantheon`. Workflow existente: `nexo-test-battery.yml`.
O runner recebe somente o pacote público congelado; nenhuma credencial Drive ou
Tower privada entra no job. TCC fornece código/proveniência e o runtime CAMB
quando a receita o exigir, não uma segunda fila científica.

## Executar um TEST autorizado

1. Ler o CONTROL e a elegibilidade do TEST. Usar o binding já aprovado de
   receita, parâmetros, inputs/versionamento/hashes e contrato científico.
   `RECIPE_BINDING_MISSING` continua um reparo necessário do item.
2. Entregar `TEST_BATTERY` ao Writer único com a identidade estável do pedido.
   Conferir recibo e reserva canônica antes de despachar. O Writer resolve
   capacidade e faz um único dispatch após CAS/readback.
3. A rota padrão é `CANONICAL_DRIVE_PACKAGE`. O endpoint autenticado por OIDC
   revalida autorização, mandato, reserva, identidade do run e dados públicos
   antes de liberar o pacote. O plano congela seu hash; cada shard verifica os
   mesmos bytes, o commit da receita e seu hash antes de executar.
4. Acompanhar run/attempt e o recibo do Writer. Falha operacional continua
   separada do resultado científico; revisão independente permanece necessária.
   Resposta incerta ao dispatch exige reconciliação, nunca uma segunda execução
   cega. A fila independente pode continuar enquanto o item aguarda.

`LEGACY_GIT_SPEC` mantém reservas antigas já emitidas pelo Writer. A chamada
legada informa o transporte explicitamente e prende o commit do spec entre
plano e shards. Se faltar somente `recipe_revision`, usa o commit imutável do
workflow e exige correspondência exata com `recipe_sha256`; divergência bloqueia
a execução. A rota legada não substitui uma recusa da rota canônica.

## Verificar o runner sem fazer ciência

PRs e alterações em main nos caminhos do runner executam a fixture fixa
`bat-runner-canary-1`. Também é possível pedir o mesmo canário:

```bash
gh workflow run nexo-test-battery.yml --repo byDenoso/Pantheon --ref main \
  -f transport=CI_CANARY -f battery_id=bat-runner-canary-1
```

`CI_CANARY` sempre seleciona essa fixture versionada, mesmo que outro ID seja
informado. Não consulta Tower, não despacha o Writer e não cria TEST/RUN/RESULT
científico. Valida preparo, dependências, computação sintética e artefato de
recibo no mesmo workflow. Sua aprovação é evidência de software; não ativa
mandato, CONTROL, orçamento ou execução científica.
