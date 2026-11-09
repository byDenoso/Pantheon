import {useEffect,useMemo,useRef,useState} from 'react';
import {activityBins,type ActivityBin,type DatedEvent} from './activity-model.ts';
import './experience.css';

export default function ActivityChart({events,end,lang='pt'}:{events:readonly DatedEvent[];end:number;lang?:'pt'|'en'}){
  const [hours,setHours]=useState(24),[kind,setKind]=useState('all'),[width,setWidth]=useState(600);
  const [chartStatus,setChartStatus]=useState<'loading'|'ready'|'error'>('loading');
  const host=useRef<HTMLDivElement>(null),displayedView=useRef<string|null>(null),en=lang==='en';
  const names={mural:en?'Mural posts':'Mural',resultado:en?'Result records':'Resultados',resumo:en?'Change records':'Mudanças'};
  const bins=useMemo(()=>activityBins(events,end,hours),[events,end,hours]);
  const rows=useMemo(()=>bins.filter(row=>kind==='all'||row.kind===kind),[bins,kind]);
  const total=rows.reduce((sum,row)=>sum+row.count,0);
  const time=useMemo(()=>new Intl.DateTimeFormat(en?'en-GB':'pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}).format,[en]);
  useEffect(()=>{const node=host.current;if(!node)return;const observer=new ResizeObserver(([entry])=>setWidth(Math.max(260,Math.round(entry.contentRect.width))));observer.observe(node);return()=>observer.disconnect();},[]);
  useEffect(()=>{
    const node=host.current;
    if(!node)return;
    let disposed=false;
    void import('@observablehq/plot').then(Plot=>{
      if(disposed)return;
      const chart=Plot.plot({
        width,height:210,marginLeft:36,marginBottom:42,
        style:{background:'transparent',color:'inherit',fontFamily:'inherit',fontSize:'13px'},
        x:{type:'utc',domain:[end-hours*3_600_000,end],ticks:width<450?4:6,tickFormat:d=>time(Number(d)),label:en?'Registration time · Brasília':'Horário do registro · Brasília'},
        y:{grid:true,label:en?'Records':'Registros',ticks:4,tickFormat:d=>Number.isInteger(Number(d))?String(d):''},
        color:{domain:['mural','resultado','resumo'],range:['#24b8da','#5e92fa','#efad5e']},
        marks:[
          Plot.rectY(rows,{
            x1:'at',x2:(row:ActivityBin)=>row.at+3_600_000,y:'count',fill:'kind',insetLeft:1,insetRight:1,
            title:(row:ActivityBin)=>`${time(row.at)} · ${names[row.kind]}: ${row.count}`,tip:true
          }),
          Plot.ruleY([0])
        ]
      });
      const view=`${hours}:${kind}`;
      if(displayedView.current!==view)chart.classList.add('nx-chart-enter');
      displayedView.current=view;
      node.replaceChildren(chart);
      setChartStatus('ready');
    }).catch(()=>{
      if(disposed)return;
      node.replaceChildren();
      setChartStatus('error');
    });
    return()=>{disposed=true;};
  },[rows,width,hours,kind,end,en,time]);
  return <section className="nx-activity-chart" aria-label={en?'Recorded activity':'Atividade registrada'}>
    <div className="nx-chart-heading"><div><p className="nx-chart-kicker">{en?'Activity in this read':'Atividade nesta leitura'}</p><h2>{total} {en?'records':'registros'} <span>/ {hours} h</span></h2></div><div className="nx-chart-period" role="group" aria-label={en?'Time window':'Janela de tempo'}>{[6,24,72].map(n=><button key={n} type="button" aria-pressed={hours===n} onClick={()=>setHours(n)}>{n} h</button>)}</div></div>
    <div className="nx-chart-filters" role="group" aria-label={en?'Record type':'Tipo de registro'}>{[['all',en?'All':'Todos'],...Object.entries(names)].map(([key,label],i)=><button key={key} type="button" aria-pressed={kind===key} onClick={()=>setKind(key)}><i style={{background:['currentColor','#24b8da','#5e92fa','#efad5e'][i]}}/>{label}</button>)}</div>
    <div className="nx-chart-canvas" hidden={chartStatus==='error'}>
      <div ref={host} role={chartStatus==='ready'?'img':undefined} aria-label={chartStatus==='ready'?`${total} ${en?'records in':'registros em'} ${hours} h`:undefined}/>
      {chartStatus==='loading'&&<div className="nx-chart-loading">
        <p role="status">{en?'Loading chart…':'Carregando gráfico…'}</p>
        <div aria-hidden="true">
          <span className="ck-skeleton-line title"/>
          <span className="ck-skeleton-line text"/>
          <span className="ck-skeleton-line label"/>
        </div>
      </div>}
    </div>
    <p className="nx-chart-caption">{en?'Counts records in a bounded read; no record does not prove no activity.':'Conta os registros do recorte limitado; ausência de registro não prova ausência de atividade.'} {time(end-hours*3_600_000)} — {time(end)} · {en?'Brasília time':'Brasília'}</p>
    {chartStatus==='error'&&<p role="status">{en?'Consult the data table below.':'Consulte os valores na tabela abaixo.'}</p>}
    <details className="nx-chart-table"><summary>{en?'View data':'Ver dados da leitura'}</summary><div><table><caption>{en?'Record counts by one-hour interval':'Registros por intervalo de uma hora'}</caption><thead><tr><th>{en?'Start · Brasília':'Início · Brasília'}</th><th>{en?'Type':'Tipo'}</th><th>{en?'Records':'Registros'}</th></tr></thead><tbody>{rows.map(row=><tr key={`${row.at}:${row.kind}`}><td>{new Intl.DateTimeFormat(en?'en-GB':'pt-BR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}).format(row.at)}</td><td>{names[row.kind]}</td><td>{row.count}</td></tr>)}</tbody></table></div></details>
  </section>;
}
