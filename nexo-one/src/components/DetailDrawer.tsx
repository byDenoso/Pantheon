// Painel lateral de detalhe compartilhado (desktop: lateral; mobile: bottom sheet).
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './DetailDrawer.css';

export type DetailField = [label: string, value: ReactNode];

export function DetailDrawer(
  { kicker, title, code, fields, children, onClose }:
  { kicker?: string; title: string; code?: string; fields: DetailField[]; children?: ReactNode; onClose: () => void },
) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const shown = fields.filter(([, value]) => value !== null && value !== undefined && value !== '' && value !== false);
  // Portal: main.workspace isola o contexto de empilhamento; o painel precisa ficar acima da navegação.
  return createPortal(
    <>
      <div className="detail-drawer-scrim" onClick={onClose} aria-hidden="true" />
      <aside className="detail-drawer" role="dialog" aria-modal="false" aria-label={title}>
        <header>
          <div>
            {kicker && <span className="detail-drawer-kicker">{kicker}</span>}
            <h2>{title}</h2>
            {code && code !== title && <code>{code}</code>}
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Fechar detalhe">×</button>
        </header>
        {shown.length > 0 && (
          <dl>
            {shown.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
        )}
        {children}
      </aside>
    </>,
    document.body,
  );
}
