import {createRoot} from 'react-dom/client';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource-variable/source-serif-4/opsz.css';
import '@fontsource-variable/source-serif-4/opsz-italic.css';
import './cockpit.css';
import CockpitApp from './CockpitApp.tsx';
// Last, so the shared identity restates tokens and surfaces over every earlier layer.
import './identity.css';

createRoot(document.getElementById('root')!).render(<CockpitApp/>);
