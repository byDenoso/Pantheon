import { useEffect } from 'react';
import { routeFor } from '../atlas-route';

export function LoginPage() {
  useEffect(() => {
    window.location.replace(routeFor('cockpit'));
  }, []);

  return (
    <div className="page-wrap panel-empty" role="status">
      <p>Abrindo o Cockpit público…</p>
    </div>
  );
}
