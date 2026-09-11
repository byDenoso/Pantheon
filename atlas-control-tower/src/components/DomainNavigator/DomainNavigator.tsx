import {useEffect,useMemo,useState} from 'react';
import {useNavigate} from 'react-router-dom';

type Position={x:number;y:number;z:number};
type Domain={id:string;label:string;summary:string;status:string;entityCount:number|null;activity:number|null;relationCount:number;relationStrength:number;position:Position};
type Relation={id:string;source:string;target:string;type:string;strength:number|null;declared:true};
type Model={available:boolean;universeId:string;universeLabel:string;domains:Domain[];relations:Relation[]};
type Props={universeId:string;model:Model};

const point=(position:Position)=>({x:position.x*10,y:position.y*6.5});
const relationWidth=(strength:number|null)=>strength===null?1.4:Math.min(5.5,1.2+Math.sqrt(Math.max(0,strength))*.48);
const relationPath=(a:Position,b:Position)=>{const p1=point(a),p2=point(b);const mx=(p1.x+p2.x)/2,my=(p1.y+p2.y)/2;const bow=Math.min(54,Math.abs(p2.x-p1.x)*.08+16);return `M ${p1.x} ${p1.y} Q ${mx} ${my-bow} ${p2.x} ${p2.y}`};

export function DomainNavigator({universeId,model}:Props){
  const navigate=useNavigate();
  const [selectedId,setSelectedId]=useState<string|null>(null);
  useEffect(()=>{setSelectedId(null)},[universeId]);
  const selected=model.domains.find(domain=>domain.id===selectedId)||null;
  const byId=useMemo(()=>new Map(model.domains.map(domain=>[domain.id,domain])),[model.domains]);
  const related=useMemo(()=>{if(!selectedId)return new Set<string>();const ids=new Set<string>([selectedId]);for(const relation of model.relations){if(relation.source===selectedId)ids.add(relation.target);if(relation.target===selectedId)ids.add(relation.source)}return ids},[model.relations,selectedId]);
  const open=(domain:Domain)=>navigate(`/universes/${universeId}/${domain.id}`);
  const onKeyDown=(event:React.KeyboardEvent<SVGGElement>,domain:Domain)=>{if(event.key==='Enter'){event.preventDefault();open(domain)}else if(event.key===' '){event.preventDefault();setSelectedId(domain.id)}else if(event.key==='Escape'){event.preventDefault();setSelectedId(null)}};

  if(!model.domains.length)return <section className="domain-navigator-empty"><b>Nenhum domínio publicado.</b><p>O Atlas não criou uma taxonomia visual para preencher o vazio.</p></section>;
  return <section className="domain-navigator-shell" aria-label={`Navegador de domínios de ${model.universeLabel}`}>
    <div className="domain-navigator-stage" onClick={()=>setSelectedId(null)}>
      <div className="domain-navigator-heading"><span>MAPA 2.5D</span><h2>{model.universeLabel}</h2><p>Clique para inspecionar. Enter ou duplo clique abre o domínio.</p></div>
      <svg className="domain-navigator-svg" viewBox="0 0 1000 650" role="img" aria-label={`Mapa navegável de ${model.domains.length} domínios`}>
        <defs>
          <radialGradient id="domainHubGlow"><stop offset="0" stopColor="#8de9ff" stopOpacity="1"/><stop offset=".45" stopColor="#4b8cff" stopOpacity=".88"/><stop offset="1" stopColor="#5f4bd9" stopOpacity=".08"/></radialGradient>
          <linearGradient id="domainLinkGradient" x1="0" x2="1"><stop stopColor="#48d9ff"/><stop offset=".55" stopColor="#7168ff"/><stop offset="1" stopColor="#ba7cff"/></linearGradient>
          <filter id="domainGlow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="7" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <g className="domain-depth-rings" aria-hidden="true"><ellipse className="domain-depth-ring r1" cx="500" cy="350" rx="330" ry="205"/><ellipse className="domain-depth-ring r2" cx="500" cy="350" rx="250" ry="145"/><ellipse className="domain-depth-ring r3" cx="500" cy="350" rx="155" ry="88"/></g>
        <g className="domain-relations" aria-hidden="true">{model.relations.map(relation=>{const a=byId.get(relation.source),b=byId.get(relation.target);if(!a||!b)return null;const active=!selectedId||relation.source===selectedId||relation.target===selectedId;return <path key={relation.id} className={`domain-relation ${active?'active':'dim'}`} d={relationPath(a.position,b.position)} strokeWidth={relationWidth(relation.strength)}/>})}</g>
        <g className="domain-hub" aria-hidden="true"><circle cx="500" cy="350" r="64" fill="url(#domainHubGlow)" filter="url(#domainGlow)"/><circle className="domain-hub-ring" cx="500" cy="350" r="88"/><circle className="domain-hub-ring secondary" cx="500" cy="350" r="112"/><text x="500" y="354" textAnchor="middle">{model.universeLabel}</text><text className="domain-hub-sub" x="500" y="376" textAnchor="middle">{model.domains.length} domínios publicados</text></g>
        <g className="domain-nodes">{model.domains.map(domain=>{const p=point(domain.position);const isSelected=domain.id===selectedId;const dim=Boolean(selectedId&&!related.has(domain.id));const radius=isSelected?24:20+Math.max(-2,Math.min(3,domain.position.z));return <g key={domain.id} className={`domain-node ${isSelected?'selected':''} ${dim?'dim':''}`} transform={`translate(${p.x} ${p.y})`} role="button" tabIndex={0} aria-label={`Abrir domínio ${domain.label}`} onClick={event=>{event.stopPropagation();setSelectedId(domain.id)}} onDoubleClick={event=>{event.stopPropagation();open(domain)}} onKeyDown={event=>onKeyDown(event,domain)}><circle className="domain-node-halo" r={radius+15}/><circle className="domain-node-orbit" r={radius+9}/><circle className="domain-node-core" r={radius}/><text className="domain-node-code" y={4} textAnchor="middle">{domain.id}</text><text className="domain-node-label" y={radius+28} textAnchor="middle">{domain.label}</text><text className="domain-node-meta" y={radius+43} textAnchor="middle">{domain.relationCount} conexões</text></g>})}</g>
      </svg>
    </div>
    <aside className={`domain-inspector ${selected?'open':''}`} aria-live="polite">
      {selected?<><span className="panel-kicker">DOMÍNIO SELECIONADO</span><strong className="domain-inspector-code">{selected.id}</strong><h3>{selected.label}</h3><p>{selected.summary||'Sem resumo publicado.'}</p><dl><div><dt>Status</dt><dd>{selected.status||'—'}</dd></div><div><dt>Relações</dt><dd>{selected.relationCount}</dd></div><div><dt>Testes compartilhados</dt><dd>{selected.relationStrength||'—'}</dd></div></dl><button type="button" className="domain-open-button" onClick={()=>open(selected)}>Abrir domínio →</button></>:<><span className="panel-kicker">NAVEGAÇÃO</span><h3>Escolha um domínio</h3><p>As conexões vêm de relações publicadas no contrato. Nenhum filamento é inferido pela interface.</p></>}
    </aside>
  </section>;
}
