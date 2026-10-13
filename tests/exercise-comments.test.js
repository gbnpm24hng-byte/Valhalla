const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;
require('../assets/js/data.js');
require('../assets/js/sync-core.js');
require('../assets/js/publish-core.js');
require('../assets/js/labels.js');

const data = globalThis.VALHALLA.data;
const sync = globalThis.VALHALLA.syncCore;
const publish = globalThis.VALHALLA.publishCore;

const set = (n, weight, reps, extra = {}) => ({ setNumber: n, setType: 'S', weight, reps, completed: true, createdAt: '2026-10-05T10:00:00.000Z', ...extra });
const session = (comment) => ({
  id: 'ses-1', clientId: 'c1', date: '2026-10-05', title: 'Sesión falsa', programDayName: 'Lunes — Piernas falso',
  exercises: [{ id: 'tx-1', exerciseName: 'Sentadilla falsa', coachNotes: '', sets: [set(1, 70, 8), set(2, 70, 8), set(3, 70, 7, { rir: 2 })], ...(comment === undefined ? {} : { comment }) }]
});

test('normalizar: texto recortado a 300, privado por defecto; vacío o inválido no queda', () => {
  const long = 'x'.repeat(350);
  const load = (comment) => data.importState(JSON.stringify({ trainingsV08: { sessions: [session(comment)] } })).trainingsV08.sessions[0].exercises[0];
  assert.deepEqual(load({ text: '  bajó la técnica en la 3ª  ', visibleToStudent: true, updatedAt: '2026-10-05T10:00:00.000Z' }).comment,
    { text: 'bajó la técnica en la 3ª', visibleToStudent: true, updatedAt: '2026-10-05T10:00:00.000Z' });
  assert.equal(load({ text: long }).comment.text.length, 300);
  assert.equal(load({ text: 'privado' }).comment.visibleToStudent, false);
  assert.equal(load('texto suelto').comment.text, 'texto suelto');
  assert.equal('comment' in load({ text: '   ' }), false, 'vacío = sin comentario');
  assert.equal('comment' in load(42), false, 'inválido no se conserva');
  assert.equal('comment' in load(undefined), false);
  const once = data.importState(JSON.stringify({ trainingsV08: { sessions: [session({ text: 'nota', visibleToStudent: true })] } }));
  assert.equal(sync.canonicalize(sync.buildCloudPayload(data.importState(JSON.stringify(once)))), sync.canonicalize(sync.buildCloudPayload(once)), 'normalizar dos veces da lo mismo');
  assert.equal(sync.buildCloudPayload(once).trainingsV08.sessions[0].exercises[0].comment.text, 'nota', 'se sincroniza con la sesión');
});

test('un comentario no cambia series, pesos ni la sesión', () => {
  const without = data.importState(JSON.stringify({ trainingsV08: { sessions: [session()] } })).trainingsV08.sessions[0];
  const withComment = data.importState(JSON.stringify({ trainingsV08: { sessions: [session({ text: 'nota' })] } })).trainingsV08.sessions[0];
  delete withComment.exercises[0].comment;
  assert.deepEqual(withComment, without);
});

test('publicar: privado no va, visible sí, "Interno:" nunca; sin comentario el registro no cambia', () => {
  const published = (comment) => publish.buildPublishedSession(session(comment)).record.exercises[0];
  assert.equal('comment' in published(undefined), false);
  assert.equal('comment' in published({ text: 'privado', visibleToStudent: false }), false);
  assert.equal('comment' in published({ text: 'sin casilla' }), false);
  assert.equal(published({ text: 'Buen trabajo, mantén la espalda recta', visibleToStudent: true }).comment, 'Buen trabajo, mantén la espalda recta');
  assert.equal('comment' in published({ text: 'Interno: le duele la rodilla', visibleToStudent: true }), false);
  assert.equal('comment' in published({ text: '  interno : revisar', visibleToStudent: true }), false);
  assert.equal(published({ text: 'Lo interno: ok', visibleToStudent: true }).comment, 'Lo interno: ok', 'solo si la frase EMPIEZA con "Interno:"');
  // Frase por frase, igual que las notas de técnica: se quita solo la frase interna.
  assert.equal(published({ text: 'Buen trabajo, mantén la espalda recta. Interno: le duele la rodilla. Sube 2,5 kg la próxima.', visibleToStudent: true }).comment,
    'Buen trabajo, mantén la espalda recta. Sube 2,5 kg la próxima.');
  assert.equal(publish.publishableComment({ text: 'Interno: todo. Interno: nada más.', visibleToStudent: true }), '');
  // Sin comentario, lo publicado es idéntico a antes (no aparece "cambios sin publicar").
  assert.equal(sync.fingerprint(publish.buildPublishedSession(session()).record), sync.fingerprint(publish.buildPublishedSession(session({ text: 'privado' })).record));
  assert.deepEqual(publish.findForbiddenKeys(publish.buildPublication({ id: 'a', days: [] }, [session({ text: 'hola', visibleToStudent: true })])), []);
});

// ---- "Última vez" con el comentario (funciones reales de app.js) ----
const appSource = fs.readFileSync(path.join(__dirname, '../assets/js/app.js'), 'utf8');
function extractFunction(name) {
  const start = appSource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `No se encontró function ${name} en app.js`);
  const bodyStart = appSource.indexOf('{', appSource.indexOf(')', start));
  let depth = 0;
  for (let index = bodyStart; index < appSource.length; index += 1) {
    if (appSource[index] === '{') depth += 1;
    if (appSource[index] === '}') depth -= 1;
    if (depth === 0) return appSource.slice(start, index + 1);
  }
  throw new Error(`Llaves sin cerrar en ${name}`);
}

test('"Última vez" muestra el comentario; sin comentario queda igual que antes', () => {
  const factory = new Function('labelsApi', `
    ${['getExerciseSets', 'getSetType', 'formatGroupShortDate', 'getGroupEffectiveSets', 'formatGroupSetsSummary', 'formatLastGroupPerformance'].map(extractFunction).join('\n')}
    return formatLastGroupPerformance;`);
  const format = factory(globalThis.VALHALLA.labels);
  const found = (comment) => ({ session: { date: '2026-10-05' }, exercise: session(comment).exercises[0] });
  assert.equal(format(found()), 'Última vez (lun 5 oct): 70 kg × 8, 8, 7 · RIR 2');
  assert.equal(format(found({ text: 'bajó la técnica en la 3ª' })), 'Última vez (lun 5 oct): 70 kg × 8, 8, 7 · RIR 2 · 💬 bajó la técnica en la 3ª');
});
