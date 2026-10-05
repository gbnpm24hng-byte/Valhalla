const test = require('node:test');
const assert = require('node:assert/strict');

// localStorage falso en memoria: nunca toca datos reales.
const storage = new Map();
global.localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear()
};
global.window = global;
require('../assets/js/data.js');
require('../assets/js/sync-core.js');

const dataApi = globalThis.VALHALLA.data;
const sync = globalThis.VALHALLA.syncCore;

function fakeState() {
  storage.clear();
  const state = dataApi.createInitialState();
  state.clients = [
    dataApi.normalizeClient({ id: 'falso-1', full_name: 'Cliente Falso Uno', monthly_value: 45000, payment_status: 'paid', sessions_total: 8, training_attendance: [{ sessionKey: 's1', date: '2026-10-01', status: 'attended' }, { sessionKey: 's2', date: '2026-10-03', status: 'no_show' }] }),
    dataApi.normalizeClient({ id: 'falso-2', full_name: 'Cliente Falso Dos', sessions_total: 4 })
  ];
  state.trainingsV08.programs = [dataApi.normalizeTrainingProgram({ id: 'prog-1', name: 'Programa falso', days: [{ id: 'd1', name: 'Día 1', exercises: [{ id: 'e1', exerciseName: 'Sentadilla', sets: 3 }] }], updatedAt: '2026-10-02T10:00:00.000Z' })];
  state.trainingsV08.assignments = [dataApi.normalizeTrainingProgramAssignment({ id: 'asig-1', programId: 'prog-1', clientId: 'falso-1', weeklyDays: [1, 3] }, { trainingsV08: { programs: state.trainingsV08.programs } })];
  state.trainingsV08.sessions = [{ id: 'ses-1', clientId: 'falso-1', date: '2026-10-01', title: 'Sesión', status: 'completed', exercises: [] }];
  state.settings.coach_whatsapp_number = '56900000000';
  state.settings.magic_budget = 99999;
  state.profile.initial_cash = 123456;
  state.movements = [{ id: 'mov-1', amount: 5000, description: 'Movimiento falso' }];
  state.debts = [{ id: 'debt-1', name: 'Deuda falsa', totalAmount: 1000 }];
  dataApi.saveState(state);
  return dataApi.loadState();
}

test('solo suben las claves permitidas; finanzas, perfil y presupuestos se quedan en el equipo', () => {
  const payload = sync.buildCloudPayload(fakeState());
  assert.deepEqual(Object.keys(payload).sort(), [...sync.SYNCED_KEYS].sort());
  ['accounts', 'categories', 'movements', 'recurring', 'recurringTransactions', 'financialGoals', 'debts', 'profile'].forEach((key) => {
    assert.equal(key in payload, false, `${key} no debe subir`);
  });
  assert.deepEqual(payload.settings, { coach_whatsapp_number: '56900000000' });
  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /initial_cash|magic_budget|ant_budget|savings_rate|minimum_reserve|savings_goal/);
  assert.doesNotMatch(serialized, /Movimiento falso|Deuda falsa/);
});

test('una clave desconocida del estado no sube (lista de lo permitido)', () => {
  const state = fakeState();
  state.nuevaClaveFutura = { secreto: 'x' };
  assert.equal('nuevaClaveFutura' in sync.buildCloudPayload(state), false);
});

// Token de sesión falso armado al correr la prueba (no queda escrito en el repositorio).
function fakeSessionToken() {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return [part({ alg: 'HS256', typ: 'JWT' }), part({ sub: 'usuario-falso', role: 'authenticated' }), 'firma-falsa'].join('.');
}

test('la subida nunca incluye la sesión de Supabase ni la marca valhalla_auth_access', () => {
  const token = fakeSessionToken();
  localStorage.setItem('sb-kxouspyrgyaweuhyxtrp-auth-token', JSON.stringify({ access_token: token }));
  localStorage.setItem('valhalla_auth_access', JSON.stringify({ userId: 'u', kind: 'coach' }));
  const serialized = JSON.stringify(sync.buildCloudPayload(dataApi.loadState()));
  assert.equal(serialized.includes('auth-token'), false);
  assert.equal(serialized.includes('valhalla_auth_access'), false);
  assert.equal(serialized.includes(token.split('.')[0]), false);

  const poisoned = fakeState();
  poisoned.clients[0].observations = token;
  assert.throws(() => sync.buildCloudPayload(poisoned), /datos de sesión/);
});

test('la comparación canónica ignora el orden de claves y detecta cambios de contenido y conteos', () => {
  const payload = sync.buildCloudPayload(fakeState());
  const reordered = JSON.parse(JSON.stringify(payload, Object.keys(payload).reverse()));
  const shuffled = Object.fromEntries(Object.entries(payload).reverse());
  assert.equal(sync.compare(payload, shuffled).identical, true);
  assert.equal(sync.canonicalize({ b: 1, a: [{ d: 2, c: 3 }] }), sync.canonicalize({ a: [{ c: 3, d: 2 }], b: 1 }));
  assert.ok(reordered);

  const changedContent = JSON.parse(JSON.stringify(payload));
  changedContent.clients[0].full_name = 'Otro nombre';
  const result = sync.compare(payload, changedContent);
  assert.equal(result.identical, false);
  assert.equal(result.countsMatch, true);

  const missingClient = JSON.parse(JSON.stringify(payload));
  missingClient.clients.pop();
  delete missingClient.foodBlocks;
  const result2 = sync.compare(payload, missingClient);
  assert.equal(result2.identical, false);
  assert.deepEqual(result2.countDifferences, ['clientes']);
  assert.deepEqual(result2.missingInCloud, ['foodBlocks']);
});

test('el resumen cuenta clientes, programas, asignaciones, ejercicios, sesiones y asistencias', () => {
  const summary = sync.summarize(sync.buildCloudPayload(fakeState()));
  assert.equal(summary.clientes, 2);
  assert.equal(summary.programas, 1);
  assert.equal(summary.asignaciones, 1);
  assert.ok(summary.ejercicios >= 1);
  assert.equal(summary.sesiones, 1);
  assert.equal(summary.asistencias, 2);
});

test('decisión de flujo al iniciar sesión', () => {
  const payload = sync.buildCloudPayload(fakeState());
  const row = { owner_id: 'coach-1', version: 3, data: JSON.parse(JSON.stringify(payload)), updated_at: '2026-10-04T12:00:00Z' };
  const different = JSON.parse(JSON.stringify(payload));
  different.clients.pop();
  const syncedMeta = { ownerId: 'coach-1', version: 3, cloudHash: sync.fingerprint(row.data) };

  assert.equal(sync.decideSyncAction({ cloudRow: null, localStored: true, localPayload: payload, ownerId: 'coach-1' }), 'offer-upload');
  assert.equal(sync.decideSyncAction({ cloudRow: row, localStored: false, localPayload: payload, ownerId: 'coach-1' }), 'load-cloud');
  assert.equal(sync.decideSyncAction({ cloudRow: row, localStored: true, localPayload: payload, ownerId: 'coach-1' }), 'in-sync');
  assert.equal(sync.decideSyncAction({ cloudRow: row, localStored: true, localPayload: different, ownerId: 'coach-1' }), 'choose');
  // Equipo que sincronizó esta misma versión y luego cambió datos locales: pendiente, no conflicto.
  assert.equal(sync.decideSyncAction({ cloudRow: row, localStored: true, localPayload: different, meta: syncedMeta, ownerId: 'coach-1' }), 'pending-local');
  // La nube cambió desde la última sincronización de este equipo: hay que elegir.
  assert.equal(sync.decideSyncAction({ cloudRow: { ...row, version: 4 }, localStored: true, localPayload: different, meta: syncedMeta, ownerId: 'coach-1' }), 'choose');
  // Marca de otro entrenador en este equipo: hay que elegir.
  assert.equal(sync.decideSyncAction({ cloudRow: row, localStored: true, localPayload: different, meta: { ...syncedMeta, ownerId: 'otro' }, ownerId: 'coach-1' }), 'choose');
});

test('cargar la nube reemplaza solo lo sincronizado (sin combinar) y conserva las finanzas locales', () => {
  const local = fakeState();
  const cloudData = sync.buildCloudPayload(local);
  cloudData.clients = [cloudData.clients[1]];
  cloudData.settings = { coach_whatsapp_number: '56911111111' };

  const result = sync.applyCloudData(local, cloudData);
  assert.deepEqual(result.clients.map((client) => client.id), ['falso-2'], 'reemplaza la lista, no la combina');
  assert.deepEqual(result.movements, local.movements);
  assert.deepEqual(result.debts, local.debts);
  assert.deepEqual(result.profile, local.profile);
  assert.equal(result.settings.magic_budget, 99999);
  assert.equal(result.settings.coach_whatsapp_number, '56911111111');
});

test('ida y vuelta estable: lo que se carga de la nube y se vuelve a leer es idéntico a lo subido', () => {
  const uploaded = sync.buildCloudPayload(fakeState());
  const fromCloud = JSON.parse(JSON.stringify(uploaded)); // así vuelve de jsonb

  storage.clear();
  const emptyDevice = dataApi.loadState();
  dataApi.saveState(sync.applyCloudData(emptyDevice, fromCloud));
  const reloaded = sync.buildCloudPayload(dataApi.loadState());
  assert.equal(sync.compare(reloaded, fromCloud).identical, true, 'normalizar al recargar no debe cambiar los datos');
});
