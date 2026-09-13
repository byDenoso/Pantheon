import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/recursive';
import './design/index.css';
import App from './App';
import {ThemeMount} from './components/ThemeMount';

class RootErrorBoundary extends Component<{children:ReactNode},{message:string|null}>{
  state={message:null as string|null};
  static getDerivedStateFromError(error:unknown){
    return{message:error instanceof Error?error.message:'Falha inesperada durante a inicialização.'};
  }
  componentDidCatch(error:unknown){
    console.error('[atlas:bootstrap-error]',error);
    if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('atlas:bootstrap-error',{detail:{message:error instanceof Error?error.message:String(error)}}));
  }
  render(){
    if(this.state.message)return <main className="atlas-bootstrap-error" role="alert" style={{minHeight:'100vh',padding:'32px',fontFamily:'system-ui,sans-serif'}}><h1>Falha ao iniciar o NEXO Atlas.</h1><p>{this.state.message}</p><p>Recarregue a página. Se a falha persistir, o diagnóstico acima identifica o erro de bootstrap.</p></main>;
    return this.props.children;
  }
}

const root=document.getElementById('root');
if(!root) throw new Error('ATLAS_ROOT_MISSING');

createRoot(root).render(<StrictMode><RootErrorBoundary><App/><ThemeMount/></RootErrorBoundary></StrictMode>);
