import {Component,useEffect,useState,type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import PublicApp from './atlas/ui/PublicApp.tsx';
import PrivateApp from './atlas/ui/PrivateApp.tsx';
import IdentityGate from './atlas/ui/IdentityGate.tsx';
import Shell from './atlas/ui/Shell.tsx';
import {LocaleProvider,useLocale,useMessages} from './atlas/ui/LocaleProvider.tsx';
import {initializeTheme} from './atlas/ui/useTheme.ts';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import './atlas/atlas-theme.css';
import './atlas/mobile-shell.css';
function App(){const [hash,setHash]=useState(location.hash);useEffect(()=>{const update=()=>setHash(location.hash);window.addEventListener('hashchange',update);return()=>window.removeEventListener('hashchange',update);},[]);if(/^#\/(?:privado|private|cockpit|galaxia|atlas3d|tower|teia)(?:\/|\?|$)/.test(hash)||/^\/(?:private|privado)(?:\/|$)/.test(location.pathname))return <IdentityGate><PrivateApp/></IdentityGate>;return <PublicApp/>;}
class Boundary extends Component<{children:ReactNode},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return {failed:true};}render(){return this.state.failed?<main className="atlas-main"><h1>NEXO</h1><p>Recarregue a página / Reload the page.</p><button onClick={()=>location.reload()}>OK</button></main>:this.props.children;}}
import './styles/interactive-motion.css';
initializeTheme();
createRoot(document.getElementById('root')!).render(<Boundary><LocaleProvider><App/></LocaleProvider></Boundary>);
