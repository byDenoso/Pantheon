import { createConfiguredApi } from '../api/client';

type LearningApi={learning:()=>Promise<any>};

export async function loadLearningSource(api:LearningApi=createConfiguredApi() as LearningApi){
 try{
  const report=await api.learning();
  return {available:true,report,error:null};
 }catch{
  return {available:false,report:null,error:'LEARNING_READ_FAILED'};
 }
}
