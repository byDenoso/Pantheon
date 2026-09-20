import {createTowerGithubGateway} from './tower-github-gateway.mjs';
import {createTowerDriveGateway} from './tower-drive-gateway.mjs';

export function towerStorageMode(env=process.env){
  return String(env.NEXO_STORAGE_MODE||'GITHUB').trim().toUpperCase();
}
export function createTowerGateway(options={}){
  const env=options.env||process.env;
  const mode=towerStorageMode(env);
  if(mode==='DRIVE_PRIMARY')return createTowerDriveGateway({...options,env});
  if(mode==='GITHUB')return createTowerGithubGateway({...options,env});
  throw new Error('NEXO_STORAGE_MODE_INVALID:'+mode);
}
