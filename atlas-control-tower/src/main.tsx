import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import '../ui/official-dashboard.css';
import '../ui/premium-v2.css';
import '../ui/reference-one.css';
import App from './App';

const root=document.getElementById('root');
if(!root)throw new Error('ATLAS_ROOT_MISSING');
createRoot(root).render(<StrictMode><App/></StrictMode>);
