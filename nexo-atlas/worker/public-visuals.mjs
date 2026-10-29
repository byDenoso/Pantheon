import {summaryVisualProjection} from './public-summary-visuals.mjs';
import snapshot from '../.sites-runtime/public-visual-snapshot.mjs';
import {validatePublicVisualSnapshot,bindPublicVisuals} from '../server/atlas/public-visual-projection.mjs';
const approved=snapshot===null?null:validatePublicVisualSnapshot(snapshot);
export function visualPublicProjection(publicProjection){return summaryVisualProjection(approved?bindPublicVisuals(approved,publicProjection):publicProjection);}
