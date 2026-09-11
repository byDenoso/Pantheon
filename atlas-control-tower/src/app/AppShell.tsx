import { NavLink, Outlet } from 'react-router-dom';
import { productNavigation } from './navigation';
import { GlobalSearch } from '../components/GlobalSearch';

export function AppShell(){
  return <div className="nexo-shell">
    <aside className="nexo-sidebar">
      <NavLink to="/" className="nexo-brand" aria-label="NEXO Atlas">
        <span className="nexo-mark">✦</span><span>NEXO <b>ATLAS</b></span>
      </NavLink>
      <nav className="nexo-primary-nav" aria-label="Áreas do produto">
        {productNavigation.map(item=><NavLink key={item.path} to={item.path} end={item.path==='/' } className={({isActive})=>`nexo-nav-item ${isActive?'active':''}`}>
          <span className="nexo-nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span>
        </NavLink>)}
      </nav>
      <div className="nexo-sidebar-foot">
        <span className="nexo-status-dot"/> projeção somente leitura
      </div>
    </aside>
    <section className="nexo-workspace">
      <header className="nexo-topbar">
        <GlobalSearch/>
        <div className="nexo-runtime">NEXO Atlas vNext</div>
      </header>
      <main className="nexo-content"><Outlet/></main>
    </section>
  </div>;
}
