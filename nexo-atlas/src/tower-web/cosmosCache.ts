import {buildTowerGraph, type TowerGraph, type TowerTest} from './model.ts';
import {layoutCosmos, type CosmosLayout, type V3} from './embed3d.ts';
type Options = Parameters<typeof buildTowerGraph>[1];
const cloneLayout = (raw: CosmosLayout): CosmosLayout => ({...raw,
  pos: new Map([...raw.pos].map(([id,p])=>[id,{...p}])), halo:new Map(raw.halo),
  voids:raw.voids.map(v=>({...v})), center:{...raw.center}, domainIds:[...raw.domainIds],
  ...(raw.box ? {box:{...raw.box}} : {}),
});
/** One authenticated workspace owns this cache. No persistence, no shared scene/GPU state. */
export function createCosmosCache() {
  let cached: {tests: readonly TowerTest[]; options: Options; graph: TowerGraph; raw: CosmosLayout} | undefined;
  return {
    read(tests: readonly TowerTest[], options: Options = {}, prev?: ReadonlyMap<string,V3>) {
      if (!cached || cached.tests !== tests || cached.options?.normDomain !== options.normDomain || cached.options?.campaignLabel !== options.campaignLabel) {
        const graph=buildTowerGraph(tests,options);
        cached={tests,options:{...options},graph,raw:layoutCosmos(graph,{prev})};
      }
      return {graph:cached.graph,raw:cloneLayout(cached.raw)};
    },
    clear(){cached=undefined;},
  };
}
export type CosmosCache = ReturnType<typeof createCosmosCache>;
