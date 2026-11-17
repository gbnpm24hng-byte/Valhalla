const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../assets/js/decimal-core.js');
require('../assets/js/muscle-map-core.js');
require('../assets/js/exercise-images-core.js');
require('../assets/js/publish-core.js');
require('../assets/js/self-log-core.js');
require('../assets/js/routine-choice-core.js');
require('../assets/js/free-training-core.js');
require('../assets/js/student-view.js');
require('../assets/js/data.js');
require('../assets/js/student-import-core.js');

const free = globalThis.VALHALLA.freeTraining;
const publish = globalThis.VALHALLA.publishCore;
const muscleMap = globalThis.VALHALLA.muscleMap;
const routine = globalThis.VALHALLA.routineChoice;
const view = globalThis.VALHALLA.studentView.format;
const importCore = globalThis.VALHALLA.studentImportCore;

// Solo datos falsos.
const LIBRARY = [
  { id: 'lib-sent', name: 'Sentadilla', primaryMuscle: 'quadriceps', secondaryMuscles: ['glutes'], description: 'privado', videoUrl: 'https://example.invalid/v', active: true },
  { id: 'lib-remo', name: 'Remo con barra', primaryMuscle: 'lats', active: true },
  { id: 'lib-press', name: 'Press de banca', primaryMuscle: 'chest', active: true },
  { id: 'lib-elev', name: 'Elevación lateral', primaryMuscle: 'lateral_delts', active: true },
  { id: 'lib-zancada', name: 'Zancada búlgara', primaryMuscle: 'quadriceps', active: true },
  { id: 'lib-borrado', name: 'Ejercicio archivado', primaryMuscle: 'biceps', active: false },
  { id: 'lib-raro', name: 'Ejercicio sin músculo', primaryMuscle: 'full_body', active: true }
];

const ASSIGNMENT = { id: 'asig-1', programName: 'Fuerza falsa', days: [
  { id: 'dia-a', name: 'Día A', exercises: [{ id: 'ej-a1', exerciseName: 'Sentadilla', libraryExerciseId: 'lib-sent', sets: 3 }] },
  { id: 'dia-b', name: 'Día B', exercises: [{ id: 'ej-b1', exerciseName: 'Press de banca', sets: 3 }] }
] };

function publishedRow() {
  return { assignment_id: 'asig-1', title: 'Fuerza falsa', data: publish.buildPublishedProgram(ASSIGNMENT, LIBRARY), published_at: '2026-11-01T10:00:00Z' };
}

test('data.library publica SOLO id, nombre, músculo principal e imagen; sin archivados ni datos privados', () => {
  const program = publish.buildPublishedProgram(ASSIGNMENT, LIBRARY);
  assert.ok(Array.isArray(program.library));
  program.library.forEach((item) => {
    assert.deepEqual(Object.keys(item).filter((key) => !['id', 'name', 'muscle', 'image'].includes(key)), []);
  });
  assert.equal(program.library.some((item) => item.id === 'lib-borrado'), false, 'archivado no se publica');
  const sent = program.library.find((item) => item.id === 'lib-sent');
  assert.deepEqual(sent, { id: 'lib-sent', name: 'Sentadilla', muscle: 'quadriceps', image: 'sentadilla-barra.webp' });
  assert.deepEqual(program.library.find((item) => item.id === 'lib-raro'), { id: 'lib-raro', name: 'Ejercicio sin músculo' });
  assert.equal(JSON.stringify(program).includes('privado'), false);
  assert.deepEqual(publish.findForbiddenKeys(program), []);
  // libraryId: por el enlace y, si no hay, por el nombre.
  assert.equal(program.days[0].exercises[0].libraryId, 'lib-sent');
  assert.equal(program.days[1].exercises[0].libraryId, 'lib-press');
});

test('sin galería no se publica library (y "+ Entrenamiento libre" no aparece)', () => {
  const program = publish.buildPublishedProgram(ASSIGNMENT, []);
  assert.equal('library' in program, false);
  assert.equal(free.isAvailable({ data: program }, true), false);
  assert.equal(free.isAvailable(publishedRow(), false), false, 'con anotar apagado no aparece');
  assert.equal(free.isAvailable(publishedRow(), true), true);
});

test('tamaño: lo que suma data.library por ejercicio de la galería', () => {
  const big = Array.from({ length: 150 }, (_, i) => ({ id: `library-exercise-${String(i).padStart(4, '0')}-abcdef`, name: `Ejercicio de prueba número ${i}`, primaryMuscle: 'quadriceps', active: true }));
  const withLib = JSON.stringify(publish.buildPublishedProgram(ASSIGNMENT, big));
  const without = JSON.stringify(publish.buildPublishedProgram(ASSIGNMENT, []));
  const perItem = (withLib.length - without.length) / big.length;
  assert.ok(perItem < 120, `~${perItem.toFixed(0)} bytes por ejercicio`);
});

test('búsqueda sin tildes ni mayúsculas, por palabras, y filtro por zona', () => {
  const library = free.libraryOf(publishedRow());
  const names = (list) => list.map((item) => item.name);
  assert.deepEqual(names(free.search(library, { query: 'ELEVACION' })), ['Elevación lateral']);
  assert.deepEqual(names(free.search(library, { query: 'zancáda bulgara' })), ['Zancada búlgara']);
  assert.deepEqual(names(free.search(library, { query: 'barra' })), ['Remo con barra']);
  assert.deepEqual(names(free.search(library, { zone: 'cuadriceps', muscleMap })), ['Sentadilla', 'Zancada búlgara']);
  assert.deepEqual(names(free.search(library, { query: 'sent', zone: 'cuadriceps', muscleMap })), ['Sentadilla']);
  assert.deepEqual(names(free.search(library, { zone: 'pechoSup', muscleMap })), ['Press de banca']);
  const zones = free.zoneOptions(library, muscleMap).map((item) => item.zone);
  assert.deepEqual(zones, ['pechoSup', 'pechoInf', 'dorsales', 'hombros', 'cuadriceps']);
});

test('elegir hasta 8 ejercicios y hasta 10 series; parte con 3', () => {
  let list = [];
  for (let i = 0; i < 10; i += 1) list = free.addExercise(list, `x-${i}`);
  assert.equal(list.length, 8);
  assert.equal(list[0].sets, 3);
  list = free.removeExercise(list, 'x-0');
  assert.equal(list.length, 7);
  let sets = [{ id: 'a', sets: 3 }];
  for (let i = 0; i < 12; i += 1) sets = free.addSet(sets, 'a', sets[0].sets);
  assert.equal(sets[0].sets, 10);
});

test('día libre: lo elegido (teléfono) + lo anotado (base y cola), con series según lo hecho', () => {
  const program = publishedRow();
  const day = free.buildDay({
    program, assignmentId: 'asig-1', date: '2026-11-21',
    chosen: [{ id: 'lib-remo', sets: 3 }, { id: 'lib-no-existe', sets: 3 }],
    setRows: [{ assignment_id: 'asig-1', session_date: '2026-11-21', day_id: 'libre', exercise_id: 'lib-sent', set_type: 'S', set_number: 4 },
      { assignment_id: 'asig-1', session_date: '2026-11-20', day_id: 'libre', exercise_id: 'lib-press', set_type: 'S', set_number: 1 }],
    outbox: [{ assignmentId: 'asig-1', sessionDate: '2026-11-21', dayId: 'libre', exerciseId: 'lib-elev', setType: 'S', setNumber: 1, status: 'pending' }]
  });
  assert.equal(day.id, 'libre');
  assert.equal(day.name, 'Entrenamiento libre');
  assert.deepEqual(day.exercises.map((exercise) => [exercise.id, exercise.sets, exercise.loggedSets]), [['lib-remo', 3, 0], ['lib-sent', 4, 4], ['lib-elev', 3, 1]]);
  assert.equal(day.exercises[1].image, 'sentadilla-barra.webp');
});

test('lo elegido vive en el teléfono por cuenta, programa y fecha; se olvida a los 10 días', () => {
  const store = new Map();
  const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  const days = { [free.dayKey('asig-1', '2026-11-21')]: [{ id: 'lib-sent', sets: 3 }], [free.dayKey('asig-1', '2026-11-01')]: [{ id: 'lib-remo', sets: 3 }] };
  assert.equal(free.writeStore(storage, 'user-falso', days, '2026-11-21'), true);
  const read = free.readStore(storage, 'user-falso');
  assert.deepEqual(Object.keys(read), ['asig-1|2026-11-21']);
  assert.deepEqual(free.readStore(storage, 'otro-user'), {});
  assert.ok(store.has('valhalla_free_training:user-falso'));
});

test('mismo ejercicio: por el de la galería enlazado y, si no, por el nombre', () => {
  assert.equal(free.sameExercise({ id: 'ej-a1', name: 'Sentadilla trasera', libraryId: 'lib-sent' }, { id: 'lib-sent', name: 'Sentadilla', free: true }), true);
  assert.equal(free.sameExercise({ id: 'ej-x', name: 'SENTADILLA' }, { id: 'lib-sent', name: 'Sentadilla', free: true }), true, 'sin enlace: por nombre');
  assert.equal(free.sameExercise({ id: 'ej-y', name: 'Sentadilla', libraryId: 'lib-otro' }, { id: 'lib-sent', name: 'Sentadilla', free: true }), false, 'dos enlaces distintos no se juntan');
  assert.equal(free.sameExercise({ id: 'ej-z', name: 'Remo' }, { id: 'lib-sent', name: 'Sentadilla', free: true }), false);
});

function ctxFor(setRows, outbox = []) {
  return { canLog: true, date: '2026-11-22', dates: ['2026-11-22'], programs: [publishedRow()], setRows, outbox, progress: [] };
}
const S = (date, dayId, exerciseId, n, weight, reps) => ({ assignment_id: 'asig-1', session_date: date, day_id: dayId, exercise_id: exerciseId, set_type: 'S', set_number: n, weight, reps, rir: 2 });

test('"Última vez" y récord juntan la serie libre y la del programa del mismo ejercicio', () => {
  const rows = [S('2026-11-17', 'dia-a', 'ej-a1', 1, 60, 8), S('2026-11-17', 'dia-a', 'ej-a1', 2, 60, 8), S('2026-11-21', 'libre', 'lib-sent', 1, 70, 5)];
  const ctx = ctxFor(rows);
  const programExercise = publishedRow().data.days[0].exercises[0];
  const freeExercise = free.toExercise(free.libraryOf(publishedRow()).find((item) => item.id === 'lib-sent'), 3);
  // Desde el programa: la última vez fue el sábado libre, con récord 70.
  const fromProgram = view.exerciseReference(ctx, programExercise, '2026-11-22');
  assert.equal(fromProgram.last.date, '2026-11-21');
  assert.equal(fromProgram.record, 70);
  // Desde el libre: ve lo del programa.
  const fromFree = view.exerciseReference(ctx, freeExercise, '2026-11-21');
  assert.equal(fromFree.last.date, '2026-11-17');
  assert.equal(fromFree.record, 60);
  // Récord nuevo el sábado (una sola vez aunque estén los dos ejercicios en la lista).
  const records = view.findRecords(ctx, [programExercise, freeExercise], new Set(['2026-11-21']));
  assert.deepEqual(records.map((record) => [record.date, record.weight]), [['2026-11-21', 70]]);
  // Otro ejercicio del programa (Press) no se mezcla.
  assert.equal(view.exerciseReference(ctx, publishedRow().data.days[1].exercises[0], '2026-11-22').last, null);
});

test('mismo día programa y libre del mismo ejercicio: una serie detrás de otra', () => {
  const rows = [S('2026-11-21', 'dia-a', 'ej-a1', 1, 60, 8), S('2026-11-21', 'libre', 'lib-sent', 1, 65, 6)];
  const history = view.exerciseHistory(ctxFor(rows), publishedRow().data.days[0].exercises[0]);
  assert.deepEqual(history[0].sets.map((set) => [set.setNumber, set.weight]), [[1, 60], [2, 65]]);
});

test('racha sí, "Semana completa" y "✓ hecha esta semana" no', () => {
  const rows = [S('2026-11-17', 'dia-a', 'ej-a1', 1, 60, 8), S('2026-11-21', 'libre', 'lib-sent', 1, 70, 5)];
  const cache = { setRows: rows, progress: [{ session_date: '2026-11-20', data: { dayName: 'Entrenamiento libre' } }] };
  assert.deepEqual([...view.activityDates(cache, [])].sort(), ['2026-11-17', '2026-11-20', '2026-11-21']);
  assert.deepEqual([...view.activityDates(cache, [], { programOnly: true })], ['2026-11-17']);
  const done = routine.doneDayIds({ days: publishedRow().data.days, assignmentId: 'asig-1', date: '2026-11-22', setRows: rows, outbox: [], progress: cache.progress });
  assert.deepEqual([...done], ['dia-a']);
  assert.equal(routine.suggestDay({ days: publishedRow().data.days, done, date: '2026-11-22' }).id, 'dia-b');
});

test('Traer registros: el libre llega como una sesión "libre" (sin fantasmas ni duplicados)', () => {
  const state = {
    clients: [{ id: 'cli-1', full_name: 'Alumno Falso' }],
    exerciseLibrary: LIBRARY,
    trainingsV08: { plans: [], programs: [], assignments: [{ id: 'asig-1', programId: 'prog-1', clientId: 'cli-1', days: ASSIGNMENT.days }], sessions: [
      { id: 's-a', clientId: 'cli-1', programAssignmentId: 'asig-1', programDayId: 'dia-a', programDayName: 'Día A', date: '2026-11-22', status: 'completed', exercises: [] }
    ] }
  };
  let n = 0;
  const createId = (prefix) => `${prefix}-${++n}`;
  const row = (exerciseId, number, weight) => ({ id: `r-${exerciseId}-${number}`, owner_id: 'coach', client_id: 'cli-1', auth_user_id: 'alumno', assignment_id: 'asig-1', session_date: '2026-11-22', day_id: 'libre', exercise_id: exerciseId, set_type: 'S', set_number: number, weight, reps: 8, rir: 2 });
  const rows = [row('lib-sent', 1, 60), row('lib-sent', 2, 62.5), row('lib-sent', 4, 65), row('lib-remo', 1, 40)];
  const first = importCore.mergeStudentSets(state, rows, { coachId: 'coach', createId });
  assert.equal(first.sessionsCreated, 1);
  assert.equal(first.added, 4);
  assert.deepEqual(first.splits, [], 'programa y libre el mismo día no es aviso de "dos días"');
  const session = state.trainingsV08.sessions.find((item) => item.programDayId === 'libre');
  assert.equal(session.freeTraining, true);
  assert.equal(session.programDayName, 'Entrenamiento libre');
  assert.equal(free.isFreeSession(session), true);
  assert.deepEqual(session.exercises.map((exercise) => [exercise.exerciseName, exercise.libraryExerciseId, exercise.plannedSets, exercise.sets.length]),
    [['Remo con barra', 'lib-remo', 1, 1], ['Sentadilla', 'lib-sent', 4, 3]]);
  const again = importCore.mergeStudentSets(state, rows, { coachId: 'coach', createId });
  assert.equal(again.sessionsCreated, 0);
  assert.equal(again.added, 0);
  assert.equal(state.trainingsV08.sessions.length, 2);
  assert.equal(free.sessionLine('2026-11-22'), 'Dom 22 nov · libre');
  assert.equal(free.sessionLine('2026-11-21'), 'Sáb 21 nov · libre');
});
