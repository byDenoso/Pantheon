const expandable=node=>Boolean(node&&(node.expandable||Number(node.hiddenChildren||0)>0));

export function actionLabelForNode(node){
 const level=String(node?.hierarchyLevel||'').toLowerCase();
 if(level==='lane')return 'ABRIR DOMÍNIO';
 if(level==='domain')return 'ABRIR SUBGRAFO';
 if(level==='group')return 'ABRIR GRUPO';
 if(level==='program')return 'VER CAMPAIGNS';
 if(level==='person'||level==='project')return 'ABRIR';
 return 'ABRIR';
}

export function focusLabelForNode(node,{isFocused=false}={}){
 if(!node)return 'FOCAR';
 return isFocused?'LIMPAR FOCO':'FOCAR';
}

function metaForNode(node){
 const rollup=node?.ops?.rollup||{};
 const pieces=[];
 if(rollup.programs)pieces.push(`${rollup.programs} ${rollup.programs===1?'program':'programs'}`);
 if(rollup.campaigns)pieces.push(`${rollup.campaigns} ${rollup.campaigns===1?'campaign':'campaigns'}`);
 if(!pieces.length&&node?.hiddenChildren)pieces.push(`${node.hiddenChildren} subgrafos`);
 return pieces.join(' · ')||String(node?.hierarchyLevel||node?.type||'').replaceAll('_',' ');
}

export function createNodeActionBar({host,onOpen,onFocus,onClearFocus,onHome}={}){
 if(!host)return null;
 const root=document.createElement('section');
 root.className='atlas-node-actions';
 root.setAttribute('data-label-reserved','');
 root.hidden=true;
 root.innerHTML='<div class="atlas-node-action-copy"><small></small><b></b><span></span></div><div class="atlas-node-action-buttons"><button type="button" data-action="open">ABRIR</button><button type="button" data-action="focus">FOCAR</button><button type="button" data-action="home">NEXO</button></div>';
 host.append(root);
 let current=null;
 let focused=false;
 const title=root.querySelector('b');
 const kicker=root.querySelector('small');
 const meta=root.querySelector('span');
 const open=root.querySelector('[data-action=open]');
 const focus=root.querySelector('[data-action=focus]');
 const home=root.querySelector('[data-action=home]');
 open.addEventListener('click',()=>{if(current)onOpen?.(current)});
 focus.addEventListener('click',()=>{if(!current)return;focused?onClearFocus?.(current):onFocus?.(current)});
 home.addEventListener('click',()=>onHome?.());
 function setNode(node,options={}){
  current=node||null;
  focused=Boolean(options.focused);
  const isRoot=!node||node.hierarchyLevel==='root'||node.id==='system:NEXO';
  root.hidden=isRoot;
  if(isRoot)return;
  title.textContent=node.label||node.id;
  kicker.textContent=String(node.hierarchyLevel||node.type||'NODE').replaceAll('_',' ').toUpperCase();
  meta.textContent=metaForNode(node);
  const canOpen=expandable(node);
  open.hidden=!canOpen;
  open.textContent=actionLabelForNode(node);
  focus.textContent=focusLabelForNode(node,{isFocused:focused});
 }
 function clear(){current=null;focused=false;root.hidden=true}
 return{root,setNode,clear,get node(){return current},get focused(){return focused}};
}
