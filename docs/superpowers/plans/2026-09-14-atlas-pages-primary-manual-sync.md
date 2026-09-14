# Implementação: Pages-primary + sync manual

1. Congelar regressões com testes de contrato:
   - nenhum `PrivateGate`/`LoginPage` no shell público;
   - Laboratório e Atividade renderizam diretamente;
   - `vercel.json` sem cron;
   - Pages é o deploy principal e o deploy Vercel do frontend não roda automaticamente;
   - origem `https://bydenoso.github.io` é aceita pela leitura pública do NEXO One.
2. Remover gates públicos no `App.tsx` e aposentar arquivos de login sem consumidores.
3. Promover o workflow Pages e retirar agendamento/produção automática do frontend Vercel.
4. Implementar cliente de sync live com fallback estático e regra fail-closed.
5. Liberar CORS somente para o GitHub Pages na rota pública sanitizada do NEXO One.
6. Corrigir qualquer regressão encontrada por CI.
7. Validar build, typecheck, testes e browser smoke.
8. Mergear e confirmar readback no Pages. Se a ponte live continuar sem credencial Google, deixar o produto publicado com snapshot estático e estado de sync `DEGRADED`, registrando o único blocker externo restante em vez de fingir atualização.