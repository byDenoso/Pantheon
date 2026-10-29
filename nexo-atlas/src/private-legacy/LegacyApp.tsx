import App from '../app/App';
import {NexoStoreProvider} from '../data/NexoStore.tsx';

/** Loaded only for legacy routes, after the guarded Host accepts a runtime. */
export default function LegacyApp() {
  return <NexoStoreProvider><App/></NexoStoreProvider>;
}
