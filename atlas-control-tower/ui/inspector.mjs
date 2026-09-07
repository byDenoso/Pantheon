/** Entity, edge and comparison inspector, plus the Learning overlay.
 *  The overlay only shows learning records that cite the entity in their own
 *  `evidence_refs`; it never reclassifies the entity as a learning record. */
import {$, $$, esc, num, toast, confidenceLabel} from './dom.mjs';

let seq = 0;

export function openDrawer() {$('#inspector').hidden = false; $('#close-inspector').focus()}
export function closeDrawer() {$('#inspector').hidden = true; $('#graph')?.focus()}

const TYPE_PT = {
 SYSTEM:'SISTEMA', DOMAIN:'DOMÍNIO', CAMPAIGN:'CAMPANHA', TEST:'TESTE', RESULT:'RESULTADO',
 CLAIM:'HIPÓTESE / CLAIM', HYPOTHESIS:'HIPÓTESE', DECISION_HYPOTHESIS:'HIPÓTESE DE DECISÃO',
 ACTION:'AÇÃO', AUTOMATION_RUN:'EXECUÇÃO', RUNTIME_EVENT:'EVENTO DE RUNTIME',
 LEARNING_RELATION:'REGISTRO DE APRENDIZADO', FILE:'ARQUIVO', ARTIFACT:'ARTEFATO',
 DATASET:'CONJUNTO DE DADOS', PUBLICATION:'PUBLICAÇÃO'
};
const AUTH_PT = {
 SCIENCE_CANONICAL:'CIÊNCIA CANÔNICA', DERIVED_NOT_EVIDENCE:'DERIVADO · NÃO É EVIDÊNCIA',
 CANONICAL:'CANÔNICO', DERIVED:'DERIVADO'
};
const FIELD_PT = {
 entity_type:'Tipo de entidade', source_surface:'Superfície de origem', source_row_key:'Linha / registro de origem',
 current_revision_id:'Revisão atual', priority:'Prioridade', source_ref:'Referência da fonte', branch:'Branch Git',
 schema:'Schema', git_commit:'Commit Git', blocker_reason:'Motivo do bloqueio', current_gate:'Gate atual',
 consumer:'Consumidor', linux_runner:'Runtime / runner Linux', reconciled_at:'Reconciliado em', required_assets:'Ativos necessários',
 source_audit_at:'Auditoria da fonte em', pngb_entrypoints:'Entrypoints pNGB', science_entity_id:'Entidade científica associada',
 legacy_roadmap_ref:'Referência do roadmap legado', source_recovery_at:'Recuperação da fonte em',
 science_revision_id:'Revisão científica', science_truth_owner:'Truth Owner científico', source_audit_result:'Resultado da auditoria da fonte',
 exactkg_archive_sha256:'SHA-256 do pacote exato', exactkg_archive_drive_id:'Pacote exato no Drive',
 remaining_missing_object:'Objeto ainda ausente', pr4_covariance_dtype_rule:'Regra de precisão da covariância PR4',
 exact_pngb_package_drive_id:'Pacote pNGB exato no Drive', likelihood_runtime_source_drive:'Fonte do runtime de likelihood no Drive',
 likelihood_runtime_source_bundle:'Bundle do runtime de likelihood', exact_component_sources_recovered:'Fontes exatas recuperadas',
 action_id:'Ação associada', runtime_env:'Ambiente de execução', artifact_hash:'Hash do artefato',
 readback_verified:'Readback verificado', checkpoint:'Checkpoint', error_class:'Classe do erro', error_layer:'Camada do erro',
 evidence_refs:'Referências de evidência', surprise_cause:'Causa inesperada', capability_refs:'Capacidades utilizadas',
 uncertainty_source:'Fonte da incerteza', learning_disposition:'Tratamento no Learning', tasks:'Tarefas', change_type:'Tipo de mudança',
 tower_state:'Estado da Tower', truth_owner:'Truth Owner', provider_readback:'Readback do provider', source_truth_state_hash:'Hash do estado-fonte',
 tests:'Testes', assets:'Ativos', closure:'Fechamento', sources:'Fontes', batch_id:'ID do lote', test_revisions:'Revisões de teste',
 result_subjects:'Resultados associados', tower_modified_at:'Tower modificada em', d1_parent_resolved:'Pai D1 resolvido',
 campaign_memberships:'Vínculos com campanhas', learning_truth_owner:'Truth Owner do Learning', open_migration_issues:'Issues de migração abertas',
 scientific_truth_owner:'Truth Owner científico', publication_submissions:'Submissões de publicação', unknown_result_subjects:'Resultados sem sujeito conhecido',
 stale_authority_projection_resolved:'Projeção de autoridade obsoleta corrigida', migration:'Migração', pr_number:'Número do PR',
 automations_verified:'Automações verificadas', science_v1_preserved:'science_v1 preservado', tower_readback_verified:'Readback da Tower verificado',
 opsStage:'Camada da Black Box', source:'Fonte', count:'Quantidade', event_type:'Tipo de evento', component:'Componente',
 source_kind:'Tipo de fonte', source_id:'ID da fonte', payload:'Payload técnico', domain:'Domínio', domains:'Domínios',
 evidenceCount:'Evidências', contradictionCount:'Contradições', confidence:'Confiança', derivedFrom:'Derivado de',
 learningStage:'Etapa do Learning', source_surface_id:'ID da superfície de origem'
};
const FIELD_HELP = {
 entity_type:'Classe canônica deste registro no Atlas.',
 source_surface:'Tabela, ledger ou superfície onde o registro foi materializado originalmente.',
 source_row_key:'Localização exata do registro na fonte de origem.',
 current_revision_id:'Revisão atualmente considerada válida para esta entidade.',
 priority:'Ordem relativa de execução ou atenção. Quanto menor o número, maior a prioridade quando o contrato usa ordenação ascendente.',
 source_ref:'Ponte rastreável para o registro, documento, ação ou evidência que originou este item.',
 branch:'Branch do código associado a esta execução ou mudança.',
 schema:'Schema do Neon/Postgres que materializa este estado.',
 git_commit:'Commit exato associado ao estado ou implementação.',
 blocker_reason:'Razão explícita que impede a continuação segura da ação.',
 current_gate:'Gate científico ou operacional atualmente ativo.',
 consumer:'Componente ou agente que consome este registro.',
 linux_runner:'Entrypoint/runtime executável registrado para Linux.',
 required_assets:'Conjunto de ativos necessários para executar o contrato sem substituições.',
 science_entity_id:'Teste, claim ou entidade científica canônica associada.',
 science_revision_id:'Revisão científica exata que sustenta este estado operacional.',
 science_truth_owner:'Fonte autoritativa do estado científico.',
 readback_verified:'Confirma que a escrita/efeito foi relido no destino e correspondeu ao estado esperado.',
 runtime_env:'Ambiente real em que a execução ocorreu.',
 artifact_hash:'Fingerprint do artefato produzido ou usado na execução.',
 checkpoint:'Ponto operacional em que a execução terminou ou foi interrompida.',
 error_class:'Classificação do tipo de falha, usada para decidir retry, correção ou stop/switch.',
 error_layer:'Camada onde o problema ocorreu, por exemplo fonte, runtime ou autoridade.',
 uncertainty_source:'Incerteza residual que ainda impede uma conclusão ou execução equivalente.',
 learning_disposition:'Como o resultado deve ser tratado pelo Learning sem virar evidência científica automaticamente.',
 source_audit_result:'Resultado da auditoria de equivalência/proveniência da fonte.',
 remaining_missing_object:'Objeto específico que ainda falta para fechar o caminho executável.',
 exact_component_sources_recovered:'Indica se as fontes exatas dos componentes requeridos foram recuperadas.',
 opsStage:'Camada operacional da Black Box a que o nó pertence.',
 event_type:'Classe do evento registrado pelo flight recorder.',
 component:'Componente do NEXO responsável pelo evento.',
 source_kind:'Tipo de sistema ou superfície que originou o evento.',
 source_id:'Identificador da fonte de origem.',
 payload:'Dados técnicos preservados para auditoria e reprodução.'
};
const WORD_PT = {
 CLOSED:'Encerrado', FAILED:'Falhou', SATURATED:'Saturado', BLOCKED:'Bloqueado', SUCCESS:'Sucesso', COMPLETED:'Concluído',
 COMPLETE:'Concluído', ACTIVE:'Ativo', OPEN:'Aberto', VALIDATED:'Validado', SUPPORTED:'Suportado', PASS:'Aprovado', READY:'Pronto',
 CANDIDATE:'Candidato', CANARY:'Canário', IMPORTED:'Importado', PARTIAL:'Parcial', PENDING:'Pendente', RETIRED:'Retirado',
 LEGACY:'Legado', UNKNOWN:'Desconhecido', ERROR:'Erro', RECOVERED:'Recuperado', RESOLVED:'Resolvido', OBSERVED:'Observado',
 ESTABLISHED:'Estabelecido', RECONCILED:'Reconciliado', VERIFIED:'Verificado', READBACK:'Readback', MIGRATION:'Migração',
 STRUCTURAL:'Estrutural', CORRECTION:'Correção', SOURCE:'Fonte', CAPABILITY:'Capacidade', GAP:'Lacuna', MATERIAL:'Material'
};

const humanKey = k => FIELD_PT[k] || String(k).replace(/_/g,' ').replace(/\b\w/g,m=>m.toUpperCase());
const entityTypePt = t => TYPE_PT[String(t||'').toUpperCase()] || humanKey(String(t||'ENTIDADE'));
const authorityPt = a => AUTH_PT[String(a||'').toUpperCase()] || humanKey(String(a||'NÃO INFORMADA'));
function statusPt(value='') {
 const raw=String(value||''); if(!raw)return 'Estado não informado';
 return raw.split('_').map(x=>WORD_PT[x]||x.toLowerCase()).join(' · ').replace(/^./,m=>m.toUpperCase());
}
function relationPt(type, outgoing=true) {
 const t=String(type||'').toUpperCase();
 const map={
  CONTAINS:outgoing?'CONTÉM':'PERTENCE A', PRODUCES:outgoing?'PRODUZ':'PRODUZIDO POR',
  EXECUTED_AS:outgoing?'EXECUTADO COMO':'EXECUÇÃO DE', DERIVED_FROM:outgoing?'DERIVA PARA':'DERIVADO DE',
  OBSERVED_AS:outgoing?'OBSERVADO COMO':'OBSERVAÇÃO DE', TESTS:outgoing?'TESTA':'TESTADO POR',
  PART_OF_CAMPAIGN:outgoing?'PERTENCE À CAMPANHA':'CONTÉM TESTE'
 };
 return map[t] || humanKey(t);
}
function prettyValue(v) {
 if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
 if (Array.isArray(v)) return v.length ? v.map(x=>typeof x==='object'?JSON.stringify(x):String(x)).join('\n• ') : 'Nenhum';
 if (v && typeof v === 'object') return JSON.stringify(v, null, 2);
 return String(v ?? '—');
}
function fmtDate(v){if(!v)return 'Sem data';const d=new Date(v);return Number.isNaN(d.valueOf())?String(v):d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}
function metadataRows(shown={}) {
 return Object.entries(shown).filter(([k,v])=>v!==''&&v!==null&&v!==undefined&&k!=='_row').slice(0,60).map(([k,v])=>
  `<div class="metadata-item"><label>${esc(humanKey(k))}</label>${FIELD_HELP[k]?`<small class="micro">${esc(FIELD_HELP[k])}</small>`:''}<p>${esc(prettyValue(v))}</p>${FIELD_PT[k]?`<code class="micro">campo: ${esc(k)}</code>`:''}</div>`).join('');
}
function testOverview(n,d){
 if(String(n.type).toUpperCase()!=='TEST')return '';
 const rel=d.relations||[], produced=rel.filter(e=>e.source===n.id&&String(e.type).toUpperCase()==='PRODUCES').length;
 const campaigns=rel.filter(e=>String(e.type).toUpperCase()==='CONTAINS'&&e.target===n.id&&String(e.source).startsWith('SCI-CAMP')).length;
 return `<div class="detail-section test-overview"><h3>DETALHES DO TESTE</h3>
  <div class="metadata-item"><label>Domínio</label><p>${esc(n.domain||'Não atribuído')}</p></div>
  <div class="metadata-item"><label>Estado interpretado</label><p>${esc(statusPt(n.status))}</p><code class="micro">código: ${esc(n.status||'—')}</code></div>
  <div class="metadata-item"><label>Última atualização</label><p>${esc(fmtDate(n.updatedAt))}</p></div>
  <div class="metadata-item"><label>Resultados associados</label><p>${num(produced)}</p><small class="micro">Relações PRODUCES registradas para este teste.</small></div>
  <div class="metadata-item"><label>Campanhas associadas</label><p>${num(campaigns)}</p></div>
  <div class="metadata-item"><label>Autoridade</label><p>${esc(authorityPt(n.authority))}</p><small class="micro">${esc(n.authority||'')}</small></div>
 </div>`;
}

const sourceBlock = (n, safeUrl) =>
 `<div class="detail-section"><h3>FONTES</h3>${(n.sourceRefs || []).map(r =>
  `<p class="micro">${esc(r.sourceRef || r.source || '')}<br>${r.observedAt?`Observado em ${esc(fmtDate(r.observedAt))}<br>`:''}${safeUrl(r.url) ? `<a href="${esc(r.url)}" target="_blank" rel="noreferrer">Abrir fonte ↗</a>` : ''}</p>`).join('')
  || '<p class="micro">Estrutura de navegação derivada.</p>'}${safeUrl(n.url) ? `<a href="${esc(n.url)}" target="_blank" rel="noreferrer">Abrir fonte ↗</a>` : ''}</div>`;

export function relationRow(r) {
 const scope = r.crossDomain ? `<em class="cross">entre domínios ${esc(r.domainA)} ↔ ${esc(r.domainB)}</em>` : esc(r.scope || 'mesmo domínio');
 return `<div class="learning-row"><b>${esc(r.relationType)}</b><span class="status-chip learning-chip">${esc(statusPt(r.status || 'sem estado'))}</span>
  <p class="micro">${esc(r.nodeA)} → ${esc(r.nodeB)}</p>
  <p class="micro">${scope} · ${esc(confidenceLabel(r.confidence))} · evidência ${num(r.evidenceCount ?? r.support)} / contradição ${num(r.contradictionCount ?? r.contradiction)}</p>
  ${r.notes ? `<p class="micro">${esc(String(r.notes).slice(0, 220))}</p>` : ''}</div>`;
}

async function renderLearningOverlay(api, id) {
 const box = $('#learning-overlay');
 if (!box) return;
 box.innerHTML = '<p class="micro">Lendo aprendizado relacionado…</p>';
 try {
  const {relations} = await api.learningFor(id);
  box.innerHTML = relations.length
   ? relations.map(relationRow).join('')
   : '<p class="micro">Nenhum aprendizado cita esta entidade em evidence_refs. Vínculo ausente na fonte, não inferido aqui.</p>';
 } catch {
  box.innerHTML = '<p class="micro">Aprendizado indisponível no momento.</p>';
 }
}

export function createInspector({api, colors, state, safeUrl, onFocus, onLineage, onRelated}) {
 let pinned = null;

 function compare(n) {
  if (!pinned) {pinned = n; toast('Primeira entidade fixada. Selecione outra e clique em Comparar.'); return}
  const a = pinned; pinned = null;
  $('#detail').innerHTML = `<h2 class="detail-title">Comparação</h2><div class="compare">${[a, n].map(x =>
   `<div><h4>${esc(x.label)}</h4><p>${esc(entityTypePt(x.type))}</p><p>${esc(statusPt(x.status))}</p><p>${esc(authorityPt(x.authority))}</p><p>${esc(x.summary)}</p><p>${esc(fmtDate(x.updatedAt))}</p></div>`).join('')}</div>`;
 }

 function inspectEdge(e) {
  openDrawer();
  $('#detail').innerHTML = `<p class="eyebrow" style="margin-top:20px">RELAÇÃO</p><h2 class="detail-title">${esc(relationPt(e.type,true))}</h2>`
   + `<p class="authority">${esc(authorityPt(e.authority))}</p><p class="detail-summary">${esc(e.source)}<br>↓<br>${esc(e.target)}</p>`
   + `<p class="detail-summary">${esc(e.reason || 'Relação registrada ou agrupamento explícito de navegação.')}</p>`
   + `<p class="micro">Código da relação: ${esc(e.type||'—')} · Autoridade: ${esc(e.authority||'—')}</p>`
   + `${e.confidence != null ? `<p>${esc(confidenceLabel(e.confidence))}</p>` : ''}<button id="edge-target">Abrir destino</button>`;
  $('#edge-target').onclick = () => inspect(e.target);
 }

 async function inspect(id, {ui = 'overview'} = {}) {
  const mine = ++seq;
  $('#selection-hint').textContent = id;
  openDrawer();
  $('#detail').innerHTML = '<p class="detail-summary">Lendo entidade…</p>';
  try {
   const d = await api.entity(id);
   if (mine !== seq) return;
   const n = d.entity, shown = n.metadata || {};
   if (!n) throw Error('ENTITY_PAYLOAD_MISSING');
   $('#detail').innerHTML =
    `<p class="eyebrow" style="margin-top:20px">${esc(entityTypePt(n.subtype || n.type))}</p><h2 class="detail-title">${esc(n.label)}</h2>`
    + `<span class="status-chip" style="--chip:${colors[state(n.status)]}" title="Código: ${esc(n.status||'')}">${esc(statusPt(n.status))}</span>`
    + `<p class="authority">${esc(authorityPt(n.authority))}<small class="micro">${esc(n.authority||'')}</small></p>`
    + `<p class="canonical"><label>ID canônico</label><code>${esc(n.canonicalId || String(n.id).replace(/^[a-z_]+:/, ''))}</code>`
      + `${n.displaySource && n.displaySource !== 'CANONICAL_ID' ? `<small>rótulo: ${esc(n.displaySource)}</small>` : ''}`
      + `${n.canonicalTitle && n.canonicalTitle !== n.label ? `<small>título canônico original: ${esc(n.canonicalTitle)}</small>` : ''}</p>`
    + `<p class="detail-summary">${esc(n.summary || 'Sem resumo adicional registrado na fonte.')}</p>`
    + testOverview(n,d)
    + `<div class="detail-actions"><button id="open-node">Explorar →</button><button id="lineage-node">Linhagem</button><button id="learning-node">Aprendizado relacionado</button><button id="compare-node">Comparar</button><button id="copy-node">Copiar ID</button></div>`
    + sourceBlock(n, safeUrl)
    + `<div class="detail-section" id="learning-section" hidden><h3>APRENDIZADO RELACIONADO</h3><div id="learning-overlay"></div></div>`
    + `<div class="detail-section"><h3>RELAÇÕES · ${d.relationCount || 0}</h3>${(d.relations || []).slice(0, 60).map(e => {
      const outgoing=e.source===id,related=outgoing?e.target:e.source;
      return `<button class="relation" data-related="${esc(related)}"><b>${esc(relationPt(e.type,outgoing))}</b><span>${esc(String(related).slice(0,110))}</span><small>${esc(authorityPt(e.authority))}${e.status?` · ${esc(statusPt(e.status))}`:''}</small><code class="micro">${esc(e.type)} · ${esc(e.authority)}</code></button>`;
     }).join('') || '<p class="micro">Nenhuma relação explícita resolvida.</p>'}</div>`
    + `<div class="detail-section"><h3>REGISTRO DA FONTE · DETALHES EM PORTUGUÊS</h3>${metadataRows(shown) || '<p class="micro">Nenhum metadado adicional publicado.</p>'}</div>`
    + (ui === 'audit' ? `<div class="detail-section"><h3>JSON DE AUDITORIA</h3><pre>${esc(JSON.stringify(d, null, 2))}</pre></div>` : '');

   $('#open-node').onclick = () => onFocus(n);
   $('#lineage-node').onclick = () => onLineage(n);
   $('#compare-node').onclick = () => compare(n);
   $('#copy-node').onclick = () => navigator.clipboard.writeText(n.canonicalId || id).then(() => toast('ID copiado.')).catch(() => toast(id));
   $('#learning-node').onclick = () => {$('#learning-section').hidden = false; renderLearningOverlay(api, id)};
   $$('[data-related]').forEach(b => b.onclick = () => onRelated(b.dataset.related));
  } catch (e) {
   if (mine === seq) $('#detail').innerHTML = `<p class="detail-summary">Não foi possível abrir esta entidade${e?.message ? ` · ${esc(e.message)}` : ''}.</p>`;
  }
 }

 return {inspect, inspectEdge, compare, invalidate: () => {++seq}};
}
