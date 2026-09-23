import { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import Atlas3DApp from './Atlas3DApp.tsx';
import { NexoStoreProvider } from '../data/NexoStore.tsx';
import { ensureAtlasG6, G6_SOURCES } from './g6-loader.ts';
import '../styles/product-foundation.css';
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

async function boot() {
  const root = document.getElementById('root');
  if (!root) throw new Error('Atlas root element missing');
  root.innerHTML = '<main class="atlas3d-boot" data-atlas-bootstrap="dependencies"><strong>NEXO ATLAS</strong><span>Carregando renderer…</span></main>';
  await ensureAtlasG6();
  void G6_SOURCES;
  createRoot(root).render(<Boundary><NexoStoreProvider><Atlas3DApp/></NexoStoreProvider></Boundary>);
}

void boot();
