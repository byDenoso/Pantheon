import {Component,type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './app/App';
import {ProjectionBusStatus} from './features/ProjectionBusStatus';
import './styles/tokens.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/system.css';
class Boundary extends Component<{children:ReactNode},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return {failed:true};}render(){return this.state.failed?<main className="fatal-state"><h1>Não foi possível abrir esta visão.</h1><p>Recarregue para consultar novamente suas fontes.</p><button onClick={()=>location.reload()}>Recarregar</button></main>:this.props.children;}}
createRoot(document.getElementById('root')!).render(<Boundary><><App/><ProjectionBusStatus/></></Boundary>);
