// Navigation of the private areas. Presentation only: it renders the links it is given.
// Wide screens show every area. On phones (≤ 600 px, see private-design.css) the first `inline` areas stay visible and the rest go under one menu button,
// so six areas fit in 320 px without squeezed labels. No routing, no storage: the host owns the hashes and tells which one is current.
import {useEffect, useId, useRef, useState, type ReactNode} from 'react';

export interface PrivateNavItem {key: string; href: string; label: string; icon?: ReactNode}
export interface PrivateNavProps {
  items: readonly PrivateNavItem[];
  /** key of the current area, or null */
  current: string | null;
  /** accessible name of the navigation */
  label: string;
  /** text of the menu button when the current area is one of the visible ones */
  moreLabel: string;
  /** how many areas stay visible on phones (default 3) */
  inline?: number;
}

export function PrivateNav({items, current, label, moreLabel, inline = 3}: PrivateNavProps) {
  const [open, setOpen] = useState(false), id = useId(), wrap = useRef<HTMLDivElement>(null), toggle = useRef<HTMLButtonElement>(null);
  const overflow = items.slice(inline), currentOverflow = overflow.find(item => item.key === current) ?? null;
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!wrap.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); toggle.current?.focus(); } };
    const close = () => setOpen(false);
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', key); window.addEventListener('hashchange', close);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key); window.removeEventListener('hashchange', close); };
  }, [open]);
  return <nav className="pd-nav" aria-label={label}>
    {items.map((item, index) => <a key={item.key} href={item.href} aria-current={item.key === current ? 'page' : undefined} data-overflow={index >= inline ? '' : undefined}>{item.icon}<span>{item.label}</span></a>)}
    {overflow.length > 0 && <div className="pd-nav-more" ref={wrap}>
      <button ref={toggle} type="button" className="pd-nav-toggle" aria-expanded={open} aria-controls={id} data-current={currentOverflow !== null} onClick={() => setOpen(value => !value)}
        onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); requestAnimationFrame(() => wrap.current?.querySelector<HTMLAnchorElement>('.pd-nav-menu a')?.focus()); } }}>
        <svg className="pw-nav-icon pd-more-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg><span>{currentOverflow ? currentOverflow.label : moreLabel}</span>
      </button>
      {open && <ul className="pd-nav-menu" id={id}>{overflow.map(item => <li key={item.key}><a href={item.href} aria-current={item.key === current ? 'page' : undefined} onClick={() => setOpen(false)}>{item.label}</a></li>)}</ul>}
    </div>}
  </nav>;
}
