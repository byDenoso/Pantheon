import {useEffect} from 'react';

/** Short editorial transitions; no continuous renderer, camera motion or scroll-linked text. */
export function useCinematicMotion(enabled: boolean) {
  useEffect(() => {
    if (!enabled || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const root = document.querySelector<HTMLElement>('.atlas-public-main');
    // Study and claims routes have no cinematic targets. Avoid downloading or
    // evaluating the animation library until a page actually needs it.
    if (!root?.querySelector('.atlas-hero-copy, .atlas-public-content > .atlas-section')) return;
    let cancelled = false;
    let cleanup = () => {};
    void import('gsap').then(({gsap}) => {
      if (cancelled) return;
      const observers: IntersectionObserver[] = [];
      const ctx = gsap.context(() => {
        const intro = root.querySelectorAll('.atlas-hero-copy > *, .nexo-featured-evidence');
        if (intro.length) gsap.from(intro, {opacity:0, y:12, duration:.55, stagger:.06, ease:'power2.out', clearProps:'opacity,transform'});
        if (!('IntersectionObserver' in window)) return;
        root.querySelectorAll<HTMLElement>('.atlas-public-content > .atlas-section').forEach(section => {
          const observer = new IntersectionObserver(entries => {
            if (!entries.some(entry => entry.isIntersecting)) return;
            observer.disconnect();
            // Register delayed callbacks in the same context so a live pause reverts them too.
            ctx.add(() => {
              const heading = section.querySelectorAll('.atlas-eyebrow, h2');
              if (heading.length) gsap.from(heading, {opacity:.55, y:8, duration:.4, stagger:.04, ease:'power2.out', clearProps:'opacity,transform'});
            });
          }, {threshold:.05});
          observer.observe(section);
          observers.push(observer);
        });
      }, root);
      const visibility = () => {
        if (document.hidden) ctx.getTweens().forEach((tween: {progress: (value: number) => unknown}) => tween.progress(1));
      };
      document.addEventListener('visibilitychange', visibility);
      cleanup = () => {observers.forEach(observer => observer.disconnect());document.removeEventListener('visibilitychange', visibility);ctx.revert();};
    }).catch(() => {});
    return () => {cancelled = true;cleanup();};
  }, [enabled]);
}
