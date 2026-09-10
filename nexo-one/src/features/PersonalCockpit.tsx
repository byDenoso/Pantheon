// Plano PESSOAL: preserva o cockpit já existente, que lê /api/world de verdade.
// Nada aqui foi reescrito — a lógica veio do App anterior, agora isolada num componente.
import { useState } from 'react';
import type { CockpitItem, WorldState } from '../contracts/world.ts';
import type { PersonalView } from '../app/navigation.ts';
import { stateLabel, dateTime } from '../app/model.ts';
import { Workspace } from './Workspace.tsx';
import { FocusDrawer } from '../shell/FocusDrawer.tsx';
import { EmptyState } from '../components/states.tsx';

export function PersonalCockpit(
  { view, world, loading, error, refresh, authenticated, query, setQuery, context, setContext }:
  {
    view: PersonalView;
    world: WorldState | null;
    loading: boolean;
    error: string;
    refresh: (reset?: boolean) => void;
    authenticated: boolean;
    query: string;
    setQuery: (value: string) => void;
    context: string;
    setContext: (value: string) => void;
  },
) {
  const [selected, setSelected] = useState<CockpitItem | null>(null);
  const providers = world?.providers ?? [];
  const available = providers.filter(p => p.status === 'AVAILABLE').length;

  return (
    <div className="personal-plane">
      <div className="plane-banner">
        <span className="plane-tag">PLANO PESSOAL</span>
        <span>
          Esta aba consome o servidor real em <code>/api/world</code>. {available} de {providers.length || 7} fontes
          responderam nesta leitura.
        </span>
        <button className="text-button" onClick={() => refresh()} disabled={loading}>
          {loading ? 'Lendo fontes…' : 'Sincronizar ↻'}
        </button>
      </div>
      {error && <div role="alert" className="notice-box">{error}</div>}
      {!authenticated && (
        <div className="notice-box">
          Sessão pública: apenas fontes públicas respondem. Entre na sessão privada para ver agenda, arquivos e ações.
        </div>
      )}
      {!world && !loading && !error
        ? <EmptyState title="Nenhuma leitura recebida do servidor."
            description="O cockpit pessoal depende do backend já publicado. Uma fonte sem resposta permanece visível como indisponível — nunca vira zero." />
        : <Workspace tab={view} world={world} onSelect={setSelected} context={context} setContext={setContext}
            query={query} onQuery={setQuery} loading={loading} />}
      <p className="quiet-note">
        Cobertura desta leitura: {providers.map(p => `${p.label} ${stateLabel[p.status] ?? p.status}`).join(' · ') || 'aguardando fontes'}.
        Última compilação: {dateTime(world?.generatedAt)}.
      </p>
      {selected && <FocusDrawer item={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
