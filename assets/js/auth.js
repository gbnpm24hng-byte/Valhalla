(function () {
  const config = window.VALHALLA_CONFIG || {};
  const supabaseUrl = (config.SUPABASE_URL || window.SUPABASE_URL || '').trim();
  const supabaseAnonKey = (config.SUPABASE_ANON_KEY || window.SUPABASE_ANON_KEY || '').trim();

  let clientInstance = null;

  function isConfigured() {
    return Boolean(supabaseUrl && supabaseAnonKey);
  }

  function getClient() {
    if (!isConfigured()) {
      return null;
    }

    if (!clientInstance && window.supabase && typeof window.supabase.createClient === 'function') {
      clientInstance = window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // Solo correo y contraseña: no hay enlaces mágicos ni OAuth que leer desde la URL.
          detectSessionInUrl: false
        }
      });
    }

    return clientInstance;
  }

  function isNetworkError(error) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return true;
    }
    const name = String(error?.name || '');
    const message = String(error?.message || error || '');
    return name === 'AuthRetryableFetchError' || /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(message);
  }

  // "Supabase no responde": sin red, tiempo agotado o error del servidor (5xx, incluido
  // 540 de proyecto pausado). Un 4xx significa que Supabase respondió (por ejemplo,
  // rechazó la contraseña o la sesión) y NO cuenta como caída.
  function isUnavailableError(error, status) {
    const code = Number(status ?? error?.status ?? 0);
    return isNetworkError(error) || code >= 500;
  }

  // Consulta el health de Supabase Auth. reachable = Supabase respondió (cualquier
  // estado < 500). Sin respuesta, tiempo agotado o 5xx/540 = no responde.
  async function checkServiceHealth(timeoutMs = 5000) {
    if (!isConfigured() || typeof fetch !== 'function') {
      return { reachable: false };
    }
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => controller?.abort(), timeoutMs);
    try {
      const response = await fetch(`${supabaseUrl}/auth/v1/health`, {
        method: 'GET',
        headers: { apikey: supabaseAnonKey },
        cache: 'no-store',
        signal: controller?.signal
      });
      return { reachable: response.status < 500, status: response.status };
    } catch (error) {
      return { reachable: false };
    } finally {
      clearTimeout(timer);
    }
  }

  // Traduce errores de Supabase Auth a mensajes claros. Nunca muestra el texto técnico original.
  function describeAuthError(error) {
    if (!error) {
      return '';
    }
    if (isNetworkError(error)) {
      return 'No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.';
    }
    const code = String(error.code || '');
    const status = Number(error.status || 0);
    if (status >= 500) {
      return 'El servidor no responde. Intenta de nuevo más tarde.';
    }
    const message = String(error.message || '');
    if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) {
      return 'Correo o contraseña incorrectos.';
    }
    if (code === 'email_not_confirmed') {
      return 'Tu correo aún no está confirmado. Pide al entrenador que lo confirme.';
    }
    if (code === 'user_banned') {
      return 'Tu cuenta está bloqueada. Contacta al entrenador.';
    }
    if (status === 429 || code === 'over_request_rate_limit') {
      return 'Demasiados intentos. Espera unos minutos e intenta de nuevo.';
    }
    if (['session_expired', 'session_not_found', 'refresh_token_not_found', 'refresh_token_already_used'].includes(code)) {
      return 'Tu sesión expiró. Vuelve a ingresar.';
    }
    // v0.9.49: registro con código (signUp).
    if (code === 'signup_disabled' || /signups? not allowed/i.test(message)) {
      return 'Por ahora no se pueden crear cuentas. Avísale a tu coach.';
    }
    if (code === 'weak_password') {
      return 'La contraseña es muy débil. Usa 8 caracteres o más, mezclando letras y números.';
    }
    if (code === 'email_address_invalid' || code === 'validation_failed') {
      return 'Escribe un correo válido.';
    }
    if (code === 'email_address_not_authorized' || code === 'over_email_send_rate_limit') {
      return 'No se pudo enviar el correo de confirmación. Avísale a tu coach.';
    }
    return 'No se pudo iniciar sesión. Intenta de nuevo.';
  }

  // v0.9.49: crear cuenta de alumno (pantalla "Crear cuenta con código").
  // exists = el correo ya tenía cuenta (Supabase responde con error o, si pide confirmar
  // correos, con un usuario sin identidades); needsConfirm = se creó pero sin sesión.
  async function signUp(email, password) {
    const client = getClient();
    if (!client) {
      return { ok: false, error: 'No se pudo cargar el inicio de sesión. Recarga la página.' };
    }
    try {
      const { data, error } = await client.auth.signUp({ email: String(email || '').trim(), password });
      if (error) {
        const code = String(error.code || '');
        if (code === 'user_already_exists' || code === 'email_exists' || /already (been )?registered/i.test(String(error.message || ''))) {
          return { ok: false, exists: true };
        }
        return { ok: false, error: describeAuthError(error), unavailable: isUnavailableError(error) };
      }
      if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        return { ok: false, exists: true };
      }
      if (!data?.session) {
        return { ok: false, needsConfirm: true };
      }
      return { ok: true, session: data.session, user: data.user };
    } catch (error) {
      return { ok: false, error: describeAuthError(error), unavailable: isUnavailableError(error) };
    }
  }

  // v0.9.49: canjear el código de invitación (función redeem_student_invite de la nube).
  // Devuelve { ok } o { ok: false, code } con code de la nube, 'missing' u 'offline'.
  async function redeemInvite(code) {
    const client = getClient();
    if (!client) {
      return { ok: false, code: 'offline' };
    }
    try {
      const { data, error, status } = await client.rpc('redeem_student_invite', { p_code: String(code || '') });
      if (error) {
        if (window.VALHALLA.inviteCore?.isMissingCloudError(error, status)) {
          return { ok: false, code: 'missing' };
        }
        return { ok: false, code: isUnavailableError(error, status) ? 'offline' : 'conflict' };
      }
      return data?.ok ? { ok: true, displayName: data.display_name || '' } : { ok: false, code: String(data?.error || 'conflict') };
    } catch (error) {
      return { ok: false, code: 'offline' };
    }
  }

  // Decide qué puede ver la cuenta según profiles.role y profiles.active.
  function resolveAccess(profile) {
    if (!profile) {
      return { kind: 'no-profile', message: 'Tu cuenta no tiene un perfil asignado. Contacta al entrenador.' };
    }
    if (profile.active === false) {
      return { kind: 'inactive', message: 'Tu cuenta está desactivada. Contacta al entrenador.' };
    }
    if (profile.role === 'coach') {
      return { kind: 'coach', message: '' };
    }
    if (profile.role === 'student') {
      return { kind: 'student', message: '' };
    }
    return { kind: 'unknown-role', message: 'Tu cuenta no tiene un rol válido. Contacta al entrenador.' };
  }

  async function signIn(email, password) {
    const client = getClient();
    if (!client) {
      return { ok: false, error: 'No se pudo cargar el inicio de sesión. Recarga la página.' };
    }

    try {
      const { data, error } = await client.auth.signInWithPassword({ email: String(email || '').trim(), password });
      if (error) {
        return { ok: false, error: describeAuthError(error), unavailable: isUnavailableError(error) };
      }
      return { ok: true, session: data.session, user: data.user };
    } catch (error) {
      return { ok: false, error: describeAuthError(error), unavailable: isUnavailableError(error) };
    }
  }

  // scope 'local': cierra la sesión solo en este dispositivo.
  async function signOut() {
    const client = getClient();
    if (!client) {
      return { ok: true };
    }

    try {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) {
        return { ok: false, error: isNetworkError(error) ? 'Sin conexión: no se pudo cerrar la sesión. Intenta de nuevo con internet.' : 'No se pudo cerrar la sesión.' };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: isNetworkError(error) ? 'Sin conexión: no se pudo cerrar la sesión. Intenta de nuevo con internet.' : 'No se pudo cerrar la sesión.' };
    }
  }

  async function loadSession() {
    const client = getClient();
    if (!client) {
      return { session: null, user: null };
    }

    try {
      const { data, error } = await client.auth.getSession();
      if (error) {
        return { session: null, user: null, error: describeAuthError(error), status: error.status, unavailable: isUnavailableError(error) };
      }
      return { session: data.session, user: data.session?.user || null };
    } catch (error) {
      return { session: null, user: null, error: describeAuthError(error), status: error.status, unavailable: isUnavailableError(error) };
    }
  }

  async function getProfile(userId) {
    const client = getClient();
    if (!client) {
      return { profile: null };
    }

    let id = userId;
    if (!id) {
      const sessionResult = await loadSession();
      id = sessionResult.user?.id;
      if (!id) {
        return { profile: null, error: sessionResult.error, unavailable: sessionResult.unavailable };
      }
    }

    try {
      const { data, error, status } = await client.from('profiles').select('id, full_name, role, active').eq('id', id).maybeSingle();
      if (error) {
        return { profile: null, error: 'No se pudo leer tu perfil.', status, unavailable: isUnavailableError(error, status) };
      }
      return { profile: data };
    } catch (error) {
      return { profile: null, error: 'No se pudo leer tu perfil.', unavailable: true };
    }
  }

  function onAuthStateChange(callback) {
    const client = getClient();
    if (!client) {
      return () => {};
    }
    const { data } = client.auth.onAuthStateChange((event, session) => callback(event, session));
    return () => data?.subscription?.unsubscribe();
  }

  window.VALHALLA = window.VALHALLA || {};
  window.VALHALLA.auth = {
    isConfigured,
    getClient,
    isSdkLoaded: () => Boolean(getClient()),
    signIn,
    signUp,
    redeemInvite,
    signOut,
    loadSession,
    getProfile,
    onAuthStateChange,
    describeAuthError,
    resolveAccess,
    isNetworkError,
    isUnavailableError,
    checkServiceHealth
  };
})();
