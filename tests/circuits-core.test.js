const test = require('node:test');
const assert = require('node:assert/strict');

// v0.9.45 · Bloques fase 2: circuitos. Solo datos falsos.
global.window = global;
require('../assets/js/circuits-core.js');
require('../assets/js/blocks-core.js');
require('../assets/js/data.js');
require('../assets/js/publish-core.js');
require('../assets/js/student-import-core.js');

const circuits = globalThis.VALHALLA.circuitsCore;
const blocks = globalThis.VALHALLA.blocksCore;
const data = globalThis.VALHALLA.data;
const publish = globalThis.VALHALLA.publishCore;
const studentImport = globalThis.VALHALLA.studentImportCore;

const clone = (value) => JSON.parse(JSON.stringify(value));
const ex = (id, extra = {}) => ({ id, exerciseName: `Ejercicio falso ${id}`, sets: 3, repMin: 8, repMax: 12, ...extra });
const station = (name, extra = {}) => ({ id: `st-${name}`, name, ...extra });
const amrap = (extra = {}) => circuits.createCircuit({ id: 'cir', format: 'amrap', minutes: 12, stations: [station('Burpee falso', { quantity: 10, unit: 'reps' }), station('200 m remo')], ...extra });

// ---------------------------------------------------------------------------
// Formatos y datos
// ---------------------------------------------------------------------------

test('cada formato guarda solo sus datos, con valores por defecto', () => {
  assert.deepEqual(circuits.createCircuit({ id: 'a', format: 'rounds' }), { id: 'a', type: 'circuit', format: 'rounds', rounds: 3, restSeconds: 60, at: 999, stations: [] });
  assert.deepEqual(circuits.createCircuit({ id: 'b', format: 'emom' }), { id: 'b', type: 'circuit', format: 'emom', minutes: 10, at: 999, stations: [] });
  assert.deepEqual(circuits.createCircuit({ id: 'c', format: 'amrap' }), { id: 'c', type: 'circuit', format: 'amrap', minutes: 12, at: 999, stations: [] });
  assert.deepEqual(circuits.createCircuit({ id: 'd', format: 'tabata' }), { id: 'd', type: 'circuit', format: 'tabata', rounds: 8, workSeconds: 20, pauseSeconds: 10, at: 999, stations: [] });
  assert.deepEqual(circuits.createCircuit({ id: 'e', format: 'fortime' }), { id: 'e', type: 'circuit', format: 'fortime', rounds: 3, at: 999, stations: [] });
  assert.equal(circuits.createCircuit({ id: 'e', format: 'fortime', capMinutes: 15 }).capMinutes, 15);
  // Datos de otro formato se descartan; formato desconocido = no es un circuito.
  assert.equal(circuits.normalizeCircuit({ id: 'x', type: 'circuit', format: 'amrap', minutes: 12, restSeconds: 30 }).restSeconds, undefined);
  assert.equal(circuits.normalizeCircuit({ id: 'x', type: 'circuit', format: 'crossfit' }), null);
  assert.equal(circuits.normalizeCircuit({ type: 'circuit', format: 'amrap' }), null);
});

test('estaciones: de la galería o texto libre, con cantidad en reps, segundos o metros', () => {
  const c = circuits.normalizeCircuit({ id: 'c', type: 'circuit', format: 'rounds', stations: [
    { name: '  Sentadilla   falsa ', libraryExerciseId: 'lib-1', quantity: '15', unit: 'reps' },
    { name: 'Plancha falsa', quantity: 30, unit: 'seconds' },
    { name: 'Remo falso', quantity: 200, unit: 'meters' },
    { name: '200 m remo' },
    { name: '' },
    { name: 'Saltos', quantity: 10, unit: 'kilos' }
  ] });
  assert.deepEqual(c.stations.map(circuits.formatStation), ['Sentadilla falsa · 15 reps', 'Plancha falsa · 30 s', 'Remo falso · 200 m', '200 m remo', 'Saltos · × 10']);
  assert.equal(c.stations[0].libraryExerciseId, 'lib-1');
  assert.equal(new Set(c.stations.map((item) => item.id)).size, c.stations.length, 'ids únicos');
});

test('títulos: "CIRCUITO · AMRAP 12 MIN" y nombre corto para Progreso', () => {
  assert.equal(circuits.formatTitle(amrap()), 'CIRCUITO · AMRAP 12 MIN');
  assert.equal(circuits.formatTitle(circuits.createCircuit({ id: 'e', format: 'emom', minutes: 10 })), 'CIRCUITO · EMOM 10 MIN');
  assert.equal(circuits.formatTitle(circuits.createCircuit({ id: 'r', format: 'rounds', rounds: 4 })), 'CIRCUITO · 4 VUELTAS');
  assert.equal(circuits.formatTitle(circuits.createCircuit({ id: 't', format: 'tabata' })), 'CIRCUITO · TABATA 8 RONDAS (20/10)');
  assert.equal(circuits.formatTitle(circuits.createCircuit({ id: 'f', format: 'fortime', rounds: 3 })), 'CIRCUITO · POR TIEMPO · 3 VUELTAS');
  assert.equal(circuits.formatDetail(circuits.createCircuit({ id: 'f', format: 'fortime', capMinutes: 15 })), 'tope 15 min');
  assert.equal(circuits.formatShort(amrap()), 'AMRAP 12');
});

// ---------------------------------------------------------------------------
// Reloj (tiempo simulado: se le pasa el tiempo transcurrido)
// ---------------------------------------------------------------------------

test('reloj: cuenta regresiva en AMRAP, EMOM y Tabata; cronómetro en Por tiempo; Vueltas sin reloj', () => {
  const a = amrap();
  assert.equal(circuits.clockMode(a), 'down');
  assert.equal(circuits.clockState(a, 0).display, '12:00');
  assert.equal(circuits.clockState(a, 61500).display, '10:59');
  assert.deepEqual([circuits.clockState(a, 720000).display, circuits.clockState(a, 720000).finished], ['00:00', true]);
  assert.equal(circuits.clockState(a, 9e6).display, '00:00', 'no baja de cero');

  const e = circuits.createCircuit({ id: 'e', format: 'emom', minutes: 10 });
  const minute3 = circuits.clockState(e, 2 * 60000 + 18000);
  assert.deepEqual([minute3.display, minute3.minute, minute3.phaseLeft], ['07:42', 3, 42]);

  const t = circuits.createCircuit({ id: 't', format: 'tabata' });
  assert.equal(circuits.clockTotalSeconds(t), 240);
  const work = circuits.clockState(t, 6000);
  assert.deepEqual([work.round, work.phase, work.phaseLeft], [1, 'work', 14]);
  const pause = circuits.clockState(t, 22000);
  assert.deepEqual([pause.round, pause.phase, pause.phaseLeft], [1, 'pause', 8]);
  const round2 = circuits.clockState(t, 31000);
  assert.deepEqual([round2.round, round2.phase], [2, 'work']);

  const f = circuits.createCircuit({ id: 'f', format: 'fortime' });
  assert.equal(circuits.clockMode(f), 'up');
  assert.equal(circuits.clockState(f, 754000).display, '12:34');
  assert.equal(circuits.clockState(f, 754000).finished, false, 'sin tope no termina');
  const capped = circuits.createCircuit({ id: 'f2', format: 'fortime', capMinutes: 10 });
  assert.deepEqual([circuits.clockState(capped, 700000).display, circuits.clockState(capped, 700000).finished], ['10:00', true]);

  assert.equal(circuits.clockMode(circuits.createCircuit({ id: 'r', format: 'rounds' })), 'none');
});

test('reloj con Pausa y Reiniciar', () => {
  let timer = circuits.timerReset();
  timer = circuits.timerStart(timer, 1000);
  assert.equal(circuits.timerElapsed(timer, 11000), 10000);
  timer = circuits.timerPause(timer, 11000);
  assert.equal(circuits.timerElapsed(timer, 99000), 10000, 'en pausa no avanza');
  timer = circuits.timerStart(timer, 100000);
  assert.equal(circuits.timerElapsed(timer, 105000), 15000);
  assert.deepEqual(circuits.timerReset(), { running: false, startedAt: 0, accumulatedMs: 0 });
  assert.equal(circuits.parseClock('12:34'), 754);
  assert.equal(circuits.parseClock('754'), 754);
  assert.equal(circuits.parseClock('12:75'), null);
  assert.equal(circuits.parseClock(''), null);
});

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------

test('resultado por formato: "5 rondas + 12", vueltas, Completado o rondas, mm:ss y Hecho sin datos', () => {
  const a = amrap();
  assert.equal(circuits.formatResult(a, { rounds: 5, reps: 12 }), '5 rondas + 12');
  assert.equal(circuits.formatResult(a, { rounds: 5, reps: 0 }), '5 rondas');
  assert.equal(circuits.formatResult(circuits.createCircuit({ id: 'r', format: 'rounds' }), { rounds: 3 }), '3 vueltas');
  const e = circuits.createCircuit({ id: 'e', format: 'emom', minutes: 10 });
  assert.equal(circuits.formatResult(e, { completed: true }), 'Completado');
  assert.equal(circuits.formatResult(e, { rounds: 8 }), '8 de 10 rondas');
  assert.equal(circuits.formatResult(circuits.createCircuit({ id: 'f', format: 'fortime' }), { seconds: 754 }), '12:34');
  assert.equal(circuits.formatResult(a, { noData: true, rounds: 9 }), 'Hecho sin datos');
  assert.deepEqual(circuits.normalizeResult('amrap', { rounds: '5', reps: '12', seconds: 30, note: '  buena  ' }), { rounds: 5, reps: 12, note: 'buena' });
  assert.equal(circuits.resultHasData(circuits.normalizeResult('amrap', {})), false);
});

test('entrada de la sesión y línea de Progreso: "AMRAP 12 · 5 rondas + 12"', () => {
  const now = new Date('2026-11-06T12:00:00Z');
  const entry = circuits.buildSessionEntry(amrap(), { rounds: 5, reps: 12, note: 'Sin pausas' }, { now, loggedBy: 'coach' });
  assert.deepEqual(entry, { blockId: 'cir', format: 'amrap', label: 'AMRAP 12', rounds: 5, reps: 12, note: 'Sin pausas', loggedBy: 'coach', savedAt: now.toISOString() });
  assert.equal(circuits.formatSessionEntry(entry), 'AMRAP 12 · 5 rondas + 12');
  const tabata = circuits.buildSessionEntry(circuits.createCircuit({ id: 't', format: 'tabata' }), { rounds: 6 }, { now });
  assert.equal(circuits.formatSessionEntry(tabata), 'Tabata 8 · 6 de 8 rondas');
  assert.equal(circuits.buildSessionEntry(amrap(), {}, { now }), null, 'sin nada que guardar');
});

test('alumno: S1 y S2 en student_sets ida y vuelta para cada formato', () => {
  const cases = [
    [circuits.createCircuit({ id: 'r', format: 'rounds' }), { rounds: 3 }, [{ setNumber: 1, reps: 3 }]],
    [amrap(), { rounds: 5, reps: 12 }, [{ setNumber: 1, reps: 5 }, { setNumber: 2, reps: 12 }]],
    [circuits.createCircuit({ id: 'e', format: 'emom', minutes: 10 }), { completed: true }, [{ setNumber: 1, reps: 10 }]],
    [circuits.createCircuit({ id: 'e', format: 'emom', minutes: 10 }), { rounds: 7 }, [{ setNumber: 1, reps: 7 }]],
    [circuits.createCircuit({ id: 't', format: 'tabata' }), { completed: true }, [{ setNumber: 1, reps: 8 }]],
    [circuits.createCircuit({ id: 'f', format: 'fortime' }), { seconds: 1534 }, [{ setNumber: 1, reps: 25 }, { setNumber: 2, reps: 34 }]]
  ];
  cases.forEach(([circuit, result, rows]) => {
    assert.deepEqual(circuits.resultToStudentSets(circuit, result), rows, circuit.format);
    const byNumber = Object.fromEntries(rows.map((row) => [row.setNumber, row.reps]));
    assert.deepEqual(circuits.studentSetsToResult(circuit, byNumber), result, `${circuit.format} vuelta`);
  });
  {
    // Por tiempo largo (más de 1000 s) cabe igual: minutos y segundos por separado.
    const rows = circuits.resultToStudentSets(circuits.createCircuit({ id: 'f', format: 'fortime' }), { seconds: 3725 });
    assert.ok(rows.every((row) => row.reps <= 1000 && row.setNumber <= circuits.STUDENT_SETS));
  }
});

// ---------------------------------------------------------------------------
// Día del programa (blocks-core)
// ---------------------------------------------------------------------------

test('circuito en el día: se agrega al final, es un tramo y se mueve entero', () => {
  let day = { id: 'd', exercises: [ex('e1'), ex('e2')] };
  day = blocks.addCircuit(day, amrap());
  assert.equal(day.blocks[0].at, 2);
  assert.deepEqual(blocks.segments(day).map((part) => part.kind), ['single', 'single', 'circuit']);
  // Sube dos lugares: queda al principio.
  day = blocks.moveSegment(day, 2, -1);
  day = blocks.moveSegment(day, 1, -1);
  assert.equal(day.blocks[0].at, 0);
  assert.deepEqual(blocks.segments(day).map((part) => part.kind === 'circuit' ? 'C' : part.exercise.id), ['C', 'e1', 'e2']);
  assert.deepEqual(day.exercises.map((item) => item.id), ['e1', 'e2'], 'los ejercicios no cambian');
  // Un ejercicio que baja pasa por encima del circuito.
  day = blocks.moveSegment(day, 1, -1);
  assert.deepEqual(blocks.segments(day).map((part) => part.kind === 'circuit' ? 'C' : part.exercise.id), ['e1', 'C', 'e2']);
  // Quitar el ejercicio de antes: el circuito queda primero.
  day = blocks.removeExercise(day, 0);
  assert.deepEqual(blocks.segments(day).map((part) => part.kind === 'circuit' ? 'C' : part.exercise.id), ['C', 'e2']);
  // Cambiar y quitar.
  day = blocks.replaceCircuit(day, { ...day.blocks[0], minutes: 15 });
  assert.equal(circuits.formatTitle(day.blocks[0]), 'CIRCUITO · AMRAP 15 MIN');
  assert.equal(day.blocks[0].at, 0);
  day = blocks.removeCircuit(day, 'cir');
  assert.equal(day.blocks, undefined, 'sin bloques, el día queda sin la clave');
});

test('circuito nunca queda dentro de una superserie ni tiene ejercicios', () => {
  const day = blocks.normalizeDayBlocks(
    [ex('a', { blockId: 'ss' }), ex('b', { blockId: 'ss' }), ex('c', { blockId: 'cir' })],
    [{ id: 'ss', type: 'superset', rounds: 3, restSeconds: 60 }, { ...amrap(), at: 1 }]
  );
  assert.equal(day.blocks.find((block) => block.id === 'cir').at, 2, 'pasa al final de la superserie');
  assert.equal(day.exercises[2].blockId, undefined, 'un ejercicio no pertenece a un circuito');
  assert.equal(blocks.blockLetters({ exercises: day.exercises, blocks: day.blocks }).ss, 'A');
  assert.equal(blocks.blockLetters({ exercises: day.exercises, blocks: day.blocks }).cir, undefined);
});

test('data.js: programa viejo igual, programa con circuito estable y sesión con circuits', () => {
  const old = { id: 'p', name: 'Programa falso', createdAt: 'x', updatedAt: 'x', days: [{ id: 'd', name: 'Día A', exercises: [ex('e1')] }] };
  const normalizedOld = data.normalizeTrainingProgram(clone(old));
  assert.equal('blocks' in normalizedOld.days[0], false);
  const program = data.normalizeTrainingProgram({ ...clone(old), days: [{ id: 'd', name: 'Día A', exercises: [ex('e1')], blocks: [{ ...amrap(), at: 0 }] }] });
  assert.equal(program.days[0].blocks[0].type, 'circuit');
  assert.equal(program.days[0].blocks[0].stations.length, 2);
  assert.deepEqual(data.normalizeTrainingProgram(clone(program)), program, 'normalizar dos veces no cambia nada');
  // Un día solo con circuito (sin ejercicios) también vale.
  const onlyCircuit = data.normalizeTrainingProgram({ ...clone(old), days: [{ id: 'd', name: 'Día B', exercises: [], blocks: [amrap()] }] });
  assert.equal(onlyCircuit.days[0].blocks[0].at, 0);

  const state = data.importState(JSON.stringify({ clients: [], trainingsV08: { sessions: [
    { id: 's-viejo', clientId: 'c', date: '2026-11-01', exercises: [] },
    { id: 's-nuevo', clientId: 'c', date: '2026-11-02', exercises: [], circuits: [{ blockId: 'cir', format: 'amrap', label: 'AMRAP 12', rounds: '5', reps: 12, extra: 'se conserva' }, { blockId: 'x', format: 'otro' }] }
  ] } }));
  const sessions = state.trainingsV08.sessions;
  assert.equal('circuits' in sessions.find((item) => item.id === 's-viejo'), false);
  const circuitsSaved = sessions.find((item) => item.id === 's-nuevo').circuits;
  assert.deepEqual(circuitsSaved, [{ blockId: 'cir', format: 'amrap', label: 'AMRAP 12', extra: 'se conserva', rounds: 5, reps: 12 }]);
});

// ---------------------------------------------------------------------------
// Publicar al alumno
// ---------------------------------------------------------------------------

test('publicar: el circuito va en su lugar de day.exercises, con lista cerrada y sets 2', () => {
  const library = [{ id: 'lib-1', name: 'Burpee falso', videoUrl: 'https://video.example.invalid/burpee', active: true }];
  const day = blocks.moveSegment(blocks.addCircuit({ id: 'd', name: 'Día A', exercises: [ex('e1'), ex('e2')] }, amrap({ name: 'Final falso', stations: [station('Burpee falso', { quantity: 10, unit: 'reps', libraryExerciseId: 'lib-1' }), station('200 m remo')] })), 2, -1);
  const published = publish.buildPublishedProgram({ id: 'as', programName: 'Programa falso', days: [day] }, library);
  const entries = published.days[0].exercises;
  assert.deepEqual(entries.map((item) => item.id), ['e1', 'cir', 'e2']);
  const circuit = entries[1];
  assert.equal(circuit.name, 'Circuito · AMRAP 12 min');
  assert.equal(circuit.sets, 2);
  assert.deepEqual(circuit.circuit, {
    format: 'amrap', name: 'Final falso', minutes: 12,
    stations: [{ name: 'Burpee falso', quantity: 10, unit: 'reps', videoUrl: 'https://video.example.invalid/burpee' }, { name: '200 m remo' }]
  });
  assert.equal(published.days[0].blocks, undefined, 'el circuito no va en blocks publicados');
  assert.deepEqual(publish.findForbiddenKeys(published), []);
  // Un día sin circuitos se publica igual que antes.
  const plain = publish.buildPublishedProgram({ id: 'as', days: [{ id: 'd', exercises: [ex('e1')] }] }, []);
  assert.deepEqual(plain.days[0].exercises.map((item) => Object.keys(item).sort()), [['approximations', 'effectiveSets', 'id', 'name', 'repMax', 'repMin', 'sets', 'targetWeight', 'techniqueNotes']]);
});

test('publicar progreso: "AMRAP 12" con su resultado y sin la nota del entrenador', () => {
  const session = { id: 's', date: '2026-11-02', title: 'Modo Grupo', programDayName: 'Día A', exercises: [], circuits: [circuits.buildSessionEntry(amrap(), { rounds: 5, reps: 12, note: 'Interno: rodilla' })] };
  const { record } = publish.buildPublishedSession(session);
  assert.deepEqual(record.circuits, [{ label: 'AMRAP 12', result: '5 rondas + 12' }]);
  const publication = publish.buildPublication({ id: 'as', days: [] }, [session], []);
  assert.equal(publication.progress.length, 1, 'una sesión solo con circuito también se publica');
  assert.equal(JSON.stringify(publication).includes('rodilla'), false);
  const { record: plain } = publish.buildPublishedSession({ id: 's2', exercises: [] });
  assert.equal('circuits' in plain, false);
});

// ---------------------------------------------------------------------------
// Traer registros del alumno
// ---------------------------------------------------------------------------

test('Traer registros: S1 y S2 del circuito van a session.circuits; dos veces no duplica; lo del entrenador gana', () => {
  const day = blocks.addCircuit({ id: 'd', name: 'Día A', exercises: [ex('e1')] }, amrap());
  const state = { clients: [{ id: 'alumno-falso' }, { id: 'alumno-dos' }], trainingsV08: { sessions: [], assignments: [{ id: 'as', programId: 'p', days: [day] }] } };
  const row = (n, reps, client = 'alumno-falso') => ({ id: `${client}-${n}`, owner_id: 'coach', auth_user_id: `auth-${client}`, client_id: client, assignment_id: 'as', session_date: '2026-11-05', day_id: 'd', exercise_id: 'cir', set_type: 'S', set_number: n, weight: null, reps, rir: null });
  let counter = 0;
  const deps = { coachId: 'coach', createId: (prefix) => `${prefix}-${++counter}`, now: new Date('2026-11-05T15:00:00Z') };
  const summary = studentImport.mergeStudentSets(state, [row(1, 5), row(2, 12)], deps);
  assert.equal(summary.added, 2);
  const session = state.trainingsV08.sessions[0];
  assert.deepEqual(session.exercises, [], 'no se crea un ejercicio');
  assert.equal(session.circuits.length, 1);
  assert.equal(circuits.formatSessionEntry(session.circuits[0]), 'AMRAP 12 · 5 rondas + 12');
  assert.equal(session.circuits[0].loggedBy, 'student');
  assert.equal(studentImport.countStudentCircuits(session), 1);
  assert.equal(studentImport.countStudentSets(session), 0, 'no son series');

  const again = studentImport.mergeStudentSets(state, [row(1, 5), row(2, 12)], deps);
  assert.equal(again.unchanged, 2);
  assert.equal(state.trainingsV08.sessions[0].circuits.length, 1);

  // El entrenador corrige en Modo Grupo: lo del alumno ya no lo pisa.
  session.circuits = [circuits.buildSessionEntry(amrap(), { rounds: 6, reps: 0 }, { loggedBy: 'coach' })];
  const kept = studentImport.mergeStudentSets(state, [row(1, 7), row(2, 1)], deps);
  assert.equal(kept.keptCoach, 2);
  assert.equal(circuits.formatSessionEntry(session.circuits[0]), 'AMRAP 12 · 6 rondas');
});

// ---------------------------------------------------------------------------
// Importar programa (JSON) con circuitos
// ---------------------------------------------------------------------------

require('../assets/js/labels.js');
require('../assets/js/program-import-core.js');
require('../assets/js/group-draft-core.js');
const programImport = globalThis.VALHALLA.programImport;
const groupDraft = globalThis.VALHALLA.groupDraftCore;
const labels = globalThis.VALHALLA.labels;
let importCounter = 0;
const importDeps = () => ({
  createId: (prefix) => `${prefix}-falso-${++importCounter}`,
  now: '2026-11-01T12:00:00.000Z',
  fold: labels.fold,
  categorize: labels.routineCategory,
  normalizeProgram: data.normalizeTrainingProgram
});
const programFile = (days) => JSON.stringify({ format: 'valhalla-programa', name: 'Programa falso', durationWeeks: 4, days });
const FAKE_LIBRARY = [{ id: 'lib-burpee', name: 'Burpee Falso', primaryMuscle: 'quadriceps', active: true }];

test('importar: un circuito de cada formato, con su lugar, estaciones de la galería y texto libre', () => {
  const file = programFile([{
    name: 'Lunes — A',
    exercises: [{ exerciseName: 'Sentadilla falsa', sets: 3, repMin: 8 }, { exerciseName: 'Remo falso', sets: 3, repMin: 10 }],
    blocks: [
      { id: 'C1', type: 'circuit', format: 'amrap', name: 'Final falso', minutes: 12, at: 0,
        stations: [{ exerciseName: 'burpee falso', quantity: 10, unit: 'reps' }, { exerciseName: '200 m remo' }] },
      { id: 'C2', type: 'circuit', format: 'rounds', at: 1, stations: [{ exerciseName: 'Salto falso', quantity: 20 }] },
      { id: 'C3', type: 'circuit', format: 'emom', minutes: 10, stations: [{ exerciseName: 'Swing falso', quantity: 15, unit: 'reps' }] },
      { id: 'C4', type: 'circuit', format: 'tabata', stations: [{ exerciseName: 'Escalador falso' }] },
      { id: 'C5', type: 'circuit', format: 'fortime', rounds: 5, capMinutes: 20, stations: [{ exerciseName: 'Remo falso', quantity: 500, unit: 'meters' }] }
    ]
  }]);
  const result = programImport.planProgramImport(file, FAKE_LIBRARY, importDeps());
  assert.equal(result.error, undefined);
  const day = result.program.days[0];
  assert.equal(day.exercises.length, 2);
  const byFormat = Object.fromEntries(day.blocks.map((block) => [block.format, block]));
  assert.deepEqual(byFormat.amrap.stations, [
    { id: 'station-1', name: 'Burpee Falso', libraryExerciseId: 'lib-burpee', quantity: 10, unit: 'reps' },
    { id: 'station-2', name: '200 m remo' }
  ]);
  assert.equal(byFormat.amrap.name, 'Final falso');
  assert.equal(byFormat.amrap.at, 0);
  assert.equal(byFormat.rounds.at, 1);
  assert.equal(byFormat.emom.at, 2);
  assert.deepEqual([byFormat.rounds.rounds, byFormat.rounds.restSeconds], [3, 60]);
  assert.deepEqual([byFormat.tabata.rounds, byFormat.tabata.workSeconds, byFormat.tabata.pauseSeconds], [8, 20, 10]);
  assert.deepEqual([byFormat.fortime.rounds, byFormat.fortime.capMinutes], [5, 20]);
  assert.ok(day.blocks.every((block) => block.type === 'circuit' && /^program-circuit-/.test(block.id)));
  assert.ok(day.exercises.every((exercise) => !exercise.blockId));
  // Vista previa: circuitos con su lugar y si la estación está en la galería; no cuentan como "no está en la galería".
  assert.equal(result.preview.circuitCount, 5);
  assert.deepEqual(result.preview.days[0].circuits.map((item) => [item.block.format, item.at]), [['amrap', 0], ['rounds', 1], ['emom', 2], ['tabata', 2], ['fortime', 2]]);
  assert.deepEqual(result.preview.days[0].circuits[0].stations, [{ name: 'Burpee Falso', linked: true }, { name: '200 m remo', linked: false }]);
  assert.deepEqual(result.preview.missing, ['Sentadilla falsa', 'Remo falso']);
  // Guardar y volver a cargar: el circuito queda igual.
  const reloaded = data.normalizeTrainingProgram(clone(result.program));
  assert.deepEqual(reloaded.days[0].blocks, day.blocks);
});

test('importar: día solo con un circuito y circuito junto a una superserie', () => {
  const onlyCircuit = programImport.planProgramImport(programFile([{ name: 'Sábado', exercises: [], blocks: [{ id: 'X', type: 'circuit', format: 'amrap', stations: [{ exerciseName: 'Burpee falso' }] }] }]), [], importDeps());
  assert.equal(onlyCircuit.error, undefined);
  assert.equal(onlyCircuit.program.days[0].exercises.length, 0);
  assert.equal(onlyCircuit.program.days[0].blocks[0].minutes, 12);
  const mixed = programImport.planProgramImport(programFile([{
    name: 'Martes',
    exercises: [{ exerciseName: 'a falso', repMin: 8, block: 'A' }, { exerciseName: 'b falso', repMin: 8, block: 'A' }],
    blocks: [{ id: 'A', type: 'superset', rounds: 3 }, { id: 'C', type: 'circuit', format: 'emom', minutes: 8, at: 2, stations: [{ exerciseName: 'Swing falso' }] }]
  }]), [], importDeps());
  assert.equal(mixed.error, undefined);
  const day = mixed.program.days[0];
  assert.deepEqual(day.blocks.map((block) => block.type), ['superset', 'circuit']);
  assert.deepEqual(day.exercises.map((exercise) => exercise.sets), [3, 3]);
  assert.equal(day.blocks[1].at, 2);
});

test('importar: errores claros de circuitos', () => {
  const err = (day) => programImport.parseProgramFile(programFile([day])).error || '';
  const one = [{ exerciseName: 'a falso', sets: 3, repMin: 8 }];
  const circuit = (extra) => ({ id: 'C', type: 'circuit', format: 'amrap', stations: [{ exerciseName: 'Burpee falso' }], ...extra });
  assert.match(err({ name: 'D', exercises: one, blocks: [circuit({ format: 'crossfit' })] }), /"format" debe ser uno de/);
  assert.match(err({ name: 'D', exercises: one, blocks: [circuit({ rounds: 3 })] }), /"rounds" no corresponde al formato "amrap"/);
  assert.match(err({ name: 'D', exercises: one, blocks: [circuit({ minutes: 0 })] }), /"minutes" debe ser un número entero entre 1 y 90/);
  assert.match(err({ name: 'D', exercises: one, blocks: [circuit({ stations: [] })] }), /"stations" debe ser una lista con al menos una estación/);
  assert.match(err({ name: 'D', exercises: one, blocks: [circuit({ stations: [{ exerciseName: 'x', unit: 'kg', quantity: 3 }] })] }), /"unit" debe ser/);
  assert.match(err({ name: 'D', exercises: one, blocks: [circuit({ stations: [{ exerciseName: 'x', unit: 'reps' }] })] }), /"unit" va con "quantity"/);
  assert.match(err({ name: 'D', exercises: one, blocks: [circuit({ stations: [{ name: 'x' }] })] }), /campo desconocido "name"/);
  assert.match(err({ name: 'D', exercises: one, blocks: [circuit({ at: 5 })] }), /"at" debe ser un número entero entre 0 y 1/);
  assert.match(err({ name: 'D', exercises: one, blocks: [circuit({ minutos: 3 })] }), /campo desconocido "minutos"/);
  assert.match(err({ name: 'D', exercises: [{ exerciseName: 'a', sets: 3, block: 'C' }], blocks: [circuit()] }), /es un circuito; sus ejercicios van en "stations"/);
  assert.match(err({ name: 'D', exercises: [] }), /al menos un ejercicio/);
  assert.match(err({
    name: 'D',
    exercises: [{ exerciseName: 'a', repMin: 8, block: 'A' }, { exerciseName: 'b', repMin: 8, block: 'A' }],
    blocks: [{ id: 'A', type: 'superset', rounds: 3 }, circuit({ at: 1 })]
  }), /queda en medio de la superserie "A"/);
  // Una superserie con datos de circuito sigue rechazándose.
  assert.match(err({ name: 'D', exercises: one, blocks: [{ id: 'A', type: 'superset', rounds: 3, minutes: 5 }] }), /campo desconocido "minutes"/);
});

// ---------------------------------------------------------------------------
// Borrador de Modo Grupo: lo anotado en la tarjeta del circuito
// ---------------------------------------------------------------------------

test('borrador: lo anotado en un circuito va a la foto del teléfono, se retoma y cuenta como sin confirmar', () => {
  const ui = {
    sessionDate: '2026-11-06', selectedClientIds: ['cli-a', 'cli-b'], dayChoices: {}, drafts: {},
    circuitDrafts: {
      'cli-a::C1': { rounds: 5, reps: 12, seconds: null, completed: false, noData: false, note: '', noteOpen: false },
      'cli-b::C1': { rounds: null, reps: null, seconds: null, completed: false, noData: true, note: 'Nota falsa', noteOpen: true },
      'cli-c::C1': { rounds: null, reps: null, seconds: null, completed: false, noData: false, note: '', noteOpen: false }
    },
    circuitView: { blockId: 'C1' }
  };
  const snapshot = groupDraft.buildSnapshot({ ownerId: 'coach-falso', ui, today: '2026-11-06', now: new Date('2026-11-06T10:00:00Z') });
  assert.deepEqual(Object.keys(snapshot.circuits), ['cli-a::C1', 'cli-b::C1']);
  assert.deepEqual(snapshot.circuits['cli-a::C1'], { rounds: 5, reps: 12, seconds: null, completed: false, noData: false, note: '' });
  assert.equal(snapshot.circuits['cli-b::C1'].note, 'Nota falsa');
  assert.deepEqual(snapshot.circuitView, { blockId: 'C1' });
  assert.equal(groupDraft.isWorthSaving(snapshot), true);
  assert.deepEqual(groupDraft.clientsWithData(snapshot), ['cli-a', 'cli-b']);
  const back = groupDraft.readSnapshot(JSON.stringify(snapshot), 'coach-falso');
  assert.deepEqual(back.circuits, snapshot.circuits);
  assert.deepEqual(back.circuitView, { blockId: 'C1' });
  assert.equal(groupDraft.classify(back, '2026-11-06'), 'same-day');
  // Sin nada anotado (ni en circuitos ni en series), no hay borrador.
  const empty = groupDraft.buildSnapshot({ ownerId: 'coach-falso', ui: { ...ui, circuitDrafts: { 'cli-c::C1': ui.circuitDrafts['cli-c::C1'] } }, today: '2026-11-06' });
  assert.deepEqual(empty.circuits, {});
  assert.equal(groupDraft.isWorthSaving(empty), false);
  // Un borrador anterior (sin circuits) se sigue leyendo igual.
  const old = { ...snapshot, drafts: { 'cli-a::ex-1': { setCount: 3, s1Weight: '40' } } };
  delete old.circuits;
  delete old.circuitView;
  const oldBack = groupDraft.readSnapshot(JSON.stringify(old), 'coach-falso');
  assert.deepEqual(oldBack.circuits, {});
  assert.equal(oldBack.circuitView, null);
  assert.equal(groupDraft.classify(oldBack, '2026-11-06'), 'same-day');
  // Lo que no sirve se descarta.
  const dirty = groupDraft.readSnapshot(JSON.stringify({ ...snapshot, circuits: { 'sin-separador': { rounds: 3 }, 'cli-a::C1': { rounds: 'x', note: 7 } } }), 'coach-falso');
  assert.deepEqual(dirty.circuits, { 'cli-a::C1': { rounds: null, reps: null, seconds: null, completed: false, noData: false, note: '7' } });
});
