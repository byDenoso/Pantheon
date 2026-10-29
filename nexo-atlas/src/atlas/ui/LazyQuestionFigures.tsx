import {Component,lazy,Suspense,type ComponentProps,type ReactNode} from 'react';
import type Figures from './QuestionFigures.tsx';
const QuestionFigures=lazy(()=>import('./QuestionFigures.tsx'));
// A figure failure must never take the investigation text down with it.
class FigureBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?null:this.props.children;}
}
/** Plot code loads only on investigation pages that actually have comparable figures. */
export default function LazyQuestionFigures(props:ComponentProps<typeof Figures>){
 return <FigureBoundary><Suspense fallback={<p role="status">{props.locale==='en'?'Loading figures…':'Carregando figuras…'}</p>}><QuestionFigures {...props}/></Suspense></FigureBoundary>;
}
