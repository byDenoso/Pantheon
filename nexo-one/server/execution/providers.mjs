import {ActionError} from './contracts.mjs';
import {executeGoogle,readbackGoogle} from '../adapters/google-actions.mjs';
import {executeGitHub,readbackGitHub} from '../adapters/github-actions.mjs';
import {executeVercel,readbackVercel} from '../adapters/vercel-actions.mjs';
import {atlas} from '../adapters/atlas.mjs';

const builtin={
  google:{execute:executeGoogle,readback:readbackGoogle},
  github:{execute:executeGitHub,readback:readbackGitHub},
  vercel:{execute:executeVercel,readback:readbackVercel},
  atlas:{
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
