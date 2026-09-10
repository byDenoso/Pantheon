// Contextual cockpit for the selected body.
//
// This is not a settings panel: it answers, in this order, what is blocked, what
// must happen next, what was tested, what the evidence is, what this node is wired
// to, what changed and whether the projection can be trusted. Canonical values come
// from node.ops; associative-memory overlays add only explicitly published filament
// metadata and are always labelled derived, never promoted to SSOT truth.
//
// Four tabs split that by intent instead of making the reader scroll a single column:
// what this node is, what is stuck, what moved, and how much to trust it.

const LEVEL_LABEL={root:'NÚCLEO',domain:'DOMÍNIO',program:'PROGRAM',campaign:'CAMPAIGN',memory:'MEMÓRIA'};

export const COCKPIT_TABS=[
 {id:'visao',label:'Visão geral',sections:['next','tests','relations']},
 {id:'bloqueios',label:'Bloqueios',sections:['blockers']},
 {id:'atividade',label:'Atividade',sections:['changes','evidence']},
 {id:'integridade',label:'Integridade',sections:['integrity']}
];

const SECTION_HINT={
 blockers:'O que impede avanço agora',
 next:'O que exige ação',
 tests:'Execução mais recente no escopo',
 evidence:'O que sustenta o estado',
 relations:'Como este nó está ligado',
 changes:'O que mudou por último',
 integrity:'Quanto confiar nesta leitura'
};

const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!=null)node.textContent=text;return node};
const toneDot=tone=>{const dot=el('i','tone-dot');dot.dataset.tone=tone||'idle';return dot};
const unique=value=>[...new Set(value.filter(Boolean))];

function statusPill(status,tone){
 const pill=el('span','status-pill',String(status||'—').replaceAll('_',' '));
 pill.dataset.tone=tone||'idle';
 return pill;
}

function itemRow(item,{onFocusNode}={}){
 const interactive=Boolean(item.nodeId&&onFocusNode);
 const row=el(interactive?'button':'div','cockpit-item');
 if(interactive){row.type='button';row.addEventListener('click',()=>onFocusNode(item.nodeId))}
 const head=el('div','cockpit-item-head');
 head.append(toneDot(item.tone),el('b',null,item.title||'—'));
 if(item.severity){const chip=el('span','severity',item.severity);chip.dataset.severity=item.severity;head.append(chip)}
 else if(item.status)head.append(statusPill(item.status,item.tone));
 row.append(head);
 if(item.detail)row.append(el('p',null,item.detail));
 if(item.meta)row.append(el('small',null,item.meta));
 return row;
}

function sectionBlock(section,{onFocusNode}={}){
 const block=el('section','cockpit-section');
 block.dataset.section=section.id;
 const head=el('header');
 head.append(el('h3',null,section.title),el('span','count',String(section.items.length)));
 block.append(head);
 const hint=SECTION_HINT[section.id];
 if(hint)block.append(el('small','section-hint',hint));
 if(!section.items.length){block.append(el('p','cockpit-empty',section.empty));return block}
 const list=el('div','cockpit-list');
 for(const item of section.items)list.append(itemRow(item,{onFocusNode}));
 block.append(list);
 return block;
}

function associativeEdges(node,graph){
 return (graph?.edges||[]).filter(edge=>edge.associative&&!edge.contextEdge&&(edge.source===node?.id||edge.target===node?.id));
}

function associativeAugment(node,graph,id,base){
 if(!node?.associative)return base;
 const edges=associativeEdges(node,graph);
 const items=[...(base?.items||[])];
 if(id==='next')for(const value of unique(edges.map(edge=>edge.nextDiscriminant))){items.push({title:'Próximo discriminante',detail:value,tone:'warn'})}
 if(id==='evidence')for(const ref of unique(edges.flatMap(edge=>edge.evidenceRefs||[]))){items.push({title:ref,detail:'Evidência declarada pelo Learning Filament.',status:'DECLARED',tone:'idle'})}
 if(id==='integrity'){
  items.push({title:'Autoridade',detail:node.authority||'DERIVED_NOT_TRUTH',tone:'warn'});
  for(const edge of edges.slice(0,6))items.push({title:edge.title||edge.id,detail:`peso ${Number(edge.weight||0).toFixed(2)} · suporte ${edge.supportCount||0} · contradições ${edge.contradictionCount||0}`,status:edge.status,tone:edge.contradictionCount?'blocked':'ok'});
 }
 if(!base&&!items.length)return null;
 return{id,title:base?.title||(id==='next'?'Ativação':id==='evidence'?'Evidência dos filamentos':id==='integrity'?'Integridade associativa':id),empty:base?.empty||'Sem registros publicados.',items};
}

function associativeStrip(node,graph){
 if(!node?.associative)return null;
 const edges=associativeEdges(node,graph);
 const strongest=edges.reduce((best,edge)=>Math.max(best,Number(edge.weight)||0),0);
 const strip=el('div','cockpit-memory-strip');
 strip.setAttribute('aria-label','Resumo da memória associativa');
 const layer=String(node.kind||node.metadata?.memoryLayer||'MEMÓRIA').replaceAll('_',' ');
 strip.append(el('span',null,layer));
 if(strongest>0)strip.append(el('b',null,strongest.toFixed(2)),el('small',null,'filamento mais forte'));
 else strip.append(el('small',null,node.status||'SEM FILAMENTO VISÍVEL'));
 return strip;
}

/**
 * Load and blockers per Domain. The bar is the Domain's share of the Campaigns on the
 * map; the number on the right is how many blockers sit inside it. When every Domain
 * reads zero that is the real answer — the blockers are held at the core.
 */
function heatMap(graph,{onFocusNode}={}){
 const rows=graph?.ops?.heatmap||[];
 if(!rows.length)return null;
 const block=el('section','cockpit-section heatmap');
 block.dataset.section='heatmap';
 const head=el('header');
 head.append(el('h3',null,'Carga por domínio'),el('span','count',String(rows.length)));
 block.append(head,el('small','section-hint','Barra: fatia das Campaigns · número: bloqueios no domínio'));
 const heaviest=Math.max(1,...rows.map(row=>row.campaigns));
 const list=el('div','heat-rows');
 for(const row of rows){
  const line=el('button','heat-row');
  line.type='button';
  line.addEventListener('click',()=>onFocusNode?.(row.id));
  const hue=(graph.nodes.find(node=>node.id===row.id)||{}).hue||'currentColor';
  const dot=el('i');
  dot.style.background=hue;
  const track=el('span','heat-track');
  const fill=el('i');
  fill.style.width=`${Math.max(4,(row.campaigns/heaviest)*100)}%`;
  fill.style.background=hue;
  track.append(fill);
  const count=el('b',row.blocked?'is-blocked':null,String(row.blocked));
  line.append(dot,el('span','heat-name',row.label),track,count);
  list.append(line);
 }
 block.append(list);
 return block;
}

export function createCockpit(root,{onFocusNode,onToggleSubgraph,onHome,onTab}={}){
 const render=(node,{graph,trail=[],expanded=false,expandable=false,hiddenChildren=0,tab='visao'}={})=>{
  root.replaceChildren();
  if(!node){
   const empty=el('div','cockpit-idle');
   empty.append(
    el('h2',null,'Nenhum nó selecionado'),
    el('p',null,'Selecione o NEXO ou um Domínio para abrir o contexto operacional. Clique em um Domínio para revelar seus Programs, e em um Program para revelar suas Campaigns.')
   );
   root.append(empty);
   return;
  }

  const ops=node.ops||{sections:[],rollup:{}};
  const sectionById=id=>associativeAugment(node,graph,id,ops.sections?.find(section=>section.id===id));
  const active=COCKPIT_TABS.find(entry=>entry.id===tab)||COCKPIT_TABS[0];

  const tabs=el('nav','cockpit-tabs');
  tabs.setAttribute('role','tablist');
  tabs.setAttribute('aria-label','Seções do cockpit');
  for(const entry of COCKPIT_TABS){
   const button=el('button',entry.id===active.id?'is-active':null,entry.label);
   button.type='button';button.dataset.tab=entry.id;button.setAttribute('role','tab');button.setAttribute('aria-selected',String(entry.id===active.id));
   const count=entry.id==='bloqueios'?sectionById('blockers')?.items.length||0:0;
   if(count)button.append(el('span','tab-count',String(count)));
   button.addEventListener('click',()=>onTab?.(entry.id));
   tabs.append(button);
  }
  root.append(tabs);

  const header=el('header','cockpit-head');
  const kicker=el('div','cockpit-kicker');
  kicker.append(el('span','level-chip',LEVEL_LABEL[ops.level]||'NÓ'));
  if(node.system)kicker.append(el('span','system-chip',node.system));
  kicker.append(statusPill(ops.status,ops.tone));
  const title=el('h2',null,node.label||node.id);
  if(node.hue)title.style.setProperty('--node-hue',node.hue);
  header.append(kicker,title);
  if(node.recordId&&node.recordId!==node.label)header.append(el('small','record-id',node.recordId));
  root.append(header);
  const memoryStrip=associativeStrip(node,graph);if(memoryStrip)root.append(memoryStrip);

  if(trail.length>1){
   const path=el('nav','cockpit-trail');
   trail.forEach((step,index)=>{
    if(index)path.append(el('span','sep','/'));
    const button=el('button',step.id===node.id?'is-current':null,step.label);
    button.type='button';
    button.addEventListener('click',()=>onFocusNode?.(step.id));
    path.append(button);
   });
   root.append(path);
  }

  const tiles=el('div','cockpit-tiles');
  const stats=[
   ['Domínios',ops.rollup.domains],
   ['Programs',ops.rollup.programs],
   ['Campaigns',ops.rollup.campaigns],
   ['Bloqueios',ops.rollup.blocked||0,ops.rollup.blocked?'blocked':'ok']
  ].filter(([,value])=>value!=null&&(value||value===0));
  for(const [label,value,tone] of stats){
   if(!value&&label!=='Bloqueios')continue;
   const tile=el('div','tile');
   if(tone)tile.dataset.tone=tone;
   tile.append(el('b',null,String(value)),el('small',null,label));
   tiles.append(tile);
  }
  if(tiles.childElementCount)root.append(tiles);

  if(ops.summary)root.append(el('p','cockpit-summary',ops.summary));

  const actions=el('div','cockpit-actions');
  if(expandable&&onToggleSubgraph){
   const toggle=el('button','primary',expanded?'Recolher subgrafo':`Abrir subgrafo${hiddenChildren?` · ${hiddenChildren}`:''}`);
   toggle.type='button';
   toggle.addEventListener('click',()=>onToggleSubgraph(node.id));
   actions.append(toggle);
  }
  if(onHome&&node.id!==graph?.rootId){
   const home=el('button',null,'Voltar ao NEXO');
   home.type='button';
   home.addEventListener('click',()=>onHome());
   actions.append(home);
  }
  if(node.ssotUrl){
   const link=el('a',null,'Abrir no SSOT');
   link.href=node.ssotUrl;link.target='_blank';link.rel='noopener';
   actions.append(link);
  }
  if(actions.childElementCount)root.append(actions);

  const isRoot=node.id===graph?.rootId;
  if(active.id==='visao'&&ops.core){
   const pulse=el('div','cockpit-pulse');
   for(const [label,value,tone] of [
    ['ESTADO ATUAL',ops.core.currentState,ops.tone],
    ['PRÓXIMA AÇÃO',ops.core.nextAction,'warn'],
    ['ÚLTIMO EFEITO',ops.core.lastEffect,'ok']
   ]){
    const article=el('article');
    article.dataset.tone=tone||'idle';
    article.append(el('small',null,label),el('p',null,value||'Sem valor projetado no SSOT.'));
    pulse.append(article);
   }
   root.append(pulse);
  }

  if(active.id==='bloqueios'&&isRoot){
   const map=heatMap(graph,{onFocusNode});
   if(map)root.append(map);
  }

  for(const id of active.sections){
   const section=sectionById(id);
   if(section)root.append(sectionBlock(section,{onFocusNode}));
  }

  if(active.id==='integridade')for(const group of ops.core?.groups||[]){
   root.append(sectionBlock({id:group.id,title:group.title,items:group.items,empty:'Sem registros.'},{onFocusNode}));
  }
 };

 return{render};
}
