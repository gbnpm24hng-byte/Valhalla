const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;
require('../assets/js/data.js');
require('../assets/js/labels.js');
require('../assets/js/program-import-core.js');

const data = globalThis.VALHALLA.data;
const labels = globalThis.VALHALLA.labels;
const core = globalThis.VALHALLA.programImport;

let counter = 0;
const deps = () => ({
  createId: (prefix) => `${prefix}-nuevo-${++counter}`,
  now: '2026-10-18T12:00:00.000Z',
  fold: labels.fold,
  categorize: labels.routineCategory,
  normalizeProgram: data.normalizeTrainingProgram
});
const clone = (value) => JSON.parse(JSON.stringify(value));

// Galería falsa: "Sentadilla Falsa" (con mayúsculas), "Prensa falsa" y una borrada.
const LIBRARY = [
  { id: 'lib-sentadilla', name: 'Sentadilla Falsa', primaryMuscle: 'quadriceps', active: true },
  { id: 'lib-prensa', name: 'Prensa falsa', primaryMuscle: 'quadriceps', active: true },
  { id: 'lib-borrado', name: 'Remo borrado falso', primaryMuscle: 'lats', active: false }
];

function validFile(overrides = {}) {
  return {
    format: 'valhalla-programa',
    formatVersion: 1,
    name: 'Ciclo falso',
    objective: 'Fuerza',
    durationWeeks: 9,
    weeklyFrequency: 2,
    days: [
      {
        name: 'Lunes — A',
        exercises: [
          { exerciseName: 'sentadilla falsa', sets: 4, repMin: 6, repMax: 8, targetWeight: 60, restSeconds: 120, notes: 'S1-3: 4×8', approximations: [{ weight: 30, reps: 8 }] },
          { exerciseName: 'Plancha falsa', sets: 3, repMin: null, repMax: null, targetWeight: 0, notes: '40 s' }
        ]
      },
      {
        name: 'Miércoles — B',
        exercises: [
          { exerciseName: 'Prensa falsa', sets: 3, repMin: 10, restSeconds: 0, effectiveSets: [{ weight: 100, reps: 10, rir: 2 }] }
        ]
      }
    ],
    ...overrides
  };
}

const plan = (file, library = LIBRARY) => core.planProgramImport(typeof file === 'string' ? file : JSON.stringify(file), library, deps());

test('formato válido: programa nuevo con ids nuevos, sin alumnos, nombres de día libres y duración', () => {
  const result = plan(validFile());
  assert.equal(result.error, undefined);
  const { program, preview } = result;
  assert.match(program.id, /^program-nuevo-/);
  assert.deepEqual(program.assignedClientIds, []);
  assert.equal(program.startDate, '');
  assert.equal(program.durationWeeks, 9);
  assert.equal(program.weeklyFrequency, 2);
  assert.deepEqual(program.days.map((day) => day.name), ['Lunes — A', 'Miércoles — B']);
  program.days.forEach((day) => {
    assert.match(day.id, /^program-day-nuevo-/);
    day.exercises.forEach((exercise) => assert.match(exercise.id, /^program-exercise-nuevo-/));
  });
  const [squat, plank] = program.days[0].exercises;
  assert.equal(squat.sets, 4);
  assert.equal(squat.repMin, 6);
  assert.equal(squat.repMax, 8);
  assert.equal(squat.targetWeight, 60);
  assert.equal(squat.restSeconds, 120);
  assert.equal(squat.notes, 'S1-3: 4×8');
  assert.deepEqual(squat.approximations.map(({ label, weight, reps }) => ({ label, weight, reps })), [{ label: 'A1', weight: 30, reps: 8 }]);
  assert.equal(squat.category, 'PIERNAS');
  const press = program.days[1].exercises[0];
  assert.equal(press.restSeconds, 0, 'descanso 0 permitido (biseries)');
  assert.equal(press.repMax, 10, 'solo repMin = rango de un número');
  assert.deepEqual(press.effectiveSets.map(({ label, weight, reps, rir }) => ({ label, weight, reps, rir })), [{ label: 'S1', weight: 100, reps: 10, rir: 2 }]);
  assert.equal(plank.restSeconds, 90, 'descanso por defecto');
  assert.equal(preview.name, 'Ciclo falso');
  assert.equal(preview.exerciseCount, 3);
  assert.deepEqual(preview.days.map((day) => day.exercises.map((exercise) => exercise.reps)), [['6-8', null], ['10']]);
});

test('el ejemplo de docs/formato-programa.md es válido', () => {
  const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'formato-programa.md'), 'utf8');
  const json = doc.match(/```json\n([\s\S]*?)```/);
  assert.ok(json, 'falta el ejemplo en el documento');
  const result = core.planProgramImport(json[1], [], deps());
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.program.days.length, 3);
  assert.equal(data.normalizeTrainingProgram(result.program).days[0].name, 'Lunes — A');
});

test('formato inválido: error claro y ningún programa', () => {
  const cases = [
    ['no es json', /no es un JSON válido/],
    [JSON.stringify([1, 2]), /objeto con el programa/],
    [{ ...validFile(), format: undefined }, /no es un programa de Valhalla/],
    [validFile({ formatVersion: 2 }), /Versión de formato no soportada/],
    [validFile({ name: '  ' }), /"name" no puede estar vacío/],
    [validFile({ durationWeeks: undefined }), /falta "durationWeeks"/],
    [validFile({ durationWeeks: 0 }), /"durationWeeks" debe ser un número entero entre 1 y 52/],
    [validFile({ days: [] }), /"days" debe ser una lista con al menos un día/],
    [validFile({ weeklyFrequency: 3 }), /mayor que la cantidad de días/],
    [validFile({ alumnos: ['x'] }), /campo desconocido "alumnos"/],
    [validFile({ days: [{ name: 'Lunes — A', exercises: [] }] }), /Día 1 \("Lunes — A"\): "exercises" debe ser una lista/],
    [validFile({ days: [{ name: 'Lunes', exercises: [{ exerciseName: 'X', sets: '3' }] }] }), /Día 1 \("Lunes"\), ejercicio 1: "sets" debe ser un número entero/],
    [validFile({ days: [{ name: 'Lunes', exercises: [{ exerciseName: 'X', sets: 3, repmin: 8 }] }] }), /campo desconocido "repmin"/],
    [validFile({ days: [{ name: 'Lunes', exercises: [{ exerciseName: 'X', sets: 3, repMin: 10, repMax: 8 }] }] }), /"repMax" \(8\) es menor que "repMin" \(10\)/],
    [validFile({ days: [{ name: 'Lunes', exercises: [{ exerciseName: 'X', sets: 3, targetWeight: -5 }] }] }), /"targetWeight" debe ser un número de kg/],
    [validFile({ days: [{ name: 'Lunes', exercises: [{ exerciseName: 'X', sets: 3, effectiveSets: [{ reps: 8, rir: 11 }] }] }] }), /effectiveSets 1: "rir" debe ser un número entero entre 0 y 10/]
  ];
  cases.forEach(([file, pattern]) => {
    const result = plan(file);
    assert.equal(result.program, undefined, `no debe armar programa: ${JSON.stringify(file).slice(0, 60)}`);
    assert.match(result.error, pattern);
  });
});

test('repeticiones vacías (series por tiempo): quedan null y se conservan al guardar y volver a cargar', () => {
  const { program, preview } = plan(validFile());
  const plank = program.days[0].exercises[1];
  assert.equal(plank.repMin, null);
  assert.equal(plank.repMax, null);
  assert.equal(plank.notes, '40 s');
  assert.equal(preview.days[0].exercises[1].reps, null);
  // Sin los campos también quedan vacías.
  const noReps = plan(validFile({ days: [{ name: 'Lunes', exercises: [{ exerciseName: 'Plancha falsa', sets: 3 }] }], weeklyFrequency: 1 }));
  assert.equal(noReps.program.days[0].exercises[0].repMin, null);
  // repMax sin repMin es un error (no se adivina).
  assert.match(plan(validFile({ days: [{ name: 'Lunes', exercises: [{ exerciseName: 'X', sets: 3, repMax: 8 }] }], weeklyFrequency: 1 })).error, /"repMax" sin "repMin"/);
  // Ida y vuelta por el respaldo/normalización de data.js.
  const state = data.importState(JSON.stringify({ trainingsV08: { programs: [program] } }));
  const reloaded = state.trainingsV08.programs[0].days[0].exercises[1];
  assert.equal(reloaded.repMin, null);
  assert.equal(reloaded.repMax, null);
});

test('ejercicio que no está en la galería: queda sin enlace, se avisa y la galería no cambia', () => {
  const library = clone(LIBRARY);
  const before = clone(library);
  const file = validFile();
  file.days[1].exercises.push({ exerciseName: 'Remo borrado falso', sets: 3, repMin: 8 });
  file.days[1].exercises.push({ exerciseName: 'plancha FALSA', sets: 2, repMin: 8 });
  const { program, preview } = plan(file, library);
  const [squat, plank] = program.days[0].exercises;
  assert.equal(squat.libraryExerciseId, 'lib-sentadilla', 'enlaza sin importar mayúsculas');
  assert.equal(squat.exerciseName, 'Sentadilla Falsa', 'usa el nombre de la galería');
  assert.equal(plank.libraryExerciseId, '');
  assert.equal(plank.exerciseName, 'Plancha falsa');
  const deleted = program.days[1].exercises[1];
  assert.equal(deleted.libraryExerciseId, '', 'un ejercicio borrado de la galería no se enlaza');
  assert.deepEqual(preview.missing, ['Plancha falsa', 'Remo borrado falso'], 'cada faltante una vez');
  assert.deepEqual(preview.days[0].exercises.map((exercise) => exercise.linked), [true, false]);
  assert.deepEqual(library, before);
  // Tildes: "Sentadilla Fálsa" también enlaza.
  const accent = plan(validFile({ weeklyFrequency: 1, days: [{ name: 'Lunes', exercises: [{ exerciseName: 'Sentadilla Fálsa', sets: 3, repMin: 5 }] }] }), library);
  assert.equal(accent.program.days[0].exercises[0].libraryExerciseId, 'lib-sentadilla');
});

test('después de importar todo lo demás queda idéntico', () => {
  const state = data.importState(JSON.stringify({
    clients: [{ id: 'cli-a', full_name: 'Alumna Uno Falsa', client_status: 'active', active: true }],
    exerciseLibrary: LIBRARY,
    trainingsV08: {
      plans: [{ id: 'plan-falso', name: 'Plantilla falsa' }],
      sessions: [{ id: 'ses-falsa', clientId: 'cli-a', date: '2026-10-12', exercises: [] }],
      programs: [{ id: 'prog-existente', name: 'Programa existente', assignedClientIds: ['cli-a'], days: [{ id: 'dia-x', name: 'Lunes — X', exercises: [{ id: 'ej-x', exerciseName: 'Prensa falsa', sets: 3, repMin: 8, repMax: 10 }] }] }],
      assignments: [{ id: 'asig-a', programId: 'prog-existente', clientId: 'cli-a', days: [{ id: 'dia-x', name: 'Lunes — X', exercises: [] }] }],
      clientOverrides: [{ id: 'cambio-a', clientId: 'cli-a', programId: 'prog-existente', dayId: 'dia-x', kind: 'add', scope: 'forward', date: '2026-10-01', exercise: { exerciseName: 'Plancha falsa', sets: 3 } }]
    }
  }));
  const before = clone(state);
  const { program } = plan(validFile(), state.exerciseLibrary);
  const next = { ...state, trainingsV08: core.addImportedProgram(state.trainingsV08, program) };

  assert.deepEqual(state, before, 'el estado recibido no se modifica');
  assert.equal(next.trainingsV08.programs.length, before.trainingsV08.programs.length + 1);
  assert.equal(next.trainingsV08.programs[0].id, program.id);
  const { trainingsV08: nextV08, ...nextRest } = clone(next);
  const { trainingsV08: beforeV08, ...beforeRest } = before;
  assert.deepEqual(nextRest, beforeRest, 'clientes, galería y demás claves iguales');
  assert.deepEqual(nextV08.programs.slice(1), beforeV08.programs, 'programas existentes iguales');
  const { programs: _p1, ...nextV08Rest } = nextV08;
  const { programs: _p2, ...beforeV08Rest } = beforeV08;
  assert.deepEqual(nextV08Rest, beforeV08Rest, 'asignaciones, sesiones, plantillas y cambios por alumno iguales');

  // Tras guardar y volver a cargar, lo existente sigue igual y el programa nuevo sigue sin alumnos.
  const reloaded = data.importState(JSON.stringify(next));
  const reloadedBefore = data.importState(JSON.stringify(before));
  assert.deepEqual(reloaded.trainingsV08.programs.slice(1), reloadedBefore.trainingsV08.programs);
  assert.deepEqual(reloaded.trainingsV08.assignments, reloadedBefore.trainingsV08.assignments);
  assert.deepEqual(reloaded.trainingsV08.clientOverrides, reloadedBefore.trainingsV08.clientOverrides);
  assert.deepEqual(reloaded.clients, reloadedBefore.clients);
  assert.deepEqual(reloaded.exerciseLibrary, reloadedBefore.exerciseLibrary);
  assert.deepEqual(reloaded.trainingsV08.programs[0].assignedClientIds, []);
});

test('addImportedProgram rechaza un id repetido', () => {
  const v08 = { programs: [{ id: 'prog-1' }], assignments: [] };
  assert.throws(() => core.addImportedProgram(v08, { id: 'prog-1' }), /id nuevo/);
  assert.throws(() => core.addImportedProgram(v08, null), /id nuevo/);
});

test('index.html carga el núcleo de importación antes de app.js y el service worker lo guarda', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(html.indexOf('program-import-core.js') > 0 && html.indexOf('program-import-core.js') < html.indexOf('assets/js/app.js'));
  assert.match(html, /id="programImportBtn"/);
  const sw = fs.readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8');
  assert.match(sw, /'\.\/assets\/js\/program-import-core\.js'/);
});
