import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {AtlasV3App} from './AtlasV3App';
import './atlas-v3.css';

const root=document.getElementById('atlas-v3-root');
if(!root)throw new Error('ATLAS_V3_ROOT_MISSING');

createRoot(root).render(<StrictMode><AtlasV3App/></StrictMode>);
