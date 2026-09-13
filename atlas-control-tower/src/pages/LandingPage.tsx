import { routeFor } from '../atlas-route';

export function LandingPage({ navigate }: { navigate: (href: string) => void }) {
  const go = (href: string) => (event: { preventDefault: () => void }) => {
    event.preventDefault();
    navigate(href);
  };
  return (
    <div className="page-wrap landing-page">
      <h1>NEXO Atlas</h1>
      <p>Observatório para uma ciência mais conectada. Domínios e campanhas públicas, sem síntese inventada.</p>
      <nav className="landing-links" aria-label="Áreas públicas">
        <a href={routeFor('graphs')} onClick={go(routeFor('graphs'))}>
          Mapa →
        </a>
        <a href={routeFor('observatory')} onClick={go(routeFor('observatory'))}>
          Pesquisa →
        </a>
        <a href={routeFor('login')} onClick={go(routeFor('login'))}>
          Entrar →
        </a>
      </nav>
    </div>
  );
}
