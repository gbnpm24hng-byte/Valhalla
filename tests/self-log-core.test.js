const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../assets/js/publish-core.js');
require('../assets/js/self-log-core.js');
require('../assets/js/student-view.js');

const core = globalThis.VALHALLA.selfLogCore;
const view = globalThis.VALHALLA.studentView.format;

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    keys: () => [...data.keys()]
  };
}

const EXERCISE = { id: 'ej-1', sets: 3, approximations: [{ label: 'A1' }] };
const row = (setType, setNumber, weightText = '', repsText = '', rirText = '') => ({ setType, setNumber, weightText, repsText, rirText });

test('decimales con coma o con punto valen lo mismo', () => {
  assert.equal(core.parseDecimal('72,5'), 72.5);
  assert.equal(core.parseDecimal('72.5'), 72.5);
  assert.equal(core.parseDecimal(' 80 '), 80);
  assert.equal(core.parseDecimal(''), null);
  assert.ok(Number.isNaN(core.parseDecimal('72,5,1')));
  assert.ok(Number.isNaN(core.parseDecimal('-5')));
  assert.ok(Number.isNaN(core.parseDecimal('abc')));
});

test('fechas permitidas: hoy y 3 días atrás, en hora de Chile', () => {
  // 02:00 UTC del 7 de octubre = 23:00 del 6 de octubre en Chile.
  const now = new Date('2026-10-07T02:00:00Z');
  assert.equal(core.chileToday(now), '2026-10-06');
  assert.deepEqual(core.allowedDates(now), ['2026-10-06', '2026-10-05', '2026-10-04', '2026-10-03']);
  assert.equal(core.isDateAllowed('2026-10-03', now), true);
  assert.equal(core.isDateAllowed('2026-10-02', now), false);
  assert.equal(core.isDateAllowed('2026-10-07', now), false);
  // Cambio de mes.
  assert.deepEqual(core.allowedDates(new Date('2026-11-01T15:00:00Z')), ['2026-11-01', '2026-10-31', '2026-10-30', '2026-10-29']);
});

test('RIR obligatorio solo en la última serie efectiva de la rutina', () => {
  const partial = core.validateExercise(EXERCISE, [row('S', 1, '60', '8'), row('S', 2, '60', '8')]);
  assert.deepEqual(partial.errors, []);
  assert.equal(partial.entries.length, 2);
  const missing = core.validateExercise(EXERCISE, [row('S', 1, '60', '8'), row('S', 3, '60', '7')]);
  assert.match(missing.errors.join(' '), /Falta el RIR en la serie 3/);
  const ok = core.validateExercise(EXERCISE, [row('A', 1, '30', '8'), row('S', 3, '60', '7', '1')]);
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.entries.map((e) => `${e.setType}${e.setNumber}`), ['A1', 'S3']);
  assert.equal(ok.entries[0].rir, null);
});

test('valida números, filas vacías y series fuera de la rutina', () => {
  assert.equal(core.validateExercise(EXERCISE, [row('S', 1)]).entries.length, 0);
  assert.equal(core.validateExercise(EXERCISE, [row('S', 1, '72,5', '8')]).entries[0].weight, 72.5);
  assert.match(core.validateExercise(EXERCISE, [row('S', 1, 'mucho', '8')]).errors[0], /peso/);
  assert.match(core.validateExercise(EXERCISE, [row('S', 1, '60', '8,5')]).errors[0], /repeticiones/);
  assert.match(core.validateExercise(EXERCISE, [row('S', 1, '60', '8', '11')]).errors[0], /RIR/);
  assert.match(core.validateExercise(EXERCISE, [row('S', 1, '', '', '2')]).errors[0], /peso o las repeticiones/);
  assert.match(core.validateExercise(EXERCISE, [row('S', 4, '60', '8')]).errors[0], /no está en tu rutina/);
  assert.match(core.validateExercise(EXERCISE, [row('A', 2, '30', '8')]).errors[0], /no está en tu rutina/);
  assert.match(core.validateExercise({ id: 'x', sets: null }, [row('S', 1, '60', '8')]).errors[0], /aún no definió las series/);
});

test('lo pendiente queda ligado a la cuenta', () => {
  const storage = memoryStorage();
  const base = { ownerId: 'coach', clientId: 'cli', assignmentId: 'asig', sessionDate: '2026-10-06', dayId: 'dia', exerciseId: 'ej-1' };
  const items = core.queueEntries([], base, [{ setType: 'S', setNumber: 1, weight: 60, reps: 8, rir: null }]);
  assert.equal(core.writeOutbox(storage, 'alumno-1', items), true);
  assert.equal(core.readOutbox(storage, 'alumno-1').length, 1);
  assert.equal(core.readOutbox(storage, 'alumno-2').length, 0);
  // Una clave por cuenta, con el id dentro: copiarla a otra cuenta no sirve.
  storage.setItem(core.outboxKey('alumno-2'), storage.getItem(core.outboxKey('alumno-1')));
  assert.equal(core.readOutbox(storage, 'alumno-2').length, 0);
});

test('volver a guardar una serie la reemplaza; lo subido hace más de 7 días se olvida', () => {
  const base = { ownerId: 'coach', clientId: 'cli', assignmentId: 'asig', sessionDate: '2026-10-06', dayId: 'dia', exerciseId: 'ej-1' };
  let items = core.queueEntries([], base, [{ setType: 'S', setNumber: 1, weight: 60, reps: 8, rir: null }]);
  items = core.markItem(items, items[0].key, { status: 'rejected', error: 'x' });
  items = core.queueEntries(items, base, [{ setType: 'S', setNumber: 1, weight: 62.5, reps: 8, rir: null }]);
  assert.equal(items.length, 1);
  assert.equal(items[0].status, 'pending');
  assert.equal(items[0].weight, 62.5);
  const storage = memoryStorage();
  const old = core.markItem(items, items[0].key, { status: 'saved', savedAt: '2026-09-01T00:00:00Z' });
  core.writeOutbox(storage, 'u', old, new Date('2026-10-06T12:00:00Z'));
  assert.equal(core.readOutbox(storage, 'u').length, 0);
  const pendingOld = core.markItem(items, items[0].key, { updatedAt: '2026-09-01T00:00:00Z' });
  core.writeOutbox(storage, 'u', pendingOld, new Date('2026-10-06T12:00:00Z'));
  assert.equal(core.readOutbox(storage, 'u').length, 1, 'lo pendiente nunca se borra solo');
});

test('lo que se sube es una lista cerrada de campos (sin quién lo escribió ni notas)', () => {
  const base = { ownerId: 'coach', clientId: 'cli', assignmentId: 'asig', sessionDate: '2026-10-06', dayId: 'dia', exerciseId: 'ej-1' };
  const [item] = core.queueEntries([], base, [{ setType: 'S', setNumber: 3, weight: 60, reps: 8, rir: 2 }]);
  assert.deepEqual(Object.keys(core.toRow(item)).sort(), ['assignment_id', 'client_id', 'completed', 'day_id', 'exercise_id', 'owner_id', 'reps', 'rir', 'session_date', 'set_number', 'set_type', 'weight']);
});

test('mensajes de rechazo en español', () => {
  assert.match(core.describeUploadError({ code: '42501', message: 'new row violates row-level security policy' }), /no aceptó esta serie.*Tus datos siguen aquí/);
  assert.match(core.describeUploadError({ code: '23514' }), /fuera de rango/);
  assert.match(core.describeUploadError({ message: 'otra cosa' }), /no aceptó esta serie/);
});

test('sin registro (sin permiso) el programa se dibuja igual que antes: sin campos', () => {
  const html = view.renderProgram({ title: 'P', assignment_id: 'asig', data: { days: [{ id: 'dia', name: 'Día A', exercises: [EXERCISE] }] } });
  assert.doesNotMatch(html, /<input|<form|data-sv-log/);
});
