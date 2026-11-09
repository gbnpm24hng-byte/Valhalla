(function () {
  // B4 (v0.9.49): "Cuenta de la app" en la ficha del alumno. El entrenador invita (código +
  // link por WhatsApp), ve si la invitación está pendiente o si el alumno ya tiene cuenta, y
  // puede anular la invitación o quitar el acceso (client_links.active = false; nunca borra).
  // Usa las funciones de supabase/b4_invitaciones.sql; sin ese SQL, "Invitar" avisa y lo
  // demás de la app sigue igual. Nada de esto entra al estado local ni sube con coach_state.
  window.VALHALLA = window.VALHALLA || {};

  const authApi = window.VALHALLA.auth;
  const core = window.VALHALLA.inviteCore;
  const supabaseApi = window.VALHALLA.supabase;
  const cloudConfigured = Boolean(supabaseApi && typeof supabaseApi.isCloudEnabled === 'function' && supabaseApi.isCloudEnabled());

  if (!cloudConfigured || !authApi || !core || window.VALHALLA.onboarding?.active) {
    return;
  }

  const TIMEOUT_MS = 20000;
  const REFRESH_MIN_MS = 10000;
  const TIMED_OUT = { data: null, error: { message: 'timeout', timedOut: true }, status: 0 };
  const ctx = {
    ownerId: '',
    online: false,
    loaded: false,
    loadError: '',
    loadedAt: 0,
    missing: false, // la nube aún no tiene la tabla o las funciones de invitaciones
    links: new Map(), // client_id -> { email, canSelfLog } (canSelfLog leído de la nube)
    invites: [], // pendientes (sin usar ni anular)
    fresh: new Map(), // client_id -> { inviteId, code, expiresAt }: solo en memoria, el código se ve una vez
    notices: new Map(), // client_id -> { text, tone }
    busyClientId: ''
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function withTimeout(promise) {
    return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(TIMED_OUT), TIMEOUT_MS))]);
  }

  function client() {
    return authApi.getClient();
  }

  function isUnavailable(result) {
    return Boolean(result.error && (result.error.timedOut || authApi.isUnavailableError(result.error, result.status)));
  }

  function notifyChanged() {
    window.dispatchEvent(new CustomEvent('valhalla:invites-changed'));
  }

  function setNotice(clientId, text, tone = 'muted') {
    if (text) {
      ctx.notices.set(clientId, { text, tone });
    } else {
      ctx.notices.delete(clientId);
    }
  }

  async function load() {
    const ownerId = ctx.ownerId;
    if (!ownerId || !ctx.online) {
      return;
    }
    ctx.loadedAt = Date.now();
    const [links, invites, emails] = await Promise.all([
      withTimeout(client().from('client_links').select('client_id, can_self_log').eq('owner_id', ownerId).eq('active', true)),
      withTimeout(client().from('student_invites').select('id, client_id, expires_at, used_at, revoked_at, created_at')
        .eq('owner_id', ownerId).is('used_at', null).is('revoked_at', null)),
      withTimeout(client().rpc('coach_student_accounts'))
    ]);
    if (ownerId !== ctx.ownerId) {
      return;
    }
    if (links.error) {
      ctx.loaded = false;
      ctx.loadError = isUnavailable(links) ? 'sin conexión' : 'error';
      notifyChanged();
      return;
    }
    const emailByClient = new Map(emails.error ? [] : (emails.data || []).map((row) => [row.client_id, row.email || '']));
    ctx.links = new Map((links.data || []).map((row) => [row.client_id, { email: emailByClient.get(row.client_id) || '', canSelfLog: row.can_self_log === true }]));
    if (invites.error) {
      ctx.missing = core.isMissingCloudError(invites.error, invites.status);
      ctx.invites = [];
    } else {
      ctx.missing = false;
      ctx.invites = invites.data || [];
    }
    // Un código recién creado deja de mostrarse cuando su invitación ya no está pendiente.
    [...ctx.fresh.entries()].forEach(([clientId, fresh]) => {
      if (!ctx.invites.some((item) => item.id === fresh.inviteId)) {
        ctx.fresh.delete(clientId);
      }
    });
    ctx.loaded = true;
    ctx.loadError = '';
    notifyChanged();
  }

  // Al abrir una ficha: limpia su aviso y vuelve a consultar (por si el alumno se acaba de registrar).
  function refresh(clientId = '') {
    if (clientId) {
      setNotice(clientId, '');
    }
    if (ctx.online && ctx.ownerId && Date.now() - ctx.loadedAt > REFRESH_MIN_MS) {
      load();
    }
  }

  function inviteMessage(fresh, name) {
    const appUrl = `${window.location.origin}${window.location.pathname}`;
    const link = core.buildInviteLink(appUrl, fresh.code);
    return core.buildInviteMessage({ name, link, code: fresh.code, expiresAt: fresh.expiresAt });
  }

  // HTML de "Cuenta de la app" para la ficha (lo usa app.js). phone = el de WhatsApp ya normalizado.
  function renderSection(clientRecord, { name = '', phone = '' } = {}) {
    const clientId = clientRecord?.id || '';
    if (!clientId) {
      return '';
    }
    const id = escapeHtml(clientId);
    const pending = core.pickPending(ctx.invites, clientId);
    const fresh = ctx.fresh.get(clientId);
    const state = core.accountState({
      online: ctx.online,
      loaded: ctx.loaded,
      loadError: ctx.loadError,
      linked: ctx.links.has(clientId),
      pending: Boolean(pending)
    });
    const busy = ctx.busyClientId === clientId;
    const attrs = `data-invite-client="${id}" data-invite-name="${escapeHtml(name)}" data-invite-phone="${escapeHtml(phone)}"`;
    let body = '';

    if (state === 'offline') {
      body = '<p class="meta">Para invitar, inicia sesión con conexión.</p>';
    } else if (state === 'loading') {
      body = '<p class="meta">Consultando la cuenta…</p>';
    } else if (state === 'error') {
      body = `<p class="meta">No se pudo consultar la cuenta (${escapeHtml(ctx.loadError)}).</p><button class="auth-link" type="button" data-invite-reload ${attrs}>Reintentar</button>`;
    } else if (state === 'linked') {
      const email = ctx.links.get(clientId)?.email || '';
      const canSelfLog = ctx.links.get(clientId)?.canSelfLog === true;
      const published = window.VALHALLA.publish?.isPublished?.(clientId);
      body = `
        <p class="client-account-status ok" data-invite-state="linked">Cuenta activa${email ? ` <span class="meta">· ${escapeHtml(email)}</span>` : ''}</p>
        ${published === false ? '<p class="warn" data-invite-publish-reminder>Publica su programa: sin programa publicado, el alumno ve la pantalla vacía.</p>' : ''}
        <div class="client-selflog">
          <button class="client-selflog-switch${canSelfLog ? ' is-on' : ''}" type="button" role="switch" aria-checked="${canSelfLog}" data-invite-selflog ${attrs} ${busy ? 'disabled' : ''}>
            <span class="client-selflog-track" aria-hidden="true"><span class="client-selflog-knob"></span></span>
            <span class="client-selflog-label">Puede anotar sus series</span>
          </button>
          <p class="meta client-selflog-help">Apagado: ve su rutina y tú anotas en clase. Prendido: anota sus series desde su teléfono.</p>
        </div>
        <button class="auth-link client-account-danger" type="button" data-invite-unlink ${attrs} ${busy ? 'disabled' : ''}>Quitar acceso</button>`;
    } else if (state === 'pending') {
      const shown = fresh && fresh.inviteId === pending.id ? fresh : null;
      body = `
        <p class="client-account-status" data-invite-state="pending">Invitación enviada · vence el ${escapeHtml(core.formatShortDate(pending.expires_at))}</p>
        ${shown ? `
          <div class="client-account-code" data-invite-code>
            <small>Código (solo se muestra ahora)</small>
            <strong>${escapeHtml(core.formatCode(shown.code))}</strong>
          </div>
          <div class="client-account-buttons">
            <button class="secondary" type="button" data-invite-copy ${attrs}>Copiar mensaje</button>
            <button class="secondary" type="button" data-invite-whatsapp ${attrs}>Enviar por WhatsApp</button>
          </div>` : '<p class="meta">El código solo se ve al crearlo. Si lo perdiste, crea una invitación nueva.</p>'}
        <div class="client-account-buttons">
          <button class="secondary" type="button" data-invite-create ${attrs} ${busy ? 'disabled' : ''}>Nueva invitación</button>
          <button class="secondary" type="button" data-invite-revoke="${escapeHtml(pending.id)}" ${attrs} ${busy ? 'disabled' : ''}>Anular</button>
        </div>`;
    } else {
      body = `
        <p class="meta" data-invite-state="none">Sin cuenta. Le llega un link y un código por WhatsApp; crea su cuenta y queda vinculado a esta ficha.</p>
        <button class="client-invite-btn" type="button" data-invite-create ${attrs} ${busy ? 'disabled' : ''}>${busy ? 'Creando…' : 'Invitar'}</button>`;
    }
    const notice = ctx.notices.get(clientId);
    return `
      <section class="client-account" data-invite-section="${id}" aria-label="Cuenta de la app">
        <h3>Cuenta de la app</h3>
        ${body}
        ${notice ? `<p class="${escapeHtml(notice.tone)}" data-invite-notice role="status">${escapeHtml(notice.text)}</p>` : ''}
      </section>`;
  }

  async function createInvite(clientId, name) {
    if (ctx.missing) {
      setNotice(clientId, core.MISSING_CLOUD, 'warn');
      notifyChanged();
      return;
    }
    const renewing = Boolean(core.pickPending(ctx.invites, clientId));
    ctx.busyClientId = clientId;
    setNotice(clientId, '');
    notifyChanged();
    try {
      const result = await withTimeout(client().rpc('create_student_invite', { p_client_id: clientId, p_display_name: String(name || '').trim() }));
      if (result.error) {
        if (core.isMissingCloudError(result.error, result.status)) {
          ctx.missing = true;
          setNotice(clientId, core.MISSING_CLOUD, 'warn');
        } else {
          setNotice(clientId, isUnavailable(result) ? 'El servidor no respondió. No se creó la invitación.' : 'No se pudo crear la invitación. Intenta de nuevo.', 'warn');
        }
        return;
      }
      const data = result.data || {};
      if (!data.ok) {
        setNotice(clientId, core.describeCreateError(data.error), 'warn');
        return;
      }
      ctx.fresh.set(clientId, { inviteId: data.invite_id, code: data.code, expiresAt: data.expires_at });
      // Se agrega ya a la lista (la consulta de abajo la confirma).
      ctx.invites = ctx.invites.filter((item) => item.client_id !== clientId)
        .concat({ id: data.invite_id, client_id: clientId, expires_at: data.expires_at, used_at: null, revoked_at: null, created_at: new Date().toISOString() });
      setNotice(clientId, renewing ? 'Invitación nueva creada. La anterior ya no sirve.' : 'Invitación creada. Envíale el mensaje.', 'ok');
    } finally {
      ctx.busyClientId = '';
      notifyChanged();
    }
    load();
  }

  async function revokeInvite(clientId, inviteId) {
    ctx.busyClientId = clientId;
    notifyChanged();
    try {
      const result = await withTimeout(client().rpc('revoke_student_invite', { p_invite_id: inviteId }));
      if (result.error || !result.data?.ok) {
        setNotice(clientId, isUnavailable(result) ? 'El servidor no respondió. La invitación sigue igual.' : 'No se pudo anular la invitación.', 'warn');
        return;
      }
      ctx.fresh.delete(clientId);
      ctx.invites = ctx.invites.filter((item) => item.id !== inviteId);
      setNotice(clientId, 'Invitación anulada: ese código ya no sirve.', 'ok');
    } finally {
      ctx.busyClientId = '';
      notifyChanged();
    }
    load();
  }

  // Quitar acceso: el vínculo queda con active = false. No se borra la cuenta ni sus registros.
  async function unlink(clientId) {
    ctx.busyClientId = clientId;
    notifyChanged();
    try {
      const result = await withTimeout(client().from('client_links').update({ active: false })
        .eq('owner_id', ctx.ownerId).eq('client_id', clientId).eq('active', true));
      if (result.error) {
        setNotice(clientId, isUnavailable(result) ? 'El servidor no respondió. El acceso sigue igual.' : 'No se pudo quitar el acceso.', 'warn');
        return false;
      }
      ctx.links.delete(clientId);
      setNotice(clientId, 'Acceso quitado. Su cuenta y sus registros siguen guardados; para volver a darle acceso, invítalo de nuevo.', 'ok');
      return true;
    } finally {
      ctx.busyClientId = '';
      notifyChanged();
    }
  }

  // v0.9.54: "Puede anotar sus series" = client_links.can_self_log. Solo esa columna, solo el
  // vínculo activo de ese alumno y de este entrenador. Si la escritura falla, queda como estaba
  // (con aviso); si resulta, se vuelve a leer la nube para mostrar el estado real.
  async function setSelfLog(clientId, value) {
    const link = ctx.links.get(clientId);
    if (!link) {
      return false;
    }
    const before = link.canSelfLog === true;
    ctx.busyClientId = clientId;
    setNotice(clientId, '');
    notifyChanged();
    let ok = false;
    try {
      const result = await withTimeout(client().from('client_links').update({ can_self_log: value })
        .eq('owner_id', ctx.ownerId).eq('client_id', clientId).eq('active', true)
        .select('client_id, can_self_log'));
      const rows = Array.isArray(result.data) ? result.data : null;
      if (result.error || (rows && !rows.length)) {
        link.canSelfLog = before;
        const what = before ? 'Sigue prendido.' : 'Sigue apagado.';
        setNotice(clientId, result.error
          ? `${isUnavailable(result) ? 'El servidor no respondió.' : 'No se pudo cambiar el permiso.'} ${what}`
          : `No se encontró su cuenta activa. ${what}`, 'warn');
        return false;
      }
      link.canSelfLog = rows ? rows[0].can_self_log === true : value;
      setNotice(clientId, link.canSelfLog ? 'Listo: ahora puede anotar sus series desde su teléfono.' : 'Listo: ahora solo ve su rutina; tú anotas en clase.', 'ok');
      ok = true;
      return true;
    } finally {
      ctx.busyClientId = '';
      notifyChanged();
      if (ok) {
        ctx.loadedAt = 0;
        load();
      }
    }
  }

  // Para la franja de "Vista alumno": 'puede anotar', 'solo ver' o '' (si aún no se sabe).
  function selfLogLabel(clientId) {
    if (!ctx.loaded) {
      return '';
    }
    return ctx.links.get(clientId)?.canSelfLog === true ? 'puede anotar' : 'solo ver';
  }

  function confirmSelfLog(clientId, name) {
    closeModal();
    const overlay = document.createElement('div');
    overlay.id = 'inviteModal';
    overlay.className = 'sync-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="sync-modal-card card">
        <h2>Puede anotar sus series</h2>
        <p><strong>${escapeHtml(name || 'Este alumno')}</strong> podrá anotar sus series desde su teléfono.</p>
        <p class="muted">Lo que anote lo ves en Modo Grupo y lo puedes corregir. Puedes apagarlo cuando quieras.</p>
        <div class="inline-actions">
          <button class="secondary" type="button" data-invite-modal-cancel>Cancelar</button>
          <button class="primary" type="button" data-invite-modal-confirm>Prender</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-invite-modal-cancel]').addEventListener('click', closeModal);
    overlay.querySelector('[data-invite-modal-confirm]').addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = 'Guardando…';
      await setSelfLog(clientId, true);
      closeModal();
    });
    overlay.querySelector('[data-invite-modal-cancel]').focus();
  }

  function closeModal() {
    document.getElementById('inviteModal')?.remove();
  }

  function confirmUnlink(clientId, name) {
    closeModal();
    const overlay = document.createElement('div');
    overlay.id = 'inviteModal';
    overlay.className = 'sync-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="sync-modal-card card">
        <h2>Quitar acceso</h2>
        <p><strong>${escapeHtml(name || 'Este alumno')}</strong> ya no podrá ver su rutina en la app.</p>
        <p class="muted">No se borra nada: su cuenta, sus series y su ficha quedan guardadas. Para devolverle el acceso, invítalo de nuevo.</p>
        <div class="inline-actions">
          <button class="secondary" type="button" data-invite-modal-cancel>Cancelar</button>
          <button class="primary" type="button" data-invite-modal-confirm>Quitar acceso</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-invite-modal-cancel]').addEventListener('click', closeModal);
    overlay.querySelector('[data-invite-modal-confirm]').addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = 'Quitando…';
      await unlink(clientId);
      closeModal();
    });
    overlay.querySelector('[data-invite-modal-cancel]').focus();
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      let copied = false;
      try {
        copied = document.execCommand('copy');
      } catch (ignored) {
        copied = false;
      }
      area.remove();
      return copied;
    }
  }

  document.addEventListener('click', async (event) => {
    const button = event.target.closest?.('[data-invite-client]');
    if (!button || button.disabled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const clientId = button.getAttribute('data-invite-client');
    const name = button.getAttribute('data-invite-name') || '';
    const phone = button.getAttribute('data-invite-phone') || '';
    const fresh = ctx.fresh.get(clientId);

    if (button.hasAttribute('data-invite-create')) {
      createInvite(clientId, name);
    } else if (button.hasAttribute('data-invite-revoke')) {
      revokeInvite(clientId, button.getAttribute('data-invite-revoke'));
    } else if (button.hasAttribute('data-invite-unlink')) {
      confirmUnlink(clientId, name);
    } else if (button.hasAttribute('data-invite-selflog')) {
      // Prender pide confirmación; apagar se aplica directo.
      if (ctx.links.get(clientId)?.canSelfLog === true) {
        setSelfLog(clientId, false);
      } else {
        confirmSelfLog(clientId, name);
      }
    } else if (button.hasAttribute('data-invite-reload')) {
      ctx.loadError = '';
      notifyChanged();
      load();
    } else if (button.hasAttribute('data-invite-copy') && fresh) {
      const copied = await copyText(inviteMessage(fresh, name));
      setNotice(clientId, copied ? 'Mensaje copiado. Pégalo en el chat del alumno.' : 'No se pudo copiar. Usa "Enviar por WhatsApp".', copied ? 'ok' : 'warn');
      notifyChanged();
    } else if (button.hasAttribute('data-invite-whatsapp') && fresh) {
      const text = encodeURIComponent(inviteMessage(fresh, name));
      // Sin teléfono, WhatsApp deja elegir el chat.
      window.open(phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
      setNotice(clientId, phone ? 'WhatsApp abierto con el mensaje.' : 'WhatsApp abierto: el alumno no tiene teléfono, elige su chat.', 'ok');
      notifyChanged();
    }
  }, true);

  window.addEventListener('valhalla:auth-changed', (event) => {
    const detail = event.detail || {};
    if (detail.role !== 'coach' || !detail.user?.id) {
      return;
    }
    if (ctx.ownerId !== detail.user.id) {
      ctx.fresh = new Map();
      ctx.notices = new Map();
    }
    ctx.ownerId = detail.user.id;
    ctx.online = !detail.offline;
    ctx.loaded = false;
    ctx.loadError = '';
    ctx.links = new Map();
    ctx.invites = [];
    if (ctx.online) {
      load();
    } else {
      notifyChanged();
    }
  });

  window.addEventListener('valhalla:auth-locked', () => {
    Object.assign(ctx, {
      ownerId: '', online: false, loaded: false, loadError: '', loadedAt: 0, missing: false,
      links: new Map(), invites: [], fresh: new Map(), notices: new Map(), busyClientId: ''
    });
    closeModal();
  });

  window.VALHALLA.invites = { renderSection, refresh, selfLogLabel };
})();
