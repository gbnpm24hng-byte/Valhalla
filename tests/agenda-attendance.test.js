const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../assets/js/data.js');

const { createInitialState, importState, normalizeClient, resetClientSessionMonth, normalizeTrainingProgram } = globalThis.VALHALLA.data;

test('fresh-install defaults stay unchanged and imports preserve empty legacy rosters', () => {
  const freshState = createInitialState();
  assert.deepEqual(freshState.trainings.students.map((student) => student.name), ['Martín', 'Camila']);
  freshState.trainings.students = [];
  assert.deepEqual(importState(JSON.stringify(freshState)).trainings.students, []);
});

test('normalizes legacy attendance as attended and preserves cancellation outcomes', () => {
  const client = normalizeClient({
    id: 'client-agenda-test',
    full_name: 'Alumno de prueba',
    sessions_total: 8,
    sessions_used: 1,
    training_attendance: [
      { sessionKey: 'legacy-session', date: '2026-10-01', time: '09:00' },
      {
        sessionKey: 'rescheduled-session',
        date: '2026-10-02',
        time: '09:00',
        status: 'rescheduled',
        reason: 'Aviso con anticipación',
        noticeDays: 7,
        requestedBy: 'student'
      },
      {
        sessionKey: 'no-show-session',
        date: '2026-10-03',
        time: '09:00',
        status: 'no_show'
      }
    ]
  });

  assert.equal(client.training_attendance[0].status, 'attended');
  assert.equal(client.training_attendance[1].status, 'rescheduled');
  assert.equal(client.training_attendance[1].noticeDays, 7);
  assert.equal(client.training_attendance[1].reason, 'Aviso con anticipación');
  assert.equal(client.training_attendance[2].status, 'no_show');
  assert.equal(client.sessions_total - client.sessions_used, 7);
});

test('monthly session rollover resets only when a recorded month changes', () => {
  const client = normalizeClient({
    id: 'monthly-client',
    sessions_total: 12,
    sessions_used: 4,
    sessions_month: '2026-10',
    training_attendance: [{ sessionKey: 'old-session', date: '2026-10-01', status: 'no_show' }]
  });

  assert.equal(resetClientSessionMonth(client, '2026-10'), false);
  assert.equal(client.sessions_used, 4);
  assert.equal(resetClientSessionMonth(client, '2026-11'), true);
  assert.equal(client.sessions_used, 0);
  assert.equal(client.sessions_total, 12);
  assert.equal(client.sessions_month, '2026-11');
  assert.equal(client.training_attendance[0].status, 'no_show');

  const legacyClient = normalizeClient({ sessions_used: 2 });
  assert.equal(resetClientSessionMonth(legacyClient, '2026-11'), true);
  assert.equal(legacyClient.sessions_used, 2);
});

test('training program normalization preserves RIR on effective sets', () => {
  const program = normalizeTrainingProgram({
    name: 'Programa con RIR',
    days: [{ name: 'Piernas', exercises: [
      {
        exerciseName: 'Sentadilla',
        effectiveSets: [{ label: 'S1', weight: 100, reps: 3, rir: 2 }]
      },
      {
        exerciseName: 'Carga por completar',
        targetWeight: null,
        repRangeMin: null,
        repRangeMax: null,
        approximations: [{ label: 'A1', weight: null, reps: null }, { label: 'A2', weight: null, reps: null }],
        effectiveSets: [{ label: 'S1', weight: null, reps: null, rir: null }]
      }
    ] }]
  });

  assert.equal(program.days[0].exercises[0].effectiveSets[0].rir, 2);
  assert.equal(program.days[0].exercises[1].targetWeight, null);
  assert.equal(program.days[0].exercises[1].repRangeMin, null);
  assert.equal(program.days[0].exercises[1].approximations[1].weight, null);
  assert.equal(program.days[0].exercises[1].effectiveSets[0].weight, null);
});

test('training sessions retain the manually selected program day and set RIR', () => {
  const state = createInitialState();
  state.trainingsV08.sessions.push({
    id: 'manual-program-day-session',
    clientId: 'client-sebastian',
    programAssignmentId: 'assignment-sebastian',
    programId: 'program-sebastian',
    programDayId: 'legs-day-1',
    programDayName: 'Piernas-Hombros 1',
    date: '2026-10-01',
    title: 'Piernas-Hombros 1',
    status: 'in_progress',
    exercises: [{
      id: 'squat-exercise',
      programExerciseId: 'program-squat',
      exerciseName: 'Sentadilla trasera con barra',
      plannedSets: 3,
      sets: [{ setNumber: 1, weight: 105, reps: 3, rir: 1 }]
    }]
  });

  const imported = importState(JSON.stringify(state));
  const session = imported.trainingsV08.sessions[0];

  assert.equal(session.programDayId, 'legs-day-1');
  assert.equal(session.programDayName, 'Piernas-Hombros 1');
  assert.equal(session.exercises[0].programExerciseId, 'program-squat');
  assert.equal(session.exercises[0].sets[0].rir, 1);
});

test('importing a backup replaces every list instead of merging it with the defaults', () => {
  const backup = createInitialState();
  backup.clients = [{ id: 'backup-client', full_name: 'Cliente del respaldo' }];
  backup.accounts = [{ id: 'backup-account', name: 'Cuenta del respaldo', isMain: true }];
  backup.categories = [{ id: 'backup-category', name: 'Categoría del respaldo', group: 'personal' }];
  backup.debts = [];
  backup.financialGoals = [];
  backup.recurringTransactions = [];
  backup.recurring = [];

  const imported = importState(JSON.stringify(backup));

  assert.deepEqual(imported.clients.map((client) => client.id), ['backup-client']);
  assert.deepEqual(imported.accounts.map((account) => account.id), ['backup-account']);
  assert.deepEqual(imported.categories.map((category) => category.id), ['backup-category']);
  assert.deepEqual(imported.debts, []);
  assert.deepEqual(imported.financialGoals, []);
  assert.deepEqual(imported.recurringTransactions, []);
  assert.throws(() => importState('[]'));

  const legacyBackup = { clients: backup.clients };
  assert.equal(importState(JSON.stringify(legacyBackup)).accounts.length, createInitialState().accounts.length);
});
