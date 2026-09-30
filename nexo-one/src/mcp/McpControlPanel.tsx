import {useCallback,useEffect,useRef,useState} from 'react';
import {Fingerprint,MetaRow,StatusBadge} from '../components/primitives.tsx';
import {DetailDrawer} from '../components/DetailDrawer.tsx';
import {DenseTable,EvidencePlot} from '../features/ScienceWorkspace.tsx';
import {useNexoStore} from '../data/NexoStore.tsx';
import {callReadOnlyTool,MCP_ENDPOINT,readMcpStatus,type McpStatus,type McpTool} from './client.ts';
import './mcp-control.css';

const show=(value:unknown)=>value===null||value===undefined||value===''?'Indisponível':typeof value==='object'?JSON.stringify(value):String(value);
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const labels:Record<string,string>={campaign:'Campanha',program:'Programa',campaigns:'Campanhas',tests:'Testes',runs:'Execuções',results:'Resultados',evidence:'Evidências',observations:'Observações',syntheses:'Sínteses',items:'Registros',structure:'Estrutura científica',investigation:'Investigação',policy:'Política',provenance:'Proveniência'};

function ResultView({payload}:{payload:Record<string,unknown>}){
  const [selected,setSelected]=useState<Record<string,unknown>|null>(null);
  const svgRef=useRef<SVGSVGElement|null>(null);
  const close=useCallback(()=>setSelected(null),[]);
  const groups=Object.entries(payload).filter(([,value])=>Array.isArray(value));
  const structured=Object.entries(payload).filter(([key,value])=>['campaign','program','structure','investigation','policy'].includes(key)&&value&&typeof value==='object');
  const observationItems=(Array.isArray(payload.items)?payload.items:Array.isArray(payload.observations)?payload.observations:[]).map(record).filter(item=>item.kind==='scalar'&&typeof item.value==='number');
  const sameMetric=new Set(observationItems.map(item=>`${item.metricId}|${item.unit}`)).size===1;
  const quantitative=observationItems.map(item=>({id:show(item.label||item.id),parameter:show(item.metricId),value:Number(item.value),lo:typeof record(item.uncertainty).low==='number'?Number(record(item.uncertainty).low):null,hi:typeof record(item.uncertainty).high==='number'?Number(record(item.uncertainty).high):null,unit:show(item.unit),verdict:show(item.status)}));
  return <div className="mcp-result-human">
    <MetaRow items={['authority','sourceVersion','freshness','generatedAt'].map(term=>({term,value:show(payload[term])}))}/>
    <Fingerprint value={typeof payload.fingerprint==='string'?payload.fingerprint:null}/>
    {sameMetric&&quantitative.length>0&&<EvidencePlot rows={quantitative} svgRef={svgRef}/>}
    {structured.map(([key,value])=><section key={key}><h3>{labels[key]}</h3>{['campaign','program'].includes(key)?<><button type="button" onClick={()=>setSelected(record(value))}>{show(record(value).label||record(value).id)}</button><p>{show(record(value).question||record(value).summary)}</p></>:<details><summary>Ver conteúdo estruturado</summary><pre>{JSON.stringify(value,null,2)}</pre></details>}</section>)}
    {groups.map(([key,value])=>key==='provenance'?<details key={key}><summary>Proveniência</summary><pre>{JSON.stringify(value,null,2)}</pre></details>:<section key={key}><h3>{labels[key]||key} · {(value as unknown[]).length}</h3><DenseTable heads={['Entidade','Estado / tipo','Valor','Origem']} empty="Nenhum registro publicado para esta consulta." rows={(value as unknown[]).map((raw,index)=>{const item=record(raw);return <tr key={String(item.id||index)}><td><button type="button" onClick={()=>setSelected(item)}>{show(item.label||item.title||item.id)}</button>{Boolean(item.id)&&<a href={`#/e/${encodeURIComponent(String(item.id))}`}>Abrir no Atlas ↗</a>}</td><td>{show(item.status||item.kind||item.type)}</td><td>{show(item.value)} {item.unit?show(item.unit):''}</td><td>{show(item.sourceRef)}</td></tr>;})}/></section>)}
    {!groups.length&&!structured.length&&<dl>{Object.entries(payload).filter(([key])=>!['fingerprint','freshness','sourceVersion','authority','generatedAt'].includes(key)).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{show(value)}</dd></div>)}</dl>}
    {selected&&<DetailDrawer title={show(selected.label||selected.title||selected.id)} code={typeof selected.id==='string'?selected.id:undefined} kicker="Consulta MCP · Atlas" fields={Object.entries(selected).map(([key,value])=>[key,show(value)])} onClose={close}><a href={`#/e/${encodeURIComponent(String(selected.id||''))}`}>Abrir entidade no Atlas ↗</a></DetailDrawer>}
  </div>;
}

export function McpControlPanel(){
  const {system}=useNexoStore();
  const atlasFingerprint=system.state?.bus?.fingerprint;
  const [status,setStatus]=useState<McpStatus|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const [selected,setSelected]=useState(''),[values,setValues]=useState<Record<string,string>>({}),[payload,setPayload]=useState<Record<string,unknown>|null>(null);
  const [callError,setCallError]=useState(''),[running,setRunning]=useState(false),[duration,setDuration]=useState<number|null>(null),[resultMode,setResultMode]=useState<'human'|'json'>('human');
  const execution=useRef<AbortController|null>(null);
  const refresh=useCallback(async(signal?:AbortSignal)=>{
    setLoading(true);setError('');
    try{const next=await readMcpStatus(signal);setStatus(next);setSelected(current=>current||next.tools[0]?.name||'');}
    catch(reason){if(!signal?.aborted){setStatus(null);setError(reason instanceof Error?reason.message:'Falha ao consultar o servidor MCP.');}}
    finally{if(!signal?.aborted)setLoading(false);}
  },[]);
  useEffect(()=>{const controller=new AbortController();void refresh(controller.signal);return()=>{controller.abort();execution.current?.abort();};},[refresh]);
  const tool=status?.tools.find(item=>item.name===selected);
  const choose=(name:string)=>{setSelected(name);setValues({});setPayload(null);setCallError('');setDuration(null);};
  const run=async()=>{
    if(!tool||running)return;
    setRunning(true);setCallError('');setPayload(null);setDuration(null);
    const controller=new AbortController();execution.current=controller;const started=performance.now();
    try{
      const args:Record<string,unknown>={};
      for(const [key,schema] of Object.entries(tool.inputSchema.properties||{})){const raw=values[key];if(raw!==undefined&&raw!=='')args[key]=schema.type==='number'||schema.type==='integer'?Number(raw):schema.type==='boolean'?raw==='true':raw;}
      setPayload(await callReadOnlyTool(tool,args,controller.signal));
    }catch(reason){if(!controller.signal.aborted)setCallError(reason instanceof Error?reason.message:'A consulta falhou.');}
    finally{if(!controller.signal.aborted){setDuration(Math.round(performance.now()-started));setRunning(false);void refresh();}}
  };
  return <section className="mcp-control" aria-label="Controle do Web MCP" data-mcp-control-ready={status?'true':'false'}>
    <header className="mcp-control-heading"><div><h2>Web MCP</h2><p>Interface programática do NEXO. O console consulta as ferramentas públicas do servidor.</p></div><button type="button" disabled={loading||running} onClick={()=>void refresh()}>Atualizar servidor</button></header>
    {loading&&!status&&<p role="status">Consultando servidor MCP…</p>}
    {error&&<p role="alert">{error} Tente atualizar o servidor.</p>}
    {status&&<>
      <section className="mcp-control-section"><h3>Servidor <StatusBadge state={status.status}/></h3>{status.status==='PROTOCOL_ONLY'?<p role="status">Servidor conectado pelo protocolo MCP. Esta versão ainda não fornece os metadados HTTP; fingerprint, proveniência, saúde da fonte e telemetria estão indisponíveis. As ferramentas abaixo vêm do discovery real do servidor.</p>:status.status!=='READY'&&<p role="status">Fonte científica indisponível. As políticas continuam disponíveis.</p>}
        <MetaRow items={[["Nome",status.server.name],["Versão",status.server.version],["Endpoint",MCP_ENDPOINT],["Transporte",status.server.transport],["Autoridade",status.authority],["Modo",status.server.mode],["Acesso",status.server.access],["generated_at",status.generated_at],["Última leitura",status.last_read_at],["Freshness",status.freshness],["sourceVersion",status.sourceVersion]].map(([term,value])=>({term:String(term),value:show(value)}))}/>
        {atlasFingerprint&&status.projectionFingerprint&&atlasFingerprint!==status.projectionFingerprint&&<p role="status">O Atlas e o MCP estão em gerações distintas. Atualize o Atlas para reconciliar a publicação.</p>}
        <p>Fingerprint científico</p><Fingerprint value={status.fingerprint}/><p>Fingerprint da projeção Tower</p><Fingerprint value={status.projectionFingerprint}/>
        <details><summary>Proveniência do servidor</summary>{status.provenance===null?<p>Proveniência indisponível nesta versão do servidor.</p>:<pre>{JSON.stringify(status.provenance,null,2)}</pre>}</details>
      </section>
      <section className="mcp-control-section"><h3>Ferramentas · {status.tool_count}</h3>{status.tools.length===0?<p>Nenhuma ferramenta disponível.</p>:<div className="mcp-tool-grid">{status.tools.map(item=><article key={item.name} className={item.name===selected?'selected':''}><button type="button" disabled={running} aria-pressed={item.name===selected} onClick={()=>choose(item.name)}><strong>{item.name}</strong></button><p>{item.description}</p><small>{item.category} · {item.access} · {item.annotations.readOnlyHint===null?'Indisponível':item.annotations.readOnlyHint?'read-only':'operacional'} · {item.availability}</small><details><summary>Contrato e annotations</summary><dl>{Object.entries(item.annotations).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{show(value)}</dd></div>)}</dl><p>Entrada: {Object.entries(item.inputSchema.properties||{}).map(([key,field])=>`${key}: ${field.type}${item.inputSchema.required?.includes(key)?' (obrigatório)':''}`).join(', ')||'Sem argumentos'}</p><pre>{JSON.stringify(item.inputSchema,null,2)}</pre></details></article>)}</div>}</section>
      <section className="mcp-control-section"><h3>Console MCP</h3><form onSubmit={event=>{event.preventDefault();void run();}}>
        <label>Ferramenta<select value={selected} disabled={running} onChange={event=>choose(event.target.value)}>{status.tools.map(item=><option key={item.name} value={item.name}>{item.name}</option>)}</select></label>
        <div className="mcp-argument-grid">{Object.entries(tool?.inputSchema.properties||{}).map(([key,schema])=><label key={key}>{key}{tool?.inputSchema.required?.includes(key)?' *':''}{schema.type==='boolean'?<select value={values[key]||''} onChange={event=>setValues(current=>({...current,[key]:event.target.value}))}><option value="">Não especificado</option><option value="true">true</option><option value="false">false</option></select>:<input type={schema.type==='integer'||schema.type==='number'?'number':'text'} min={schema.minimum} max={schema.maximum} maxLength={schema.maxLength} required={tool?.inputSchema.required?.includes(key)} value={values[key]||''} disabled={running} onChange={event=>setValues(current=>({...current,[key]:event.target.value}))}/>}</label>)}</div>
        {!Object.keys(tool?.inputSchema.properties||{}).length&&<p>Esta consulta não exige argumentos.</p>}
        <button type="submit" disabled={running||!tool||!['AVAILABLE','DISCOVERED'].includes(tool.availability)||tool.annotations?.readOnlyHint!==true}>{running?'Executando…':'Executar consulta'}</button>
      </form>{callError&&<p role="alert">{callError}</p>}{duration!==null&&<p role="status">Tempo de execução: {duration} ms</p>}
      {payload&&<div aria-live="polite"><div className="mcp-result-toggle" role="group" aria-label="Formato do resultado"><button type="button" aria-pressed={resultMode==='human'} onClick={()=>setResultMode('human')}>Visão humana</button><button type="button" aria-pressed={resultMode==='json'} onClick={()=>setResultMode('json')}>JSON estruturado</button></div>{resultMode==='json'?<pre>{JSON.stringify(payload,null,2)}</pre>:<ResultView payload={payload}/>}</div>}</section>
      <section className="mcp-control-section"><h3>Observabilidade</h3>{status.telemetry?<><p>{status.tools.filter(item=>item.availability==='AVAILABLE').length} ferramentas disponíveis · {status.telemetry.total} chamadas · {status.telemetry.errors} erros</p><p>Telemetria desta instância do servidor ({status.telemetry.scope}). Argumentos não são registrados. Cache de execução: indisponível quando não observado.</p><DenseTable heads={['Ferramenta','Duração','Estado','Horário','Fingerprint','Cache','Erro']} empty="Nenhuma chamada observada nesta instância." rows={status.telemetry.calls.map((call,index)=><tr key={index}><td>{call.tool}</td><td>{call.duration_ms} ms</td><td>{call.status}</td><td>{call.timestamp}</td><td><Fingerprint value={call.fingerprint}/></td><td>{call.cache}</td><td>{show(call.error)}</td></tr>)}/></>:<p>Telemetria indisponível nesta versão do servidor. O tempo de execução de cada consulta é medido pelo console.</p>}</section>
    </>}
  </section>;
}
