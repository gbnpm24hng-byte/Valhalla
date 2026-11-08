const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;
require('../assets/js/invite-core.js');

const core = globalThis.VALHALLA.inviteCore;
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('B4: el alfabeto no tiene letras confusas y tiene 31 caracteres', () => {
  assert.equal(core.ALPHABET.length, 31);
  ['0', 'O', '1', 'I', 'L'].forEach((char) => assert.ok(!core.ALPHABET.includes(char), char));
  assert.equal(new Set(core.ALPHABET).size, 31);
});

test('B4: código escrito de cualquier forma -> misma forma; los confusos no valen', () => {
  assert.equal(core.normalizeCode(' vk7q-4m2p '), 'VK7Q4M2P');
  assert.equal(core.formatCode('vk7q 4m2p'), 'VK7Q-4M2P');
  assert.equal(core.isValidCode('VK7Q-4M2P'), true);
  assert.equal(core.isValidCode('vk7q4m2p'), true);
  assert.equal(core.isValidCode('VK7Q-4M2'), false, 'corto');
  assert.equal(core.isValidCode('VK7Q-4M2PX'), false, 'largo');
  assert.equal(core.isValidCode('VK7Q-4M20'), false, 'con cero');
  assert.equal(core.isValidCode('VKIQ-4M2P'), false, 'con I');
  assert.equal(core.isValidCode(''), false);
  assert.equal(core.formatCode('abc'), 'abc', 'lo que no tiene la forma queda como se escribió');
});

test('B4: link con ?invitacion= (sin otros parámetros) y lectura desde la dirección', () => {
  const link = core.buildInviteLink('https://ejemplo.invalid/app/index.html?x=1#hoy', 'vk7q4m2p');
  assert.equal(link, 'https://ejemplo.invalid/app/index.html?invitacion=VK7Q-4M2P');
  assert.equal(core.readCodeFromSearch('?invitacion=vk7q-4m2p'), 'VK7Q-4M2P');
  assert.equal(core.readCodeFromSearch('?onboarding=1'), '');
  assert.equal(core.readCodeFromSearch(''), '');
  assert.equal(core.stripCodeFromUrl('https://ejemplo.invalid/app/?invitacion=VK7Q-4M2P&y=2'), 'https://ejemplo.invalid/app/?y=2');
  assert.equal(core.stripCodeFromUrl('https://ejemplo.invalid/app/?invitacion=VK7Q-4M2P'), 'https://ejemplo.invalid/app/');
});

test('B4: mensaje de WhatsApp con nombre, link, código y vencimiento', () => {
  const message = core.buildInviteMessage({
    name: 'Nombre Falso Apellido',
    link: 'https://ejemplo.invalid/?invitacion=VK7Q-4M2P',
    code: 'VK7Q4M2P',
    expiresAt: new Date(2026, 10, 15, 12).toISOString()
  });
  assert.equal(message, [
    'Hola Nombre 👋 Te invito a Valhalla, la app de Vikingos Radical, para ver tu rutina.',
    '1. Abre: https://ejemplo.invalid/?invitacion=VK7Q-4M2P',
    '2. Crea tu cuenta con tu correo y una contraseña.',
    '3. Tu código: VK7Q-4M2P (sirve una vez, vence el 15 nov).'
  ].join('\n'));
  assert.ok(core.buildInviteMessage({ name: '', link: 'x', code: 'VK7Q4M2P', expiresAt: '' }).startsWith('Hola 👋'));
  assert.equal(core.formatShortDate('basura'), '');
});

test('B4: invitación pendiente = sin usar, sin anular, sin vencer; la más nueva', () => {
  const now = '2026-11-08T12:00:00.000Z';
  const invites = [
    { id: 'a', client_id: 'c1', expires_at: '2026-11-15T12:00:00.000Z', used_at: null, revoked_at: null, created_at: '2026-11-08T10:00:00.000Z' },
    { id: 'b', client_id: 'c1', expires_at: '2026-11-15T13:00:00.000Z', used_at: null, revoked_at: null, created_at: '2026-11-08T11:00:00.000Z' },
    { id: 'c', client_id: 'c2', expires_at: '2026-11-01T12:00:00.000Z', used_at: null, revoked_at: null, created_at: '2026-10-25T12:00:00.000Z' },
    { id: 'd', client_id: 'c3', expires_at: '2026-11-15T12:00:00.000Z', used_at: null, revoked_at: '2026-11-08T11:00:00.000Z', created_at: '2026-11-08T10:00:00.000Z' }
  ];
  assert.equal(core.pickPending(invites, 'c1', now).id, 'b');
  assert.equal(core.pickPending(invites, 'c2', now), null, 'vencida');
  assert.equal(core.pickPending(invites, 'c3', now), null, 'anulada');
  assert.equal(core.pickPending([], 'c1', now), null);
});

test('B4: estado de "Cuenta de la app"', () => {
  assert.equal(core.accountState({ online: false }), 'offline');
  assert.equal(core.accountState({ online: true, loaded: false }), 'loading');
  assert.equal(core.accountState({ online: true, loaded: false, loadError: 'sin conexión' }), 'error');
  assert.equal(core.accountState({ online: true, loaded: true, linked: true, pending: true }), 'linked', 'con cuenta gana');
  assert.equal(core.accountState({ online: true, loaded: true, linked: false, pending: true }), 'pending');
  assert.equal(core.accountState({ online: true, loaded: true, linked: false, pending: false }), 'none');
});

test('B4: sin el SQL nuevo se reconoce "falta activar" (tabla o función que no existe)', () => {
  assert.equal(core.isMissingCloudError({ code: 'PGRST205', message: "Could not find the table 'public.student_invites' in the schema cache" }), true);
  assert.equal(core.isMissingCloudError({ code: 'PGRST202', message: 'Could not find the function public.create_student_invite' }), true);
  assert.equal(core.isMissingCloudError({ code: '42P01' }), true);
  assert.equal(core.isMissingCloudError({ message: 'Failed to fetch' }, 0), false);
  assert.equal(core.isMissingCloudError({ code: '42501', message: 'permission denied' }, 403), false);
  assert.equal(core.MISSING_CLOUD, 'Falta activar las invitaciones en la nube.');
});

test('B4: mensajes de error claros; "invalid" no dice si el código existe', () => {
  ['invalid', 'used', 'revoked', 'expired', 'student_has_account', 'too_many', 'already_linked', 'is_coach', 'missing'].forEach((code) => {
    const text = core.describeRedeemError(code);
    assert.ok(text && !/error|null|undefined/i.test(text), `${code}: ${text}`);
  });
  assert.equal(core.describeRedeemError('student_has_account'), 'Este alumno ya tiene cuenta. Pídele a tu coach una invitación nueva.');
  assert.ok(!/existe/i.test(core.describeRedeemError('invalid')));
  assert.ok(core.describeRedeemError('algo-raro').length > 0);
  assert.ok(core.describeCreateError('already_linked').includes('quítale el acceso'));
});

test('B4: revisión del formulario "Crear cuenta con código"', () => {
  const ok = { code: 'VK7Q-4M2P', email: 'alumno@ejemplo.invalid', password: 'clave-falsa-1', password2: 'clave-falsa-1' };
  assert.equal(core.validateSignup(ok), '');
  assert.match(core.validateSignup({ ...ok, code: 'VK7Q' }), /código/);
  assert.match(core.validateSignup({ ...ok, email: 'sin-arroba' }), /correo/);
  assert.match(core.validateSignup({ ...ok, password: 'corta', password2: 'corta' }), /8 caracteres/);
  assert.match(core.validateSignup({ ...ok, password2: 'otra-clave-1' }), /no coinciden/);
});

test('B4: el SQL nuevo solo agrega (no cambia tablas, políticas ni funciones existentes, no borra usuarios)', () => {
  const sql = read('supabase/b4_invitaciones.sql').replace(/--.*$/gm, '');
  const existingTables = ['profiles', 'coach_state', 'client_links', 'student_programs', 'student_progress', 'student_sets'];
  existingTables.forEach((table) => {
    assert.ok(!new RegExp(`alter\\s+table\\s+(if\\s+exists\\s+)?public\\.${table}\\b`, 'i').test(sql), `alter table ${table}`);
    assert.ok(!new RegExp(`(drop|create)\\s+policy[^;]*on\\s+public\\.${table}\\b`, 'i').test(sql), `política en ${table}`);
    assert.ok(!new RegExp(`(revoke|grant)[^;]*on\\s+(table\\s+)?public\\.${table}\\b`, 'i').test(sql), `permisos de ${table}`);
    assert.ok(!new RegExp(`create\\s+(or\\s+replace\\s+)?trigger[^;]*on\\s+public\\.${table}\\b`, 'i').test(sql), `trigger en ${table}`);
  });
  ['is_coach', 'my_client_id', 'is_my_client', 'my_can_self_log', 'handle_new_user', 'set_updated_at', 'b3_'].forEach((name) => {
    assert.ok(!new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}`, 'i').test(sql), `reemplaza ${name}`);
  });
  assert.ok(!/delete\s+from\s+auth\.users/i.test(sql), 'borra usuarios');
  assert.ok(!/delete\s+from\s+public\.(client_links|student_sets|profiles)/i.test(sql), 'borra filas de tablas existentes');
  assert.ok(!/drop\s+(table|function)/i.test(sql), 'borra algo');
  // La única escritura en tablas existentes: dentro de redeem_student_invite.
  const redeem = sql.slice(sql.indexOf('function public.redeem_student_invite'));
  const outside = sql.slice(0, sql.indexOf('function public.redeem_student_invite'));
  assert.ok(!/(insert\s+into|update)\s+public\.(client_links|profiles)\b/i.test(outside), 'escribe client_links o profiles fuera del canje');
  assert.ok(/update\s+public\.profiles\s+set\s+full_name/i.test(redeem));
  assert.ok(/can_self_log\s*=\s*false/i.test(redeem) && /values\s*\(v_uid,\s*v_invite\.owner_id,\s*v_invite\.client_id,\s*false,\s*true\)/i.test(redeem));
});

test('B4: los archivos de invitaciones no llevan claves ni service_role', () => {
  ['supabase/b4_invitaciones.sql', 'supabase/b4_invitaciones_deshacer.sql', 'supabase/b4_prueba_invitaciones.sql',
    'assets/js/invite-core.js', 'assets/js/invites.js'].forEach((file) => {
    const text = read(file);
    assert.ok(!/sb_secret|service_role|eyJ[A-Za-z0-9_-]{20,}/.test(text), file);
  });
  // La prueba de permisos solo usa correos falsos.
  const emails = read('supabase/b4_prueba_invitaciones.sql').match(/[\w.+-]+@[\w.-]+/g) || [];
  assert.ok(emails.length > 0 && emails.every((email) => email.endsWith('@example.invalid')), emails.join(', '));
});
