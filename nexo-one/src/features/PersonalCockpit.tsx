// Plano PESSOAL: lê o world state real e mantém indisponibilidade explícita por provider.
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
  const total = world?.providers_total ?? providers.length;
  const readValid = world?.read_valid ?? available > 0;
  const impaired = providers.filter(p => p.status !== 'AVAILABLE');

  return (
    <div className="personal-plane">
      <div className={`plane-banner${readValid ? '' : ' plane-unavailable'}`}>
        <span className="plane-tag">PLANO PESSOAL</span>
        <span>
          {readValid
            ? `${available} de ${total} fontes responderam nesta leitura.`
            : 'Leitura indisponível: nenhuma fonte respondeu nesta leitura.'}
        </span>
        <button className="text-button" onClick={() => refresh()} disabled={loading}>
          {loading ? 'Lendo fontes…' : 'Sincronizar agora ↻'}
        </button>
      </div>

      {(providers.length > 0 || error) && (
        <section className="connection-center" aria-labelledby="connection-center-title">
          <div className="section-head">
            <div>
              <span className="eyebrow">CONEXÕES</span>
              <h2 id="connection-center-title">Estado das fontes</h2>
            </div>
            <span className="quiet-note">
              {impaired.length === 0 ? 'Todas as fontes desta leitura responderam.' : `${impaired.length} fonte${impaired.length > 1 ? 's' : ''} exige${impaired.length === 1 ? '' : 'm'} atenção.`}
            </span>
          </div>
          {error && <div role="alert" className="notice-box">{error}</div>}
          {providers.length > 0 && (
            <div className="provider-grid">
              {providers.map(provider => (
                <article key={provider.id} className="provider-card">
                  <header>
                    <strong>{provider.label}</strong>
                    <span className="eyebrow">{stateLabel[provider.status] ?? provider.status}</span>
                  </header>
                  <p>{provider.message || 'Sem mensagem adicional da fonte.'}</p>
                  <dl className="meta-row">
                    <div><dt>último sucesso</dt><dd>{provider.lastSuccessAt ? dateTime(provider.lastSuccessAt) : <em>nenhum</em>}</dd></div>
                    <div><dt>verificado em</dt><dd>{dateTime(provider.checkedAt)}</dd></div>
                    <div><dt>itens</dt><dd>{provider.count ?? <em>não informado</em>}</dd></div>
                    <div><dt>leitura</dt><dd>{provider.partial ? 'parcial' : 'integral'}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          )}
          <button className="text-button" onClick={() => refresh(true)} disabled={loading}>
            {loading ? 'Sincronizando…' : 'Sincronizar agora'}
          </button>
        </section>
      )}

      {!authenticated && (
        <div className="notice-box">
          Sessão pública: fontes privadas permanecem identificadas como indisponíveis ou protegidas. Use o avatar D para abrir o cockpit privado.
        </div>
      )}
      {!world && !loading && !error
        ? <EmptyState title="Nenhuma leitura recebida do servidor."
            description="O cockpit pessoal depende do backend publicado. Uma fonte sem resposta permanece visível como indisponível; nunca vira zero." />
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
