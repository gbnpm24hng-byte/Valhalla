const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../assets/js/publish-core.js');
require('../assets/js/student-view.js');

const publish = globalThis.VALHALLA.publishCore;
const view = globalThis.VALHALLA.studentView.format;

test('repeticiones por completar: "reps por definir", nunca "0 reps" ni "1 reps" inventado', () => {
  assert.equal(view.repsRange({ repMin: null, repMax: null }), 'reps por definir');
  assert.equal(view.repsRange({ repMin: 0, repMax: 0 }), 'reps por definir');
  assert.equal(view.repsRange({ repMin: 6, repMax: 8 }), '6–8 reps');
  assert.equal(view.repsRange({ repMin: 5, repMax: 5 }), '5 reps');
});

test('una serie muestra solo lo que tiene dato', () => {
  assert.equal(view.setLine({ weight: 60, reps: 0 }), '60 kg');
  assert.equal(view.setLine({ weight: 60, reps: null }), '60 kg');
  assert.equal(view.setLine({ weight: 60, reps: 8, rir: 2 }), '60 kg × 8 reps · RIR 2');
  assert.equal(view.setLine({ weight: 0, reps: 10 }), '10 reps');
  assert.equal(view.setLine({ weight: null, reps: null }), 'por definir');
});

test('las aproximaciones con 0 kg y 0 reps no se muestran', () => {
  const html = view.renderProgram({ title: 'P', data: { days: [{ name: 'Día A', exercises: [{
    name: 'Sentadilla', sets: 3, repMin: null,
    approximations: [{ label: 'A1', weight: 0, reps: 0 }, { label: 'A2', weight: 0, reps: 0 }, { label: 'A3', weight: 40, reps: 5 }],
    effectiveSets: [{ label: 'S1', weight: 60, reps: 0 }]
  }] }] } });
  assert.equal(html.includes('>A1<'), false);
  assert.equal(html.includes('>A2<'), false);
  assert.match(html, />A3<\/span> 40 kg × 5 reps/);
  assert.match(html, />S1<\/span> 60 kg</);
  assert.equal(/0 reps|1 reps/.test(html), false);
  assert.match(html, /reps por definir/);
});

test('las notas internas no se publican ni se muestran; el resto de la nota sí', () => {
  assert.equal(publish.studentNote('Pesos no incluidos en los datos recibidos.'), '');
  assert.equal(publish.studentNote('Rodillas hacia afuera. Cargas no incluidas en los datos recibidos.'), 'Rodillas hacia afuera.');
  assert.equal(publish.studentNote('Interno: revisar dolor de hombro.\nBajar controlado'), 'Bajar controlado');
  assert.equal(publish.studentNote('Nota interna: cobrar el lunes'), '');
  assert.equal(publish.studentNote('Repeticiones por completar'), '');
  assert.equal(publish.studentNote('Espalda neutra, mirada al frente'), 'Espalda neutra, mirada al frente');

  const program = publish.buildPublishedProgram({ id: 'a', days: [{ id: 'd', exercises: [{ exerciseName: 'X', notes: 'Codos cerrados. Datos recibidos sin cargas.' }] }] });
  assert.equal(program.days[0].exercises[0].techniqueNotes, 'Codos cerrados.');

  // Lo publicado antes del filtro tampoco se muestra.
  assert.equal(view.noteForStudent('Cargas no incluidas en los datos recibidos'), '');
});

test('las frases de técnica no se ocultan por error', () => {
  [
    'Escápulas juntas.', 'Buscar profundidad.', 'Rodillas hacia afuera.', 'Bajar controlado.', 'Espalda neutra, mirada al frente.',
    // Frases reales de los programas (sin datos personales).
    'Convencional / barra hexagonal.', 'Peso corporal más carga.', 'Trap set.', '1.5 rep;', 'A1 liviano 30 kg, A2 medio 40 kg.'
  ].forEach((sentence) => assert.equal(publish.studentNote(sentence), sentence, `no debe ocultarse: ${sentence}`));
  // La frase interna real de los programas sí se oculta, y la de técnica que la acompaña queda.
  assert.equal(publish.studentNote('Buscar profundidad. Repeticiones, aproximaciones A1/A2 y RIR no incluidos en los datos recibidos.'), 'Buscar profundidad.');
});

// Lista fija de las frases reales de las notas de los programas (respaldo de octubre 2026),
// con el resultado esperado. Cualquier cambio del filtro de notas debe mantener esto.
const REAL_PROGRAM_PHRASES = [
  ['Repeticiones, aproximaciones A1/A2 y RIR no incluidos en los datos recibidos.', 'oculta'],
  ['Cambiado desde aperturas.', 'oculta'],
  ['Reps registradas: 20/12.', 'oculta'],
  ['Sin datos registrados aún.', 'oculta'],
  ['sin series registradas aún.', 'oculta'],
  ['Carga individual por alumno.', 'oculta'],
  ['Peso corporal más carga.', 'visible'],
  ['60 kg registrado como asistencia/lastre.', 'visible'],
  ['Trap set.', 'visible'],
  ['Peso corporal, RIR al fallo.', 'visible'],
  ['Peso corporal;', 'visible'],
  ['3 series.', 'visible'],
  ['1.5 rep;', 'visible'],
  ['peso corporal;', 'visible'],
  ['Convencional / barra hexagonal.', 'visible'],
  ['Semana 3;', 'visible'],
  ['sube desde 50 kg.', 'visible'],
  ['Peso aproximado (~20 kg).', 'visible'],
  ['A1 liviano 30 kg, A2 medio 40 kg.', 'visible'],
  ['Peso base;', 'visible']
];

test('frases reales de los programas: cada una queda visible u oculta según la lista fija', () => {
  REAL_PROGRAM_PHRASES.forEach(([sentence, expected]) => {
    const result = publish.studentNote(sentence) === '' ? 'oculta' : 'visible';
    assert.equal(result, expected, `"${sentence}" debería quedar ${expected}`);
    if (expected === 'visible') {
      assert.equal(publish.studentNote(sentence), sentence, `"${sentence}" debe publicarse sin cambios`);
    }
  });
  // Combinadas en una misma nota, se quita solo lo interno.
  assert.equal(publish.studentNote('Peso base; sube desde 50 kg. Sin datos registrados aún.'), 'Peso base; sube desde 50 kg.');
});
