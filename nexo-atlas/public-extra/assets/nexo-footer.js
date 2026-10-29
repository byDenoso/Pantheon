(() => {
  const LABELS = {
    'pt-BR': { nav: 'Mais páginas', method: 'Método', publications: 'Publicações' },
    en: { nav: 'More pages', method: 'Method', publications: 'Publications' },
  };
  const ORCID = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;
  let config = null;
  let loading = false;
  let observers = [];

  const isPrivate = () => location.hash.startsWith('#/privado');

  function locale() {
    const lang = document.documentElement.lang;
    if (/^en/i.test(lang)) return 'en';
    if (/^pt/i.test(lang)) return 'pt-BR';
    let saved = null;
    try { saved = localStorage.getItem('atlas.locale'); } catch { /* storage blocked */ }
    if (saved === 'en' || saved === 'pt-BR') return saved;
    return /^en/i.test(navigator.language) ? 'en' : 'pt-BR';
  }

  function link(href, text) {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = text;
    return a;
  }

  function apply() {
    if (isPrivate()) return;
    const footer = document.querySelector('.atlas-footer-in');
    if (!footer) return;
    const current = locale();
    const orcid = config && ORCID.test(config.orcid || '') ? config.orcid : '';
    let nav = footer.querySelector(':scope > .nexo-footer-nav');
    if (nav && nav.dataset.locale === current && nav.dataset.orcid === orcid) return;
    const text = LABELS[current];
    if (!nav) {
      nav = document.createElement('nav');
      nav.className = 'nexo-footer-nav';
      const mail = footer.querySelector(':scope > a[href^="mailto"]');
      mail ? footer.insertBefore(nav, mail) : footer.append(nav);
    }
    nav.setAttribute('aria-label', text.nav);
    nav.dataset.locale = current;
    nav.dataset.orcid = orcid;
    nav.replaceChildren(link('/metodo.html', text.method));
    if (orcid) {
      const a = link(`https://orcid.org/${orcid}`, 'ORCID');
      a.rel = 'noopener';
      nav.append(a);
    }
  }

  function loadConfig() {
    if (config || loading) return;
    loading = true;
    fetch('/site-config.json', { cache: 'no-cache' })
      .then((response) => (response.ok ? response.json() : {}))
      .then((json) => { config = json && typeof json === 'object' ? json : {}; })
      .catch(() => { config = {}; })
      .finally(() => { loading = false; apply(); });
  }

  function stop() {
    observers.forEach((observer) => observer.disconnect());
    observers = [];
  }

  function start() {
    if (observers.length) return;
    const body = new MutationObserver(apply);
    body.observe(document.body, { childList: true, subtree: true });
    const lang = new MutationObserver(apply);
    lang.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    observers = [body, lang];
  }

  function route() {
    if (isPrivate()) {
      stop();
      document.querySelectorAll('.nexo-footer-nav').forEach((nav) => nav.remove());
      return;
    }
    start();
    loadConfig();
    apply();
  }

  addEventListener('hashchange', route);
  route();
})();
