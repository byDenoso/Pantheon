import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams, useSearchParams } from 'react-router-dom';
import { AppShell } from './app/AppShell';

const OverviewPage = lazy(()=>import('./pages/OverviewPage'));
const UniversesPage = lazy(()=>import('./pages/UniversesPage'));
const UniversePage = lazy(()=>import('./pages/UniversePage'));
const GraphsPage = lazy(()=>import('./pages/GraphsPage'));
const GraphDomainPage = lazy(()=>import('./pages/GraphDomainPage'));
const GraphDetailPage = lazy(()=>import('./pages/GraphDetailPage'));
const OperationsPage = lazy(()=>import('./pages/OperationsPage'));
const ProvenancePage = lazy(()=>import('./pages/ProvenancePage'));

function LegacyUniverseRedirect(){
  const params=useParams();
  const target=params.subdomainId?`/graphs/${params.universeId}/${params.subdomainId}`:`/graphs/${params.universeId}`;
  return <Navigate to={target} replace/>;
}
function LearningRedirect(){
  const [params]=useSearchParams();
  const next=new URLSearchParams(params);
  next.set('learning','1');
  return <Navigate to={`/graphs?${next.toString()}`} replace/>;
}

export default function App(){
  return <BrowserRouter>
    <Suspense fallback={<div className="nexo-route-loading">Carregando…</div>}>
      <Routes>
        <Route element={<AppShell/>}>
          <Route index element={<OverviewPage/>}/>
          <Route path="/universes" element={<UniversesPage/>}/>
          <Route path="/universes/:universeId" element={<UniversePage/>}/>
          <Route path="/universes/:universeId/:subdomainId" element={<LegacyUniverseRedirect/>}/>
          <Route path="/graphs" element={<GraphsPage/>}/>
          <Route path="/graphs/:domainId" element={<GraphDomainPage/>}/>
          <Route path="/graphs/:domainId/:subgraphId" element={<GraphDetailPage/>}/>
          <Route path="/learning" element={<LearningRedirect/>}/>
          <Route path="/operations" element={<OperationsPage/>}/>
          <Route path="/provenance" element={<ProvenancePage/>}/>
          <Route path="*" element={<Navigate to="/" replace/>}/>
        </Route>
      </Routes>
    </Suspense>
  </BrowserRouter>;
}
