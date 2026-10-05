const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

global.window = global;
require('../assets/js/config.js');
require('../assets/js/auth.js');

const { describeAuthError, resolveAccess } = globalThis.VALHALLA.auth;

test('los errores de inicio de sesión se muestran en español y sin texto técnico', () => {
  assert.equal(describeAuthError({ code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' }), 'Correo o contraseña incorrectos.');
  assert.equal(describeAuthError({ message: 'Invalid login credentials' }), 'Correo o contraseña incorrectos.');
  assert.match(describeAuthError({ code: 'email_not_confirmed' }), /no está confirmado/);
  assert.match(describeAuthError({ status: 429, message: 'Too many requests' }), /Demasiados intentos/);
  assert.match(describeAuthError({ code: 'refresh_token_not_found' }), /sesión expiró/);
  assert.match(describeAuthError({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }), /No hay conexión/);
  assert.equal(describeAuthError({ code: 'algo_raro', message: 'Internal stack trace xyz' }), 'No se pudo iniciar sesión. Intenta de nuevo.');
});

test('solo red caída, 5xx y 540 cuentan como "Supabase no responde"; un rechazo 4xx nunca', () => {
  const { isUnavailableError } = globalThis.VALHALLA.auth;
  assert.equal(isUnavailableError({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }), true);
  assert.equal(isUnavailableError({ message: 'TypeError: Failed to fetch' }, 0), true);
  assert.equal(isUnavailableError({ status: 503 }), true);
  assert.equal(isUnavailableError({ message: 'x' }, 540), true);
  assert.equal(isUnavailableError({ code: 'invalid_credentials', status: 400 }), false);
  assert.equal(isUnavailableError({ code: 'refresh_token_not_found', status: 400 }), false);
  assert.equal(isUnavailableError({ message: 'JWT expired' }, 401), false);
  assert.equal(isUnavailableError({ status: 429 }), false);
});

test('el acceso depende de profiles.role y profiles.active', () => {
  assert.equal(resolveAccess({ role: 'coach', active: true }).kind, 'coach');
  assert.equal(resolveAccess({ role: 'student', active: true }).kind, 'student');
  assert.equal(resolveAccess({ role: 'coach', active: false }).kind, 'inactive');
  assert.equal(resolveAccess({ role: 'admin', active: true }).kind, 'unknown-role');
  assert.equal(resolveAccess(null).kind, 'no-profile');
});

test('auth.js no escribe en consola la URL ni la clave', () => {
  const source = read('assets/js/auth.js');
  assert.doesNotMatch(source, /console\.(log|info|debug|warn)/);
  assert.doesNotMatch(source, /keyFirst15|keyPreview|slice\(0,\s*15\)/);
});

test('config.js solo contiene valores públicos', () => {
  const source = read('assets/js/config.js');
  assert.match(source, /https:\/\/[a-z0-9]+\.supabase\.co/);
  assert.match(source, /sb_publishable_/);
  assert.doesNotMatch(source, /sb_secret_|service_role/);
});

test('supabase-js está fijado a una versión exacta con integridad SRI', () => {
  const html = read('index.html');
  const tag = html.match(/<script[^>]+supabase-js[^>]*><\/script>/);
  assert.ok(tag, 'falta el script de supabase-js');
  assert.match(tag[0], /supabase-js@\d+\.\d+\.\d+\//, 'la versión debe ser exacta (x.y.z)');
  assert.match(tag[0], /integrity="sha384-[A-Za-z0-9+/=]{64}"/);
  assert.match(tag[0], /crossorigin="anonymous"/);
  const swUrl = read('service-worker.js').match(/SUPABASE_SDK_URL='([^']+)'/);
  assert.ok(swUrl && tag[0].includes(swUrl[1]), 'el service worker debe cachear la misma URL fijada');
});

test('la capa de tablas antiguas queda desactivada y ya no usa el id del entrenador como auth_user_id', () => {
  const source = read('assets/js/cloud-data.js');
  assert.match(source, /const LEGACY_TABLES_ENABLED = false;/);
  assert.doesNotMatch(source, /auth_user_id:\s*ownerContext\.authUserId/);

  global.VALHALLA.supabase = { isCloudEnabled: () => true };
  require('../assets/js/cloud-data.js');
  assert.equal(global.VALHALLA.cloudData.isAvailable(), false);
});

test('la pantalla de acceso se carga antes que la app y no ofrece registro', () => {
  const html = read('index.html');
  assert.ok(html.indexOf('auth-gate.js') > html.indexOf('onboarding.js'), 'auth-gate.js debe ir después de onboarding.js');
  assert.ok(html.indexOf('auth-gate.js') < html.indexOf('app.js'), 'auth-gate.js debe ir antes de app.js');
  const gate = read('assets/js/auth-gate.js');
  assert.doesNotMatch(gate, /signUp|Crear cuenta|Regístrate|registrarse/i);
  assert.doesNotMatch(gate, /removeItem\(['"]valhalla_v0/);
});
