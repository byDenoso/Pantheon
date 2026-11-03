import {createRoot} from 'react-dom/client';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource-variable/nunito';
import './cockpit.css';
import CockpitApp from './CockpitApp.tsx';
import CosmicWeb from './CosmicWeb.tsx';

createRoot(document.getElementById('root')!).render(<><CosmicWeb/><CockpitApp/></>);
