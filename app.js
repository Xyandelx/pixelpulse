(() => {
  'use strict';

  const I18N = {
    es: {
      tagline: 'Tu pulso diario de videojuegos',
      search: 'Buscar noticias…', searchAria: 'Buscar noticias',
      allSources: 'Todos los medios', sourceAria: 'Filtrar por medio',
      langAria: 'Idioma de las noticias',
      themeAria: 'Cambiar entre tema claro y oscuro',
      catsAria: 'Categorías',
      all: 'Todas',
      cat_pc: 'PC', cat_playstation: 'PlayStation', cat_xbox: 'Xbox', cat_nintendo: 'Nintendo',
      cat_mobile: 'Móvil', cat_esports: 'Esports', cat_releases: 'Lanzamientos',
      featured: 'Destacadas', latest: 'Últimas noticias', more: 'Ver más noticias',
      empty: 'No hay noticias que coincidan con tu búsqueda.',
      emptyFirst: 'Aún no hay noticias. La primera actualización automática las traerá.',
      error: 'No se pudieron cargar las noticias. Inténtalo de nuevo más tarde.',
      updated: 'Última actualización: ',
      share: 'Compartir', copy: 'Copiar enlace', copied: 'Enlace copiado', copyFail: 'No se pudo copiar el enlace',
      about: 'Acerca de', privacy: 'Privacidad', contact: 'Contacto', rss: 'RSS',
      disclaimer: 'Las noticias pertenecen a sus medios de origen. PixelPulse solo muestra titulares y un resumen breve, y enlaza al artículo original.'
    },
    en: {
      tagline: 'Your daily gaming pulse',
      search: 'Search news…', searchAria: 'Search news',
      allSources: 'All outlets', sourceAria: 'Filter by outlet',
      langAria: 'News language',
      themeAria: 'Switch between light and dark theme',
      catsAria: 'Categories',
      all: 'All',
      cat_pc: 'PC', cat_playstation: 'PlayStation', cat_xbox: 'Xbox', cat_nintendo: 'Nintendo',
      cat_mobile: 'Mobile', cat_esports: 'Esports', cat_releases: 'Releases',
      featured: 'Featured', latest: 'Latest news', more: 'Show more news',
      empty: 'No news match your search.',
      emptyFirst: 'No news yet. The first automatic update will bring them.',
      error: 'The news could not be loaded. Please try again later.',
      updated: 'Last updated: ',
      share: 'Share', copy: 'Copy link', copied: 'Link copied', copyFail: 'Could not copy the link',
      about: 'About', privacy: 'Privacy', contact: 'Contact', rss: 'RSS',
      disclaimer: 'News belongs to the original outlets. PixelPulse only shows headlines and a short summary, and links to the original article.'
    }
  };

  const CATS = ['pc', 'playstation', 'xbox', 'nintendo', 'mobile', 'esports', 'releases'];
  const LANGS = [['es', 'ES'], ['en', 'EN'], ['all', 'ES+EN']];
  const PAGE = 24;
  const state = { items: [], lang: 'all', cat: 'all', source: 'all', q: '', shown: PAGE, loaded: false, failed: false, updated: null };

  const $ = (id) => document.getElementById(id);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ }
    }
  };
  const uiLang = () => state.lang !== 'all' ? state.lang
    : ((navigator.language || 'es').toLowerCase().startsWith('es') ? 'es' : 'en');
  const t = (k) => I18N[uiLang()][k];
  const isUrl = (u) => /^https?:\/\//i.test(u || '');
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k === 'on') for (const [ev, fn] of Object.entries(v)) n.addEventListener(ev, fn);
        else if (v !== false && v != null) n.setAttribute(k, v);
      }
    }
    kids.forEach((c) => { if (c) n.append(c); });
    return n;
  }

  function timeAgo(iso) {
    const ms = new Date(iso).getTime();
    if (isNaN(ms)) return '';
    const s = Math.max(0, (Date.now() - ms) / 1000);
    const m = Math.max(1, Math.floor(s / 60)), h = Math.floor(s / 3600), d = Math.floor(s / 86400);
    const es = uiLang() === 'es';
    if (s < 3600) return es ? `hace ${m} min` : `${m} min ago`;
    if (s < 86400) return es ? `hace ${h} h` : `${h} h ago`;
    return es ? `hace ${d} d` : `${d} d ago`;
  }

  function toast(msg) {
    const n = $('toast');
    n.textContent = msg;
    n.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => n.classList.remove('show'), 1800);
  }

  function copyLink(link) {
    const fallback = () => {
      const ta = el('textarea', { style: 'position:fixed;opacity:0' });
      ta.value = link;
      document.body.append(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      toast(ok ? t('copied') : t('copyFail'));
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(() => toast(t('copied')), fallback);
    } else fallback();
  }

  /* ---------- Piezas de interfaz ---------- */
  function thumb(item, cls) {
    const box = el('div', { class: 'thumb ' + (cls || '') }, el('span', { class: 'ph', text: item.source }));
    if (item.image) {
      const img = el('img', { src: item.image, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
      img.addEventListener('error', () => img.remove());
      box.append(img);
    }
    return box;
  }

  function metaRow(item) {
    return el('div', { class: 'meta' },
      el('span', { class: 'badge', 'data-l': item.lang, text: item.lang.toUpperCase() }),
      el('span', { class: 'src', text: item.source }),
      el('span', { class: 'ago', text: timeAgo(item.date) }));
  }

  function titleLink(item, cls) {
    return el('a', { class: cls || '', href: item.link, target: '_blank', rel: 'noopener noreferrer', lang: item.lang, text: item.title });
  }

  function shareBar(item) {
    const text = encodeURIComponent(item.title), url = encodeURIComponent(item.link);
    const a = (href, label, txt) => el('a', { class: 'btn-s', href, target: '_blank', rel: 'noopener noreferrer', 'aria-label': label, title: label, text: txt });
    return el('div', { class: 'share' },
      el('span', { class: 'share-l', text: t('share') }),
      a(`https://wa.me/?text=${text}%20${url}`, 'WhatsApp', 'WhatsApp'),
      a(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, 'X', 'X'),
      el('button', { class: 'btn-s', type: 'button', 'aria-label': t('copy'), title: t('copy'), text: '🔗', on: { click: () => copyLink(item.link) } }));
  }

  function card(item) {
    const tags = el('div', { class: 'tags' },
      ...item.cats.slice(0, 3).map((c) => el('span', { class: 'tag', 'data-cat': c, text: t('cat_' + c) || c })));
    return el('article', { class: 'card' },
      el('a', { class: 'thumb-link', href: item.link, target: '_blank', rel: 'noopener noreferrer', tabindex: '-1', 'aria-hidden': 'true' }, thumb(item)),
      el('div', { class: 'body' },
        metaRow(item),
        el('h3', null, titleLink(item)),
        item.summary ? el('p', { text: item.summary, lang: item.lang }) : null,
        tags,
        shareBar(item)));
  }

  function hero(item) {
    return el('article', { class: 'hero' },
      thumb(item),
      el('div', { class: 'hero-body' },
        metaRow(item),
        el('h2', null, titleLink(item, 'stretch')),
        item.summary ? el('p', { text: item.summary, lang: item.lang }) : null));
  }

  function mini(item) {
    return el('article', { class: 'mini' },
      thumb(item),
      el('div', null, metaRow(item), el('h3', null, titleLink(item, 'stretch'))));
  }

  /* ---------- Filtros ---------- */
  function filtered() {
    const q = norm(state.q.trim());
    return state.items.filter((i) =>
      (state.lang === 'all' || i.lang === state.lang) &&
      (state.cat === 'all' || i.cats.includes(state.cat)) &&
      (state.source === 'all' || i.source === state.source) &&
      (!q || norm(i.title + ' ' + i.summary).includes(q)));
  }

  function buildLangs() {
    const wrap = $('langs');
    wrap.replaceChildren(...LANGS.map(([code, label]) =>
      el('button', { type: 'button', 'aria-pressed': String(state.lang === code), text: label, on: { click: () => setLang(code) } })));
  }

  function buildCats() {
    const wrap = $('cats');
    wrap.replaceChildren(...['all', ...CATS].map((c) =>
      el('button', {
        type: 'button', class: 'chip' + (state.cat === c ? ' active' : ''), 'aria-pressed': String(state.cat === c),
        text: c === 'all' ? t('all') : t('cat_' + c),
        on: { click: () => { state.cat = c; state.shown = PAGE; buildCats(); render(); } }
      })));
  }

  function buildSources() {
    const sel = $('source');
    const names = [...new Set(state.items
      .filter((i) => state.lang === 'all' || i.lang === state.lang)
      .map((i) => i.source))].sort((a, b) => a.localeCompare(b));
    if (state.source !== 'all' && !names.includes(state.source)) state.source = 'all';
    sel.replaceChildren(el('option', { value: 'all', text: t('allSources') }), ...names.map((n) => el('option', { value: n, text: n })));
    sel.value = state.source;
  }

  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
    document.querySelectorAll('[data-i18n-ph]').forEach((n) => { n.placeholder = t(n.dataset.i18nPh); });
    document.querySelectorAll('[data-i18n-aria]').forEach((n) => { n.setAttribute('aria-label', t(n.dataset.i18nAria)); });
    const d = new Date(state.updated);
    $('updated').textContent = state.updated && !isNaN(d) ? t('updated') + d.toLocaleString(uiLang()) : '';
  }

  function setLang(code) {
    state.lang = code;
    state.shown = PAGE;
    store.set('pp-lang', code);
    document.documentElement.lang = uiLang();
    applyI18n(); buildLangs(); buildCats(); buildSources(); render();
  }

  function updateThemeBtn() {
    $('themeBtn').textContent = document.documentElement.dataset.theme === 'light' ? '☾' : '☀';
  }

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    store.set('pp-theme', next);
    updateThemeBtn();
  }

  /* ---------- Pintado ---------- */
  function render() {
    const top = $('top'), grid = $('grid'), more = $('more'), status = $('status'), latest = $('latestTitle');
    top.replaceChildren();
    grid.replaceChildren();
    more.hidden = true; status.hidden = true; latest.hidden = true;

    if (!state.loaded) {
      for (let i = 0; i < 6; i++) grid.append(el('div', { class: 'skel' }));
      return;
    }
    if (state.failed) { status.textContent = t('error'); status.hidden = false; return; }

    const list = filtered();
    if (!list.length) {
      status.textContent = state.items.length ? t('empty') : t('emptyFirst');
      status.hidden = false;
      return;
    }
    latest.hidden = false;

    let rest = list;
    if (list.length >= 6) {
      const hi = Math.max(0, list.findIndex((i) => i.image));
      const heroItem = list[hi];
      const used = new Set([heroItem.link]);
      const seen = new Set([heroItem.source]);
      const side = [];
      for (const i of list) {            // primero, un destacado por medio distinto
        if (side.length >= 4) break;
        if (used.has(i.link) || seen.has(i.source)) continue;
        side.push(i); used.add(i.link); seen.add(i.source);
      }
      for (const i of list) {            // si faltan, se completa con los más recientes
        if (side.length >= 4) break;
        if (used.has(i.link)) continue;
        side.push(i); used.add(i.link);
      }
      top.append(hero(heroItem), el('aside', { class: 'side' }, el('h2', { class: 'sec', text: t('featured') }), ...side.map(mini)));
      rest = list.filter((i) => !used.has(i.link));
    }

    rest.slice(0, state.shown).forEach((i) => grid.append(card(i)));
    more.hidden = rest.length <= state.shown;
  }

  function load() {
    fetch('news.json?t=' + Date.now())
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((d) => {
        state.items = (d.items || [])
          .filter((i) => i && i.title && isUrl(i.link))
          .map((i) => ({
            title: String(i.title), link: i.link, summary: String(i.summary || ''),
            image: isUrl(i.image) ? i.image : '', source: String(i.source || ''),
            lang: i.lang === 'en' ? 'en' : 'es', date: i.date || '',
            cats: Array.isArray(i.cats) ? i.cats.filter((c) => CATS.includes(c)) : []
          }));
        state.updated = d.updated || null;
        state.loaded = true;
        applyI18n(); buildSources(); render();
      })
      .catch(() => { state.failed = true; state.loaded = true; render(); });
  }

  function init() {
    const saved = store.get('pp-lang');
    if (saved === 'es' || saved === 'en' || saved === 'all') state.lang = saved;
    document.documentElement.lang = uiLang();
    applyI18n(); buildLangs(); buildCats(); buildSources(); updateThemeBtn(); render();

    let timer;
    $('q').addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => { state.q = e.target.value; state.shown = PAGE; render(); }, 120);
    });
    $('source').addEventListener('change', (e) => { state.source = e.target.value; state.shown = PAGE; render(); });
    $('more').addEventListener('click', () => { state.shown += PAGE; render(); });
    $('themeBtn').addEventListener('click', toggleTheme);
    load();
  }

  init();
})();
