const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.join(__dirname, '../assets/js/app.js'), 'utf8');

// Extrae una función con nombre de app.js (llaves balanceadas) para probar el código real.
function extractFunction(source, name) {
  const start = source.search(new RegExp(`(async )?function ${name}\\(`));
  assert.notEqual(start, -1, `No se encontró function ${name} en app.js`);
  const bodyStart = source.indexOf('{', source.indexOf(`function ${name}(`, start));
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) {
      return source.slice(start, index + 1);
    }
  }
  throw new Error(`Llaves sin cerrar en function ${name}`);
}

function buildDelete(scope) {
  const names = Object.keys(scope);
  const factory = new Function(...names, `${extractFunction(appSource, 'deleteLibraryExerciseById')}\nreturn deleteLibraryExerciseById;`);
  return factory(...names.map((key) => scope[key]));
}

function fakeLibrary() {
  return [
    { id: 'ej-1', name: 'Sentadilla falsa', active: true, pattern: 'squat' },
    { id: 'ej-2', name: 'Press falso', active: true, pattern: 'horizontal_push' },
    { id: 'ej-3', name: 'Remo falso', active: true, pattern: 'horizontal_pull' },
    { id: 'ej-4', name: 'Dominada falsa', active: true, pattern: 'vertical_pull' }
  ];
}

function setup() {
  const state = { exerciseLibrary: fakeLibrary() };
  let persisted = 0;
  const deleteLibraryExerciseById = buildDelete({
    state,
    isCloudSessionActive: () => false,
    cloudDataApi: null,
    persist: () => { persisted += 1; },
    renderLibraryExerciseList: () => {},
    setLibraryMessage: () => {}
  });
  return { state, deleteLibraryExerciseById, persisted: () => persisted };
}

test('eliminar un ejercicio deja los otros 3 activos, intactos y en su lugar', async () => {
  const { state, deleteLibraryExerciseById, persisted } = setup();
  await deleteLibraryExerciseById('ej-2');

  const others = state.exerciseLibrary.filter((exercise) => exercise.id !== 'ej-2');
  assert.deepEqual(others.map((exercise) => exercise.id), ['ej-1', 'ej-3', 'ej-4'], 'los demás siguen en el mismo orden');
  others.forEach((exercise) => assert.equal(exercise.active, true, `${exercise.name} debe seguir activo`));
  assert.deepEqual(others, fakeLibrary().filter((exercise) => exercise.id !== 'ej-2'), 'los demás quedan exactamente iguales');
  assert.equal(persisted(), 1);
});

test('el ejercicio eliminado queda inactivo (no se borra), para no romper programas que lo usan', async () => {
  const { state, deleteLibraryExerciseById } = setup();
  await deleteLibraryExerciseById('ej-2');
  const deleted = state.exerciseLibrary.find((exercise) => exercise.id === 'ej-2');
  assert.ok(deleted, 'sigue existiendo para los programas y el historial que lo referencian');
  assert.equal(deleted.active, false);
  assert.equal(deleted.name, 'Press falso');
  assert.equal(state.exerciseLibrary.filter((exercise) => exercise.active !== false).length, 3);
});

test('eliminar un id inexistente no cambia nada', async () => {
  const { state, deleteLibraryExerciseById, persisted } = setup();
  await deleteLibraryExerciseById('no-existe');
  assert.deepEqual(state.exerciseLibrary, fakeLibrary());
  assert.equal(persisted(), 0);
});
