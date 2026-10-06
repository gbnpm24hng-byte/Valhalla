const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../assets/js/data.js');

const data = globalThis.VALHALLA.data;

const current = () => [
  { id: 'library-squat', name: 'Sentadilla', primaryMuscle: 'quadriceps', active: true },
  { id: 'library-bench', name: 'Press banca', primaryMuscle: 'chest', active: true },
  { id: 'library-row', name: 'Remo con barra', primaryMuscle: 'lats', active: false }
];

test('agrega solo ejercicios nuevos y conserva sus ids', () => {
  const backup = [
    { id: 'library-curl', name: 'Curl con barra', primaryMuscle: 'biceps' },
    { id: 'library-dips', name: 'Fondos', primaryMuscle: 'chest' }
  ];
  const plan = data.planLibraryAdditions(current(), backup);
  assert.deepEqual(plan.toAdd.map((e) => e.id), ['library-curl', 'library-dips']);
  assert.deepEqual(plan.skipped, []);
});

test('nunca modifica ni reemplaza los existentes (mismo id o mismo nombre, también inactivos)', () => {
  const before = current();
  const backup = [
    { id: 'library-squat', name: 'Sentadilla CAMBIADA', primaryMuscle: 'glutes' },
    { id: 'otro-id', name: 'PRESS BANCA', primaryMuscle: 'triceps' },
    { id: 'otro-id-2', name: 'remo con barra', primaryMuscle: 'biceps' }
  ];
  const plan = data.planLibraryAdditions(before, backup);
  assert.deepEqual(plan.toAdd, []);
  assert.equal(plan.skipped.length, 3);
  assert.deepEqual(before, current(), 'la biblioteca actual no cambia');
});

test('los nombres se comparan sin tildes ni mayúsculas, y no se duplica dentro del mismo respaldo', () => {
  const plan = data.planLibraryAdditions([{ id: 'a', name: 'Extensión de cuádriceps' }], [
    { id: 'b', name: 'extension de cuadriceps' },
    { id: 'c', name: 'Elevación lateral' },
    { id: 'd', name: 'ELEVACION LATERAL' }
  ]);
  assert.deepEqual(plan.toAdd.map((e) => e.id), ['c']);
  assert.equal(plan.skipped.length, 2);
});

test('usarlo dos veces no duplica', () => {
  const backup = Array.from({ length: 10 }, (_, i) => ({ id: `nuevo-${i}`, name: `Ejercicio nuevo ${i}` }));
  const first = data.planLibraryAdditions(current(), backup);
  const library = current().concat(first.toAdd);
  assert.equal(library.length, 13);
  const second = data.planLibraryAdditions(library, backup);
  assert.equal(second.toAdd.length, 0);
  assert.equal(second.skipped.length, 10);
});
