type Props={
  autoOrbit:boolean;
  reducedMotion:boolean;
  learning:boolean;
  onToggleOrbit:(value:boolean)=>void;
  onToggleLearning:(value:boolean)=>void;
  onRollback?:()=>void;
};

const camera=(type:'reset'|'zoom-in'|'zoom-out'|'focus')=>{
  if(typeof window==='undefined')return;
  window.dispatchEvent(new CustomEvent('atlas:camera-command',{detail:{type}}));
};

export function GraphControlDock({autoOrbit,reducedMotion,learning,onToggleOrbit,onToggleLearning,onRollback}:Props){
  return <div className="graph-control-dock" aria-label="Navegação do Canvas 2,5D">
    <button className={autoOrbit?'active':''} aria-pressed={autoOrbit} disabled={reducedMotion} onClick={()=>onToggleOrbit(!autoOrbit)} title="Ativar ou pausar a órbita automática"><span>◎</span><b>Movimento</b></button>
    <button onClick={()=>camera('reset')} title="Restaurar câmera"><span>↻</span><b>Reset</b></button>
    <button onClick={()=>camera('zoom-in')} title="Aproximar"><span>⌕</span><b>Zoom</b></button>
    <button className={learning?'active':''} aria-pressed={learning} onClick={()=>onToggleLearning(!learning)} title="Mostrar relações de Learning"><span>◇</span><b>Camadas</b></button>
    <button onClick={()=>camera('focus')} title="Centralizar no foco atual"><span>⊙</span><b>Foco</b></button>
    {onRollback?<button onClick={onRollback} title="Usar renderer 2D"><span>▱</span><b>2D</b></button>:null}
  </div>;
}
