const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;
require('../assets/js/data.js');
require('../assets/js/sync-core.js');

const data = globalThis.VALHALLA.data;
const sync = globalThis.VALHALLA.syncCore;
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('la versión del candado es la misma del encabezado y de la caché', () => {
  const version = sync.APP_VERSION;
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.ok(read('index.html').includes(`<span class="badge">v${version}</span>`), 'encabezado de index.html');
  assert.ok(read('index.html').includes(`styles.css?v=${version}`), 'estilos de index.html');
  assert.match(read('service-worker.js'), new RegExp(`const CACHE='valhalla-v${version.replace(/\./g, '\\.')}-`), 'caché del service worker');
});

test('comparar versiones por partes numéricas', () => {
  assert.equal(sync.compareVersions('0.9.16', '0.9.9'), 1);
  assert.equal(sync.compareVersions('0.9.9', '0.9.16'), -1);
  assert.equal(sync.compareVersions('0.10.0', '0.9.99'), 1);
  assert.equal(sync.compareVersions('0.9.16', '0.9.16'), 0);
  assert.equal(sync.compareVersions('1.0', '1.0.0'), 0);
  assert.equal(sync.compareVersions('basura', '0.0.1'), -1);
});

test('candado: bloquea solo si la nube la guardó una versión más nueva', () => {
  assert.equal(sync.isLockedBy('0.9.99', '0.9.16'), true);
  assert.equal(sync.isLockedBy('0.9.16', '0.9.16'), false);
  assert.equal(sync.isLockedBy('0.9.13', '0.9.16'), false);
  assert.equal(sync.isLockedBy('', '0.9.16'), false, 'una nube sin versión (guardada antes del candado) no bloquea');
  assert.equal(sync.isLockedBy(undefined), false);
});

test('la versión viaja con los datos pero no cuenta en comparaciones ni huellas', () => {
  const state = data.importState(JSON.stringify({ clients: [{ id: 'c1', full_name: 'Cliente Falso' }] }));
  const payload = sync.buildCloudPayload(state);
  const stamped = sync.stampPayload(payload, '0.9.16');
  assert.equal(stamped.appVersion, '0.9.16');
  assert.equal(payload.appVersion, undefined, 'no cambia lo que se pasa');
  const { data: cloudData, appVersion } = sync.splitCloudData(stamped);
  assert.equal(appVersion, '0.9.16');
  assert.equal(sync.compare(payload, cloudData).identical, true);
  assert.equal(sync.fingerprint(cloudData), sync.fingerprint(payload));
  assert.deepEqual(sync.splitCloudData(payload), { data: payload, appVersion: '' }, 'nube antigua sin versión');
  assert.equal(sync.applyCloudData(state, cloudData).appVersion, undefined, 'la versión no entra al estado local');
});

// Datos falsos "de una versión futura": campos que esta versión no conoce en cada nivel.
function futureState() {
  const futureSet = { setNumber: 1, setType: 'S', weight: 60, reps: 8, completed: true, rir: 2, loggedBy: 'student', studentSetId: 'fila-1', tempoFuturo: '3-1-1', sensor: { bpm: 140 } };
  return {
    clients: [{ id: 'c1', full_name: 'Cliente Falso', campoFuturoCliente: 'x' }],
    trainingsV08: {
      plans: [],
      claveFuturaV08: [{ id: 'f1' }],
      programs: [{ id: 'p1', name: 'Programa falso', campoFuturoPrograma: 1, days: [{ id: 'd1', name: 'Día A', campoFuturoDia: true, exercises: [{ id: 'e1', exerciseName: 'Press falso', sets: 3, campoFuturoEjercicio: 'y' }] }] }],
      assignments: [{ id: 'a1', programId: 'p1', clientId: 'c1', campoFuturoAsignacion: 'z', days: [{ id: 'd1', name: 'Día A', exercises: [{ id: 'e1', exerciseName: 'Press falso', sets: 3, campoFuturoEjercicio: 'y' }] }] }],
      clientOverrides: [{ id: 'o1', clientId: 'c1', programId: 'p1', dayId: 'd1', kind: 'add', scope: 'forward', date: '2026-10-12', exercise: { id: 'x1', exerciseName: 'Curl falso' }, campoFuturoCambio: 'w' }],
      sessions: [{
        id: 's1', clientId: 'c1', date: '2026-10-12', title: 'Sesión falsa', campoFuturoSesion: { a: 1 },
        exercises: [{ id: 'tx1', exerciseName: 'Press falso', libraryExerciseId: 'lib-press', campoFuturoEjercicioSesion: 5, sets: [futureSet] }]
      }]
    }
  };
}

test('B: se conservan los campos desconocidos en clientes, entrenamientos, sesiones, ejercicios y series', () => {
  const state = data.importState(JSON.stringify(futureState()));
  const v08 = state.trainingsV08;
  assert.equal(state.clients[0].campoFuturoCliente, 'x');
  assert.deepEqual(v08.claveFuturaV08, [{ id: 'f1' }]);
  assert.equal(v08.programs[0].campoFuturoPrograma, 1);
  assert.equal(v08.programs[0].days[0].campoFuturoDia, true);
  assert.equal(v08.programs[0].days[0].exercises[0].campoFuturoEjercicio, 'y');
  assert.equal(v08.assignments[0].campoFuturoAsignacion, 'z');
  assert.equal(v08.assignments[0].days[0].exercises[0].campoFuturoEjercicio, 'y');
  assert.equal(v08.clientOverrides[0].campoFuturoCambio, 'w');
  const session = v08.sessions[0];
  assert.deepEqual(session.campoFuturoSesion, { a: 1 });
  assert.equal(session.exercises[0].campoFuturoEjercicioSesion, 5);
  assert.equal(session.exercises[0].libraryExerciseId, 'lib-press', 'antes se perdía al recargar');
  const set = session.exercises[0].sets[0];
  assert.equal(set.tempoFuturo, '3-1-1');
  assert.deepEqual(set.sensor, { bpm: 140 });
  assert.equal(set.loggedBy, 'student');
  assert.equal(set.studentSetId, 'fila-1');
  // Y suben a la nube tal cual.
  const payload = sync.buildCloudPayload(state);
  assert.equal(payload.trainingsV08.sessions[0].exercises[0].sets[0].tempoFuturo, '3-1-1');
  assert.deepEqual(payload.trainingsV08.claveFuturaV08, [{ id: 'f1' }]);
});

test('B: normalizar dos veces no cambia nada y los alias antiguos no se duplican', () => {
  const once = data.importState(JSON.stringify(futureState()));
  const twice = data.importState(JSON.stringify(once));
  assert.equal(sync.canonicalize(sync.buildCloudPayload(twice)), sync.canonicalize(sync.buildCloudPayload(once)));
  const legacy = data.importState(JSON.stringify({ trainingsV08: { sessions: [{ id: 's9', studentId: 'c1', name: 'Vieja', sessionCompleted: true,
    exercises: [{ id: 't9', exercise: 'Remo falso', weight: 40, reps: 10, techniqueNotes: 'nota', sets: [{ setNumber: 1, set_type: 'A', weight: 20 }] }] }] } }));
  const session = legacy.trainingsV08.sessions[0];
  assert.equal(session.clientId, 'c1');
  assert.equal(session.title, 'Vieja');
  assert.equal(session.status, 'completed');
  for (const alias of ['studentId', 'name', 'sessionCompleted']) assert.equal(alias in session, false, alias);
  const exercise = session.exercises[0];
  assert.equal(exercise.exerciseName, 'Remo falso');
  for (const alias of ['exercise', 'weight', 'reps', 'techniqueNotes']) assert.equal(alias in exercise, false, alias);
  assert.equal(exercise.sets[0].setType, 'A');
  assert.equal('set_type' in exercise.sets[0], false);
});

test('Publicar al alumno: bloqueado si la nube la guardó una versión más nueva', () => {
  // Versión recién leída de la nube, más nueva que esta app.
  assert.deepEqual(sync.publishLock({ fetched: true, cloudAppVersion: '0.9.30' }, '0.9.22'), { status: 'locked', version: '0.9.30' });
  assert.deepEqual(sync.publishLock({ fetched: true, cloudAppVersion: '0.10.0' }, '0.9.22'), { status: 'locked', version: '0.10.0' });
  // Este equipo ya estaba bloqueado por el guardado: no publica y no hace falta leer la nube.
  assert.deepEqual(sync.publishLock({ alreadyLocked: true, lockedVersion: '0.9.25' }, '0.9.22'), { status: 'locked', version: '0.9.25' });
});

test('Publicar al alumno: sin poder leer la versión de la nube no publica y no aplica el candado', () => {
  const unverified = { status: 'unverified' };
  assert.deepEqual(sync.publishLock({ fetched: false }, '0.9.22'), unverified);
  // Aunque haya una última versión vista (vieja, igual o nueva): se ignora.
  assert.deepEqual(sync.publishLock({ fetched: false, lastSeenCloudAppVersion: '0.9.16' }, '0.9.22'), unverified);
  assert.deepEqual(sync.publishLock({ fetched: false, lastSeenCloudAppVersion: '0.9.22' }, '0.9.22'), unverified);
  assert.deepEqual(sync.publishLock({ fetched: false, lastSeenCloudAppVersion: '0.9.30' }, '0.9.22'), unverified);
  assert.deepEqual(sync.publishLock(), unverified);
});

test('Publicar al alumno: permitido con la misma versión, una más vieja o sin versión en la nube', () => {
  const allowed = { status: 'ok' };
  assert.deepEqual(sync.publishLock({ fetched: true, cloudAppVersion: '0.9.22' }, '0.9.22'), allowed);
  assert.deepEqual(sync.publishLock({ fetched: true, cloudAppVersion: '0.9.16' }, '0.9.22'), allowed);
  assert.deepEqual(sync.publishLock({ fetched: true, cloudAppVersion: '' }, '0.9.22'), allowed, 'nube guardada antes del candado');
});

test('Publicar al alumno revisa el candado antes de escribir nada', () => {
  const publish = read('assets/js/publish.js');
  const body = publish.slice(publish.indexOf('async function publish('), publish.indexOf("document.addEventListener('click'"));
  const check = body.indexOf('checkVersionLock');
  assert.ok(check > 0, 'publish() llama a checkVersionLock');
  assert.ok(check < body.indexOf('.upsert('), 'antes del primer upsert');
  assert.ok(check < body.indexOf('ctx.busyClientId = clientId'), 'antes de marcar la publicación en curso');
  assert.match(read('assets/js/cloud-sync.js'), /checkVersionLock,\n/);
  // Solo 'ok' publica: 'locked', 'unverified' o la falta de respuesta cancelan.
  assert.ok(body.includes("if (lock !== 'ok') {"), 'cualquier resultado distinto de ok cancela');
  assert.ok(body.includes('No se pudo comprobar la versión de la nube. Revisa tu conexión e intenta de nuevo.'));
  assert.ok(body.indexOf("if (lock !== 'ok') {") < body.indexOf('.upsert('), 'antes del primer upsert');
  // Tras un error, el botón vuelve a "Reintentar": no se usa event.currentTarget después del await.
  const handler = publish.slice(publish.indexOf('await publish(clientId, assignmentId)'), publish.indexOf('function describeError'));
  assert.ok(!handler.includes('event.currentTarget'), 'event.currentTarget es null después del await');
  assert.match(handler, /button\.textContent = 'Reintentar'/);
});
