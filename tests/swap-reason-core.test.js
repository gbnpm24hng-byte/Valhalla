const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../assets/js/data.js');
require('../assets/js/sync-core.js');
require('../assets/js/publish-core.js');
require('../assets/js/client-overrides-core.js');
require('../assets/js/swap-reason-core.js');
require('../assets/js/muscle-map-core.js');

const data = globalThis.VALHALLA.data;
const sync = globalThis.VALHALLA.syncCore;
const publish = globalThis.VALHALLA.publishCore;
const overrides = globalThis.VALHALLA.clientOverrides;
const core = globalThis.VALHALLA.swapReason;
const map = globalThis.VALHALLA.muscleMap;

let counter = 0;
const createId = (prefix) => `${prefix}-${++counter}`;
const clone = (value) => JSON.parse(JSON.stringify(value));

const exercise = (id, name) => ({ id, libraryExerciseId: `lib-${id}`, exerciseName: name, sets: 3, repMin: 8, repMax: 10, targetWeight: 60, restSeconds: 90 });
const assignment = () => ({
  id: 'asig-a', programId: 'prog-comun', clientId: 'alumno-a', programName: 'Programa falso',
  days: [{ id: 'dia-1', name: 'Día A', exercises: [exercise('ej-sentadilla', 'Sentadilla falsa'), exercise('ej-press', 'Press falso')] }]
});
const values = { sets: 3, repMin: 10, repMax: 12, targetWeight: 40 };

function makeOverride({ reason, scope = 'today', date = '2026-11-02', target = 'ej-sentadilla', clientId = 'alumno-a' } = {}) {
  const asg = assignment();
  asg.clientId = clientId;
  const day = asg.days[0];
  return overrides.createOverride({
    createId, now: `${date}T10:00:00.000Z`, client: { id: clientId }, assignment: asg, day, kind: 'replace', scope, date,
    libraryExercise: { id: 'lib-prensa', name: 'Prensa falsa', category: 'PIERNAS' }, values,
    replaced: day.exercises.find((item) => item.id === target), reason
  });
}

test('normalizar: solo campos conocidos; lado solo con zona que lo lleva; nota corta', () => {
  assert.equal(core.normalizeReason(null), null);
  assert.equal(core.normalizeReason({ kind: 'nada' }), null);
  assert.deepEqual(core.normalizeReason({ kind: 'pain', zones: ['rodilla', 'inventada', 'rodilla'], side: 'right', extra: 1 }), { kind: 'pain', zones: ['rodilla'], side: 'right' });
  assert.deepEqual(core.normalizeReason({ kind: 'pain', zones: ['lumbar'], side: 'left' }), { kind: 'pain', zones: ['lumbar'] }, 'lumbar no lleva lado');
  assert.deepEqual(core.normalizeReason({ kind: 'pain', zones: [] }), { kind: 'pain', zones: [] });
  assert.deepEqual(core.normalizeReason({ kind: 'busy', note: 'no va' }), { kind: 'busy' }, 'máquina ocupada no lleva nota');
  assert.equal(core.normalizeReason({ kind: 'other', note: 'x'.repeat(200) }).note.length, core.NOTE_MAX);
  assert.deepEqual(core.normalizeReason({ kind: 'pain', zones: ['tobillo', 'cuello'] }).zones, ['cuello', 'tobillo'], 'orden de los chips');
});

test('textos: etiqueta, historial, Hoy y lado', () => {
  const knee = { kind: 'pain', zones: ['rodilla'], side: 'right' };
  assert.equal(core.tagText(knee), 'Molestia: rodilla der.');
  assert.equal(core.historyText(knee), 'Cambiado por molestia en rodilla der.');
  assert.equal(core.tagText({ kind: 'pain', zones: ['hombro'], side: 'both' }), 'Molestia: ambos hombros');
  assert.equal(core.tagText({ kind: 'pain', zones: ['rodilla', 'lumbar'], side: 'left' }), 'Molestia: lumbar y rodilla izq.');
  assert.equal(core.tagText({ kind: 'pain', zones: [] }), 'Molestia');
  assert.equal(core.historyText({ kind: 'pain', zones: [] }), 'Cambiado por molestia');
  assert.equal(core.historyText({ kind: 'pain', zones: ['codo'], note: 'al extender' }), 'Cambiado por molestia en codo (al extender)');
  assert.equal(core.tagText({ kind: 'busy' }), 'Máquina ocupada');
  assert.equal(core.historyText({ kind: 'busy' }), 'Cambiado por máquina ocupada');
  assert.equal(core.tagText({ kind: 'other' }), 'Otro motivo');
  assert.equal(core.tagText({ kind: 'other', note: 'llegó tarde' }), 'Otro: llegó tarde');
  assert.equal(core.tagText(undefined), '');
  // 2026-11-04 es miércoles.
  assert.equal(core.todayText('Beto', { kind: 'pain', zones: ['hombro'], side: 'left' }, '2026-11-04', '2026-11-06'), 'Beto: molestia en hombro izq. el miércoles');
  assert.equal(core.todayText('Alfa', { kind: 'pain', zones: ['lumbar'] }, '2026-11-05', '2026-11-06'), 'Alfa: molestia en lumbar ayer');
  assert.equal(core.whenText('2026-10-20', '2026-11-06'), 'el 20 oct');
});

test('crear el cambio: con motivo lo guarda; sin motivo el registro es el de siempre', () => {
  const withReason = makeOverride({ reason: core.normalizeReason({ kind: 'pain', zones: ['rodilla'], side: 'right' }) });
  assert.deepEqual(withReason.reason, { kind: 'pain', zones: ['rodilla'], side: 'right' });
  const without = makeOverride({ reason: null });
  assert.equal('reason' in without, false);
  const added = overrides.createOverride({
    createId, now: '2026-11-02T10:00:00.000Z', client: { id: 'alumno-a' }, assignment: assignment(), day: assignment().days[0], kind: 'add', scope: 'today', date: '2026-11-02',
    libraryExercise: { id: 'lib-x', name: 'X falso' }, values, replaced: null, reason: { kind: 'busy' }
  });
  assert.equal('reason' in added, false, 'agregar un ejercicio no lleva motivo');
  // Se aplica igual con o sin motivo.
  const day = assignment().days[0];
  const ctx = { clientId: 'alumno-a', programId: 'prog-comun', assignmentId: 'asig-a', date: '2026-11-02' };
  assert.deepEqual(overrides.applyToDay(day, [withReason], ctx).exercises.map((item) => item.exerciseName), ['Prensa falsa', 'Press falso']);
  assert.equal('reason' in overrides.applyToDay(day, [withReason], ctx).exercises[0], false, 'el motivo no pasa al ejercicio');
});

test('guardar, recargar y subir a la nube: el motivo se conserva (va en coach_state con trainingsV08)', () => {
  const override = makeOverride({ reason: { kind: 'pain', zones: ['hombro'], side: 'left', note: 'nota falsa' } });
  const state = data.importState(JSON.stringify({ clients: [{ id: 'alumno-a', full_name: 'Alumno Falso' }], trainingsV08: { assignments: [assignment()], clientOverrides: [override] } }));
  assert.deepEqual(state.trainingsV08.clientOverrides[0].reason, override.reason);
  const again = data.importState(JSON.stringify(state));
  assert.deepEqual(again.trainingsV08.clientOverrides, state.trainingsV08.clientOverrides, 'normalizar dos veces no cambia nada');
  const payload = sync.buildCloudPayload(state);
  assert.deepEqual(payload.trainingsV08.clientOverrides[0].reason, override.reason);
  // Un motivo de una versión futura (otro kind) se conserva tal cual (keepUnknown) y aquí no se muestra.
  const future = clone(override);
  future.reason = { kind: 'futuro', extra: 1 };
  const kept = data.importState(JSON.stringify({ trainingsV08: { assignments: [assignment()], clientOverrides: [future] } }));
  assert.deepEqual(kept.trainingsV08.clientOverrides[0].reason, { kind: 'futuro', extra: 1 });
  assert.equal(core.tagText(kept.trainingsV08.clientOverrides[0].reason), '');
});

test('publicar: el alumno nunca recibe el motivo', () => {
  const override = makeOverride({ scope: 'forward', reason: { kind: 'pain', zones: ['rodilla'], side: 'right', note: 'nota privada falsa' } });
  const publication = publish.buildPublication(overrides.applyToAssignment(assignment(), [override]), []);
  assert.deepEqual(publication.program.days[0].exercises.map((item) => item.name), ['Prensa falsa', 'Press falso']);
  const text = JSON.stringify(publication);
  ['reason', 'rodilla', 'pain', 'nota privada', 'Molestia'].forEach((word) => assert.ok(!text.includes(word), `no publica "${word}"`));
});

test('molestias recientes (4 semanas) y aviso de la próxima clase', () => {
  const pain = (date, zones, side, clientId = 'alumno-a') => makeOverride({ date, clientId, reason: { kind: 'pain', zones, side } });
  const list = [
    pain('2026-10-01', ['lumbar']),
    pain('2026-10-25', ['rodilla'], 'right'),
    pain('2026-11-04', ['hombro'], 'left'),
    makeOverride({ date: '2026-11-05', reason: { kind: 'busy' } }),
    makeOverride({ date: '2026-11-05' }),
    pain('2026-11-04', ['cuello'], '', 'alumno-b')
  ];
  const recent = core.recentPain(list, 'alumno-a', '2026-11-06', 28);
  assert.deepEqual(recent.map((item) => item.date), ['2026-11-04', '2026-10-25'], 'más reciente primero; sin la de hace más de 4 semanas ni otros motivos ni otros alumnos');
  // Próxima clase: no entrenó entre el 4 y hoy -> aviso. Si entrenó el 5 -> ya pasó su próxima clase.
  assert.equal(core.nextClassNotice(list, 'alumno-a', '2026-11-06', ['2026-11-04']).date, '2026-11-04');
  assert.equal(core.nextClassNotice(list, 'alumno-a', '2026-11-06', ['2026-11-04', '2026-11-05']), null);
  assert.equal(core.nextClassNotice(list, 'alumno-a', '2026-11-04', []).date, '2026-10-25', 'el mismo día no avisa de esa molestia; la anterior sí');
  assert.equal(core.nextClassNotice(list, 'alumno-a', '2026-11-30', []), null, 'más de 14 días: ya no avisa');
  assert.equal(core.nextClassNotice([], 'alumno-a', '2026-11-06', []), null);
});

test('al final según la molestia: lista única y sinónimos', () => {
  const knee = { kind: 'pain', zones: ['rodilla'], side: 'right' };
  const back = { kind: 'pain', zones: ['lumbar'] };
  const shoulder = { kind: 'pain', zones: ['hombro'], side: 'left' };
  assert.equal(core.cautionZone('Estocadas', knee), 'rodilla');
  assert.equal(core.cautionZone('Sentadilla búlgara', knee), 'rodilla');
  assert.equal(core.cautionZone('Saltos al cajón', knee), 'rodilla');
  assert.equal(core.cautionZone('Prensa', knee), '');
  assert.equal(core.cautionZone('Peso muerto rumano', back), 'lumbar');
  assert.equal(core.cautionZone('Sentadilla trasera', back), 'lumbar');
  assert.equal(core.cautionZone('Buenos días', back), 'lumbar');
  assert.equal(core.cautionZone('Remo con barra', back), 'lumbar');
  assert.equal(core.cautionZone('Press militar', shoulder), 'hombro');
  assert.equal(core.cautionZone('Press tras nuca', shoulder), 'hombro');
  assert.equal(core.cautionZone('Estocadas', back), '', 'solo según la zona de la molestia');
  assert.equal(core.cautionZone('Estocadas', { kind: 'busy' }), '', 'sin molestia no hay "al final"');
  assert.equal(core.cautionZone('Estocadas', null), '');
  assert.deepEqual(Object.keys(core.CAUTION_BY_ZONE).sort(), ['hombro', 'lumbar', 'rodilla']);
});

test('sugeridos: misma zona arriba, los "al final" después y nunca ocultos', () => {
  const lib = [
    { id: 'l-prensa', name: 'Prensa', primaryMuscle: 'quadriceps', secondaryMuscles: ['glutes'] },
    { id: 'l-ext', name: 'Extensión de cuádriceps', primaryMuscle: 'quadriceps' },
    { id: 'l-estocada', name: 'Estocadas', primaryMuscle: 'quadriceps', secondaryMuscles: ['glutes'] },
    { id: 'l-bulgara', name: 'Sentadilla búlgara', primaryMuscle: 'quadriceps', secondaryMuscles: ['glutes'] },
    { id: 'l-sentadilla', name: 'Sentadilla libre', primaryMuscle: 'quadriceps', secondaryMuscles: ['glutes'] },
    { id: 'l-curl', name: 'Curl bíceps', primaryMuscle: 'biceps' },
    { id: 'l-sin', name: 'Sin músculo' }
  ];
  const candidates = lib.map((item) => ({ id: item.id, name: item.name, zones: map.zonesFor(item.primaryMuscle, item.secondaryMuscles, item.name) }));
  const original = map.zonesFor('quadriceps', ['glutes'], 'Sentadilla libre');
  const plain = core.suggest({ candidates, original, reason: null, excludeIds: ['l-sentadilla'] });
  assert.deepEqual(plain.map((item) => item.id), ['l-estocada', 'l-prensa', 'l-bulgara', 'l-ext'], 'misma zona; más coincidencias primero; sin el original ni otras zonas');
  assert.ok(plain.every((item) => item.caution === ''));
  const knee = core.suggest({ candidates, original, reason: { kind: 'pain', zones: ['rodilla'], side: 'right' }, excludeIds: ['l-sentadilla'] });
  assert.deepEqual(knee.map((item) => item.id), ['l-prensa', 'l-ext', 'l-estocada', 'l-bulgara'], 'estocadas y búlgara al final');
  assert.deepEqual(knee.map((item) => item.caution), ['', '', 'rodilla', 'rodilla']);
  // El límite recorta solo los buenos: los "al final" siempre se muestran.
  const limited = core.suggest({ candidates, original, reason: { kind: 'pain', zones: ['rodilla'] }, excludeIds: ['l-sentadilla'], limit: 1 });
  assert.deepEqual(limited.map((item) => item.id), ['l-prensa', 'l-estocada', 'l-bulgara']);
  assert.deepEqual(core.suggest({ candidates, original: { main: [], sec: [] } }), [], 'original sin zona: sin sugerencias');
});
