import {useEffect} from 'react';

const REVEAL_SELECTOR = [
  '.workspace > :not(.workspace-heading):not(.section-tabs)',
  '.overview > section', '.workspace section', '.card-grid > *',
  '.lane-grid > *', '.domain-strip > *', '.provider-grid > *', '.work-queue > *',
].join(',');
const COUNT_SELECTOR = '.pulse-metric strong,.capability-counters strong';
const GRAPH_SELECTOR = 'svg,canvas,[data-tower-svg-native],[data-tower-svg-host]';

export function useCinematics(routeKey: string, enabled = true) {
  useEffect(() => {
    const root = document.getElementById('workspace');
    if (!root || !enabled) { document.documentElement.classList.remove('cinematic'); return; }
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cleanups: Array<() => void> = [];

    if (!still && typeof IntersectionObserver === 'function') {
      document.documentElement.classList.add('cinematic');
      const counted = new WeakSet<Element>();
      const waiting = new Set<HTMLElement>();
      const pendingTargets = new Set<HTMLElement>();
      const animations = new Map<HTMLElement, () => void>();
      let pending = 0, failsafe = 0;
      const stopFailsafe = () => {
        if (waiting.size || !failsafe) return;
        window.clearInterval(failsafe); failsafe = 0;
      };
      const reveal = (el: HTMLElement) => {
        el.dataset.reveal = 'in';
        waiting.delete(el);
        observer.unobserve(el);
        stopFailsafe();
        const count = (node: HTMLElement) => {
          if (counted.has(node)) return;
          counted.add(node);
          const cancel = countUp(node, () => { animations.delete(node); });
          if (cancel) animations.set(node, cancel);
        };
        el.querySelectorAll<HTMLElement>(COUNT_SELECTOR).forEach(count);
        if (el.matches(COUNT_SELECTOR)) count(el);
      };
      const observer = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) reveal(entry.target as HTMLElement);
      }, {rootMargin: '0px 0px -4% 0px', threshold: 0});
      const ensureFailsafe = () => {
        if (failsafe || !waiting.size) return;
        failsafe = window.setInterval(() => {
          if (document.visibilityState === 'hidden') return;
          const ready: HTMLElement[] = [];
          for (const el of waiting) {
            if (!root.contains(el)) { waiting.delete(el); observer.unobserve(el); continue; }
            if (el.getBoundingClientRect().top < innerHeight) ready.push(el);
          }
          ready.forEach(reveal);
          stopFailsafe();
        }, 700);
      };
      const scan = () => {
        pending = 0;
        // Measure only newly inserted HTML. Read layout before writing styles.
        const measured: Array<{el: HTMLElement; container: boolean}> = [];
        for (const el of pendingTargets) {
          if (!root.contains(el) || el.dataset.reveal) continue;
          measured.push({el, container: el.offsetHeight > innerHeight * .9 || !!el.querySelector(REVEAL_SELECTOR)});
        }
        pendingTargets.clear();
        let stagger = 0;
        for (const {el, container} of measured) {
          if (container) { el.dataset.reveal = 'in'; continue; }
          el.dataset.reveal = 'wait';
          el.style.setProperty('--reveal-delay', `${Math.min(stagger++, 8) * 55}ms`);
          waiting.add(el); observer.observe(el);
        }
        ensureFailsafe();
      };
      const collect = (node: Node) => {
        if (!(node instanceof HTMLElement) || node.closest(GRAPH_SELECTOR)) return;
        if (node.matches(REVEAL_SELECTOR)) pendingTargets.add(node);
        node.querySelectorAll<HTMLElement>(REVEAL_SELECTOR).forEach(el => {
          if (!el.closest(GRAPH_SELECTOR)) pendingTargets.add(el);
        });
      };
      collect(root); scan();
      const mutations = new MutationObserver(records => {
        for (const record of records) {
          // SVG path churn and counter text must not rescan the workspace.
          if (record.target instanceof Element && record.target.closest(GRAPH_SELECTOR)) continue;
          record.addedNodes.forEach(collect);
        }
        if (pendingTargets.size && !pending) pending = requestAnimationFrame(scan);
      });
      mutations.observe(root, {childList: true, subtree: true});
      cleanups.push(() => {
        observer.disconnect(); mutations.disconnect(); cancelAnimationFrame(pending);
        window.clearInterval(failsafe);
        for (const el of waiting) el.dataset.reveal = 'in';
        waiting.clear(); pendingTargets.clear();
        for (const cancel of animations.values()) cancel();
        animations.clear();
        document.documentElement.classList.remove('cinematic');
      });
    } else {
      document.documentElement.classList.remove('cinematic');
    }

    let marked: Element[] = [], activeTable: HTMLTableElement | null = null, activeColumn = -1;
    const clear = () => {
      marked.forEach(el => el.classList.remove('is-col')); marked = [];
      activeTable = null; activeColumn = -1;
    };
    const onOver = (event: Event) => {
      const cell = event.target instanceof Element ? event.target.closest<HTMLTableCellElement>('td,th') : null;
      const table = cell?.closest<HTMLTableElement>('.capability-matrix,.envelope-table,.science-table,.system-table') ?? null;
      if (table && table === activeTable && cell?.cellIndex === activeColumn) return;
      clear();
      if (!cell || !table) return;
      activeTable = table; activeColumn = cell.cellIndex;
      for (const row of Array.from(table.rows)) {
        const target = row.cells[activeColumn];
        if (target) { target.classList.add('is-col'); marked.push(target); }
      }
    };
    root.addEventListener('pointerover', onOver); root.addEventListener('pointerleave', clear);
    cleanups.push(() => {
      root.removeEventListener('pointerover', onOver); root.removeEventListener('pointerleave', clear); clear();
    });
    return () => cleanups.forEach(fn => fn());
  }, [routeKey, enabled]);
}

function countUp(el: HTMLElement, done: () => void): (() => void) | undefined {
  const text = (el.textContent || '').trim();
  if (!/^\d{1,6}$/.test(text) || Number(text) < 2) return;
  const target = Number(text), start = performance.now(), duration = Math.min(1400, 500 + target * 18);
  let written = '0', frame = 0;
  const cancel = () => {
    cancelAnimationFrame(frame);
    // Restore only our own intermediate value, never a newer React publication.
    if (el.textContent === written) el.textContent = text;
  };
  const step = (now: number) => {
    if (!el.isConnected || el.textContent !== written) { done(); return; }
    if (document.visibilityState === 'hidden') { cancel(); done(); return; }
    const t = Math.min(1, (now - start) / duration);
    written = String(Math.round(target * (1 - Math.pow(1 - t, 3))));
    if (el.textContent !== written) el.textContent = written;
    if (t < 1) frame = requestAnimationFrame(step); else done();
  };
  el.textContent = written;
  frame = requestAnimationFrame(step);
  return cancel;
}
