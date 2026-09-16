import {useCallback,useEffect,useMemo,useState} from 'react';
import type {AtlasContext} from './api/types';

export type AtlasArea='graphs'|'observatory'|'lab'|'universe'|'cockpit'|'atividade'|'login'|'landing';
export type AtlasRoute={area:AtlasArea;path:string;context:AtlasContext};

const AREAS:AtlasArea[]=['graphs','observatory','lab','universe','cockpit','atividade','login','landing'];
export const PUBLIC_PATH:Record<AtlasArea,string>={graphs:'mapa',observatory:'pesquisa',universe:'pesquisa',lab:'laboratorio',cockpit:'cockpit',atividade:'atividade',login:'login',landing:''};
const LEGACY_PREFIX_TO_AREA:Record<string,AtlasArea>={graphs:'graphs',observatory:'observatory',universe:'universe',lab:'lab'};
export const PRIVATE_AREAS:ReadonlySet<AtlasArea>=new Set(['cockpit','atividade','lab']);
const CONTEXT_KEYS:Array<keyof AtlasContext>=['domain','query','dataset','source','period','redshift','status','scope','kind','entity'];
const PRODUCT_DOMAINS=new Set(['science','engineering','olympus']);

export function isPrivateArea(area:AtlasArea){return PRIVATE_AREAS.has(area)}
export function normalizeGraphHydrationId(id:string){return id.replace(/^domain:(.+)$/i,(_m,rest:string)=>`domain:${rest.toUpperCase()}`)}

function resolveAppBase(){const env=(import.meta as unknown as{env?:Record<string,string|undefined>}).env;if(!env)return'/';return String(import.meta.env.BASE_URL||'/').replace(/\/+$/,'')||'/'}
const APP_BASE=resolveAppBase();
function stripAppBase(pathname:string){if(APP_BASE==='/')return pathname||'/';if(pathname===APP_BASE)return'/';if(pathname.startsWith(`${APP_BASE}/`))return pathname.slice(APP_BASE.length)||'/';return pathname||'/'}
function withAppBase(pathname:string){if(APP_BASE==='/')return pathname;return`${APP_BASE}${pathname.startsWith('/')?pathname:`/${pathname}`}`}
function normalizeDomain(value:string|null){const v=value?.trim();return v?v.toUpperCase():undefined}

export function rewriteLegacyPublicPath(pathname:string):string|null{
  const segments=pathname.split('/').filter(Boolean);const first=segments[0];if(!first)return null;
  const area=LEGACY_PREFIX_TO_AREA[first];if(!area)return null;
  const prefix=PUBLIC_PATH[area];if(first===prefix)return null;
  return`/${[prefix,...segments.slice(1)].filter(Boolean).join('/')}`;
}

const AREA_BY_SEGMENT:Record<string,AtlasArea>={mapa:'graphs',pesquisa:'observatory',laboratorio:'lab',cockpit:'cockpit',atividade:'atividade',login:'login',...LEGACY_PREFIX_TO_AREA};

export function readAtlasRoute(location:Pick<Location,'pathname'|'search'>=window.location):AtlasRoute{
  const pathname=stripAppBase(location.pathname||'/');
  const segments=pathname.split('/').filter(Boolean);
  const areaSegment=segments[0];
  const query=new URLSearchParams(location.search);
  let area:AtlasArea=(areaSegment&&AREA_BY_SEGMENT[areaSegment])||(areaSegment&&AREAS.includes(areaSegment as AtlasArea)?areaSegment as AtlasArea:'graphs');
  if(area==='observatory'&&query.get('scope')==='universo')area='universe';
  const graphPath=area==='graphs'&&segments.length>1?segments.slice(1).map(decodeURIComponent):undefined;
  const domainSegment=graphPath?.[0]&&PRODUCT_DOMAINS.has(graphPath[0].toLowerCase())?graphPath[0]:undefined;
  const context=Object.fromEntries(CONTEXT_KEYS.flatMap(key=>{const value=key==='domain'?normalizeDomain(query.get(key)||domainSegment||null):query.get(key)?.trim();return value?[[key,value]]:[]})) as AtlasContext;
  if(graphPath?.length)context.graphPath=graphPath;
  return{area,path:pathname,context};
}

export function routeFor(area:AtlasArea,context:AtlasContext={}):string{
  const graphPath=area==='graphs'?context.graphPath?.filter(Boolean):undefined;
  const domain=context.domain?.trim().toLowerCase();
  const prefix=PUBLIC_PATH[area];
  const logicalPath=area==='graphs'&&graphPath?.length?`/${prefix}/${graphPath.map(encodeURIComponent).join('/')}`:area==='graphs'&&domain?`/${prefix}/${encodeURIComponent(domain)}`:prefix?`/${prefix}`:'/';
  const query=new URLSearchParams();
  for(const key of CONTEXT_KEYS){if(key==='domain'||key==='scope'||!context[key])continue;query.set(key,String(context[key]))}
  if(area==='universe')query.set('scope','universo');
  const path=withAppBase(logicalPath);const search=query.toString();return search?`${path}?${search}`:path;
}

export function preserveGraphMode(href:string,currentSearch=''){
  const current=new URLSearchParams(currentSearch);if(current.get('renderer')!=='webgl')return href;
  const target=new URL(href,'http://atlas.local');if(readAtlasRoute(target).area!=='graphs')return href;
  target.searchParams.set('renderer','webgl');return`${target.pathname}${target.search}${target.hash}`;
}

function redirectLegacyPathIfNeeded(){
  if(typeof window==='undefined')return;const pathname=stripAppBase(window.location.pathname);const rewritten=rewriteLegacyPublicPath(pathname);if(!rewritten)return;
  const area=LEGACY_PREFIX_TO_AREA[pathname.split('/').filter(Boolean)[0]||''];const query=new URLSearchParams(window.location.search);if(area==='universe'&&!query.get('scope'))query.set('scope','universo');
  const search=query.toString();window.history.replaceState(window.history.state,'',withAppBase(rewritten)+(search?`?${search}`:'')+window.location.hash);
}

export function useAtlasRoute(){
  const[route,setRoute]=useState<AtlasRoute>(()=>readAtlasRoute());
  useEffect(()=>{redirectLegacyPathIfNeeded();setRoute(readAtlasRoute())},[]);
  useEffect(()=>{const onPop=()=>setRoute(readAtlasRoute());window.addEventListener('popstate',onPop);return()=>window.removeEventListener('popstate',onPop)},[]);
  const navigate=useCallback((next:string|AtlasRoute)=>{const raw=typeof next==='string'?next:routeFor(next.area,next.context);const href=preserveGraphMode(raw,window.location.search);window.history.pushState({},'',href);setRoute(readAtlasRoute());window.dispatchEvent(new PopStateEvent('popstate'))},[]);
  return useMemo(()=>({route,navigate}),[navigate,route]);
}
