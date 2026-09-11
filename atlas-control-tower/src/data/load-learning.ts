import { createApi } from '../../lib/atlas-api.mjs';

type LearningApi={learning:()=>Promise<any>};

export async function loadLearningSource(api:LearningApi=createApi() as LearningApi){
 try{
  const report=await api.learning();
  return {available:true,report,error:null};
 }catch{
  return {available:false,report:null,error:'LEARNING_READ_FAILED'};
 }
}
