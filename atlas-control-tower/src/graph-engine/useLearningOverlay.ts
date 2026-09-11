import {useEffect,useMemo,useState} from 'react';
import {createApi} from '../../lib/atlas-api.mjs';
import {buildLearningMeshModel} from '../data/learning-vnext-model';
import type {GraphEdge,GraphNode} from './types';

const normalizeContext=(value:string)=>value.replace(/^context:/,'').toLowerCase();

function learningEdgesForVisibleNodes(report:any,nodes:GraphNode[]):GraphEdge[]{
 const model=buildLearningMeshModel(report);
 if(!model.available)return [];
 const visible=new Set(nodes.map(node=>node.id));
 const contextToNode=new Map<string,string>();
 for(const node of nodes){
  const raw=node.id.replace(/^system:/,'').replace(/^domain:/,'').toLowerCase();
  contextToNode.set(raw,node.id);
  if(node.type==='DOMAIN')contextToNode.set(String(node.label||'').toLowerCase(),node.id);
 }
 const edges:GraphEdge[]=[];
 for(const filament of model.filaments){
  const row=filament as Record<string,unknown>;
  const type=String(row.type||'learning');
  let source=String(row.source||''),target=String(row.target||'');
  const sourceContext=normalizeContext(source),targetContext=normalizeContext(target);
  if(type==='transfer'){
   source=contextToNode.get(sourceContext)||source;
   target=contextToNode.get(targetContext)||target;
  }
  if(!visible.has(source)||!visible.has(target))continue;
  edges.push({
   id:String(row.id||`learning:${edges.length}:${source}:${target}`),
   source,target,type:type.toUpperCase(),declared:true,
   strength:typeof row.support==='number'?row.support:null,
   metadata:{
    scope:type==='transfer'?'cross-domain':'intra-domain',
    relationType:row.relationType??null,
    confidence:row.confidence??null,
    status:row.status??null,
    sourceRecord:row.sourceRecord??null,
   },
  });
 }
 return edges;
}

export function useLearningOverlay(nodes:GraphNode[]){
 const api=useMemo(()=>createApi(),[]);
 const [source,setSource]=useState<any>(null);
 useEffect(()=>{let active=true;void api.learning().then(value=>{if(active)setSource(value)}).catch(()=>{if(active)setSource(null)});return()=>{active=false}},[api]);
 return useMemo(()=>learningEdgesForVisibleNodes(source,nodes),[source,nodes]);
}
