import { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import Atlas3DApp from './Atlas3DApp.tsx';
import '../components/GalaxyThree3D.css';
import './atlas3d.css';

class Boundary extends Component<{children: ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){ return {failed:true}; }
  render(){
    return this.state.failed
      ? <main className="atlas3d-boot"><strong>Atlas 3D indisponível.</strong><button onClick={()=>location.reload()}>Recarregar</button></main>
      : this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(<Boundary><Atlas3DApp/></Boundary>);
