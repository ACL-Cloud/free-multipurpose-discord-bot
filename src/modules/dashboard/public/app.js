'use strict';

/*
 * Dashboard application: state, API calls, routing and the app shell.
 * Pages (overview, module settings) live in pages.js and use the helpers
 * exported on window.Dash.
 */
(function () {
  const D = window.Dash;
  const { el, icon } = D;
  const LANG_NAMES = { fr: 'Français', en: 'English', es: 'Español', de: 'Deutsch', pt: 'Português' };

  const S = {
    me: null, lang: 'en', langExplicit: false, i18n: { ui: {}, modules: {}, labels: {} },
    guilds: [], guildId: null, module: null, overview: null, schema: null, res: null,
    values: {}, pending: {}, errors: {}, loading: false, failed: false
  };
  D.S = S;

  const storage = {
    get(k) { try { return window.localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, v); } catch { /* private mode: not critical */ } }
  };

  /** UI string from the dashboard namespace ("ui" section). */
  D.ui = (key, vars) => {
    let cur = S.i18n.ui;
    for (const part of key.split('.')) cur = cur && typeof cur === 'object' ? cur[part] : undefined;
    if (typeof cur !== 'string') return key;
    return cur.replace(/\{(\w+)\}/g, (m, n) => (vars && vars[n] !== undefined ? String(vars[n]) : m));
  };
  /** Schema label (module namespace key) translated by the server. */
  D.tr = (key) => (key && S.i18n.labels[key]) || (key ? key.split('.').slice(-2, -1)[0] || key : '');
  D.modTitle = (name) => S.i18n.labels[`${name}:dashboard.title`] || S.i18n.modules[name] || name.charAt(0).toUpperCase() + name.slice(1);

  /** fetch wrapper: JSON in and out, CSRF header on writes, error carries the server payload. */
  D.api = async (method, url, body) => {
    const opts = { method, headers: {}, credentials: 'same-origin' };
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    if (method !== 'GET' && S.me && S.me.csrf) opts.headers['X-CSRF-Token'] = S.me.csrf;
    const res = await fetch(url, opts);
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) {
      const err = new Error((data && data.error) || String(res.status));
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  };

  async function loadI18n(lang) {
    S.i18n = await D.api('GET', `/api/i18n/${lang}`);
    S.lang = lang;
    document.documentElement.lang = lang;
    document.title = D.ui('title');
  }

  /* ---------- pending changes ---------- */

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  D.current = (path) => (Object.prototype.hasOwnProperty.call(S.pending, path) ? S.pending[path] : S.values[path]);
  D.setValue = (path, value) => {
    if (same(value, S.values[path])) delete S.pending[path];
    else S.pending[path] = value;
    delete S.errors[path];
    updateSavebar();
    syncToggles();
  };
  /** Public schema field for a store path (null when unknown). */
  D.fieldOf = (path) => {
    for (const m of (S.schema && S.schema.modules) || []) for (const s of m.sections) for (const f of s.fields) if (f.path === path) return f;
    return null;
  };
  const pendingCount = () => Object.keys(S.pending).length;

  /* ---------- toasts and confirmation ---------- */

  D.toast = (text, kind) => {
    const box = document.getElementById('toasts');
    if (!box) return;
    const node = el('div', { class: `toast${kind ? ` toast-${kind}` : ''}`, role: 'status' }, [text]);
    box.appendChild(node);
    setTimeout(() => node.remove(), 4000);
  };

  D.confirm = (title, body, danger) => new Promise((resolve) => {
    const dialog = el('dialog', { class: 'dialog' });
    const close = (v) => { dialog.close(); dialog.remove(); resolve(v); };
    dialog.appendChild(el('form', { method: 'dialog', class: 'dialog-body' }, [
      el('h2', { class: 'dialog-title', text: title }),
      el('p', { class: 'muted', text: body }),
      el('div', { class: 'dialog-actions' }, [
        el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => close(false) }, [D.ui('cancel')]),
        el('button', { type: 'button', class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, onclick: () => close(true) }, [D.ui('confirm')])
      ])
    ]));
    dialog.addEventListener('cancel', () => close(false));
    document.body.appendChild(dialog);
    dialog.showModal();
  });

  /* ---------- routing ---------- */

  function parseHash() {
    const m = window.location.hash.match(/^#\/g\/(\d{15,22})(?:\/m\/([\w-]{1,64}))?$/);
    return m ? { guildId: m[1], module: m[2] || null } : { guildId: null, module: null };
  }

  D.go = (hash) => {
    if (window.location.hash === hash) route();
    else window.location.hash = hash;
  };

  async function route() {
    const { guildId, module } = parseHash();
    if (guildId && guildId !== S.guildId) {
      if (pendingCount() && !(await D.confirm(D.ui('discardTitle'), D.ui('discardBody'), true))) {
        window.history.replaceState(null, '', `#/g/${S.guildId}`);
        return;
      }
      await openGuild(guildId);
    }
    if (!guildId) {
      if (S.guilds.length === 1) return D.go(`#/g/${S.guilds[0].id}`);
      S.guildId = null;
    }
    S.module = module;
    S.menuOpen = false;
    renderShell();
  }

  async function openGuild(guildId) {
    S.guildId = guildId;
    S.pending = {};
    S.errors = {};
    S.loading = true;
    S.failed = false;
    renderShell();
    try {
      const base = `/api/guilds/${guildId}`;
      const [overview, schema, config, res] = await Promise.all([D.api('GET', `${base}/overview`), D.api('GET', `${base}/schema`), D.api('GET', `${base}/config`), D.api('GET', `${base}/resources`)]);
      Object.assign(S, { overview, schema, values: config.values, res, loading: false });
      if (!S.langExplicit && overview.guild.language && overview.guild.language !== S.lang) await loadI18n(overview.guild.language);
    } catch (err) {
      S.loading = false;
      S.failed = err.status === 403 ? 'forbidden' : 'error';
    }
  }

  D.reloadOverview = async () => {
    try { S.overview = await D.api('GET', `/api/guilds/${S.guildId}/overview`); } catch { /* keep the previous one */ }
  };

  /* ---------- save bar ---------- */

  async function save() {
    const btn = document.getElementById('save-btn');
    if (btn) btn.disabled = true;
    let message;
    let kind = 'success';
    try {
      const out = await D.api('POST', `/api/guilds/${S.guildId}/config`, { changes: S.pending, lang: S.lang });
      S.values = out.values;
      S.pending = {};
      S.errors = {};
      message = D.ui('saved');
      await D.reloadOverview();
    } catch (err) {
      if (err.data && err.data.fields) S.errors = err.data.fields;
      message = err.status === 429 ? D.ui('errors.rateLimited') : (err.status === 403 && err.data && err.data.message) || D.ui('saveFailed');
      kind = 'error';
    }
    // Re-render first: it rebuilds the toast container.
    renderShell();
    D.toast(message, kind);
    const firstError = document.querySelector('.field-invalid');
    if (firstError) firstError.scrollIntoView({ block: 'center' });
  }

  function updateSavebar() {
    const bar = document.getElementById('savebar');
    if (!bar) return;
    const n = pendingCount();
    bar.hidden = n === 0;
    const label = document.getElementById('savebar-text');
    if (label) label.textContent = D.ui(n === 1 ? 'unsavedOne' : 'unsavedMany', { count: n });
  }

  function syncToggles() {
    for (const input of document.querySelectorAll('[data-toggle-path]')) input.checked = !!D.current(input.getAttribute('data-toggle-path'));
  }

  /* ---------- shell ---------- */

  function topbar() {
    const guildSelect = S.guilds.length ? el('select', { class: 'input input-guild', 'aria-label': D.ui('server'), onchange: (e) => D.go(e.target.value ? `#/g/${e.target.value}` : '#/') }, [
      el('option', { value: '', text: D.ui('chooseServer') }),
      ...S.guilds.map((g) => el('option', { value: g.id, text: g.name, selected: g.id === S.guildId }))
    ]) : null;
    const langSelect = el('select', { class: 'input input-lang', 'aria-label': D.ui('language'), onchange: async (e) => { S.langExplicit = true; storage.set('dash.lang', e.target.value); await loadI18n(e.target.value); renderShell(); } },
      (S.me ? S.me.languages : Object.keys(LANG_NAMES)).map((l) => el('option', { value: l, text: l.toUpperCase(), title: LANG_NAMES[l] || l, selected: l === S.lang })));
    const user = S.me && S.me.user;
    return el('header', { class: 'topbar' }, [
      S.guildId ? el('button', { type: 'button', class: 'btn-icon menu-btn', 'aria-label': D.ui('menu'), onclick: () => document.body.classList.toggle('menu-open') }, [icon('menu')]) : null,
      el('a', { class: 'brand', href: '#/' }, [el('img', { src: '/favicon.svg', alt: '', width: 24, height: 24 }), el('span', { text: 'ACLClouds Bot' })]),
      guildSelect,
      el('div', { class: 'spacer' }),
      langSelect,
      user ? el('div', { class: 'user' }, [
        user.avatar ? el('img', { class: 'avatar', src: user.avatar, alt: '', width: 28, height: 28 }) : el('span', { class: 'avatar avatar-empty', 'aria-hidden': 'true', text: (user.username || '?').charAt(0).toUpperCase() }),
        el('span', { class: 'user-name', text: user.username })
      ]) : null,
      user ? el('button', { type: 'button', class: 'btn-icon', title: D.ui('logout'), 'aria-label': D.ui('logout'), onclick: logout }, [icon('logout')]) : null
    ]);
  }

  function sidebar() {
    const mods = (S.schema && S.schema.modules) || [];
    const link = (hash, label, iconName, active, extra) => el('div', { class: `nav-item${active ? ' active' : ''}` }, [
      el('a', { class: 'nav-link', href: hash, 'aria-current': active ? 'page' : null }, [icon(iconName), el('span', { text: label })]), extra || null
    ]);
    return el('nav', { class: 'sidebar', 'aria-label': D.ui('navigation') }, [
      link(`#/g/${S.guildId}`, D.ui('overview'), 'home', !S.module),
      mods.length ? el('div', { class: 'nav-heading', text: D.ui('modules') }) : null,
      ...mods.map((m) => {
        let sw = null;
        if (m.toggle) {
          sw = D.toggle(!!D.current(m.toggle), (v) => { D.setValue(m.toggle, v); if (S.module) renderMain(); }, D.ui('enableModule', { module: D.modTitle(m.name) }));
          sw.querySelector('input').setAttribute('data-toggle-path', m.toggle);
          if (D.fieldOf(m.toggle) && D.fieldOf(m.toggle).readOnly) { D.lock(sw); sw.setAttribute('title', D.ui('ownerOnly')); }
        }
        return link(`#/g/${S.guildId}/m/${m.name}`, D.modTitle(m.name), D.MODULE_ICONS[m.name] || 'sliders', S.module === m.name, sw);
      })
    ]);
  }

  function footer() {
    return el('footer', { class: 'footer' }, [
      el('span', { text: `${D.ui('hostedBy')} ` }),
      el('a', { href: 'https://aclclouds.com', target: '_blank', rel: 'noopener' }, ['ACLClouds'])
    ]);
  }

  function renderMain() {
    const main = document.getElementById('main');
    if (!main) return;
    main.textContent = '';
    main.appendChild(D.pages.current());
    updateSavebar();
  }

  function renderShell() {
    const root = document.getElementById('app');
    root.textContent = '';
    document.body.classList.remove('menu-open');
    root.appendChild(topbar());
    if (!S.guildId) {
      root.appendChild(el('main', { class: 'page page-narrow', id: 'main' }, [D.pages.picker()]));
    } else {
      const showNav = !S.loading && !S.failed;
      root.appendChild(el('div', { class: 'layout' }, [
        showNav ? sidebar() : null,
        el('div', { class: 'scrim', onclick: () => document.body.classList.remove('menu-open') }),
        el('main', { class: 'page', id: 'main' })
      ]));
      renderMain();
    }
    root.appendChild(footer());
    root.appendChild(el('div', { class: 'savebar', id: 'savebar', hidden: true, role: 'region', 'aria-label': D.ui('unsavedRegion') }, [
      el('span', { id: 'savebar-text' }),
      el('div', { class: 'row' }, [
        el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => { S.pending = {}; S.errors = {}; renderShell(); } }, [D.ui('reset')]),
        el('button', { type: 'button', class: 'btn btn-primary', id: 'save-btn', onclick: save }, [D.ui('save')])
      ])
    ]));
    root.appendChild(el('div', { class: 'toasts', id: 'toasts', 'aria-live': 'polite' }));
    updateSavebar();
  }
  D.renderShell = renderShell;
  D.renderMain = renderMain;

  async function logout() {
    try { await D.api('POST', '/logout', {}); } catch { /* the cookie is cleared anyway on reload */ }
    window.location.replace('/');
  }

  /* ---------- boot ---------- */

  async function boot() {
    const saved = storage.get('dash.lang');
    try {
      S.me = await D.api('GET', '/api/me');
      S.langExplicit = !!(saved && S.me.languages.includes(saved));
      await loadI18n(S.langExplicit ? saved : S.me.defaultLanguage);
    } catch {
      document.getElementById('app').textContent = 'The dashboard is unreachable. Try again in a moment.';
      return;
    }
    const token = (window.location.hash.match(/token=([\w-]{20,100})/) || [])[1];
    if (window.location.pathname === '/login' && token) {
      D.pages.loginScreen('signingIn');
      try {
        const out = await D.api('POST', '/api/login', { token });
        // Drop the token from the address bar and history right away.
        window.history.replaceState(null, '', `/#/g/${out.guildId}`);
        S.me = await D.api('GET', '/api/me');
      } catch (err) {
        window.history.replaceState(null, '', '/');
        return D.pages.loginScreen(err.status === 429 ? 'rateLimited' : 'linkInvalid');
      }
    }
    if (!S.me.user) return D.pages.loginScreen(/error=oauth/.test(window.location.search) ? 'oauthFailed' : null);
    try {
      S.guilds = (await D.api('GET', '/api/guilds')).guilds;
    } catch {
      S.guilds = [];
    }
    window.addEventListener('hashchange', route);
    window.addEventListener('beforeunload', (e) => { if (pendingCount()) { e.preventDefault(); e.returnValue = ''; } });
    route();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
