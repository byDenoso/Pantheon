import {useEffect,useMemo,useState} from 'react';
import {createApi} from '../../lib/atlas-api.mjs';
import {learningOverlay} from './projection';
import type {GraphNode} from './types';

export function useLearningOverlay(nodes:GraphNode[]){
 const api=useMemo(()=>createApi(),[]);
 const [source,setSource]=useState<any>(null);
 useEffect(()=>{let active=true;void api.learningRelations().then(value=>{if(active)setSource(value)}).catch(()=>{if(active)setSource(null)});return()=>{active=false}},[api]);
 return useMemo(()=>learningOverlay(source,nodes).edges||[],[source,nodes]);
}
