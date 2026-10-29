// The caller supplies only the reviewed, immutable public catalog builder.
// Future publication dates and a backward clock require the same validation as
// a fresh response; a failed rebuild never returns an earlier successful body.
export function readPublicSnapshot(build,current,boundaries,observedAt=Date.now()){
 if(current&&observedAt>=current.builtAt&&observedAt<current.validUntil)return current;
 return {body:JSON.stringify(build()),builtAt:observedAt,
  validUntil:boundaries.find(timestamp=>timestamp>observedAt)??Infinity};
}
