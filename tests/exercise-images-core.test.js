const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;
require('../assets/js/exercise-images-core.js');
require('../assets/js/muscle-map-core.js');
require('../assets/js/publish-core.js');

const images = globalThis.VALHALLA.exerciseImages;
const publish = globalThis.VALHALLA.publishCore;
const folder = path.join(__dirname, '..', 'assets', 'images', 'ejercicios');

test('la tabla es la misma del JSON y cada archivo existe', () => {
  const json = JSON.parse(fs.readFileSync(path.join(folder, 'imagenes-ejercicios.json'), 'utf8'));
  assert.deepEqual(images.FILES, json);
  Object.keys(images.FILES).forEach((file) => assert.ok(fs.existsSync(path.join(folder, file)), `existe ${file}`));
  const webp = fs.readdirSync(folder).filter((file) => file.endsWith('.webp'));
  assert.deepEqual(webp.sort(), Object.keys(images.FILES).sort(), 'no sobra ninguna imagen');
});

test('por nombre: sin tildes, mayúsculas ni espacios de más', () => {
  assert.equal(images.imageFor({ exerciseName: 'Remo bajo en polea' }).file, 'remo-polea.webp');
  assert.equal(images.imageFor({ exerciseName: 'EXTENSION DE CUADRICEPS' }).file, 'extension-cuadriceps.webp');
  assert.equal(images.imageFor({ name: '  subida   a cajon ' }).file, 'subida-cajon.webp');
  assert.equal(images.imageFor({ exerciseName: 'Jalón al pecho agarre estrecho' }).src, './assets/images/ejercicios/jalon-estrecho.webp');
});

test('sin imagen: null', () => {
  assert.equal(images.imageFor({ exerciseName: 'Ejercicio falso inventado' }), null);
  assert.equal(images.imageFor({ exerciseName: '' }), null);
  assert.equal(images.imageFor(null), null);
  assert.equal(images.imgHtml(null), '');
});

test('primero la galería enlazada (libraryExerciseId → su nombre)', () => {
  const library = [{ id: 'lib-1', name: 'Hip thrust con barra' }, { id: 'lib-2', name: 'Algo sin imagen' }];
  const linked = images.imageFor({ libraryExerciseId: 'lib-1', exerciseName: 'Empuje de cadera falso' }, library);
  assert.equal(linked.file, 'hip-thrust.webp');
  assert.equal(linked.alt, 'Empuje de cadera falso', 'el alt es el nombre del ejercicio');
  // Enlazado a uno sin imagen: cae al nombre del ejercicio.
  assert.equal(images.imageFor({ libraryExerciseId: 'lib-2', exerciseName: 'Prensa' }, library).file, 'prensa.webp');
  // Enlace roto: por el nombre.
  assert.equal(images.imageFor({ libraryExerciseId: 'no-existe', exerciseName: 'Prensa' }, library).file, 'prensa.webp');
});

test('lo publicado trae image solo de la lista cerrada', () => {
  assert.equal(images.imageFor({ name: 'Otro nombre', image: 'prensa.webp' }).file, 'prensa.webp');
  assert.equal(images.imageFor({ name: 'Otro nombre', image: '../../config.js' }), null);
  assert.equal(images.imageFor({ name: 'Otro nombre', image: 'toString' }), null);
});

test('imgHtml: lazy, alt escapado', () => {
  const html = images.imgHtml({ src: './assets/images/ejercicios/prensa.webp', alt: 'Prensa "45°" <b>' });
  assert.match(html, /loading="lazy"/);
  assert.match(html, /alt="Prensa &quot;45°&quot; &lt;b&gt;"/);
});

test('publicar: image solo si hay, por la galería enlazada', () => {
  const library = [{ id: 'lib-1', name: 'Remo sentado en polea', active: true }];
  const assignment = {
    id: 'as-1', clientId: 'c-1', name: 'Programa falso',
    days: [{ id: 'd1', name: 'Día A', exercises: [
      { id: 'e1', exerciseName: 'Remo de Prueba', libraryExerciseId: 'lib-1', sets: 3 },
      { id: 'e2', exerciseName: 'Ejercicio falso sin imagen', sets: 3 }
    ] }]
  };
  const published = publish.buildPublication(assignment, [], library);
  const exercises = published.program.days[0].exercises;
  assert.equal(exercises[0].image, 'remo-polea.webp');
  assert.equal('image' in exercises[1], false);
});
