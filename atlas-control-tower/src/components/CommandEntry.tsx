type CommandEntryProps={
  value:string;
  onChange:(value:string)=>void;
  onSubmit:()=>void;
};

export function CommandEntry({value,onChange,onSubmit}:CommandEntryProps){
  return <label className="global-search atlas-command-trigger" aria-label="Busca e comandos do Atlas">
    <span aria-hidden="true">⌕</span>
    <input
      id="global-search"
      aria-label="Buscar no Atlas"
      value={value}
      onChange={event=>onChange(event.target.value)}
      onKeyDown={event=>{if(event.key==='Enter')onSubmit()}}
      placeholder="Buscar campanha, claim, teste…"
      autoComplete="off"
    />
    <kbd>⌘ K</kbd>
  </label>;
}
