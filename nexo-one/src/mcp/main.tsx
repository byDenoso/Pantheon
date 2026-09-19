import {Component,type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import {McpAtlasApp} from './McpAtlasApp';
import './mcp-atlas.css';

class Boundary extends Component<{children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){
    return this.state.failed
      ? <main className="mcp-fatal"><h1>Falha ao abrir o MCP Atlas.</h1><button onClick={()=>location.reload()}>Recarregar</button></main>
      : this.props.children;
  }
}

createRoot(document.getElementById('mcp-root')!).render(<Boundary><McpAtlasApp/></Boundary>);
