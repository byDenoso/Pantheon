# Prévia pública — 4 de novembro de 2026

Capturas locais da interface pública com o catálogo público existente. A largura móvel é emulada; não equivale a um dispositivo físico. As imagens não contêm dados da área privada.

| Tema | Desktop, 1440 px | Móvel emulado, 390 px |
|---|---|---|
| Claro | [Abrir captura](previews-20261104/light-desktop.png) | [Abrir captura](previews-20261104/light-mobile-emulado.png) |
| Escuro | [Abrir captura](previews-20261104/dark-desktop.png) | [Abrir captura](previews-20261104/dark-mobile-emulado.png) |

Em Chrome Headless com Lighthouse 13.6.0 e perfil móvel simulado, uma medição do bundle público após `19352d0` registrou desempenho/acessibilidade/boas práticas/SEO de **100/100/96/100** na página inicial e **93/100/96/100** no estudo; o LCP do estudo foi 3,18 s. O alvo de 95 em desempenho no estudo não foi atingido. A auditoria automatizada não estabelece conformidade completa de acessibilidade.

Uma comparação anterior de três execuções por versão mediu a alteração `fc9851d` → `53b4b64`: a mediana do LCP do estudo caiu de 3,330 s para 3,175 s, com a página inicial em aproximadamente 1,054 s nas duas versões. Essa comparação não mede exatamente o commit posterior de correção de busca. Os resultados são locais e simulados, não dados de campo.

O registro público não dispõe de histórico científico versionado nem de fonte estruturada para preencher versões; essa lacuna permanece explícita em [PUBLIC_RESULT_REGISTRY.md](PUBLIC_RESULT_REGISTRY.md). A leitura autenticada da Tower e os hashes da fonte não são validados por estas capturas.
