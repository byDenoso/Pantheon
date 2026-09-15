import type {AtlasApiClient,AtlasContext} from '../api/types';
import type {AtlasActions,AtlasUiState} from '../state/useAtlasSession';
import {GraphsPage,type ObservatoryProductMode} from './graphs-page';
import {ObservatorySynthesisRail} from '../components/ObservatorySynthesisRail';

type Props={
  api:AtlasApiClient;
  state:AtlasUiState;
  actions:AtlasActions;
  context:AtlasContext;
  reducedMotion:boolean;
  compact:boolean;
  initialView?:ObservatoryProductMode;
};

export function UnifiedObservatoryPage({api,state,actions,reducedMotion,compact,initialView='structure'}:Props){
  return <GraphsPage
    state={state}
    actions={actions}
    reducedMotion={reducedMotion}
    compact={compact}
    initialProductMode={initialView}
    synthesisOverlay={<ObservatorySynthesisRail api={api}/>}
  />;
}
