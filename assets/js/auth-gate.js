(function () {
  // Pantalla de acceso. Si la nube está configurada, la app solo se muestra a una
  // cuenta con rol coach. Los datos de este dispositivo (localStorage) no se suben
  // ni se borran aquí: la app sigue usándolos igual que antes.
  //
  // Regla ante fallas:
  // - "Supabase rechazó" (contraseña incorrecta, sesión inválida, usuario inactivo):
  //   siempre al login. Nunca abre la app.
  // - "Supabase no responde" (sin red, tiempo agotado, 5xx o 540) y en este equipo ya
  //   hubo una sesión de entrenador: abre la app con aviso, solo con datos locales.
  // - "Supabase no responde" y nunca hubo sesión de entrenador aquí: la app no se abre;
  //   solo se ofrece descargar el respaldo local, con confirmación.
  window.VALHALLA = window.VALHALLA || {};

  const supabaseApi = window.VALHALLA.supabase;
  const authApi = window.VALHALLA.auth;
  const dataApi = window.VALHALLA.data;
  const cloudConfigured = Boolean(supabaseApi && typeof supabaseApi.isCloudEnabled === 'function' && supabaseApi.isCloudEnabled());
  const isPublicOnboarding = Boolean(window.VALHALLA.onboarding?.active);

  if (!cloudConfigured || isPublicOnboarding || !authApi) {
    window.VALHALLA.authGate = { required: false, getUser: () => null, signOut: async () => ({ ok: true }) };
    return;
  }

  // Marca de que en este equipo hubo una sesión de entrenador confirmada por Supabase.
  // Solo permite seguir con los datos locales cuando Supabase no responde; no da
  // acceso a nada en la nube. Se borra al cerrar sesión o si Supabase rechaza la sesión.
  const ACCESS_CACHE_KEY = 'valhalla_auth_access';
  // Sin red, el SDK reintenta renovar la sesión durante varios segundos. Pasado este
  // límite se considera "tiempo agotado" (Supabase no responde).
  const VERIFY_TIMEOUT_MS = 6000;

  const appEl = document.getElementById('app');
  const gateEl = document.createElement('main');
  gateEl.id = 'authGate';
  gateEl.className = 'auth-gate';
  gateEl.setAttribute('aria-live', 'polite');
  document.body.insertBefore(gateEl, appEl || document.body.firstChild);
  appEl?.classList.add('hidden');

  let currentUser = null;
  let signingOut = false;
  let verifySequence = 0;
  let shownBecauseOutage = false;

  function readAccessCache() {
    try {
      const parsed = JSON.parse(localStorage.getItem(ACCESS_CACHE_KEY) || 'null');
      return parsed && parsed.kind === 'coach' && parsed.userId ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function writeAccessCache(user) {
    try {
      localStorage.setItem(ACCESS_CACHE_KEY, JSON.stringify({ userId: user.id, email: user.email || '', kind: 'coach' }));
    } catch (error) {
      // Sin almacenamiento disponible: simplemente no habrá acceso sin conexión.
    }
  }

  function clearAccessCache() {
    try {
      localStorage.removeItem(ACCESS_CACHE_KEY);
    } catch (error) {
      // Nada que limpiar.
    }
  }

  function hasLocalData() {
    try {
      const keys = [dataApi?.STORAGE_KEY, ...(dataApi?.LEGACY_STORAGE_KEYS || [])].filter(Boolean);
      return keys.some((key) => Boolean(localStorage.getItem(key)));
    } catch (error) {
      return false;
    }
  }

  function withTimeout(promise, fallback) {
    return Promise.race([
      promise,
      new Promise((resolve) => setTimeout(() => resolve(fallback), VERIFY_TIMEOUT_MS))
    ]);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function brandMarkup() {
    return `
      <div class="auth-brand">
        <div class="brand-mark auth-brand-mark">
          <img class="brand-logo" src="./assets/images/logo-vikingos.png" alt="Vikingos Radical" onerror="this.style.display='none'; this.parentElement.classList.add('brand-mark--fallback');">
          <span class="brand-fallback">VR</span>
        </div>
        <h1 class="auth-title">VALHALLA</h1>
        <p class="auth-subtitle">Vikingos Radical</p>
      </div>`;
  }

  function removeHeaderSession() {
    document.getElementById('authHeaderLogout')?.remove();
    document.getElementById('authOfflineBanner')?.remove();
  }

  function showGate(innerHtml) {
    appEl?.classList.add('hidden');
    document.body.classList.add('auth-locked');
    removeHeaderSession();
    window.dispatchEvent(new CustomEvent('valhalla:auth-locked'));
    gateEl.innerHTML = `<section class="auth-card card">${brandMarkup()}${innerHtml}</section>`;
    gateEl.classList.remove('hidden');
  }

  function setMessage(text, tone) {
    const messageEl = gateEl.querySelector('#authMessage');
    if (!messageEl) {
      return;
    }
    messageEl.textContent = text || '';
    messageEl.classList.toggle('hidden', !text);
    messageEl.classList.toggle('auth-message--bad', tone === 'bad');
  }

  function renderChecking() {
    showGate('<p class="auth-status">Verificando sesión…</p>');
  }

  // ---------------------------------------------------------------------------
  // Respaldo local cuando Supabase no responde
  // ---------------------------------------------------------------------------

  function setExportVisible(visible) {
    const block = gateEl.querySelector('#authOutageExport');
    if (block) {
      block.classList.toggle('hidden', !(visible && hasLocalData()));
    }
  }

  // Muestra el botón de respaldo solo si Supabase no responde en este momento.
  async function refreshExportAvailability(form) {
    const health = await authApi.checkServiceHealth();
    if (gateEl.querySelector('#authLoginForm') === form) {
      setExportVisible(!health.reachable);
    }
  }

  async function exportLocalBackup() {
    const health = await authApi.checkServiceHealth();
    if (health.reachable) {
      setExportVisible(false);
      setMessage('El servidor ya responde. Inicia sesión para usar la app.', 'neutral');
      return;
    }
    const confirmed = window.confirm(
      'Descargar respaldo de este dispositivo\n\n'
      + 'Se generará un archivo con todos los datos guardados en este equipo (clientes, entrenamientos y finanzas).\n\n'
      + 'Atención: mientras el servidor no responda, cualquier persona con acceso a este dispositivo podría usar este botón.\n\n'
      + 'El archivo se crea aquí mismo y no se envía a ningún lado. ¿Continuar?'
    );
    if (!confirmed) {
      return;
    }
    const blob = new Blob([dataApi.exportState(dataApi.loadState())], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'valhalla.json';
    link.click();
    URL.revokeObjectURL(link.href);
    setMessage('Respaldo descargado en este dispositivo.', 'neutral');
  }

  // ---------------------------------------------------------------------------
  // Pantallas
  // ---------------------------------------------------------------------------

  // outage: true = ya se sabe que Supabase no responde; false = se sabe que responde;
  // undefined = se consulta el health para decidir si ofrecer el respaldo.
  function renderLogin(message, tone = 'bad', { outage } = {}) {
    showGate(`
      <form id="authLoginForm" class="auth-form" novalidate>
        <div>
          <label for="authEmail">Correo</label>
          <input id="authEmail" name="email" type="email" autocomplete="username" inputmode="email" placeholder="correo@ejemplo.com" required>
        </div>
        <div>
          <label for="authPassword">Contraseña</label>
          <input id="authPassword" name="password" type="password" autocomplete="current-password" placeholder="••••••••" required>
        </div>
        <button class="primary" id="authSubmit" type="submit">Entrar</button>
        <p id="authMessage" class="notice auth-message hidden" role="alert"></p>
        <div id="authOutageExport" class="auth-outage hidden">
          <p class="auth-footnote">El servidor no responde. Puedes guardar una copia de los datos de este dispositivo mientras tanto.</p>
          <button class="secondary" type="button" data-auth-export>Descargar respaldo de este dispositivo</button>
        </div>
        <p class="auth-footnote">Las cuentas las crea tu entrenador.</p>
      </form>`);
    setMessage(message, tone);

    const form = gateEl.querySelector('#authLoginForm');
    gateEl.querySelector('[data-auth-export]').addEventListener('click', exportLocalBackup);
    if (outage === true || outage === false) {
      setExportVisible(outage);
    } else {
      refreshExportAvailability(form);
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = form.email.value.trim();
      const password = form.password.value;
      if (!email || !password) {
        setMessage('Escribe tu correo y tu contraseña.', 'bad');
        return;
      }
      const submit = gateEl.querySelector('#authSubmit');
      submit.disabled = true;
      submit.textContent = 'Entrando…';
      setMessage('', 'neutral');

      const result = await authApi.signIn(email, password);
      form.password.value = '';
      if (!result.ok) {
        // Un inicio de sesión fallido nunca abre la app; a lo sumo ofrece el respaldo.
        submit.disabled = false;
        submit.textContent = 'Entrar';
        setMessage(result.error, 'bad');
        if (result.unavailable) {
          refreshExportAvailability(form);
        }
        return;
      }
      await verify();
    });
    gateEl.querySelector('#authEmail')?.focus();
  }

  function renderNotice(title, message, { retry = false } = {}) {
    showGate(`
      <h2 class="auth-heading">${title}</h2>
      <p class="auth-status">${message}</p>
      ${retry ? '<button class="primary" type="button" data-auth-retry>Reintentar</button>' : ''}
      <button class="secondary" type="button" data-auth-logout>Cerrar sesión</button>
      <p id="authMessage" class="notice auth-message hidden" role="alert"></p>`);
    gateEl.querySelector('[data-auth-logout]').addEventListener('click', handleSignOut);
    gateEl.querySelector('[data-auth-retry]')?.addEventListener('click', () => {
      renderChecking();
      verify();
    });
  }

  function renderStudent(profile) {
    const name = escapeHtml(profile?.full_name || '');
    renderNotice(
      name ? `Hola, ${name}` : 'Hola',
      'La vista de alumno estará disponible próximamente. Tu entrenador te avisará cuando puedas ver tu programa aquí.'
    );
  }

  function renderFatal(message) {
    showGate(`
      <p class="auth-status">${message}</p>
      <button class="primary" type="button" data-auth-reload>Reintentar</button>`);
    gateEl.querySelector('[data-auth-reload]').addEventListener('click', () => window.location.reload());
  }

  function openApp(user, { offline = false } = {}) {
    currentUser = user;
    gateEl.classList.add('hidden');
    gateEl.innerHTML = '';
    removeHeaderSession();

    const actions = document.querySelector('.app-header .header-actions');
    const pill = actions?.querySelector('.user-pill');
    if (pill) {
      pill.textContent = user.email || 'Entrenador';
    }
    if (actions) {
      const logout = document.createElement('button');
      logout.id = 'authHeaderLogout';
      logout.type = 'button';
      logout.className = 'secondary small';
      logout.textContent = 'Cerrar sesión';
      logout.addEventListener('click', handleSignOut);
      actions.appendChild(logout);
    }
    if (offline && appEl) {
      const banner = document.createElement('div');
      banner.id = 'authOfflineBanner';
      banner.className = 'notice auth-offline-banner';
      banner.setAttribute('role', 'status');
      banner.textContent = 'Sin conexión con el servidor: no se pudo verificar tu sesión. Sigues trabajando con los datos de este dispositivo.';
      appEl.insertBefore(banner, appEl.querySelector('.app-header')?.nextSibling || null);
    }
    appEl?.classList.remove('hidden');
    document.body.classList.remove('auth-locked');
    window.dispatchEvent(new CustomEvent('valhalla:auth-changed', { detail: { user, role: 'coach', offline } }));
  }

  // ---------------------------------------------------------------------------
  // Decisiones
  // ---------------------------------------------------------------------------

  // Supabase no responde: entra solo si en este equipo ya hubo sesión de entrenador.
  function enterOutage(userId) {
    shownBecauseOutage = true;
    const cached = readAccessCache();
    if (cached && (!userId || cached.userId === userId)) {
      openApp({ id: cached.userId, email: cached.email }, { offline: true });
      return;
    }
    currentUser = null;
    renderLogin('El servidor no responde. Intenta iniciar sesión más tarde.', 'bad', { outage: true });
  }

  // La sesión desapareció o falló sin que el usuario la cerrara: se consulta primero
  // el health de Auth para distinguir caída de rechazo.
  async function handleLostSession(sequence, { timedOut = false } = {}) {
    let reachable = false;
    if (!timedOut) {
      reachable = (await authApi.checkServiceHealth()).reachable;
      if (sequence !== verifySequence) {
        return;
      }
    }
    if (!reachable) {
      enterOutage();
      return;
    }
    clearAccessCache();
    currentUser = null;
    shownBecauseOutage = false;
    renderLogin('Tu sesión expiró o ya no es válida. Vuelve a ingresar.', 'bad', { outage: false });
  }

  async function signOutRejectedSession() {
    signingOut = true;
    await authApi.signOut();
    signingOut = false;
  }

  async function verify() {
    const sequence = ++verifySequence;
    shownBecauseOutage = false;
    const sessionResult = await withTimeout(authApi.loadSession(), { session: null, user: null, timedOut: true });
    if (sequence !== verifySequence) {
      return;
    }

    if (!sessionResult.user) {
      // Hubo un error, se agotó el tiempo o este equipo tenía sesión de entrenador:
      // decidir con el health si es caída o rechazo.
      if (sessionResult.error || sessionResult.timedOut || readAccessCache()) {
        await handleLostSession(sequence, { timedOut: Boolean(sessionResult.timedOut) });
        return;
      }
      currentUser = null;
      renderLogin('', 'bad');
      return;
    }

    const user = sessionResult.user;
    const profileResult = await withTimeout(authApi.getProfile(user.id), { profile: null, error: 'timeout', unavailable: true });
    if (sequence !== verifySequence) {
      return;
    }

    if (profileResult.error) {
      if (profileResult.unavailable) {
        enterOutage(user.id);
        return;
      }
      if (profileResult.status === 401 || profileResult.status === 403) {
        // Supabase respondió y rechazó el token.
        clearAccessCache();
        currentUser = null;
        await signOutRejectedSession();
        if (sequence === verifySequence) {
          renderLogin('Tu sesión ya no es válida. Vuelve a ingresar.', 'bad', { outage: false });
        }
        return;
      }
      renderNotice('No se pudo verificar tu cuenta', 'Hubo un problema al leer tu perfil. Intenta de nuevo más tarde.', { retry: true });
      return;
    }

    const access = authApi.resolveAccess(profileResult.profile);
    if (access.kind === 'coach') {
      writeAccessCache(user);
      openApp(user);
      return;
    }

    clearAccessCache();
    currentUser = user;
    if (access.kind === 'student') {
      renderStudent(profileResult.profile);
      return;
    }
    renderNotice('Acceso no disponible', escapeHtml(access.message));
  }

  async function handleSignOut() {
    signingOut = true;
    const result = await authApi.signOut();
    if (!result.ok) {
      signingOut = false;
      if (gateEl.classList.contains('hidden')) {
        window.alert(result.error);
      } else {
        setMessage(result.error, 'bad');
      }
      return;
    }
    clearAccessCache();
    currentUser = null;
    verifySequence += 1;
    shownBecauseOutage = false;
    renderLogin('Cerraste sesión. Tus datos siguen guardados en este dispositivo.', 'neutral');
    signingOut = false;
  }

  if (!authApi.isSdkLoaded()) {
    renderFatal('No se pudo cargar el módulo de inicio de sesión. Revisa tu conexión y vuelve a intentarlo.');
    window.VALHALLA.authGate = { required: true, getUser: () => null, signOut: async () => ({ ok: false }) };
    return;
  }

  authApi.onAuthStateChange((event) => {
    // Se lee ahora: cuando corra el setTimeout, handleSignOut ya habrá terminado.
    const userInitiated = signingOut;
    // Supabase recomienda no llamar a otros métodos de auth dentro de este callback.
    setTimeout(() => {
      if (event === 'SIGNED_OUT' && !userInitiated) {
        handleLostSession(++verifySequence);
      } else if (event === 'SIGNED_IN' && !currentUser && !gateEl.querySelector('#authSubmit[disabled]')) {
        // Inicio de sesión hecho en otra pestaña.
        verify();
      }
    }, 0);
  });

  window.addEventListener('online', () => {
    if (shownBecauseOutage) {
      verify();
    }
  });

  window.VALHALLA.authGate = {
    required: true,
    getUser: () => currentUser,
    signOut: handleSignOut
  };

  renderChecking();
  verify();
})();
