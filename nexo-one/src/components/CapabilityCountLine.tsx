export interface CapabilityCountValues{
  total:number;pass:number;unverified:number;unknown:number;retired:number;blocked?:number;
}
export function CapabilityCountLine({counts,compact=false}:{counts:CapabilityCountValues;compact?:boolean}){
  const outside=Math.max(0,counts.total-counts.pass);
  return <div className={`capability-count-line${compact?' compact':''}`} data-capability-total={counts.total} data-capability-outside-pass={outside}>
    <strong>{counts.total} registradas</strong><span>· {counts.pass} verificadas</span><span>· {counts.unverified} sem prova</span>
    <span>· {counts.unknown} {counts.unknown===1?'desconhecida':'desconhecidas'}</span><span>· {counts.retired} {counts.retired===1?'retirada':'retiradas'}</span>
    {!!counts.blocked&&<span>· {counts.blocked} {counts.blocked===1?'bloqueada':'bloqueadas'}</span>}
    <small>{outside} fora de PASS (de {counts.total})</small>
  </div>;
}
