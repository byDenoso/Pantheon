import { useEffect } from 'react';

const SELECTOR = '.mc-section, .mc-telemetry, .science-table-wrap, .overview > section';

/**
 * Slow editorial reveal: sections rise into view once, as they are scrolled to.
 * Pure presentation (adds classes); skipped when the user prefers reduced motion.
 */
export function useReveal(deps: unknown[]): void {
  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    const frame = requestAnimationFrame(() => {
      for (const element of document.querySelectorAll(SELECTOR)) {
        if (element.classList.contains('is-visible')) continue;
        const rect = element.getBoundingClientRect();
        if (rect.top < window.innerHeight * 0.9) continue; // already on screen: no flash
        element.classList.add('ed-reveal');
        observer.observe(element);
      }
    });
    // Safety net: content must never stay hidden if the observer does not fire
    // (background tabs, embedded webviews, print). Reveal everything shortly after.
    const fallback = window.setTimeout(() => {
      for (const element of document.querySelectorAll('.ed-reveal:not(.is-visible)')) element.classList.add('is-visible');
    }, 2500);
    return () => { cancelAnimationFrame(frame); window.clearTimeout(fallback); observer.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
