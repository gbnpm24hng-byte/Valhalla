const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../assets/js/publish-core.js');

const publish = globalThis.VALHALLA.publishCore;

// Datos falsos "envenenados": campos prohibidos en todos los niveles posibles.
const POISON = {
  monthly_value: 45000, amount: 45000, payment_status: 'overdue', renewal_date: '2026-11-01', renewal_day: 1,
  payments: [{ amount: 45000 }], movements: [{ amount: 1 }], accounts: [{ id: 'acc' }],
  phone: '+56 9 1111 2222', email: 'alumna.falsa@example.invalid', injuries: 'Lesión falsa de hombro', observations: 'Observación privada falsa'
};

function poisonedAssignment() {
  return {
    ...POISON,
    id: 'asig-1',
    programId: 'prog-1',
    clientId: 'real-mariela-partner',
    clientName: 'Nombre Privado',
    programName: 'Fuerza base',
    objective: 'Objetivo privado',
    client: { ...POISON, full_name: 'Nombre Privado' },
    days: [{
      ...POISON,
      id: 'd1',
      name: 'Día A',
      order: 1,
      exercises: [{
        ...POISON,
        id: 'e1',
        exerciseName: 'Sentadilla',
        sets: 3,
        repMin: 6,
        repMax: 8,
        targetWeight: 60,
        notes: 'Rodillas hacia afuera',
        secretField: 'no debe publicarse',
        approximations: [{ ...POISON, label: 'A1', weight: 30, reps: 5 }],
        effectiveSets: [{ ...POISON, label: 'S1', weight: 60, reps: 8, rir: 2 }]
      }]
    }]
  };
}

function poisonedSessions() {
  return [{
    ...POISON,
    id: 'ses-1',
    clientId: 'real-mariela-partner',
    date: '2026-10-01',
    title: 'Sesión 1',
    programDayName: 'Día A',
    notes: 'Nota privada de la sesión',
    exercises: [{
      ...POISON,
      exerciseName: 'Sentadilla',
      targetWeight: 60,
      coachNotes: 'Buena profundidad',
      sets: [
        { ...POISON, setNumber: 1, setType: 'A', weight: 30, reps: 5 },
        { ...POISON, setNumber: 2, setType: 'S', weight: 60, reps: 8, rir: 2 },
        { ...POISON, setNumber: 3, setType: 'T', weight: 65, reps: 3 }
      ]
    }]
  }];
}

test('lo publicado no contiene ningún campo prohibido a ningún nivel', () => {
  const { program, progress } = publish.buildPublication(poisonedAssignment(), poisonedSessions());
  assert.deepEqual(publish.findForbiddenKeys(program), []);
  assert.deepEqual(publish.findForbiddenKeys(progress), []);

  // También por valor: ni el teléfono, ni el correo, ni montos, ni textos privados.
  const serialized = JSON.stringify({ program, progress });
  ['+56 9 1111 2222', 'alumna.falsa@example.invalid', 'Lesión falsa', 'Observación privada', '45000', 'overdue', 'Nombre Privado', 'Objetivo privado', 'Nota privada de la sesión', 'no debe publicarse'].forEach((value) => {
    assert.equal(serialized.includes(value), false, `no debe aparecer: ${value}`);
  });
});

test('el detector de claves prohibidas recorre todo el objeto', () => {
  assert.deepEqual(publish.findForbiddenKeys({ a: [{ b: { monthly_value: 1 } }] }), ['$.a[0].b.monthly_value']);
  assert.deepEqual(publish.findForbiddenKeys({ days: [{ exercises: [{ email: 'x' }] }] }), ['$.days[0].exercises[0].email']);
});

test('el programa publicado copia solo días, ejercicios, series, repeticiones, cargas y notas de técnica', () => {
  const program = publish.buildPublishedProgram(poisonedAssignment());
  assert.deepEqual(Object.keys(program).sort(), ['assignmentId', 'days', 'programName', 'schema']);
  assert.deepEqual(Object.keys(program.days[0]).sort(), ['exercises', 'id', 'name', 'order']);
  assert.deepEqual(Object.keys(program.days[0].exercises[0]).sort(), ['approximations', 'effectiveSets', 'id', 'name', 'repMax', 'repMin', 'sets', 'targetWeight', 'techniqueNotes']);
  assert.deepEqual(program.days[0].exercises[0].effectiveSets, [{ label: 'S1', weight: 60, reps: 8, rir: 2 }]);
  assert.equal(program.days[0].exercises[0].techniqueNotes, 'Rodillas hacia afuera');
});

test('las series de tipo T no se publican y se cuentan', () => {
  const { progress, omittedSets } = publish.buildPublication(poisonedAssignment(), poisonedSessions());
  assert.equal(omittedSets, 1);
  assert.deepEqual(progress[0].exercises[0].sets.map((set) => set.type), ['A', 'S']);
  assert.deepEqual(Object.keys(progress[0]).sort(), ['date', 'dayName', 'exercises', 'schema', 'sessionId', 'title']);
});

test('sesiones sin series publicables no generan historial', () => {
  const { progress } = publish.buildPublication(poisonedAssignment(), [{ id: 's2', date: '2026-10-02', exercises: [{ exerciseName: 'X', sets: [] }] }]);
  assert.deepEqual(progress, []);
});

// ---- Video de técnica ----

const VIDEO = 'https://videos.example.com/sentadilla?t=10';
const videoAssignment = (exercise) => ({ id: 'a', days: [{ id: 'd', exercises: [{ id: 'e', sets: 3, ...exercise }] }] });
const publishedExercise = (exercise, library) => publish.buildPublishedProgram(videoAssignment(exercise), library).days[0].exercises[0];

test('enlace de video: acepta https://', () => {
  assert.equal(publish.safeVideoUrl(VIDEO), VIDEO);
  assert.equal(publish.safeVideoUrl('  https://youtu.be/abc123  '), 'https://youtu.be/abc123', 'se limpian los espacios de los extremos');
  assert.equal(publish.safeVideoUrl('HTTPS://youtu.be/abc123'), 'HTTPS://youtu.be/abc123');
});

test('enlace de video: rechaza http, javascript:, vacío, texto suelto y formas engañosas', () => {
  [
    'http://youtu.be/abc', 'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>1</script>', '', '   ',
    'ver video', 'youtu.be/abc', 'https://', 'https:youtu.be/abc', 'https:\\\\youtu.be', 'https://youtu.be/a b',
    'ftp://youtu.be/a', ' javascript:alert(1)//https://youtu.be', 'https://usuario:clave@youtu.be/a', 'https://youtu.be@otro.example.com/a',
    'https://localhost/a', `https://youtu.be/${'a'.repeat(500)}`, null, undefined, 42, {}, ['https://youtu.be/a']
  ].forEach((value) => assert.equal(publish.safeVideoUrl(value), '', `debe rechazar: ${String(value).slice(0, 40)}`));
});

test('publicación: videoUrl viene del ejercicio enlazado por libraryExerciseId, aunque el nombre difiera', () => {
  const library = [
    { id: 'lib-1', name: 'Nombre renovado', videoUrl: VIDEO },
    { id: 'lib-2', name: 'Sentadilla', videoUrl: 'https://videos.example.com/otro' }
  ];
  assert.equal(publishedExercise({ libraryExerciseId: 'lib-1', exerciseName: 'Sentadilla' }, library).videoUrl, VIDEO);
});

test('publicación: sin libraryExerciseId (o con uno que ya no existe) busca por nombre, sin tildes ni mayúsculas', () => {
  const library = [{ id: 'lib-1', name: 'Extensión de Cuádriceps', videoUrl: VIDEO }];
  assert.equal(publishedExercise({ exerciseName: 'extension de cuadriceps' }, library).videoUrl, VIDEO);
  assert.equal(publishedExercise({ libraryExerciseId: 'lib-borrado', exerciseName: 'Extensión de cuádriceps' }, library).videoUrl, VIDEO);
});

test('publicación: un ejercicio enlazado sin video no toma el de otro con el mismo nombre', () => {
  const library = [{ id: 'lib-1', name: 'Sentadilla' }, { id: 'lib-2', name: 'Sentadilla', videoUrl: VIDEO }];
  assert.equal('videoUrl' in publishedExercise({ libraryExerciseId: 'lib-1', exerciseName: 'Sentadilla' }, library), false);
});

test('publicación: sin enlace válido no se manda la clave videoUrl', () => {
  const exercise = { libraryExerciseId: 'lib-1', exerciseName: 'Sentadilla' };
  [
    [{ id: 'lib-1', name: 'Sentadilla' }],
    [{ id: 'lib-1', name: 'Sentadilla', videoUrl: '' }],
    [{ id: 'lib-1', name: 'Sentadilla', videoUrl: 'http://videos.example.com/a' }],
    [{ id: 'lib-1', name: 'Sentadilla', videoUrl: 'javascript:alert(1)' }],
    [{ id: 'lib-1', name: 'Sentadilla', videoUrl: VIDEO, active: false }],
    [{ id: 'otro', name: 'Otro ejercicio', videoUrl: VIDEO }],
    [], undefined
  ].forEach((library) => assert.equal('videoUrl' in publishedExercise(exercise, library), false));
});

test('publicación: un videoUrl escrito en el programa se ignora; solo manda la galería', () => {
  assert.equal('videoUrl' in publishedExercise({ exerciseName: 'Sentadilla', videoUrl: VIDEO }, []), false);
});

test('publicación: sin videos, el programa es idéntico al de antes (no aparece "cambios sin publicar")', () => {
  const library = [{ id: 'lib-1', name: 'Sentadilla' }, { id: 'lib-2', name: 'Otro', videoUrl: VIDEO }];
  assert.deepEqual(publish.buildPublishedProgram(poisonedAssignment(), library), publish.buildPublishedProgram(poisonedAssignment()));
  assert.equal(JSON.stringify(publish.buildPublishedProgram(poisonedAssignment(), library)).includes('videoUrl'), false);
});

test('publicación: el video no agrega ningún otro dato de la galería ni claves prohibidas', () => {
  const library = [{ ...POISON, id: 'lib-1', name: 'Sentadilla', description: 'Descripción privada', jointDemand: { knee: 2 }, videoUrl: VIDEO }];
  const assignment = videoAssignment({ libraryExerciseId: 'lib-1', exerciseName: 'Sentadilla' });
  const { program } = publish.buildPublication(assignment, [], library);
  const withoutLibrary = publish.buildPublishedProgram(assignment);
  const { videoUrl, ...rest } = program.days[0].exercises[0];
  assert.equal(videoUrl, VIDEO);
  assert.deepEqual(rest, withoutLibrary.days[0].exercises[0]);
  assert.deepEqual(publish.findForbiddenKeys(program), []);
  assert.equal(JSON.stringify(program).includes('Descripción privada'), false);
});
