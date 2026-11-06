(() => {
  const root = document.documentElement;
  const THEME = 'atlas.theme';
  const LOCALE = 'atlas.locale';
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* storage blocked */ } },
    del(key) { try { localStorage.removeItem(key); } catch { /* storage blocked */ } },
  };
  const dark = matchMedia('(prefers-color-scheme: dark)');
  let autoLocale = null;

  function press(attr, value) {
    document.querySelectorAll(`[${attr}]`).forEach((button) => {
      button.setAttribute('aria-pressed', String(button.getAttribute(attr) === value));
    });
  }

  function applyTheme() {
    const saved = store.get(THEME);
    const chosen = saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'dark';
    root.dataset.theme = chosen === 'system' ? (dark.matches ? 'dark' : 'light') : chosen;
    press('data-theme-set', chosen);
  }

  async function resolveLocale() {
    const saved = store.get(LOCALE);
    if (saved === 'pt-BR' || saved === 'en') return saved;
    if (autoLocale) return autoLocale;
    try {
      const response = await fetch('/api/atlas-locale', { headers: { accept: 'application/json' } });
      const body = await response.json();
      if (body.locale === 'pt-BR' || body.locale === 'en') return (autoLocale = body.locale);
    } catch { /* fall back to the browser language */ }
    return (autoLocale = /^en/i.test(navigator.language) ? 'en' : 'pt-BR');
  }

  async function applyLocale() {
    const locale = await resolveLocale();
    const saved = store.get(LOCALE);
    root.lang = locale;
    root.dataset.lang = locale;
    const title = locale === 'en' ? root.dataset.titleEn : root.dataset.titlePt;
    if (title) document.title = title;
    press('data-lang-set', saved === 'pt-BR' || saved === 'en' ? saved : 'auto');
    document.dispatchEvent(new CustomEvent('nexo:locale', { detail: locale }));
  }

  document.addEventListener('click', (event) => {
    const theme = event.target.closest('[data-theme-set]');
    if (theme) {
      const value = theme.getAttribute('data-theme-set');
      store.set(THEME, value);
      applyTheme();
      return;
    }
    const lang = event.target.closest('[data-lang-set]');
    if (lang) {
      const value = lang.getAttribute('data-lang-set');
      value === 'auto' ? store.del(LOCALE) : store.set(LOCALE, value);
      applyLocale();
    }
  });
  dark.addEventListener('change', applyTheme);

  const toggle = document.querySelector('.atlas-menu-toggle');
  const menu = document.getElementById('atlas-header-menu');
  const preferences = document.querySelector('.atlas-preferences');
  document.addEventListener('click', (event) => {
    if (preferences?.open && !preferences.contains(event.target)) preferences.open = false;
  });
  if (toggle && menu) {
    const set = (open) => {
      menu.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      if (!open && preferences) preferences.open = false;
    };
    toggle.addEventListener('click', () => set(!menu.classList.contains('is-open')));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && preferences?.open) {
        preferences.open = false;
        preferences.querySelector('summary')?.focus();
        return;
      }
      if (event.key === 'Escape' && menu.classList.contains('is-open')) { set(false); toggle.focus(); }
    });
  }

  async function applyConfig() {
    let config = {};
    try { config = await (await fetch('/site-config.json', { cache: 'no-cache' })).json(); } catch { /* defaults stay in the HTML */ }
    const orcid = typeof config.orcid === 'string' && /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(config.orcid) ? config.orcid : '';
    document.querySelectorAll('[data-orcid]').forEach((link) => {
      if (orcid) { link.href = `https://orcid.org/${orcid}`; link.hidden = false; } else { link.hidden = true; }
    });
    if (typeof config.email === 'string' && /^[^@\s]+@[^@\s]+$/.test(config.email)) {
      document.querySelectorAll('[data-email]').forEach((link) => {
        link.href = `mailto:${config.email}`;
        if (link.hasAttribute('data-email-text')) link.firstChild.textContent = config.email;
      });
    }
  }

  applyTheme();
  applyLocale();
  applyConfig();
})();
