// Public Atlas entry. It imports nothing from the legacy app, store, adapters,
// fixtures or the SVG mirror (see src/legacy/main.tsx for the previous entry).
import {Component, type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import AppRouter from './atlas/ui/AppRouter.tsx';
import {LocaleProvider} from './atlas/ui/LocaleProvider.tsx';
import './atlas/atlas-theme.css';

class Boundary extends Component<{children: ReactNode}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  render() {
    return this.state.failed
      ? <main className="atlas-main"><h1>Atlas</h1><p>Reload / Recarregue.</p><button className="atlas-btn" onClick={() => location.reload()}>OK</button></main>
      : this.props.children;
  }
}
createRoot(document.getElementById('root')!).render(<Boundary><LocaleProvider><AppRouter/></LocaleProvider></Boundary>);
