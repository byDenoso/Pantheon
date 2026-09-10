import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import BreakthroughApp from './BreakthroughApp';

const root=document.getElementById('root');
if(!root)throw new Error('BT_ATLAS_ROOT_MISSING');
createRoot(root).render(<StrictMode><BreakthroughApp/></StrictMode>);
