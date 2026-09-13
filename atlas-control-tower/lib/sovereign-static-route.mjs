import {driveRoute} from './drive-ssot.mjs';
import {loadDriveGithubScience,projectDriveGithubScience} from './drive-github-science.mjs';

const SCIENCE=loadDriveGithubScience();
const text=value=>String(value??'').trim();
const upper=value=>text(value).toUpperCase();

function isScienceGraphFocus(focus){
  const value=text(focus);
  return value==='system:SCIENCE'||/^domain:D\d+$/i.test(value)||/^CAMP-/i.test(value)||/^T-/i.test(value);
}

function staticHealth(){
  const index=SCIENCE.index||{};
  return {
    ok:true,
    contract:'nexo-static-runtime-v1',
    runtime:'STATIC_LOCAL',
    dataSource:{
      source:'GOOGLE_DRIVE',
      freshness:'SNAPSHOT',
      reason:'GITHUB_PUBLISHED_DRIVE_PROJECTION',
      usedFallback:false,
      authority:'GITHUB',
      projectionAuthority:'GOOGLE_DRIVE',
      projectionOnly:true,
      sourceVersion:index.sourceVersion||'',
      fingerprint:index.fingerprint||'',
      sourceRef:index.sourceUrl||''
    }
  };
}

export async function sovereignDriveRoute(route,query={},options={}){
  const method=upper(options.method||'GET');
  if(method!=='GET')return driveRoute(route,query,options);

  if(route==='health')return staticHealth();

  if(route==='graph'&&isScienceGraphFocus(query.focus)){
    return projectDriveGithubScience(SCIENCE,'graph',query);
  }

  if(route==='state'){
    const [base,science]=await Promise.all([
      driveRoute('state',query,options),
      Promise.resolve(projectDriveGithubScience(SCIENCE,'state',query))
    ]);
    return {
      ...base,
      ...science,
      counts:{...(base?.counts||{}),...(science?.counts||{})},
      domains:{...(base?.domains||{}),...(science?.domains||{})},
      science:science.science
    };
  }

  if(route==='entity'){
    const science=projectDriveGithubScience(SCIENCE,'entity',query);
    if(science?.entity)return science;
    return driveRoute(route,query,options);
  }

  return driveRoute(route,query,options);
}
