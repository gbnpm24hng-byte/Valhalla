const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../assets/js/data.js');

const { createInitialState, normalizeTrainingProgram, normalizeTrainingProgramAssignment } = globalThis.VALHALLA.data;

test('normalizeTrainingProgram stores days, exercises and per-client assignments', () => {
  const state = createInitialState();
  const program = normalizeTrainingProgram({
    id: 'program-1',
    name: 'Hipertrofia inicial',
    objective: 'Hipertrofia',
    startDate: '2026-08-11',
    durationWeeks: 4,
    weeklyFrequency: 3,
    assignedClientIds: ['c1', 'c2'],
    days: [{
      id: 'day-a',
      name: 'Día A',
      order: 1,
      exercises: [{
        id: 'exercise-1',
        exerciseName: 'Sentadilla',
        repRangeMin: 8,
        repRangeMax: 10,
        targetWeight: 45,
        restSeconds: 90,
        zone: 'SALÓN A',
        approximations: [{ id: 'approx-1', label: 'A1', weight: 30, reps: 8 }],
        effectiveSets: [{ id: 'set-1', label: 'S1', weight: 45, reps: 8 }]
      }]
    }]
  }, state);

  assert.equal(program.name, 'Hipertrofia inicial');
  assert.equal(program.days[0].exercises[0].effectiveSets[0].label, 'S1');

  const assignment = normalizeTrainingProgramAssignment({
    id: 'assignment-1',
    programId: program.id,
    clientId: 'c1',
    program
  }, state);

  assert.equal(assignment.clientId, 'c1');
  assert.equal(assignment.days[0].exercises[0].repRangeMax, 10);
  assert.equal(assignment.days[0].exercises[0].approximations[0].label, 'A1');
});

test('normalizeTrainingProgram keeps approximations and effective sets for planning', () => {
  const state = createInitialState();
  const program = normalizeTrainingProgram({
    id: 'program-2',
    name: 'Planificación base',
    days: [{
      id: 'day-b',
      name: 'Día B',
      order: 2,
      exercises: [{
        id: 'exercise-2',
        exerciseName: 'Press banca',
        category: 'PECHO',
        zone: 'Salón A',
        restSeconds: 90,
        repRangeMin: 8,
        repRangeMax: 12,
        approximations: [{ id: 'approx-2', label: 'A1', weight: 30, reps: 8 }],
        effectiveSets: [{ id: 'set-2', label: 'S1', weight: 45, reps: 8 }]
      }]
    }]
  }, state);

  const exercise = program.days[0].exercises[0];
  assert.equal(exercise.zone, 'Salón A');
  assert.equal(exercise.approximations[0].weight, 30);
  assert.equal(exercise.effectiveSets[0].label, 'S1');
});

test('normalizeTrainingProgramAssignment derives weekly frequency from selected days', () => {
  const state = createInitialState();
  const program = normalizeTrainingProgram({
    id: 'program-3',
    name: 'Prueba días semanales',
    objective: 'Fuerza',
    startDate: '2026-08-11',
    durationWeeks: 6,
    weeklyFrequency: 3,
    assignedClientIds: ['c1'],
    days: [{
      id: 'day-c',
      name: 'Día C',
      order: 1,
      exercises: [{
        id: 'exercise-3',
        exerciseName: 'Peso muerto',
        repRangeMin: 5,
        repRangeMax: 8,
        targetWeight: 70,
        restSeconds: 120,
        zone: 'PIERNAS'
      }]
    }]
  }, state);

  const assignment = normalizeTrainingProgramAssignment({
    id: 'assignment-2',
    programId: program.id,
    clientId: 'c1',
    weeklyDays: [1, 3, 5]
  }, { trainingsV08: { programs: [program] } });

  assert.deepEqual(assignment.weeklyDays, [1, 3, 5]);
  assert.equal(assignment.weeklyFrequency, 3);
});

test('normalizeTrainingProgram preserves planner fields used by the routine builder', () => {
  const state = createInitialState();
  const program = normalizeTrainingProgram({
    id: 'program-4',
    name: 'Rutina base',
    days: [{
      id: 'day-d',
      name: 'Día A',
      order: 1,
      exercises: [{
        id: 'exercise-4',
        libraryExerciseId: 'library-squat',
        exerciseName: 'Sentadilla',
        category: 'PIERNAS',
        sets: 4,
        repMin: 5,
        repMax: 8,
        targetWeight: 90,
        restSeconds: 120,
        zone: 'Salón A',
        approximations: [{ id: 'approx-4', label: 'A1', weight: 80, reps: 6 }],
        effectiveSets: [{ id: 'set-4', label: 'S1', weight: 90, reps: 5 }]
      }]
    }]
  }, state);

  const exercise = program.days[0].exercises[0];
  assert.equal(exercise.libraryExerciseId, 'library-squat');
  assert.equal(exercise.sets, 4);
  assert.equal(exercise.repMin, 5);
  assert.equal(exercise.repMax, 8);
  assert.equal(exercise.approximations[0].weight, 80);
  assert.equal(exercise.effectiveSets[0].weight, 90);
});
