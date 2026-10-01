"""Generate the 120x120 narration matrix from bounded, factual receipt summaries.

The UI calls a family only for a received event or an explicit snapshot count.
It keeps the actual actor, timestamp, entity link and original board/thought text.
No phrase promises dispatch, repairs, supervision-free execution or consciousness.
"""
import itertools
import json
import pathlib

MATRIX_SIZE = 120
E = {
    'SEMANTIC_BACKFILLED': ['Registrei a descrição semântica de %q', 'Publiquei a atualização semântica de %q', 'Atualizei a apresentação registrada de %q'],
    'TEST_ENRICHED': ['Registrei o enriquecimento da ficha de %q', 'Publiquei uma atualização da ficha de %q', 'Atualizei os campos registrados de %q'],
    'LEARNING_SIGNAL_RECORDED': ['Registrei um sinal de aprendizagem', 'Publiquei um sinal de aprendizagem', 'Anotei uma lacuna no registro de aprendizagem'],
    'TEST_DISPATCHED': ['Registrei o despacho de %q', 'Publiquei o despacho de %q', 'Enviei %q para a etapa de execução'],
    'TEST_RESULT_RECORDED': ['Registrei o resultado de %q', 'Publiquei o resultado da execução de %q', 'Recebi o resultado registrado de %q'],
    'ROADMAP_TEST_FROZEN': ['Registrei o pré-registro de %q', 'Publiquei o contrato congelado de %q', 'Congelei o critério registrado de %q'],
    'RESULT_CONTESTED': ['Registrei a contestação de %q', 'Publiquei uma contestação vinculada a %q', 'Abri a revisão por contestação de %q'],
    'RESULT_REFEREE1_PASSED': ['Registrei a passagem de %q no primeiro árbitro', 'Publiquei a primeira revisão aprovada de %q', 'Anotei o primeiro parecer favorável de %q'],
    'RESULT_REFUTED': ['Registrei a refutação de %q', 'Publiquei a refutação pela revisão de %q', 'Anotei o resultado refutado na revisão de %q'],
    'RESULT_CONFIRMED': ['Registrei a confirmação de %q', 'Publiquei a confirmação pela revisão de %q', 'Anotei o resultado confirmado na revisão de %q'],
    'HYPOTHESIS_UPSERTED': ['Registrei a hipótese %q', 'Publiquei a hipótese %q', 'Atualizei o registro da hipótese %q'],
    'INTEGRITY_REPORT_RECORDED': ['Registrei um relatório de integridade', 'Publiquei uma auditoria de integridade', 'Anotei uma verificação de integridade'],
    'NEXO_THOUGHT_RECORDED': ['Registrei um pensamento da Pítia', 'Publiquei uma entrada no diário da Pítia', 'Anotei uma síntese no diário publicado'],
    'NEXO_THOUGHT_NOOP_RECORDED': ['Registrei a revisão sem pensamento novo publicado', 'Publiquei uma entrada de revisão sem novo pensamento', 'Anotei a passagem de revisão sem nova entrada de pensamento'],
    'TEST_BATTERY_DISPATCHED': ['Registrei o despacho de uma bateria', 'Publiquei o despacho de um lote de testes', 'Enviei uma bateria para a etapa de execução'],
    'GENOME_MUTATION_PROPOSED': ['Registrei uma proposta de mudança de regra', 'Publiquei uma proposta de procedimento', 'Anotei uma mutação proposta no registro'],
    'ROADMAP_CHARTERED': ['Registrei a carta aprovada de uma frente', 'Publiquei um roadmap com carta registrada', 'Anotei a carta de uma frente de pesquisa'],
    'BOARD_POSTED': ['Registrei um recado no mural', 'Publiquei uma mensagem de coordenação', 'Deixei uma mensagem no mural publicado'],
    'SELF_FOCUS': ['{title}: {n} eventos recebidos no recorte de até 24 h', 'O recorte inclui {n} eventos em {title}', 'Há {n} eventos recebidos vinculados a {title}'],
    'SELF_IGNORED': ['{title}: {n} testes na fronteira, sem evento dessa frente no recorte', 'A fronteira de {title} tem {n} testes; o recorte não traz evento dela', 'Há {n} testes na fronteira de {title}, sem evento correspondente recebido'],
    'SELF_BLOCKED': ['{title}: {n} testes com bloqueio publicado', 'Há {n} bloqueios registrados em {title}', 'O snapshot de {title} contém {n} testes bloqueados'],
    'SELF_DECOY_CAUGHT': ['O registro de iscas mostra {n} identificadas entre {m} reveladas', 'Foram registradas {n} iscas identificadas em {m} reveladas', 'Das {m} iscas reveladas no snapshot, {n} constam como identificadas'],
    'SELF_DECOY_PLANTED': ['O snapshot declara {n} iscas plantadas', 'Há {n} iscas plantadas no registro publicado', 'O registro de integridade contém {n} iscas plantadas'],
    'SELF_GATE': ['Há {n} decisões no portão do Dener', 'O snapshot declara {n} decisões aguardando o Dener', '{n} decisões publicadas dependem do Dener'],
    'AWAY_OPEN': ['Desde a leitura anterior', 'No intervalo desde a última visita', 'Desde o snapshot da sua visita anterior'],
    'GROUP_SEMANTIC_BACKFILLED': ['Registrei {n} atualizações semânticas', 'Publiquei {n} eventos de atualização semântica', 'Anotei {n} atualizações de descrição'],
    'GROUP_TEST_ENRICHED': ['Registrei {n} enriquecimentos de ficha', 'Publiquei {n} atualizações de ficha', 'Anotei {n} eventos de enriquecimento'],
    'GROUP_LEARNING_SIGNAL_RECORDED': ['Registrei {n} sinais de aprendizagem', 'Publiquei {n} eventos de aprendizagem', 'Anotei {n} sinais no registro de aprendizagem'],
    'GROUP_TEST_DISPATCHED': ['Registrei {n} despachos de teste', 'Publiquei {n} eventos de despacho', 'Anotei {n} envios para execução'],
    'GROUP_ROADMAP_TEST_FROZEN': ['Registrei {n} contratos congelados', 'Publiquei {n} eventos de pré-registro', 'Anotei {n} congelamentos de critério'],
    'GROUP_INTEGRITY_REPORT_RECORDED': ['Registrei {n} auditorias de integridade', 'Publiquei {n} relatórios de integridade', 'Anotei {n} verificações de integridade'],
    'GROUP_NEXO_THOUGHT_NOOP_RECORDED': ['Registrei {n} revisões sem novo pensamento publicado', 'Publiquei {n} eventos de revisão sem novo pensamento', 'Anotei {n} passagens de revisão sem novo pensamento'],
}

# All variants preserve the same narrow fact. Qualifiers refer to the received
# export, never to the full window or to a new action that has not happened.
PREFIXES = [
    '', 'No registro,', 'Nesta leitura,', 'No snapshot,', 'No recorte,',
    'Na projeção,', 'No histórico recebido,', 'Na leitura publicada,',
    'No registro recebido,', 'Neste snapshot,', 'Neste recorte,',
    'Nesta projeção,', 'No histórico publicado,', 'No resumo recebido,',
    'Na consulta,', 'No registro disponível,', 'Nesta consulta,',
    'No resumo do registro,', 'Na leitura do histórico,', 'No estado recebido,',
    'Na apresentação do registro,', 'No recorte publicado,', 'No registro consultado,',
    'Na projeção recebida,', 'No resumo publicado,', 'Na leitura disponível,',
    'Na consulta do registro,', 'No histórico consultado,', 'Neste resumo,',
    'No conteúdo recebido,', 'Nesta apresentação,', 'Na leitura do snapshot,',
    'Neste registro,', 'No resumo do snapshot,', 'Na consulta publicada,',
    'Nesta leitura do registro,', 'No resumo da projeção,', 'No estado publicado,',
    'Na leitura deste recorte,', 'No conteúdo publicado,',
]
TAIL_FACTS = [
    '', '; os detalhes pertencem ao registro', '; consulte os campos publicados',
    '; o escopo é o da fonte recebida', '; a leitura preserva o rótulo publicado',
    '; o texto resume o registro', '; a descrição segue o evento recebido',
    '; o resumo se limita à publicação', '; os campos ausentes permanecem ausentes',
    '; a leitura depende da fonte', '; a interpretação exige o contexto do registro',
    '; o resumo acompanha o snapshot',
]
TAIL_SCOPES = ['', ' nesta leitura', ' neste snapshot', ' neste recorte',
               ' nesta consulta', ' nesta projeção', ' no histórico recebido',
               ' no registro publicado', ' na consulta atual', ' na leitura recebida',
               ' no recorte publicado']


def unique(values):
    return list(dict.fromkeys(values))


def lower_first(value):
    return value if value.startswith(('%q', '{')) else value[:1].lower() + value[1:]


out = {}
for event, cores in E.items():
    heads = [f'{prefix} {lower_first(core)}'.strip() if prefix else core
             for prefix, core in itertools.product(PREFIXES, cores)]
    # Scope suffixes are never appended to an empty fragment.
    tails = ['.'] + [f'{fact}{scope}.' for fact, scope in itertools.product(TAIL_FACTS[1:], TAIL_SCOPES)]
    matrix = {'heads': unique(heads)[:MATRIX_SIZE], 'tails': unique(tails)[:MATRIX_SIZE]}
    assert len(matrix['heads']) == len(matrix['tails']) == MATRIX_SIZE, event
    out[event] = matrix

path = pathlib.Path(__file__).resolve().parents[1] / 'src/features/lab/narration.ts'
header = '// Generated by scripts/gen_narration.py: factual 120x120 receipt summaries.\n'
header += f'export const NARRATION_MATRIX_SIZE = {MATRIX_SIZE};\n'
# Share the neutral tail axis and expand only 120 heads at import. This retains
# real array axes while avoiding half a megabyte of duplicated source strings.
header += 'const prefixes: string[] = ' + json.dumps(PREFIXES, ensure_ascii=False) + ';\n'
header += 'const tails: string[] = ' + json.dumps(next(iter(out.values()))['tails'], ensure_ascii=False) + ';\n'
header += 'const cores: Record<string, string[]> = ' + json.dumps(E, ensure_ascii=False, indent=1) + ';\n'
header += "const lowerFirst = (value: string) => /^[%{]/.test(value) ? value : value.charAt(0).toLowerCase() + value.slice(1);\n"
header += "export const NARRATION: Record<string, { heads: string[]; tails: string[] }> = Object.fromEntries(Object.entries(cores).map(([event, lines]) => [event, { heads: [...new Set(prefixes.flatMap(prefix => lines.map(line => prefix ? prefix + ' ' + lowerFirst(line) : line)))].slice(0, NARRATION_MATRIX_SIZE), tails }]));\n"
path.write_text(header, encoding='utf-8', newline='\n')
print(f'{len(out)} families; {MATRIX_SIZE}x{MATRIX_SIZE}; {len(out) * MATRIX_SIZE ** 2} combinations')
