import type {GraphLevel,GraphMachineState} from './types';
export type GraphEvent={type:'SELECT_NODE';id:string}|{type:'SELECT_EDGE';id:string}|{type:'CLEAR_SELECTION'}|{type:'ENTER';id:string;level:GraphLevel}|{type:'BACK';focusId?:string|null;level?:GraphLevel}|{type:'HOME'}|{type:'TOGGLE_LEARNING';value?:boolean}|{type:'RESTORE';state:Partial<GraphMachineState>};
export const initialGraphState:GraphMachineState={level:'atlas',focusId:null,selection:{nodeId:null,edgeId:null},learning:false};
export function graphReducer(state:GraphMachineState,event:GraphEvent):GraphMachineState{
 switch(event.type){
  case 'SELECT_NODE':return {...state,selection:{nodeId:event.id,edgeId:null}};
  case 'SELECT_EDGE':return {...state,selection:{nodeId:null,edgeId:event.id}};
  case 'CLEAR_SELECTION':return {...state,selection:{nodeId:null,edgeId:null}};
  case 'ENTER':return {...state,level:event.level,focusId:event.id,selection:{nodeId:null,edgeId:null}};
  case 'BACK':return {...state,level:event.level??state.level,focusId:event.focusId??null,selection:{nodeId:null,edgeId:null}};
  case 'HOME':return initialGraphState;
  case 'TOGGLE_LEARNING':return {...state,learning:event.value??!state.learning,selection:{nodeId:null,edgeId:null}};
  case 'RESTORE':return {...state,...event.state,selection:event.state.selection??state.selection};
 }
}
export function levelForPath(pathname:string):GraphLevel{const parts=pathname.split('/').filter(Boolean);return parts.length<=1?'atlas':parts.length===2?'domain':'detail'}
