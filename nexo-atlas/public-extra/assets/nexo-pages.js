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
    const chosen = saved === 'light' || saved === 'dark' ? saved : 'system';
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
      value === 'system' ? store.del(THEME) : store.set(THEME, value);
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

  const KIND = {
    article: { 'pt-BR': 'Artigo', en: 'Article' },
    preprint: { 'pt-BR': 'Preprint', en: 'Preprint' },
    report: { 'pt-BR': 'Relatório técnico', en: 'Technical report' },
    dataset: { 'pt-BR': 'Dados', en: 'Dataset' },
  };
  const COPY = {
    'pt-BR': { doi: 'DOI', bibtex: 'Copiar BibTeX', done: 'Copiado', none: 'Nenhum item publicado ainda. Os primeiros relatórios e artigos aparecem aqui, com DOI, quando forem depositados.', error: 'Não foi possível carregar a lista agora. Tente novamente em alguns minutos.', invalid: 'Algumas referências não puderam ser exibidas porque seus dados bibliográficos são inválidos.' },
    en: { doi: 'DOI', bibtex: 'Copy BibTeX', done: 'Copied', none: 'Nothing published yet. The first reports and articles will appear here, with a DOI, once deposited.', error: 'The list could not be loaded right now. Please try again in a few minutes.', invalid: 'Some references could not be displayed because their bibliographic details are invalid.' },
  };
  const DOI = /^10\.\d{4,9}\/[^\s{}<>"\\\x00-\x1f\x7f]+$/;
  let items = [];
  let state = 'loading';

  const pick = (value, locale) => {
    if (value && typeof value === 'object') {
      const text = value[locale] || value['pt-BR'];
      return typeof text === 'string' ? text : '';
    }
    return typeof value === 'string' ? value : '';
  };

  function normalize(raw, locale) {
    if (!raw || typeof raw !== 'object') return null;
    const title = pick(raw.title, locale).trim();
    if (!title) return null;
    const doi = typeof raw.doi === 'string' ? raw.doi.trim() : '';
    if (doi && !DOI.test(doi)) return null;
    const year = Number.isInteger(raw.year) ? raw.year : /^\d{4}$/.test(String(raw.year ?? '')) ? Number(raw.year) : null;
    return {
      id: typeof raw.id === 'string' && /^[\w.-]+$/.test(raw.id) ? raw.id : 'nexo',
      type: Object.hasOwn(KIND, raw.type) ? raw.type : 'report',
      title,
      authors: Array.isArray(raw.authors) ? raw.authors.filter((name) => typeof name === 'string' && name.trim()) : [],
      year,
      venue: typeof raw.venue === 'string' ? raw.venue.trim() : '',
      doi,
    };
  }

  const tex = (text) => String(text).replace(/[\\{}]/g, '\\$&').replace(/[&%#_$]/g, '\\$&').replace(/~/g, '\\textasciitilde{}').replace(/\^/g, '\\textasciicircum{}');

  function bibtex(item) {
    const kind = item.type === 'article' ? 'article' : 'misc';
    const fields = [
      ['author', tex(item.authors.join(' and '))],
      ['title', tex(item.title)],
      ['year', item.year],
      [item.type === 'article' ? 'journal' : 'publisher', item.venue && tex(item.venue)],
      ['doi', item.doi],
      ['url', item.doi && `https://doi.org/${item.doi}`],
    ].filter(([, value]) => value);
    return `@${kind}{${item.id},\n${fields.map(([key, value]) => `  ${key} = {${value}}`).join(',\n')}\n}`;
  }

  function renderPublications() {
    const box = document.getElementById('pub-list');
    if (!box || state === 'loading') return;
    const locale = root.dataset.lang || 'pt-BR';
    const copy = COPY[locale];
    box.replaceChildren();
    const valid = state === 'ok' ? items.map((raw) => normalize(raw, locale)).filter(Boolean) : [];
    const skipped = state === 'ok' ? items.length - valid.length : 0;
    if (!valid.length) {
      const empty = document.createElement('p');
      empty.className = 'atlas-empty';
      empty.textContent = state === 'error' ? copy.error : skipped > 0 ? copy.invalid : copy.none;
      box.append(empty);
      return;
    }
    for (const item of valid) {
      const article = document.createElement('article');
      article.className = 'atlas-item';
      const kicker = document.createElement('p');
      kicker.className = 'atlas-campaign-kicker';
      kicker.textContent = [KIND[item.type][locale], item.year].filter(Boolean).join(' · ');
      const title = document.createElement('h3');
      title.textContent = item.title;
      const meta = document.createElement('p');
      meta.textContent = [item.authors.join(', '), item.venue].filter(Boolean).join(' · ');
      article.append(kicker, title, meta);
      const actions = document.createElement('div');
      actions.className = 'nexo-pub-actions';
      if (item.doi) {
        const link = document.createElement('a');
        link.className = 'atlas-mail';
        link.href = `https://doi.org/${item.doi}`;
        link.rel = 'noopener';
        link.textContent = `${copy.doi} ${item.doi}`;
        actions.append(link);
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'atlas-text-action';
      button.textContent = copy.bibtex;
      button.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(bibtex(item)); button.textContent = copy.done; } catch { button.textContent = copy.bibtex; }
        setTimeout(() => { button.textContent = copy.bibtex; }, 1800);
      });
      actions.append(button);
      article.append(actions);
      box.append(article);
    }
    if (skipped > 0) {
      const note = document.createElement('p');
      note.className = 'atlas-empty';
      note.textContent = copy.invalid;
      box.append(note);
    }
  }

  async function loadPublications() {
    if (!document.getElementById('pub-list')) return;
    try {
      const response = await fetch('/publications.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!data || !Array.isArray(data.items)) throw new Error('unexpected shape');
      items = data.items;
      state = 'ok';
    } catch {
      items = [];
      state = 'error';
    }
    renderPublications();
  }

  document.addEventListener('nexo:locale', renderPublications);
  applyTheme();
  applyLocale();
  applyConfig();
  loadPublications();
})();
