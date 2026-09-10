import {ActionError} from './contracts.mjs';
import {executeGoogle,readbackGoogle,googleScopesFor} from '../adapters/google-actions.mjs';
import {googleToken} from '../adapters/google.mjs';
import {executeGitHub,readbackGitHub} from '../adapters/github-actions.mjs';
import {executeVercel,readbackVercel} from '../adapters/vercel-actions.mjs';
import {atlas} from '../adapters/atlas.mjs';

const text=value=>String(value??'').trim();
const issueNumber=value=>{const match=text(value).match(/(?:issue:|pr:|#)?(\d+)$/);return match?Number(match[1]):null;};

function validateGoogle(action,env){
  const p=action.requested_payload||{},type=action.action_type;
  if(type==='gmail.send'||type==='gmail.draft'){
    if(!text(p.to)||!text(p.subject)||/[\r\n]/.test(String(p.to)))throw new ActionError('TARGET_AMBIGUOUS');
  }else if(type==='calendar.update'||type==='calendar.delete'){
    const eventId=text(p.event_id||action.target_ref),calendarId=text(env.GOOGLE_CALENDAR_ID||'primary');
    if(!eventId||eventId==='primary'||eventId===calendarId)throw new ActionError('TARGET_AMBIGUOUS');
  }else if(type==='calendar.create'){
    if(!p||typeof p!=='object')throw new ActionError('TARGET_AMBIGUOUS');
  }else if(type==='drive.create'){
    if(!text(p.name))throw new ActionError('TARGET_AMBIGUOUS');
  }else if(type==='drive.update'){
    if(!text(p.file_id||action.target_ref)||!text(p.name))throw new ActionError('TARGET_AMBIGUOUS');
  }else if(type==='nexo.sheet.update'){
    const canonical=text(env.NEXO_SHEET_ID),requested=text(p.spreadsheet_id);
    if(!canonical)throw new ActionError('AUTH_REQUIRED');
    if(!requested||requested!==canonical)throw new ActionError('AUTHORITY_CONFLICT');
    if(!text(p.range)||!Array.isArray(p.values))throw new ActionError('TARGET_AMBIGUOUS');
  }else throw new ActionError('CAPABILITY_BLOCKED');
}
async function preflightGoogle(action,{env=process.env,signal}={}){
  validateGoogle(action,env);
  const scopes=googleScopesFor(action.action_type);if(!scopes.length)throw new ActionError('CAPABILITY_BLOCKED');
  await googleToken(env,signal,{writeScopes:scopes});
  return {ok:true};
}

function validateGitHub(action,env){
  const repo=text(env.GITHUB_REPOSITORY||'byDenoso/Pantheon');
  if(!/^[\w.-]+\/[\w.-]+$/.test(repo))throw new ActionError('AUTHORITY_CONFLICT');
  if(!text(env.GITHUB_TOKEN))throw new ActionError('AUTH_REQUIRED');
  const explicit=text(action.target_ref).match(/^([\w.-]+\/[\w.-]+)(?:[#:@/].*)?$/)?.[1];
  if(explicit&&explicit!==repo)throw new ActionError('AUTHORITY_CONFLICT');
  const p=action.requested_payload||{},type=action.action_type;
  if(type==='github.issue.create'&&!text(p.title))throw new ActionError('TARGET_AMBIGUOUS');
  else if(type==='github.issue.update'&&!issueNumber(p.issue_number||action.target_ref))throw new ActionError('TARGET_AMBIGUOUS');
  else if(type==='github.pr.create'&&(!text(p.title)||!text(p.head)||!text(p.base)))throw new ActionError('TARGET_AMBIGUOUS');
  else if(type==='github.branch.create'&&(!text(p.branch)||!text(p.sha)||text(p.branch).startsWith('refs/')))throw new ActionError('TARGET_AMBIGUOUS');
  else if(type==='github.commit.create'&&(!text(p.path)||!text(p.message)))throw new ActionError('TARGET_AMBIGUOUS');
  else if(type==='github.merge'&&!issueNumber(p.pull_number||action.target_ref))throw new ActionError('TARGET_AMBIGUOUS');
  else if(!['github.issue.create','github.issue.update','github.pr.create','github.branch.create','github.commit.create','github.merge'].includes(type))throw new ActionError('CAPABILITY_BLOCKED');
}
async function preflightGitHub(action,{env=process.env}={}){validateGitHub(action,env);return {ok:true};}

function validateVercel(action,env){
  const project=text(env.VERCEL_PROJECT_ID),target=text(action.target_ref),token=text(env.VERCEL_WRITE_TOKEN);
  if(!project||!token)throw new ActionError('AUTH_REQUIRED');
  if(target&&target!==project)throw new ActionError('AUTHORITY_CONFLICT');
  const p=action.requested_payload||{};
  if(action.action_type==='vercel.deploy'&&!text(p.deployment_id)&&!p.gitSource)throw new ActionError('TARGET_AMBIGUOUS');
  if(action.action_type==='vercel.promote'&&!text(p.deployment_id))throw new ActionError('TARGET_AMBIGUOUS');
  if(!['vercel.deploy','vercel.promote'].includes(action.action_type))throw new ActionError('CAPABILITY_BLOCKED');
}
async function preflightVercel(action,{env=process.env}={}){validateVercel(action,env);return {ok:true};}

const builtin={
  google:{preflight:preflightGoogle,execute:executeGoogle,readback:readbackGoogle},
  github:{preflight:preflightGitHub,execute:executeGitHub,readback:readbackGitHub},
  vercel:{preflight:preflightVercel,execute:executeVercel,readback:readbackVercel},
  atlas:{
    async preflight(){throw new ActionError('CAPABILITY_BLOCKED');},
    async execute(){throw new ActionError('CAPABILITY_BLOCKED');},
    async readback(receipt,ctx){
      const snapshot=await atlas({env:ctx.env||process.env,signal:ctx.signal,now:ctx.now||Date.now()});
      const id=String(receipt.expected?.entity_id||receipt.target_ref||'').replace(/^atlas:/,'');
      const item=id?snapshot.items.find(row=>row.id===`atlas:${id}`||row.id===id):null;
      const fingerprint=snapshot.revision||null;
      const match=!id||!!item;
      return match?{status:'PASS',readback_status:'MATCH',after_revision:fingerprint,source_ref:item?.sourceRef||receipt.source_ref,explanation:'Atlas projection readback contains the expected entity/fingerprint.'}:{status:'DEGRADED',readback_status:'MISMATCH',after_revision:fingerprint,source_ref:receipt.source_ref,explanation:'Underlying authority effect is proven, but Atlas has not projected the expected entity yet.'};
    }
  }
};

export function resolveActionProvider(provider,overrides={}){
  const id=String(provider||'').toLowerCase();
  const table={...builtin,...overrides};
  if(['gmail','calendar','drive','nexo'].includes(id))return table.google||builtin.google;
  if(id==='github')return table.github||builtin.github;
  if(id==='vercel')return table.vercel||builtin.vercel;
  if(id==='atlas')return table.atlas||builtin.atlas;
  throw new ActionError('CAPABILITY_BLOCKED');
}
