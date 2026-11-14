'use strict';

/* Pages: login, server picker, overview and module settings. */
(function () {
  const D = window.Dash;
  const { el, icon } = D;
  const ui = (k, v) => D.ui(k, v);

  const fmtNumber = (n) => new Intl.NumberFormat(D.S.lang).format(n);
  function relTime(at) {
    const diff = (at - Date.now()) / 1000;
    const rtf = new Intl.RelativeTimeFormat(D.S.lang, { numeric: 'auto' });
    for (const [unit, size] of [['day', 86400], ['hour', 3600], ['minute', 60]]) if (Math.abs(diff) >= size) return rtf.format(Math.round(diff / size), unit);
    return rtf.format(0, 'minute');
  }

  const header = (title, sub, extra) => el('div', { class: 'page-header' }, [
    el('div', {}, [el('h1', { class: 'page-title', text: title }), sub ? el('p', { class: 'muted', text: sub }) : null]),
    extra || null
  ]);

  const guildIcon = (g, size) => (g.icon
    ? el('img', { class: 'guild-icon', src: g.icon, alt: '', width: size, height: size })
    : el('span', { class: 'guild-icon guild-icon-empty', 'aria-hidden': 'true', text: (g.name || '?').split(/\s+/).map((w) => w.charAt(0)).join('').slice(0, 2).toUpperCase() }));

  /** Full-page login / sign-in state. */
  function loginScreen(state) {
    const root = document.getElementById('app');
    root.textContent = '';
    const me = D.S.me || {};
    const card = el('div', { class: 'card login-card' }, [
      el('img', { src: '/favicon.svg', alt: '', width: 40, height: 40 }),
      el('h1', { class: 'page-title', text: ui('login.title') }),
      state === 'signingIn' ? el('p', { class: 'muted', text: ui('login.signingIn') }) : null,
      state && state !== 'signingIn' ? el('p', { class: 'notice notice-error', role: 'alert' }, [icon('alert', 16), el('span', { text: ui(`login.${state}`) })]) : null,
      state === 'signingIn' ? null : el('p', { class: 'muted', text: ui('login.howTo') }),
      state === 'signingIn' ? null : el('code', { class: 'command', text: '/dashboard' }),
      state !== 'signingIn' && me.oauth ? el('div', { class: 'login-or' }, [el('span', { text: ui('login.or') })]) : null,
      state !== 'signingIn' && me.oauth ? el('a', { class: 'btn btn-primary btn-block', href: '/auth/discord' }, [ui('login.discord')]) : null
    ]);
    root.appendChild(el('main', { class: 'login' }, [card]));
    root.appendChild(el('footer', { class: 'footer' }, [el('span', { text: `${ui('hostedBy')} ` }), el('a', { href: 'https://aclclouds.com', target: '_blank', rel: 'noopener' }, ['ACLClouds'])]));
  }

  /** Server picker shown when no server is selected. */
  function picker() {
    const guilds = D.S.guilds;
    if (!guilds.length) {
      return el('div', {}, [header(ui('picker.title')), el('div', { class: 'card empty' }, [el('p', { text: ui('picker.empty') }), el('code', { class: 'command', text: '/dashboard' })])]);
    }
    return el('div', {}, [
      header(ui('picker.title'), ui('picker.subtitle')),
      el('div', { class: 'guild-grid' }, guilds.map((g) => el('a', { class: 'card guild-card', href: `#/g/${g.id}` }, [
        guildIcon(g, 48),
        el('div', { class: 'guild-card-text' }, [el('strong', { text: g.name }), el('span', { class: 'muted', text: ui('members', { count: fmtNumber(g.memberCount) }) })])
      ])))
    ]);
  }

  function stat(label, value, iconName) {
    return el('div', { class: 'card stat' }, [el('div', { class: 'stat-label' }, [icon(iconName, 16), el('span', { text: label })]), el('div', { class: 'stat-value', text: value })]);
  }

  const pill = (on) => el('span', { class: `pill ${on ? 'pill-on' : 'pill-off'}`, text: ui(on ? 'enabled' : 'disabled') });

  function overview() {
    const o = D.S.overview;
    const g = o.guild;
    const stats = [stat(ui('stats.members'), fmtNumber(g.memberCount), 'users'), stat(ui('stats.channels'), fmtNumber(g.channelCount), 'list'), stat(ui('stats.roles'), fmtNumber(g.roleCount), 'tag')];
    if (o.openTickets !== null && o.openTickets !== undefined) stats.push(stat(ui('stats.tickets'), fmtNumber(o.openTickets), 'ticket'));

    const moduleRows = (list) => list.map((m) => el('a', { class: 'list-row', href: `#/g/${g.id}/m/${m.module}` }, [
      el('span', { class: 'list-row-main' }, [icon(D.MODULE_ICONS[m.module] || 'sliders', 16), el('span', { text: D.modTitle(m.module) })]),
      pill(!!D.current(togglePath(m.module)))
    ]));
    const protections = o.modules.filter((m) => m.protection);
    const others = o.modules.filter((m) => !m.protection);

    const history = o.history.length
      ? o.history.map((h) => el('li', { class: 'list-row' }, [
        el('span', { class: 'list-row-main' }, [icon(h.kind === 'action' ? 'play' : 'sliders', 16), el('span', { text: ui(h.kind === 'action' ? 'history.action' : 'history.config', { user: h.user, module: (h.modules || []).map(D.modTitle).join(', ') }) })]),
        el('time', { class: 'muted small', datetime: new Date(h.at).toISOString(), text: relTime(h.at) })
      ]))
      : [el('li', { class: 'list-empty muted', text: ui('history.empty') })];

    return el('div', {}, [
      el('div', { class: 'page-header' }, [el('div', { class: 'row' }, [guildIcon(g, 40), el('div', {}, [el('h1', { class: 'page-title', text: g.name }), el('p', { class: 'muted', text: ui('overview') })])])]),
      el('div', { class: 'stats' }, stats),
      el('div', { class: 'grid-2' }, [
        el('section', { class: 'card' }, [el('h2', { class: 'card-title', text: ui('protections') }), protections.length ? el('div', { class: 'list' }, moduleRows(protections)) : el('p', { class: 'muted', text: ui('noProtections') })]),
        el('section', { class: 'card' }, [el('h2', { class: 'card-title', text: ui('recentChanges') }), el('ul', { class: 'list' }, history)])
      ]),
      others.length ? el('section', { class: 'card' }, [el('h2', { class: 'card-title', text: ui('otherModules') }), el('div', { class: 'list list-cols' }, moduleRows(others))]) : null
    ]);
  }

  const togglePath = (name) => ((D.S.schema.modules.find((m) => m.name === name) || {}).toggle);

  function fieldRow(field, mod) {
    const id = `f-${field.path.replace(/[^\w-]/g, '-')}`;
    const err = D.S.errors[field.path];
    const changed = Object.prototype.hasOwnProperty.call(D.S.pending, field.path);
    const input = D.fieldInput(field, D.current(field.path), (v) => {
      D.setValue(field.path, v);
      row.classList.toggle('field-changed', Object.prototype.hasOwnProperty.call(D.S.pending, field.path));
      const msg = row.querySelector('.field-error');
      if (msg) msg.remove();
      if (field.path === mod.toggle) D.renderMain();
    }, { ui: (k) => ui(`field.${k}`), tr: D.tr, res: D.S.res, id });
    if (field.readOnly) D.lock(input);
    const inline = field.type === 'boolean';
    const row = el('div', { class: `field${inline ? ' field-inline' : ''}${changed ? ' field-changed' : ''}${err ? ' field-invalid' : ''}` }, [
      el('div', { class: 'field-text' }, [
        el(inline ? 'span' : 'label', { class: 'field-label', for: inline ? null : id, text: D.tr(field.label) }),
        field.help ? el('p', { class: 'field-help', text: D.tr(field.help) }) : null
      ]),
      el('div', { class: 'field-control' }, [input]),
      err ? el('p', { class: 'field-error', role: 'alert', text: ui(`errors.${err.error}`, { min: err.min, max: err.max }) }) : null
    ]);
    return row;
  }

  async function runAction(mod, action) {
    const label = D.tr(action.label);
    if (action.danger && !(await D.confirm(label, ui('actionConfirm'), true))) return;
    try {
      const out = await D.api('POST', `/api/guilds/${D.S.guildId}/actions/${mod.name}/${action.id}`, { lang: D.S.lang });
      D.toast(out.message || ui('actionDone'), 'success');
      await D.reloadOverview();
    } catch (err) {
      D.toast((err.data && err.data.message) || ui(err.status === 429 ? 'errors.rateLimited' : 'actionFailed'), 'error');
    }
  }

  function modulePage(name) {
    const mod = D.S.schema.modules.find((m) => m.name === name);
    if (!mod) return el('div', { class: 'card empty' }, [el('p', { text: ui('notFound') })]);
    const enabled = mod.toggle ? !!D.current(mod.toggle) : true;
    const toggleLocked = mod.toggle && (D.fieldOf(mod.toggle) || {}).readOnly;
    const headSwitch = mod.toggle ? D.toggle(enabled, (v) => { D.setValue(mod.toggle, v); D.renderMain(); }, ui('enableModule', { module: D.modTitle(name) })) : null;
    if (toggleLocked) D.lock(headSwitch);
    const headToggle = mod.toggle ? el('label', { class: 'head-toggle', title: toggleLocked ? ui('ownerOnly') : null }, [el('span', { text: ui(enabled ? 'enabled' : 'disabled') }), headSwitch]) : null;
    const ownerNote = () => el('p', { class: 'notice notice-lock' }, [icon('lock', 16), el('span', { text: ui('ownerOnly') })]);
    const sections = mod.sections.map((s) => {
      const fields = s.fields.filter((f) => f.path !== mod.toggle);
      if (!fields.length) return null;
      return el('section', { class: 'card section' }, [
        s.title ? el('h2', { class: 'card-title', text: D.tr(s.title) }) : null,
        s.description ? el('p', { class: 'muted section-desc', text: D.tr(s.description) }) : null,
        s.readOnly ? ownerNote() : null,
        el('div', { class: 'fields' }, fields.map((f) => fieldRow(f, mod)))
      ]);
    });
    const actions = mod.actions.length ? el('section', { class: 'card' }, [
      el('h2', { class: 'card-title', text: ui('actions') }),
      mod.actions.some((a) => a.readOnly) ? ownerNote() : null,
      el('div', { class: 'actions' }, mod.actions.map((a) => el('button', { type: 'button', class: `btn ${a.danger ? 'btn-danger-outline' : 'btn-secondary'}`, disabled: a.readOnly, title: a.readOnly ? ui('ownerOnly') : null, onclick: () => runAction(mod, a) }, [D.tr(a.label)])))
    ]) : null;
    return el('div', {}, [
      header(D.modTitle(name), mod.toggle && !enabled ? ui('moduleOff') : null, headToggle),
      ...sections,
      actions
    ]);
  }

  /** Content of the main column for the current route and loading state. */
  function current() {
    const S = D.S;
    if (S.loading) return el('div', { class: 'state', role: 'status' }, [el('span', { class: 'spinner', 'aria-hidden': 'true' }), el('span', { text: ui('loading') })]);
    if (S.failed) {
      return el('div', { class: 'card empty' }, [
        el('p', { class: 'notice notice-error' }, [icon('alert', 16), el('span', { text: ui(S.failed === 'forbidden' ? 'forbidden' : 'loadFailed') })]),
        el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => { S.guildId = null; D.go(`#/g/${window.location.hash.split('/')[2] || ''}`); } }, [ui('retry')])
      ]);
    }
    return S.module ? modulePage(S.module) : overview();
  }

  D.pages = { loginScreen, picker, current };
})();
