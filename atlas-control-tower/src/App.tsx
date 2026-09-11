import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './app/AppShell';

const OverviewPage = lazy(()=>import('./pages/OverviewPage'));
const UniversesPage = lazy(()=>import('./pages/UniversesPage'));
const UniversePage = lazy(()=>import('./pages/UniversePage'));
const SubdomainPage = lazy(()=>import('./pages/SubdomainPage'));
const GraphsPage = lazy(()=>import('./pages/GraphsPage'));
const GraphDomainPage = lazy(()=>import('./pages/GraphDomainPage'));
const GraphDetailPage = lazy(()=>import('./pages/GraphDetailPage'));
const LearningPage = lazy(()=>import('./pages/LearningPage'));
const OperationsPage = lazy(()=>import('./pages/OperationsPage'));
const ProvenancePage = lazy(()=>import('./pages/ProvenancePage'));

export default function App(){
  return <BrowserRouter>
    <Suspense fallback={<div className="nexo-route-loading">Carregando…</div>}>
      <Routes>
        <Route element={<AppShell/>}>
          <Route index element={<OverviewPage/>}/>
          <Route path="/universes" element={<UniversesPage/>}/>
          <Route path="/universes/:universeId" element={<UniversePage/>}/>
          <Route path="/universes/:universeId/:subdomainId" element={<SubdomainPage/>}/>
          <Route path="/graphs" element={<GraphsPage/>}/>
          <Route path="/graphs/:domainId" element={<GraphDomainPage/>}/>
          <Route path="/graphs/:domainId/:subgraphId" element={<GraphDetailPage/>}/>
          <Route path="/learning" element={<LearningPage/>}/>
          <Route path="/operations" element={<OperationsPage/>}/>
          <Route path="/provenance" element={<ProvenancePage/>}/>
          <Route path="*" element={<Navigate to="/" replace/>}/>
        </Route>
      </Routes>
    </Suspense>
  </BrowserRouter>;
}
