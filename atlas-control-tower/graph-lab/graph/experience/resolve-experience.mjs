import {experienceById} from './experience-presets.mjs';
import {resolveRenderer} from '../renderers/renderer-registry.mjs';

export const VIEWPORT_PROFILES=Object.freeze({
 DESKTOP_WIDE:Object.freeze({id:'DESKTOP_WIDE',minWidth:1280,layoutSpacing:1.28,fitPadding:1.15,maxLabels:30,maxVisibleNodes:150}),
 DESKTOP_COMPACT:Object.freeze({id:'DESKTOP_COMPACT',minWidth:1024,layoutSpacing:1.14,fitPadding:1.08,maxLabels:24,maxVisibleNodes:120}),
 TABLET:Object.freeze({id:'TABLET',minWidth:761,layoutSpacing:.96,fitPadding:1,maxLabels:18,maxVisibleNodes:85}),
 MOBILE:Object.freeze({id:'MOBILE',minWidth:0,layoutSpacing:.72,fitPadding:.92,maxLabels:9,maxVisibleNodes:55})
});

export function viewportProfile(width=globalThis.innerWidth||1440){
 const w=Number(width||0);
 if(w>=VIEWPORT_PROFILES.DESKTOP_WIDE.minWidth)return VIEWPORT_PROFILES.DESKTOP_WIDE;
 if(w>=VIEWPORT_PROFILES.DESKTOP_COMPACT.minWidth)return VIEWPORT_PROFILES.DESKTOP_COMPACT;
 if(w>=VIEWPORT_PROFILES.TABLET.minWidth)return VIEWPORT_PROFILES.TABLET;
 return VIEWPORT_PROFILES.MOBILE;
}

export function resolveExperience({experienceId='OPERATIONAL',width=globalThis.innerWidth||1440,theme,rendererOverride}={}){
 const experience=experienceById(experienceId);
 const viewport=viewportProfile(width);
 const mobile=viewport.id==='MOBILE';
 const breakthrough=experience.id==='BREAKTHROUGH';
 const rendererId=resolveRenderer(rendererOverride||experience.rendererId,{mobile}).id;
 const layoutSpacing=mobile?Math.min(experience.layoutSpacing,viewport.layoutSpacing):Math.max(experience.layoutSpacing,viewport.layoutSpacing*.96);
 const fitPadding=mobile?viewport.fitPadding:Math.max(experience.fitPadding,viewport.fitPadding*.96);
 const mobileLabelLimit=breakthrough?6:viewport.maxLabels;
 const mobileNodeLimit=breakthrough?Math.min(42,viewport.maxVisibleNodes):viewport.maxVisibleNodes;
 const maxLabels=Math.min(experience.maxLabels,mobile?mobileLabelLimit:viewport.maxLabels);
 const maxVisibleNodes=Math.min(experience.maxVisibleNodes,mobile?mobileNodeLimit:viewport.maxVisibleNodes);
 return Object.freeze({
  ...experience,
  rendererId,
  theme:theme||experience.theme,
  viewport:viewport.id,
  layoutSpacing,
  fitPadding,
  maxLabels,
  maxVisibleNodes,
  filamentMode:mobile&&!breakthrough?'off':experience.filamentMode,
  motion:mobile?'off':experience.motion,
  drift:mobile?0:experience.drift,
  pulseSpeed:mobile?Math.min(.7,experience.pulseSpeed):experience.pulseSpeed,
  semanticZoom:Boolean(experience.semanticZoom),
  domainFields:Boolean(experience.domainFields),
  focusTunnel:Boolean(experience.focusTunnel),
  mobileSemanticAggressive:breakthrough&&mobile
 });
}
