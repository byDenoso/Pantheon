# Entradas congeladas de tower_native

Baterias de produção passam `tests[].inputs` em `INPUTS_PATH`, separado de
`PARAMS_PATH`. Isso preserva os parâmetros e critérios científicos existentes.
A receita exige exatamente um snapshot da projeção pública com URL HTTPS,
versão e SHA256 dos bytes transportados; aceita JSON e `format: "json.gz"`.
Prefira URL pública imutável fixada por commit. Mesmo se uma URL mudar, a
verificação do hash impede o uso de novos bytes silenciosamente.

O resultado inclui `statistics.input_provenance` com URL, versão e hash
realmente consumidos. Entrada ausente, hash divergente ou estrutura inválida
falha antes do cálculo. A execução de produção nunca usa fallback ao vivo.
O smoke diário existente, fora de uma bateria e sem `INPUTS_PATH`, continua
sondando o endpoint público; sua proveniência é `LIVE_SMOKE_ONLY` e não é
resultado científico de produção.

## Calibração prospectiva

`prediction_calibration` usa somente previsões que têm
`prereg.prediction.recorded_at` anterior ao relógio público de execução,
probabilidade finita entre zero e um e resultado decidido. `prereg.at`,
`created_at` e o hash do desenho não provam quando a previsão foi registrada.
Ausência de evidência exclui o caso, contabilizado em
`excluded_unverified_predictions`. Não inferir, preencher ou retrodatá-la.
O produtor público deve projetar esse campo apenas de um evento canônico
que registrou aquela mesma previsão antes do resultado.

Nenhum limiar Brier, divisão temporal, corte de observabilidade ou mínimo por
estrato muda. Estrato vazio continua `INCONCLUSIVE/SAMPLE_TOO_SMALL`.
Não disparar uma grade somente para obter contagem de execuções quando a
inspeção das entradas já prova que não há comparação identificável.

Verificação local: `python -m unittest discover -s nexo-one/executor-runtime/tests -p test_tower_native_frozen_inputs.py -v`.
