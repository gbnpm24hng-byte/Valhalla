(function () {
  // B4 (v0.9.49): invitaciones de alumnos. Solo lógica (sin pantalla ni nube): forma del
  // código, link, mensaje de WhatsApp, fechas y textos de error en español.
  // El código lo genera y guarda (solo su hash) la nube: supabase/b4_invitaciones.sql.
  // Nada de esto entra al estado de la app ni sube con coach_state.
  const root = typeof window !== 'undefined' ? window : globalThis;
  root.VALHALLA = root.VALHALLA || {};

  // Sin 0/O ni 1/I/L (igual que la función de la nube).
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$/;
  const URL_PARAM = 'invitacion';
  const MIN_PASSWORD = 8;
  const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  // "vk7q 4m2p" -> "VK7Q4M2P" (solo letras y números, en mayúscula).
  function normalizeCode(value) {
    return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function isValidCode(value) {
    return CODE_RE.test(normalizeCode(value));
  }

  // "VK7Q4M2P" -> "VK7Q-4M2P". Lo que no tiene la forma se devuelve como se escribió.
  function formatCode(value) {
    const code = normalizeCode(value);
    return CODE_RE.test(code) ? `${code.slice(0, 4)}-${code.slice(4)}` : String(value ?? '').trim();
  }

  // Código que viene en el link (?invitacion=VK7Q-4M2P), ya con guion; '' si no hay.
  function readCodeFromSearch(search) {
    try {
      const raw = new URLSearchParams(String(search || '')).get(URL_PARAM);
      return raw ? formatCode(raw).slice(0, 20) : '';
    } catch (error) {
      return '';
    }
  }

  // Quita ?invitacion= de una dirección (después de canjear, para que recargar no lo repita).
  function stripCodeFromUrl(href) {
    try {
      const url = new URL(String(href));
      url.searchParams.delete(URL_PARAM);
      return url.toString();
    } catch (error) {
      return String(href || '');
    }
  }

  // Link de la app (sin otros parámetros ni #) con el código.
  function buildInviteLink(appUrl, code) {
    const url = new URL(String(appUrl));
    url.search = '';
    url.hash = '';
    url.searchParams.set(URL_PARAM, formatCode(code));
    return url.toString();
  }

  // "15 nov" (fecha local del teléfono).
  function formatShortDate(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  }

  function firstName(name) {
    return String(name || '').trim().split(/\s+/)[0] || '';
  }

  function buildInviteMessage({ name, link, code, expiresAt }) {
    const hello = firstName(name);
    return [
      `Hola${hello ? ` ${hello}` : ''} 👋 Te invito a Valhalla, la app de Vikingos Radical, para ver tu rutina.`,
      `1. Abre: ${link}`,
      '2. Crea tu cuenta con tu correo y una contraseña.',
      `3. Tu código: ${formatCode(code)} (sirve una vez, vence el ${formatShortDate(expiresAt)}).`
    ].join('\n');
  }

  // Invitación pendiente más reciente de un alumno (sin usar, sin anular y sin vencer).
  function pickPending(invites, clientId, nowIso = new Date().toISOString()) {
    const now = new Date(nowIso).getTime();
    return (invites || [])
      .filter((item) => item && item.client_id === clientId && !item.used_at && !item.revoked_at && new Date(item.expires_at).getTime() > now)
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0] || null;
  }

  // Qué muestra "Cuenta de la app" en la ficha.
  //   offline | loading | error | linked | pending | none
  function accountState({ online, loaded, loadError, linked, pending }) {
    if (!online) return 'offline';
    if (!loaded) return loadError ? 'error' : 'loading';
    if (linked) return 'linked';
    if (pending) return 'pending';
    return 'none';
  }

  // ¿La nube aún no tiene la tabla o la función (falta correr b4_invitaciones.sql)?
  function isMissingCloudError(error, status) {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    return ['PGRST202', 'PGRST205', '42P01', '42883'].includes(code)
      || Number(status) === 404
      || /could not find the (function|table)|does not exist|schema cache/i.test(message);
  }

  const MISSING_CLOUD = 'Falta activar las invitaciones en la nube.';

  const CREATE_ERRORS = {
    not_coach: 'Tu cuenta no tiene permiso para invitar.',
    bad_client: 'No se encontró la ficha de este alumno.',
    already_linked: 'Este alumno ya tiene cuenta. Para invitarlo de nuevo, primero quítale el acceso.'
  };

  function describeCreateError(code) {
    return CREATE_ERRORS[code] || 'No se pudo crear la invitación. Intenta de nuevo.';
  }

  // Ningún mensaje dice si un código existe: un código mal escrito o inventado da "invalid".
  const REDEEM_ERRORS = {
    not_authenticated: 'Tu sesión se cerró. Vuelve a entrar e intenta de nuevo.',
    no_profile: 'Tu cuenta no tiene perfil. Pídele a tu coach que lo revise.',
    is_coach: 'Esta es una cuenta de entrenador: los códigos son para alumnos.',
    inactive: 'Tu cuenta está desactivada. Habla con tu coach.',
    already_linked: 'Tu cuenta ya está vinculada a tu ficha.',
    too_many: 'Demasiados intentos. Espera una hora e intenta de nuevo.',
    invalid: 'El código no es válido. Revísalo o pídele uno nuevo a tu coach.',
    used: 'Este código ya se usó. Pídele a tu coach una invitación nueva.',
    revoked: 'Este código ya no sirve: tu coach lo anuló o mandó uno más nuevo. Usa el último que te llegó.',
    expired: 'Este código venció. Pídele a tu coach una invitación nueva.',
    student_has_account: 'Este alumno ya tiene cuenta. Pídele a tu coach una invitación nueva.',
    conflict: 'No se pudo completar en este momento. Intenta de nuevo.',
    missing: 'Las invitaciones aún no están activas. Avísale a tu coach.',
    offline: 'No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.'
  };

  function describeRedeemError(code) {
    return REDEEM_ERRORS[code] || 'No se pudo usar el código. Intenta de nuevo.';
  }

  // Revisa el formulario "Crear cuenta con código" antes de tocar la nube. '' = todo bien.
  function validateSignup({ code, email, password, password2 }) {
    if (!isValidCode(code)) return 'Escribe el código de 8 caracteres que te mandó tu coach.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())) return 'Escribe un correo válido.';
    if (String(password || '').length < MIN_PASSWORD) return `La contraseña debe tener ${MIN_PASSWORD} caracteres o más.`;
    if (password !== password2) return 'Las contraseñas no coinciden.';
    return '';
  }

  root.VALHALLA.inviteCore = {
    ALPHABET,
    URL_PARAM,
    MIN_PASSWORD,
    MISSING_CLOUD,
    normalizeCode,
    isValidCode,
    formatCode,
    readCodeFromSearch,
    stripCodeFromUrl,
    buildInviteLink,
    formatShortDate,
    firstName,
    buildInviteMessage,
    pickPending,
    accountState,
    isMissingCloudError,
    describeCreateError,
    describeRedeemError,
    validateSignup
  };
})();
