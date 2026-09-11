import { provenanceLabel } from '../../lib/graph-contract.mjs';

type AnyRecord=Record<string,unknown>;
type OverviewSources={state?:unknown;ops?:unknown;audit?:unknown};

const record=(value:unknown):AnyRecord=>value&&typeof value==='object'&&!Array.isArray(value)?value as AnyRecord:{};
const list=(value:unknown):AnyRecord[]=>Array.isArray(value)?value.map(record):[];
const number=(value:unknown):number|null=>typeof value==='number'&&Number.isFinite(value)?value:null;
const text=(value:unknown):string=>typeof value==='string'?value:'';

function priority(item:AnyRecord){
  const p=number(record(item.metadata).priority);
  return p??Number.MAX_SAFE_INTEGER;
}

function byRecent(a:AnyRecord,b:AnyRecord){
  return text(b.updatedAt).localeCompare(text(a.updatedAt));
}

export function buildOverviewModel({state,ops,audit}:OverviewSources){
  const s=record(state),o=record(ops),a=record(audit);
  const counts=record(s.counts),claims=record(s.claims),domains=record(s.domains),projection=record(s.projection);
  const opsCounts=record(o.counts);
  const sourceName=text(projection.source)||'legacy';
  const sourceFreshness=text(projection.freshness)||'SNAPSHOT';
  const sourceVersion=text(projection.sourceVersion);
  const source={source:sourceName,freshness:sourceFreshness,version:sourceVersion,label:provenanceLabel({source:sourceName,freshness:sourceFreshness,sourceVersion})};
  const runs=number(opsCounts.runs),readback=number(opsCounts.readbackVerified);
  const actions=list(o.actions);
  const attention=actions
    .filter(item=>text(item.status).toUpperCase()==='BLOCKED')
    .sort((x,y)=>priority(x)-priority(y))
    .map(item=>({
      id:text(item.id),label:text(item.label)||text(item.id),domain:text(item.domain),
      status:text(item.status),reason:text(record(item.metadata).blocker_reason)||text(item.summary),priority:priority(item)
    }));
  const changes=list(o.events).sort(byRecent).slice(0,5).map(item=>({
    id:text(item.id),label:text(item.label)||text(item.id),status:text(item.status),
    domain:text(item.domain),summary:text(item.summary),updatedAt:text(item.updatedAt)
  }));

  return {
    availability:{state:Boolean(state),ops:Boolean(ops),audit:Boolean(audit)},
    source:{...source,label:source.label.toUpperCase()},
    metrics:{
      activeClaims:state?number(claims.active):null,
      blockedActions:ops?number(opsCounts.blocked):null,
      tests:state?number(counts.TEST):null,
      readback:ops&&runs!==null&&readback!==null?`${readback}/${runs}`:null,
    },
    science:{
      tests:state?number(counts.TEST):null,
      results:state?number(counts.RESULT):null,
      claims:state?number(counts.CLAIM):null,
      domains:state?Object.keys(domains).length:null,
      blockedClaims:state?number(claims.blocked):null,
    },
    provenance:{
      totalIssues:audit?number(a.total):null,
      openIssues:audit?number(a.open):null,
      resolvedIssues:audit?number(a.resolved):null,
    },
    attention,
    changes,
  };
}
