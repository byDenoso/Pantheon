# NEXO · experiência visual

**Objetivo:** melhorar o Atlas público e as interfaces privadas existentes com 3D, movimento, leitura de dados e navegação.

**Arquitetura:** Atlas público continua em `nexo-atlas` (Pages); Cockpit e workspace privados continuam em `nexo-one` (Vercel). Mudanças de apresentação usam somente os registros já fornecidos pelos leitores existentes. Autenticação, publicação editorial e fonte científica mantêm seus contratos.

**Decisões:** azul profundo e ciano; aparência clara continua selecionável; Three.js + React Three Fiber com shader original e geometria produzida em Worker; GSAP existente respeita pausa; Motion nas interações; Observable Plot com tabela acessível e quantidades da leitura. Rive e glTF serão ativos locais quando a compilação puder ser verificada, sem serviço pago. Ilustrações são identificadas como conceituais.

**Alternativas consideradas:** acumular efeitos em todos os painéis prejudicaria leitura e desempenho; migrar as duas aplicações ampliaria o escopo. A implementação mantém as interfaces e concentra 3D na apresentação, movimento nas transições e gráficos nos dados.

- [ ] Validar a contagem temporal e a geometria determinística antes de integrar os componentes.
- [ ] Implementar cena pública responsiva, com pausa, redução de movimento e alternativa em SVG.
- [ ] Implementar gráficos privados com intervalos explícitos e distinguir registros de resultados científicos.
- [ ] Melhorar navegação, contraste, estados de carregamento e telas pequenas.
- [ ] Executar tipos, testes, builds, inspeção no navegador e revisão do diff.
- [ ] Publicar somente o código de interface testado e verificar os destinos; registrar limite da inspeção privada sem sessão autenticada.

**Validação:** cenas sem WebGL devem manter conteúdo e controles úteis; pausas devem suspender o laço de renderização; gráficos excluem datas inválidas/futuras e não inventam cobertura; logout destrói dados privados; bundles públicos nunca carregam registros privados. Rollback usa o commit anterior e o deployment de produção verificado.
