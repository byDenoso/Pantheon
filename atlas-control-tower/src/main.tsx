import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/recursive';
import './design/index.css';
import App from './App';
import {ThemeMount} from './components/ThemeMount';

const root=document.getElementById('root');
if(!root) throw new Error('ATLAS_ROOT_MISSING');

createRoot(root).render(<StrictMode><><App/><ThemeMount/></></StrictMode>);
