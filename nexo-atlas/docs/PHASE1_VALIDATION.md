# Fase 1 — validação local

## Identificação e alcance

Os resultados abaixo referem-se ao código do commit `d8cc1458e2fb8502fb528403351daa2da8e37d04`, compilado localmente. A versão publicada do site pode ser outra. A medição não comprova que este código tenha sido publicado.

| Pacote local | Configuração | SHA-256 do `index.html` | SHA-256 do JavaScript principal |
| --- | --- | --- | --- |
| Snapshot | Catálogo estático, sem seleção LIVE configurada | `a37e8dae2359b080b1e19a3d0a7b79ffd9e4e568cb2d938d04c1c1c4fe044ba6` | `ec2c9fed7fdc2ac043f2bd90f0d5a1115405a5704657d2eeeee2c120c663d9a0` |
| LIVE | Catálogo estático e seleção pública do Cockpit configurada | `6a2ddc521188435653940db95ca636ad599b82aa9190ddf15f99a64056d8a067` | `0023a905283dc2e8333614fd814e55b01bf528ec8c53c38fbdea61cbb63a2f24` |

O SHA-256 do catálogo público é `4ab5330770a09bd32c02911193039bbcc38c5210381a0f9de7c6aaaa3bbc04a3` em ambos os pacotes. São hashes de arquivos da aplicação, não de uma leitura privada da Tower.

## Desempenho e acessibilidade

Lighthouse 13.6.0, Chrome headless, simulação móvel e servidor Vite local com gzip. As medições abaixo usam o pacote snapshot; tempos são de laboratório e não estimam a experiência em uma rede ou dispositivo específicos. Ordem das categorias: desempenho, acessibilidade, boas práticas e SEO.

| Página | Execução | Pontuações | LCP | TBT | CLS |
| --- | --- | --- | --- | --- | --- |
| Estudo de faixas de supernovas | 1 | 94 / 100 / 96 / 100 | 3,026 s | 0 ms | 0,00028 |
| Estudo de faixas de supernovas | 2 | 95 / 100 / 96 / 100 | 2,863 s | 4 ms | 0,00028 |
| Estudo de faixas de supernovas | 3 | 95 / 100 / 96 / 100 | 2,863 s | 6 ms | 0,00028 |
| Inicial | 1 | 100 / 100 / 96 / 100 | 1,054 s | 33 ms | 0 |

O estudo alcançou mediana 95 e oscilou entre 94 e 95. O limiar não foi atingido em todas as execuções. A página inicial teve uma execução nesta medição final.

Uma comparação anterior, com três execuções alternadas por versão e página, registrou mediana de LCP do estudo de 3,173 s na base para 3,013 s no candidato então compilado. A página inicial marcou 100 em todas as seis execuções. Esse candidato anterior ainda não incluía todas as alterações do commit identificado acima; a comparação mostra o efeito observado naquele par de pacotes e não substitui a medição final. O teste de CPU local comparou 169 registros com 72 figuras: a mediana da associação passou de 11,8 ms para 1,7 ms em 30 execuções, com os mesmos vínculos. O resultado depende da máquina e da amostra.

O axe-core verificou automaticamente início, `/claims/` e uma página de estudo em dois temas e duas larguras, totalizando 12 combinações, sem violações reportadas nas regras executadas. Busca, retorno e reutilização do catálogo pré-carregado também passaram no navegador. Após identificar que a mensagem de recuperação varia conforme o idioma, o teste foi repetido com preferência explícita em português e com recuperação verificada também em inglês. Uma varredura automatizada não comprova conformidade integral de acessibilidade.

## Dados e fluxos

- Com o pacote LIVE local, o navegador usou a origem `https://nexoresearch.org`, enquanto os arquivos do site foram interceptados e servidos pelo pacote local. A seleção pública real respondeu HTTP 200 com CORS para essa origem; a interface exibiu 20 perguntas e 169 análises, e o estudo observado ficou disponível sem erro de página. O teste não demonstra publicação do pacote local no domínio.
- Testes de seleção cobriram leitura paralela, espera pela seleção, resposta indisponível, cancelamento, revogação e equivalência de figuras pelos quatro campos completos. Nenhuma inferência de publicação ou resultado científico foi acrescentada pelo teste de desempenho.
- O teste de interface privada usou somente dados sintéticos e passou em português e inglês, nos temas claro e escuro e em larguras de desktop e celular emuladas, incluindo entrada, saída e indisponibilidade da origem. Ele não valida dados privados reais nem substitui o readback autenticado do ambiente publicado.
- O Cockpit também passou no navegador com servidor de desenvolvimento, instalação limpa e respostas sintéticas, incluindo origem parcial, coleção vazia, sessão revogada e falha de rede. A entrada foi adicionada à descoberta inicial de dependências após uma reprodução do erro de inicialização com cache frio.
- `npm run check` de `nexo-atlas`: 572 testes aprovados no Windows. A verificação de `nexo-one` foi executada em cópia isolada com dependências do lockfile: 1.316 testes aprovados, um ignorado e zero falhas; o build privado gerou 115 arquivos. O teste ignorado por ausência do repositório de runtime no primeiro ambiente passou depois em execução focal com esse repositório disponível e dados sintéticos. A suíte completa não foi repetida nessa segunda configuração.

A procedência e as condições para exibir versões científicas estão em [PUBLIC_RESULT_REGISTRY.md](PUBLIC_RESULT_REGISTRY.md). Ausência de fonte pública aprovada para uma versão continua representada como ausência, sem criação de histórico, DOI ou resultado.
