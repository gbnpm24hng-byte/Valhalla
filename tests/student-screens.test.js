const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../assets/js/publish-core.js');
require('../assets/js/student-view.js');

const view = globalThis.VALHALLA.studentView.format;

test('"¿Cómo se sintió?" se guarda en el RIR: Fácil 3, Bien 2, Difícil 0; RIR del entrenador: 0-1 Difícil, 2 Bien, 3+ Fácil', () => {
  assert.deepEqual(view.FEEL_OPTIONS.map((option) => [option.label, option.rir]), [['Fácil', 3], ['Bien', 2], ['Difícil', 0]]);
  assert.equal(view.feelFromRir(3), 'Fácil');
  assert.equal(view.feelFromRir(5), 'Fácil');
  assert.equal(view.feelFromRir(2), 'Bien');
  assert.equal(view.feelFromRir(1), 'Difícil');
  assert.equal(view.feelFromRir(0), 'Difícil');
  assert.equal(view.feelFromRir(null), '');
  assert.equal(view.feelFromRir(''), '');
});

test('lo que ve el alumno nunca dice "RIR"', () => {
  assert.equal(view.studentSetLine({ weight: 72.5, reps: 8, rir: 2 }), '72,5 kg × 8 reps · Bien');
  assert.equal(view.studentSetLine({ weight: 60, reps: 0, rir: null }), '60 kg');
  assert.doesNotMatch(view.studentSetLine({ weight: 60, reps: 8, rir: 0 }), /RIR/);
});

test('esquema de la tarjeta: "3 × 10-12"', () => {
  assert.equal(view.exerciseScheme({ sets: 3, repMin: 10, repMax: 12 }), '3 × 10-12');
  assert.equal(view.exerciseScheme({ sets: 4, repMin: 8, repMax: 8 }), '4 × 8');
  assert.equal(view.exerciseScheme({ sets: 3, repMin: null }), '3 × reps por definir');
  assert.equal(view.exerciseScheme({ sets: null }), 'Series por definir');
});

test('semana de lunes a domingo, con fechas de calendario (sin zona horaria)', () => {
  assert.equal(view.weekStart('2026-10-07'), '2026-10-05'); // miércoles -> lunes
  assert.equal(view.weekStart('2026-10-11'), '2026-10-05'); // domingo -> lunes anterior
  assert.equal(view.weekStart('2026-10-05'), '2026-10-05');
  assert.deepEqual(view.weekDates('2026-10-07'), ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
  assert.equal(view.addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(view.addDays('2026-01-01', -1), '2025-12-31');
});

test('racha: semanas seguidas con al menos un día, hasta la actual', () => {
  const dates = new Set(['2026-09-09', '2026-09-23', '2026-09-30', '2026-10-05']);
  assert.equal(view.weekStreak(dates, '2026-10-07'), 3, 'semanas del 21-9, 28-9 y 5-10; la del 14-9 corta');
  // La semana actual todavía sin registro no corta la racha.
  assert.equal(view.weekStreak(new Set(['2026-09-30']), '2026-10-07'), 1);
  // Dos semanas sin nada: racha 0.
  assert.equal(view.weekStreak(new Set(['2026-09-23']), '2026-10-07'), 0);
  assert.equal(view.weekStreak(new Set(), '2026-10-07'), 0);
});

test('pantalla del ejercicio: la nota técnica pasa por el filtro "Interno:"', () => {
  const exercise = { id: 'ex-1', name: 'Sentadilla de prueba', sets: 3, repMin: 8, repMax: 10,
    techniqueNotes: 'Bajar controlado. Interno: revisar molestia ficticia.\nNota interna: dato de prueba' };
  const day = { id: 'd-1', name: 'Día A', exercises: [exercise] };
  const ctx = { canLog: false, date: '2026-10-20', dates: ['2026-10-20'], setRows: [], outbox: [], progress: [] };
  const html = view.renderExerciseScreen(ctx, { program: { assignment_id: 'a-1' }, day, exercises: [exercise], exerciseIndex: 0, exercise });
  assert.match(html, /Bajar controlado\./);
  assert.doesNotMatch(html, /Interno|interna|molestia ficticia|dato de prueba/i);
});

test('historial: el RIR que anotó el entrenador se muestra como sensación', () => {
  assert.equal(view.studentSetLine({ weight: 50, reps: 10, rir: 0 }), '50 kg × 10 reps · Difícil');
  assert.equal(view.studentSetLine({ weight: 50, reps: 10, rir: 1 }), '50 kg × 10 reps · Difícil');
  assert.equal(view.studentSetLine({ weight: 50, reps: 10, rir: 2 }), '50 kg × 10 reps · Bien');
  assert.equal(view.studentSetLine({ weight: 50, reps: 10, rir: 4 }), '50 kg × 10 reps · Fácil');
});

test('fecha de hoy en hora local del teléfono (no UTC)', () => {
  assert.equal(view.localToday(new Date(2026, 9, 19, 22, 30)), '2026-10-19');
});
