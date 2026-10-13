const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;
require('../assets/js/data.js');
require('../assets/js/sync-core.js');
require('../assets/js/publish-core.js');
require('../assets/js/client-overrides-core.js');
require('../assets/js/student-import-core.js');

const data = globalThis.VALHALLA.data;
const sync = globalThis.VALHALLA.syncCore;
const publish = globalThis.VALHALLA.publishCore;
const core = globalThis.VALHALLA.clientOverrides;
const studentImport = globalThis.VALHALLA.studentImportCore;

let counter = 0;
const createId = (prefix) => `${prefix}-${++counter}`;
const clone = (value) => JSON.parse(JSON.stringify(value));

// Dos alumnos falsos con el MISMO programa: cada uno con su propia asignación.
const exercise = (id, name, extra = {}) => ({ id, libraryExerciseId: `lib-${id}`, exerciseName: name, sets: 3, repMin: 8, repMax: 10, targetWeight: 60, restSeconds: 90, ...extra });
const DAYS = [
  { id: 'dia-piernas', name: 'Lunes — Piernas', exercises: [exercise('ej-sentadilla', 'Sentadilla falsa'), exercise('ej-prensa', 'Prensa falsa')] },
  { id: 'dia-espalda', name: 'Miércoles — Espalda', exercises: [exercise('ej-remo', 'Remo falso')] }
];
const assignmentFor = (clientId, id = `asig-${clientId}`) => ({ id, programId: 'prog-comun', clientId, programName: 'Programa común', days: clone(DAYS) });
const LIB_PRENSA_45 = { id: 'lib-prensa-45', name: 'Prensa 45 falsa', category: 'PIERNAS' };
const LIB_ZANCADA = { id: 'lib-zancada', name: 'Zancada falsa', category: 'PIERNAS' };
const values = { sets: 4, repMin: 10, repMax: 12, targetWeight: 80 };

function makeOverride({ clientId = 'alumno-a', kind = 'replace', scope = 'forward', date = '2026-10-12', target = 'ej-prensa', lib = LIB_PRENSA_45, now = '2026-10-12T10:00:00.000Z', assignment } = {}) {
  const asg = assignment || assignmentFor(clientId);
  const day = asg.days[0];
  return core.createOverride({
    createId, now, client: { id: clientId }, assignment: asg, day, kind, scope, date,
    libraryExercise: lib, values, replaced: kind === 'replace' ? day.exercises.find((item) => item.id === target) : null
  });
}

const names = (day) => day.exercises.map((item) => item.exerciseName);

test('solo hoy: cambia solo esa fecha; antes y después queda el programa', () => {
  const asg = assignmentFor('alumno-a');
  const overrides = [makeOverride({ scope: 'today', date: '2026-10-12' })];
  const ctx = (date) => ({ clientId: 'alumno-a', programId: 'prog-comun', assignmentId: asg.id, date });
  assert.deepEqual(names(core.applyToDay(asg.days[0], overrides, ctx('2026-10-12'))), ['Sentadilla falsa', 'Prensa 45 falsa']);
  assert.deepEqual(names(core.applyToDay(asg.days[0], overrides, ctx('2026-10-19'))), ['Sentadilla falsa', 'Prensa falsa']);
  assert.deepEqual(names(core.applyToDay(asg.days[0], overrides, ctx('2026-10-05'))), ['Sentadilla falsa', 'Prensa falsa']);
  // Al publicar (sin fecha) no se aplica un "solo hoy".
  assert.deepEqual(names(core.applyToAssignment(asg, overrides).days[0]), ['Sentadilla falsa', 'Prensa falsa']);
});

test('de aquí en adelante: desde esa fecha; una sesión antigua (fecha anterior) no cambia', () => {
  const asg = assignmentFor('alumno-a');
  const overrides = [makeOverride({ scope: 'forward', date: '2026-10-12' })];
  const ctx = (date) => ({ clientId: 'alumno-a', programId: 'prog-comun', assignmentId: asg.id, date });
  assert.deepEqual(names(core.applyToDay(asg.days[0], overrides, ctx('2026-10-12'))), ['Sentadilla falsa', 'Prensa 45 falsa']);
  assert.deepEqual(names(core.applyToDay(asg.days[0], overrides, ctx('2026-11-30'))), ['Sentadilla falsa', 'Prensa 45 falsa']);
  assert.deepEqual(names(core.applyToDay(asg.days[0], overrides, ctx('2026-10-05'))), ['Sentadilla falsa', 'Prensa falsa']);
  const replaced = core.applyToDay(asg.days[0], overrides, ctx('2026-10-12')).exercises[1];
  assert.equal(replaced.sets, 4);
  assert.equal(replaced.repMin, 10);
  assert.equal(replaced.targetWeight, 80);
  assert.notEqual(replaced.id, 'ej-prensa', 'el ejercicio nuevo tiene su propio id: lo registrado del anterior no se mezcla');
  // Solo ese día del programa: el otro día no cambia.
  assert.deepEqual(names(core.applyToAssignment(asg, overrides, { date: '2026-10-12' }).days[1]), ['Remo falso']);
});

test('nunca cambia a otro alumno con el mismo programa, ni el programa ni las asignaciones', () => {
  const asgA = assignmentFor('alumno-a');
  const asgB = assignmentFor('alumno-b');
  const before = clone({ asgA, asgB });
  const overrides = [makeOverride({ clientId: 'alumno-a', assignment: asgA }), makeOverride({ clientId: 'alumno-a', kind: 'add', lib: LIB_ZANCADA, assignment: asgA })];
  const effectiveA = core.applyToAssignment(asgA, overrides, { date: '2026-10-12' });
  const effectiveB = core.applyToAssignment(asgB, overrides, { date: '2026-10-12' });
  assert.deepEqual(names(effectiveA.days[0]), ['Sentadilla falsa', 'Prensa 45 falsa', 'Zancada falsa']);
  assert.equal(effectiveB, asgB, 'al alumno B no se le aplica nada');
  assert.deepEqual(names(effectiveB.days[0]), ['Sentadilla falsa', 'Prensa falsa']);
  assert.deepEqual({ asgA, asgB }, before, 'las asignaciones guardadas no se modifican');
});

test('agregar: va al final del día; varios cambios se aplican en orden', () => {
  const asg = assignmentFor('alumno-a');
  const add = makeOverride({ kind: 'add', lib: LIB_ZANCADA, now: '2026-10-12T10:00:00.000Z' });
  // Después se cambia el ejercicio agregado por otro (encadenado), solo hoy.
  const chained = core.createOverride({
    createId, now: '2026-10-12T10:05:00.000Z', client: { id: 'alumno-a' }, assignment: asg, day: asg.days[0], kind: 'replace', scope: 'today', date: '2026-10-12',
    libraryExercise: LIB_PRENSA_45, values, replaced: add.exercise
  });
  const ctx = { clientId: 'alumno-a', programId: 'prog-comun', assignmentId: asg.id, date: '2026-10-12' };
  assert.deepEqual(names(core.applyToDay(asg.days[0], [chained, add], ctx)), ['Sentadilla falsa', 'Prensa falsa', 'Prensa 45 falsa']);
  assert.deepEqual(names(core.applyToDay(asg.days[0], [chained, add], { ...ctx, date: '2026-10-19' })), ['Sentadilla falsa', 'Prensa falsa', 'Zancada falsa']);
});

test('sobrevive a volver a guardar o asignar el programa (nueva asignación, mismo programa)', () => {
  const overrides = [makeOverride()];
  const reassigned = assignmentFor('alumno-a', 'asig-nueva');
  assert.deepEqual(names(core.applyToAssignment(reassigned, overrides, { date: '2026-10-20' }).days[0]), ['Sentadilla falsa', 'Prensa 45 falsa']);
});

test('quitar cambio: "solo hoy" o del mismo día se borra; uno anterior se cierra el día antes', () => {
  const asg = assignmentFor('alumno-a');
  const ctx = (date) => ({ clientId: 'alumno-a', programId: 'prog-comun', assignmentId: asg.id, date });
  const today = makeOverride({ scope: 'today', date: '2026-10-12' });
  const sameDay = makeOverride({ scope: 'forward', date: '2026-10-12', kind: 'add', lib: LIB_ZANCADA });
  const list = [today, sameDay];
  assert.equal(core.revertOverride(list, today.id, '2026-10-12').action, 'deleted');
  assert.equal(core.revertOverride(list, sameDay.id, '2026-10-12').action, 'deleted');
  assert.deepEqual(list, []);
  assert.equal(core.revertOverride(list, 'no-existe', '2026-10-12'), null);

  const older = makeOverride({ scope: 'forward', date: '2026-10-05' });
  const kept = [older];
  const result = core.revertOverride(kept, older.id, '2026-10-12', '2026-10-12T11:00:00.000Z');
  assert.equal(result.action, 'ended');
  assert.equal(older.endDate, '2026-10-11');
  assert.deepEqual(names(core.applyToDay(asg.days[0], kept, ctx('2026-10-05'))), ['Sentadilla falsa', 'Prensa 45 falsa'], 'la semana pasada sigue mostrando lo que se hizo');
  assert.deepEqual(names(core.applyToDay(asg.days[0], kept, ctx('2026-10-12'))), ['Sentadilla falsa', 'Prensa falsa'], 'hoy vuelve el original');
  assert.deepEqual(names(core.applyToDay(asg.days[0], kept, ctx('2026-10-19'))), ['Sentadilla falsa', 'Prensa falsa']);
  assert.deepEqual(names(core.applyToAssignment(asg, kept).days[0]), ['Sentadilla falsa', 'Prensa falsa'], 'tampoco se publica');
  const reloaded = data.importState(JSON.stringify({ trainingsV08: { assignments: [asg], clientOverrides: kept } }));
  assert.equal(reloaded.trainingsV08.clientOverrides[0].endDate, '2026-10-11', 'se guarda la fecha de término');
});

test('validación de series, repeticiones y peso', () => {
  assert.deepEqual(core.validateInput({ sets: '4', reps: '10-12', weight: '80' }).values, { sets: 4, repMin: 10, repMax: 12, targetWeight: 80 });
  assert.deepEqual(core.validateInput({ sets: '3', reps: '8', weight: '0' }).values, { sets: 3, repMin: 8, repMax: 8, targetWeight: 0 });
  assert.equal(core.validateInput({ sets: '3', reps: '8', weight: '22,5' }).values.targetWeight, 22.5);
  assert.match(core.validateInput({ sets: '0', reps: '8', weight: '10' }).error, /Series/);
  assert.match(core.validateInput({ sets: '3', reps: '12-8', weight: '10' }).error, /Repeticiones/);
  assert.match(core.validateInput({ sets: '3', reps: '8', weight: '' }).error, /Peso/);
});

test('publicar: incluye "de aquí en adelante", sin datos privados ni marcas internas', () => {
  const asg = assignmentFor('alumno-a');
  const overrides = [makeOverride({ scope: 'forward' }), makeOverride({ kind: 'add', scope: 'today', lib: LIB_ZANCADA })];
  const publication = publish.buildPublication(core.applyToAssignment(asg, overrides), []);
  assert.deepEqual(publication.program.days[0].exercises.map((item) => item.name), ['Sentadilla falsa', 'Prensa 45 falsa']);
  assert.deepEqual(publish.findForbiddenKeys(publication), []);
  assert.ok(!JSON.stringify(publication).includes('override'), 'no publica las marcas internas del cambio');
  const hashBefore = sync.fingerprint(publish.buildPublication(asg, []).program);
  assert.notEqual(sync.fingerprint(publication.program), hashBefore, 'el indicador muestra "Tiene cambios sin publicar"');
});

test('guardado: se conserva al recargar, se descarta lo inválido y sin cambios no aparece', () => {
  const override = makeOverride();
  const state = data.importState(JSON.stringify({ trainingsV08: { assignments: [assignmentFor('alumno-a')], clientOverrides: [override, { kind: 'replace', scope: 'forward' }] } }));
  assert.equal(state.trainingsV08.clientOverrides.length, 1);
  assert.equal(state.trainingsV08.clientOverrides[0].exercise.exerciseName, 'Prensa 45 falsa');
  assert.equal(state.trainingsV08.clientOverrides[0].targetExerciseId, 'ej-prensa');
  const again = data.importState(JSON.stringify(state));
  assert.deepEqual(again.trainingsV08.clientOverrides, state.trainingsV08.clientOverrides, 'normalizar dos veces no cambia nada');
  const without = data.importState(JSON.stringify({ trainingsV08: { assignments: [assignmentFor('alumno-a')] } }));
  assert.equal('clientOverrides' in without.trainingsV08, false, 'si nunca se usó, lo guardado no cambia de forma');
});

test('sincronización: sube con trainingsV08 y un cambio distinto en la nube se detecta como diferencia', () => {
  const local = data.importState(JSON.stringify({ clients: [{ id: 'alumno-a', full_name: 'Alumno Falso' }], trainingsV08: { assignments: [assignmentFor('alumno-a')], clientOverrides: [makeOverride()] } }));
  const payload = sync.buildCloudPayload(local);
  assert.equal(payload.trainingsV08.clientOverrides.length, 1);
  assert.equal(sync.compare(payload, clone(payload)).identical, true);
  const cloud = clone(payload);
  cloud.trainingsV08.clientOverrides[0].exercise.targetWeight = 99;
  assert.equal(sync.compare(payload, cloud).identical, false, 'otro equipo con otro cambio: no son iguales (la nube decide con su versión)');
  const applied = sync.applyCloudData(local, cloud);
  assert.equal(applied.trainingsV08.clientOverrides[0].exercise.targetWeight, 99);
  assert.equal(local.trainingsV08.clientOverrides[0].exercise.targetWeight, 80, 'aplicar la nube no toca el estado original');
});

test('registros del alumno: un ejercicio cambiado para él se trae con su nombre', () => {
  const override = makeOverride();
  const state = { clients: [{ id: 'alumno-a' }], trainingsV08: { plans: [], programs: [], sessions: [], assignments: [assignmentFor('alumno-a')], clientOverrides: [override] } };
  studentImport.mergeStudentSets(state, [{
    id: 'fila-1', owner_id: 'coach-falso', client_id: 'alumno-a', auth_user_id: 'usuario-alumno-falso', assignment_id: 'asig-alumno-a', session_date: '2026-10-12', day_id: 'dia-piernas',
    exercise_id: override.exercise.id, set_type: 'S', set_number: 1, weight: 80, reps: 10, rir: 2, completed: true
  }], { coachId: 'coach-falso', createId });
  const performed = state.trainingsV08.sessions[0].exercises[0];
  assert.equal(performed.exerciseName, 'Prensa 45 falsa');
  assert.equal(performed.programExerciseId, override.exercise.id);
});

// ---- Modo Grupo: "Última vez" y sesiones anteriores (funciones reales de app.js) ----

const appSource = fs.readFileSync(path.join(__dirname, '../assets/js/app.js'), 'utf8');
function extractFunction(name) {
  const start = appSource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `No se encontró function ${name} en app.js`);
  const bodyStart = appSource.indexOf('{', appSource.indexOf(')', start));
  let depth = 0;
  for (let index = bodyStart; index < appSource.length; index += 1) {
    if (appSource[index] === '{') depth += 1;
    if (appSource[index] === '}') depth -= 1;
    if (depth === 0) return appSource.slice(start, index + 1);
  }
  throw new Error(`Llaves sin cerrar en ${name}`);
}

function buildHistory(sessions, sessionDate) {
  require('../assets/js/labels.js');
  const factory = new Function('groupSessionUi', 'getTrainingSessionsByClient', 'labelsApi', `
    ${['sortSessionsByDateAsc', 'getSessionExercises', 'getExerciseSets', 'getSetType', 'countExerciseSets', 'formatGroupShortDate',
    'getGroupSessionsBefore', 'getGroupEffectiveSets', 'findLastGroupPerformance', 'formatGroupSetsSummary', 'formatLastGroupPerformance',
    'getPreviousGroupDaySessions'].map(extractFunction).join('\n')}
    return { findLastGroupPerformance, formatLastGroupPerformance, getPreviousGroupDaySessions, formatGroupShortDate };`);
  return factory({ sessionDate }, (clientId) => sessions.filter((session) => session.clientId === clientId), globalThis.VALHALLA.labels);
}

const S = (weight, reps, extra = {}) => ({ setType: 'S', weight, reps, completed: true, ...extra });
const A = (weight) => ({ setType: 'A', weight, reps: null, completed: true });
const HISTORY = [
  { id: 's1', clientId: 'alumno-a', date: '2026-09-28', programDayId: 'dia-piernas', programDayName: 'Lunes — Piernas', exercises: [
    { exerciseName: 'Sentadilla falsa', libraryExerciseId: 'lib-ej-sentadilla', sets: [S(65, 8), S(65, 8), S(65, 8, { rir: 3 })] }] },
  { id: 's2', clientId: 'alumno-a', date: '2026-10-05', programDayId: 'dia-piernas', programDayName: 'Lunes — Piernas', exercises: [
    { exerciseName: 'Sentadilla falsa', libraryExerciseId: 'lib-ej-sentadilla', sets: [A(40), A(50), S(70, 8), S(70, 8), S(70, 7, { rir: 2 }), S(90, 1, { completed: false })] },
    { exerciseName: 'Prensa falsa', sets: [A(100)] }] },
  { id: 's3', clientId: 'alumno-a', date: '2026-10-07', programDayId: 'dia-espalda', programDayName: 'Miércoles — Espalda', exercises: [
    { exerciseName: 'sentadilla FALSA', sets: [S(60, 10), S(62.5, 8), S(62.5, null, { rir: 1 })] }] },
  // Hoy (no cuenta como "vez anterior") y otro alumno con el mismo programa.
  { id: 's4', clientId: 'alumno-a', date: '2026-10-12', programDayId: 'dia-piernas', exercises: [{ exerciseName: 'Sentadilla falsa', sets: [S(100, 5)] }] },
  { id: 's5', clientId: 'alumno-b', date: '2026-10-09', programDayId: 'dia-piernas', exercises: [{ exerciseName: 'Prensa falsa', sets: [S(120, 10)] }] }
];

test('última vez: fecha corta, solo series efectivas hechas, RIR de la última', () => {
  const history = buildHistory(HISTORY, '2026-10-12');
  assert.equal(history.formatGroupShortDate('2026-10-05'), 'lun 5 oct');
  const squat = history.findLastGroupPerformance('alumno-a', { exerciseName: 'Sentadilla falsa', libraryExerciseId: 'lib-ej-sentadilla' }, '2026-10-12');
  // El 7 de octubre la hizo con otro nombre en mayúsculas: también cuenta (pesos distintos agrupados).
  assert.equal(history.formatLastGroupPerformance(squat), 'Última vez (mié 7 oct): 60 kg × 10 / 62.5 kg × 8, — · RIR 1');
  const before7 = history.findLastGroupPerformance('alumno-a', { exerciseName: 'Sentadilla falsa', libraryExerciseId: 'lib-ej-sentadilla' }, '2026-10-07');
  assert.equal(history.formatLastGroupPerformance(before7), 'Última vez (lun 5 oct): 70 kg × 8, 8, 7 · RIR 2');
});

test('última vez: sin historial (o solo aproximaciones) no muestra nada', () => {
  const history = buildHistory(HISTORY, '2026-10-12');
  assert.equal(history.findLastGroupPerformance('alumno-a', { exerciseName: 'Prensa falsa' }, '2026-10-12'), null, 'solo tuvo aproximaciones; lo del otro alumno no cuenta');
  assert.equal(history.findLastGroupPerformance('alumno-a', { exerciseName: 'Remo falso' }, '2026-10-12'), null);
  assert.equal(history.formatLastGroupPerformance(null), '');
});

test('sesión anterior: mismo día del programa, de la más reciente a la más antigua, sin hoy', () => {
  const history = buildHistory(HISTORY, '2026-10-12');
  assert.deepEqual(history.getPreviousGroupDaySessions('alumno-a', { id: 'dia-piernas', name: 'Lunes — Piernas' }).map((session) => session.id), ['s2', 's1']);
  assert.deepEqual(history.getPreviousGroupDaySessions('alumno-a', { id: 'otro-id', name: 'Miércoles — Espalda' }).map((session) => session.id), ['s3'], 'si cambió el id del día, coincide por nombre');
  assert.deepEqual(history.getPreviousGroupDaySessions('alumno-b', { id: 'dia-espalda', name: 'Miércoles — Espalda' }), []);
});
