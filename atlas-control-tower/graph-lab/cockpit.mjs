// Contextual cockpit for the selected body.
//
// This is not a settings panel: it answers, in this order, what is blocked, what
// must happen next, what was tested, what the evidence is, what this node is wired
// to, what changed and whether the projection can be trusted. Every value shown is
// read from node.ops, which data/operations.mjs derives from the SSOT alone.

const LEVEL_LABEL={root:'NÚCLEO',domain:'DOMÍNIO',program:'PROGRAM',campaign:'CAMPAIGN'};
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

function toneDot(tone){const dot=el('i','tone-dot');dot.dataset.tone=tone||'idle';return dot}

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
 if(item.status)head.append(statusPill(item.status,item.tone));
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

export function createCockpit(root,{onFocusNode,onToggleSubgraph,onHome}={}){
 const render=(node,{graph,trail=[],expanded=false,expandable=false,hiddenChildren=0}={})=>{
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

  const header=el('header','cockpit-head');
  const kicker=el('div','cockpit-kicker');
  kicker.append(el('span','level-chip',LEVEL_LABEL[ops.level]||'NÓ'));
  if(node.system)kicker.append(el('span','system-chip',node.system));
  kicker.append(statusPill(ops.status,ops.tone));
  header.append(kicker,el('h2',null,node.label||node.id));
  if(node.recordId&&node.recordId!==node.label)header.append(el('small','record-id',node.recordId));
  root.append(header);

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

  if(ops.core){
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

  const rollup=el('div','cockpit-rollup');
  const plural=(count,one,many)=>count===1?one:many;
  const chips=[
   ops.rollup.domains?[plural(ops.rollup.domains,'Domínio','Domínios'),ops.rollup.domains,'idle']:null,
   ops.rollup.programs?['Program'+(ops.rollup.programs===1?'':'s'),ops.rollup.programs,'idle']:null,
   ops.rollup.campaigns?['Campaign'+(ops.rollup.campaigns===1?'':'s'),ops.rollup.campaigns,'idle']:null,
   [plural(ops.rollup.blocked||0,'Bloqueio','Bloqueios'),ops.rollup.blocked||0,ops.rollup.blocked?'blocked':'ok']
  ].filter(Boolean);
  for(const [label,value,tone] of chips){
   const chip=el('span','rollup-chip');
   chip.dataset.tone=tone;
   chip.append(el('b',null,String(value)),el('small',null,label));
   rollup.append(chip);
  }
  root.append(rollup);

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

  for(const section of ops.sections||[])root.append(sectionBlock(section,{onFocusNode}));

  for(const group of ops.core?.groups||[]){
   root.append(sectionBlock({id:group.id,title:group.title,items:group.items,empty:'Sem registros.'},{onFocusNode}));
  }
 };

 return{render};
}
