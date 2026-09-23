import {createTowerDriveGateway} from './tower-drive-gateway.mjs';

export function towerStorageMode(env=process.env){
  return String(env.NEXO_STORAGE_MODE||'').trim().toUpperCase();
}
export function createTowerGateway(options={}){
  const env=options.env||process.env;
  const mode=towerStorageMode(env);
  if(mode==='DRIVE_PRIMARY')return createTowerDriveGateway({...options,env});
  if(!mode)throw new Error('NEXO_STORAGE_MODE_REQUIRED');
  if(mode==='GITHUB')throw new Error('LEGACY_GITHUB_STATE_BACKEND_DISABLED');
  throw new Error('NEXO_STORAGE_MODE_INVALID:'+mode);
}
