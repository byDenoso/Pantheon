import {Component,lazy,Suspense,type ComponentProps,type ReactNode} from 'react';
import type Gallery from './PublicVisualGallery.tsx';
const PublicVisualGallery=lazy(()=>import('./PublicVisualGallery.tsx'));
class FigureBoundary extends Component<{en:boolean;children:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?<div role="alert"><p>{this.props.en?'Figures could not be loaded. Your research view is still available.':'Não foi possível carregar as figuras. Sua consulta continua disponível.'}</p><button type="button" onClick={()=>location.reload()}>{this.props.en?'Reload the page':'Recarregar a página'}</button></div>:this.props.children;}
}
/** The plot inspector and export code load only when a visitor opens figures. */
export default function LazyVisualGallery(props:ComponentProps<typeof Gallery>){
 return <FigureBoundary en={props.locale==='en'}><Suspense fallback={<p role="status">{props.locale==='en'?'Loading figures…':'Carregando figuras…'}</p>}><PublicVisualGallery {...props}/></Suspense></FigureBoundary>;
}
