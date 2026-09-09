import {ATLAS_THEME,normalizeAtlasTheme,normalizeDomain} from '../design/atlas-tokens.mjs';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function domainFromNode(node){
 if(!node)return'NEXO';
 const lane=String(node.id||'').match(/^lane:(SCIENCE|OLYMPUS|ENGINEERING)$/i)?.[1];
 if(lane)return lane.toUpperCase();
 const system=String(node.system||'').replace(/^system:/,'').toUpperCase();
 if(['SCIENCE','OLYMPUS','ENGINEERING'].includes(system))return system;
 return'NEXO';
}

export function resolveBackground({theme='dark',rendererId='canvas-2d',activeDomain='NEXO',graphDensity=0,filamentMode='off',viewport='DESKTOP_WIDE'}={}){
 const palette=normalizeAtlasTheme(theme);
 const domain=normalizeDomain(activeDomain);
 const density=clamp(Number(graphDensity||0)/160,0,1);
 const isLight=palette===ATLAS_THEME.light;
 const isMobile=String(viewport).toUpperCase()==='MOBILE';
 const isThree=String(rendererId).startsWith('three');
 const isBabylon=String(rendererId).startsWith('babylon');
 const isPixi=String(rendererId).startsWith('pixi');
 const particles=isMobile?0:isBabylon?1:isThree?.86:isPixi?.78:.42;
 const contrastVeil=clamp((isLight?.30:.18)+density*.10+(filamentMode==='all'?.08:0),0,.54);
 const nebula=clamp((isLight?.30:.62)-density*.14+(isThree||isBabylon?.08:0),.16,.82);
 const dust=clamp((isLight?.22:.48)-density*.12+(isPixi?.08:0),.12,.68);
 const stars=isMobile?42:Math.round(110+(1-density)*170+(isThree||isBabylon?90:0));
 return Object.freeze({
  theme:palette.id,
  rendererId,
  domain:domain.id,
  primary:domain.primary,
  secondary:domain.secondary,
  primaryRgb:domain.rgb,
  secondaryRgb:domain.secondaryRgb,
  stage:palette.graph.stage,
  labelBackground:palette.graph.labelBackground,
  labelText:palette.graph.labelText,
  labelDim:palette.graph.labelDim,
  orbit:palette.graph.orbit,
  filament:palette.graph.filament,
  contrastVeil,
  nebula,
  dust,
  stars,
  particles,
  focusHalo:isLight?.28:.58,
  domainAura:isLight?.24:.48
 });
}

export function cssBackgroundVariables(state){
 return{
  '--atlas-domain-rgb':state.primaryRgb,
  '--atlas-domain-secondary-rgb':state.secondaryRgb,
  '--atlas-domain-primary':state.primary,
  '--atlas-domain-secondary':state.secondary,
  '--atlas-stage-base':state.stage,
  '--atlas-graph-label-bg':state.labelBackground,
  '--atlas-graph-label-text':state.labelText,
  '--atlas-background-veil':String(state.contrastVeil),
  '--atlas-nebula-strength':String(state.nebula),
  '--atlas-dust-strength':String(state.dust)
 };
}

export function applyBackgroundState(state,root=globalThis.document?.documentElement){
 if(!root?.style)return state;
 for(const [key,value] of Object.entries(cssBackgroundVariables(state)))root.style.setProperty(key,String(value));
 root.setAttribute('data-atlas-domain',state.domain);
 root.setAttribute('data-atlas-background-renderer',state.rendererId);
 return state;
}
