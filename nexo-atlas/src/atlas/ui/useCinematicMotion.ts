import {useEffect} from 'react';

/**
 * Motion graphics (GSAP) for the public page: a cut-in title sequence on load and hard
 * "shot" entrances for each section heading. Transforms and clip-paths only — no DOM
 * splitting, so React keeps owning the text. No pinning, no scroll hijacking.
 * Off with reduced motion or the page's own animation pause.
 */
export function useCinematicMotion(enabled: boolean) {
  useEffect(() => {
    if (!enabled || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let cancelled = false, cleanup = () => {};
    void Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(([{gsap}, {ScrollTrigger}]) => {
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);
      gsap.ticker.lagSmoothing(0);
      gsap.config({nullTargetWarn: false});
      const root = document.querySelector<HTMLElement>('.atlas-public-main');
      if (!root) return;
      document.documentElement.classList.add('nexo-gsap');
      const ctx = gsap.context(() => {
        const hero = root.querySelector('.atlas-hero');
        if (hero) {
          document.documentElement.classList.add('nexo-gsap-intro');
          const tl = gsap.timeline({defaults: {ease: 'expo.out'}, onComplete: () => document.documentElement.classList.remove('nexo-gsap-intro')});
          tl.from(hero.querySelector('.atlas-eyebrow'), {clipPath: 'inset(0 100% 0 0)', duration: 0.9}, 0)
            .from(hero.querySelectorAll('h1 > span'), {yPercent: 105, clipPath: 'inset(0 0 100% 0)', skewY: 6, duration: 1.2, stagger: 0.12}, 0.1)
            .from(hero.querySelector('.atlas-hero-lead'), {opacity: 0, y: 26, filter: 'blur(8px)', duration: 1}, 0.55)
            .from(hero.querySelectorAll('.atlas-hero-actions > *'), {opacity: 0, x: -24, duration: 0.8, stagger: 0.08}, 0.7)
            .from(hero.querySelector('.atlas-hero-art'), {opacity: 0, scale: 1.18, filter: 'blur(14px)', duration: 1.6, clearProps: 'transform,filter'}, 0.15)
            .from(hero.querySelectorAll('.nexo-launch-records, .nexo-research-shortcut'), {opacity: 0, y: 40, rotateX: -40, transformPerspective: 900, transformOrigin: '50% 100%', duration: 0.9, stagger: 0.07, clearProps: 'transform'}, 0.85);
          gsap.to(hero.querySelector('.atlas-hero-copy'), {yPercent: -12, opacity: 0.3, ease: 'none', scrollTrigger: {trigger: hero, start: 'top top', end: 'bottom top', scrub: true}});
        }
        // Each section enters like a cut: eyebrow wipes in, heading slams up from a mask.
        root.querySelectorAll<HTMLElement>('.atlas-public-content > .atlas-section').forEach((section) => {
          const tl = gsap.timeline({paused: true, defaults: {ease: 'expo.out'}});
          tl.from(section.querySelector('.atlas-eyebrow'), {clipPath: 'inset(0 100% 0 0)', duration: 0.8}, 0)
            .from(section.querySelector('h2'), {yPercent: 70, clipPath: 'inset(0 0 100% 0)', skewY: 4, duration: 1.1}, 0.05)
            .from(section.querySelectorAll('.nexo-section-lead, .atlas-lead, .nexo-contact-copy'), {opacity: 0, y: 20, filter: 'blur(6px)', duration: 0.9}, 0.3)
            .from(section.querySelectorAll('.atlas-line-number'), {opacity: 0, scale: 2.4, duration: 0.9, stagger: 0.06}, 0.25);
          ScrollTrigger.create({trigger: section, start: 'top 82%', once: true, onEnter: () => tl.play()});
        });
      }, root);
      const refresh = () => ScrollTrigger.refresh();
      window.addEventListener('load', refresh, {once: true});
      cleanup = () => { window.removeEventListener('load', refresh); ctx.revert(); document.documentElement.classList.remove('nexo-gsap', 'nexo-gsap-intro'); };
    }).catch(() => {});
    return () => { cancelled = true; cleanup(); };
  }, [enabled]);
}
