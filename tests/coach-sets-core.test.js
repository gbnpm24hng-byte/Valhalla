const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../assets/js/data.js');
require('../assets/js/student-import-core.js');
require('../assets/js/coach-sets-core.js');

const core = globalThis.VALHALLA.coachSetsCore;
const importCore = globalThis.VALHALLA.studentImportCore;

const COACH = 'coach-falso';
const ALUMNO = 'alumno-falso';
const BASE = { ownerId: COACH, clientId: 'cli-1', assignmentId: 'asig-1', sessionDate: '2026-10-07', dayId: 'dia-1', exerciseId: 'ej-press' };

// Series del alumno como las deja "Traer registros" (B3.3).
const student = (setType, setNumber, weight, reps, rir = null) => ({
  setNumber, setType, weight, reps, rir, completed: true, coachValidated: false, loggedBy: 'student', studentSetId: `fila-${setType}${setNumber}`
});
// Series como las arma Modo Grupo al confirmar (aproximaciones primero).
const confirmed = (setType, setNumber, weight, reps, rir = null) => ({ setNumber, setType, weight, reps, rir, completed: true });

const STUDENT_PRESS = [student('A', 1, 30, 8), student('S', 2, 60, 8), student('S', 3, 60, 8), student('S', 4, 60, 7, 2)];

test('prellenado: las casillas de Modo Grupo con lo del alumno y su RIR', () => {
  const { values, studentRir } = core.prefillValues({ sets: STUDENT_PRESS });
  assert.deepEqual(values, { s1Weight: '60', s1Reps: '8', s2Weight: '60', s2Reps: '8', s3Weight: '60', s3Reps: '7', warmups: '30 kg', rir: '2' });
  assert.equal(studentRir, 2);
  // Peso vacío (0 en el estado) y repeticiones sin dato quedan vacíos.
  assert.deepEqual(core.prefillValues({ sets: [student('S', 1, 0, null)] }).values, { s1Weight: '', s1Reps: '' });
  assert.equal(core.prefillValues({ sets: [student('S', 1, 50, 10)] }).studentRir, null);
});

test('lo que toca el entrenador manda; lo demás muestra lo del alumno', () => {
  const { values } = core.prefillValues({ sets: STUDENT_PRESS });
  const draft = { setCount: 3, decision: '', proposedWeight: '60', error: '', s2Weight: '62.5', s3Reps: '' };
  const resolved = core.resolveDraft(draft, values);
  assert.equal(resolved.s1Weight, '60');
  assert.equal(resolved.s2Weight, '62.5', 'corregido por el entrenador');
  assert.equal(resolved.s3Reps, '', 'borrado a propósito por el entrenador');
  assert.equal(resolved.rir, '2');
  assert.equal(resolved.warmups, '30 kg');
  assert.equal(draft.s1Weight, undefined, 'el borrador no cambia');
  // Si el alumno hizo más series que las planificadas, se ven todas.
  const more = core.prefillValues({ sets: [...STUDENT_PRESS, student('S', 5, 55, 9)] }).values;
  assert.equal(core.resolveDraft({ setCount: 3 }, more).setCount, 4);
  assert.equal(core.resolveDraft({ setCount: 3, s4Weight: '', s4Reps: '' }, more).setCount, 3, 'la que el entrenador vació no cuenta');
});

test('confirmar sin cambios: no se escribe nada y lo del alumno queda suyo, ya revisado', () => {
  const sets = [confirmed('A', 1, 30, null), confirmed('S', 2, 60, 8), confirmed('S', 3, 60, 8), confirmed('S', 4, 60, 7, 2)];
  const plan = core.planConfirm({ previous: STUDENT_PRESS, confirmed: sets, write: true, mark: true });
  assert.deepEqual(plan.changes, []);
  assert.ok(plan.sets.every((entry) => entry.loggedBy === 'student' && entry.coachValidated === true && entry.studentSetId));
  assert.equal(plan.sets[0].reps, 8, 'la aproximación con el mismo peso conserva las reps del alumno');
  assert.deepEqual(plan.sets.map((entry) => entry.setNumber), [1, 2, 3, 4]);
  assert.equal(core.hasUnreviewedStudentSets({ sets: plan.sets }), false);
  assert.equal(core.hasUnreviewedStudentSets({ sets: STUDENT_PRESS }), true);
});

test('corregir 1 serie: solo esa se escribe, a nombre del entrenador y validada', () => {
  const sets = [confirmed('A', 1, 30, null), confirmed('S', 2, 60, 8), confirmed('S', 3, 62.5, 8), confirmed('S', 4, 60, 7, 2)];
  const plan = core.planConfirm({ previous: STUDENT_PRESS, confirmed: sets, write: true, mark: true });
  assert.deepEqual(plan.changes, [{ setType: 'S', setNumber: 2, weight: 62.5, reps: 8, rir: null }]);
  const corrected = plan.sets.find((entry) => entry.weight === 62.5);
  assert.equal(corrected.loggedBy, 'coach');
  assert.equal(corrected.coachValidated, true);
  assert.equal(corrected.studentSetId, 'fila-S3', 'sigue ligada a su fila: al volver a traer no se duplica');
  const { rows, skipped } = core.buildRows(BASE, plan.changes);
  assert.equal(skipped, 0);
  assert.deepEqual(rows, [{
    owner_id: COACH, client_id: 'cli-1', auth_user_id: COACH, assignment_id: 'asig-1', session_date: '2026-10-07', day_id: 'dia-1',
    exercise_id: 'ej-press', set_type: 'S', set_number: 2, weight: 62.5, reps: 8, rir: null, completed: true, coach_validated: true
  }]);
  assert.equal(core.conflictKey(rows[0]), 'coach-falso|cli-1|asig-1|2026-10-07|dia-1|ej-press|S|2');
});

test('series que el alumno no registró se escriben; la que el entrenador quitó queda vacía a su nombre', () => {
  const previous = [student('S', 1, 60, 8), student('S', 2, 60, 8)];
  const plan = core.planConfirm({ previous, confirmed: [confirmed('S', 1, 60, 8), confirmed('S', 2, 60, 8), confirmed('S', 3, 60, 6, 1)], write: true, mark: true });
  assert.deepEqual(plan.changes, [{ setType: 'S', setNumber: 3, weight: 60, reps: 6, rir: 1 }]);
  assert.equal(plan.sets[2].loggedBy, 'coach');
  const dropped = core.planConfirm({ previous, confirmed: [confirmed('S', 1, 60, 8, 2)], write: true, mark: true });
  assert.deepEqual(dropped.changes, [
    { setType: 'S', setNumber: 1, weight: 60, reps: 8, rir: 2 },
    { setType: 'S', setNumber: 2, weight: null, reps: null, rir: null }
  ]);
  assert.equal(dropped.sets.length, 1);
});

test('alumno sin can_self_log: no se escribe nada y las series quedan como siempre', () => {
  const sets = [confirmed('A', 1, 30, null), confirmed('S', 2, 60, 8), confirmed('S', 3, 60, 7, 2)];
  const plan = core.planConfirm({ previous: [], confirmed: sets, write: false, mark: false });
  assert.deepEqual(plan.changes, []);
  assert.deepEqual(plan.sets, sets);
  // Sin saber aún si registra (sin conexión): se escribe todo, pero sin marcar nada.
  const unknown = core.planConfirm({ previous: [], confirmed: sets, write: true, mark: false });
  assert.equal(unknown.changes.length, 3);
  assert.deepEqual(unknown.sets, sets);
});

test('fuera de los límites de la base no se escribe (reps con decimales, peso de 1000 kg)', () => {
  const { rows, skipped } = core.buildRows(BASE, [
    { setType: 'S', setNumber: 1, weight: 60, reps: 8.5, rir: null },
    { setType: 'S', setNumber: 2, weight: 1000, reps: 8, rir: null },
    { setType: 'S', setNumber: 3, weight: 60, reps: 8, rir: 2 }
  ]);
  assert.equal(skipped, 2);
  assert.deepEqual(rows.map((row) => row.set_number), [3]);
});

test('pendiente en el teléfono: por cuenta, la última de cada serie y solo de alumnos que registran', () => {
  const { rows } = core.buildRows(BASE, [{ setType: 'S', setNumber: 1, weight: 60, reps: 8, rir: null }]);
  const { rows: other } = core.buildRows({ ...BASE, clientId: 'cli-2' }, [{ setType: 'S', setNumber: 1, weight: 40, reps: 10, rir: null }]);
  let items = core.queueRows([], rows, new Date('2026-10-07T10:00:00Z'));
  items = core.queueRows(items, [{ ...rows[0], weight: 65 }], new Date('2026-10-07T10:01:00Z'));
  items = core.queueRows(items, other, new Date('2026-10-07T10:02:00Z'));
  assert.equal(items.length, 2);
  assert.equal(items[0].row.weight, 65, 'la última corrección reemplaza a la anterior');
  const raw = core.serializeOutbox(COACH, items);
  assert.equal(core.readOutbox(raw, COACH).length, 2);
  assert.deepEqual(core.readOutbox(raw, 'otra-cuenta'), [], 'de otra cuenta no se lee');
  assert.deepEqual(core.readOutbox('no es json', COACH), []);
  assert.equal(core.storageKey(COACH), 'valhalla_coach_sets:coach-falso');
  const { send, drop } = core.splitByLinks(items, new Map([['cli-1', { canSelfLog: true }], ['cli-2', { canSelfLog: false }]]));
  assert.deepEqual(send.map((item) => item.row.client_id), ['cli-1']);
  assert.deepEqual(drop.map((item) => item.row.client_id), ['cli-2']);
  // Lo vuelto a encolar mientras subía no se borra.
  const requeued = core.queueRows(items, [{ ...rows[0], weight: 70 }], new Date('2026-10-07T10:03:00Z'));
  assert.equal(core.removeDone(requeued, send).length, 2);
  assert.equal(core.removeDone(items, [...send, ...drop]).length, 0);
});

// ---------------------------------------------------------------------------
// "Traer registros" con lo del entrenador (student-import-core.js)
// ---------------------------------------------------------------------------

let counter = 0;
const createId = (prefix) => `${prefix}-${++counter}`;
const row = (exerciseId, type, n, weight, reps, extra = {}) => ({
  id: `fila-${exerciseId}-${type}${n}-${extra.session_date || '2026-10-07'}`, owner_id: COACH, client_id: 'cli-1', auth_user_id: ALUMNO, assignment_id: 'asig-1',
  session_date: '2026-10-07', day_id: 'dia-1', exercise_id: exerciseId, set_type: type, set_number: n, weight, reps, rir: null, completed: true, ...extra
});
function baseState(sessions = []) {
  return {
    clients: [{ id: 'cli-1', full_name: 'Alumno Falso' }],
    trainingsV08: {
      plans: [], programs: [],
      assignments: [{ id: 'asig-1', programId: 'prog-1', clientId: 'cli-1', days: [
        { id: 'dia-1', name: 'Día A', exercises: [{ id: 'ej-press', exerciseName: 'Press falso', sets: 3 }] },
        { id: 'dia-2', name: 'Día B', exercises: [{ id: 'ej-remo', exerciseName: 'Remo falso', sets: 2 }] }
      ] }],
      sessions
    }
  };
}

test('traer: lo que el entrenador tiene pendiente de subir no se toca', () => {
  const state = baseState();
  const pending = new Set([core.conflictKey({ ...row('ej-press', 'S', 2, 0, 0), owner_id: COACH })]);
  const summary = importCore.mergeStudentSets(state, [row('ej-press', 'S', 1, 60, 8), row('ej-press', 'S', 2, 60, 8)], {
    coachId: COACH, createId, skipRow: (item) => pending.has(core.conflictKey(item))
  });
  assert.equal(summary.added, 1);
  assert.equal(summary.keptCoach, 1);
  assert.equal(state.trainingsV08.sessions[0].exercises[0].sets.length, 1);
});

test('traer: si el alumno cambia una serie ya revisada, vuelve a quedar por revisar', () => {
  const state = baseState();
  importCore.mergeStudentSets(state, [row('ej-press', 'S', 1, 60, 8)], { coachId: COACH, createId });
  const exercise = state.trainingsV08.sessions[0].exercises[0];
  exercise.sets[0].coachValidated = true;
  assert.equal(core.hasUnreviewedStudentSets(exercise), false);
  importCore.mergeStudentSets(state, [row('ej-press', 'S', 1, 62.5, 8)], { coachId: COACH, createId });
  assert.equal(exercise.sets[0].weight, 62.5);
  assert.equal(core.hasUnreviewedStudentSets(exercise), true);
  // Lo que escribió el entrenador en la base nunca se trae.
  const before = JSON.stringify(state);
  importCore.mergeStudentSets(state, [row('ej-press', 'S', 1, 70, 5, { auth_user_id: COACH })], { coachId: COACH, createId });
  assert.equal(JSON.stringify(state), before);
});

test('traer: dos sesiones la misma fecha con distinto día no se fusionan y se avisa', () => {
  const coachSession = { id: 'ses-grupo', clientId: 'cli-1', programAssignmentId: 'asig-1', programDayId: 'dia-1', programDayName: 'Día A', groupSessionId: 'group-x', date: '2026-10-07', exercises: [] };
  const state = baseState([coachSession]);
  const summary = importCore.mergeStudentSets(state, [row('ej-remo', 'S', 1, 50, 12, { day_id: 'dia-2' })], { coachId: COACH, createId });
  assert.equal(state.trainingsV08.sessions.length, 2);
  assert.equal(summary.sessionsCreated, 1);
  assert.deepEqual(summary.splits, [{ clientId: 'cli-1', date: '2026-10-07', dayNames: ['Día A', 'Día B'] }]);
  // Mismo día del programa: se junta y no hay aviso.
  const same = baseState([{ ...coachSession }]);
  assert.deepEqual(importCore.mergeStudentSets(same, [row('ej-press', 'S', 1, 60, 8)], { coachId: COACH, createId }).splits, []);
  assert.equal(same.trainingsV08.sessions.length, 1);
});

test('guardar y volver a cargar conserva quién registró cada serie y si se revisó', () => {
  const data = globalThis.VALHALLA.data;
  const state = baseState();
  importCore.mergeStudentSets(state, [row('ej-press', 'S', 1, 60, 8), row('ej-press', 'S', 2, 60, 8)], { coachId: COACH, createId });
  const exercise = state.trainingsV08.sessions[0].exercises[0];
  exercise.sets = core.planConfirm({ previous: exercise.sets, confirmed: [confirmed('S', 1, 60, 8), confirmed('S', 2, 65, 8, 2)], write: true, mark: true }).sets;
  const reloaded = data.importState(JSON.stringify(state)).trainingsV08.sessions[0].exercises[0].sets;
  assert.deepEqual(reloaded.map((entry) => [entry.loggedBy, entry.coachValidated, entry.studentSetId]), [
    ['student', true, 'fila-ej-press-S1-2026-10-07'],
    ['coach', true, 'fila-ej-press-S2-2026-10-07']
  ]);
});
