/** Cockpit inspector. The default view is intentionally human: O quê / Como / Por quê.
 * Raw identifiers, hashes and source payloads stay behind the Audit workspace. */
import {$, $$, esc, num, toast, confidenceLabel} from './dom.mjs';
import {cockpitCopy,nodeDisplayLabel,compactLabel} from './cockpit-copy.mjs';

let seq=0;
export function openDrawer(){$('#inspector').hidden=false;$('#close-inspector').focus()}
export function closeDrawer(){$('#inspector').hidden=true;$('#graph')?.focus()}

const TYPE_PT={SYSTEM:'SISTEMA',DOMAIN:'DOMÍNIO',CAMPAIGN:'CAMPANHA',TEST:'TESTE',RESULT:'RESULTADO',CLAIM:'HIPÓTESE / CLAIM',HYPOTHESIS:'HIPÓTESE',DECISION_HYPOTHESIS:'HIPÓTESE DE DECISÃO',ACTION:'AÇÃO',AUTOMATION_RUN:'EXECUÇÃO',RUNTIME_EVENT:'EVENTO DE RUNTIME',LEARNING_RELATION:'REGISTRO DE APRENDIZADO',FILE:'ARQUIVO',ARTIFACT:'ARTEFATO',DATASET:'CONJUNTO DE DADOS',PUBLICATION:'PUBLICAÇÃO'};
const AUTH_PT={SCIENCE_CANONICAL:'CIÊNCIA CANÔNICA',DERIVED_NOT_EVIDENCE:'DERIVADO · NÃO É EVIDÊNCIA',CANONICAL:'CANÔNICO',DERIVED:'DERIVADO'};
const WORD_PT={CLOSED:'Encerrado',FAILED:'Falhou',SATURATED:'Saturado',BLOCKED:'Bloqueado',SUCCESS:'Sucesso',COMPLETED:'Concluído',COMPLETE:'Concluído',ACTIVE:'Ativo',OPEN:'Aberto',VALIDATED:'Validado',SUPPORTED:'Suportado',PASS:'Aprovado',READY:'Pronto',CANDIDATE:'Candidato',CANARY:'Canário',IMPORTED:'Importado',PARTIAL:'Parcial',PENDING:'Pendente',RETIRED:'Retirado',LEGACY:'Legado',UNKNOWN:'Desconhecido',ERROR:'Erro',RECOVERED:'Recuperado',RESOLVED:'Resolvido',OBSERVED:'Observado',ESTABLISHED:'Estabelecido',RECONCILED:'Reconciliado',VERIFIED:'Verificado',READBACK:'Readback'};
const FIELD_PT={entity_type:'Tipo de entidade',source_surface:'Superfície de origem',source_row_key:'Registro de origem',current_revision_id:'Revisão atual',priority:'Prioridade',source_ref:'Referência da fonte',branch:'Branch Git',schema:'Schema',git_commit:'Commit Git',blocker_reason:'Motivo do bloqueio',current_gate:'Gate atual',runtime_env:'Ambiente de execução',artifact_hash:'Hash do artefato',readback_verified:'Readback verificado',checkpoint:'Checkpoint',error_class:'Classe do erro',error_layer:'Camada do erro',evidence_refs:'Referências de evidência',source_truth_state_hash:'Hash do estado-fonte',event_type:'Tipo de evento',component:'Componente',source_kind:'Tipo de fonte',source_id:'ID da fonte',payload:'Payload técnico'};

const humanKey=k=>FIELD_PT[k]||String(k).replace(/_/g,' ').replace(/\b\w/g,m=>m.toUpperCase());
const entityTypePt=t=>TYPE_PT[String(t||'').toUpperCase()]||humanKey(String(t||'ENTIDADE'));
const authorityPt=a=>AUTH_PT[String(a||'').toUpperCase()]||humanKey(String(a||'NÃO INFORMADA'));
function statusPt(value=''){const raw=String(value||'');if(!raw)return'Estado não informado';return raw.split('_').map(x=>WORD_PT[x]||x.toLowerCase()).join(' · ').replace(/^./,m=>m.toUpperCase())}
function relationPt(type,outgoing=true){const t=String(type||'').toUpperCase(),map={CONTAINS:outgoing?'CONTÉM':'PERTENCE A',PRODUCES:outgoing?'PRODUZ':'PRODUZIDO POR',EXECUTED_AS:outgoing?'EXECUTADO COMO':'EXECUÇÃO DE',DERIVED_FROM:outgoing?'DERIVA PARA':'DERIVADO DE',OBSERVED_AS:outgoing?'OBSERVADO COMO':'OBSERVAÇÃO DE',TESTS:outgoing?'TESTA':'TESTADO POR',PART_OF_CAMPAIGN:outgoing?'PERTENCE À CAMPANHA':'CONTÉM TESTE'};return map[t]||humanKey(t)}
function prettyValue(v){if(typeof v==='boolean')return v?'Sim':'Não';if(Array.isArray(v))return v.length?v.map(x=>typeof x==='object'?JSON.stringify(x):String(x)).join('\n• '):'Nenhum';if(v&&typeof v==='object')return JSON.stringify(v,null,2);return String(v??'—')}
function fmtDate(v){if(!v)return'Sem data';const d=new Date(v);return Number.isNaN(d.valueOf())?String(v):d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}
function metadataRows(shown={}){return Object.entries(shown).filter(([k,v])=>v!==''&&v!==null&&v!==undefined&&k!=='_row').slice(0,80).map(([k,v])=>`<div class="metadata-item"><label>${esc(humanKey(k))}</label><p>${esc(prettyValue(v))}</p><code class="micro">${esc(k)}</code></div>`).join('')}
const sourceBlock=(n,safeUrl)=>`<div class="detail-section"><h3>FONTES</h3>${(n.sourceRefs||[]).map(r=>`<p class="micro">${esc(r.sourceRef||r.source||'')}<br>${r.observedAt?`Observado em ${esc(fmtDate(r.observedAt))}<br>`:''}${safeUrl(r.url)?`<a href="${esc(r.url)}" target="_blank" rel="noreferrer">Abrir fonte ↗</a>`:''}</p>`).join('')||'<p class="micro">Estrutura de navegação derivada.</p>'}</div>`;

function triad(copy){return `<div class="cockpit-triad">
 <section><span>O QUÊ</span><p>${esc(copy.what)}</p></section>
 <section><span>COMO</span><p>${esc(copy.how)}</p></section>
 <section><span>POR QUÊ</span><p>${esc(copy.why)}</p></section>
 </div>`}

export function relationRow(r){const scope=r.crossDomain?`<em class="cross">entre domínios ${esc(r.domainA)} ↔ ${esc(r.domainB)}</em>`:esc(r.scope||'mesmo domínio');return `<div class="learning-row"><b>${esc(r.relationType)}</b><span class="status-chip learning-chip">${esc(statusPt(r.status||'sem estado'))}</span><p class="micro">${esc(compactLabel(r.nodeA,{max:24}))} → ${esc(compactLabel(r.nodeB,{max:24}))}</p><p class="micro">${scope} · ${esc(confidenceLabel(r.confidence))} · evidência ${num(r.evidenceCount??r.support)} / contradição ${num(r.contradictionCount??r.contradiction)}</p>${r.notes?`<p class="micro">${esc(String(r.notes).slice(0,220))}</p>`:''}</div>`}
async function renderLearningOverlay(api,id){const box=$('#learning-overlay');if(!box)return;box.innerHTML='<p class="micro">Lendo aprendizado relacionado…</p>';try{const{relations}=await api.learningFor(id);box.innerHTML=relations.length?relations.map(relationRow).join(''):'<p class="micro">Nenhum aprendizado cita esta entidade em evidence_refs. Vínculo ausente na fonte, não inferido aqui.</p>'}catch{box.innerHTML='<p class="micro">Aprendizado indisponível no momento.</p>'}}

export function createInspector({api,colors,state,safeUrl,onFocus,onLineage,onRelated}){
 let pinned=null;
 function compare(n){if(!pinned){pinned=n;toast('Primeira entidade fixada. Selecione outra e clique em Comparar.');return}const a=pinned;pinned=null;$('#detail').innerHTML=`<h2 class="detail-title">Comparação</h2><div class="compare">${[a,n].map(x=>{const c=cockpitCopy(x);return `<div><h4 title="${esc(x.label||'')}">${esc(nodeDisplayLabel(x,34))}</h4><p>${esc(entityTypePt(x.type))} · ${esc(statusPt(x.status))}</p>${triad(c)}</div>`}).join('')}</div>`}
 function inspectEdge(e){openDrawer();const copy={what:`Relação ${relationPt(e.type,true).toLowerCase()} entre duas entidades.`,how:'Conexão registrada no Graph Contract do Atlas.',why:e.reason||'Preservar a navegação e a proveniência entre entidades relacionadas.'};$('#detail').innerHTML=`<p class="eyebrow" style="margin-top:20px">RELAÇÃO</p><h2 class="detail-title">${esc(relationPt(e.type,true))}</h2>${triad(copy)}${e.confidence!=null?`<p>${esc(confidenceLabel(e.confidence))}</p>`:''}<button id="edge-target">Abrir destino</button>`;$('#edge-target').onclick=()=>inspect(e.target)}
 async function inspect(id,{ui='overview'}={}){
  const mine=++seq;$('#selection-hint').textContent='Entidade selecionada';openDrawer();$('#detail').innerHTML='<p class="detail-summary">Lendo entidade…</p>';
  try{
   const d=await api.entity(id);if(mine!==seq)return;const n=d.entity;if(!n)throw Error('ENTITY_PAYLOAD_MISSING');const copy=cockpitCopy(n),audit=ui==='audit',shown=n.metadata||{},title=nodeDisplayLabel(n,38),sourceUrl=(n.sourceRefs||[]).map(r=>r.url).find(url=>safeUrl(url));
   $('#detail').innerHTML=`<p class="eyebrow" style="margin-top:20px">${esc(entityTypePt(n.subtype||n.type))}</p><h2 class="detail-title" title="${esc(n.label||'')}">${esc(title)}</h2>`
    +`<span class="status-chip" style="--chip:${colors[state(n.status)]}" title="${esc(statusPt(n.status))}">${esc(statusPt(n.status))}</span>`
    +`<p class="authority">${esc(authorityPt(n.authority))}</p>`
    +triad(copy)
    +`<div class="detail-actions"><button id="open-node">Explorar →</button>${sourceUrl?'<button id="source-node">Fonte ↗</button>':''}<button id="lineage-node">Linhagem</button><button id="learning-node">Aprendizado relacionado</button><button id="compare-node">Comparar</button>${audit?'<button id="copy-node">Copiar ID</button>':''}</div>`
    +`<div class="detail-section" id="learning-section" hidden><h3>APRENDIZADO RELACIONADO</h3><div id="learning-overlay"></div></div>`
    +(audit?`<div class="detail-section audit-technical"><h3>RASTREABILIDADE TÉCNICA</h3><p class="canonical"><label>ID canônico</label><code>${esc(n.canonicalId||String(n.id).replace(/^[a-z_]+:/,''))}</code></p>${sourceBlock(n,safeUrl)}<h3>RELAÇÕES · ${d.relationCount||0}</h3>${(d.relations||[]).slice(0,80).map(e=>{const outgoing=e.source===id,related=outgoing?e.target:e.source;return `<button class="relation" data-related="${esc(related)}"><b>${esc(relationPt(e.type,outgoing))}</b><span>${esc(compactLabel(related,{max:32}))}</span><small>${esc(authorityPt(e.authority))}</small></button>`}).join('')||'<p class="micro">Nenhuma relação explícita resolvida.</p>'}<h3>REGISTRO DA FONTE</h3>${metadataRows(shown)||'<p class="micro">Nenhum metadado adicional publicado.</p>'}<h3>JSON DE AUDITORIA</h3><pre>${esc(JSON.stringify(d,null,2))}</pre></div>`:'');
   $('#open-node').onclick=()=>onFocus(n);if(sourceUrl&&$('#source-node'))$('#source-node').onclick=()=>window.open(sourceUrl,'_blank','noopener,noreferrer');$('#lineage-node').onclick=()=>onLineage(n);$('#compare-node').onclick=()=>compare(n);$('#learning-node').onclick=()=>{$('#learning-section').hidden=false;renderLearningOverlay(api,id)};
   if(audit&&$('#copy-node'))$('#copy-node').onclick=()=>navigator.clipboard.writeText(n.canonicalId||id).then(()=>toast('ID copiado.')).catch(()=>toast(id));
   $$('[data-related]').forEach(b=>b.onclick=()=>onRelated(b.dataset.related));
  }catch(e){if(mine===seq)$('#detail').innerHTML=`<p class="detail-summary">Não foi possível abrir esta entidade${e?.message?` · ${esc(e.message)}`:''}.</p>`}
 }
 return{inspect,inspectEdge,compare,invalidate:()=>{++seq}};
}
