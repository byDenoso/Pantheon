import { useEffect, useState } from 'react';
import { nextRendererSearch, readRendererModeFromSearch, type RendererMode } from '../../graph-engine/renderer-mode';

function readRendererMode(): RendererMode {
  if (typeof window === 'undefined') return 'canvas';
  return readRendererModeFromSearch(window.location.search);
}

/**
 * Header for the unified Observatório spatial surface. Structural depth is read from
 * the published projection; this component never assumes one universal hierarchy.
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
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const toggleFullscreen = () => {
    const el = fullscreenTargetRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  return (
    <div className="graph-header" role="toolbar" aria-label="Controles do Observatório">
      <div className="graph-header-copy">
        <h2>Observatório de Conhecimento</h2>
        <p>Estrutura publicada, relações, evidências e sínteses em uma única superfície espacial.</p>
      </div>
      <div className="graph-header-controls">
        <button type="button" onClick={onReset} title="Voltar ao início" aria-label="Voltar ao início">
          ⌂ Início
        </button>
        <div className="graph-zoom-controls" role="group" aria-label="Zoom">
          <button type="button" onClick={onZoomOut} aria-label="Diminuir zoom" title="Diminuir zoom">−</button>
          <span aria-hidden="true">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={onZoomIn} aria-label="Aumentar zoom" title="Aumentar zoom">+</button>
        </div>
        <button type="button" onClick={toggleFullscreen} aria-pressed={isFullscreen} title="Tela cheia" aria-label="Alternar tela cheia">
          {isFullscreen ? '⤡' : '⤢'}
        </button>
        <div className="graph-mode-toggle" role="group" aria-label="Modo de renderização">
          <button type="button" className={mode === 'canvas' ? 'active' : ''} aria-pressed={mode === 'canvas'} onClick={() => setMode2D3D('canvas')}>2D</button>
          <button type="button" className={mode === 'webgl' ? 'active' : ''} aria-pressed={mode === 'webgl'} onClick={() => setMode2D3D('webgl')} title="3D (WebGL) — câmera orbital manual; Canvas 2.5D permanece o modo padrão suportado.">3D <small>beta</small></button>
        </div>
      </div>
    </div>
  );
}