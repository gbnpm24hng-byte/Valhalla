const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// v0.9.44 · Bloques fase 1: ejercicios por tiempo y superseries. Solo datos falsos.
global.window = global;
require('../assets/js/blocks-core.js');
require('../assets/js/data.js');
require('../assets/js/labels.js');
require('../assets/js/publish-core.js');
require('../assets/js/program-import-core.js');
require('../assets/js/student-import-core.js');
require('../assets/js/coach-sets-core.js');
require('../assets/js/group-round-core.js');
require('../assets/js/group-draft-core.js');

const blocks = globalThis.VALHALLA.blocksCore;
const data = globalThis.VALHALLA.data;
const labels = globalThis.VALHALLA.labels;
const publish = globalThis.VALHALLA.publishCore;
const programImport = globalThis.VALHALLA.programImport;
const studentImport = globalThis.VALHALLA.studentImportCore;
const coachSets = globalThis.VALHALLA.coachSetsCore;
const round = globalThis.VALHALLA.groupRoundCore;
const draftCore = globalThis.VALHALLA.groupDraftCore;

const clone = (value) => JSON.parse(JSON.stringify(value));
const NEW_KEYS = ['measure', 'durationSeconds', 'blockId', 'blocks', 'seconds', 'plannedSeconds'];
function keysIn(value, found = new Set()) {
  if (Array.isArray(value)) value.forEach((item) => keysIn(item, found));
  else if (value && typeof value === 'object') Object.keys(value).forEach((key) => { found.add(key); keysIn(value[key], found); });
  return found;
}

const ex = (id, extra = {}) => ({ id, exerciseName: `Ejercicio falso ${id}`, sets: 3, repMin: 8, repMax: 12, ...extra });

// ---------------------------------------------------------------------------
// blocks-core
// ---------------------------------------------------------------------------

test('tiempo: formato "40 s", objetivo y campos solo cuando es por tiempo', () => {
  assert.equal(blocks.formatSeconds(40), '40 s');
  assert.equal(blocks.formatSeconds(''), '');
  assert.equal(blocks.formatTarget({ measure: 'time', durationSeconds: 40 }), '40 s');
  assert.equal(blocks.formatTarget({ repMin: 8, repMax: 12 }), '8-12');
  assert.deepEqual(blocks.normalizeExerciseFields({ repMin: 8 }), {});
  assert.deepEqual(blocks.normalizeExerciseFields({ measure: 'time', durationSeconds: '45' }), { measure: 'time', durationSeconds: 45 });
  assert.deepEqual(blocks.normalizeExerciseFields({ measure: 'reps', durationSeconds: 45 }), {});
});

test('superserie: agrega, agrupa seguido, series = vueltas y letras A1, A2', () => {
  const day = { id: 'd', exercises: [ex('suelto')] };
  const next = blocks.addSuperset(day, [ex('a'), ex('b', { measure: 'time', durationSeconds: 40, repMin: null, repMax: null })], { id: 'blk', rounds: 4, restSeconds: 60 });
  assert.deepEqual(next.blocks, [{ id: 'blk', type: 'superset', rounds: 4, restSeconds: 60 }]);
  assert.deepEqual(next.exercises.map((item) => [item.id, item.blockId || '', item.sets]), [['suelto', '', 3], ['a', 'blk', 4], ['b', 'blk', 4]]);
  assert.equal(blocks.memberLabel(next, 'a'), 'A1');
  assert.equal(blocks.memberLabel(next, 'b'), 'A2');
  assert.equal(blocks.memberLabel(next, 'suelto'), '');
  const parts = blocks.segments(next);
  assert.deepEqual(parts.map((part) => part.kind), ['single', 'superset']);
  assert.equal(parts[1].letter, 'A');
  // De 2 a 4: con 1 o 5 no se crea.
  assert.equal(blocks.addSuperset(day, [ex('x')], { id: 'b1' }), null);
  assert.equal(blocks.addSuperset(day, [ex('1'), ex('2'), ex('3'), ex('4'), ex('5')], { id: 'b2' }), null);
});

test('superserie: mover el bloque entero, mover dentro, sacar uno (se deshace con 1) y vueltas', () => {
  let day = blocks.addSuperset({ id: 'd', exercises: [ex('s1'), ex('s2')] }, [ex('a'), ex('b'), ex('c')], { id: 'blk', rounds: 3 });
  // El bloque (tramo 2) sube un lugar: queda entre s1 y s2, entero.
  day = blocks.moveSegment(day, 2, -1);
  assert.deepEqual(day.exercises.map((item) => item.id), ['s1', 'a', 'b', 'c', 's2']);
  // s2 (tramo 2) sube: salta el bloque entero, nunca queda adentro.
  const jumped = blocks.moveSegment(day, 2, -1);
  assert.deepEqual(jumped.exercises.map((item) => item.id), ['s1', 's2', 'a', 'b', 'c']);
  assert.equal(blocks.segmentIndexOf(day, 3), 1);
  day = blocks.moveWithinBlock(day, 'b', -1);
  assert.deepEqual(day.exercises.map((item) => item.id), ['s1', 'b', 'a', 'c', 's2']);
  assert.equal(blocks.moveWithinBlock(day, 'b', -1), null);
  day = blocks.removeFromBlock(day, 'a');
  assert.deepEqual(day.exercises.map((item) => [item.id, item.blockId || '']), [['s1', ''], ['b', 'blk'], ['c', 'blk'], ['a', ''], ['s2', '']]);
  day = blocks.updateBlock(day, 'blk', { rounds: 5, restSeconds: 120 });
  assert.deepEqual(day.blocks[0], { id: 'blk', type: 'superset', rounds: 5, restSeconds: 120 });
  assert.deepEqual(day.exercises.filter((item) => item.blockId).map((item) => item.sets), [5, 5]);
  day = blocks.removeFromBlock(day, 'b');
  assert.equal(day.blocks, undefined);
  assert.ok(day.exercises.every((item) => !item.blockId));
});

test('Modo Grupo: S1 de A1 pasa a A2; después del último, vuelve a A1 y termina la vuelta', () => {
  const day = blocks.addSuperset({ id: 'd', exercises: [] }, [ex('a'), ex('b')], { id: 'blk' });
  assert.deepEqual(blocks.supersetStep(day, 'a'), { nextId: 'b', endOfRound: false });
  assert.deepEqual(blocks.supersetStep(day, 'b'), { nextId: 'a', endOfRound: true });
  assert.equal(blocks.supersetStep(day, 'otro'), null);
});

// ---------------------------------------------------------------------------
// data.js: solo campos opcionales
// ---------------------------------------------------------------------------

test('un programa sin campos nuevos queda exactamente igual (sin measure, blocks ni blockId)', () => {
  const program = data.normalizeTrainingProgram({ id: 'p', name: 'Programa falso', createdAt: 'x', updatedAt: 'x', days: [{ id: 'd', name: 'Día A', exercises: [ex('e1')] }] });
  const found = keysIn(program);
  NEW_KEYS.forEach((key) => assert.equal(found.has(key), false, `no debe aparecer ${key}`));
  assert.deepEqual(data.normalizeTrainingProgram(clone(program)), program);
});

test('data.js conserva tiempo y superserie; deshace un bloque de 1 y referencias rotas', () => {
  const program = data.normalizeTrainingProgram({
    id: 'p', name: 'Programa falso', createdAt: 'x', updatedAt: 'x',
    days: [{
      id: 'd', name: 'Día A',
      blocks: [{ id: 'blk', type: 'superset', rounds: 3, restSeconds: 90 }, { id: 'solo', type: 'superset', rounds: 2 }, { id: 'raro', type: 'otro' }],
      exercises: [
        ex('plancha', { measure: 'time', durationSeconds: 40, repMin: null, repMax: null, blockId: 'blk' }),
        ex('remo', { blockId: 'blk', sets: 9 }),
        ex('suelto', { blockId: 'solo' }),
        ex('fantasma', { blockId: 'no-existe' })
      ]
    }]
  });
  const day = program.days[0];
  assert.deepEqual(day.blocks, [{ id: 'blk', type: 'superset', rounds: 3, restSeconds: 90 }]);
  assert.equal(day.exercises[0].measure, 'time');
  assert.equal(day.exercises[0].durationSeconds, 40);
  assert.equal(day.exercises[0].repMin, null);
  assert.equal(day.exercises[1].sets, 3, 'series = vueltas');
  assert.equal(day.exercises[2].blockId, undefined);
  assert.equal(day.exercises[3].blockId, undefined);
  assert.deepEqual(data.normalizeTrainingProgram(clone(program)), program, 'normalizar dos veces no cambia nada');
  // La asignación copia días con bloques.
  const assignment = data.normalizeTrainingProgramAssignment({ id: 'as', programId: 'p', clientId: 'c', days: clone(program.days) }, { trainingsV08: { programs: [program] } });
  assert.deepEqual(assignment.days[0].blocks, day.blocks);
});

test('sesión: serie por tiempo con seconds; una serie sin segundos queda como siempre', () => {
  const raw = {
    id: 's', clientId: 'c', date: '2026-11-05',
    exercises: [
      { exerciseName: 'Plancha falsa', measure: 'time', plannedSeconds: 40, blockId: 'blk', sets: [{ setType: 'S', weight: 0, reps: null, seconds: 45, createdAt: 'x' }] },
      { exerciseName: 'Remo falso', sets: [{ setType: 'S', weight: 40, reps: 10, createdAt: 'x' }] }
    ]
  };
  const session = data.importState(JSON.stringify({ trainingsV08: { sessions: [raw] } })).trainingsV08.sessions[0];
  assert.equal(session.exercises[0].measure, 'time');
  assert.equal(session.exercises[0].plannedSeconds, 40);
  assert.equal(session.exercises[0].blockId, 'blk');
  assert.equal(session.exercises[0].sets[0].seconds, 45);
  assert.equal('seconds' in session.exercises[1].sets[0], false);
  assert.equal('measure' in session.exercises[1], false);
});

// ---------------------------------------------------------------------------
// Publicación
// ---------------------------------------------------------------------------

test('publicar: por tiempo y superserie viajan; un programa viejo se publica igual que antes', () => {
  const oldAssignment = { id: 'as', programName: 'Viejo falso', days: [{ id: 'd', name: 'Día A', exercises: [ex('e1')] }] };
  const oldPublished = publish.buildPublishedProgram(oldAssignment, []);
  NEW_KEYS.forEach((key) => assert.equal(keysIn(oldPublished).has(key), false));
  const assignment = {
    id: 'as', programName: 'Nuevo falso',
    days: [{
      id: 'd', name: 'Día A',
      blocks: [{ id: 'blk', type: 'superset', rounds: 3, restSeconds: 60, ajeno: 'no' }],
      exercises: [ex('a', { measure: 'time', durationSeconds: 40, blockId: 'blk' }), ex('b', { blockId: 'blk' })]
    }]
  };
  const published = publish.buildPublishedProgram(assignment, []);
  assert.deepEqual(published.days[0].blocks, [{ id: 'blk', type: 'superset', rounds: 3, restSeconds: 60 }]);
  assert.equal(published.days[0].exercises[0].measure, 'time');
  assert.equal(published.days[0].exercises[0].durationSeconds, 40);
  assert.equal(published.days[0].exercises[1].blockId, 'blk');
  assert.equal(published.days[0].exercises[1].measure, undefined);
  const session = publish.buildPublishedSession({ id: 's', date: '2026-11-05', exercises: [{ exerciseName: 'Plancha falsa', measure: 'time', sets: [{ setType: 'S', weight: 0, reps: null, seconds: 40 }] }] });
  assert.equal(session.record.exercises[0].measure, 'time');
  assert.equal(session.record.exercises[0].sets[0].seconds, 40);
  assert.deepEqual(publish.findForbiddenKeys(published), []);
});

// ---------------------------------------------------------------------------
// Importación JSON
// ---------------------------------------------------------------------------

function importDeps() {
  let counter = 0;
  return {
    createId: (prefix) => `${prefix}-n${++counter}`,
    now: '2026-11-05T12:00:00.000Z',
    fold: labels.fold,
    categorize: labels.routineCategory,
    normalizeProgram: data.normalizeTrainingProgram
  };
}

const OLD_FILE = JSON.stringify({
  format: 'valhalla-programa', formatVersion: 1, name: 'Programa viejo falso', durationWeeks: 4,
  days: [{ name: 'Día A', exercises: [
    { exerciseName: 'Sentadilla falsa', sets: 3, repMin: 6, repMax: 8, targetWeight: 40, effectiveSets: [{ weight: 40, reps: 8, rir: 2 }] },
    { exerciseName: 'Plancha falsa', sets: 3, repMin: null, repMax: null, notes: '40 s' }
  ] }]
});

test('importar un JSON viejo da exactamente lo mismo que la versión anterior (sin blocks-core)', () => {
  // Versión anterior: data.js y program-import-core.js de HEAD, sin blocks-core, en otro contexto.
  const { execFileSync } = require('node:child_process');
  const repo = path.join(__dirname, '..');
  let oldData;
  let oldImport;
  try {
    oldData = execFileSync('git', ['show', 'HEAD:assets/js/data.js'], { cwd: repo, encoding: 'utf8' });
    oldImport = execFileSync('git', ['show', 'HEAD:assets/js/program-import-core.js'], { cwd: repo, encoding: 'utf8' });
  } catch (error) {
    oldData = fs.readFileSync(path.join(repo, 'assets/js/data.js'), 'utf8');
    oldImport = fs.readFileSync(path.join(repo, 'assets/js/program-import-core.js'), 'utf8');
  }
  const sandbox = { console };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  [oldData, fs.readFileSync(path.join(repo, 'assets/js/labels.js'), 'utf8'), oldImport].forEach((code) => vm.runInContext(code, sandbox));
  const oldDeps = { ...importDeps(), fold: sandbox.VALHALLA.labels.fold, categorize: sandbox.VALHALLA.labels.routineCategory, normalizeProgram: sandbox.VALHALLA.data.normalizeTrainingProgram };
  const before = JSON.parse(JSON.stringify(sandbox.VALHALLA.programImport.planProgramImport(OLD_FILE, [], oldDeps)));
  const after = JSON.parse(JSON.stringify(programImport.planProgramImport(OLD_FILE, [], importDeps())));
  assert.deepEqual(after, before);
  NEW_KEYS.forEach((key) => assert.equal(keysIn(after.program).has(key), false));
});

test('importar: por tiempo y superserie (sin "sets" en el bloque) con vista previa A1/A2', () => {
  const file = JSON.stringify({
    format: 'valhalla-programa', name: 'Core falso', durationWeeks: 4,
    days: [{
      name: 'Día A',
      blocks: [{ id: 'A', type: 'superset', rounds: 3, restSeconds: 60 }],
      exercises: [
        { exerciseName: 'Sentadilla falsa', sets: 4, repMin: 8 },
        { exerciseName: 'Plancha falsa', measure: 'time', durationSeconds: 40, block: 'A' },
        { exerciseName: 'Rueda falsa', repMin: 10, block: 'A' }
      ]
    }]
  });
  const result = programImport.planProgramImport(file, [], importDeps());
  assert.equal(result.error, undefined);
  const day = result.program.days[0];
  assert.equal(day.blocks.length, 1);
  assert.equal(day.blocks[0].rounds, 3);
  assert.equal(day.exercises[0].blockId, undefined);
  assert.equal(day.exercises[1].blockId, day.blocks[0].id);
  assert.equal(day.exercises[1].measure, 'time');
  assert.equal(day.exercises[1].durationSeconds, 40);
  assert.equal(day.exercises[2].sets, 3);
  assert.deepEqual(result.preview.days[0].exercises.map((item) => [item.superset || '', item.seconds ?? null]), [['', null], ['A1', 40], ['A2', null]]);
});

test('importar: errores claros (circuito, bloque de 1, no seguidos, tiempo con reps, sin segundos)', () => {
  const base = (day) => JSON.stringify({ format: 'valhalla-programa', name: 'X', durationWeeks: 4, days: [day] });
  const err = (day) => programImport.parseProgramFile(base(day)).error || '';
  const two = [{ exerciseName: 'a falso', repMin: 8, block: 'A' }, { exerciseName: 'b falso', repMin: 8, block: 'A' }];
  // v0.9.45: los circuitos ya se importan; sin "format" el error lo dice.
  assert.match(err({ name: 'D', blocks: [{ id: 'A', type: 'circuit', rounds: 3 }], exercises: two }), /"format" debe ser/);
  assert.match(err({ name: 'D', blocks: [{ id: 'A', type: 'superset', rounds: 3 }], exercises: [two[0], { exerciseName: 'c', sets: 3, repMin: 8 }] }), /de 2 a 4/);
  assert.match(err({ name: 'D', blocks: [{ id: 'A', type: 'superset', rounds: 3 }], exercises: [two[0], { exerciseName: 'c', sets: 3, repMin: 8 }, two[1]] }), /seguidos/);
  assert.match(err({ name: 'D', exercises: [{ exerciseName: 'p', sets: 3, measure: 'time', durationSeconds: 30, repMin: 8 }] }), /no lleva "repMin"/);
  assert.match(err({ name: 'D', exercises: [{ exerciseName: 'p', sets: 3, measure: 'time' }] }), /falta "durationSeconds"/);
  assert.match(err({ name: 'D', exercises: [{ exerciseName: 'p', sets: 3, block: 'Z' }] }), /no está en "blocks"/);
});

// ---------------------------------------------------------------------------
// student_sets: los segundos viajan en reps (sin tocar la tabla)
// ---------------------------------------------------------------------------

test('Modo Grupo escribe una serie por tiempo con los segundos en reps y sin peso', () => {
  const confirmed = [{ setType: 'S', weight: 0, reps: null, seconds: 40, rir: null, completed: true }, { setType: 'S', weight: 0, reps: null, seconds: 35, rir: 2, completed: true }];
  const plan = coachSets.planConfirm({ previous: [], confirmed, write: true, mark: true });
  assert.deepEqual(plan.changes, [
    { setType: 'S', setNumber: 1, weight: null, reps: 40, rir: null },
    { setType: 'S', setNumber: 2, weight: null, reps: 35, rir: 2 }
  ]);
  assert.equal(plan.sets[0].seconds, 40);
  const prefill = coachSets.prefillValues({ measure: 'time', sets: [{ setType: 'S', seconds: 45, loggedBy: 'student', rir: 1 }] });
  assert.equal(prefill.values.s1Seconds, '45');
  assert.equal(prefill.values.s1Done, '1', 'lo registrado por el alumno cuenta como hecho');
  assert.equal(prefill.values.s1Weight, undefined);
  assert.equal(coachSets.resolveDraft({ setCount: 1 }, { s3Seconds: '30' }).setCount, 3);
});

test('Traer registros: en un ejercicio por tiempo, reps de student_sets son segundos', () => {
  const state = {
    clients: [{ id: 'alumno-falso' }],
    trainingsV08: {
      sessions: [],
      assignments: [{ id: 'as', programId: 'p', days: [{ id: 'd', name: 'Día A', exercises: [{ id: 'plancha', exerciseName: 'Plancha falsa', measure: 'time', durationSeconds: 40, sets: 3, blockId: 'blk' }] }] }]
    }
  };
  let counter = 0;
  const summary = studentImport.mergeStudentSets(state, [
    { id: 'r1', owner_id: 'coach', auth_user_id: 'alumno-auth', client_id: 'alumno-falso', assignment_id: 'as', session_date: '2026-11-05', day_id: 'd', exercise_id: 'plancha', set_type: 'S', set_number: 1, weight: null, reps: 45, rir: null }
  ], { coachId: 'coach', createId: (prefix) => `${prefix}-${++counter}` });
  assert.equal(summary.added, 1);
  const exercise = state.trainingsV08.sessions[0].exercises[0];
  assert.equal(exercise.measure, 'time');
  assert.equal(exercise.plannedSeconds, 40);
  assert.equal(exercise.blockId, 'blk');
  assert.equal(exercise.sets[0].seconds, 45);
  assert.equal(exercise.sets[0].reps, null);
  assert.equal(exercise.sets[0].weight, 0);
});

// ---------------------------------------------------------------------------
// Borrador de Modo Grupo
// ---------------------------------------------------------------------------

test('borrador por tiempo: serie hecha con segundos, resumen "40, 35 s" y −/+ de 5 s', () => {
  // S3 tiene segundos (tocó −/+) pero todavía no se marcó "✓ S3 hecha": no está hecha.
  const draft = { measure: 'time', setCount: 3, s1Seconds: '40', s1Done: '1', s2Seconds: '35', s2Done: '1', s3Seconds: '45' };
  assert.equal(round.SECONDS_STEP, 5);
  assert.equal(round.isSetDone(draft, 1), true);
  assert.equal(round.isSetDone(draft, 3), false);
  assert.deepEqual(round.setProgress(draft), { done: 2, total: 3, current: 3, pending: true });
  assert.equal(round.summarizeSets(round.draftEntries(draft)), '40, 35, 45 s');
  assert.equal(round.stepValue('', '40', 5), '45');
  // Sin measure, una casilla de segundos no cuenta (kilos y reps como siempre).
  assert.equal(round.isSetDone({ setCount: 1, s1Seconds: '40' }, 1), false);
  assert.equal(round.summarizeSets([{ weight: '40', reps: '10' }]), '40 × 10');
});

test('borrador guardado en el teléfono conserva segundos y measure; "Repetir" llena segundos', () => {
  assert.equal(draftCore.entryHasData({ s1Seconds: '40' }), true);
  assert.deepEqual(draftCore.lastSetValues([{ seconds: 40 }, { weight: 50, reps: 8 }]), [{ seconds: '40' }, { weight: '50', reps: '8' }]);
  const { draft, filled } = draftCore.fillFromLast({ setCount: 1, measure: 'time' }, [{ seconds: '40' }, { seconds: '35' }]);
  assert.equal(filled, 2);
  assert.equal(draft.s2Seconds, '35');
  const snapshot = draftCore.buildSnapshot({
    ownerId: 'cuenta-falsa', today: '2026-11-05', now: new Date('2026-11-05T12:00:00Z'),
    ui: { sessionDate: '2026-11-05', selectedClientIds: ['c'], drafts: { 'c::plancha': { setCount: 2, measure: 'time', s1Seconds: '40', s1Done: '1' } } }
  });
  const read = draftCore.readSnapshot(JSON.stringify(snapshot), 'cuenta-falsa');
  const entry = read?.drafts?.['c::plancha'];
  assert.equal(entry?.s1Seconds, '40');
  assert.equal(entry?.s1Done, '1');
  assert.equal(entry?.measure, 'time');
});
