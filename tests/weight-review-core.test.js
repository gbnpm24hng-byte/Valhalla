const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../assets/js/weight-review-core.js');

const review = globalThis.VALHALLA.weightReview;

// Sesiones falsas: Alumna Prueba con curl de 7,5 kg varias fechas y un día con 75.
function session(id, clientId, date, exercises) {
  return { id, clientId, date, exercises };
}
function exercise(id, name, sets) {
  return { id, exerciseName: name, sets };
}
function s(setNumber, weight, reps = 10, extra = {}) {
  return { setNumber, weight, reps, setType: 'S', completed: true, ...extra };
}

function sample() {
  return [
    session('s1', 'c1', '2026-11-02', [exercise('e1', 'Curl falso', [s(1, 7.5), s(2, 7.5), s(3, 7.5)])]),
    session('s2', 'c1', '2026-11-04', [exercise('e2', 'Curl falso', [s(1, 7.5), s(2, 8)])]),
    session('s3', 'c1', '2026-11-06', [exercise('e3', 'Curl falso', [s(1, 75), s(2, 75), s(3, 7.5)])]),
    session('s4', 'c1', '2026-11-09', [exercise('e4', 'curl  FALSO ', [s(1, 7.5, 12, { loggedBy: 'student', studentSetId: 'x1' }), s(2, 80, 10, { loggedBy: 'student', studentSetId: 'x2' })])]),
    // Otro alumno con 75 kg normales: no sale.
    session('s5', 'c2', '2026-11-02', [exercise('e5', 'Curl falso', [s(1, 75)])]),
    session('s6', 'c2', '2026-11-04', [exercise('e6', 'Curl falso', [s(1, 72.5)])]),
    session('s7', 'c2', '2026-11-06', [exercise('e7', 'Curl falso', [s(1, 77.5)])])
  ];
}

test('sale el peso 10 veces lo normal de ese alumno en ese ejercicio', () => {
  const found = review.findSuspects(sample());
  const keys = found.map((item) => `${item.sessionId}:${item.setNumber}:${item.weight}`);
  assert.deepEqual(keys.sort(), ['s3:1:75', 's3:2:75', 's4:2:80'].sort());
  const first = found.find((item) => item.sessionId === 's3' && item.setNumber === 1);
  assert.equal(first.suggested, 7.5);
  assert.equal(first.clientId, 'c1');
  assert.equal(first.date, '2026-11-06');
  assert.equal(first.exerciseName, 'Curl falso');
  // Referencia: mediana de las otras fechas (7,5 · 7,75 · 43,75 del día con 7,5 y 80) = 7,75.
  assert.equal(first.reference, 7.75);
  const student = found.find((item) => item.sessionId === 's4');
  assert.equal(student.loggedBy, 'student');
  assert.equal(student.suggested, 8);
  assert.equal(found[0].date >= found[found.length - 1].date, true, 'de la más nueva a la más antigua');
});

test('regla: entre 7,5 y 12,5 veces la mediana de las otras fechas; hacen falta 2 fechas', () => {
  const base = [
    session('a', 'c1', '2026-01-01', [exercise('x', 'Press falso', [s(1, 10)])]),
    session('b', 'c1', '2026-01-02', [exercise('x', 'Press falso', [s(1, 10)])])
  ];
  const withWeight = (weight) => review.findSuspects([...base, session('c', 'c1', '2026-01-03', [exercise('x', 'Press falso', [s(1, weight)])])]).length;
  assert.equal(withWeight(74), 0, '7,4 veces no sale');
  assert.equal(withWeight(75), 1, '7,5 veces sale');
  assert.equal(withWeight(100), 1, '10 veces sale');
  assert.equal(withWeight(125), 1, '12,5 veces sale');
  assert.equal(withWeight(126), 0, '12,6 veces no sale');
  // Con una sola fecha para comparar, no se revisa.
  assert.equal(review.findSuspects([base[0], session('c', 'c1', '2026-01-03', [exercise('x', 'Press falso', [s(1, 100)])])]).length, 0);
});

test('series por tiempo y sin peso no cuentan; las aproximaciones se revisan pero no son referencia', () => {
  const sessions = [
    session('a', 'c1', '2026-01-01', [exercise('x', 'Remo falso', [s(1, 10), { setNumber: 2, weight: 0, reps: null, seconds: 30, setType: 'S' }])]),
    session('b', 'c1', '2026-01-02', [exercise('x', 'Remo falso', [s(1, 10), { setNumber: 1, weight: 100, reps: null, setType: 'A' }])]),
    session('c', 'c1', '2026-01-03', [exercise('x', 'Remo falso', [{ setNumber: 1, weight: 100, reps: null, setType: 'A' }, s(2, 10)])])
  ];
  const found = review.findSuspects(sessions);
  assert.deepEqual(found.map((item) => `${item.sessionId}:${item.setType}`).sort(), ['b:A', 'c:A']);
});

test('"Corregir" divide solo el peso por 10; "Está bien" no vuelve a salir', () => {
  const sessions = sample();
  const before = JSON.parse(JSON.stringify(sessions));
  const found = review.findSuspects(sessions);
  const target = found.find((item) => item.sessionId === 's3' && item.setNumber === 1);
  assert.equal(review.applyFix(sessions, target), true);
  const fixed = sessions[2].exercises[0].sets[0];
  assert.deepEqual(fixed, { ...before[2].exercises[0].sets[0], weight: 7.5 }, 'solo cambia el peso');
  assert.equal(review.applyFix(sessions, target), false, 'dos veces no divide de nuevo');

  const other = found.find((item) => item.sessionId === 's3' && item.setNumber === 2);
  assert.equal(review.markOk(sessions, other), true);
  assert.equal(sessions[2].exercises[0].sets[1].weight, 75);
  assert.equal(sessions[2].exercises[0].sets[1].weightCheck, 'ok');
  const again = review.findSuspects(sessions).map((item) => `${item.sessionId}:${item.setNumber}`);
  assert.deepEqual(again, ['s4:2']);
});

test('serie anotada por el alumno: al corregirla pasa a ser del entrenador (igual que el editor de series)', () => {
  const sessions = sample();
  const item = review.findSuspects(sessions).find((candidate) => candidate.sessionId === 's4');
  assert.equal(review.applyFix(sessions, item), true);
  const entry = sessions[3].exercises[0].sets[1];
  assert.equal(entry.weight, 8);
  assert.equal(entry.loggedBy, 'coach');
  assert.equal(entry.studentSetId, 'x2');
});

test('sin sesiones o datos raros no se cae', () => {
  assert.deepEqual(review.findSuspects(undefined), []);
  assert.deepEqual(review.findSuspects([null, {}, { clientId: 'c', exercises: [null, { exerciseName: '', sets: [null] }] }]), []);
  assert.equal(review.dividedByTen(22.5), 2.25);
  assert.equal(review.median([3, 1, 2]), 2);
  assert.equal(review.median([1, 2, 3, 4]), 2.5);
});
