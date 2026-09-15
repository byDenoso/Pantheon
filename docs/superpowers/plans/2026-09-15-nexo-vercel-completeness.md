# Plano executado — completude do Atlas no Vercel

## Objetivo

Remover a entrada intermediária vazia, corrigir o transporte do cliente Vercel, expor a cobertura real dos dados e permitir que o usuário personalize a superfície inicial e camadas do workspace.

## Implementação

1. Diagnosticar as rotas e chamadas da aplicação publicada.
2. Corrigir `createApi` same-origin com `fetchImpl` e snapshot estático como fallback.
3. Fazer `/` resolver para Grafos e ajustar o smoke test do Pages.
4. Criar preferências locais persistentes para entrada, Pesquisa, Operação e Aprendizado.
5. Criar modelo e painel de completude no Cockpit, separando publicado, vazio, indisponível e não publicado.
6. Rodar suíte completa, typecheck, build e readback no Vercel.

## Regras preservadas

- Nenhum número científico novo foi inventado.
- Ausências reais continuam explícitas e trazem orientação sem fingir disponibilidade.
- A UI permanece somente leitura para dados canônicos; apenas preferências locais são editáveis.
- O caminho estático do GitHub Pages continua com seu contrato de fallback.
