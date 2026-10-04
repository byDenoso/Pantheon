# Atlas — contrato atual e referência histórica

O frontend atual é `nexo-one/`, publicado em https://nexo-one-two.vercel.app/. O código em `atlas-control-tower/` mantém adapters e rotas de compatibilidade ainda consumidos por testes e integrações existentes. Não deve receber uma segunda implantação de frontend.

Autoridade operacional: Tower viva no Drive, sob Writer único com CAS e readback. O Atlas e o MCP público leem sua projeção sanitizada; caches, Git e Neon não recebem autoridade operacional. A migração SQLite permanece em ensaio até uma virada validada.

Leia `../README.md`, `../../nexo-one/README.md` e `../../nexo-one/data/canonical.json` para o contrato atual. A declaração anterior de Neon como projeção operacional viva e a sincronização a cada 12 horas pertencem à arquitetura histórica e não orientam o sistema atual.
