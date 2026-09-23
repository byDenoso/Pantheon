import type { PositionedNode } from './types';

export type ProjectedLabel={
  id:string;
  label:string;
  type:string;
  status:string;
  x:number;
  y:number;
  visible:boolean;
  side:'left'|'right';
};

type LabelBox={x:number;y:number;width:number;height:number};

function estimateLabelBox(item:ProjectedLabel):LabelBox{
  // The overlay is deliberately HTML, but projection happens in the render
  // loop before the browser has measured every card. A conservative estimate
  // keeps labels inside the viewport and gives the collision pass a stable
  // budget without forcing layout reads on every frame.
  const width=Math.min(212,Math.max(96,item.label.length*6.4+22));
  const height=item.label.length>28?48:38;
  return {x:item.x,y:item.y,width,height};
}

function overlaps(a:LabelBox,b:LabelBox){
  return a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
}

/**
 * Keep the WebGL HTML labels readable as the camera changes. The previous
 * projector emitted every LOD label at its raw screen coordinate, so a dense
 * campaign view could still turn into a stack of cards even though the 3D
 * nodes themselves had plenty of depth. Focus and selection are protected;
 * lower-priority labels are moved to the nearest free row or hidden.
 */
export function placeProjectedLabels(labels:ProjectedLabel[],width:number,height:number,focusId?:string|null,selectedId?:string|null){
  const margin=8;
  const placed:LabelBox[]=[];
  const ordered=labels
    .map((item,index)=>({item,index,priority:item.id===focusId?10000:item.id===selectedId?9000:item.type==='DOMAIN'||item.type==='SYSTEM'?7000:1000-index}))
    .sort((a,b)=>b.priority-a.priority);
  const output=labels.map(item=>({...item}));

  for(const entry of ordered){
    const item=entry.item;
    if(!item.visible)continue;
    const box=estimateLabelBox(item);
    const forced=item.id===focusId||item.id===selectedId;
    const candidates=[0,...Array.from({length:10},(_,index)=>index%2===0?-(index+1)*22:Math.ceil(index/2)*22)];
    let resolved:LabelBox|null=null;
    for(const offset of candidates){
      const candidate={
        x:Math.max(margin,Math.min(width-box.width-margin,box.x)),
        y:Math.max(margin,Math.min(height-box.height-margin,box.y+offset)),
        width:box.width,
        height:box.height
      };
      if(!placed.some(other=>overlaps(candidate,other))){resolved=candidate;break;}
    }
    if(!resolved&&forced){
      resolved={
        x:Math.max(margin,Math.min(width-box.width-margin,box.x)),
        y:Math.max(margin,Math.min(height-box.height-margin,box.y)),
        width:box.width,
        height:box.height
      };
    }
    if(resolved){
      placed.push(resolved);
      output[entry.index]={...item,x:resolved.x,y:resolved.y,visible:true};
    }else{
      output[entry.index]={...item,visible:false};
    }
  }
  return output;
}

type Props={
  labels:ProjectedLabel[];
  labelIds:Set<string>;
  selectedId?:string|null;
};

export function LabelOverlay({labels,labelIds,selectedId}:Props){
  return <div className="atlas-label-overlay" aria-hidden="true">
    {labels.filter(item=>item.visible&&labelIds.has(item.id)).map(item=><div
      key={item.id}
      className={`atlas-label ${item.side} ${item.id===selectedId?'selected':''}`}
      style={{transform:`translate3d(${Math.round(item.x)}px,${Math.round(item.y)}px,0)`}}
    ><strong>{item.label}</strong><span>{item.type}{item.status ? ` · ${item.status}` : ''}</span></div>)}
  </div>;
}

export function labelText(node:PositionedNode){
  return String(node.label||node.id);
}

export function labelType(node:PositionedNode){
  const type=String(node.type||'ENTITY').toUpperCase();
  const labels:Record<string,string>={SYSTEM:'Sistema',DOMAIN:'Domínio',CAMPAIGN:'Campanha',HYPOTHESIS:'Hipótese',TEST:'Teste',WORK:'Trabalho',CAPABILITY:'Capacidade',RUNTIME:'Ambiente',ROLE:'Papel',TOOL:'Ferramenta',EVIDENCE:'Evidência',REFERENCE:'Referência',FILAMENT:'Filamento',AUTOMATION:'Automação',DOCUMENT:'Documento',PUBLICATION:'Publicação',CLAIM:'Afirmação',RESULT:'Resultado',RUN:'Execução'};
  return labels[type]||type.replaceAll('_',' ').toLocaleLowerCase('pt-BR');
}

export function labelStatus(node:PositionedNode){
  const status=String(node.status||'').trim().toUpperCase();
  const labels:Record<string,string>={LIVE:'Ao vivo',ACTIVE:'Ativo',PASS:'Verificado',VERIFIED:'Verificado',BLOCKED:'Bloqueado',WAIT_DEPENDENCY:'Aguardando dependência',PENDING:'Pendente',UNKNOWN:'Desconhecido',WATCH:'Em observação',STALE:'Desatualizado',SNAPSHOT:'Instantâneo',UNVERIFIED:'Sem verificação',CONFLICT:'Conflito',RETIRED:'Retirado',READY:'Pronto',FAILED:'Falhou'};
  return status ? labels[status]||status.replaceAll('_',' ').toLocaleLowerCase('pt-BR') : '';
}

// Positions are projected by the R3F camera component; this layer intentionally owns text only.
export const project = 'R3F_CAMERA_PROJECT';
