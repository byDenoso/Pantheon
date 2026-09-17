import {pathToFileURL} from 'node:url';

const handlerUrl=pathToFileURL(`${process.cwd()}/nexo-one/server/handler.mjs`).href;
const handlerPromise=import(handlerUrl).then(module=>module.default);

export default async function handler(req,res){
  const runtimeHandler=await handlerPromise;
  return runtimeHandler(req,res);
}
