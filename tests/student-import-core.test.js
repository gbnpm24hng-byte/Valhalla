const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../assets/js/data.js');
require('../assets/js/student-import-core.js');

const data = globalThis.VALHALLA.data;
const core = globalThis.VALHALLA.studentImportCore;

const COACH = 'coach-falso';
const ALUMNO = 'alumno-falso';
let counter = 0;
const createId = (prefix) => `${prefix}-${++counter}`;

function baseState() {
  return {
    clients: [{ id: 'cli-1', full_name: 'Alumno Falso', sessions_total: 8, sessions_used: 3, training_attendance: [{ sessionKey: 'k', status: 'attended' }] }],
    trainingsV08: {
      plans: [], programs: [],
      assignments: [{ id: 'asig-1', programId: 'prog-1', clientId: 'cli-1', days: [{ id: 'dia-1', name: 'Día A', exercises: [
        { id: 'ej-press', exerciseName: 'Press falso', sets: 3, repMin: 8, repMax: 10, targetWeight: 60, restSeconds: 90 },
        { id: 'ej-remo', exerciseName: 'Remo falso', sets: 2, repMin: 10, repMax: 12, targetWeight: 50, restSeconds: 90 }
      ] }] }],
      sessions: []
    }
  };
}

const row = (exerciseId, type, n, weight, reps, extra = {}) => ({
  id: `fila-${exerciseId}-${type}${n}-${extra.date || '2026-10-06'}`,
  owner_id: COACH, client_id: 'cli-1', auth_user_id: ALUMNO, assignment_id: 'asig-1',
  session_date: extra.date || '2026-10-06', day_id: 'dia-1', exercise_id: exerciseId,
  set_type: type, set_number: n, weight, reps, rir: extra.rir ?? null, completed: true, updated_at: '2026-10-06T12:00:00Z', ...extra.over
});

test('sin sesión del entrenador: se crea una y las series quedan marcadas', () => {
  const state = baseState();
  const summary = core.mergeStudentSets(state, [row('ej-press', 'S', 1, 60, 8), row('ej-press', 'S', 3, 57.5, 7, { rir: 2 }), row('ej-press', 'A', 1, 30, 8)], { coachId: COACH, createId });
  assert.equal(summary.added, 3);
  assert.equal(summary.sessionsCreated, 1);
  const [session] = state.trainingsV08.sessions;
  assert.equal(session.clientId, 'cli-1');
  assert.equal(session.date, '2026-10-06');
  assert.equal(session.programDayId, 'dia-1');
  assert.match(session.title, /Registro del alumno/);
  const exercise = session.exercises[0];
  assert.equal(exercise.exerciseName, 'Press falso');
  assert.equal(exercise.programExerciseId, 'ej-press');
  assert.equal(exercise.plannedSets, 3);
  assert.ok(exercise.sets.every((s) => s.loggedBy === 'student' && s.studentSetId));
  assert.equal(core.countStudentSets(session), 3);
});

test('con sesión del entrenador: lo suyo no se pisa, lo vacío se llena y lo que falta se agrega', () => {
  const state = baseState();
  state.trainingsV08.sessions.push({ id: 'ses-coach', clientId: 'cli-1', programAssignmentId: 'asig-1', programDayId: 'dia-1', date: '2026-10-06', title: 'Mía', status: 'completed', exercises: [
    { id: 'tx-1', programExerciseId: 'ej-press', exerciseName: 'Press falso', plannedSets: 3, sets: [
      { setNumber: 1, setType: 'A', weight: 30, reps: null, completed: true },
      { setNumber: 2, setType: 'S', weight: 62.5, reps: 8, rir: null, completed: true },
      { setNumber: 3, setType: 'S', weight: 0, reps: null, rir: null, completed: true }
    ] }
  ] });
  const summary = core.mergeStudentSets(state, [row('ej-press', 'S', 1, 99, 1), row('ej-press', 'S', 2, 60, 8), row('ej-press', 'S', 3, 60, 7, { rir: 1 }), row('ej-remo', 'S', 1, 50, 12)], { coachId: COACH, createId });
  assert.equal(state.trainingsV08.sessions.length, 1, 'no se crea otra sesión');
  assert.deepEqual({ added: summary.added, keptCoach: summary.keptCoach, sessionsCreated: summary.sessionsCreated }, { added: 3, keptCoach: 1, sessionsCreated: 0 });
  const press = state.trainingsV08.sessions[0].exercises[0].sets;
  assert.deepEqual(press.find((s) => s.setNumber === 2), { setNumber: 2, setType: 'S', weight: 62.5, reps: 8, rir: null, completed: true }, 'la serie del entrenador queda igual');
  assert.equal(press.find((s) => s.setNumber === 3).weight, 60, 'la vacía se llena');
  assert.equal(press.find((s) => s.setNumber === 3).loggedBy, 'student');
  assert.equal(press.find((s) => s.setNumber === 4).weight, 60, 'la que falta se agrega');
  assert.equal(state.trainingsV08.sessions[0].exercises[1].exerciseName, 'Remo falso');
});

test('traer dos veces no duplica; si el alumno corrige se actualiza; si corrigió el entrenador, no', () => {
  const state = baseState();
  const rows = [row('ej-press', 'S', 1, 60, 8), row('ej-press', 'S', 2, 60, 8)];
  core.mergeStudentSets(state, rows, { coachId: COACH, createId });
  const again = core.mergeStudentSets(state, rows, { coachId: COACH, createId });
  assert.deepEqual({ added: again.added, updated: again.updated, sessionsCreated: again.sessionsCreated, unchanged: again.unchanged }, { added: 0, updated: 0, sessionsCreated: 0, unchanged: 2 });
  assert.equal(state.trainingsV08.sessions[0].exercises[0].sets.length, 2);
  const sets = state.trainingsV08.sessions[0].exercises[0].sets;
  sets[1].loggedBy = 'coach';
  sets[1].weight = 65;
  const changed = core.mergeStudentSets(state, [row('ej-press', 'S', 1, 62.5, 8), row('ej-press', 'S', 2, 70, 8)], { coachId: COACH, createId });
  assert.equal(changed.updated, 1);
  assert.equal(changed.keptCoach, 1);
  assert.equal(sets[0].weight, 62.5);
  assert.equal(sets[1].weight, 65);
});

test('ignora filas del entrenador, de clientes desconocidos y tipos que no son A ni S', () => {
  const state = baseState();
  const summary = core.mergeStudentSets(state, [
    row('ej-press', 'S', 1, 60, 8, { over: { auth_user_id: COACH } }),
    row('ej-press', 'S', 1, 60, 8, { over: { client_id: 'cli-otro' } }),
    row('ej-press', 'T', 1, 70, 3)
  ], { coachId: COACH, createId });
  assert.equal(summary.added, 0);
  assert.equal(summary.ignored, 3);
  assert.equal(state.trainingsV08.sessions.length, 0);
});

test('no toca asistencia, saldo, programas ni cargas; una "T" del entrenador no rompe nada', () => {
  const state = baseState();
  state.trainingsV08.sessions.push({ id: 'ses-t', clientId: 'cli-1', programDayId: 'dia-1', date: '2026-10-06', exercises: [
    { id: 'tx-t', programExerciseId: 'ej-press', exerciseName: 'Press falso', plannedSets: 3, sets: [{ setNumber: 1, setType: 'T', weight: 70, reps: 3, completed: true }] }
  ] });
  const clientBefore = JSON.stringify(state.clients);
  const assignmentsBefore = JSON.stringify(state.trainingsV08.assignments);
  const summary = core.mergeStudentSets(state, [row('ej-press', 'S', 1, 60, 8)], { coachId: COACH, createId });
  assert.equal(summary.added, 1);
  assert.equal(JSON.stringify(state.clients), clientBefore);
  assert.equal(JSON.stringify(state.trainingsV08.assignments), assignmentsBefore);
  const sets = state.trainingsV08.sessions[0].exercises[0].sets;
  assert.deepEqual(sets.map((s) => s.setType), ['T', 'S']);
});

test('guardar y volver a cargar conserva quién la registró; las series antiguas quedan iguales', () => {
  const state = baseState();
  state.trainingsV08.sessions.push({ id: 'ses-vieja', clientId: 'cli-1', date: '2026-09-01', exercises: [
    { id: 'tx-v', exerciseName: 'Press falso', plannedSets: 1, sets: [{ setNumber: 1, setType: 'S', weight: 50, reps: 10, rir: 2, completed: true, createdAt: '2026-09-01T10:00:00.000Z', techniqueStatus: 'pending', coachValidated: false, personalRecord: false }] }
  ] });
  const oldBefore = JSON.stringify(data.importState(JSON.stringify(state)).trainingsV08.sessions.find((s) => s.id === 'ses-vieja'));
  core.mergeStudentSets(state, [row('ej-press', 'S', 1, 60, 8)], { coachId: COACH, createId });
  const reloaded = data.importState(JSON.stringify(state));
  const imported = reloaded.trainingsV08.sessions.find((s) => s.id !== 'ses-vieja').exercises[0].sets[0];
  assert.equal(imported.loggedBy, 'student');
  assert.ok(imported.studentSetId);
  const oldAfter = JSON.stringify(reloaded.trainingsV08.sessions.find((s) => s.id === 'ses-vieja'));
  assert.equal(oldAfter, oldBefore);
  assert.doesNotMatch(oldAfter, /loggedBy|studentSetId/);
});
