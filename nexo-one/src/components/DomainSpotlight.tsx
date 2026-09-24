import {canonicalDomain,DOMAIN_ORDER} from '../viewmodels/domainPalette.ts';
import {domainLabel} from '../viewmodels/tokens.ts';

// Isola um domínio numa lista. Cada chip leva a cor do domínio; "Todos" limpa.
export function DomainSpotlight({domains,value,onChange,label='Destacar domínio'}:{
  domains:Array<{domain:string;count:number}>;
  value:string|null;
  onChange:(domain:string|null)=>void;
  label?:string;
}){
  if(domains.length<2)return null;
  const ordered=[...domains].sort((a,b)=>{
    const ia=DOMAIN_ORDER.indexOf(canonicalDomain(a.domain) as typeof DOMAIN_ORDER[number]);
    const ib=DOMAIN_ORDER.indexOf(canonicalDomain(b.domain) as typeof DOMAIN_ORDER[number]);
    return (ia<0?99:ia)-(ib<0?99:ib)||a.domain.localeCompare(b.domain);
  });
  return <div className="domain-spotlight" role="group" aria-label={label}>
    <button type="button" className={value===null?'active':''} aria-pressed={value===null} onClick={()=>onChange(null)}>Todos</button>
    {ordered.map(item=><button type="button" key={item.domain} data-domain={canonicalDomain(item.domain)}
      className={value===item.domain?'active':''} aria-pressed={value===item.domain}
      onClick={()=>onChange(value===item.domain?null:item.domain)}>
      <i aria-hidden="true"/>{domainLabel(item.domain)}<b>{item.count}</b>
    </button>)}
  </div>;
}

export function countByDomain<T extends {domain?:unknown}>(rows:T[]):Array<{domain:string;count:number}>{
  const counts=new Map<string,number>();
  for(const row of rows){const key=String(row.domain??'').trim();if(key)counts.set(key,(counts.get(key)??0)+1);}
  return [...counts].map(([domain,count])=>({domain,count}));
}
