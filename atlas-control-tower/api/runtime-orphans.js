import githubHandler from './runtime-github.js';
import driveHandler from './runtime-drive.js';

export default function handler(req,res){
  const mode=String(process.env.NEXO_STORAGE_MODE||'GITHUB').trim().toUpperCase();
  if(mode==='DRIVE_PRIMARY')return driveHandler(req,res);
  return githubHandler(req,res);
}
