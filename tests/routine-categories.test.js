const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../assets/js/labels.js');

const labels = globalThis.VALHALLA.labels;

// Los 61 ejercicios reales de la biblioteca (respaldo de octubre 2026): nombre, músculo
// principal guardado y la categoría del armador que les corresponde.
const REAL_EXERCISES = [
  ["Sentadilla", "quadriceps", "PIERNAS"],
  ["Press de banca", "chest", "PECHO"],
  ["Remo con barra", "lats", "ESPALDA"],
  ["Sentadilla libre", "quadriceps", "PIERNAS"],
  ["Sentadilla trasera con barra", "quadriceps", "PIERNAS"],
  ["Sentadilla frontal", "quadriceps", "PIERNAS"],
  ["Sentadilla española con mancuerna", "quadriceps", "PIERNAS"],
  ["Prensa", "quadriceps", "PIERNAS"],
  ["Extensión de cuádriceps", "quadriceps", "PIERNAS"],
  ["Hip thrust con barra", "glutes", "PIERNAS"],
  ["Curl femoral sentado", "hamstrings", "PIERNAS"],
  ["Glute-ham raise", "hamstrings", "PIERNAS"],
  ["Estocada", "quadriceps", "PIERNAS"],
  ["Estocada inversa con mancuernas", "glutes", "PIERNAS"],
  ["Estocadas + remo", "full_body", "PIERNAS"],
  ["Peso muerto rumano", "hamstrings", "PIERNAS"],
  ["Peso muerto convencional", "hamstrings", "PIERNAS"],
  ["Elevación de pantorrillas sentado", "calves", "PIERNAS"],
  ["Elevación de pantorrillas de pie", "calves", "PIERNAS"],
  ["Jalón al pecho", "lats", "ESPALDA"],
  ["Jalón al pecho agarre estrecho", "lats", "ESPALDA"],
  ["Jalón al pecho agarre ancho", "lats", "ESPALDA"],
  ["Jalón Mentzer", "lats", "ESPALDA"],
  ["Jalón brazos rectos", "lats", "ESPALDA"],
  ["Remo bajo en polea", "mid_back", "ESPALDA"],
  ["Remo sentado en polea", "mid_back", "ESPALDA"],
  ["Remo alto unilateral", "mid_back", "ESPALDA"],
  ["Remo invertido", "mid_back", "ESPALDA"],
  ["High pull con mancuernas", "rear_delts", "HOMBROS"],
  ["Dominadas", "lats", "ESPALDA"],
  ["Dominadas supinas", "lats", "ESPALDA"],
  ["Pullover", "lats", "ESPALDA"],
  ["Curl estricto con barra", "biceps", "BÍCEPS"],
  ["Curl martillo cruzado", "biceps", "BÍCEPS"],
  ["Curl arrastre", "biceps", "BÍCEPS"],
  ["Curl araña", "biceps", "BÍCEPS"],
  ["Curl inclinado", "biceps", "BÍCEPS"],
  ["Curl con mancuernas", "biceps", "BÍCEPS"],
  ["Press pecho plano", "chest", "PECHO"],
  ["Press plano con mancuernas", "chest", "PECHO"],
  ["Press inclinado", "chest", "PECHO"],
  ["Press inclinado con barra", "chest", "PECHO"],
  ["Press inclinado con mancuernas", "chest", "PECHO"],
  ["Press inclinado Smith", "chest", "PECHO"],
  ["Apertura con mancuernas", "chest", "PECHO"],
  ["Aperturas con mancuernas en el suelo", "chest", "PECHO"],
  ["Cruce de poleas horizontal", "chest", "PECHO"],
  ["Cruce de poleas alto", "chest", "PECHO"],
  ["Flexiones", "chest", "PECHO"],
  ["Flexiones en déficit", "chest", "PECHO"],
  ["Fondos", "chest", "PECHO"],
  ["Jalón de tríceps en polea", "triceps", "TRÍCEPS"],
  ["Extensión de tríceps en polea", "triceps", "TRÍCEPS"],
  ["Extensión cruzada unilateral", "triceps", "TRÍCEPS"],
  ["Extensión acostado con mancuernas", "triceps", "TRÍCEPS"],
  ["Patada de tríceps", "triceps", "TRÍCEPS"],
  ["Pullover-extensión PJR", "triceps", "TRÍCEPS"],
  ["Rompe cráneos / Pull over", "triceps", "TRÍCEPS"],
  ["Press militar unilateral", "front_delts", "HOMBROS"],
  ["Elevación lateral", "front_delts", "HOMBROS"],
  ["Remo deltoides posterior", "rear_delts", "HOMBROS"],
];

test('cada ejercicio real cae en su categoría del armador', () => {
  assert.equal(REAL_EXERCISES.length, 61);
  REAL_EXERCISES.forEach(([name, primaryMuscle, expected]) => {
    assert.equal(labels.routineCategory({ name, primaryMuscle }), expected, `"${name}" (${primaryMuscle}) debería estar en ${expected}`);
  });
  const counts = {};
  REAL_EXERCISES.forEach(([, , category]) => { counts[category] = (counts[category] || 0) + 1; });
  assert.deepEqual(counts, { PIERNAS: 17, PECHO: 14, ESPALDA: 13, HOMBROS: 4, 'BÍCEPS': 6, 'TRÍCEPS': 7 });
});

test('los de pecho caen en PECHO aunque el nombre no diga "press banca"', () => {
  ['Press de banca', 'Press inclinado con barra', 'Cruce de poleas alto', 'Flexiones', 'Fondos'].forEach((name) => {
    assert.equal(labels.routineCategory({ name, primaryMuscle: 'chest' }), 'PECHO', name);
  });
  // Antes: "Jalón al pecho" caía en PECHO por la palabra "pecho" y "Elevación lateral" en ESPALDA por "lat".
  assert.equal(labels.routineCategory({ name: 'Jalón al pecho', primaryMuscle: 'lats' }), 'ESPALDA');
  assert.equal(labels.routineCategory({ name: 'Elevación lateral', primaryMuscle: 'front_delts' }), 'HOMBROS');
});

test('sin músculo principal (o cuerpo completo) se clasifica por el nombre', () => {
  const byName = (name) => labels.routineCategory({ name, primaryMuscle: 'full_body' });
  assert.equal(byName('Press de banca'), 'PECHO');
  assert.equal(byName('Press inclinado con mancuernas'), 'PECHO');
  assert.equal(byName('Estocadas + remo'), 'PIERNAS');
  assert.equal(byName('Jalón de tríceps en polea'), 'TRÍCEPS');
  assert.equal(byName('Curl femoral'), 'PIERNAS');
  assert.equal(byName('Curl martillo'), 'BÍCEPS');
  assert.equal(byName('Elevación lateral'), 'HOMBROS');
  assert.equal(byName('Remo con barra'), 'ESPALDA');
  assert.equal(byName('Plancha'), 'CORE');
  assert.equal(byName('Burpees'), 'OTROS');
  assert.equal(labels.routineCategory({ name: 'Movimiento libre' }), 'OTROS');
});

test('clasificar no modifica el ejercicio guardado', () => {
  const exercise = { id: 'x', name: 'Press de banca', primaryMuscle: 'chest', pattern: 'horizontal_push', secondaryMuscles: ['triceps'] };
  const before = JSON.stringify(exercise);
  labels.routineCategory(exercise);
  assert.equal(JSON.stringify(exercise), before);
});
