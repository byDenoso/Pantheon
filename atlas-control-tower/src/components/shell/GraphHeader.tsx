import { useEffect, useState } from 'react';
import { nextRendererSearch, readRendererModeFromSearch, type RendererMode } from '../../graph-engine/renderer-mode';

function readRendererMode(): RendererMode {
  if (typeof window === 'undefined') return 'canvas';
  return readRendererModeFromSearch(window.location.search);
}

/**
 * Header for the graph area: title, short description, and the controls the map
 * contract calls for -- reset Universo, zoom in/out, fullscreen, and a 2D/3D toggle
 * when the WebGL path is available. No auto-rotation control here or anywhere else:
 * the map never rotates on its own.
 */
export function GraphHeader({
  onReset,
  zoom,
  onZoomIn,
  onZoomOut,
  fullscreenTargetRef
}: {
  onReset: () => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  fullscreenTargetRef: React.RefObject<HTMLElement | null>;
}) {
  const [mode, setMode] = useState<RendererMode>(() => readRendererMode());
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const sync = () => setMode(readRendererMode());
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const setMode2D3D = (next: RendererMode) => {
    const search = nextRendererSearch(window.location.search, next);
    const url = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
    window.history.replaceState(window.history.state, '', url);
    setMode(next);
    // GraphRenderer listens for popstate to re-read the mode from the URL; dispatching
    // it here keeps this header and GraphRenderer's own internal switch in sync
    // without adding a second, competing source of truth between the two components.
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const toggleFullscreen = () => {
    const el = fullscreenTargetRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  return (
    <div className="graph-header" role="toolbar" aria-label="Controles do mapa">
      <div className="graph-header-copy">
        <h2>Grafo de Conhecimento</h2>
        <p>Universo → Domínio → Campanha. Campanha é o nível terminal do mapa.</p>
      </div>
      <div className="graph-header-controls">
        <button type="button" onClick={onReset} title="Reset Universo" aria-label="Reset Universo">
          ⌂ Universo
        </button>
        <div className="graph-zoom-controls" role="group" aria-label="Zoom">
          <button type="button" onClick={onZoomOut} aria-label="Diminuir zoom" title="Diminuir zoom">
            −
          </button>
          <span aria-hidden="true">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={onZoomIn} aria-label="Aumentar zoom" title="Aumentar zoom">
            +
          </button>
        </div>
        <button type="button" onClick={toggleFullscreen} aria-pressed={isFullscreen} title="Tela cheia" aria-label="Alternar tela cheia">
          {isFullscreen ? '⤡' : '⤢'}
        </button>
        <div className="graph-mode-toggle" role="group" aria-label="Modo de renderização">
          <button type="button" className={mode === 'canvas' ? 'active' : ''} aria-pressed={mode === 'canvas'} onClick={() => setMode2D3D('canvas')}>
            2D
          </button>
          <button type="button" className={mode === 'webgl' ? 'active' : ''} aria-pressed={mode === 'webgl'} onClick={() => setMode2D3D('webgl')} title="3D (WebGL) — modo experimental: orbit por arraste ainda não é confiável em todos os navegadores. Canvas 2.5D é o modo padrão suportado.">
            3D <small>beta</small>
          </button>
        </div>
      </div>
    </div>
  );
}
