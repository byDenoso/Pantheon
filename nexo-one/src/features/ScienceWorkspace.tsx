import {useMemo,useRef,useState} from 'react';
import type {Filament,ScienceEvidenceField,ScienceProjectionRecord,ScienceProjectionV1,SystemState} from '../contracts/system.ts';
import {NexoGraph,type NexoGraphView} from '../components/NexoGraph.tsx';
import type {AtlasCrossLink,AtlasMetroModel,AtlasMetroNode} from '../atlas3d/atlasAdapter.ts';
import './ScienceWorkspace.css';

type ScienceTab='campanhas'|'testes'|'hipoteses'|'aprendizado'|'graficos';
type PlotMode='grafico'|'tabela';
type GraphMode='evidencia'|'relacoes';

const TABS:Array<[ScienceTab,string]>=[
  ['campanhas','Campanhas'],['testes','Testes'],['hipoteses','Hipóteses'],['aprendizado','Aprendizado'],['graficos','Gráficos'],
];

function routeParams(){
  const query=window.location.hash.split('?',2)[1]||'';
  return new URLSearchParams(query);
}
function initialTab():ScienceTab{
  const params=routeParams();
  const raw=(params.get('tab')||params.get('view')||'').toLowerCase();
  if(raw==='tests'||raw==='testes')return'testes';
  if(raw==='hypotheses'||raw==='hipoteses'||raw==='hipóteses')return'hipoteses';
  if(raw==='learning'||raw==='aprendizado')return'aprendizado';
  if(raw==='charts'||raw==='graficos'||raw==='gráficos')return'graficos';
  if(window.location.hash.replace(/^#\/?/,'').split('?',1)[0].toUpperCase()==='LEARNING')return'aprendizado';
  return'campanhas';
}
function initialGraphView():NexoGraphView{
  const value=routeParams().get('view');
  if(value==='3d'||value==='2d')return value;
  try{return localStorage.getItem('nexo.graph.view.v1')==='3d'?'3d':'2d';}catch{return'2d';}
}
function envelope(record:ScienceProjectionRecord,key:string):ScienceEvidenceField|undefined{
  const value=record[key];
  return value&&typeof value==='object'&&!Array.isArray(value)&&Object.hasOwn(value,'value')
    ? value as ScienceEvidenceField
    : undefined;
}
function nested(record:ScienceProjectionRecord,parent:string,key:string):ScienceEvidenceField|undefined{
  const value=record[parent];
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.hasOwn(value,'value'))return undefined;
  const item=(value as Record<string,ScienceEvidenceField>)[key];
  return item&&typeof item==='object'&&Object.hasOwn(item,'value')?item:undefined;
}
function valueOf(record:ScienceProjectionRecord,key:string):unknown{
  return envelope(record,key)?.value??null;
}
function textOf(value:unknown):string{
  if(value===null||value===undefined||value==='')return'não publicado';
  if(Array.isArray(value))return value.length?value.map(textOf).join(', '):'não publicado';
  if(typeof value==='object')return JSON.stringify(value);
  return String(value);
}
function shortId(id:string):string{
  return id.length>34?id.slice(0,31)+'…':id;
}
function csvEscape(value:unknown):string{
  const text=textOf(value).replaceAll('"','""');
  return `"${text}"`;
}
function downloadCsv(filename:string,headers:string[],rows:unknown[][]){
  const content=[headers,...rows].map(row=>row.map(csvEscape).join(',')).join('\n');
  const url=URL.createObjectURL(new Blob(['\uFEFF'+content],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=filename;link.click();URL.revokeObjectURL(url);
}
function downloadPlotPng(svg:SVGSVGElement|null){
  if(!svg)return;
  const clone=svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
  const data=new XMLSerializer().serializeToString(clone);
  const source=URL.createObjectURL(new Blob([data],{type:'image/svg+xml'}));
  const image=new Image();
  image.onload=()=>{
    const canvas=document.createElement('canvas');canvas.width=1400;canvas.height=760;
    const context=canvas.getContext('2d');if(!context){URL.revokeObjectURL(source);return;}
    context.drawImage(image,0,0,canvas.width,canvas.height);
    URL.revokeObjectURL(source);
    canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='ciencia-evidencia.png';link.click();URL.revokeObjectURL(url);},'image/png');
  };
  image.src=source;
}

function recordSearch(record:ScienceProjectionRecord,query:string){
  if(!query)return true;
  return JSON.stringify(record).toLowerCase().includes(query);
}

function descendants(children:Map<string,string[]>,id:string):number{
  return (children.get(id)||[]).reduce((total,child)=>total+1+descendants(children,child),0);
}
function scienceGraphModel(projection:ScienceProjectionV1,generatedAt:string):AtlasMetroModel{
  const rootId='science.root';
  const campaignId=(id:string)=>`science.campaign:${id}`;
  const hypothesisId=(id:string)=>`science.hypothesis:${id}`;
  const testId=(id:string)=>`science.test:${id}`;
  const parentForHypothesis=new Map<string,string>();
  for(const campaign of projection.campaigns){
    const raw=valueOf(campaign,'hypothesis_ids');
    const ids=Array.isArray(raw)?raw:[raw];
    for(const id of ids.filter(Boolean))parentForHypothesis.set(String(id),campaignId(campaign.id));
  }
  const campaignIds=new Set(projection.campaigns.map(item=>item.id));
  const base:AtlasMetroNode[]=[{
    id:rootId,sourceId:null,name:'Ciência',domain:'SCIENCE',parentId:null,entityType:'hub',status:'LIVE',
    summary:'Campanhas, hipóteses e testes publicados no contrato científico.',depth:0,childCount:0,descendantCount:0,
    relationCount:0,mix:50,updatedAt:generatedAt,sourceRevision:projection.source.tower_commit,
    fingerprint:projection.fingerprint,authorityClass:'TOWER_V06',sourceRef:projection.source.projection_ref,
    sourceLinks:[],temporal:[],synthetic:true,
  }];
  for(const item of projection.campaigns)base.push({
    id:campaignId(item.id),sourceId:item.id,name:textOf(valueOf(item,'question'))==='não publicado'?item.id:textOf(valueOf(item,'question')),
    domain:'SCIENCE',parentId:rootId,entityType:'CAMPAIGN',status:textOf(valueOf(item,'status')),summary:textOf(valueOf(item,'question')),
    depth:1,childCount:0,descendantCount:0,relationCount:0,mix:50,updatedAt:textOf(valueOf(item,'started_at'))==='não publicado'?generatedAt:textOf(valueOf(item,'started_at')),
    sourceRevision:projection.source.tower_commit,fingerprint:item.fingerprint,authorityClass:'TOWER_V06',sourceRef:item.source_ref,sourceLinks:[],temporal:[],synthetic:false,
  });
  for(const item of projection.hypotheses)base.push({
    id:hypothesisId(item.id),sourceId:item.id,name:textOf(valueOf(item,'statement'))==='não publicado'?item.id:textOf(valueOf(item,'statement')),
    domain:'SCIENCE',parentId:parentForHypothesis.get(item.id)||rootId,entityType:'CLAIM',status:'PUBLISHED',summary:textOf(valueOf(item,'statement')),
    depth:parentForHypothesis.has(item.id)?2:1,childCount:0,descendantCount:0,relationCount:0,mix:50,updatedAt:generatedAt,
    sourceRevision:projection.source.tower_commit,fingerprint:item.fingerprint,authorityClass:'TOWER_V06',sourceRef:item.source_ref,sourceLinks:[],temporal:[],synthetic:false,
  });
  for(const item of projection.tests){
    const campaign=String(valueOf(item,'campaign_id')||'');
    const parent=campaign&&campaignIds.has(campaign)?campaignId(campaign):rootId;
    base.push({
      id:testId(item.id),sourceId:item.id,name:item.id,domain:'SCIENCE',parentId:parent,entityType:'TEST',
      status:textOf(valueOf(item,'verdict')),summary:textOf(valueOf(item,'method')),depth:parent===rootId?1:2,
      childCount:0,descendantCount:0,relationCount:0,mix:50,updatedAt:generatedAt,sourceRevision:projection.source.tower_commit,
      fingerprint:item.fingerprint,authorityClass:'TOWER_V06',sourceRef:item.source_ref,sourceLinks:[],temporal:[],synthetic:false,
    });
  }
  const nodeMap0=new Map(base.map(node=>[node.id,node]));
  const childrenMap=new Map<string,string[]>();
  for(const node of base)childrenMap.set(node.id,[]);
  for(const node of base){
    if(node.parentId&&nodeMap0.has(node.parentId))childrenMap.get(node.parentId)!.push(node.id);
  }
  const crossLinks:AtlasCrossLink[]=[];
  for(const item of projection.tests){
    const hypothesis=String(valueOf(item,'hypothesis_id')||'');
    if(!hypothesis||!nodeMap0.has(hypothesisId(hypothesis)))continue;
    crossLinks.push({
      id:`science.relation:${hypothesis}:${item.id}`,source:hypothesisId(hypothesis),target:testId(item.id),
      label:'Testa',kind:'VERIFIES',weight:1,aggregated:false,isLearning:false,learningScope:null,learningRef:null,
      learningKind:null,learningGroup:null,learningTheme:null,learningBasis:null,sourceAnchor:null,targetAnchor:null,bundleIndex:0,bundleCount:1,
    });
  }
  const relationCounts=new Map<string,number>();
  for(const link of crossLinks){relationCounts.set(link.source,(relationCounts.get(link.source)||0)+1);relationCounts.set(link.target,(relationCounts.get(link.target)||0)+1);}
  const nodes=base.map(node=>({...node,childCount:(childrenMap.get(node.id)||[]).length,descendantCount:descendants(childrenMap,node.id),relationCount:(childrenMap.get(node.id)||[]).length+(relationCounts.get(node.id)||0)+(node.parentId?1:0)}));
  const nodeMap=new Map(nodes.map(node=>[node.id,node]));
  return {revision:projection.fingerprint,generatedAt,roots:[rootId],nodes,nodeMap,childrenMap,crossLinks,sourceNodeIds:new Set(nodes.map(node=>node.id))};
}

function StateText({value}:{value:unknown}){return <span className={value===null||value===undefined?'science-unpublished':''}>{textOf(value)}</span>;}

function DenseTable({heads,rows,empty}:{heads:string[];rows:React.ReactNode[];empty:string}){
  return <div className="science-table-wrap"><table className="science-table"><thead><tr>{heads.map(head=><th key={head}>{head}</th>)}</tr></thead><tbody>{rows.length?rows:<tr><td colSpan={heads.length} className="science-empty">{empty}</td></tr>}</tbody></table></div>;
}

function learningRows(filaments:Filament[],query:string){
  return filaments.filter(item=>!query||JSON.stringify(item).toLowerCase().includes(query)).sort((a,b)=>b.weight-a.weight);
}

export default function ScienceWorkspace({state}:{state:SystemState}){
  const projection=state.science_projection_v1;
  const [tab,setTab]=useState<ScienceTab>(initialTab);
  const [query,setQuery]=useState('');
  const [graphView,setGraphView]=useState<NexoGraphView>(initialGraphView);
  const [graphMode,setGraphMode]=useState<GraphMode>('evidencia');
  const [plotMode,setPlotMode]=useState<PlotMode>('grafico');
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const svgRef=useRef<SVGSVGElement|null>(null);

  const counts={
    campanhas:projection?.campaigns.length??0,testes:projection?.tests.length??0,hipoteses:projection?.hypotheses.length??0,
    aprendizado:state.filaments.length,graficos:projection?.tests.filter(test=>typeof nested(test,'result','value')?.value==='number').length??0,
  };
  const setScienceTab=(next:ScienceTab)=>{
    setTab(next);setQuery('');
    const params=routeParams();params.set('tab',next);if(params.get('view')==='learning')params.delete('view');
    window.history.replaceState(null,'',`#/cockpit/ciencia?${params.toString()}`);
  };
  const setView=(next:NexoGraphView)=>{
    setGraphView(next);try{localStorage.setItem('nexo.graph.view.v1',next);}catch{}
    const params=routeParams();params.set('tab','graficos');params.set('view',next);
    window.history.replaceState(null,'',`#/cockpit/ciencia?${params.toString()}`);
  };

  const q=query.trim().toLowerCase();
  const campaigns=projection?.campaigns.filter(item=>recordSearch(item,q))??[];
  const tests=projection?.tests.filter(item=>recordSearch(item,q))??[];
  const hypotheses=projection?.hypotheses.filter(item=>recordSearch(item,q))??[];
  const filaments=learningRows(state.filaments,q);
  const quantitative=projection?.tests.flatMap(test=>{
    const value=nested(test,'result','value')?.value;
    if(typeof value!=='number')return[];
    const lo=nested(test,'result','err_lo')?.value,hi=nested(test,'result','err_hi')?.value;
    return [{id:test.id,parameter:textOf(nested(test,'result','parameter')?.value),value,
      lo:typeof lo==='number'?lo:null,hi:typeof hi==='number'?hi:null,unit:textOf(nested(test,'result','unit')?.value),
      verdict:textOf(valueOf(test,'verdict'))}];
  })??[];
  const graphModel=useMemo(()=>projection?scienceGraphModel(projection,state.generated_at):null,[projection?.fingerprint,state.generated_at]);
  const graphExpanded=useMemo(()=>graphModel?new Set(graphModel.nodes.filter(node=>node.entityType==='hub'||node.entityType==='CAMPAIGN').map(node=>node.id)):new Set<string>(),[graphModel?.revision]);

  return <section className="science-workspace" data-science-tab={tab} data-science-contract={projection?.contract||'unpublished'}>
    <nav className="science-tabs" aria-label="Seções de Ciência">{TABS.map(([id,label])=><button type="button" key={id} className={tab===id?'active':''} aria-current={tab===id?'page':undefined} onClick={()=>setScienceTab(id)}>{label}<span>{counts[id]}</span></button>)}</nav>
    <div className="science-filterbar">
      <label><span>Buscar</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="ID, pergunta, método ou estado"/></label>
      <span className="science-source">Fonte: {projection?'TOWER_V06 · contrato científico':'não publicado'}</span>
    </div>

    {!projection&&tab!=='aprendizado'&&<div className="science-not-published">Projeção científica não publicada neste snapshot.</div>}

    {projection&&tab==='campanhas'&&<DenseTable heads={['Campanha','Pergunta','Estado','Hipóteses','Início','Pré-registro']} empty="Nenhuma campanha corresponde ao filtro." rows={campaigns.map(item=><tr key={item.id}>
      <td><strong>{shortId(item.id)}</strong><small>{item.id}</small></td><td><StateText value={valueOf(item,'question')}/></td><td><StateText value={valueOf(item,'status')}/></td>
      <td><StateText value={valueOf(item,'hypothesis_ids')}/></td><td><StateText value={valueOf(item,'started_at')}/></td><td><StateText value={valueOf(item,'prereg_ref')}/></td>
    </tr>)}/>}

    {projection&&tab==='testes'&&<DenseTable heads={['Teste','Campanha','Hipótese','Método','Datasets','Veredito','Claim','σ LEE']} empty="Nenhum teste corresponde ao filtro." rows={tests.map(item=><tr key={item.id}>
      <td><strong>{shortId(item.id)}</strong><small>{item.id}</small></td><td><StateText value={valueOf(item,'campaign_id')}/></td><td><StateText value={valueOf(item,'hypothesis_id')}/></td>
      <td><StateText value={valueOf(item,'method')}/></td><td><StateText value={valueOf(item,'datasets')}/></td><td><StateText value={valueOf(item,'verdict')}/></td>
      <td><StateText value={valueOf(item,'claim_level')}/></td><td><StateText value={nested(item,'statistics','sigma_lee')?.value}/></td>
    </tr>)}/>}

    {projection&&tab==='hipoteses'&&<DenseTable heads={['Hipótese','Enunciado','Modelo','Baseline','Critério de falsificação']} empty="Nenhuma hipótese corresponde ao filtro." rows={hypotheses.map(item=><tr key={item.id}>
      <td><strong>{shortId(item.id)}</strong><small>{item.id}</small></td><td><StateText value={valueOf(item,'statement')}/></td><td><StateText value={valueOf(item,'model')}/></td>
      <td><StateText value={valueOf(item,'baseline')}/></td><td><StateText value={valueOf(item,'falsification_criterion')}/></td>
    </tr>)}/>}

    {tab==='aprendizado'&&<DenseTable heads={['Filamento','Relação','Tipo','Estado','Suporte','Contradição','Peso','Limite']} empty="Nenhum filamento corresponde ao filtro." rows={filaments.map(item=><tr key={item.id}>
      <td><strong>{item.label}</strong><small>{item.id}</small></td><td>{item.from_label} → {item.to_label}</td><td>{item.kind}</td><td>{item.status}</td>
      <td className="science-num">{item.support}</td><td className="science-num">{item.contradiction}</td><td className="science-num">{item.weight.toFixed(2)}</td><td>{item.boundary||'não publicado'}</td>
    </tr>)}/>}

    {projection&&tab==='graficos'&&<div className="science-graphics">
      <div className="science-graphics-toolbar">
        <div role="group" aria-label="Conteúdo gráfico"><button type="button" className={graphMode==='evidencia'?'active':''} onClick={()=>setGraphMode('evidencia')}>Evidência</button><button type="button" className={graphMode==='relacoes'?'active':''} onClick={()=>setGraphMode('relacoes')}>Relações</button></div>
        {graphMode==='evidencia'&&<><div role="group" aria-label="Gráfico ou tabela"><button type="button" className={plotMode==='grafico'?'active':''} onClick={()=>setPlotMode('grafico')}>Gráfico</button><button type="button" className={plotMode==='tabela'?'active':''} onClick={()=>setPlotMode('tabela')}>Tabela</button></div>
        <button type="button" onClick={()=>downloadCsv('ciencia-evidencia.csv',['Teste','Parâmetro','Valor','Erro -','Erro +','Unidade','Veredito'],quantitative.map(row=>[row.id,row.parameter,row.value,row.lo,row.hi,row.unit,row.verdict]))}>CSV</button>
        <button type="button" disabled={!quantitative.length||plotMode!=='grafico'} onClick={()=>downloadPlotPng(svgRef.current)}>PNG</button></>}
      </div>
      {graphMode==='evidencia'&&(quantitative.length===0?<div className="science-not-published">Evidência quantitativa para forest plot: não publicado.</div>:plotMode==='tabela'
        ?<DenseTable heads={['Teste','Parâmetro','Valor','Erro −','Erro +','Unidade','Veredito']} empty="não publicado" rows={quantitative.map(row=><tr key={row.id}><td>{row.id}</td><td>{row.parameter}</td><td className="science-num">{row.value}</td><td className="science-num">{row.lo??'não publicado'}</td><td className="science-num">{row.hi??'não publicado'}</td><td>{row.unit}</td><td>{row.verdict}</td></tr>)}/>
        :<EvidencePlot svgRef={svgRef} rows={quantitative}/>)}
      {graphMode==='relacoes'&&graphModel&&<NexoGraph model={graphModel} expanded={graphExpanded} selectedId={selectedId} view={graphView} theme={(document.documentElement.dataset.theme==='light'?'light':'dark')} onSelect={setSelectedId} onViewChange={setView}/>}
      <p className="science-chart-source">Fonte: NEXO_SCIENCE_PROJECTION_V1 · TOWER_V06 · campos ausentes permanecem “não publicado”.</p>
    </div>}
  </section>;
}

function EvidencePlot({rows,svgRef}:{rows:Array<{id:string;parameter:string;value:number;lo:number|null;hi:number|null;unit:string;verdict:string}>;svgRef:React.RefObject<SVGSVGElement|null>}){
  const lows=rows.map(row=>row.value-(row.lo??0)),highs=rows.map(row=>row.value+(row.hi??0));
  let min=Math.min(...lows),max=Math.max(...highs);if(min===max){min-=1;max+=1;}
  const x=(value:number)=>220+((value-min)/(max-min))*1040;
  const height=Math.max(260,80+rows.length*42);
  return <div className="science-plot-wrap"><svg ref={svgRef} viewBox={`0 0 1400 ${height}`} role="img" aria-label="Estimativas quantitativas publicadas">
    <rect width="1400" height={height} className="science-plot-bg"/>
    {rows.map((row,index)=>{const y=62+index*42;const left=x(row.value-(row.lo??0)),right=x(row.value+(row.hi??0));return <g key={row.id}>
      <text x="16" y={y+4} className="science-plot-label">{shortId(row.id)}</text>
      <line x1={left} x2={right} y1={y} y2={y} className="science-plot-error"/>
      <circle cx={x(row.value)} cy={y} r="5" className="science-plot-dot"/>
      <text x={1285} y={y+4} className="science-plot-value">{row.value} {row.unit==='não publicado'?'':row.unit}</text>
    </g>;})}
    <line x1="220" x2="1260" y1={height-34} y2={height-34} className="science-plot-axis"/>
    <text x="220" y={height-12} className="science-plot-tick">{min.toPrecision(4)}</text><text x="1260" y={height-12} textAnchor="end" className="science-plot-tick">{max.toPrecision(4)}</text>
  </svg></div>;
}
